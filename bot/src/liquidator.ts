import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { LiquidatablePosition } from './protocols/aave.js';
import { FlashbotsSubmitter } from './flashbots.js';
import { config } from './utils/config.js';
import logger from './utils/logger.js';
import {
  calculateLiquidationProfit,
  estimateGasUnits,
  applySlippage,
  formatHealthFactor,
  ProfitEstimate,
} from './calculator.js';

// ─── Contract ABIs ────────────────────────────────────────────────────────────

const FLASH_LIQUIDATOR_ABI = [
  'function executeLiquidation(address collateralAsset, address debtAsset, address borrower, uint256 debtToCover, uint24 poolFee, uint256 minProfit) external',
  'event LiquidationExecuted(address indexed borrower, address indexed collateralAsset, address indexed debtAsset, uint256 debtCovered, uint256 collateralReceived, uint256 profit)',
];

const ERC20_ABI = [
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
];

// Price oracle ABI (Aave price oracle)
const PRICE_ORACLE_ABI = [
  'function getAssetPrice(address asset) external view returns (uint256)',
  'function getAssetsPrices(address[] assets) external view returns (uint256[])',
  'function BASE_CURRENCY_UNIT() external view returns (uint256)',
];

// Aave Pool ABI (for oracle address)
const POOL_ADDRESSES_PROVIDER_ABI = [
  'function getPriceOracle() external view returns (address)',
];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LiquidationResult {
  success: boolean;
  borrower: string;
  collateralAsset: string;
  debtAsset: string;
  debtCovered: bigint;
  profit: bigint;
  txHash?: string;
  blockNumber?: number;
  gasUsed?: bigint;
  error?: string;
  dryRun: boolean;
  timestamp: Date;
}

export interface LiquidatorStats {
  totalAttempts: number;
  totalSuccess: number;
  totalProfit: bigint;
  profitToday: bigint;
  liquidationsToday: number;
  successRate: number;
  lastActivity: Date | null;
}

// ─── Liquidator ───────────────────────────────────────────────────────────────

export class Liquidator extends EventEmitter {
  private provider: ethers.WebSocketProvider;
  private signer: ethers.Wallet | null = null;
  private flashbots: FlashbotsSubmitter | null = null;
  private liquidatorContract: ethers.Contract | null = null;
  private priceOracle: ethers.Contract | null = null;
  private stats: LiquidatorStats = {
    totalAttempts: 0,
    totalSuccess: 0,
    totalProfit: 0n,
    profitToday: 0n,
    liquidationsToday: 0,
    successRate: 0,
    lastActivity: null,
  };
  private recentResults: LiquidationResult[] = [];
  private lastDayReset = new Date();
  private inProgress = new Set<string>(); // Track in-progress borrowers

  constructor(provider: ethers.WebSocketProvider) {
    super();
    this.provider = provider;

    if (config.privateKey) {
      this.signer = new ethers.Wallet(config.privateKey, provider);
      logger.info('Liquidator wallet loaded', { address: this.signer.address });
    } else {
      logger.warn('No private key configured — DRY_RUN mode only');
    }

    if (config.chain.useFlashbots && this.signer) {
      this.flashbots = new FlashbotsSubmitter(provider);
    }

    if (config.flashLiquidatorAddress && this.signer) {
      this.liquidatorContract = new ethers.Contract(
        config.flashLiquidatorAddress,
        FLASH_LIQUIDATOR_ABI,
        this.signer
      );
      logger.info('FlashLiquidator contract loaded', {
        address: config.flashLiquidatorAddress,
      });
    } else if (!config.dryRun) {
      logger.warn('FLASH_LIQUIDATOR_ADDRESS not set — deploy the contract first');
    }
  }

  async initialize(): Promise<void> {
    await this.loadPriceOracle();
    logger.info('Liquidator initialized', {
      dryRun: config.dryRun,
      useFlashbots: config.chain.useFlashbots,
      chain: config.chain.name,
    });
  }

  private async loadPriceOracle(): Promise<void> {
    try {
      // Aave V3 PoolAddressesProvider
      const addressesProviderABI = ['function getPriceOracle() external view returns (address)'];
      // The PoolAddressesProvider address (Ethereum mainnet)
      const addressesProviderAddresses: Record<number, string> = {
        1: '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e',
        42161: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
        8453: '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64b',
      };

      const providerAddr = addressesProviderAddresses[config.chain.chainId];
      if (!providerAddr) {
        logger.warn(`No PoolAddressesProvider for chainId ${config.chain.chainId}`);
        return;
      }

      const addressesProvider = new ethers.Contract(
        providerAddr,
        addressesProviderABI,
        this.provider
      );

      const oracleAddr = await addressesProvider.getPriceOracle();
      this.priceOracle = new ethers.Contract(oracleAddr, PRICE_ORACLE_ABI, this.provider);
      logger.info('Price oracle loaded', { address: oracleAddr });
    } catch (error) {
      logger.warn('Failed to load price oracle', { error });
    }
  }

  /**
   * Handle a liquidatable position event from the monitor.
   */
  async handleLiquidatablePosition(position: LiquidatablePosition): Promise<void> {
    const { borrower, healthFactor } = position;

    // Skip if already processing this borrower
    if (this.inProgress.has(borrower)) {
      logger.debug('Position already being processed', { borrower });
      return;
    }

    if (!position.bestPair) {
      logger.debug('No viable liquidation pair found', { borrower });
      return;
    }

    this.inProgress.add(borrower);

    try {
      logger.info('Processing liquidatable position', {
        borrower,
        healthFactor: formatHealthFactor(healthFactor),
        pair: `${position.bestPair.debtSymbol}/${position.bestPair.collateralSymbol}`,
        debtToCover: position.bestPair.debtToCover.toString(),
      });

      await this.executeLiquidation(position);
    } catch (error) {
      logger.error('Failed to process liquidatable position', {
        borrower,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.inProgress.delete(borrower);
    }
  }

  private async executeLiquidation(position: LiquidatablePosition): Promise<void> {
    const pair = position.bestPair!;
    this.stats.totalAttempts++;
    this.stats.lastActivity = new Date();

    this.resetDailyStatsIfNeeded();

    const result: LiquidationResult = {
      success: false,
      borrower: position.borrower,
      collateralAsset: pair.collateralAsset,
      debtAsset: pair.debtAsset,
      debtCovered: pair.debtToCover,
      profit: 0n,
      dryRun: config.dryRun,
      timestamp: new Date(),
    };

    try {
      // ── Step 1: Get current gas price ───────────────────────────────────────
      const feeData = await this.provider.getFeeData();
      const gasPriceWei = feeData.gasPrice || ethers.parseUnits('30', 'gwei');

      if (gasPriceWei > config.maxGasGwei) {
        logger.warn('Gas price too high, skipping', {
          current: ethers.formatUnits(gasPriceWei, 'gwei'),
          max: ethers.formatUnits(config.maxGasGwei, 'gwei'),
        });
        result.error = 'Gas price too high';
        this.recordResult(result);
        return;
      }

      // ── Step 2: Get asset prices ─────────────────────────────────────────────
      const prices = await this.getAssetPrices([pair.collateralAsset, pair.debtAsset]);
      const collateralPriceBase = prices[0];
      const debtPriceBase = prices[1];
      const ethPriceBase = await this.getEthPrice();

      // ── Step 3: Estimate profitability ───────────────────────────────────────
      const gasUnits = estimateGasUnits();
      const profitEstimate = calculateLiquidationProfit({
        debtToCover: pair.debtToCover,
        collateralAsset: pair.collateralAsset,
        debtAsset: pair.debtAsset,
        liquidationBonus: pair.liquidationBonus,
        collateralPriceBase,
        debtPriceBase,
        collateralDecimals: 18, // Will be fetched properly in production
        debtDecimals: 18,
        gasEstimate: gasUnits,
        gasPriceWei,
        ethPriceBase,
      });

      logger.info('Profitability estimate', {
        borrower: position.borrower,
        netProfitEth: ethers.formatEther(profitEstimate.netProfitEth),
        isProfitable: profitEstimate.isProfitable,
        reason: profitEstimate.reason,
      });

      if (!profitEstimate.isProfitable) {
        logger.info('Position not profitable, skipping', {
          reason: profitEstimate.reason,
        });
        result.error = profitEstimate.reason;
        this.recordResult(result);
        return;
      }

      // ── Step 4: Execute (or simulate in dry run) ─────────────────────────────
      if (config.dryRun) {
        logger.info('🔵 DRY RUN — would execute liquidation', {
          borrower: position.borrower,
          collateral: pair.collateralSymbol,
          debt: pair.debtSymbol,
          debtToCover: ethers.formatUnits(pair.debtToCover, 18),
          estimatedProfitEth: ethers.formatEther(profitEstimate.netProfitEth),
        });

        result.success = true;
        result.profit = profitEstimate.netProfitEth;
      } else {
        // Real execution
        await this.submitLiquidation(position, pair, profitEstimate, gasPriceWei, result);
      }

      if (result.success) {
        this.stats.totalSuccess++;
        this.stats.totalProfit += result.profit;
        this.stats.profitToday += result.profit;
        this.stats.liquidationsToday++;
        this.stats.successRate =
          Math.round((this.stats.totalSuccess / this.stats.totalAttempts) * 100);

        logger.info('✅ Liquidation succeeded!', {
          borrower: position.borrower,
          profit: ethers.formatEther(result.profit),
          txHash: result.txHash,
        });

        this.emit('liquidation_executed', result);
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      logger.error('Liquidation execution failed', {
        borrower: position.borrower,
        error: result.error,
      });
    }

    this.recordResult(result);
  }

  private async submitLiquidation(
    position: LiquidatablePosition,
    pair: NonNullable<LiquidatablePosition['bestPair']>,
    profitEstimate: ProfitEstimate,
    gasPriceWei: bigint,
    result: LiquidationResult
  ): Promise<void> {
    if (!this.liquidatorContract || !this.signer) {
      throw new Error('Contract or signer not initialized');
    }

    // Apply slippage to min profit
    const minProfit = applySlippage(profitEstimate.netProfitEth, BigInt(config.maxSlippageBps));

    // Pool fee for the Uniswap swap (default 0.3%)
    const poolFee = 3000;

    if (config.chain.useFlashbots && this.flashbots) {
      // ── Flashbots submission ──────────────────────────────────────────────
      const feeData = await this.provider.getFeeData();
      const priorityFee = await this.flashbots.estimatePriorityFee();

      const tx = await this.liquidatorContract.executeLiquidation.populateTransaction(
        pair.collateralAsset,
        pair.debtAsset,
        position.borrower,
        pair.debtToCover,
        poolFee,
        minProfit,
        {
          gasLimit: estimateGasUnits() + 50000n, // add buffer
          maxFeePerGas: (feeData.maxFeePerGas || gasPriceWei) * 2n,
          maxPriorityFeePerGas: priorityFee,
        }
      );

      const signedTx = await this.signer.signTransaction(tx);
      const bundle = await this.flashbots.buildBundle([signedTx]);

      // Simulate first
      const simulation = await this.flashbots.simulateBundle(bundle);
      if (!simulation.success) {
        throw new Error(`Bundle simulation failed: ${simulation.error}`);
      }

      // Submit
      const submission = await this.flashbots.submitBundle(bundle);
      if (!submission.success) {
        throw new Error(`Bundle submission failed: ${submission.error}`);
      }

      result.success = true;
      result.txHash = submission.bundleHash;
      result.blockNumber = submission.blockNumber;
    } else {
      // ── Direct submission (Arbitrum / Base) ──────────────────────────────
      const feeData = await this.provider.getFeeData();

      const txResponse = await this.liquidatorContract.executeLiquidation(
        pair.collateralAsset,
        pair.debtAsset,
        position.borrower,
        pair.debtToCover,
        poolFee,
        minProfit,
        {
          gasLimit: estimateGasUnits() + 50000n,
          maxFeePerGas: (feeData.maxFeePerGas || gasPriceWei) * 2n,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits('1', 'gwei'),
        }
      );

      logger.info('Transaction submitted', { txHash: txResponse.hash });
      const receipt = await txResponse.wait();

      if (!receipt || receipt.status !== 1) {
        throw new Error(`Transaction reverted: ${txResponse.hash}`);
      }

      // Parse profit from event
      const iface = new ethers.Interface(FLASH_LIQUIDATOR_ABI);
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === 'LiquidationExecuted') {
            result.profit = BigInt(parsed.args.profit);
          }
        } catch {
          // Not our event
        }
      }

      result.success = true;
      result.txHash = receipt.hash;
      result.blockNumber = receipt.blockNumber;
      result.gasUsed = receipt.gasUsed;
    }
  }

  private async getAssetPrices(assets: string[]): Promise<bigint[]> {
    if (!this.priceOracle) {
      // Fallback: return dummy prices for dry-run
      return assets.map(() => 100_000_000n); // $1 in 8-decimal base
    }

    try {
      const prices = await this.priceOracle.getAssetsPrices(assets);
      return prices.map((p: bigint) => BigInt(p));
    } catch (error) {
      logger.warn('Failed to fetch asset prices', { error });
      return assets.map(() => 100_000_000n);
    }
  }

  private async getEthPrice(): Promise<bigint> {
    if (!this.priceOracle) return 2000_00000000n; // $2000 fallback

    try {
      // WETH address (mainnet)
      const wethAddresses: Record<number, string> = {
        1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        8453: '0x4200000000000000000000000000000000000006',
      };

      const weth = wethAddresses[config.chain.chainId] || wethAddresses[1];
      const price = await this.priceOracle.getAssetPrice(weth);
      return BigInt(price);
    } catch {
      return 2000_00000000n;
    }
  }

  private recordResult(result: LiquidationResult): void {
    this.recentResults.unshift(result);
    // Keep only last 100 results
    if (this.recentResults.length > 100) {
      this.recentResults = this.recentResults.slice(0, 100);
    }
  }

  private resetDailyStatsIfNeeded(): void {
    const now = new Date();
    if (now.getDate() !== this.lastDayReset.getDate()) {
      this.stats.profitToday = 0n;
      this.stats.liquidationsToday = 0;
      this.lastDayReset = now;
    }
  }

  getStats(): LiquidatorStats {
    return { ...this.stats };
  }

  getRecentResults(): LiquidationResult[] {
    return [...this.recentResults];
  }
}

export default Liquidator;
