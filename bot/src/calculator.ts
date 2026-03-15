import { ethers } from 'ethers';
import logger from './utils/logger.js';
import { config } from './utils/config.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const WAD = 10n ** 18n;         // 1e18
const RAY = 10n ** 27n;         // 1e27
const BPS = 10000n;             // 100% in basis points
const FLASH_LOAN_PREMIUM = 5n;  // 0.05% = 5 bps

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProfitEstimate {
  grossProfitBase: bigint;    // Profit in Aave base units (8 decimals, USD)
  flashLoanFeeBase: bigint;   // Flash loan fee in base units
  gasCostBase: bigint;        // Estimated gas cost in base units
  netProfitBase: bigint;      // Net profit after fees and gas
  netProfitEth: bigint;       // Net profit in ETH wei
  isProfitable: boolean;
  reason?: string;
}

export interface LiquidationParams {
  debtToCover: bigint;         // Amount of debt to cover (in debt token units)
  collateralAsset: string;
  debtAsset: string;
  liquidationBonus: bigint;    // e.g., 10500 = 5% bonus (basis points * 100)
  collateralPriceBase: bigint; // Price in Aave base units (8 dec)
  debtPriceBase: bigint;
  collateralDecimals: number;
  debtDecimals: number;
  gasEstimate: bigint;         // in gas units
  gasPriceWei: bigint;
  ethPriceBase: bigint;        // ETH price in base units
}

// ─── Calculator ──────────────────────────────────────────────────────────────

/**
 * Calculate the health factor given Aave account data.
 *
 * Formula: HF = (totalCollateralBase * liquidationThreshold / 10000) / totalDebtBase
 *
 * @param totalCollateralBase  Total collateral in USD base units (8 dec)
 * @param totalDebtBase        Total debt in USD base units (8 dec)
 * @param currentLiquidationThreshold  Liquidation threshold in bps (e.g. 8500 = 85%)
 * @returns Health factor scaled by 1e18 (like Aave returns it)
 */
export function calculateHealthFactor(
  totalCollateralBase: bigint,
  totalDebtBase: bigint,
  currentLiquidationThreshold: bigint
): bigint {
  if (totalDebtBase === 0n) return ethers.MaxUint256;

  // HF = collateral * threshold / 10000 / debt * 1e18
  const collateralAdjusted = (totalCollateralBase * currentLiquidationThreshold) / BPS;
  return (collateralAdjusted * WAD) / totalDebtBase;
}

/**
 * Calculate estimated profit from a liquidation.
 *
 * The liquidator:
 * 1. Flash-loans `debtToCover` of debtAsset (pays 0.05% premium)
 * 2. Calls liquidationCall → receives collateralAmount * (1 + bonus/10000)
 * 3. Swaps collateral → debtAsset
 * 4. Repays flash loan + premium
 * 5. Profit = collateral value - debt value (the bonus)
 */
export function calculateLiquidationProfit(params: LiquidationParams): ProfitEstimate {
  const {
    debtToCover,
    liquidationBonus,
    collateralPriceBase,
    debtPriceBase,
    collateralDecimals,
    debtDecimals,
    gasEstimate,
    gasPriceWei,
    ethPriceBase,
  } = params;

  // Convert debtToCover to base units (USD, 8 dec)
  const debtAmountBase =
    (debtToCover * debtPriceBase) / BigInt(10 ** debtDecimals);

  // Flash loan fee: 0.05% = 5 / 10000 = FLASH_LOAN_PREMIUM / BPS
  // FLASH_LOAN_PREMIUM = 5, BPS = 10000 → 5/10000 = 0.0005 = 0.05% ✓
  const flashLoanFeeBase = (debtAmountBase * FLASH_LOAN_PREMIUM) / BPS;

  // Collateral received = debt * liquidationBonus / 10000
  // liquidationBonus from Aave is e.g. 10500 meaning 105% → 5% bonus
  const bonusBps = liquidationBonus - 10000n;
  const grossProfitBase = (debtAmountBase * bonusBps) / 10000n;

  // Gas cost in USD base units
  const gasCostWei = gasEstimate * gasPriceWei;
  // Convert ETH wei to base units: gasCostWei * ethPriceBase / 1e18
  const gasCostBase = (gasCostWei * ethPriceBase) / WAD;

  // Net profit
  const netProfitBase = grossProfitBase - flashLoanFeeBase - gasCostBase;

  // Convert to ETH: netProfitBase * 1e18 / ethPriceBase
  const netProfitEth = ethPriceBase > 0n ? (netProfitBase * WAD) / ethPriceBase : 0n;

  const isProfitable = netProfitEth >= config.minProfitEth && netProfitBase > 0n;

  let reason: string | undefined;
  if (!isProfitable) {
    if (netProfitBase <= 0n) {
      reason = `Negative profit: gross=${grossProfitBase}, fee=${flashLoanFeeBase}, gas=${gasCostBase}`;
    } else {
      reason = `Below min profit threshold: ${formatEther(netProfitEth)} ETH < ${formatEther(config.minProfitEth)} ETH`;
    }
  }

  return {
    grossProfitBase,
    flashLoanFeeBase,
    gasCostBase,
    netProfitBase,
    netProfitEth,
    isProfitable,
    reason,
  };
}

/**
 * Quick check: is this position worth investigating?
 */
export function isLiquidatable(healthFactor: bigint): boolean {
  return healthFactor < WAD; // HF < 1.0
}

/**
 * Is this position near liquidation (worth monitoring closely)?
 */
export function isNearLiquidation(healthFactor: bigint, threshold = 105n): boolean {
  // Default: HF < 1.05
  return healthFactor < (WAD * threshold) / 100n;
}

/**
 * Calculate the maximum debt that can be covered (50% rule for non-isolated).
 */
export function maxDebtToCover(totalDebt: bigint): bigint {
  return totalDebt / 2n;
}

/**
 * Apply slippage to a minimum output amount.
 */
export function applySlippage(amount: bigint, slippageBps: bigint): bigint {
  return (amount * (BPS - slippageBps)) / BPS;
}

/**
 * Estimate gas units for a liquidation transaction.
 */
export function estimateGasUnits(): bigint {
  // Conservative estimate for flash loan + liquidation + swap
  return 600_000n;
}

/**
 * Check if current gas price is within acceptable bounds.
 */
export function isGasAcceptable(gasPriceWei: bigint): boolean {
  return gasPriceWei <= config.maxGasGwei;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatEther(wei: bigint): string {
  return ethers.formatEther(wei);
}

export function formatHealthFactor(hf: bigint): string {
  if (hf === ethers.MaxUint256) return '∞';
  const formatted = Number(hf) / 1e18;
  return formatted.toFixed(4);
}

export function healthFactorToRisk(hf: bigint): 'liquidatable' | 'critical' | 'warning' | 'safe' {
  if (hf < WAD) return 'liquidatable';
  if (hf < (WAD * 105n) / 100n) return 'critical';
  if (hf < (WAD * 115n) / 100n) return 'warning';
  return 'safe';
}

/**
 * Find the most profitable collateral/debt pair given multiple options.
 */
export interface PairOption {
  collateralAsset: string;
  collateralSymbol: string;
  debtAsset: string;
  debtSymbol: string;
  debtToCover: bigint;
  liquidationBonus: bigint;
  collateralPriceBase: bigint;
  debtPriceBase: bigint;
  collateralDecimals: number;
  debtDecimals: number;
}

export function findMostProfitablePair(
  pairs: PairOption[],
  gasEstimate: bigint,
  gasPriceWei: bigint,
  ethPriceBase: bigint
): { pair: PairOption; profit: ProfitEstimate } | null {
  let best: { pair: PairOption; profit: ProfitEstimate } | null = null;

  for (const pair of pairs) {
    const profit = calculateLiquidationProfit({
      ...pair,
      gasEstimate,
      gasPriceWei,
      ethPriceBase,
    });

    if (profit.isProfitable) {
      if (!best || profit.netProfitEth > best.profit.netProfitEth) {
        best = { pair, profit };
      }
    }
  }

  return best;
}

export default {
  calculateHealthFactor,
  calculateLiquidationProfit,
  isLiquidatable,
  isNearLiquidation,
  maxDebtToCover,
  applySlippage,
  estimateGasUnits,
  isGasAcceptable,
  formatHealthFactor,
  healthFactorToRisk,
  findMostProfitablePair,
};
