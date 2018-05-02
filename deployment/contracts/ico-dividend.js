/**
 * Deployment script for Rinkeby and MainNet
 */

import {logger as log} from '../../tools/lib/logger';
import ethereumjsAbi from 'ethereumjs-abi';
import cnfNetworks from '../../config/networks.json';
import cnfContract from '../../config/contract-ico-dividend.json';
import * as icoCrowdsaleModule from '../../build/bundle/IcoCrowdsale.sol.js';
import Web3 from 'web3';

const network               = process.env.NODE_ENV;
const subEsDom              = network === 'rinkeby' ? 'rinkeby.' : '';
const provider              = `http://${cnfNetworks.networks[network].host}:${cnfNetworks.networks[network].port}`;
const web3                  = new Web3(new Web3.providers.HttpProvider(provider));
const abi                   = icoCrowdsaleModule.IcoCrowdsaleAbi;
const bin                   = icoCrowdsaleModule.IcoCrowdsaleByteCode;
const from                  = cnfContract.networks[network].from;
const wallet                = cnfContract.networks[network].wallet;
const underwriter           = cnfContract.networks[network].underwriter;
const startTime             = cnfContract.startTime;
const endTime               = cnfContract.endTime;
const rateChfPerEth         = cnfContract.rateChfPerEth;
const confirmationPeriod    = cnfContract.confirmationPeriod;

log.info(`[ ${network} ]`);

/**
 * Deployment procedure
 * @returns {void}
 */
async function deploy() {
    const icoCrowdsaleContract  = new web3.eth.Contract(
        abi,
        null,
        {
            data:       bin,
            from:       from,
            gas:        cnfNetworks.networks[network].gas,
            gasPrice:   cnfNetworks.networks[network].gasPrice
        }
    );

    const icoCrowdsaleInstance = await icoCrowdsaleContract.deploy({
        data: bin,
        arguments: [
            startTime,
            endTime,
            rateChfPerEth,
            wallet,
            confirmationPeriod,
            underwriter
        ]
    }).send({
        gas:        cnfNetworks.networks[network].gas,
        gasPrice:   cnfNetworks.networks[network].gasPrice,
        from: from
    }).catch((error) => {
        log.error('Exception thrown:');
        log.error(error);
    });

    icoCrowdsaleContract.options.address = icoCrowdsaleInstance.options.address;
    log.info(`From: https://${subEsDom}etherscan.io/address/${from}`);
    log.info(`IcoCrowdsale: https://${subEsDom}etherscan.io/address/${icoCrowdsaleContract.options.address}`);
}

/**
 * ABIencode constructor parameters for contract verification
 *
 * @returns {void}
 */
function getAbi() {
    const parameterTypes    = ['uint256', 'uint256', 'uint256', 'address', 'uint256', 'address'];
    const parameterValues   = [startTime, endTime, rateChfPerEth, wallet, confirmationPeriod, underwriter];
    const encoded           = ethereumjsAbi.rawEncode(parameterTypes, parameterValues);

    log.info('------------------------------------------------------');
    log.info('ABI encoded contructor parameters for IcoCrowdsale:');
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
