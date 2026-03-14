import { Signer } from 'ethers';
import type { Provider } from '@ethersproject/providers';
import type { IRewardsDistributor, IRewardsDistributorInterface } from './IRewardsDistributor';
export declare class IRewardsDistributor__factory {
    static readonly abi: readonly [{
        readonly type: "function";
        readonly name: "claimAllRewards";
        readonly inputs: readonly [{
            readonly name: "asset";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "receiver";
            readonly type: "address";
            readonly internalType: "address";
        }];
        readonly outputs: readonly [{
            readonly name: "rewards";
            readonly type: "address[]";
            readonly internalType: "address[]";
        }, {
            readonly name: "amounts";
            readonly type: "uint256[]";
            readonly internalType: "uint256[]";
        }];
        readonly stateMutability: "nonpayable";
    }, {
        readonly type: "function";
        readonly name: "claimAllRewards";
        readonly inputs: readonly [{
            readonly name: "assets";
            readonly type: "address[]";
            readonly internalType: "address[]";
        }, {
            readonly name: "receiver";
            readonly type: "address";
            readonly internalType: "address";
        }];
        readonly outputs: readonly [{
            readonly name: "rewards";
            readonly type: "address[][]";
            readonly internalType: "address[][]";
        }, {
            readonly name: "amounts";
            readonly type: "uint256[][]";
            readonly internalType: "uint256[][]";
        }];
        readonly stateMutability: "nonpayable";
    }, {
        readonly type: "function";
        readonly name: "claimAllRewardsOnBehalf";
        readonly inputs: readonly [{
            readonly name: "assets";
            readonly type: "address[]";
            readonly internalType: "address[]";
        }, {
            readonly name: "user";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "receiver";
            readonly type: "address";
            readonly internalType: "address";
        }];
        readonly outputs: readonly [{
            readonly name: "rewards";
            readonly type: "address[][]";
            readonly internalType: "address[][]";
        }, {
            readonly name: "amounts";
            readonly type: "uint256[][]";
            readonly internalType: "uint256[][]";
        }];
        readonly stateMutability: "nonpayable";
    }, {
        readonly type: "function";
        readonly name: "claimAllRewardsOnBehalf";
        readonly inputs: readonly [{
            readonly name: "asset";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "user";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "receiver";
            readonly type: "address";
            readonly internalType: "address";
        }];
        readonly outputs: readonly [{
            readonly name: "rewards";
            readonly type: "address[]";
            readonly internalType: "address[]";
        }, {
            readonly name: "amounts";
            readonly type: "uint256[]";
            readonly internalType: "uint256[]";
        }];
        readonly stateMutability: "nonpayable";
    }, {
        readonly type: "function";
        readonly name: "claimAllRewardsPermit";
        readonly inputs: readonly [{
            readonly name: "asset";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "user";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "receiver";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "deadline";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }, {
            readonly name: "sig";
            readonly type: "tuple";
            readonly internalType: "struct IRewardsStructs.SignatureParams";
            readonly components: readonly [{
                readonly name: "v";
                readonly type: "uint8";
                readonly internalType: "uint8";
            }, {
                readonly name: "r";
                readonly type: "bytes32";
                readonly internalType: "bytes32";
            }, {
                readonly name: "s";
                readonly type: "bytes32";
                readonly internalType: "bytes32";
            }];
        }];
        readonly outputs: readonly [{
            readonly name: "rewards";
            readonly type: "address[]";
            readonly internalType: "address[]";
        }, {
            readonly name: "amounts";
            readonly type: "uint256[]";
            readonly internalType: "uint256[]";
        }];
        readonly stateMutability: "nonpayable";
    }, {
        readonly type: "function";
        readonly name: "claimSelectedRewards";
        readonly inputs: readonly [{
            readonly name: "assets";
            readonly type: "address[]";
            readonly internalType: "address[]";
        }, {
            readonly name: "rewards";
            readonly type: "address[][]";
            readonly internalType: "address[][]";
        }, {
            readonly name: "receiver";
            readonly type: "address";
            readonly internalType: "address";
        }];
        readonly outputs: readonly [{
            readonly name: "";
            readonly type: "uint256[][]";
            readonly internalType: "uint256[][]";
        }];
        readonly stateMutability: "nonpayable";
    }, {
        readonly type: "function";
        readonly name: "claimSelectedRewards";
        readonly inputs: readonly [{
            readonly name: "asset";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "rewards";
            readonly type: "address[]";
            readonly internalType: "address[]";
        }, {
            readonly name: "receiver";
            readonly type: "address";
            readonly internalType: "address";
        }];
        readonly outputs: readonly [{
            readonly name: "amounts";
            readonly type: "uint256[]";
            readonly internalType: "uint256[]";
        }];
        readonly stateMutability: "nonpayable";
    }, {
        readonly type: "function";
        readonly name: "claimSelectedRewardsOnBehalf";
        readonly inputs: readonly [{
            readonly name: "asset";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "rewards";
            readonly type: "address[]";
            readonly internalType: "address[]";
        }, {
            readonly name: "user";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "receiver";
            readonly type: "address";
            readonly internalType: "address";
        }];
        readonly outputs: readonly [{
            readonly name: "amounts";
            readonly type: "uint256[]";
            readonly internalType: "uint256[]";
        }];
        readonly stateMutability: "nonpayable";
    }, {
        readonly type: "function";
        readonly name: "claimSelectedRewardsOnBehalf";
        readonly inputs: readonly [{
            readonly name: "assets";
            readonly type: "address[]";
            readonly internalType: "address[]";
        }, {
            readonly name: "rewards";
            readonly type: "address[][]";
            readonly internalType: "address[][]";
        }, {
            readonly name: "user";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "receiver";
            readonly type: "address";
            readonly internalType: "address";
        }];
        readonly outputs: readonly [{
            readonly name: "";
            readonly type: "uint256[][]";
            readonly internalType: "uint256[][]";
        }];
        readonly stateMutability: "nonpayable";
    }, {
        readonly type: "function";
        readonly name: "claimSelectedRewardsPermit";
        readonly inputs: readonly [{
            readonly name: "asset";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "rewards";
            readonly type: "address[]";
            readonly internalType: "address[]";
        }, {
            readonly name: "user";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "receiver";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "deadline";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }, {
            readonly name: "sig";
            readonly type: "tuple";
            readonly internalType: "struct IRewardsStructs.SignatureParams";
            readonly components: readonly [{
                readonly name: "v";
                readonly type: "uint8";
                readonly internalType: "uint8";
            }, {
                readonly name: "r";
                readonly type: "bytes32";
                readonly internalType: "bytes32";
            }, {
                readonly name: "s";
                readonly type: "bytes32";
                readonly internalType: "bytes32";
            }];
        }];
        readonly outputs: readonly [{
            readonly name: "amounts";
            readonly type: "uint256[]";
            readonly internalType: "uint256[]";
        }];
        readonly stateMutability: "nonpayable";
    }, {
        readonly type: "function";
        readonly name: "setClaimer";
        readonly inputs: readonly [{
            readonly name: "claimer";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "flag";
            readonly type: "bool";
            readonly internalType: "bool";
        }];
        readonly outputs: readonly [];
        readonly stateMutability: "nonpayable";
    }, {
        readonly type: "function";
        readonly name: "setClaimer";
        readonly inputs: readonly [{
            readonly name: "user";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "claimer";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "flag";
            readonly type: "bool";
            readonly internalType: "bool";
        }];
        readonly outputs: readonly [];
        readonly stateMutability: "nonpayable";
    }, {
        readonly type: "event";
        readonly name: "ClaimerSet";
        readonly inputs: readonly [{
            readonly name: "user";
            readonly type: "address";
            readonly indexed: true;
            readonly internalType: "address";
        }, {
            readonly name: "claimer";
            readonly type: "address";
            readonly indexed: true;
            readonly internalType: "address";
        }, {
            readonly name: "caller";
            readonly type: "address";
            readonly indexed: true;
            readonly internalType: "address";
        }, {
            readonly name: "flag";
            readonly type: "bool";
            readonly indexed: false;
            readonly internalType: "bool";
        }];
        readonly anonymous: false;
    }, {
        readonly type: "error";
        readonly name: "ClaimerNotAuthorized";
        readonly inputs: readonly [{
            readonly name: "claimer";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "user";
            readonly type: "address";
            readonly internalType: "address";
        }];
    }, {
        readonly type: "error";
        readonly name: "ExpiredSignature";
        readonly inputs: readonly [{
            readonly name: "deadline";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }];
    }, {
        readonly type: "error";
        readonly name: "InvalidSigner";
        readonly inputs: readonly [{
            readonly name: "signer";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "owner";
            readonly type: "address";
            readonly internalType: "address";
        }];
    }, {
        readonly type: "error";
        readonly name: "LengthsDontMatch";
        readonly inputs: readonly [];
    }, {
        readonly type: "error";
        readonly name: "ZeroAddress";
        readonly inputs: readonly [];
    }];
    static createInterface(): IRewardsDistributorInterface;
    static connect(address: string, signerOrProvider: Signer | Provider): IRewardsDistributor;
}
//# sourceMappingURL=IRewardsDistributor__factory.d.ts.map