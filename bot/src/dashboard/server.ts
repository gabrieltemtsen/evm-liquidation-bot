import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../utils/config.js';
import logger from '../utils/logger.js';
import { LiquidatorStats, LiquidationResult } from '../liquidator.js';
import { MonitorStats } from '../monitor.js';
import { LiquidatablePosition } from '../protocols/aave.js';
import { ethers } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DashboardState {
  liquidatorStats: LiquidatorStats;
  monitorStats: MonitorStats;
  positions: LiquidatablePosition[];
  recentLiquidations: LiquidationResult[];
  profitHistory: Array<{ time: number; profit: number }>;
  botStatus: 'running' | 'stopped' | 'error';
  startTime: Date;
  chain: string;
}

// ─── DashboardServer ──────────────────────────────────────────────────────────

export class DashboardServer {
  private app: express.Application;
  private httpServer: ReturnType<typeof createServer>;
  private io: SocketIOServer;
  private state: DashboardState;
  private profitHistory: Array<{ time: number; profit: number }> = [];

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.state = {
      liquidatorStats: {
        totalAttempts: 0,
        totalSuccess: 0,
        totalProfit: 0n,
        profitToday: 0n,
        liquidationsToday: 0,
        successRate: 0,
        lastActivity: null,
      },
      monitorStats: {
        isRunning: false,
        totalAddressesTracked: 0,
        liquidatableCount: 0,
        nearLiquidationCount: 0,
        lastScanTime: null,
        scanCount: 0,
        errorsCount: 0,
        blockNumber: 0,
      },
      positions: [],
      recentLiquidations: [],
      profitHistory: [],
      botStatus: 'stopped',
      startTime: new Date(),
      chain: config.chain.name,
    };

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketIO();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(
      express.static(path.join(__dirname, 'public'))
    );

    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });
  }

  private setupRoutes(): void {
    // Serve dashboard
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // Stats endpoint
    this.app.get('/api/stats', (req, res) => {
      res.json(this.serializeState());
    });

    // Liquidations endpoint
    this.app.get('/api/liquidations', (req, res) => {
      const limit = parseInt(req.query.limit as string || '50', 10);
      res.json(
        this.state.recentLiquidations.slice(0, limit).map(this.serializeLiquidation)
      );
    });

    // Positions endpoint
    this.app.get('/api/positions', (req, res) => {
      res.json(
        this.state.positions.map(this.serializePosition)
      );
    });

    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: this.state.botStatus,
        uptime: Math.floor((Date.now() - this.state.startTime.getTime()) / 1000),
        chain: this.state.chain,
        dryRun: config.dryRun,
        blockNumber: this.state.monitorStats.blockNumber,
      });
    });
  }

  private setupSocketIO(): void {
    this.io.on('connection', (socket) => {
      logger.debug('Dashboard client connected', { id: socket.id });

      // Send initial state
      socket.emit('initial_state', this.serializeState());

      socket.on('disconnect', () => {
        logger.debug('Dashboard client disconnected', { id: socket.id });
      });

      // Allow clients to request fresh data
      socket.on('request_state', () => {
        socket.emit('initial_state', this.serializeState());
      });
    });
  }

  // ─── Public update methods ────────────────────────────────────────────────

  updateLiquidatorStats(stats: LiquidatorStats): void {
    this.state.liquidatorStats = stats;
    this.io.emit('stats_update', {
      liquidatorStats: this.serializeLiquidatorStats(stats),
    });
  }

  updateMonitorStats(stats: MonitorStats, positions: LiquidatablePosition[]): void {
    this.state.monitorStats = stats;
    this.state.positions = positions;
    this.io.emit('position_update', {
      monitorStats: stats,
      positions: positions.map(this.serializePosition),
    });
  }

  onLiquidationExecuted(result: LiquidationResult): void {
    this.state.recentLiquidations.unshift(result);
    if (this.state.recentLiquidations.length > 100) {
      this.state.recentLiquidations = this.state.recentLiquidations.slice(0, 100);
    }

    // Update profit history
    const profitEth = parseFloat(ethers.formatEther(result.profit));
    this.profitHistory.push({ time: Date.now(), profit: profitEth });
    if (this.profitHistory.length > 100) {
      this.profitHistory = this.profitHistory.slice(-100);
    }
    this.state.profitHistory = this.profitHistory;

    this.io.emit('liquidation_executed', this.serializeLiquidation(result));
    this.io.emit('profit_update', {
      totalProfit: ethers.formatEther(this.state.liquidatorStats.totalProfit),
      profitHistory: this.profitHistory,
    });
  }

  setBotStatus(status: DashboardState['botStatus']): void {
    this.state.botStatus = status;
    this.io.emit('status_update', { status });
  }

  // ─── Serializers (BigInt-safe) ────────────────────────────────────────────

  private serializeState() {
    return {
      liquidatorStats: this.serializeLiquidatorStats(this.state.liquidatorStats),
      monitorStats: this.state.monitorStats,
      positions: this.state.positions.map(this.serializePosition),
      recentLiquidations: this.state.recentLiquidations
        .slice(0, 20)
        .map(this.serializeLiquidation),
      profitHistory: this.state.profitHistory,
      botStatus: this.state.botStatus,
      startTime: this.state.startTime.toISOString(),
      chain: this.state.chain,
      dryRun: config.dryRun,
    };
  }

  private serializeLiquidatorStats(stats: LiquidatorStats) {
    return {
      totalAttempts: stats.totalAttempts,
      totalSuccess: stats.totalSuccess,
      totalProfit: ethers.formatEther(stats.totalProfit),
      profitToday: ethers.formatEther(stats.profitToday),
      liquidationsToday: stats.liquidationsToday,
      successRate: stats.successRate,
      lastActivity: stats.lastActivity?.toISOString() || null,
    };
  }

  private serializeLiquidation(result: LiquidationResult) {
    return {
      success: result.success,
      borrower: result.borrower,
      collateralAsset: result.collateralAsset,
      debtAsset: result.debtAsset,
      debtCovered: ethers.formatEther(result.debtCovered),
      profit: ethers.formatEther(result.profit),
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      error: result.error,
      dryRun: result.dryRun,
      timestamp: result.timestamp.toISOString(),
    };
  }

  private serializePosition(pos: LiquidatablePosition) {
    return {
      borrower: pos.borrower,
      healthFactor: (Number(pos.healthFactor) / 1e18).toFixed(4),
      totalCollateralBase: pos.totalCollateralBase.toString(),
      totalDebtBase: pos.totalDebtBase.toString(),
      bestPair: pos.bestPair
        ? {
            collateralAsset: pos.bestPair.collateralAsset,
            debtAsset: pos.bestPair.debtAsset,
            collateralSymbol: pos.bestPair.collateralSymbol,
            debtSymbol: pos.bestPair.debtSymbol,
            debtToCover: pos.bestPair.debtToCover.toString(),
          }
        : null,
    };
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(config.dashboardPort, () => {
        logger.info(`📊 Dashboard running at http://localhost:${config.dashboardPort}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.io.close();
      this.httpServer.close(() => resolve());
    });
  }
}

export default DashboardServer;
