import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '..', '.env') });
// Also try loading from current dir
dotenv.config();

export interface ChainConfig {
  name: string;
  chainId: number;
  rpcWs: string;
  aavePoolAddress: string;
  aaveDataProvider: string;
  uiPoolDataProvider: string;
  uniswapRouter: string;
  useFlashbots: boolean;
  nativeToken: string;
}

export interface Config {
  chain: ChainConfig;
  privateKey: string;
  flashbotsAuthKey: string;
  flashLiquidatorAddress: string;
  dashboardPort: number;
  minProfitEth: bigint;
  maxGasGwei: bigint;
  dryRun: boolean;
  monitorIntervalMs: number;
  flashLoanPremiumBps: number; // 5 = 0.05%
  maxSlippageBps: number;       // 50 = 0.5%
}

const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  ethereum: {
    name: 'Ethereum Mainnet',
    chainId: 1,
    rpcWs: process.env.ETH_RPC_WS || '',
    aavePoolAddress: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    aaveDataProvider: '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3',
    uiPoolDataProvider: '0x91c0eA31b49B69Ea18607702c5d9aC360bf3dE7d',
    uniswapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    useFlashbots: true,
    nativeToken: 'ETH',
  },
  arbitrum: {
    name: 'Arbitrum One',
    chainId: 42161,
    rpcWs: process.env.ARB_RPC_WS || '',
    aavePoolAddress: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    aaveDataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
    uiPoolDataProvider: '0x3F960bB91e85Ae2dB8b46332De8a98f19a7B2Aa',
    uniswapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    useFlashbots: false,
    nativeToken: 'ETH',
  },
  base: {
    name: 'Base',
    chainId: 8453,
    rpcWs: process.env.BASE_RPC_WS || '',
    aavePoolAddress: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    aaveDataProvider: '0x2d8A3C5677189723C4cB8873CfC9C8976ddf54D8',
    uiPoolDataProvider: '0x174446a6741300cD2E7C1b1A636Fee99388143Ca',
    uniswapRouter: '0x2626664c2603336E57B271c5C0b26F421741e481', // Uniswap V3 on Base
    useFlashbots: false,
    nativeToken: 'ETH',
  },
};

function parseEther(val: string): bigint {
  const num = parseFloat(val);
  return BigInt(Math.floor(num * 1e18));
}

function parseGwei(val: string): bigint {
  const num = parseFloat(val);
  return BigInt(Math.floor(num * 1e9));
}

function loadConfig(): Config {
  const chainName = (process.env.CHAIN || 'ethereum').toLowerCase();
  const chainConfig = CHAIN_CONFIGS[chainName];

  if (!chainConfig) {
    throw new Error(
      `Unknown chain: ${chainName}. Valid options: ${Object.keys(CHAIN_CONFIGS).join(', ')}`
    );
  }

  if (!chainConfig.rpcWs) {
    throw new Error(
      `WebSocket RPC URL not set for chain ${chainName}. Set ${chainName.toUpperCase()}_RPC_WS in .env`
    );
  }

  const privateKey = process.env.PRIVATE_KEY || '';
  if (!privateKey && process.env.DRY_RUN !== 'true') {
    throw new Error('PRIVATE_KEY must be set in .env (unless DRY_RUN=true)');
  }

  return {
    chain: chainConfig,
    privateKey,
    flashbotsAuthKey: process.env.FLASHBOTS_AUTH_KEY || '',
    flashLiquidatorAddress: process.env.FLASH_LIQUIDATOR_ADDRESS || '',
    dashboardPort: parseInt(process.env.DASHBOARD_PORT || '3000', 10),
    minProfitEth: parseEther(process.env.MIN_PROFIT_ETH || '0.005'),
    maxGasGwei: parseGwei(process.env.MAX_GAS_GWEI || '50'),
    dryRun: process.env.DRY_RUN !== 'false',
    monitorIntervalMs: parseInt(process.env.MONITOR_INTERVAL_MS || '30000', 10),
    flashLoanPremiumBps: 5,   // Aave V3: 0.05%
    maxSlippageBps: 50,       // 0.5% slippage
  };
}

export const config = loadConfig();
export default config;
