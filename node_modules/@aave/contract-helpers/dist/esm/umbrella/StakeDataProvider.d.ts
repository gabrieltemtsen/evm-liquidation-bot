import { providers } from 'ethers';
export interface StakeData {
    tokenAddress: string;
    name: string;
    symbol: string;
    price: string;
    totalAssets: string;
    targetLiquidity: string;
    underlyingTokenAddress: string;
    underlyingTokenName: string;
    underlyingTokenSymbol: string;
    underlyingTokenDecimals: number;
    cooldownSeconds: number;
    unstakeWindowSeconds: number;
    underlyingIsStataToken: boolean;
    stataTokenData: StataTokenData;
    rewards: Reward[];
}
export interface StataTokenData {
    asset: string;
    assetName: string;
    assetSymbol: string;
    aToken: string;
    aTokenName: string;
    aTokenSymbol: string;
}
export interface Reward {
    rewardAddress: string;
    rewardName: string;
    rewardSymbol: string;
    price: string;
    decimals: number;
    index: string;
    maxEmissionPerSecond: string;
    distributionEnd: string;
    currentEmissionPerSecond: string;
    apy: string;
}
export interface StakeUserData {
    stakeToken: string;
    stakeTokenName: string;
    balances: StakeUserBalances;
    cooldown: StakeUserCooldown;
    rewards: UserRewards[];
}
export interface StakeUserBalances {
    stakeTokenBalance: string;
    stakeTokenRedeemableAmount: string;
    underlyingTokenBalance: string;
    stataTokenAssetBalance: string;
    stataTokenATokenBalance: string;
}
export interface StakeUserCooldown {
    cooldownAmount: string;
    endOfCooldown: number;
    withdrawalWindow: number;
}
export interface UserRewards {
    rewardAddress: string;
    accrued: string;
}
export declare class StakeDataProviderService {
    private readonly _contract;
    constructor(stakeDataProviderAddress: string, provider: providers.Provider);
    getStakeData(): Promise<import("./typechain/StakeDataProvider").StakeDataStructOutput[]>;
    getUserStakeData(user: string): Promise<import("./typechain/StakeDataProvider").StakeUserDataStructOutput[]>;
    getStakeDataHumanized(): Promise<StakeData[]>;
    getUserStakeDataHumanized(user: string): Promise<StakeUserData[]>;
}
//# sourceMappingURL=StakeDataProvider.d.ts.map