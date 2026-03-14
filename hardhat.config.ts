import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import dotenv from 'dotenv';

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || '0x' + '0'.repeat(64);
const ETH_RPC = process.env.ETH_RPC_HTTP || process.env.ETH_RPC_WS?.replace('wss://', 'https://').replace('ws://', 'http://') || '';
const ARB_RPC = process.env.ARB_RPC_HTTP || process.env.ARB_RPC_WS?.replace('wss://', 'https://').replace('ws://', 'http://') || '';
const BASE_RPC = process.env.BASE_RPC_HTTP || process.env.BASE_RPC_WS?.replace('wss://', 'https://').replace('ws://', 'http://') || '';
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.19',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: false,
    },
  },

  networks: {
    hardhat: {
      forking: ETH_RPC
        ? {
            url: ETH_RPC,
            blockNumber: undefined, // Use latest
          }
        : undefined,
      chainId: 1,
    },

    mainnet: {
      url: ETH_RPC,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 1,
      gasPrice: 'auto',
    },

    arbitrum: {
      url: ARB_RPC,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 42161,
      gasPrice: 'auto',
    },

    base: {
      url: BASE_RPC,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 8453,
      gasPrice: 'auto',
    },
  },

  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY,
      arbitrumOne: process.env.ARBISCAN_API_KEY || '',
      base: process.env.BASESCAN_API_KEY || '',
    },
    customChains: [
      {
        network: 'base',
        chainId: 8453,
        urls: {
          apiURL: 'https://api.basescan.org/api',
          browserURL: 'https://basescan.org',
        },
      },
    ],
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS === 'true',
    currency: 'USD',
    coinmarketcap: process.env.CMC_API_KEY,
    gasPrice: 30,
  },

  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
};

export default config;
