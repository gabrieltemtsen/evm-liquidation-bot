/**
 * Deploy FlashLiquidator to Ethereum, Arbitrum, or Base.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network mainnet
 *   npx hardhat run scripts/deploy.ts --network arbitrum
 *   npx hardhat run scripts/deploy.ts --network base
 */

import { ethers, network, run } from 'hardhat';

interface ChainAddresses {
  addressesProvider: string;
  swapRouter: string;
  name: string;
}

const CHAIN_ADDRESSES: Record<number, ChainAddresses> = {
  1: {
    name: 'Ethereum Mainnet',
    addressesProvider: '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e',
    swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  },
  42161: {
    name: 'Arbitrum One',
    addressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
    swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  },
  8453: {
    name: 'Base',
    addressesProvider: '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64b',
    swapRouter: '0x2626664c2603336E57B271c5C0b26F421741e481',
  },
  31337: {
    // Hardhat localhost / fork
    name: 'Hardhat (fork)',
    addressesProvider: '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e',
    swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  },
};

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const chainIdNum = Number(chainId);

  const addresses = CHAIN_ADDRESSES[chainIdNum];
  if (!addresses) {
    throw new Error(
      `Unsupported chain ID: ${chainIdNum}. Add it to CHAIN_ADDRESSES.`
    );
  }

  console.log('═'.repeat(60));
  console.log('⚡ Deploying FlashLiquidator');
  console.log('═'.repeat(60));
  console.log('Network:            ', addresses.name);
  console.log('Chain ID:           ', chainIdNum);
  console.log('Deployer:           ', deployer.address);
  console.log(
    'Deployer balance:   ',
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    'ETH'
  );
  console.log('Addresses Provider: ', addresses.addressesProvider);
  console.log('Swap Router:        ', addresses.swapRouter);
  console.log('─'.repeat(60));

  const FlashLiquidator = await ethers.getContractFactory('FlashLiquidator');

  console.log('Deploying...');
  const contract = await FlashLiquidator.deploy(
    addresses.addressesProvider,
    addresses.swapRouter
  );

  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  console.log('✅ FlashLiquidator deployed at:', contractAddress);
  console.log('');
  console.log('Add this to your .env:');
  console.log(`FLASH_LIQUIDATOR_ADDRESS=${contractAddress}`);
  console.log('');

  // Verify on Etherscan (skip on localhost)
  if (chainIdNum !== 31337 && process.env.ETHERSCAN_API_KEY) {
    console.log('Waiting for block confirmations before verification...');
    await new Promise((resolve) => setTimeout(resolve, 30000)); // 30s

    try {
      await run('verify:verify', {
        address: contractAddress,
        constructorArguments: [addresses.addressesProvider, addresses.swapRouter],
      });
      console.log('✅ Contract verified on Etherscan');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('Already Verified')) {
        console.log('Contract already verified');
      } else {
        console.warn('Verification failed:', msg);
      }
    }
  }

  // Save deployment info
  const deploymentInfo = {
    network: addresses.name,
    chainId: chainIdNum,
    contractAddress,
    deployer: deployer.address,
    addressesProvider: addresses.addressesProvider,
    swapRouter: addresses.swapRouter,
    deployedAt: new Date().toISOString(),
    blockNumber: await ethers.provider.getBlockNumber(),
  };

  const fs = await import('fs');
  const deployPath = `deployments/${chainIdNum}.json`;
  fs.mkdirSync('deployments', { recursive: true });
  fs.writeFileSync(deployPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`Deployment info saved to ${deployPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Deployment failed:', error);
    process.exit(1);
  });
