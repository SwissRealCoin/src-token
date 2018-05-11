// Configs
const cnfCrowdsale  = require('../../config/contract-ico-crowdsale.json');

// Tokens
const SrcToken = artifacts.require('SrcToken');
const SrvToken = artifacts.require('SrvToken');
const WETHToken = artifacts.require('WETHToken');

// ICO
const SrcCrowdsale = artifacts.require('SrcCrowdsale');

// Voting
const LiquidationVoting = artifacts.require('LiquidationVoting');

// Liduidation
const Liquidator = artifacts.require('Liquidator');

module.exports = async (deployer, network, accounts) => {
    if (network === 'rinkeby' || network === 'mainnet') {
        console.log('Truffle migration is for local dev environment only!');
        console.log('For TestNet / MeinNet deployment, please use the provided NPM run scripts');
        process.exit(1);
    }

    // @see `/contracts/config/contract-ico-crowdsale.json` for using config params from here
    const startTime = cnfCrowdsale.startTimeTesting;
    const endTime   = cnfCrowdsale.endTimeTesting;
    const rate      = cnfCrowdsale.rateChfPerEth;

    // const owner     = accounts[0];
    const wallet    = accounts[6];
    const notary    = accounts[9];

    let srcCrowdsaleAddress;
    let srcTokenAddress;
    let wethTokenAddress;

    deployer.deploy(SrcToken)
        .then(() => {
            return SrcToken.deployed().then((srcTokenInstance) => {
                srcTokenAddress = srcTokenInstance.address;
                console.log('[ srcTokenInstance.address ]: ' + srcTokenAddress);
                // function SrcCrowdsale(uint256 _startTime, uint256 _endTime, uint256 _rateChfPerEth, address _wallet, address _token
                return deployer.deploy(SrcCrowdsale, startTime, endTime, rate, wallet, srcTokenAddress).then(() => {
                    return SrcCrowdsale.deployed().then((srcCrowdsaleInstance) => {
                        srcCrowdsaleAddress = srcCrowdsaleInstance.address;
                        return deployer.deploy(WETHToken).then(() => {
                            return WETHToken.deployed().then((wethTokenInstance) => {
                                wethTokenAddress = wethTokenInstance.address;
                                console.log('[ wethTokenInstance.address ]: ' + wethTokenAddress);
                                // LiquidationVoting(address _notary, MiniMeTokenInterface _token)
                                return deployer.deploy(LiquidationVoting, notary, srcTokenAddress, srcCrowdsaleAddress).then(() => {
                                    return LiquidationVoting.deployed().then((liquidationVotingInstance) => {
                                        console.log('[ liquidationVotingInstance.address ]: ' + liquidationVotingInstance.address);
                                        // Liquidator (ERC20 _srcTokenAddress, address _swissVotingContract, ERC20 _payoutToken)
                                        return deployer.deploy(Liquidator, srcTokenAddress, LiquidationVoting.address, wethTokenAddress).then(() => {
                                            return Liquidator.deployed().then((liquidatorInstance) => {
                                                console.log('[ liquidatorInstance.address ]: ' + liquidatorInstance.address);
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });

    deployer.deploy(SrvToken);
    deployer.deploy(WETHToken);
};
