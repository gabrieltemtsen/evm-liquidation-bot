import { splitSignature } from '@ethersproject/bytes';
import { BigNumber } from 'ethers';
import { ProtocolAction } from '../commons/types';
import { gasLimitRecommendations } from '../commons/utils';
import { IERC4626StakeToken__factory } from './typechain/StakeToken__factory';
export class StakeTokenService {
    constructor(stakeTokenAddress) {
        this.stakeTokenAddress = stakeTokenAddress;
        this.interface = IERC4626StakeToken__factory.createInterface();
    }
    cooldown({ sender }) {
        const tx = {};
        const txData = this.interface.encodeFunctionData('cooldown');
        tx.data = txData;
        tx.from = sender;
        tx.to = this.stakeTokenAddress;
        tx.gasLimit = BigNumber.from(gasLimitRecommendations[ProtocolAction.umbrellaStakeTokenCooldown]
            .recommended);
        return tx;
    }
    deposit({ amount, sender }) {
        const tx = {};
        const receiver = sender;
        const txData = this.interface.encodeFunctionData('deposit', [
            amount,
            receiver,
        ]);
        tx.data = txData;
        tx.from = sender;
        tx.to = this.stakeTokenAddress;
        tx.gasLimit = BigNumber.from(gasLimitRecommendations[ProtocolAction.umbrellaStakeTokenDeposit]
            .recommended);
        return tx;
    }
    depositWithPermit({ amount, deadline, permit, sender, }) {
        const tx = {};
        const signature = splitSignature(permit);
        const receiver = sender;
        const txData = this.interface.encodeFunctionData('depositWithPermit', [
            amount,
            receiver,
            deadline,
            { v: signature.v, r: signature.r, s: signature.s },
        ]);
        tx.data = txData;
        tx.from = sender;
        tx.to = this.stakeTokenAddress;
        tx.gasLimit = BigNumber.from(gasLimitRecommendations[ProtocolAction.umbrellaStakeTokenDepositWithPermit].recommended);
        return tx;
    }
    redeem({ amount, sender }) {
        const tx = {};
        const receiver = sender;
        const owner = sender;
        const txData = this.interface.encodeFunctionData('redeem', [
            amount,
            receiver,
            owner,
        ]);
        tx.data = txData;
        tx.from = sender;
        tx.to = this.stakeTokenAddress;
        tx.gasLimit = BigNumber.from(gasLimitRecommendations[ProtocolAction.umbrellaStakeTokenRedeem]
            .recommended);
        return tx;
    }
}
//# sourceMappingURL=StakeToken.js.map