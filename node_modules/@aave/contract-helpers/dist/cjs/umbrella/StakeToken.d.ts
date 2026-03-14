import { SignatureLike } from '@ethersproject/bytes';
import { PopulatedTransaction } from 'ethers';
interface StakeTokenCooldownParams {
    sender: string;
}
interface StakeTokenDepositParams {
    amount: string;
    sender: string;
}
interface StakeTokenDepositWithPermitParams {
    amount: string;
    deadline: string;
    permit: SignatureLike;
    sender: string;
}
interface StakeTokenRedeemParams {
    amount: string;
    sender: string;
}
export declare class StakeTokenService {
    private readonly stakeTokenAddress;
    private readonly interface;
    constructor(stakeTokenAddress: string);
    cooldown({ sender }: StakeTokenCooldownParams): PopulatedTransaction;
    deposit({ amount, sender }: StakeTokenDepositParams): PopulatedTransaction;
    depositWithPermit({ amount, deadline, permit, sender, }: StakeTokenDepositWithPermitParams): PopulatedTransaction;
    redeem({ amount, sender }: StakeTokenRedeemParams): PopulatedTransaction;
}
export {};
//# sourceMappingURL=StakeToken.d.ts.map