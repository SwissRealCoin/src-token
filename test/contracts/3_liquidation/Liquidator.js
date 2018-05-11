/**
 * Test for SwissRealCoin Liquidator contract
 *
 * @author Validity Labs AG <info@validitylabs.org>
 */

import {expectThrow, waitNDays, getEvents, BigNumber, cnf, increaseTimeTo} from '../../helpers/tools';
import {logger as log} from '../../../tools/lib/logger';

const Liquidator        = artifacts.require('./Liquidator');
const LiquidationVoting = artifacts.require('./LiquidationVoting');
const LiquidatorWallet  = artifacts.require('./LiquidationWallet');
const SrcToken          = artifacts.require('./SrcToken');
const SrvToken          = artifacts.require('./SrvToken');
const WETHToken         = artifacts.require('./WETHToken');

const should = require('chai') // eslint-disable-line
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

/**
 * Liquidator contract
 */
contract('Liquidator', (accounts) => {
    const owner             = accounts[0];
    const activeManager     = accounts[1];
    const inactiveManager   = accounts[2];
    const activeInvestor1   = accounts[3];
    const activeInvestor2   = accounts[4];
    const activeInvestor3   = accounts[5];
    const inactiveInvestor1 = accounts[6];
    const inactiveInvestor2 = accounts[7];
    const inactiveInvestor3 = accounts[8];
    const notary            = accounts[9];

    const rate = 10;
    const unclaimedRate = 5;

    let liquidatorInstance;
    let liquidationVotingInstance;
    let icoTokenAddress
    let icoTokenInstance;
    let voucherTokenAddress;
    let voucherTokenInstance;
    let liquidationWalletAddress
    let liquidationWalletInstance;
    let payoutTokenAddress;
    let payoutTokenInstance;

    const startTime = 1575158400;

    const oneDay = 86400;
    const startTimes = [1669852800, 1701388800, 1733011200]; // 2022 - 2024

    const rate = 10;
    const unclaimedRate = 5;

    // const votingPeriod = duration.days(23);

    // enum Stages 0 = LockOutPeriod, 1 = PendingVoting, 2 = AcceptingVotes, 3 = PendingResult, 4 = VotePassed

    // Provide an instance for every test case
    let liquidatorAddress;
    let liquidatorInstance;
    let liquidationVotingInstance;
    let icoTokenAddress;
    let icoTokenInstance;
    let voucherTokenAddress;
    let voucherTokenInstance;
    let liquidationWalletAddress;
    let liquidationWalletInstance;
    let payoutTokenAddress;
    let payoutTokenInstance;

    before(async () => {
        liquidatorInstance = await Liquidator.deployed();
        liquidationVotingInstance = await LiquidationVoting.deployed();
        icoTokenAddress = await liquidatorInstance.srcToken();
        voucherTokenAddress = await liquidatorInstance.srvToken();
        liquidationWalletAddress = await liquidatorInstance.liquidationWallet();

        icoTokenInstance = await SrcToken.at(icoTokenAddress);
        voucherTokenInstance = await SrvToken.at(voucherTokenAddress);
        liquidationWalletInstance = await LiquidatorWallet.at(liquidationWalletAddress);

        payoutTokenAddress = await liquidationWalletInstance.token();
        payoutTokenInstance = await WETHToken.at(payoutTokenAddress);
    });

    // test deployment
    it('should fail when deploying with 0s in the params', async () => {
        console.log('[ Liquidator Deployment Test ]'.yellow);

        await expectThrow(Liquidator.new(0x0, liquidationVotingInstance.address, payoutTokenAddress));
        await expectThrow(Liquidator.new(icoTokenAddress, 0x0, payoutTokenAddress));
        await expectThrow(Liquidator.new(icoTokenAddress, liquidationVotingInstance.address, 0x0));
    });

    /**
     * [ Pre Liquidation event ]
     */

    // Setup accounts with proper tokens to test.
    it('should allocate SRC tokens to accounts for testing the Liquidator contract', async () => {
        console.log('[ SRC Token Allocation event ]'.yellow);

        await icoTokenInstance.generateTokens(activeInvestor1, 10000);
        await icoTokenInstance.generateTokens(activeInvestor2, 20000);
        await icoTokenInstance.generateTokens(activeInvestor3, 30000);

        await icoTokenInstance.generateTokens(inactiveInvestor1, 10000);
        await icoTokenInstance.generateTokens(inactiveInvestor2, 20000);
        await icoTokenInstance.generateTokens(inactiveInvestor3, 30000);

        const balance1 = await icoTokenInstance.balanceOf(activeInvestor1);
        const balance2 = await icoTokenInstance.balanceOf(activeInvestor2);
        const balance3 = await icoTokenInstance.balanceOf(activeInvestor3);

        const balance4 = await icoTokenInstance.balanceOf(inactiveInvestor1);
        const balance5 = await icoTokenInstance.balanceOf(inactiveInvestor2);
        const balance6 = await icoTokenInstance.balanceOf(inactiveInvestor3);

        assert.equal(balance1, 10000, 'balance1 !=');
        assert.equal(balance2, 20000, 'balance1 !=');
        assert.equal(balance3, 30000, 'balance1 !=');

        assert.equal(balance4, 10000, 'balance1 !=');
        assert.equal(balance5, 20000, 'balance1 !=');
        assert.equal(balance6, 30000, 'balance1 !=');

        await icoTokenInstance.enableTransfers(true);
        const transfersEnabled = await icoTokenInstance.transfersEnabled();
        assert.isTrue(transfersEnabled);
    });

    it('should allocate payout tokens to the Liquidator Wallet for withdrawals', async () => {
        let balance = await payoutTokenInstance.balanceOf(owner);
        assert.equal(balance.toNumber(), web3.toWei(100000, 'ether'), 'WETH balance not correct');

        await payoutTokenInstance.transfer(liquidationWalletAddress, web3.toWei(100000, 'ether'));

        balance = await payoutTokenInstance.balanceOf(owner);
        assert.equal(balance.toNumber(), 0, 'WETH balance not correct');

        const balance2 = await payoutTokenInstance.balanceOf(liquidationWalletAddress);
        assert.equal(balance2.toNumber(), web3.toWei(100000, 'ether'), 'WETH balance not correct');
    });

    it('should instantiate the Liquidator correctly', async () => {
        console.log('[ Pre Liquidation event ]'.yellow);

        const claimFundsDuration = await liquidatorInstance.claimFundsDuration();
        const claimUnclaimedDuration = await liquidatorInstance.claimUnclaimedDuration();
        const swissVotingContract = await liquidatorInstance.swissVotingContract();
        const currentState = await liquidatorInstance.currentState();
        const enabled = await liquidatorInstance.enabled();

        assert.equal(claimFundsDuration.toNumber(), 31536000, 'claimFundsDuration != 1 year');
        assert.equal(claimUnclaimedDuration.toNumber(), 31536000, 'claimUnclaimedDuration != 1 year');
        assert.equal(swissVotingContract, liquidationVotingInstance.address, 'swissVotingContract address != liquidationVotingInstance');
        assert.equal(currentState.toNumber(), 0, 'state is incorrect; should be 0');
        assert.equal(enabled, false, 'should be false');
    });

    it('should verify, the owner is added properly to manager accounts', async () => {
        const manager = await liquidatorInstance.isManager(owner);

        assert.isTrue(manager, 'Owner should be a manager too');
    });

    it('should set manager accounts', async () => {
        const tx1 = await liquidatorInstance.setManager(activeManager, true, {from: owner, gas: 1000000});
        const tx2 = await liquidatorInstance.setManager(inactiveManager, false, {from: owner, gas: 1000000});

        const manager1 = await liquidatorInstance.isManager(activeManager);
        const manager2 = await liquidatorInstance.isManager(inactiveManager);

        assert.isTrue(manager1, 'Manager 1 should be active');
        assert.isFalse(manager2, 'Manager 2 should be inactive');

        // Testing events
        const events1 = getEvents(tx1, 'ChangedManager');
        const events2 = getEvents(tx2, 'ChangedManager');

        assert.equal(events1[0].manager, activeManager, 'activeManager address does not match');
        assert.isTrue(events1[0].active, 'activeManager expected to be active');

        assert.equal(events2[0].manager, inactiveManager, 'inactiveManager address does not match');
        assert.isFalse(events2[0].active, 'inactiveManager expected to be inactive');
    });

    it('should alter manager accounts', async () => {
        const tx1 = await liquidatorInstance.setManager(activeManager, false, {from: owner, gas: 1000000});
        const tx2 = await liquidatorInstance.setManager(inactiveManager, true, {from: owner, gas: 1000000});

        const manager1 = await liquidatorInstance.isManager(activeManager);
        const manager2 = await liquidatorInstance.isManager(inactiveManager);

        assert.isFalse(manager1, 'Manager 1 should be inactive');
        assert.isTrue(manager2, 'Manager 2 should be active');

        // Testing events
        const events1 = getEvents(tx1, 'ChangedManager');
        const events2 = getEvents(tx2, 'ChangedManager');

        assert.isFalse(events1[0].active, 'activeManager expected to be inactive');
        assert.isTrue(events2[0].active, 'inactiveManager expected to be active');

        // Roll back to origin values
        const tx3 = await liquidatorInstance.setManager(activeManager, true, {from: owner, gas: 1000000});
        const tx4 = await liquidatorInstance.setManager(inactiveManager, false, {from: owner, gas: 1000000});

        const manager3 = await liquidatorInstance.isManager(activeManager);
        const manager4 = await liquidatorInstance.isManager(inactiveManager);

        assert.isTrue(manager3, 'Manager 1 should be active');
        assert.isFalse(manager4, 'Manager 2 should be inactive');

        const events3 = getEvents(tx3, 'ChangedManager');
        const events4 = getEvents(tx4, 'ChangedManager');

        assert.isTrue(events3[0].active, 'activeManager expected to be active');
        assert.isFalse(events4[0].active, 'inactiveManager expected to be inactive');
    });

    it('should fail, because we try to set manager from unauthorized account', async () => {
        await expectThrow(liquidatorInstance.setManager(activeManager, false, {from: activeInvestor1, gas: 1000000}));
    });

    it('should fail, because we liquidatorInstance does not accept ether', async () => {
        await expectThrow(liquidatorInstance.sendTransaction({
            from:   activeInvestor1,
            value:  web3.toWei(3, 'ether'),
            gas:    1000000}));
    });

    it('should fail, because we liquidationWalletInstance does not accept ether', async () => {
        await expectThrow(liquidationWalletInstance.sendTransaction({
            from:   activeInvestor1,
            value:  web3.toWei(3, 'ether'),
            gas:    1000000}));
    });

    it('should fail, because we try to trigger liquidation from a non manager account', async () => {
        await expectThrow(liquidatorInstance.triggerLiquidation({from: activeInvestor1, gas: 1000000}));
    });

    it('should fail, because we try to set start time on an inactive contract', async () => {
        await expectThrow(liquidatorInstance.setStartTime(startTime)); // Wednesday, January 30, 2019 12:00:00 AM
    });

    it('should fail, because we try to set rate time on an inactive contract', async () => {
        await expectThrow(liquidatorInstance.setRate(1000));
    });

    it('should fail, because we try to set unClaimedRate time on an inactive contract', async () => {
        await expectThrow(liquidatorInstance.setUnclaimedRate(1000));
    });

    it('should fail, because we try to set a ERC20 token on an inactive contract', async () => {
        await expectThrow(liquidatorInstance.setNewErc20Token(payoutTokenAddress));
    });

    it('should fail, because we try to claim funds on an inactive contract', async () => {
        await expectThrow(liquidatorInstance.claimFunds({from: activeInvestor1, gas: 1000000}));
    });

    it('should fail, because we try to claim unclaimed funds on an inactive contract', async () => {
        await expectThrow(liquidatorInstance.claimUnclaimFunds({from: activeInvestor1, gas: 1000000}));
    });

    it('should fail, because we try to claim remainder funds on an inactive contract', async () => {
        await expectThrow(liquidatorInstance.claimRemainder(inactiveManager));
    });

    it('should pass, because we try to trigger liquidation from the owner account', async () => {
        const tx = await liquidatorInstance.triggerLiquidation();
        const events = getEvents(tx, 'LiquidationTriggered');
        log.info('Triggered Liquidation ' + events[0].timestamp);
    });

    // !!! Trigger Liquidation !!!
    it('should pass, because contract is active', async () => {
        const enabled = await liquidatorInstance.enabled();
        assert.equal(enabled, true, 'should be true');
    });

    it('should fail, because contract is already triggered', async () => {
        await expectThrow(liquidatorInstance.triggerLiquidation());
    });

    it('should fail, because we try to set a 0 rate on an active contract', async () => {
        await expectThrow(liquidatorInstance.setRate(0));
    });

    it('should pass, because we try to set rate on an active contract', async () => {
        await liquidatorInstance.setRate(rate);
        const checkRate = await liquidatorInstance.rate();
        assert.equal(checkRate.toNumber(), rate, 'rate !=');
    });

    it('should pass, because we try to set a ERC20 token on an active contract', async () => {
        await liquidatorInstance.setNewErc20Token(payoutTokenAddress);
    });

    it('should fail, because we try to set a 0 setUnclaimedRate on an active contract', async () => {
        await expectThrow(liquidatorInstance.setUnclaimedRate(0));
    });

    it('should pass, because we try to set unClaimedRate time on an active contract', async () => {
        await liquidatorInstance.setUnclaimedRate(unclaimedRate);
        const checkUnclaimedRate = await liquidatorInstance.unclaimedRate();
        assert.equal(checkUnclaimedRate.toNumber(), unclaimedRate, 'unclaimedRate !=');
    });

    it('should fail, because we try to set rate time on an active contract from a non manager account', async () => {
        await expectThrow(liquidatorInstance.setRate(rate, {from: inactiveManager, gas: 1000000}));
    });

    it('should fail, because we try to set unClaimedRate time on an active contract from a non manager account', async () => {
        await expectThrow(liquidatorInstance.setUnclaimedRate(unclaimedRate, {from: inactiveManager, gas: 1000000}));
    });

    it('should fail, because we try to set a ERC20 token on an active contract from a non manager account', async () => {
        await expectThrow(liquidatorInstance.setNewErc20Token(inactiveManager, {from: inactiveManager, gas: 1000000}));
    });

    it('should pass, because we try to set start time on an inactive contract', async () => {
        await liquidatorInstance.setStartTime(startTime); // Wednesday, January 30, 2019 12:00:00 AM
    });

    it('should pass, contract in active state', async () => {
        const currentState = await liquidatorInstance.currentState();
        assert.equal(currentState.toNumber(), 1, 'state is incorrect; should be 1');
    });

    // !!! CLAIM !!!
    it('increase time to claim funds', async () => {
        console.log('[ Claim Funds period ]'.yellow);
        await increaseTimeTo(startTime + 1);
    });

    it('should pass, contract in CLAIM_FUNDS state', async () => {
        const currentState = await liquidatorInstance.currentState();
        assert.equal(currentState.toNumber(), 2, 'state is incorrect; should be 2');
    });

    it('should pass, because we try to claim funds on an active contract in the correct state', async () => {
        await icoTokenInstance.approve(liquidatorInstance.address, 10000, {from: activeInvestor1, gas: 1000000});
        const allowance = await icoTokenInstance.allowance(activeInvestor1, liquidatorInstance.address);
        assert.equal(allowance.toNumber(), 10000, 'allowance !=');

        await liquidatorInstance.claimFunds({from: activeInvestor1, gas: 1000000});

        const pendingBalance = await liquidationWalletInstance.payments(activeInvestor1);
        assert.equal(pendingBalance.toNumber(), 10000 * rate, 'WETH balance !=');

        const VoucherBalance = await voucherTokenInstance.balanceOf(activeInvestor1);
        await liquidationWalletInstance.withdrawPayments({from: activeInvestor1, gas: 1000000});
        const WethBalance = await payoutTokenInstance.balanceOf(activeInvestor1);

        assert.equal(VoucherBalance.toNumber(), 10000, 'Voucher Balance !=');
        assert.equal(WethBalance.toNumber(), 10000 * rate, 'WETH balance !=');
    });

    it('should fail, we already claimed funds or have 0 token allowance', async () => {
        await expectThrow(liquidatorInstance.claimFunds({from: activeInvestor1, gas: 1000000}));
    });

    it('should fail, because we try to claim unclaimed funds on an active contract in the wrong state', async () => {
        await voucherTokenInstance.approve(liquidatorInstance.address, 20000, {from: inactiveInvestor2, gas: 1000000});
        const allowance = await voucherTokenInstance.allowance(inactiveInvestor2, liquidatorInstance.address);

        assert.equal(allowance.toNumber(), 20000, 'allowance !=');

        await expectThrow(liquidatorInstance.claimUnclaimFunds({from: inactiveInvestor2, gas: 1000000}));
    });

    it('should fail, because we try to claim remainder funds on an active contract in the wrong state', async () => {
        await expectThrow(liquidatorInstance.claimRemainder(inactiveManager));
    });

    // !!! UNCLAIMED !!!
    it('increase time to claim unclaim funds', async () => {
        console.log('[ Claim Unclaimed Funds period ]'.yellow);
        await increaseTimeTo(startTime + 31536000 + 1);
    });

    it('should pass, contract in CLAIM_UNCLAIMEDFUNDS state', async () => {
        const currentState = await liquidatorInstance.currentState();
        assert.equal(currentState.toNumber(), 3, 'state is incorrect; should be 3');
    });

    it('should pass, because we try to claim unclaimed funds on an active contract in the correct state', async () => {
        await voucherTokenInstance.approve(liquidatorInstance.address, 10000, {from: activeInvestor1, gas: 1000000});
        const allowance = await voucherTokenInstance.allowance(activeInvestor1, liquidatorInstance.address);
        assert.equal(allowance.toNumber(), 10000, 'allowance !=');

        await liquidatorInstance.claimUnclaimFunds({from: activeInvestor1, gas: 1000000});

        const pendingBalance = await liquidationWalletInstance.payments(activeInvestor1);
        assert.equal(pendingBalance.toNumber(), 10000 * unclaimedRate, 'WETH balance !=');

        const VoucherBalance = await voucherTokenInstance.balanceOf(activeInvestor1);
        await liquidationWalletInstance.withdrawPayments({from: activeInvestor1, gas: 1000000});
        const WethBalance = await payoutTokenInstance.balanceOf(activeInvestor1);

        assert.equal(VoucherBalance.toNumber(), 0, 'Voucher Balance !=');
        assert.equal(WethBalance.toNumber(), 100000 + pendingBalance.toNumber(), 'WETH balance !=');
    });

    it('should fail, we already claimed funds or have 0 token allowance', async () => {
        await expectThrow(liquidatorInstance.claimUnclaimFunds({from: activeInvestor1, gas: 1000000}));
    });

    it('should fail, because we try to claim funds on an active contract in the wrong state', async () => {
        await icoTokenInstance.approve(liquidatorInstance.address, 20000, {from: inactiveInvestor2, gas: 1000000});
        const allowance = await icoTokenInstance.allowance(inactiveInvestor2, liquidatorInstance.address);

        assert.equal(allowance.toNumber(), 20000, 'allowance !=');
        await expectThrow(liquidatorInstance.claimFunds({from: inactiveInvestor1, gas: 1000000}));
    });

    it('should fail, because we try to claim remainder funds on an active contract in the wrong state', async () => {
        await expectThrow(liquidatorInstance.claimRemainder(inactiveManager));
    });

    // !!! REMAINDER !!!
    it('increase time to allow forwarding of  remaining funds', async () => {
        console.log('[ Transfer Remaining Funds period ]'.yellow);
        await increaseTimeTo(startTime + (31536000 * 2) + 1);
    });

    it('should pass, contract in CLAIM_REMAINDER state', async () => {
        const currentState = await liquidatorInstance.currentState();
        assert.equal(currentState.toNumber(), 4, 'state is incorrect; should be 4');
    });

    it('should fail, because we try to claim funds on an active contract in the wrong state', async () => {
        await icoTokenInstance.approve(liquidatorInstance.address, 0, {from: inactiveInvestor1, gas: 1000000});
        await icoTokenInstance.approve(liquidatorInstance.address, 2000, {from: inactiveInvestor1, gas: 1000000});

        const allowance = await icoTokenInstance.allowance(inactiveInvestor1, liquidatorInstance.address);
        assert.equal(allowance.toNumber(), 2000, 'allowance !=');

        await expectThrow(liquidatorInstance.claimFunds({from: inactiveInvestor1, gas: 1000000}));
    });

    it('should pass, because we try to claim remainder funds on an active contract in the correct state', async () => {
        const liquidatorBalance = await payoutTokenInstance.balanceOf(liquidationWalletAddress);
        await liquidatorInstance.claimRemainder(inactiveManager);
        const balance = await payoutTokenInstance.balanceOf(inactiveManager);

        assert(balance.toNumber(), liquidatorBalance.toNumber(), 'balance !=');
    });

    it('should fail, because we try to claim unclaimed funds on an active contract in the wrong state', async () => {
        await expectThrow(liquidatorInstance.claimUnclaimFunds({from: activeInvestor1, gas: 1000000}));
    });

    it('should pass, contract has ended', async () => {
        const ended = await liquidatorInstance.ended();
        assert.equal(ended, true, 'should be true');
    });
});

/**
 * LiquidationWallet contract
 */
contract('LiquidationWallet', (accounts) => {
    const owner             = accounts[0];
    const activeInvestor1   = accounts[3];
    const activeInvestor2   = accounts[4];
    const wallet            = accounts[6];

    let liquidationWallet;
    let liquidationWalletAddress;
    let payoutTokenInstance;
    let payoutTokenAddress;

    before(async () => {
        payoutTokenInstance         = await WETHToken.deployed();
        payoutTokenAddress          = payoutTokenInstance.address;

        liquidationWallet           = await LiquidatorWallet.new(payoutTokenAddress);
        liquidationWalletAddress    = liquidationWallet.address;
    });

    it('should allocate payout tokens to the Liquidator Wallet for withdrawals', async () => {
        const balance = await payoutTokenInstance.balanceOf(owner);

        await payoutTokenInstance.transfer(liquidationWalletAddress, balance.toNumber());

        const balance2 = await payoutTokenInstance.balanceOf(liquidationWalletAddress);
        assert.equal(balance.toNumber(), balance2.toNumber(), 'WETH balance not correct');
    });

    it('should fail, cannot send ether to fallback function', async () => {
        await expectThrow(liquidationWallet.sendTransaction({
            from:   owner,
            value:  web3.toWei(5, 'ether'),
            gas:    700000
        }));
    });

    it('should fail, cannot deploy with 0x0 address', async () => {
        await expectThrow(LiquidatorWallet.new(0x0));
    });

    it('should pass, authorize withdrawal for activeInvestor1', async () => {
        await liquidationWallet.authorizePayment(activeInvestor1, 1000);
    });

    it('should pass, withdraw balance', async () => {
        await liquidationWallet.withdrawPayments({from: activeInvestor1});
    });

    it('should fail, cannot withdrawal 0 balance', async () => {
        await expectThrow(liquidationWallet.withdrawPayments({from: activeInvestor1}));
    });

    it('should depositRemaindingFunds, sending funds to the designated wallet', async () => {
        // let balance = await payoutTokenInstance.balanceOf(liquidationWalletAddress);

        // log.info(balance.toNumber());

        await liquidationWallet.depositRemaindingFunds(wallet);
        // balance = await payoutTokenInstance.balanceOf(liquidationWalletAddress);

        // assert.equal(0, balance.toNumber(), 'vault test balance !=');
    });

    it('should fail, depositRemaindingFunds has 0 balance', async () => {
        await expectThrow(liquidationWallet.depositRemaindingFunds(wallet));
    });
});
