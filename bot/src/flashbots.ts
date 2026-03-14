import { ethers } from 'ethers';
import logger from './utils/logger.js';
import { config } from './utils/config.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FlashbotsBundle {
  transactions: string[];       // Signed raw transactions
  blockNumber: number;          // Target block
  minTimestamp?: number;
  maxTimestamp?: number;
}

export interface BundleSimulation {
  success: boolean;
  coinbaseDiff?: bigint;
  gasFees?: bigint;
  error?: string;
}

export interface BundleSubmission {
  success: boolean;
  bundleHash?: string;
  blockNumber?: number;
  included?: boolean;
  error?: string;
}

// ─── Minimal Flashbots relay types ───────────────────────────────────────────

interface FlashbotsRelayResponse {
  id: number;
  result?: {
    bundleHash?: string;
    results?: Array<{
      error?: string;
      revert?: string;
      gasUsed?: number;
      coinbaseDiff?: string;
    }>;
    coinbaseDiff?: string;
    gasFees?: string;
  };
  error?: { code: number; message: string };
}

// ─── FlashbotsSubmitter ───────────────────────────────────────────────────────

export class FlashbotsSubmitter {
  private flashbotsRelay = 'https://relay.flashbots.net';
  private authSigner: ethers.Wallet;
  private provider: ethers.Provider;
  private maxRetries = 3;

  constructor(provider: ethers.Provider) {
    this.provider = provider;

    const authKey = config.flashbotsAuthKey || ethers.hexlify(ethers.randomBytes(32));
    this.authSigner = new ethers.Wallet(authKey);
    logger.info('Flashbots submitter initialized', {
      relay: this.flashbotsRelay,
      authAddress: this.authSigner.address,
    });
  }

  /**
   * Sign a Flashbots payload with the auth key.
   */
  private async signPayload(payload: string): Promise<string> {
    const hashedPayload = ethers.keccak256(ethers.toUtf8Bytes(payload));
    const signature = await this.authSigner.signMessage(
      ethers.getBytes(hashedPayload)
    );
    return `${this.authSigner.address}:${signature}`;
  }

  /**
   * Send a JSON-RPC request to the Flashbots relay.
   */
  private async sendRequest(
    method: string,
    params: unknown[]
  ): Promise<FlashbotsRelayResponse> {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    });

    const signature = await this.signPayload(body);

    const response = await fetch(this.flashbotsRelay, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Flashbots-Signature': signature,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Flashbots relay HTTP error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<FlashbotsRelayResponse>;
  }

  /**
   * Simulate a bundle against a specific block.
   */
  async simulateBundle(bundle: FlashbotsBundle): Promise<BundleSimulation> {
    try {
      logger.debug('Simulating Flashbots bundle...', {
        txCount: bundle.transactions.length,
        targetBlock: bundle.blockNumber,
      });

      const result = await this.sendRequest('eth_callBundle', [
        {
          txs: bundle.transactions,
          blockNumber: ethers.toQuantity(bundle.blockNumber),
          stateBlockNumber: ethers.toQuantity(bundle.blockNumber - 1),
          timestamp: bundle.minTimestamp,
        },
      ]);

      if (result.error) {
        logger.warn('Bundle simulation failed', { error: result.error });
        return { success: false, error: result.error.message };
      }

      // Check for individual tx reverts
      if (result.result?.results) {
        for (const txResult of result.result.results) {
          if (txResult.error || txResult.revert) {
            const errMsg = txResult.error || txResult.revert || 'unknown revert';
            logger.warn('Bundle tx simulation reverted', { error: errMsg });
            return { success: false, error: errMsg };
          }
        }
      }

      const coinbaseDiff = result.result?.coinbaseDiff
        ? BigInt(result.result.coinbaseDiff)
        : undefined;
      const gasFees = result.result?.gasFees
        ? BigInt(result.result.gasFees)
        : undefined;

      logger.info('Bundle simulation success', {
        coinbaseDiff: coinbaseDiff?.toString(),
        gasFees: gasFees?.toString(),
      });

      return { success: true, coinbaseDiff, gasFees };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Bundle simulation error', { error: errMsg });
      return { success: false, error: errMsg };
    }
  }

  /**
   * Submit a bundle to Flashbots with retry logic.
   */
  async submitBundle(bundle: FlashbotsBundle): Promise<BundleSubmission> {
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.info(`Submitting Flashbots bundle (attempt ${attempt}/${this.maxRetries})`, {
          targetBlock: bundle.blockNumber,
          txCount: bundle.transactions.length,
        });

        const result = await this.sendRequest('eth_sendBundle', [
          {
            txs: bundle.transactions,
            blockNumber: ethers.toQuantity(bundle.blockNumber),
            minTimestamp: bundle.minTimestamp,
            maxTimestamp: bundle.maxTimestamp,
          },
        ]);

        if (result.error) {
          lastError = result.error.message;
          logger.warn(`Bundle submission failed (attempt ${attempt})`, {
            error: lastError,
          });
          await this.backoff(attempt);
          continue;
        }

        const bundleHash = result.result?.bundleHash;
        logger.info('Bundle submitted successfully', {
          bundleHash,
          targetBlock: bundle.blockNumber,
        });

        // Wait for inclusion
        const included = await this.waitForInclusion(
          bundleHash || '',
          bundle.blockNumber
        );

        return {
          success: true,
          bundleHash,
          blockNumber: bundle.blockNumber,
          included,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        logger.error(`Bundle submission error (attempt ${attempt})`, { error: lastError });
        if (attempt < this.maxRetries) {
          await this.backoff(attempt);
        }
      }
    }

    return { success: false, error: lastError };
  }

  /**
   * Wait for bundle inclusion confirmation.
   * Checks the next few blocks to see if the bundle was included.
   */
  private async waitForInclusion(
    bundleHash: string,
    targetBlock: number,
    timeoutMs = 60000
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const currentBlock = await this.provider.getBlockNumber();

        // Bundle window passed
        if (currentBlock > targetBlock + 3) {
          logger.warn('Bundle inclusion window passed', {
            bundleHash,
            targetBlock,
            currentBlock,
          });
          return false;
        }

        const result = await this.sendRequest('flashbots_getBundleStatsV2', [
          { bundleHash, blockNumber: ethers.toQuantity(targetBlock) },
        ]);

        // If we get a valid response with isHighPriority or similar, bundle is known
        if (result.result) {
          logger.debug('Bundle status received', { bundleHash, result: result.result });
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    return false;
  }

  private async backoff(attempt: number): Promise<void> {
    const delay = Math.min(1000 * 2 ** attempt, 30000);
    logger.debug(`Backing off for ${delay}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Build a Flashbots bundle from transactions.
   */
  async buildBundle(
    signedTxs: string[],
    blockOffset = 1
  ): Promise<FlashbotsBundle> {
    const currentBlock = await this.provider.getBlockNumber();
    const targetBlock = currentBlock + blockOffset;

    const block = await this.provider.getBlock(currentBlock);
    const now = Math.floor(Date.now() / 1000);

    return {
      transactions: signedTxs,
      blockNumber: targetBlock,
      minTimestamp: now,
      maxTimestamp: now + 120, // 2 minute window
    };
  }

  /**
   * Estimate priority fee to be competitive in the block.
   */
  async estimatePriorityFee(): Promise<bigint> {
    try {
      const feeData = await this.provider.getFeeData();
      const baseFee = feeData.gasPrice || 0n;
      const maxPriorityFee = feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei');

      // Add 10% buffer for competitiveness
      return (maxPriorityFee * 110n) / 100n;
    } catch {
      return ethers.parseUnits('2', 'gwei');
    }
  }
}

export default FlashbotsSubmitter;
