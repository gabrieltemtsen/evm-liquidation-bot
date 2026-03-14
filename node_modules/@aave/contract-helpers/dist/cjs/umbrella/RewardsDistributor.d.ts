import { PopulatedTransaction } from 'ethers';
interface RewardsDistributorClaimAllAvailableRewardsParams {
    stakeTokens: string[];
    sender: string;
}
interface RewardsDistributorClaimAllRewardsParams {
    stakeToken: string;
    sender: string;
}
interface RewardsDistributorClaimSelectedRewardsParams {
    stakeToken: string;
    rewards: string[];
    sender: string;
}
export declare class RewardsDistributorService {
    private readonly rewardsDistributorAddress;
    private readonly interface;
    constructor(rewardsDistributorAddress: string);
    claimAllAvailableRewards({ stakeTokens, sender, }: RewardsDistributorClaimAllAvailableRewardsParams): PopulatedTransaction;
    claimAllRewards({ stakeToken, sender, }: RewardsDistributorClaimAllRewardsParams): PopulatedTransaction;
    claimSelectedRewards({ stakeToken, rewards, sender, }: RewardsDistributorClaimSelectedRewardsParams): PopulatedTransaction;
}
export {};
//# sourceMappingURL=RewardsDistributor.d.ts.map