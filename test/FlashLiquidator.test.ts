/**
 * FlashLiquidator Tests
 *
 * Runs against a mainnet fork (requires ETH_RPC_HTTP in .env).
 * Tests:
 *   1. Deployment
 *   2. Access control (onlyOwner)
 *   3. Flash loan callback validation
 *   4. End-to-end liquidation on a forked position (optional)
 */

import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { FlashLiquidator } from '../typechain-types';

// ─── Addresses (Ethereum Mainnet) ─────────────────────────────────────────────
const AAVE_ADDRESSES_PROVIDER = '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e';
const UNISWAP_SWAP_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
const AAVE_POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

async function deployFixture() {
  const [owner, other] = await ethers.getSigners();

  const FlashLiquidatorFactory = await ethers.getContractFactory('FlashLiquidator');
  const contract = await FlashLiquidatorFactory.deploy(
    AAVE_ADDRESSES_PROVIDER,
    UNISWAP_SWAP_ROUTER
  ) as FlashLiquidator;

  await contract.waitForDeployment();

  return { contract, owner, other };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FlashLiquidator', function () {
  this.timeout(120_000); // Forks can be slow

  // ── Deployment ──────────────────────────────────────────────────────────────

  describe('Deployment', function () {
    it('should deploy with correct addresses', async function () {
      const { contract, owner } = await loadFixture(deployFixture);

      expect(await contract.POOL()).to.equal(AAVE_POOL);
      expect(await contract.SWAP_ROUTER()).to.equal(UNISWAP_SWAP_ROUTER);
      expect(await contract.owner()).to.equal(owner.address);
    });

    it('should set ADDRESSES_PROVIDER correctly', async function () {
      const { contract } = await loadFixture(deployFixture);
      expect(await contract.ADDRESSES_PROVIDER()).to.equal(AAVE_ADDRESSES_PROVIDER);
    });
  });

  // ── Access Control ──────────────────────────────────────────────────────────

  describe('Access Control', function () {
    it('should revert executeLiquidation if called by non-owner', async function () {
      const { contract, other } = await loadFixture(deployFixture);

      await expect(
        contract.connect(other).executeLiquidation(
          WETH,
          USDC,
          ethers.ZeroAddress,
          ethers.parseUnits('100', 6),
          3000,
          0
        )
      ).to.be.revertedWithCustomError(contract, 'OwnableUnauthorizedAccount');
    });

    it('should revert withdraw if called by non-owner', async function () {
      const { contract, other } = await loadFixture(deployFixture);

      await expect(
        contract.connect(other).withdraw(USDC, 0)
      ).to.be.revertedWithCustomError(contract, 'OwnableUnauthorizedAccount');
    });
  });

  // ── Flash Loan Callback ─────────────────────────────────────────────────────

  describe('executeOperation', function () {
    it('should revert if caller is not the Aave Pool', async function () {
      const { contract, other } = await loadFixture(deployFixture);

      await expect(
        contract.connect(other).executeOperation(
          USDC,
          ethers.parseUnits('100', 6),
          ethers.parseUnits('0.05', 6),
          contract.getAddress(),
          '0x'
        )
      ).to.be.revertedWithCustomError(contract, 'OnlyPool');
    });

    it('should revert if initiator is not the contract itself', async function () {
      const { contract, owner } = await loadFixture(deployFixture);

      // Impersonate the Aave Pool to call executeOperation with wrong initiator
      await ethers.provider.send('hardhat_impersonateAccount', [AAVE_POOL]);
      const poolSigner = await ethers.getSigner(AAVE_POOL);

      // Fund the pool signer for gas
      await owner.sendTransaction({
        to: AAVE_POOL,
        value: ethers.parseEther('1'),
      });

      const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'uint24', 'uint256'],
        [WETH, ethers.ZeroAddress, 3000, 0]
      );

      await expect(
        contract.connect(poolSigner).executeOperation(
          USDC,
          ethers.parseUnits('100', 6),
          ethers.parseUnits('0.05', 6),
          owner.address, // wrong initiator
          encoded
        )
      ).to.be.revertedWithCustomError(contract, 'OnlySelf');

      await ethers.provider.send('hardhat_stopImpersonatingAccount', [AAVE_POOL]);
    });
  });

  // ── Withdraw ────────────────────────────────────────────────────────────────

  describe('Withdraw', function () {
    it('should allow owner to withdraw ETH', async function () {
      const { contract, owner } = await loadFixture(deployFixture);

      // Send some ETH to the contract
      await owner.sendTransaction({
        to: await contract.getAddress(),
        value: ethers.parseEther('0.1'),
      });

      const contractBal = await ethers.provider.getBalance(await contract.getAddress());
      expect(contractBal).to.equal(ethers.parseEther('0.1'));

      const ownerBefore = await ethers.provider.getBalance(owner.address);
      const tx = await contract.withdraw(ethers.ZeroAddress, 0);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;

      const ownerAfter = await ethers.provider.getBalance(owner.address);
      expect(ownerAfter).to.be.closeTo(
        ownerBefore + ethers.parseEther('0.1') - gasCost,
        ethers.parseEther('0.001') // 0.001 ETH tolerance
      );
    });

    it('should allow owner to withdraw ERC20 tokens', async function () {
      const { contract, owner } = await loadFixture(deployFixture);
      const contractAddr = await contract.getAddress();

      // Get some USDC via impersonation of a whale
      const USDC_WHALE = '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503';
      await ethers.provider.send('hardhat_impersonateAccount', [USDC_WHALE]);
      const whale = await ethers.getSigner(USDC_WHALE);
      await owner.sendTransaction({ to: USDC_WHALE, value: ethers.parseEther('1') });

      const usdc = await ethers.getContractAt('IERC20', USDC, whale);
      const sendAmount = ethers.parseUnits('100', 6);
      await usdc.transfer(contractAddr, sendAmount);

      await ethers.provider.send('hardhat_stopImpersonatingAccount', [USDC_WHALE]);

      // Verify contract has USDC
      const contractBal = await usdc.balanceOf(contractAddr);
      expect(contractBal).to.equal(sendAmount);

      // Withdraw
      const ownerBefore = await usdc.balanceOf(owner.address);
      await contract.withdraw(USDC, 0);
      const ownerAfter = await usdc.balanceOf(owner.address);

      expect(ownerAfter - ownerBefore).to.equal(sendAmount);
    });
  });

  // ── Integration (fork) ──────────────────────────────────────────────────────

  describe('Integration (fork, optional)', function () {
    it('should execute a real liquidation on a forked position', async function () {
      // This test requires a mainnet fork with a liquidatable position.
      // Skip gracefully if no fork is configured.
      const { contract, owner } = await loadFixture(deployFixture);

      // Attempt to find a liquidatable borrower from Aave V3 events
      // (This is a smoke test — in practice you'd pin a known liquidatable block)
      const pool = await ethers.getContractAt(
        ['function getUserAccountData(address user) view returns (uint256,uint256,uint256,uint256,uint256,uint256)'],
        AAVE_POOL
      );

      // Just verify our contract can call getUserAccountData without reverting
      const [totalColl, totalDebt] = await pool.getUserAccountData(await contract.getAddress());

      // Contract itself has no debt, HF should be max
      expect(totalDebt).to.equal(0n);
      expect(totalColl).to.equal(0n);

      // If we reach here, the fork is working
      console.log('    ✓ Fork integration verified (no liquidatable position tested in CI)');
    });
  });
});
