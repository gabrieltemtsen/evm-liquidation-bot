import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { AaveProtocol, LiquidatablePosition } from './protocols/aave.js';
import { config } from './utils/config.js';
import logger from './utils/logger.js';
import { isNearLiquidation, formatHealthFactor, healthFactorToRisk } from './calculator.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MonitorStats {
  isRunning: boolean;
  totalAddressesTracked: number;
  liquidatableCount: number;
  nearLiquidationCount: number;
  lastScanTime: Date | null;
  scanCount: number;
  errorsCount: number;
  blockNumber: number;
}

export interface MonitorEvents {
  liquidatable_position: (position: LiquidatablePosition) => void;
  near_liquidation: (position: LiquidatablePosition) => void;
  scan_complete: (stats: MonitorStats, positions: LiquidatablePosition[]) => void;
  error: (error: Error) => void;
  block: (blockNumber: number) => void;
}

// ─── PositionMonitor ──────────────────────────────────────────────────────────

export class PositionMonitor extends EventEmitter {
  private provider: ethers.WebSocketProvider;
  private aave: AaveProtocol;
  private scanInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private trackedAddresses: Set<string> = new Set();
  private stats: MonitorStats = {
    isRunning: false,
    totalAddressesTracked: 0,
    liquidatableCount: 0,
    nearLiquidationCount: 0,
    lastScanTime: null,
    scanCount: 0,
    errorsCount: 0,
    blockNumber: 0,
  };
  private currentBlock = 0;
  private borrowerDiscoveryFromBlock = 0;
  private lastPositions: Map<string, LiquidatablePosition> = new Map();

  constructor() {
    super();
    this.setMaxListeners(50);

    logger.info('Initializing Position Monitor...', { chain: config.chain.name });

    this.provider = new ethers.WebSocketProvider(config.chain.rpcWs);
    this.aave = new AaveProtocol(this.provider);

    this.setupProviderListeners();
  }

  private setupProviderListeners(): void {
    this.provider.on('block', (blockNumber: number) => {
      this.currentBlock = blockNumber;
      this.stats.blockNumber = blockNumber;
      this.emit('block', blockNumber);
    });

    this.provider.on('error', (error: Error) => {
      logger.error('WebSocket provider error', { error: error.message });
      this.stats.errorsCount++;
      this.emit('error', error);
      this.reconnectProvider();
    });
  }

  private async reconnectProvider(): Promise<void> {
    logger.warn('Reconnecting WebSocket provider...');
    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Remove all listeners from the old provider before replacing it,
      // otherwise 'block' and 'error' events fire multiple times per block
      // after each reconnect cycle.
      try {
        this.provider.removeAllListeners();
        await this.provider.destroy();
      } catch {
        // Best-effort cleanup — ignore if already dead
      }

      this.provider = new ethers.WebSocketProvider(config.chain.rpcWs);
      this.aave = new AaveProtocol(this.provider);
      await this.aave.initialize();
      this.setupProviderListeners();
      logger.info('WebSocket provider reconnected');
    } catch (error) {
      logger.error('Failed to reconnect provider', { error });
      setTimeout(() => this.reconnectProvider(), 15000);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Monitor already running');
      return;
    }

    logger.info('Starting Position Monitor...', {
      chain: config.chain.name,
      interval: `${config.monitorIntervalMs / 1000}s`,
    });

    await this.aave.initialize();

    // Get initial block
    this.currentBlock = await this.provider.getBlockNumber();
    this.borrowerDiscoveryFromBlock = Math.max(0, this.currentBlock - 10000); // look back ~1.4 days

    this.isRunning = true;
    this.stats.isRunning = true;

    // Initial scan immediately
    await this.runScan();

    // Schedule periodic scans
    this.scanInterval = setInterval(async () => {
      try {
        await this.runScan();
      } catch (error) {
        logger.error('Scan interval error', { error });
        this.stats.errorsCount++;
      }
    }, config.monitorIntervalMs);

    logger.info('Position Monitor started ✓');
  }

  async stop(): Promise<void> {
    logger.info('Stopping Position Monitor...');
    this.isRunning = false;
    this.stats.isRunning = false;

    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    try {
      await this.provider.destroy();
    } catch {
      // ignore
    }

    logger.info('Position Monitor stopped');
  }

  private async runScan(): Promise<void> {
    const startTime = Date.now();
    logger.info('Starting position scan...', {
      block: this.currentBlock,
      trackedAddresses: this.trackedAddresses.size,
    });

    try {
      // Discover new borrowers from recent events
      await this.discoverNewBorrowers();

      if (this.trackedAddresses.size === 0) {
        logger.warn('No tracked addresses yet, skipping scan');
        return;
      }

      // Scan all tracked addresses in batches
      const positions = await this.scanPositions();

      // Update stats
      this.stats.lastScanTime = new Date();
      this.stats.scanCount++;
      this.stats.totalAddressesTracked = this.trackedAddresses.size;
      this.stats.liquidatableCount = positions.filter(
        (p) => p.healthFactor < 10n ** 18n
      ).length;
      this.stats.nearLiquidationCount = positions.filter((p) =>
        isNearLiquidation(p.healthFactor)
      ).length;

      const duration = Date.now() - startTime;
      logger.info('Scan complete', {
        duration: `${duration}ms`,
        tracked: this.trackedAddresses.size,
        liquidatable: this.stats.liquidatableCount,
        nearLiquidation: this.stats.nearLiquidationCount,
        scanCount: this.stats.scanCount,
      });

      this.emit('scan_complete', { ...this.stats }, positions);
    } catch (error) {
      this.stats.errorsCount++;
      logger.error('Scan failed', { error });
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async discoverNewBorrowers(): Promise<void> {
    try {
      const toBlock = this.currentBlock;
      const fromBlock = this.borrowerDiscoveryFromBlock;

      // Don't scan more than 10000 blocks at once
      const scanTo = Math.min(toBlock, fromBlock + 9999);

      const newBorrowers = await this.aave.getActiveBorrowers(fromBlock, scanTo);

      let added = 0;
      for (const addr of newBorrowers) {
        if (!this.trackedAddresses.has(addr)) {
          this.trackedAddresses.add(addr);
          added++;
        }
      }

      if (added > 0) {
        logger.info(`Discovered ${added} new borrowers (total: ${this.trackedAddresses.size})`, {
          fromBlock,
          toBlock: scanTo,
        });
      }

      // Advance the discovery window
      this.borrowerDiscoveryFromBlock = scanTo + 1;
    } catch (error) {
      logger.warn('Failed to discover new borrowers', { error });
    }
  }

  private async scanPositions(): Promise<LiquidatablePosition[]> {
    const addresses = Array.from(this.trackedAddresses);
    const BATCH_SIZE = 50;
    const atRiskPositions: LiquidatablePosition[] = [];

    for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
      const batch = addresses.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map((addr) => this.aave.getUserPosition(addr))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const addr = batch[j];

        if (result.status === 'fulfilled' && result.value) {
          const position = result.value;

          if (position.totalDebtBase === 0n) {
            // No longer has debt, remove from tracking
            this.trackedAddresses.delete(addr);
            this.lastPositions.delete(addr);
            continue;
          }

          this.lastPositions.set(addr, position);

          const risk = healthFactorToRisk(position.healthFactor);

          if (risk === 'liquidatable') {
            logger.warn('🚨 LIQUIDATABLE POSITION', {
              borrower: addr,
              healthFactor: formatHealthFactor(position.healthFactor),
              totalDebtBase: position.totalDebtBase.toString(),
              bestPair: position.bestPair
                ? `${position.bestPair.debtSymbol} debt / ${position.bestPair.collateralSymbol} collateral`
                : 'none',
            });
            atRiskPositions.push(position);
            this.emit('liquidatable_position', position);
          } else if (risk === 'critical') {
            logger.info('⚠️  Near-liquidation position', {
              borrower: addr,
              healthFactor: formatHealthFactor(position.healthFactor),
            });
            atRiskPositions.push(position);
            this.emit('near_liquidation', position);
          }
        } else if (result.status === 'rejected') {
          logger.debug(`Failed to check position for ${addr}`, {
            error: result.reason?.message,
          });
        }
      }

      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < addresses.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return atRiskPositions;
  }

  addAddress(address: string): void {
    this.trackedAddresses.add(ethers.getAddress(address));
  }

  removeAddress(address: string): void {
    this.trackedAddresses.delete(ethers.getAddress(address));
  }

  getStats(): MonitorStats {
    return { ...this.stats };
  }

  getPositions(): LiquidatablePosition[] {
    return Array.from(this.lastPositions.values()).filter((p) =>
      isNearLiquidation(p.healthFactor)
    );
  }

  getProvider(): ethers.WebSocketProvider {
    return this.provider;
  }
}

export default PositionMonitor;
