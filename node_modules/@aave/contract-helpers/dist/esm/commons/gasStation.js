import { BigNumber } from 'ethers';
import { ChainId } from './types';
const DEFAULT_SURPLUS = 30; // 30%
// polygon gas estimation is very off for some reason
const POLYGON_SURPLUS = 60; // 60%
export const estimateGas = async (tx, provider, gasSurplus) => {
    const estimatedGas = await provider.estimateGas(tx);
    return estimatedGas.add(estimatedGas.mul(gasSurplus !== null && gasSurplus !== void 0 ? gasSurplus : DEFAULT_SURPLUS).div(100));
};
export const estimateGasByNetwork = async (tx, provider, gasSurplus) => {
    const providerNework = await provider.getNetwork();
    if (providerNework.chainId === ChainId.zksync && tx.from) {
        /**
         *  Trying to estimate gas on zkSync when connected with a smart contract address
         *  will fail. In that case, we'll just return a default value for all transactions.
         *
         *  See here for more details: https://github.com/zkSync-Community-Hub/zksync-developers/discussions/144
         */
        const data = await provider.getCode(tx.from);
        if (data !== '0x') {
            return BigNumber.from(350000);
        }
    }
    const estimatedGas = await provider.estimateGas(tx);
    if (providerNework.chainId === ChainId.polygon) {
        return estimatedGas.add(estimatedGas.mul(POLYGON_SURPLUS).div(100));
    }
    return estimatedGas.add(estimatedGas.mul(gasSurplus !== null && gasSurplus !== void 0 ? gasSurplus : DEFAULT_SURPLUS).div(100));
};
//# sourceMappingURL=gasStation.js.map