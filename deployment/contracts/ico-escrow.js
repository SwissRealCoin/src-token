/**
 * Deployment script for Rinkeby and MainNet
 */

import {logger as log} from '../../tools/lib/logger';
import ethereumjsAbi from 'ethereumjs-abi';
import cnfNetworks from '../../config/networks.json';
import cnfContract from '../../config/contract-ico-escrow.json';
import * as mtnCrowdsaleModule from '../../build/bundle/MtnCrowdsale.sol.js';
import Web3 from 'web3';

const network           = process.env.NODE_ENV;
const subEsDom          = network === 'rinkeby' ? 'rinkeby.' : '';
const provider          = `http://${cnfNetworks.networks[network].host}:${cnfNetworks.networks[network].port}`;
const web3              = new Web3(new Web3.providers.HttpProvider(provider));
const abi               = mtnCrowdsaleModule.MtnCrowdsaleAbi;
const bin               = mtnCrowdsaleModule.MtnCrowdsaleByteCode;
const startTime         = cnfContract.startTime;
const endTime           = cnfContract.endTime;
const usdPerEth         = cnfContract.usdPerEth;
const from              = cnfContract.networks[network].from;
const wallet            = cnfContract.networks[network].wallet;
const beneficiaryWallet = cnfContract.networks[network].beneficiaryWallet;

log.info(`[ ${network} ]`);

/**
 * Deployment procedure
 * @returns {void}
 */
async function deploy() {
    const mtnCrowdsaleContract  = new web3.eth.Contract(
        abi,
        null,
        {
            data:       bin,
            from:       from,
            gas:        cnfNetworks.networks[network].gas,
            gasPrice:   cnfNetworks.networks[network].gasPrice
        }
    );

    const mtnCrowdsaleInstance = await mtnCrowdsaleContract.deploy({
        data: bin,
        arguments: [
            startTime,
            endTime,
            usdPerEth,
            wallet,
            beneficiaryWallet
        ]
    }).send({
        gas:        cnfNetworks.networks[network].gas,
        gasPrice:   cnfNetworks.networks[network].gasPrice,
        from: from
    }).catch((error) => {
        log.error('Exception thrown:');
        log.error(error);
    });

    mtnCrowdsaleContract.options.address = mtnCrowdsaleInstance.options.address;
    log.info(`From: https://${subEsDom}etherscan.io/address/${from}`);
    log.info(`MtnCrowdsale: https://${subEsDom}etherscan.io/address/${mtnCrowdsaleContract.options.address}`);
}

/**
 * ABIencode constructor parameters for contract verification
 *
 * @returns {void}
 */
function getAbi() {
    const parameterTypes    = ['uint256', 'uint256', 'uint256', 'address', 'address'];
    const parameterValues   = [startTime, endTime, usdPerEth, wallet, beneficiaryWallet];
    const encoded           = ethereumjsAbi.rawEncode(parameterTypes, parameterValues);

    log.info('------------------------------------------------------');
    log.info('ABI encoded contructor parameters for MtnCrowdsale:');
    log.info(encoded.toString('hex'));
    log.info('------------------------------------------------------');
}

/**
 * Sanity check and start deployment
 */
(async () => {
    if (process.env.NODE_ENV !== 'rinkeby' && process.env.NODE_ENV !== 'mainnet') {
        log.error('Network for deployment not found');
        process.exit(1);
    } else {
        await deploy();
        getAbi();
    }
})();
