/**
 * ⚡ EVM Liquidation Bot — Main Entry Point
 *
 * Orchestrates:
 *   - PositionMonitor  → discovers & tracks at-risk positions
 *   - Liquidator       → executes profitable liquidations
 *   - DashboardServer  → real-time web UI
 */

import { config } from './utils/config.js';
import logger from './utils/logger.js';
import { PositionMonitor } from './monitor.js';
import { Liquidator } from './liquidator.js';
import { DashboardServer } from './dashboard/server.js';
import { LiquidatablePosition } from './protocols/aave.js';

// ─── Graceful shutdown ────────────────────────────────────────────────────────

let isShuttingDown = false;

const shutdown = async (signal: string, components: {
  monitor?: PositionMonitor;
  dashboard?: DashboardServer;
}) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}, shutting down gracefully...`);
  components.dashboard?.setBotStatus('stopped');

  try {
    await components.monitor?.stop();
    await components.dashboard?.stop();
  } catch (error) {
    logger.error('Error during shutdown', { error });
  }

  logger.info('Shutdown complete');
  process.exit(0);
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info('═'.repeat(60));
  logger.info('⚡ EVM Liquidation Bot starting up');
  logger.info('═'.repeat(60));
  logger.info('Configuration', {
    chain: config.chain.name,
    dryRun: config.dryRun,
    minProfitEth: config.minProfitEth.toString(),
    maxGasGwei: config.maxGasGwei.toString(),
    monitorInterval: `${config.monitorIntervalMs / 1000}s`,
    dashboardPort: config.dashboardPort,
    flashbots: config.chain.useFlashbots,
    contractAddress: config.flashLiquidatorAddress || '(not set — deploy first)',
  });

  if (config.dryRun) {
    logger.warn('⚠️  DRY RUN MODE ACTIVE — no real transactions will be submitted');
  }

  // ── Initialize dashboard ───────────────────────────────────────────────────
  const dashboard = new DashboardServer();
  await dashboard.start();
  dashboard.setBotStatus('running');

  // ── Initialize monitor ─────────────────────────────────────────────────────
  const monitor = new PositionMonitor();

  // ── Initialize liquidator ──────────────────────────────────────────────────
  const liquidator = new Liquidator(monitor.getProvider());
  await liquidator.initialize();

  // ── Wire up events ─────────────────────────────────────────────────────────

  // Monitor → Liquidator: handle liquidatable positions
  monitor.on('liquidatable_position', async (position: LiquidatablePosition) => {
    try {
      await liquidator.handleLiquidatablePosition(position);
    } catch (error) {
      logger.error('Unhandled error in liquidation handler', { error });
    }
  });

  // Monitor → Dashboard: update positions
  monitor.on('scan_complete', (stats, positions) => {
    dashboard.updateMonitorStats(stats, positions);
    dashboard.updateLiquidatorStats(liquidator.getStats());
  });

  monitor.on('near_liquidation', (position: LiquidatablePosition) => {
    logger.info('Near-liquidation position alert', {
      borrower: position.borrower,
      hf: (Number(position.healthFactor) / 1e18).toFixed(4),
    });
  });

  monitor.on('block', (blockNumber: number) => {
    if (blockNumber % 10 === 0) {
      // Every 10 blocks, push a stats update
      dashboard.updateLiquidatorStats(liquidator.getStats());
    }
  });

  monitor.on('error', (error: Error) => {
    logger.error('Monitor error', { error: error.message });
    dashboard.setBotStatus('error');
    // Recover after a delay
    setTimeout(() => dashboard.setBotStatus('running'), 5000);
  });

  // Liquidator → Dashboard: liquidation events
  liquidator.on('liquidation_executed', (result) => {
    dashboard.onLiquidationExecuted(result);
    dashboard.updateLiquidatorStats(liquidator.getStats());
  });

  // ── Register graceful shutdown ─────────────────────────────────────────────
  const components = { monitor, dashboard };
  process.on('SIGINT', () => shutdown('SIGINT', components));
  process.on('SIGTERM', () => shutdown('SIGTERM', components));
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    shutdown('uncaughtException', components);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
  });

  // ── Start monitoring ────────────────────────────────────────────────────────
  await monitor.start();

  logger.info('═'.repeat(60));
  logger.info(`✅ Bot running — Dashboard: http://localhost:${config.dashboardPort}`);
  logger.info('═'.repeat(60));
}

main().catch((error) => {
  logger.error('Fatal startup error', { error: error.message, stack: error.stack });
  process.exit(1);
});
