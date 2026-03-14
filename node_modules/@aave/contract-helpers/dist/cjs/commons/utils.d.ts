import { PopulatedTransaction } from 'ethers';
import { GasRecommendationType, transactionType } from './types';
export declare const valueToWei: (value: string, decimals: number) => string;
export declare const canBeEnsAddress: (ensAddress: string) => boolean;
export declare const decimalsToCurrencyUnits: (value: string, decimals: number) => string;
export declare const getTxValue: (reserve: string, amount: string) => string;
export declare const DEFAULT_NULL_VALUE_ON_TX: string;
export declare const DEFAULT_APPROVE_AMOUNT: string;
export declare const MAX_UINT_AMOUNT = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
export declare const SUPER_BIG_ALLOWANCE_NUMBER = "11579208923731619542357098500868790785326998466564056403945758400791";
export declare const API_ETH_MOCK_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export declare const uniswapEthAmount = "0.1";
export declare const SURPLUS = "0.05";
export declare const gasLimitRecommendations: GasRecommendationType;
export declare const mintAmountsPerToken: Record<string, string>;
export declare const augustusToAmountOffsetFromCalldata: (calldata: string) => number;
export declare const convertPopulatedTx: (tx: transactionType) => PopulatedTransaction;
export declare const makePair: (id: string) => {
    privateKey: string;
    address: string;
};
export declare const DEFAULT_MOCK_VERIFYING_CONTRACT = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC";
export declare const generateEIP712PermitMock: (owner: string, spender: string, amount: string, deadline: string) => {
    domain: {
        name: string;
        version: string;
        chainId: number;
        verifyingContract: string;
    };
    types: {
        Permit: {
            name: string;
            type: string;
        }[];
    };
    value: {
        owner: string;
        spender: string;
        value: string;
        nonce: string;
        deadline: string;
    };
};
export declare function expectToBeDefined<T>(value: T | undefined): asserts value is T;
//# sourceMappingURL=utils.d.ts.map