import { BigNumber } from 'ethers';
import { ProtocolAction } from '../commons/types';
import { gasLimitRecommendations } from '../commons/utils';
import { IRewardsDistributor__factory } from './typechain/IRewardsDistributor__factory';
export class RewardsDistributorService {
    constructor(rewardsDistributorAddress) {
        this.rewardsDistributorAddress = rewardsDistributorAddress;
        this.interface = IRewardsDistributor__factory.createInterface();
    }
    // Claim all rewards across all stake tokens
    claimAllAvailableRewards({ stakeTokens, sender, }) {
        const tx = {};
        const receiver = sender;
        tx.data = this.interface.encodeFunctionData('claimAllRewards(address[],address)', [stakeTokens, receiver]);
        tx.from = sender;
        tx.to = this.rewardsDistributorAddress;
        tx.gasLimit = BigNumber.from(gasLimitRecommendations[ProtocolAction.umbrellaClaimAllRewards]
            .recommended);
        return tx;
    }
    // Claim all rewards for a specific stake token
    claimAllRewards({ stakeToken, sender, }) {
        const tx = {};
        const receiver = sender;
        const txData = this.interface.encodeFunctionData('claimAllRewards(address,address)', [stakeToken, receiver]);
        tx.data = txData;
        tx.from = sender;
        tx.to = this.rewardsDistributorAddress;
        tx.gasLimit = BigNumber.from(gasLimitRecommendations[ProtocolAction.umbrellaClaimAllRewards]
            .recommended);
        return tx;
    }
    claimSelectedRewards({ stakeToken, rewards, sender, }) {
        const tx = {};
        const receiver = sender;
        const txData = this.interface.encodeFunctionData('claimSelectedRewards(address,address[],address)', [stakeToken, rewards, receiver]);
        tx.data = txData;
        tx.from = sender;
        tx.to = this.rewardsDistributorAddress;
        tx.gasLimit = BigNumber.from(gasLimitRecommendations[ProtocolAction.umbrellaClaimSelectedRewards]
            .recommended);
        return tx;
    }
}
//# sourceMappingURL=RewardsDistributor.js.map