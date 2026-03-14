import { StakeDataProvider__factory } from './typechain/StakeDataProvider__factory';
export class StakeDataProviderService {
    constructor(stakeDataProviderAddress, provider) {
        this._contract = StakeDataProvider__factory.connect(stakeDataProviderAddress, provider);
    }
    async getStakeData() {
        const result = await this._contract.getStakeData();
        return result;
    }
    async getUserStakeData(user) {
        const result = await this._contract.getUserStakeData(user);
        return result;
    }
    async getStakeDataHumanized() {
        const result = await this.getStakeData();
        return result.map(r => ({
            tokenAddress: r.tokenAddress,
            name: r.name,
            symbol: r.symbol,
            price: r.price.toString(),
            totalAssets: r.totalAssets.toString(),
            targetLiquidity: r.targetLiquidity.toString(),
            underlyingTokenAddress: r.underlyingTokenAddress,
            underlyingTokenName: r.underlyingTokenName,
            underlyingTokenSymbol: r.underlyingTokenSymbol,
            underlyingTokenDecimals: r.underlyingTokenDecimals,
            cooldownSeconds: r.cooldownSeconds.toNumber(),
            unstakeWindowSeconds: r.unstakeWindowSeconds.toNumber(),
            underlyingIsStataToken: r.underlyingIsStataToken,
            stataTokenData: {
                asset: r.stataTokenData.asset,
                assetName: r.stataTokenData.assetName,
                assetSymbol: r.stataTokenData.assetSymbol,
                aToken: r.stataTokenData.aToken,
                aTokenName: r.stataTokenData.aTokenName,
                aTokenSymbol: r.stataTokenData.aTokenSymbol,
            },
            rewards: r.rewards.map(reward => ({
                rewardAddress: reward.rewardAddress,
                rewardName: reward.rewardName,
                rewardSymbol: reward.rewardSymbol,
                price: reward.price.toString(),
                decimals: reward.decimals,
                index: reward.index.toString(),
                maxEmissionPerSecond: reward.maxEmissionPerSecond.toString(),
                distributionEnd: reward.distributionEnd.toString(),
                currentEmissionPerSecond: reward.currentEmissionPerSecond.toString(),
                apy: reward.apy.toString(),
            })),
        }));
    }
    async getUserStakeDataHumanized(user) {
        const result = await this.getUserStakeData(user);
        return result.map(r => ({
            stakeToken: r.stakeToken,
            stakeTokenName: r.stakeTokenName,
            balances: {
                stakeTokenBalance: r.balances.stakeTokenBalance.toString(),
                stakeTokenRedeemableAmount: r.balances.stakeTokenRedeemableAmount.toString(),
                underlyingTokenBalance: r.balances.underlyingTokenBalance.toString(),
                stataTokenAssetBalance: r.balances.stataTokenAssetBalance.toString(),
                stataTokenATokenBalance: r.balances.stataTokenATokenBalance.toString(),
            },
            cooldown: {
                cooldownAmount: r.cooldown.cooldownAmount.toString(),
                endOfCooldown: r.cooldown.endOfCooldown,
                withdrawalWindow: r.cooldown.withdrawalWindow,
            },
            rewards: r.rewards.map((reward, index) => ({
                rewardAddress: reward,
                accrued: r.rewardsAccrued[index].toString(),
            })),
        }));
    }
}
//# sourceMappingURL=StakeDataProvider.js.map