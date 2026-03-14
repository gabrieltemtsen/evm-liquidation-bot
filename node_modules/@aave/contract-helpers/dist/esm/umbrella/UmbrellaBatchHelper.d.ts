import { SignatureLike } from '@ethersproject/bytes';
import { DefinedPopulatedTransaction } from '../commons/types';
interface BatchHelperBaseParams {
    sender: string;
    stakeToken: string;
    amount: string;
    edgeToken: string;
}
interface BatchHelperPermitParams {
    deadline: string;
    permit: SignatureLike;
}
declare type UmbrellaBatchHelperDepositParams = BatchHelperBaseParams;
declare type UmbrellaBatchHelperDepositWithPermitParams = BatchHelperBaseParams & BatchHelperPermitParams;
declare type UmbrellaBatchHelperRedeemParams = BatchHelperBaseParams;
declare type UmbrellaBatchHelperRedeemWithPermitParams = BatchHelperBaseParams & BatchHelperPermitParams;
export declare class UmbrellaBatchHelperService {
    private readonly umbrellaBatchHelperAddress;
    private readonly interface;
    constructor(umbrellaBatchHelperAddress: string);
    deposit({ sender, stakeToken, amount, edgeToken, }: UmbrellaBatchHelperDepositParams): DefinedPopulatedTransaction;
    depositWithPermit({ sender, edgeToken, stakeToken, amount, deadline, permit, }: UmbrellaBatchHelperDepositWithPermitParams): DefinedPopulatedTransaction;
    redeem({ sender, stakeToken, amount, edgeToken, }: UmbrellaBatchHelperRedeemParams): DefinedPopulatedTransaction;
    redeemWithPermit({ sender, edgeToken, stakeToken, amount, deadline, permit, }: UmbrellaBatchHelperRedeemWithPermitParams): DefinedPopulatedTransaction;
}
export {};
//# sourceMappingURL=UmbrellaBatchHelper.d.ts.map