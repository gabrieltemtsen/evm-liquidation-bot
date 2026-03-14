import { splitSignature } from '@ethersproject/bytes';
import { BigNumber } from 'ethers';
import { ProtocolAction } from '../commons/types';
import { gasLimitRecommendations } from '../commons/utils';
import { UmbrellaBatchHelper__factory } from './typechain/UmbrellaBatchHelper__factory';
export class UmbrellaBatchHelperService {
    constructor(umbrellaBatchHelperAddress) {
        this.umbrellaBatchHelperAddress = umbrellaBatchHelperAddress;
        this.interface = UmbrellaBatchHelper__factory.createInterface();
    }
    deposit({ sender, stakeToken, amount, edgeToken, }) {
        const txData = this.interface.encodeFunctionData('deposit', [
            {
                edgeToken,
                stakeToken,
                value: amount,
            },
        ]);
        const data = txData;
        const from = sender;
        const to = this.umbrellaBatchHelperAddress;
        const gasLimit = BigNumber.from(gasLimitRecommendations[ProtocolAction.umbrellaStakeGatewayStake]
            .recommended);
        const tx = {
            data,
            from,
            to,
            gasLimit,
        };
        return tx;
    }
    depositWithPermit({ sender, edgeToken, stakeToken, amount, deadline, permit, }) {
        const signature = splitSignature(permit);
        const permitTxData = this.interface.encodeFunctionData('permit', [
            {
                token: edgeToken,
                value: amount,
                deadline,
                v: signature.v,
                r: signature.r,
                s: signature.s,
            },
        ]);
        const { data: depositTxData } = this.deposit({
            sender,
            stakeToken,
            amount,
            edgeToken,
        });
        const txData = this.interface.encodeFunctionData('multicall', [
            [permitTxData, depositTxData],
        ]);
        const data = txData;
        const from = sender;
        const to = this.umbrellaBatchHelperAddress;
        const gasLimit = BigNumber.from(gasLimitRecommendations[ProtocolAction.umbrellaStakeGatewayStake]
            .recommended);
        const tx = {
            data,
            from,
            to,
            gasLimit,
        };
        return tx;
    }
    redeem({ sender, stakeToken, amount, edgeToken, }) {
        const txData = this.interface.encodeFunctionData('redeem', [
            {
                edgeToken,
                stakeToken,
                value: amount,
            },
        ]);
        const data = txData;
        const from = sender;
        const to = this.umbrellaBatchHelperAddress;
        const gasLimit = BigNumber.from(gasLimitRecommendations[ProtocolAction.umbrellaStakeGatewayRedeem]
            .recommended);
        const tx = {
            data,
            from,
            to,
            gasLimit,
        };
        return tx;
    }
    redeemWithPermit({ sender, edgeToken, stakeToken, amount, deadline, permit, }) {
        const signature = splitSignature(permit);
        const permitTxData = this.interface.encodeFunctionData('permit', [
            {
                token: edgeToken,
                value: amount,
                deadline,
                v: signature.v,
                r: signature.r,
                s: signature.s,
            },
        ]);
        const { data: redeemTxData } = this.redeem({
            sender,
            stakeToken,
            amount,
            edgeToken,
        });
        const txData = this.interface.encodeFunctionData('multicall', [
            [permitTxData, redeemTxData],
        ]);
        const data = txData;
        const from = sender;
        const to = this.umbrellaBatchHelperAddress;
        const gasLimit = BigNumber.from(gasLimitRecommendations[ProtocolAction.umbrellaStakeGatewayStake]
            .recommended);
        const tx = {
            data,
            from,
            to,
            gasLimit,
        };
        return tx;
    }
}
//# sourceMappingURL=UmbrellaBatchHelper.js.map