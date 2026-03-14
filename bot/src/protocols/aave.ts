import { ethers } from 'ethers';
import { config } from '../utils/config.js';
import logger from '../utils/logger.js';

// ─── ABIs ────────────────────────────────────────────────────────────────────

const POOL_ABI = [
  'function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  'function getReservesList() external view returns (address[])',
  'function getReserveData(address asset) external view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))',
  'function liquidationCall(address collateralAsset, address debtAsset, address user, uint256 debtToCover, bool receiveAToken) external',
];

const DATA_PROVIDER_ABI = [
  'function getUserReserveData(address asset, address user) external view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)',
  'function getReserveConfigurationData(address asset) external view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)',
  'function getAllReservesTokens() external view returns (tuple(string symbol, address tokenAddress)[])',
  'function getReserveData(address asset) external view returns (uint256 availableLiquidity, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)',
];

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UserAccountData {
  totalCollateralBase: bigint;
  totalDebtBase: bigint;
  availableBorrowsBase: bigint;
  currentLiquidationThreshold: bigint;
  ltv: bigint;
  healthFactor: bigint;
}

export interface UserReserveData {
  asset: string;
  symbol: string;
  decimals: number;
  currentATokenBalance: bigint;
  currentStableDebt: bigint;
  currentVariableDebt: bigint;
  totalDebt: bigint;
  usageAsCollateralEnabled: boolean;
  liquidationBonus: bigint;
  liquidationThreshold: bigint;
}

export interface LiquidatablePosition {
  borrower: string;
  healthFactor: bigint;
  totalCollateralBase: bigint;
  totalDebtBase: bigint;
  collateralReserves: UserReserveData[];
  debtReserves: UserReserveData[];
  bestPair?: {
    collateralAsset: string;
    debtAsset: string;
    collateralSymbol: string;
    debtSymbol: string;
    debtToCover: bigint;
    liquidationBonus: bigint;
  };
}

export interface ReserveToken {
  symbol: string;
  tokenAddress: string;
  decimals: number;
}

// ─── AaveProtocol ────────────────────────────────────────────────────────────

export class AaveProtocol {
  private pool: ethers.Contract;
  private dataProvider: ethers.Contract;
  private provider: ethers.WebSocketProvider;
  private reserveTokens: ReserveToken[] = [];
  private reserveConfig: Map<string, { liquidationBonus: bigint; liquidationThreshold: bigint; decimals: number }> = new Map();

  constructor(provider: ethers.WebSocketProvider) {
    this.provider = provider;
    this.pool = new ethers.Contract(config.chain.aavePoolAddress, POOL_ABI, provider);
    this.dataProvider = new ethers.Contract(config.chain.aaveDataProvider, DATA_PROVIDER_ABI, provider);
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Aave V3 protocol interface...', { chain: config.chain.name });
    await this.loadReserveTokens();
    await this.loadReserveConfigs();
    logger.info(`Loaded ${this.reserveTokens.length} reserve tokens`, { chain: config.chain.name });
  }

  private async loadReserveTokens(): Promise<void> {
    try {
      const tokens: Array<{ symbol: string; tokenAddress: string }> =
        await this.dataProvider.getAllReservesTokens();

      const decimalsPromises = tokens.map(async (t) => {
        try {
          const erc20 = new ethers.Contract(t.tokenAddress, ERC20_ABI, this.provider);
          const decimals = await erc20.decimals();
          return { symbol: t.symbol, tokenAddress: t.tokenAddress, decimals: Number(decimals) };
        } catch {
          return { symbol: t.symbol, tokenAddress: t.tokenAddress, decimals: 18 };
        }
      });

      this.reserveTokens = await Promise.all(decimalsPromises);
    } catch (error) {
      logger.error('Failed to load reserve tokens', { error });
      throw error;
    }
  }

  private async loadReserveConfigs(): Promise<void> {
    const configPromises = this.reserveTokens.map(async (token) => {
      try {
        const cfg = await this.dataProvider.getReserveConfigurationData(token.tokenAddress);
        this.reserveConfig.set(token.tokenAddress.toLowerCase(), {
          liquidationBonus: BigInt(cfg.liquidationBonus),
          liquidationThreshold: BigInt(cfg.liquidationThreshold),
          decimals: Number(cfg.decimals),
        });
      } catch (error) {
        logger.warn(`Failed to load config for ${token.symbol}`, { error });
      }
    });
    await Promise.all(configPromises);
  }

  getReserveTokens(): ReserveToken[] {
    return this.reserveTokens;
  }

  getReserveConfig(assetAddress: string) {
    return this.reserveConfig.get(assetAddress.toLowerCase());
  }

  async getUserAccountData(userAddress: string): Promise<UserAccountData> {
    const data = await this.pool.getUserAccountData(userAddress);
    return {
      totalCollateralBase: BigInt(data.totalCollateralBase),
      totalDebtBase: BigInt(data.totalDebtBase),
      availableBorrowsBase: BigInt(data.availableBorrowsBase),
      currentLiquidationThreshold: BigInt(data.currentLiquidationThreshold),
      ltv: BigInt(data.ltv),
      healthFactor: BigInt(data.healthFactor),
    };
  }

  async getUserReserveData(
    assetAddress: string,
    userAddress: string
  ): Promise<{
    currentATokenBalance: bigint;
    currentStableDebt: bigint;
    currentVariableDebt: bigint;
    usageAsCollateralEnabled: boolean;
  }> {
    const data = await this.dataProvider.getUserReserveData(assetAddress, userAddress);
    return {
      currentATokenBalance: BigInt(data.currentATokenBalance),
      currentStableDebt: BigInt(data.currentStableDebt),
      currentVariableDebt: BigInt(data.currentVariableDebt),
      usageAsCollateralEnabled: data.usageAsCollateralEnabled,
    };
  }

  /**
   * Fetch full position data for a user across all reserves.
   * Returns null if user has no debt.
   */
  async getUserPosition(userAddress: string): Promise<LiquidatablePosition | null> {
    try {
      const accountData = await this.getUserAccountData(userAddress);

      // No debt → not liquidatable
      if (accountData.totalDebtBase === 0n) return null;

      const collateralReserves: UserReserveData[] = [];
      const debtReserves: UserReserveData[] = [];

      // Batch fetch per-reserve data
      const reserveDataPromises = this.reserveTokens.map(async (token) => {
        try {
          const rd = await this.getUserReserveData(token.tokenAddress, userAddress);
          const cfg = this.reserveConfig.get(token.tokenAddress.toLowerCase());

          if (rd.currentATokenBalance > 0n && rd.usageAsCollateralEnabled) {
            collateralReserves.push({
              asset: token.tokenAddress,
              symbol: token.symbol,
              decimals: cfg?.decimals ?? token.decimals,
              currentATokenBalance: rd.currentATokenBalance,
              currentStableDebt: 0n,
              currentVariableDebt: 0n,
              totalDebt: 0n,
              usageAsCollateralEnabled: true,
              liquidationBonus: cfg?.liquidationBonus ?? 10500n,
              liquidationThreshold: cfg?.liquidationThreshold ?? 8000n,
            });
          }

          const totalDebt = rd.currentStableDebt + rd.currentVariableDebt;
          if (totalDebt > 0n) {
            debtReserves.push({
              asset: token.tokenAddress,
              symbol: token.symbol,
              decimals: cfg?.decimals ?? token.decimals,
              currentATokenBalance: 0n,
              currentStableDebt: rd.currentStableDebt,
              currentVariableDebt: rd.currentVariableDebt,
              totalDebt,
              usageAsCollateralEnabled: false,
              liquidationBonus: 0n,
              liquidationThreshold: cfg?.liquidationThreshold ?? 8000n,
            });
          }
        } catch {
          // Skip reserves that fail
        }
      });

      await Promise.all(reserveDataPromises);

      if (debtReserves.length === 0) return null;

      const position: LiquidatablePosition = {
        borrower: userAddress,
        healthFactor: accountData.healthFactor,
        totalCollateralBase: accountData.totalCollateralBase,
        totalDebtBase: accountData.totalDebtBase,
        collateralReserves,
        debtReserves,
      };

      // Find the best liquidation pair
      if (collateralReserves.length > 0 && debtReserves.length > 0) {
        // Pick largest debt reserve and largest collateral reserve (simple heuristic)
        const bestDebt = debtReserves.reduce((a, b) => (a.totalDebt > b.totalDebt ? a : b));
        const bestCollateral = collateralReserves.reduce((a, b) =>
          a.currentATokenBalance > b.currentATokenBalance ? a : b
        );

        // Aave V3: max liquidation = 50% of debt
        const debtToCover = bestDebt.totalDebt / 2n;

        position.bestPair = {
          collateralAsset: bestCollateral.asset,
          debtAsset: bestDebt.asset,
          collateralSymbol: bestCollateral.symbol,
          debtSymbol: bestDebt.symbol,
          debtToCover,
          liquidationBonus: bestCollateral.liquidationBonus,
        };
      }

      return position;
    } catch (error) {
      logger.debug(`Failed to fetch position for ${userAddress}`, { error });
      return null;
    }
  }

  /**
   * Fetch borrowers from Aave V3 LendingPool events.
   * Uses the Borrow event to discover active borrowers.
   */
  async getActiveBorrowers(fromBlock: number, toBlock: number): Promise<string[]> {
    try {
      const borrowTopic = ethers.id('Borrow(address,address,address,uint256,uint8,uint256,uint16)');
      const logs = await this.provider.getLogs({
        address: config.chain.aavePoolAddress,
        topics: [borrowTopic],
        fromBlock,
        toBlock,
      });

      const borrowers = new Set<string>();
      for (const log of logs) {
        // onBehalfOf is the 3rd indexed topic
        if (log.topics[3]) {
          const addr = ethers.getAddress('0x' + log.topics[3].slice(26));
          borrowers.add(addr);
        }
      }

      return Array.from(borrowers);
    } catch (error) {
      logger.error('Failed to fetch active borrowers from events', { error });
      return [];
    }
  }

  get poolContract(): ethers.Contract {
    return this.pool;
  }
}
