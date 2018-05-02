/**
 * Test for SwissRealCoin Crowdsale
 *
 * @author Validity Labs AG <info@validitylabs.org>
 */

import {expectThrow, waitNDays, getEvents, BigNumber, cnf, increaseTimeTo} from '../../helpers/tools';
import {logger as log} from '../../../tools/lib/logger';

const SrcCrowdsale  = artifacts.require('./SrcCrowdsale');
const SrcToken      = artifacts.require('./SrcToken');
const AutoRefundVault = artifacts.require('./AutoRefundVault');

const should = require('chai') // eslint-disable-line
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

/**
 * SrcCrowdsale contract
 */
contract('SrcCrowdsale', (accounts) => {
    const owner             = accounts[0];
    const activeManager     = accounts[1];
    const inactiveManager   = accounts[2];
    const activeInvestor1   = accounts[3];
    const activeInvestor2   = accounts[4];
    const inactiveInvestor1 = accounts[5];
    const wallet            = accounts[6];
    const activeInvestor3   = accounts[7];
    const activeInvestor4   = accounts[8];
    const activeInvestor5   = accounts[9];

    // Provide icoCrowdsaleInstance, icoTokenInstance, autoRefundVaultInstance for every test case
    let icoCrowdsaleInstance;
    let icoTokenAddress;
    let icoTokenInstance;
    let autoRefundVaultInstance;

    let startTime;
    let endTime;
    let confirmationPeriod;

    let vault;
    let vaultWallet;

    let initialWalletBalance;

    const ICO_TOKEN_CAP = 150e6;

    const oneDay = 86400;
    // 2nd crowdsale instance vars
    const newStartTime = 1564617600; // Thursday, August 1, 2019 12:00:00 AM
    const newDuration = oneDay * 30; // 30 days
    const newRate = 800; // 800 CHF per 1 ether
    const deltaCap = 30e6 * 1e18; // 30,000,000 delta cap

    before(async () => {
        icoCrowdsaleInstance    = await SrcCrowdsale.deployed();
        icoTokenAddress         = await icoCrowdsaleInstance.token();
        icoTokenInstance        = await SrcToken.at(icoTokenAddress);
    });

    it('should fail to deploy the ICO crowdsale', async () => {
        console.log('[ Deployment Sanity Checks ]'.yellow);
        await expectThrow(SrcCrowdsale.new(0, cnf.endTime, cnf.rate, cnf.wallet, icoTokenAddress));

        await expectThrow(SrcCrowdsale.new(cnf.startTime, 0, cnf.rate, cnf.wallet, icoTokenAddress));

        await expectThrow(SrcCrowdsale.new(cnf.startTime, cnf.endTime, 0, cnf.wallet, icoTokenAddress));

        await expectThrow(SrcCrowdsale.new(cnf.startTime, cnf.endTime, cnf.rate, 0x0, icoTokenAddress));

        await expectThrow(SrcCrowdsale.new(cnf.startTime, cnf.endTime, cnf.rate, cnf.wallet, 0x0));
    });

    /**
     * [ Pre contribution period ]
     */

    it('should instantiate the ICO crowdsale correctly', async () => {
        console.log('[ Pre contribution period ]'.yellow);

        startTime            = await icoCrowdsaleInstance.openingTime();
        endTime              = await icoCrowdsaleInstance.closingTime();
        const _chfPerEth     = await icoCrowdsaleInstance.rate();
        const _wallet        = await icoCrowdsaleInstance.wallet();
        confirmationPeriod   = await icoCrowdsaleInstance.confirmationPeriod();

        startTime.should.be.bignumber.equal(cnf.startTimeTesting);
        endTime.should.be.bignumber.equal(cnf.endTimeTesting);
        _chfPerEth.should.be.bignumber.equal(cnf.rateChfPerEth);
        _wallet.should.be.equal(wallet);
        confirmationPeriod.should.be.bignumber.equal(60 * 60 * 24 * 30);
    });

    it('should setup the ICO contracts as the owner to the SRC Token', async () => {
        await icoTokenInstance.transferOwnership(icoCrowdsaleInstance.address, {from: owner});
        const newOwner = await icoTokenInstance.owner();

        assert.equal(newOwner, icoCrowdsaleInstance.address, 'Src Token owner not correct');
    });

    it('should not be able to mint more tokens from owner account (previous wallet deployer)', async () => {
        await expectThrow(icoTokenInstance.generateTokens(owner, 1, {from: owner, gas: 1000000}));
    });

    it('should retrieve the vault address', async () => {
        vault = await icoCrowdsaleInstance.vault();
    });

    it('should verify the vault wallet (beneficiary address)', async () => {
        autoRefundVaultInstance = await AutoRefundVault.at(vault);
        vaultWallet = await autoRefundVaultInstance.wallet();
        const state = await autoRefundVaultInstance.state();
        const vaultBalance = await web3.eth.getBalance(vault);
        initialWalletBalance = await web3.eth.getBalance(wallet);
        const occurrence = await autoRefundVaultInstance.occurrence();

        assert.equal(occurrence.toNumber(), 0, 'occurrences !=');
        assert.equal(vaultBalance.toNumber(), 0, 'vault balance not equal');
        assert.equal(state, 0, 'Vault state is not equal');
        assert.equal(vaultWallet, wallet, 'Vault wallet is not equal');
    });

    it('should verify SRC token is non transferable', async () => {
        const transfersEnabled = await icoTokenInstance.transfersEnabled();
        assert.isFalse(transfersEnabled);
    });

    it('should verify, the owner is added properly to manager accounts', async () => {
        const manager = await icoCrowdsaleInstance.isManager(owner);

        assert.isTrue(manager, 'Owner should be a manager too');
    });

    it('should set manager accounts', async () => {
        const tx1 = await icoCrowdsaleInstance.setManager(activeManager, true, {from: owner, gas: 1000000});
        const tx2 = await icoCrowdsaleInstance.setManager(inactiveManager, false, {from: owner, gas: 1000000});

        const manager1 = await icoCrowdsaleInstance.isManager(activeManager);
        const manager2 = await icoCrowdsaleInstance.isManager(inactiveManager);

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
        const tx1 = await icoCrowdsaleInstance.setManager(activeManager, false, {from: owner, gas: 1000000});
        const tx2 = await icoCrowdsaleInstance.setManager(inactiveManager, true, {from: owner, gas: 1000000});

        const manager1 = await icoCrowdsaleInstance.isManager(activeManager);
        const manager2 = await icoCrowdsaleInstance.isManager(inactiveManager);

        assert.isFalse(manager1, 'Manager 1 should be inactive');
        assert.isTrue(manager2, 'Manager 2 should be active');

        // Testing events
        const events1 = getEvents(tx1, 'ChangedManager');
        const events2 = getEvents(tx2, 'ChangedManager');

        assert.isFalse(events1[0].active, 'activeManager expected to be inactive');
        assert.isTrue(events2[0].active, 'inactiveManager expected to be active');

        // Roll back to origin values
        const tx3 = await icoCrowdsaleInstance.setManager(activeManager, true, {from: owner, gas: 1000000});
        const tx4 = await icoCrowdsaleInstance.setManager(inactiveManager, false, {from: owner, gas: 1000000});

        const manager3 = await icoCrowdsaleInstance.isManager(activeManager);
        const manager4 = await icoCrowdsaleInstance.isManager(inactiveManager);

        assert.isTrue(manager3, 'Manager 1 should be active');
        assert.isFalse(manager4, 'Manager 2 should be inactive');

        const events3 = getEvents(tx3, 'ChangedManager');
        const events4 = getEvents(tx4, 'ChangedManager');

        assert.isTrue(events3[0].active, 'activeManager expected to be active');
        assert.isFalse(events4[0].active, 'inactiveManager expected to be inactive');
    });

    it('should fail, because we try to set manager from unauthorized account', async () => {
        await expectThrow(icoCrowdsaleInstance.setManager(activeManager, false, {from: activeInvestor1, gas: 1000000}));
    });

    it('should fail, because we try to mint tokens for presale with a non owner account', async () => {
        await expectThrow(icoCrowdsaleInstance.mintPresaleTokens(activeInvestor1, 1, {from: activeManager, gas: 1000000}));
    });

    it('should fail, because we try to mint tokens more as cap limit allows', async () => {
        await expectThrow(icoCrowdsaleInstance.mintPresaleTokens(activeInvestor1, web3.toWei(ICO_TOKEN_CAP + 1, 'ether'), {from: owner, gas: 1000000}));
    });

    it('should fail, because we try to trigger buyTokens in before contribution time is started', async () => {
        await expectThrow(icoCrowdsaleInstance.buyTokens(activeInvestor1, {from: activeInvestor2, gas: 1000000}));
    });

    it('should fail, because we try to trigger a new crowdsale before the 1st is finalized', async () => {
        const newStartTime = 1564617600; // Thursday, August 1, 2019 12:00:00 AM
        const duration = oneDay * 30; // 30 days
        const rate = 800; // 800 CHF per 1 ether
        const deltaCap = 30e6 * 1e18; // 30,000,000 delta cap

        await expectThrow(icoCrowdsaleInstance.newCrowdsale(newStartTime, duration, rate, deltaCap));
    });

    it('should fail, because we try to trigger the fallback function before contribution time is started', async () => {
        await expectThrow(icoCrowdsaleInstance.sendTransaction({
            from:   owner,
            value:  web3.toWei(1, 'ether'),
            gas:    700000
        }));
    });

    it('should mint tokens for presale', async () => {
        const activeInvestor1Balance1   = await icoTokenInstance.balanceOf(activeInvestor1);
        const activeInvestor2Balance1   = await icoTokenInstance.balanceOf(activeInvestor2);
        const three                     = web3.toWei(3, 'ether');
        const five                      = web3.toWei(5, 'ether');

        activeInvestor1Balance1.should.be.bignumber.equal(new BigNumber(0));
        activeInvestor2Balance1.should.be.bignumber.equal(new BigNumber(0));

        const tx1 = await icoCrowdsaleInstance.mintPresaleTokens(activeInvestor1, three);   // investments(0)
        const tx2 = await icoCrowdsaleInstance.mintPresaleTokens(activeInvestor2, five);    // investments(1)

        const activeInvestor1Balance2 = await icoTokenInstance.balanceOf(activeInvestor1);
        const activeInvestor2Balance2 = await icoTokenInstance.balanceOf(activeInvestor2);

        activeInvestor1Balance2.should.be.bignumber.equal(new BigNumber(0));
        activeInvestor2Balance2.should.be.bignumber.equal(new BigNumber(0));

        // Testing events
        const events1 = getEvents(tx1, 'PresalePurchase');
        const events2 = getEvents(tx2, 'PresalePurchase');

        assert.equal(events1[0].beneficiary, activeInvestor1, '');
        assert.equal(events2[0].beneficiary, activeInvestor2, '');

        events1[0].tokenAmount.should.be.bignumber.equal(three);
        events2[0].tokenAmount.should.be.bignumber.equal(five);
    });

    /**
     * [ Contribution period ]
     */

    it('increase time to accept investments', async () => {
        console.log('[ Contribution period ]'.yellow);
        await increaseTimeTo(cnf.startTimeTesting);
    });

    it('should fail, because we try to trigger buyTokens for beneficiary 0x0', async () => {
        await expectThrow(icoCrowdsaleInstance.buyTokens(
            '0x0',
            {from: activeInvestor1, gas: 1000000, value: web3.toWei(1, 'ether')}
        ));
    });

    it('should buyTokens properly', async () => {
        const tx    = await icoCrowdsaleInstance.buyTokens(     // investments(2)
            activeInvestor1,
            {from: activeInvestor2, gas: 1000000, value: web3.toWei(2, 'ether')}
        );

        const investment2 = await icoCrowdsaleInstance.investments(2);

        assert.equal(investment2[0], activeInvestor2, 'activeInvestor2 does not match purchaser');  // Investor
        assert.equal(investment2[1], activeInvestor1, 'activeInvestor1 does not match beneficiary');// Beneficiary
        investment2[2].should.be.bignumber.equal(web3.toWei(2, 'ether'));                           // Wei Amount
        investment2[3].should.be.bignumber.equal(web3.toWei(2 * cnf.rateChfPerEth));                // Token Amount
        assert.isFalse(investment2[4]);                                                             // Confirmed
        assert.isFalse(investment2[5]);                                                             // AttemptedSettlement
        assert.isFalse(investment2[6]);                                                             // CompletedSettlement

        // Testing events
        const events = getEvents(tx, 'TokenPurchase');

        assert.equal(events[0].purchaser, activeInvestor2, 'activeInvestor2 does not match purchaser');
        assert.equal(events[0].beneficiary, activeInvestor1, 'activeInvestor1 does not match beneficiary');
        events[0].value.should.be.bignumber.equal(web3.toWei(2, 'ether'));
        events[0].amount.should.be.bignumber.equal(web3.toWei(2 * cnf.rateChfPerEth));

        const vaultBalance = await web3.eth.getBalance(vault);
        assert.equal(vaultBalance.toNumber(), web3.toWei(2, 'ether'), 'vault balance not equal');
    });

    it('should call the fallback function successfully', async () => {
        const tx1   = await icoCrowdsaleInstance.sendTransaction({  // investments(3)
            from:   activeInvestor1,
            value:  web3.toWei(3, 'ether'),
            gas:    1000000
        });

        const investment3 = await icoCrowdsaleInstance.investments(3);

        assert.equal(investment3[0], activeInvestor1);                      // Investor
        assert.equal(investment3[1], activeInvestor1);                      // Beneficiary
        investment3[2].should.be.bignumber.equal(web3.toWei(3, 'ether'));   // Wei Amount
        investment3[3].should.be.bignumber.equal(web3.toWei(3 * cnf.rateChfPerEth));                 // Token Amount
        assert.isFalse(investment3[4]);                                     // Confirmed
        assert.isFalse(investment3[5]);                                     // AttemptedSettlement
        assert.isFalse(investment3[6]);                                     // CompletedSettlement

        // Testing events
        const events1 = getEvents(tx1, 'TokenPurchase');

        assert.equal(events1[0].purchaser, activeInvestor1, 'activeInvestor1 does not match purchaser');
        assert.equal(events1[0].beneficiary, activeInvestor1, 'activeInvestor1 does not match beneficiary');

        events1[0].value.should.be.bignumber.equal(web3.toWei(3, 'ether'));
        events1[0].amount.should.be.bignumber.equal(web3.toWei(3 * cnf.rateChfPerEth));

        const tx2   = await icoCrowdsaleInstance.sendTransaction({
            from:   activeInvestor3,
            value:  web3.toWei(4, 'ether'),
            gas:    1000000
        });

        const investment4 = await icoCrowdsaleInstance.investments(4);

        assert.equal(investment4[0], activeInvestor3);                      // Investor
        assert.equal(investment4[1], activeInvestor3);                      // Beneficiary
        investment4[2].should.be.bignumber.equal(web3.toWei(4, 'ether'));   // Wei Amount
        investment4[3].should.be.bignumber.equal(web3.toWei(4 * cnf.rateChfPerEth));                   // Token Amoun
        assert.isFalse(investment4[4]);                                     // Confirmed
        assert.isFalse(investment4[5]);                                     // AttemptedSettlement
        assert.isFalse(investment4[6]);                                     // CompletedSettlement

        // Testing events
        const events2 = getEvents(tx2, 'TokenPurchase');

        assert.equal(events2[0].purchaser, activeInvestor3, 'activeInvestor3 does not match purchaser');
        assert.equal(events2[0].beneficiary, activeInvestor3, 'activeInvestor3 does not match beneficiary');

        events2[0].value.should.be.bignumber.equal(web3.toWei(4, 'ether'));
        events2[0].amount.should.be.bignumber.equal(web3.toWei(4 * cnf.rateChfPerEth));

        const tx3   = await icoCrowdsaleInstance.sendTransaction({
            from:   activeInvestor4,
            value:  web3.toWei(5, 'ether'),
            gas:    1000000
        });

        const investment5 = await icoCrowdsaleInstance.investments(5);

        assert.equal(investment5[0], activeInvestor4);                      // Investor
        assert.equal(investment5[1], activeInvestor4);                      // Beneficiary
        investment5[2].should.be.bignumber.equal(web3.toWei(5, 'ether'));   // Wei Amount
        investment5[3].should.be.bignumber.equal(web3.toWei(5 * cnf.rateChfPerEth));                 // Token Amount
        assert.isFalse(investment5[4]);                                     // Confirmed
        assert.isFalse(investment5[5]);                                     // AttemptedSettlement
        assert.isFalse(investment5[6]);                                     // CompletedSettlement

        // Testing events
        const events3 = getEvents(tx3, 'TokenPurchase');

        assert.equal(events3[0].purchaser, activeInvestor4, 'activeInvestor4 does not match purchaser');
        assert.equal(events3[0].beneficiary, activeInvestor4, 'activeInvestor4 does not match beneficiary');

        events3[0].value.should.be.bignumber.equal(web3.toWei(5, 'ether'));
        events3[0].amount.should.be.bignumber.equal(web3.toWei(5 * cnf.rateChfPerEth));

        const tx4   = await icoCrowdsaleInstance.sendTransaction({
            from:   activeInvestor5,
            value:  web3.toWei(6, 'ether'),
            gas:    1000000
        });

        const investment6 = await icoCrowdsaleInstance.investments(6);

        assert.equal(investment6[0], activeInvestor5);                      // Investor
        assert.equal(investment6[1], activeInvestor5);                      // Beneficiary
        investment6[2].should.be.bignumber.equal(web3.toWei(6, 'ether'));   // Wei Amount
        investment6[3].should.be.bignumber.equal(web3.toWei(6 * cnf.rateChfPerEth));                 // Token Amount
        assert.isFalse(investment6[4]);                                     // Confirmed
        assert.isFalse(investment6[5]);                                     // AttemptedSettlement
        assert.isFalse(investment6[6]);                                     // CompletedSettlement

        // Testing events
        const events4 = getEvents(tx4, 'TokenPurchase');

        assert.equal(events4[0].purchaser, activeInvestor5, 'activeInvestor5 does not match purchaser');
        assert.equal(events4[0].beneficiary, activeInvestor5, 'activeInvestor5 does not match beneficiary');

        events4[0].value.should.be.bignumber.equal(web3.toWei(6, 'ether'));
        events4[0].amount.should.be.bignumber.equal(web3.toWei(6 * cnf.rateChfPerEth));

        const vaultBalance = await web3.eth.getBalance(vault);
        assert.equal(vaultBalance.toNumber(), web3.toWei(20, 'ether'), 'vault balance not equal');
    });

    it('should buyTokens (for token contract) properly', async () => {
        const tokenAddress = await icoCrowdsaleInstance.token();

        await icoCrowdsaleInstance.buyTokens(
            tokenAddress,
            {from: inactiveInvestor1, gas: 1000000, value: web3.toWei(7, 'ether')}
        );

        const investment7 = await icoCrowdsaleInstance.investments(7);

        assert.equal(investment7[0], inactiveInvestor1);                      // Investor
        assert.equal(investment7[1], tokenAddress);                         // Beneficiary
        investment7[2].should.be.bignumber.equal(web3.toWei(7, 'ether'));   // Wei Amount
        investment7[3].should.be.bignumber.equal(web3.toWei(7 * cnf.rateChfPerEth));                 // Token Amount
        assert.isFalse(investment7[4]);                                     // Confirmed
        assert.isFalse(investment7[5]);                                     // AttemptedSettlement
        assert.isFalse(investment7[6]);                                     // CompletedSettlement

        const vaultBalance = await web3.eth.getBalance(vault);
        assert.equal(vaultBalance.toNumber(), web3.toWei(27, 'ether'), 'vault balance not equal');
    });

    it('should fail, because we try to trigger mintPresaleTokens in contribution period', async () => {
        await expectThrow(icoCrowdsaleInstance.mintPresaleTokens(activeInvestor1, 3));
    });

    it('should fail, because we try to trigger confirmPayment with non manager account', async () => {
        await expectThrow(icoCrowdsaleInstance.confirmPayment(0, {from: inactiveManager, gas: 1000000}));
    });

    it('should fail, because we try to trigger batchConfirmPayments with non manager account', async () => {
        await expectThrow(icoCrowdsaleInstance.batchConfirmPayments([0, 1], {from: inactiveManager, gas: 1000000}));
    });

    it('should fail, because we try to trigger unConfirmPayment with non manager account', async () => {
        await expectThrow(icoCrowdsaleInstance.unConfirmPayment(0, {from: inactiveManager, gas: 1000000}));
    });

    it('should fail, because we try to run finalizeConfirmationPeriod with a non manager account', async () => {
        await expectThrow(icoCrowdsaleInstance.finalizeConfirmationPeriod({from: activeInvestor1, gas: 1000000}));
    });

    it('should fail, because we try to trigger unConfirmPayment before Confirmation period', async () => {
        await expectThrow(icoCrowdsaleInstance.unConfirmPayment(0, {from: activeManager, gas: 1000000}));
    });

    it('should fail, because we try to trigger batchConfirmPayments before Confirmation period', async () => {
        await expectThrow(icoCrowdsaleInstance.batchConfirmPayments([0, 1], {from: activeManager, gas: 1000000}));
    });

    it('should fail, because we try to trigger confirmPayment before Confirmation period', async () => {
        await expectThrow(icoCrowdsaleInstance.confirmPayment(0, {from: activeManager, gas: 1000000}));
    });

    it('should fail, because we try to trigger a new crowdsale before the 1st is finalized', async () => {
        const newStartTime = 1564617600; // Thursday, August 1, 2019 12:00:00 AM
        const duration = oneDay * 30; // 30 days
        const rate = 800; // 800 CHF per 1 ether
        const deltaCap = 30e6 * 1e18; // 30,000,000 delta cap

        await expectThrow(icoCrowdsaleInstance.newCrowdsale(newStartTime, duration, rate, deltaCap));
    });

    /**
     * [ Confirmation period ]
     */

    it('should fail, because we try to trigger mintPresaleTokens in Confirmation period', async () => {
        console.log('[ Confirmation period ]'.yellow);
        await increaseTimeTo(cnf.endTimeTesting + 1);
        await expectThrow(icoCrowdsaleInstance.mintPresaleTokens(activeInvestor1, 3));
    });

    it('should trigger confirmPayment successfully', async () => {
        const tx            = await icoCrowdsaleInstance.confirmPayment(2, {from: activeManager, gas: 1000000});
        const tx2           = await icoCrowdsaleInstance.confirmPayment(0, {from: activeManager, gas: 1000000});
        const events        = getEvents(tx, 'ChangedInvestmentConfirmation');
        const events2       = getEvents(tx2, 'ChangedInvestmentConfirmation');

        const investment0   = await icoCrowdsaleInstance.investments(0);
        const investment1   = await icoCrowdsaleInstance.investments(1);
        const investment2   = await icoCrowdsaleInstance.investments(2);
        const investment3   = await icoCrowdsaleInstance.investments(3);
        const investment4   = await icoCrowdsaleInstance.investments(4);
        const investment5   = await icoCrowdsaleInstance.investments(5);
        const investment6   = await icoCrowdsaleInstance.investments(6);

        // is presale
        assert.equal(investment0[0], owner, '0: Investor wrong');   // Investor
        assert.equal(investment0[1], activeInvestor1, '0: Beneficiary wrong');                           // Beneficiary
        investment0[2].should.be.bignumber.equal(web3.toWei(0, 'ether'), '0: Wei amount wrong');         // Wei Amount
        investment0[3].should.be.bignumber.equal(web3.toWei(3, 'ether'), '0: Token amount wrong');         // Token Amount
        assert.isTrue(investment0[4], '0: Confirmed wrong');                                             // Confirmed
        assert.isFalse(investment0[5], '0: AttemptedSettlement wrong');                                  // AttemptedSettlement
        assert.isFalse(investment0[6], '0: CompletedSettlement wrong');                                  // CompletedSettlement

        // is presale
        assert.equal(investment1[0], owner);   // Investor
        assert.equal(investment1[1], activeInvestor2);                              // Beneficiary
        investment1[2].should.be.bignumber.equal(web3.toWei(0, 'ether'));           // Wei Amount
        investment1[3].should.be.bignumber.equal(web3.toWei(5, 'ether'));                             // Token Amount
        assert.isFalse(investment1[4]);                                             // Confirmed
        assert.isFalse(investment1[5]);                                             // AttemptedSettlement
        assert.isFalse(investment1[6]);                                             // CompletedSettlement

        // is crowdsales
        assert.equal(investment2[0], activeInvestor2);                      // Investor
        assert.equal(investment2[1], activeInvestor1);                      // Beneficiary
        investment2[2].should.be.bignumber.equal(web3.toWei(2, 'ether'));   // Wei Amount
        investment2[3].should.be.bignumber.equal(web3.toWei(2 * cnf.rateChfPerEth));                  // Token Amount
        assert.isTrue(investment2[4]);                                      // Confirmed
        assert.isFalse(investment2[5]);                                     // AttemptedSettlement
        assert.isFalse(investment2[6]);                                     // CompletedSettlement

        assert.equal(investment3[0], activeInvestor1);                      // Investor
        assert.equal(investment3[1], activeInvestor1);                      // Beneficiary
        investment3[2].should.be.bignumber.equal(web3.toWei(3, 'ether'));   // Wei Amount
        investment3[3].should.be.bignumber.equal(web3.toWei(3 * cnf.rateChfPerEth));                 // Token Amount
        assert.isFalse(investment3[4]);                                     // Confirmed
        assert.isFalse(investment3[5]);                                     // AttemptedSettlement
        assert.isFalse(investment3[6]);                                     // CompletedSettlement

        assert.equal(investment4[0], activeInvestor3);                      // Investor
        assert.equal(investment4[1], activeInvestor3);                      // Beneficiary
        investment4[2].should.be.bignumber.equal(web3.toWei(4, 'ether'));   // Wei Amount
        investment4[3].should.be.bignumber.equal(web3.toWei(4 * cnf.rateChfPerEth));                   // Token Amount
        assert.isFalse(investment4[4]);                                     // Confirmed
        assert.isFalse(investment4[5]);                                     // AttemptedSettlement
        assert.isFalse(investment4[6]);                                     // CompletedSettlement

        assert.equal(investment5[0], activeInvestor4);                      // Investor
        assert.equal(investment5[1], activeInvestor4);                      // Beneficiary
        investment5[2].should.be.bignumber.equal(web3.toWei(5, 'ether'));   // Wei Amount
        investment5[3].should.be.bignumber.equal(web3.toWei(5 * cnf.rateChfPerEth));                 // Token Amount
        assert.isFalse(investment5[4]);                                     // Confirmed
        assert.isFalse(investment5[5]);                                     // AttemptedSettlement
        assert.isFalse(investment5[6]);                                     // CompletedSettlement

        assert.equal(investment6[0], activeInvestor5);                      // Investor
        assert.equal(investment6[1], activeInvestor5);                      // Beneficiary
        investment6[2].should.be.bignumber.equal(web3.toWei(6, 'ether'));   // Wei Amount
        investment6[3].should.be.bignumber.equal(web3.toWei(6 * cnf.rateChfPerEth));                  // Token Amount
        assert.isFalse(investment6[4]);                                     // Confirmed
        assert.isFalse(investment6[5]);                                     // AttemptedSettlement
        assert.isFalse(investment6[6]);                                     // CompletedSettlement

        assert.equal(events[0].investmentId.toNumber(), 2);
        assert.equal(events[0].investor, activeInvestor2);
        assert.isTrue(events[0].confirmed);

        assert.equal(events2[0].investmentId.toNumber(), 0);
        assert.equal(events2[0].investor, owner);
        assert.isTrue(events2[0].confirmed);
    });

    it('should run batchConfirmPayments() successfully', async () => {
        const tx = await icoCrowdsaleInstance.batchConfirmPayments(
            [0, 1, 2, 3, 4, 5],
            {from: activeManager, gas: 1000000}
        );

        const events        = getEvents(tx, 'ChangedInvestmentConfirmation');
        const investment6   = await icoCrowdsaleInstance.investments(6);

        assert.equal(investment6[0], activeInvestor5);                      // Investor
        assert.equal(investment6[1], activeInvestor5);                      // Beneficiary
        investment6[2].should.be.bignumber.equal(web3.toWei(6, 'ether'));   // Wei Amount
        investment6[3].should.be.bignumber.equal(web3.toWei(6 * cnf.rateChfPerEth));                // Token Amount
        assert.isFalse(investment6[4]);                                     // Confirmed
        assert.isFalse(investment6[5]);                                     // AttemptedSettlement
        assert.isFalse(investment6[6]);                                     // CompletedSettlement

        // is presale
        assert.equal(events[0].investmentId.toNumber(), 0);
        assert.equal(events[0].investor, owner);
        assert.isTrue(events[0].confirmed);

        // is presale
        assert.equal(events[1].investmentId.toNumber(), 1);
        assert.equal(events[1].investor, owner);
        assert.isTrue(events[1].confirmed);

        // is crowdsales
        assert.equal(events[2].investmentId.toNumber(), 2);
        assert.equal(events[2].investor, activeInvestor2);
        assert.isTrue(events[2].confirmed);

        assert.equal(events[3].investmentId.toNumber(), 3);
        assert.equal(events[3].investor, activeInvestor1);
        assert.isTrue(events[3].confirmed);

        assert.equal(events[4].investmentId.toNumber(), 4);
        assert.equal(events[4].investor, activeInvestor3);
        assert.isTrue(events[4].confirmed);

        assert.equal(events[5].investmentId.toNumber(), 5);
        assert.equal(events[5].investor, activeInvestor4);
        assert.isTrue(events[5].confirmed);
    });

    it('should run unConfirmPayment() successfully', async () => {
        const tx            = await icoCrowdsaleInstance.unConfirmPayment(5, {from: activeManager, gas: 1000000});
        const events        = getEvents(tx, 'ChangedInvestmentConfirmation');

        const tx2           = await icoCrowdsaleInstance.unConfirmPayment(1, {from: activeManager, gas: 1000000});
        const events2       = getEvents(tx2, 'ChangedInvestmentConfirmation');

        const investment0   = await icoCrowdsaleInstance.investments(0);
        const investment1   = await icoCrowdsaleInstance.investments(1);
        const investment2   = await icoCrowdsaleInstance.investments(2);
        const investment3   = await icoCrowdsaleInstance.investments(3);
        const investment4   = await icoCrowdsaleInstance.investments(4);
        const investment5   = await icoCrowdsaleInstance.investments(5);
        const investment6   = await icoCrowdsaleInstance.investments(6);

        // is presale
        assert.equal(investment0[0], owner);   // Investor
        assert.equal(investment0[1], activeInvestor1);                              // Beneficiary
        investment0[2].should.be.bignumber.equal(web3.toWei(0, 'ether'));           // Wei Amount
        investment0[3].should.be.bignumber.equal(web3.toWei(3, 'ether'));                               // Token Amount
        assert.isTrue(investment0[4]);                                              // Confirmed
        assert.isFalse(investment0[5]);                                             // AttemptedSettlement
        assert.isFalse(investment0[6]);                                             // CompletedSettlement

        // is presale
        assert.equal(investment1[0], owner);   // Investor
        assert.equal(investment1[1], activeInvestor2);                              // Beneficiary
        investment1[2].should.be.bignumber.equal(web3.toWei(0, 'ether'));           // Wei Amount
        investment1[3].should.be.bignumber.equal(web3.toWei(5, 'ether'));                                // Token Amount
        assert.isFalse(investment1[4]);                                             // Confirmed
        assert.isFalse(investment1[5]);                                             // AttemptedSettlement
        assert.isFalse(investment1[6]);                                             // CompletedSettlement

        // starting crowdsale
        assert.equal(investment2[0], activeInvestor2);                      // Investor
        assert.equal(investment2[1], activeInvestor1);                      // Beneficiary
        investment2[2].should.be.bignumber.equal(web3.toWei(2, 'ether'));   // Wei Amount
        investment2[3].should.be.bignumber.equal(web3.toWei(2 * cnf.rateChfPerEth));                  // Token Amount
        assert.isTrue(investment2[4]);                                      // Confirmed
        assert.isFalse(investment2[5]);                                     // AttemptedSettlement
        assert.isFalse(investment2[6]);                                     // CompletedSettlement

        assert.equal(investment3[0], activeInvestor1);                      // Investor
        assert.equal(investment3[1], activeInvestor1);                      // Beneficiary
        investment3[2].should.be.bignumber.equal(web3.toWei(3, 'ether'));   // Wei Amount
        investment3[3].should.be.bignumber.equal(web3.toWei(3 * cnf.rateChfPerEth));                 // Token Amount
        assert.isTrue(investment3[4]);                                      // Confirmed
        assert.isFalse(investment3[5]);                                     // AttemptedSettlement
        assert.isFalse(investment3[6]);                                     // CompletedSettlement

        assert.equal(investment4[0], activeInvestor3);                      // Investor
        assert.equal(investment4[1], activeInvestor3);                      // Beneficiary
        investment4[2].should.be.bignumber.equal(web3.toWei(4, 'ether'));   // Wei Amount
        investment4[3].should.be.bignumber.equal(web3.toWei(4 * cnf.rateChfPerEth));                   // Token Amount
        assert.isTrue(investment4[4]);                                      // Confirmed
        assert.isFalse(investment4[5]);                                     // AttemptedSettlement
        assert.isFalse(investment4[6]);                                     // CompletedSettlement

        assert.equal(investment5[0], activeInvestor4);                      // Investor
        assert.equal(investment5[1], activeInvestor4);                      // Beneficiary
        investment5[2].should.be.bignumber.equal(web3.toWei(5, 'ether'));   // Wei Amount
        investment5[3].should.be.bignumber.equal(web3.toWei(5 * cnf.rateChfPerEth));                 // Token Amount
        assert.isFalse(investment5[4]);                                     // Confirmed
        assert.isFalse(investment5[5]);                                     // AttemptedSettlement
        assert.isFalse(investment5[6]);                                     // CompletedSettlement

        assert.equal(investment6[0], activeInvestor5);                      // Investor
        assert.equal(investment6[1], activeInvestor5);                      // Beneficiary
        investment6[2].should.be.bignumber.equal(web3.toWei(6, 'ether'));   // Wei Amount
        investment6[3].should.be.bignumber.equal(web3.toWei(6 * cnf.rateChfPerEth));                  // Token Amount
        assert.isFalse(investment6[4]);                                     // Confirmed
        assert.isFalse(investment6[5]);                                     // AttemptedSettlement
        assert.isFalse(investment6[6]);                                     // CompletedSettlement

        assert.equal(events[0].investmentId.toNumber(), 5);
        assert.equal(events[0].investor, activeInvestor4);
        assert.isFalse(events[0].confirmed);

        assert.equal(events2[0].investmentId.toNumber(), 1);
        assert.equal(events2[0].investor, owner);
        assert.isFalse(events2[0].confirmed);
    });

    it('should fail, because we try to trigger batchConfirmPayments with non manager account', async () => {
        await expectThrow(icoCrowdsaleInstance.batchConfirmPayments([3, 4], {from: inactiveManager, gas: 1000000}));
    });

    it('should fail, because we try to trigger settleInvestment before confirmation period is over', async () => {
        await expectThrow(icoCrowdsaleInstance.settleInvestment(0, {from: activeManager, gas: 1000000}));
    });

    it('should fail, because we try to trigger batchSettleInvestments before confirmation period is over', async () => {
        await expectThrow(icoCrowdsaleInstance.batchSettleInvestments([0, 1, 2], {from: activeManager, gas: 1000000}));
    });

    it('should fail, because we try to trigger finalize before confirmation period is over', async () => {
        await expectThrow(icoCrowdsaleInstance.finalize());
    });

    /**
     * [ Confirmation period over ]
     */
    it('should run finalizeConfirmationPeriod successfully before confirmation period is over', async () => {
        console.log('[ Confirmation period over ]'.yellow);

        const confirmationPeriodOverBefore  = await icoCrowdsaleInstance.confirmationPeriodOver();
        assert.isFalse(confirmationPeriodOverBefore);

        await icoCrowdsaleInstance.finalizeConfirmationPeriod({from: owner, gas: 1000000});

        const confirmationPeriodOverAfter   = await icoCrowdsaleInstance.confirmationPeriodOver();
        assert.isTrue(confirmationPeriodOverAfter);
    });

    it('increase time to end confirmation period', async () => {
        await waitNDays(30);
        console.log('[ Settlement period ]'.yellow);
    });

    it('should fail, because we try to trigger a new crowdsale before the 1st is finalized', async () => {
        const newStartTime = 1564617600; // Thursday, August 1, 2019 12:00:00 AM
        const duration = oneDay * 30; // 30 days
        const rate = 800; // 800 CHF per 1 ether
        const deltaCap = 30e6 * 1e18; // 30,000,000 delta cap

        await expectThrow(icoCrowdsaleInstance.newCrowdsale(newStartTime, duration, rate, deltaCap));
    });

    it('should fail, because we try to mint tokens for presale after Confirmation period is over', async () => {
        await expectThrow(icoCrowdsaleInstance.mintPresaleTokens(activeInvestor1, 1));
    });

    it('should fail, because we try to trigger confirmPayment after Confirmation period is over', async () => {
        await expectThrow(icoCrowdsaleInstance.confirmPayment(0, {from: activeManager, gas: 1000000}));
    });

    it('should fail, because we try to trigger batchConfirmPayments after Confirmation period is over', async () => {
        await expectThrow(icoCrowdsaleInstance.batchConfirmPayments([3, 4], {from: activeManager, gas: 1000000}));
    });

    it('should fail, because we try to trigger unConfirmPayment after Confirmation period is over', async () => {
        await expectThrow(icoCrowdsaleInstance.unConfirmPayment(0, {from: activeManager, gas: 1000000}));
    });

    it('should fail, because we try to trigger first settleInvestments with investmentId > 0', async () => {
        await expectThrow(icoCrowdsaleInstance.settleInvestment(1, {from: activeInvestor1, gas: 1000000}));
    });

    it('should fail, because we try to trigger first batchSettleInvestments with wrong investmentId order', async () => {
        await expectThrow(icoCrowdsaleInstance.batchSettleInvestments([2, 1, 0], {from: activeInvestor2, gas: 1000000}));
    });

    it('should run settleInvestment for first investment successfully', async () => {
        // So know that going in, investments[0 & 1] are presale investments that have owner listed as the investor address and 0 value for the wei.
        // They have a beneficiary address and a token amount.

        const investment0   = await icoCrowdsaleInstance.investments(0);
        const investment1   = await icoCrowdsaleInstance.investments(1);
        const investment2   = await icoCrowdsaleInstance.investments(2);
        const investment3   = await icoCrowdsaleInstance.investments(3);
        const investment4   = await icoCrowdsaleInstance.investments(4);
        const investment5   = await icoCrowdsaleInstance.investments(5);
        const investment6   = await icoCrowdsaleInstance.investments(6);

        // is presale
        investment0[2].should.be.bignumber.equal(web3.toWei(0, 'ether'));   // Wei Amount
        investment0[3].should.be.bignumber.equal(web3.toWei(3, 'ether'));                       // Token Amount
        assert.isTrue(investment0[4]);                                      // Confirmed
        assert.isFalse(investment0[5]);                                     // AttemptedSettlement
        assert.isFalse(investment0[6]);                                     // CompletedSettlement

        // is presale
        investment1[2].should.be.bignumber.equal(web3.toWei(0, 'ether'));   // Wei Amount
        investment1[3].should.be.bignumber.equal(web3.toWei(5, 'ether'));                        // Token Amount
        assert.isFalse(investment1[4]);                                     // Confirmed
        assert.isFalse(investment1[5]);                                     // AttemptedSettlement
        assert.isFalse(investment1[6]);                                     // CompletedSettlement

        // is crowdsales
        investment2[2].should.be.bignumber.equal(web3.toWei(2, 'ether'));   // Wei Amount
        investment2[3].should.be.bignumber.equal(web3.toWei(2 * cnf.rateChfPerEth));                  // Token Amount
        assert.isTrue(investment2[4]);                                      // Confirmed
        assert.isFalse(investment2[5]);                                     // AttemptedSettlement
        assert.isFalse(investment2[6]);                                     // CompletedSettlement

        investment3[2].should.be.bignumber.equal(web3.toWei(3, 'ether'));   // Wei Amount
        investment3[3].should.be.bignumber.equal(web3.toWei(3 * cnf.rateChfPerEth));                 // Token Amount
        assert.isTrue(investment3[4]);                                      // Confirmed
        assert.isFalse(investment3[5]);                                     // AttemptedSettlement
        assert.isFalse(investment3[6]);                                     // CompletedSettlement

        investment4[2].should.be.bignumber.equal(web3.toWei(4, 'ether'));   // Wei Amount
        investment4[3].should.be.bignumber.equal(web3.toWei(4 * cnf.rateChfPerEth));                   // Token Amount
        assert.isTrue(investment4[4]);                                      // Confirmed
        assert.isFalse(investment4[5]);                                     // AttemptedSettlement
        assert.isFalse(investment4[6]);                                     // CompletedSettlement

        investment5[2].should.be.bignumber.equal(web3.toWei(5, 'ether'));   // Wei Amount
        investment5[3].should.be.bignumber.equal(web3.toWei(5 * cnf.rateChfPerEth));                 // Token Amount
        assert.isFalse(investment5[4]);                                     // Confirmed
        assert.isFalse(investment5[5]);                                     // AttemptedSettlement
        assert.isFalse(investment5[6]);                                     // CompletedSettlement

        investment6[2].should.be.bignumber.equal(web3.toWei(6, 'ether'));   // Wei Amount
        investment6[3].should.be.bignumber.equal(web3.toWei(6 * cnf.rateChfPerEth));                  // Token Amount
        assert.isFalse(investment6[4]);                                     // Confirmed
        assert.isFalse(investment6[5]);                                     // AttemptedSettlement
        assert.isFalse(investment6[6]);                                     // CompletedSettlement

        // let tokensMinted = await icoCrowdsaleInstance.tokensMinted();
        // let tokensToMint = await icoCrowdsaleInstance.tokensToMint();

        await icoCrowdsaleInstance.settleInvestment(0, {from: inactiveInvestor1, gas: 1000000});

        // tokensMinted = await icoCrowdsaleInstance.tokensMinted();
        // tokensToMint = await icoCrowdsaleInstance.tokensToMint();

        const investmentAfter0   = await icoCrowdsaleInstance.investments(0);
        const investmentAfter1   = await icoCrowdsaleInstance.investments(1);
        const investmentAfter2   = await icoCrowdsaleInstance.investments(2);
        const investmentAfter3   = await icoCrowdsaleInstance.investments(3);
        const investmentAfter4   = await icoCrowdsaleInstance.investments(4);
        const investmentAfter5   = await icoCrowdsaleInstance.investments(5);
        const investmentAfter6   = await icoCrowdsaleInstance.investments(6);

        // is presale
        investmentAfter0[2].should.be.bignumber.equal(web3.toWei(0, 'ether'));   // Wei Amount
        investmentAfter0[3].should.be.bignumber.equal(web3.toWei(3, 'ether'));                       // Token Amount
        assert.isTrue(investmentAfter0[4]);                                      // Confirmed
        assert.isTrue(investmentAfter0[5]);                                     // AttemptedSettlement
        assert.isTrue(investmentAfter0[6]);                                     // CompletedSettlement

        // is presale
        investmentAfter1[2].should.be.bignumber.equal(web3.toWei(0, 'ether'));   // Wei Amount
        investmentAfter1[3].should.be.bignumber.equal(web3.toWei(5, 'ether'));                        // Token Amount
        assert.isFalse(investmentAfter1[4]);                                     // Confirmed
        assert.isFalse(investmentAfter1[5]);                                     // AttemptedSettlement
        assert.isFalse(investmentAfter1[6]);                                     // CompletedSettlement

        // is crowdsales
        investmentAfter2[2].should.be.bignumber.equal(web3.toWei(2, 'ether'));   // Wei Amount
        investmentAfter2[3].should.be.bignumber.equal(web3.toWei(2 * cnf.rateChfPerEth));                  // Token Amount
        assert.isTrue(investmentAfter2[4]);                                      // Confirmed
        assert.isFalse(investmentAfter2[5]);                                     // AttemptedSettlement
        assert.isFalse(investmentAfter2[6]);                                     // CompletedSettlement

        investmentAfter3[2].should.be.bignumber.equal(web3.toWei(3, 'ether'));   // Wei Amount
        investmentAfter3[3].should.be.bignumber.equal(web3.toWei(3 * cnf.rateChfPerEth));                 // Token Amount
        assert.isTrue(investmentAfter3[4]);                                      // Confirmed
        assert.isFalse(investmentAfter3[5]);                                     // AttemptedSettlement
        assert.isFalse(investmentAfter3[6]);                                     // CompletedSettlement

        investmentAfter4[2].should.be.bignumber.equal(web3.toWei(4, 'ether'));   // Wei Amount
        investmentAfter4[3].should.be.bignumber.equal(web3.toWei(4 * cnf.rateChfPerEth));                   // Token Amount
        assert.isTrue(investmentAfter4[4]);                                      // Confirmed
        assert.isFalse(investmentAfter4[5]);                                     // AttemptedSettlement
        assert.isFalse(investmentAfter4[6]);                                     // CompletedSettlement

        investmentAfter5[2].should.be.bignumber.equal(web3.toWei(5, 'ether'));   // Wei Amount
        investmentAfter5[3].should.be.bignumber.equal(web3.toWei(5 * cnf.rateChfPerEth));                 // Token Amount
        assert.isFalse(investmentAfter5[4]);                                     // Confirmed
        assert.isFalse(investmentAfter5[5]);                                     // AttemptedSettlement
        assert.isFalse(investmentAfter5[6]);                                     // CompletedSettlement

        investmentAfter6[2].should.be.bignumber.equal(web3.toWei(6, 'ether'));   // Wei Amount
        investmentAfter6[3].should.be.bignumber.equal(web3.toWei(6 * cnf.rateChfPerEth));                  // Token Amount
        assert.isFalse(investmentAfter6[4]);                                     // Confirmed
        assert.isFalse(investmentAfter6[5]);                                     // AttemptedSettlement
        assert.isFalse(investmentAfter6[6]);                                     // CompletedSettlement
    });

    it('should fail, because we try to settle an already settled investement again', async () => {
        await expectThrow(icoCrowdsaleInstance.settleInvestment(0, {from: activeInvestor2, gas: 1000000}));
    });

    it('should run batchSettleInvestments successfully', async () => {
        const investment0   = await icoCrowdsaleInstance.investments(0);
        const investment1   = await icoCrowdsaleInstance.investments(1);
        const investment2   = await icoCrowdsaleInstance.investments(2);
        const investment3   = await icoCrowdsaleInstance.investments(3);
        const investment4   = await icoCrowdsaleInstance.investments(4);
        const investment5   = await icoCrowdsaleInstance.investments(5);
        const investment6   = await icoCrowdsaleInstance.investments(6);

        // is presale
        investment0[2].should.be.bignumber.equal(web3.toWei(0, 'ether'));   // Wei Amount
        investment0[3].should.be.bignumber.equal(web3.toWei(3, 'ether'));                       // Token Amount
        assert.isTrue(investment0[4]);                                      // Confirmed
        assert.isTrue(investment0[5]);                                      // AttemptedSettlement
        assert.isTrue(investment0[6]);                                      // CompletedSettlement

        // is presale
        investment1[2].should.be.bignumber.equal(web3.toWei(0, 'ether'));   // Wei Amount
        investment1[3].should.be.bignumber.equal(web3.toWei(5, 'ether'));                        // Token Amount
        assert.isFalse(investment1[4]);                                     // Confirmed
        assert.isFalse(investment1[5]);                                     // AttemptedSettlement
        assert.isFalse(investment1[6]);                                     // CompletedSettlement

        // is crowdfundings
        investment2[2].should.be.bignumber.equal(web3.toWei(2, 'ether'));   // Wei Amount
        investment2[3].should.be.bignumber.equal(web3.toWei(2 * cnf.rateChfPerEth));                  // Token Amount
        assert.isTrue(investment2[4]);                                      // Confirmed
        assert.isFalse(investment2[5]);                                     // AttemptedSettlement
        assert.isFalse(investment2[6]);                                     // CompletedSettlement

        investment3[2].should.be.bignumber.equal(web3.toWei(3, 'ether'));   // Wei Amount
        investment3[3].should.be.bignumber.equal(web3.toWei(3 * cnf.rateChfPerEth));                 // Token Amount
        assert.isTrue(investment3[4]);                                      // Confirmed
        assert.isFalse(investment3[5]);                                     // AttemptedSettlement
        assert.isFalse(investment3[6]);                                     // CompletedSettlement

        investment4[2].should.be.bignumber.equal(web3.toWei(4, 'ether'));   // Wei Amount
        investment4[3].should.be.bignumber.equal(web3.toWei(4 * cnf.rateChfPerEth));                   // Token Amount
        assert.isTrue(investment4[4]);                                      // Confirmed
        assert.isFalse(investment4[5]);                                     // AttemptedSettlement
        assert.isFalse(investment4[6]);                                     // CompletedSettlement

        investment5[2].should.be.bignumber.equal(web3.toWei(5, 'ether'));   // Wei Amount
        investment5[3].should.be.bignumber.equal(web3.toWei(5 * cnf.rateChfPerEth));                 // Token Amount
        assert.isFalse(investment5[4]);                                     // Confirmed
        assert.isFalse(investment5[5]);                                     // AttemptedSettlement
        assert.isFalse(investment5[6]);                                     // CompletedSettlement

        investment6[2].should.be.bignumber.equal(web3.toWei(6, 'ether'));   // Wei Amount
        investment6[3].should.be.bignumber.equal(web3.toWei(6 * cnf.rateChfPerEth));                  // Token Amount
        assert.isFalse(investment6[4]);                                     // Confirmed
        assert.isFalse(investment6[5]);                                     // AttemptedSettlement
        assert.isFalse(investment6[6]);                                     // CompletedSettlement

        // let tokensMinted = await icoCrowdsaleInstance.tokensMinted();
        // let tokensToMint = await icoCrowdsaleInstance.tokensToMint();

        await icoCrowdsaleInstance.batchSettleInvestments([1, 2, 3], {from: activeInvestor2, gas: 1000000});

        const investmentAfter0   = await icoCrowdsaleInstance.investments(0);
        const investmentAfter1   = await icoCrowdsaleInstance.investments(1);
        const investmentAfter2   = await icoCrowdsaleInstance.investments(2);
        const investmentAfter3   = await icoCrowdsaleInstance.investments(3);
        const investmentAfter4   = await icoCrowdsaleInstance.investments(4);
        const investmentAfter5   = await icoCrowdsaleInstance.investments(5);
        const investmentAfter6   = await icoCrowdsaleInstance.investments(6);

        // is presale
        investmentAfter0[2].should.be.bignumber.equal(web3.toWei(0, 'ether'));  // Wei Amount
        investmentAfter0[3].should.be.bignumber.equal(web3.toWei(3, 'ether'));                      // Token Amount
        assert.isTrue(investmentAfter0[4]);                                     // Confirmed
        assert.isTrue(investmentAfter0[5]);                                     // AttemptedSettlement
        assert.isTrue(investmentAfter0[6]);                                     // CompletedSettlement

        // is presale
        investmentAfter1[2].should.be.bignumber.equal(web3.toWei(0, 'ether'));  // Wei Amount
        investmentAfter1[3].should.be.bignumber.equal(web3.toWei(5, 'ether'));                       // Token Amount
        assert.isFalse(investmentAfter1[4]);                                    // Confirmed
        assert.isTrue(investmentAfter1[5]);                                     // AttemptedSettlement
        assert.isFalse(investmentAfter1[6]);                                    // CompletedSettlement

        // is crowdfundings
        investmentAfter2[2].should.be.bignumber.equal(web3.toWei(2, 'ether'));  // Wei Amount
        investmentAfter2[3].should.be.bignumber.equal(web3.toWei(2 * cnf.rateChfPerEth));                 // Token Amount
        assert.isTrue(investmentAfter2[4]);                                     // Confirmed
        assert.isTrue(investmentAfter2[5]);                                     // AttemptedSettlement
        assert.isTrue(investmentAfter2[6]);                                     // CompletedSettlement

        investmentAfter3[2].should.be.bignumber.equal(web3.toWei(3, 'ether'));  // Wei Amount
        investmentAfter3[3].should.be.bignumber.equal(web3.toWei(3 * cnf.rateChfPerEth));              // Token Amount
        assert.isTrue(investmentAfter3[4]);                                     // Confirmed
        assert.isTrue(investmentAfter3[5]);                                     // AttemptedSettlement
        assert.isTrue(investmentAfter3[6]);                                     // CompletedSettlement

        investmentAfter4[2].should.be.bignumber.equal(web3.toWei(4, 'ether'));  // Wei Amount
        investmentAfter4[3].should.be.bignumber.equal(web3.toWei(4 * cnf.rateChfPerEth));                  // Token Amount
        assert.isTrue(investmentAfter4[4]);                                     // Confirmed
        assert.isFalse(investmentAfter4[5]);                                     // AttemptedSettlement
        assert.isFalse(investmentAfter4[6]);                                     // CompletedSettlement

        investmentAfter5[2].should.be.bignumber.equal(web3.toWei(5, 'ether'));  // Wei Amount
        investmentAfter5[3].should.be.bignumber.equal(web3.toWei(5 * cnf.rateChfPerEth));              // Token Amount
        assert.isFalse(investmentAfter5[4]);                                    // Confirmed
        assert.isFalse(investmentAfter5[5]);                                    // AttemptedSettlement
        assert.isFalse(investmentAfter5[6]);                                    // CompletedSettlement

        investmentAfter6[2].should.be.bignumber.equal(web3.toWei(6, 'ether'));  // Wei Amount
        investmentAfter6[3].should.be.bignumber.equal(web3.toWei(6 * cnf.rateChfPerEth));               // Token Amount
        assert.isFalse(investmentAfter6[4]);                                    // Confirmed
        assert.isFalse(investmentAfter6[5]);                                    // AttemptedSettlement
        assert.isFalse(investmentAfter6[6]);                                    // CompletedSettlement

        // do single settlement
        await icoCrowdsaleInstance.settleInvestment(4, {from: inactiveInvestor1, gas: 1000000});

        const investmentAfterA4   = await icoCrowdsaleInstance.investments(4);
        assert.isTrue(investmentAfterA4[6]);                                     // CompletedSettlement
    });

    it('should run settleInvestment for investment 5 (not confirmed)', async () => {
        const investment5 = await icoCrowdsaleInstance.investments(5);

        assert.equal(investment5[0], activeInvestor4);                      // Investor
        assert.equal(investment5[1], activeInvestor4);                      // Beneficiary
        investment5[2].should.be.bignumber.equal(web3.toWei(5, 'ether'));   // Wei Amount
        investment5[3].should.be.bignumber.equal(web3.toWei(5 * cnf.rateChfPerEth));                 // Token Amount
        assert.isFalse(investment5[4]);                                     // Confirmed
        assert.isFalse(investment5[5]);                                     // AttemptedSettlement
        assert.isFalse(investment5[6]);                                     // CompletedSettlement

        const etherVaultBefore        = await web3.eth.getBalance(vault);
        const etherInvestorBefore     = await web3.eth.getBalance(activeInvestor4);
        const tokenInvestor3Before    = await icoTokenInstance.balanceOf(activeInvestor4);

        // let tokensMinted = await icoCrowdsaleInstance.tokensMinted();
        // let tokensToMint = await icoCrowdsaleInstance.tokensToMint();

        await icoCrowdsaleInstance.settleInvestment(5, {from: inactiveInvestor1, gas: 1000000});

        // tokensMinted = await icoCrowdsaleInstance.tokensMinted();
        // tokensToMint = await icoCrowdsaleInstance.tokensToMint();

        const etherVaultAfter         = await web3.eth.getBalance(vault);
        const etherInvestorAfter      = await web3.eth.getBalance(activeInvestor4);
        const tokenInvestor3After     = await icoTokenInstance.balanceOf(activeInvestor4);

        etherVaultBefore.sub(etherVaultAfter).should.be.bignumber.equal(web3.toWei(5, 'ether'));
        etherInvestorBefore.add(web3.toWei(5, 'ether')).should.be.bignumber.equal(etherInvestorAfter);
        tokenInvestor3Before.should.be.bignumber.equal(tokenInvestor3After);
    });

    it('should settle unconfirmed investment non non-payable beneficiary wallet (token contract)', async () => {
        await web3.eth.getBalance(vault);
        await icoCrowdsaleInstance.batchSettleInvestments([6, 7]);
        await web3.eth.getBalance(vault);

        const investmentAfter = await icoCrowdsaleInstance.investments(7);

        investmentAfter[2].should.be.bignumber.equal(web3.toWei(7, 'ether'));   // Wei Amount
        investmentAfter[3].should.be.bignumber.equal(web3.toWei(7 * cnf.rateChfPerEth));  // TokenAmount
        assert.isFalse(investmentAfter[4]);                                     // Confirmed
        assert.isTrue(investmentAfter[5]);                                      // AttemptedSettlement
    });

    it('check balance of wallet (account[6] vs vault balance, pre-finalize)', async () => {
        const vaultBalance = await web3.eth.getBalance(vault);
        const walletBalance =  await web3.eth.getBalance(wallet);

        assert.equal(vaultBalance.toNumber(), web3.toWei(9, 'ether'), 'wrong vault balance');
        assert.equal(walletBalance.toNumber() - initialWalletBalance.toNumber(), 0, 'wrong wallet balance');
    });

    it('should call finalize successfully', async () => {
        console.log('[ Finalize Crowdsale ]'.yellow);

        // const tokensMinted = await icoCrowdsaleInstance.tokensMinted();
        // const tokensToMint = await icoCrowdsaleInstance.tokensToMint();

        const ownerBalance = await icoTokenInstance.balanceOf(owner);
        const activeManagerBalance = await icoTokenInstance.balanceOf(activeManager);
        const inactiveManagerBalance = await icoTokenInstance.balanceOf(inactiveManager);
        const activeInvestor1Balance = await icoTokenInstance.balanceOf(activeInvestor1);
        const activeInvestor2Balance = await icoTokenInstance.balanceOf(activeInvestor2);
        const activeInvestor3Balance = await icoTokenInstance.balanceOf(activeInvestor3);
        const activeInvestor4Balance = await icoTokenInstance.balanceOf(activeInvestor4);
        const activeInvestor5Balance = await icoTokenInstance.balanceOf(activeInvestor5);
        const inactiveInvestor1Balance = await icoTokenInstance.balanceOf(inactiveInvestor1);
        const walletBalance = await icoTokenInstance.balanceOf(wallet);

        const totalSum = ownerBalance.add(activeManagerBalance).add(inactiveManagerBalance).add(activeInvestor1Balance)
            .add(activeInvestor2Balance).add(activeInvestor3Balance).add(activeInvestor4Balance).add(activeInvestor5Balance)
            .add(inactiveInvestor1Balance).add(walletBalance);
        const totalSupply = await icoTokenInstance.totalSupply();
        assert.equal(totalSupply.toNumber(), totalSum.toNumber(), 'SRC Token balances not equal');

        let transfersEnabled = await icoTokenInstance.transfersEnabled();
        assert.isFalse(transfersEnabled);

        await icoCrowdsaleInstance.finalize({from: owner, gas: 1000000});

        transfersEnabled = await icoTokenInstance.transfersEnabled();
        assert.isTrue(transfersEnabled);
    });

    it('check balance of wallet (account[6] vs vault balance, post-finalize)', async () => {
        const vaultBalance = await web3.eth.getBalance(vault);
        const walletBalance =  await web3.eth.getBalance(wallet);

        assert.equal(vaultBalance.toNumber(), 0, 'wrong vault balance');
        assert.equal(walletBalance.toNumber() - initialWalletBalance.toNumber(), 8999999999957795000, 'wrong wallet balance');
    });

    it('check to make sure crowdsale is closed and finalized', async () => {
        const hasClosed     = await icoCrowdsaleInstance.hasClosed();
        const isFinalized   = await icoCrowdsaleInstance.isFinalized();
        const state         = await autoRefundVaultInstance.state();

        assert.equal(hasClosed, true, 'hasClosed wrong value');
        assert.equal(isFinalized, true, 'isFinalized wrong value');
        assert.equal(state, 1, 'wrong vault state');
    });

    it('2nd should fail, because we try to mint tokens for presale with a non active crowdsale', async () => {
        await expectThrow(icoCrowdsaleInstance.mintPresaleTokens(activeInvestor1, 1, {from: owner, gas: 1000000}));
    });

    it('2nd should fail, because we try to trigger buyTokens in before contribution time is started', async () => {
        await expectThrow(icoCrowdsaleInstance.buyTokens(activeInvestor1, {from: activeInvestor2, gas: 1000000}));
    });

    it('2nd should fail, because we try to trigger the fallback function before contribution time is started', async () => {
        await expectThrow(icoCrowdsaleInstance.sendTransaction({
            from:   owner,
            value:  web3.toWei(1, 'ether'),
            gas:    700000
        }));
    });

    /*
    * !!! Reopen crowdsale for 2nd round !!!
    */

    it('should fail, because we try to trigger a new crowdsale with invalid parameters: startTime', async () => {
        const newStartTime = cnf.endTimeTesting; // Thursday, August 1, 2019 12:00:00 AM
        const duration = 0; // 30 days
        const rate = 800; // 800 CHF per 1 ether
        const deltaCap = 30e6 * 1e18; // 30,000,000 delta cap

        await expectThrow(icoCrowdsaleInstance.newCrowdsale(newStartTime, duration, rate, deltaCap));
    });

    it('should fail, because we try to trigger a new crowdsale with invalid parameters: duration', async () => {
        const newStartTime = 1564617600; // Thursday, August 1, 2019 12:00:00 AM
        const duration = 0; // 30 days
        const rate = 800; // 800 CHF per 1 ether
        const deltaCap = 30e6 * 1e18; // 30,000,000 delta cap

        await expectThrow(icoCrowdsaleInstance.newCrowdsale(newStartTime, duration, rate, deltaCap));
    });

    it('should fail, because we try to trigger a new crowdsale with invalid parameters: deltacap', async () => {
        const newStartTime = 1564617600; // Thursday, August 1, 2019 12:00:00 AM
        const duration = oneDay * 30; // 30 days
        const rate = 800; // 800 CHF per 1 ether
        const deltaCap = 0; // 0

        await expectThrow(icoCrowdsaleInstance.newCrowdsale(newStartTime, duration, rate, deltaCap));
    });

    it('should fail, because we try to trigger a new crowdsale with invalid parameters: rate', async () => {
        const newStartTime = 1564617600; // Thursday, August 1, 2019 12:00:00 AM
        const duration = oneDay * 30; // 30 days
        const rate = 0; //
        const deltaCap = 30e6 * 1e18; // 30,000,000 delta cap

        await expectThrow(icoCrowdsaleInstance.newCrowdsale(newStartTime, duration, rate, deltaCap));
    });

    // newCrowdsale(uint256 _start, uint256 _duration, uint256 _rateChfPerEth, uint256 _deltaTokenCap)
    it('reopen crowdsale for another token sale', async () => {
        console.log('[ Establish 2nd Crowdsale Round ]'.yellow);

        const tx = await icoCrowdsaleInstance.newCrowdsale(newStartTime, newDuration, newRate, deltaCap);

        const events = getEvents(tx, 'NewCrowdsaleRound');

        // start, uint256 duration, uint256 rate, uint256 detaTokenCap
        assert.equal(events[0].start, newStartTime, 'start time !=');
        assert.equal(events[0].duration, newDuration, 'duration !=');
        assert.equal(events[0].rate, newRate, 'rate !=');
        assert.equal(events[0].detaTokenCap, deltaCap, 'deltacap !=');

        const hasClosed     = await icoCrowdsaleInstance.hasClosed();
        const isFinalized   = await icoCrowdsaleInstance.isFinalized();
        const state         = await autoRefundVaultInstance.state();

        assert.equal(hasClosed, false, 'hasClosed wrong value');
        assert.equal(isFinalized, false, 'isFinalized wrong value');
        assert.equal(state, 0, 'wrong vault state');

        startTime       = await icoCrowdsaleInstance.openingTime();
        endTime              = await icoCrowdsaleInstance.closingTime();
        const _chfPerEth     = await icoCrowdsaleInstance.rate();
        const _wallet        = await icoCrowdsaleInstance.wallet();
        confirmationPeriod   = await icoCrowdsaleInstance.confirmationPeriod();

        startTime.should.be.bignumber.equal(newStartTime);
        endTime.should.be.bignumber.equal(newStartTime + newDuration);
        _chfPerEth.should.be.bignumber.equal(newRate);
        _wallet.should.be.equal(wallet);
        confirmationPeriod.should.be.bignumber.equal(60 * 60 * 24 * 30);
    });

    it('should not be able to mint more tokens from owner account (previous wallet deployer)', async () => {
        await expectThrow(icoTokenInstance.generateTokens(owner, 1, {from: owner, gas: 1000000}));
    });

    it('should verify the vault wallet (beneficiary address)', async () => {
        autoRefundVaultInstance = await AutoRefundVault.at(vault);
        vaultWallet = await autoRefundVaultInstance.wallet();
        const state = await autoRefundVaultInstance.state();
        const occurrence = await autoRefundVaultInstance.occurrence();
        const vaultBalance = await web3.eth.getBalance(vault);
        initialWalletBalance = await web3.eth.getBalance(wallet);

        assert.equal(occurrence.toNumber(), 1, 'occurrences !=');
        assert.equal(vaultBalance.toNumber(), 0, 'vault balance not equal');
        assert.equal(state, 0, 'Vault state is not equal');
        assert.equal(vaultWallet, wallet, 'Vault wallet is not equal');
    });

    it('should verify SRC token is transferable', async () => {
        const transfersEnabled = await icoTokenInstance.transfersEnabled();
        assert.isTrue(transfersEnabled);
    });

    it('2nd should batch mint tokens for presale', async () => {
        const three                     = web3.toWei(3, 'ether');
        const five                      = web3.toWei(5, 'ether');

        // const tx1 = await icoCrowdsaleInstance.mintPresaleTokens(activeInvestor1, three);   // investments(8)
        // const tx2 = await icoCrowdsaleInstance.mintPresaleTokens(activeInvestor2, five);    // investments(9)

        const tx1 = await icoCrowdsaleInstance.batchMintTokenPresale([activeInvestor1, activeInvestor2], [three, five]);    // investments(8) && 9

        const investment8 = await icoCrowdsaleInstance.investments(8);

        assert.equal(investment8[0], owner, 'owner does not match purchaser');  // Investor
        assert.equal(investment8[1], activeInvestor1, 'activeInvestor2 does not match beneficiary');// Beneficiary
        investment8[2].should.be.bignumber.equal(0);                           // Wei Amount
        investment8[3].should.be.bignumber.equal(three);                // Token Amount
        assert.isFalse(investment8[4]);                                                             // Confirmed
        assert.isFalse(investment8[5]);                                                             // AttemptedSettlement
        assert.isFalse(investment8[6]);                                                             // CompletedSettlement

        const investment9 = await icoCrowdsaleInstance.investments(9);

        assert.equal(investment9[0], owner, 'owner does not match purchaser');  // Investor
        assert.equal(investment9[1], activeInvestor2, 'activeInvestor2 does not match beneficiary');// Beneficiary
        investment9[2].should.be.bignumber.equal(0);                           // Wei Amount
        investment9[3].should.be.bignumber.equal(five);                // Token Amount
        assert.isFalse(investment9[4]);                                                             // Confirmed
        assert.isFalse(investment9[5]);                                                             // AttemptedSettlement
        assert.isFalse(investment9[6]);                                                             // CompletedSettlement

        const activeInvestor1Balance2 = await icoTokenInstance.balanceOf(activeInvestor1);
        const activeInvestor2Balance2 = await icoTokenInstance.balanceOf(activeInvestor2);

        assert.equal(activeInvestor1Balance2.toNumber(), 2.003e+21);
        assert.equal(activeInvestor2Balance2.toNumber(), 0);

        // Testing events
        const events1 = getEvents(tx1, 'PresalePurchase');
        // const events2 = getEvents(tx2, 'PresalePurchase');

        assert.equal(events1[0].beneficiary, activeInvestor1, '');
        assert.equal(events1[1].beneficiary, activeInvestor2, '');

        events1[0].tokenAmount.should.be.bignumber.equal(three);
        events1[1].tokenAmount.should.be.bignumber.equal(five);
    });

    it('should fail batch mint tokens for presale as amount.length != beneficiary.length', async () => {
        const three                     = web3.toWei(3, 'ether');
        await expectThrow(icoCrowdsaleInstance.batchMintTokenPresale([activeInvestor1, activeInvestor2], [three]));
    });

    it('2nd-2 should fail, because we try to trigger buyTokens in before contribution time is started', async () => {
        await expectThrow(icoCrowdsaleInstance.buyTokens(activeInvestor1, {from: activeInvestor2, gas: 1000000}));
    });

    it('2nd-2 should fail, because we try to trigger the fallback function before contribution time is started', async () => {
        await expectThrow(icoCrowdsaleInstance.sendTransaction({
            from:   owner,
            value:  web3.toWei(1, 'ether'),
            gas:    700000
        }));
    });

    /**
     * [2nd Contribution period ]
     */

    it('2nd increase time to accept investments', async () => {
        console.log('[ 2nd Contribution period ]'.yellow);
        await increaseTimeTo(1564617600);
    });

    it('2nd should buyTokens properly', async () => {
        const tx    = await icoCrowdsaleInstance.buyTokens(     // investments(10)
            activeInvestor2,
            {from: activeInvestor2, gas: 1000000, value: web3.toWei(2, 'ether')}
        );

        const investment2 = await icoCrowdsaleInstance.investments(10);

        assert.equal(investment2[0], activeInvestor2, 'activeInvestor2 does not match purchaser');  // Investor
        assert.equal(investment2[1], activeInvestor2, 'activeInvestor2 does not match beneficiary');// Beneficiary
        investment2[2].should.be.bignumber.equal(web3.toWei(2, 'ether'));                           // Wei Amount
        investment2[3].should.be.bignumber.equal(web3.toWei(2 * newRate));                // Token Amount
        assert.isFalse(investment2[4]);                                                             // Confirmed
        assert.isFalse(investment2[5]);                                                             // AttemptedSettlement
        assert.isFalse(investment2[6]);                                                             // CompletedSettlement

        // Testing events
        const events = getEvents(tx, 'TokenPurchase');

        assert.equal(events[0].purchaser, activeInvestor2, 'event activeInvestor2 does not match purchaser');
        assert.equal(events[0].beneficiary, activeInvestor2, 'event activeInvestor2 does not match beneficiary');
        events[0].value.should.be.bignumber.equal(web3.toWei(2, 'ether'));
        events[0].amount.should.be.bignumber.equal(web3.toWei(2 * newRate));

        const vaultBalance = await web3.eth.getBalance(vault);
        assert.equal(vaultBalance.toNumber(), web3.toWei(2, 'ether'), 'vault balance not equal');
    });

    it('2nd should call the fallback function successfully', async () => {
        const tx1   = await icoCrowdsaleInstance.sendTransaction({  // investments(9)
            from:   activeInvestor1,
            value:  web3.toWei(4, 'ether'),
            gas:    1000000
        });

        const investment11 = await icoCrowdsaleInstance.investments(11);

        assert.equal(investment11[0], activeInvestor1);                      // Investor
        assert.equal(investment11[1], activeInvestor1);                      // Beneficiary
        investment11[2].should.be.bignumber.equal(web3.toWei(4, 'ether'));   // Wei Amount
        investment11[3].should.be.bignumber.equal(web3.toWei(4 * newRate));                 // Token Amount
        assert.isFalse(investment11[4]);                                     // Confirmed
        assert.isFalse(investment11[5]);                                     // AttemptedSettlement
        assert.isFalse(investment11[6]);                                     // CompletedSettlement

        // Testing events
        const events1 = getEvents(tx1, 'TokenPurchase');

        assert.equal(events1[0].purchaser, activeInvestor1, 'activeInvestor1 does not match purchaser');
        assert.equal(events1[0].beneficiary, activeInvestor1, 'activeInvestor1 does not match beneficiary');

        events1[0].value.should.be.bignumber.equal(web3.toWei(4, 'ether'));
        events1[0].amount.should.be.bignumber.equal(web3.toWei(4 * newRate));

        const tx2   = await icoCrowdsaleInstance.sendTransaction({
            from:   activeInvestor3,
            value:  web3.toWei(4, 'ether'),
            gas:    1000000
        });

        const investment12 = await icoCrowdsaleInstance.investments(12);

        assert.equal(investment12[0], activeInvestor3);                      // Investor
        assert.equal(investment12[1], activeInvestor3);                      // Beneficiary
        investment12[2].should.be.bignumber.equal(web3.toWei(4, 'ether'));   // Wei Amount
        investment12[3].should.be.bignumber.equal(web3.toWei(4 * newRate));                   // Token Amoun
        assert.isFalse(investment12[4]);                                     // Confirmed
        assert.isFalse(investment12[5]);                                     // AttemptedSettlement
        assert.isFalse(investment12[6]);                                     // CompletedSettlement

        // Testing events
        const events2 = getEvents(tx2, 'TokenPurchase');

        assert.equal(events2[0].purchaser, activeInvestor3, 'activeInvestor3 does not match purchaser');
        assert.equal(events2[0].beneficiary, activeInvestor3, 'activeInvestor3 does not match beneficiary');

        events2[0].value.should.be.bignumber.equal(web3.toWei(4, 'ether'));
        events2[0].amount.should.be.bignumber.equal(web3.toWei(4 * newRate));

        const tx3   = await icoCrowdsaleInstance.sendTransaction({
            from:   activeInvestor4,
            value:  web3.toWei(5, 'ether'),
            gas:    1000000
        });

        const investment13 = await icoCrowdsaleInstance.investments(13);

        assert.equal(investment13[0], activeInvestor4, 'activeInvestor4 does not match purchaser');                      // Investor
        assert.equal(investment13[1], activeInvestor4, 'activeInvestor4 does not match beneficiary');                      // Beneficiary
        investment13[2].should.be.bignumber.equal(web3.toWei(5, 'ether'));   // Wei Amount
        investment13[3].should.be.bignumber.equal(web3.toWei(5 * newRate));                 // Token Amount
        assert.isFalse(investment13[4]);                                     // Confirmed
        assert.isFalse(investment13[5]);                                     // AttemptedSettlement
        assert.isFalse(investment13[6]);                                     // CompletedSettlement

        // Testing events
        const events3 = getEvents(tx3, 'TokenPurchase');

        assert.equal(events3[0].purchaser, activeInvestor4, 'activeInvestor4 does not match purchaser');
        assert.equal(events3[0].beneficiary, activeInvestor4, 'activeInvestor4 does not match beneficiary');

        events3[0].value.should.be.bignumber.equal(web3.toWei(5, 'ether'));
        events3[0].amount.should.be.bignumber.equal(web3.toWei(5 * newRate));
    });

    // Time runs out - close 2nd crowdsale
    it('2nd increase time to end 2nd crowdsale', async () => {
        console.log('[ 2nd Confirmation period ]'.yellow);
        await increaseTimeTo(newStartTime + newDuration + 1);
    });

    it('should not be able to mint more tokens from owner account (previous wallet deployer) as 2nd crowdsale is over', async () => {
        await expectThrow(icoTokenInstance.generateTokens(owner, 1, {from: owner, gas: 1000000}));
    });

    it('2nd should fail, because we try to trigger buyTokens after crowdsale is over', async () => {
        await expectThrow(icoCrowdsaleInstance.buyTokens(activeInvestor1, {from: activeInvestor2, gas: 1000000}));
    });

    // 2nd Confirmation period
    it('2nd should trigger confirmPayment successfully', async () => {
        const tx            = await icoCrowdsaleInstance.confirmPayment(8, {from: activeManager, gas: 1000000});
        const tx2           = await icoCrowdsaleInstance.confirmPayment(9, {from: activeManager, gas: 1000000});
        const events        = getEvents(tx, 'ChangedInvestmentConfirmation');
        const events2       = getEvents(tx2, 'ChangedInvestmentConfirmation');

        const investment8   = await icoCrowdsaleInstance.investments(8);
        const investment9   = await icoCrowdsaleInstance.investments(9);
        const investment10  = await icoCrowdsaleInstance.investments(10);
        const investment11  = await icoCrowdsaleInstance.investments(11);
        const investment12  = await icoCrowdsaleInstance.investments(12);
        const investment13  = await icoCrowdsaleInstance.investments(13);

        // is presale
        assert.equal(investment8[0], owner, '0: Investor wrong');   // Investor
        assert.equal(investment8[1], activeInvestor1, '0: Beneficiary wrong');                           // Beneficiary
        investment8[2].should.be.bignumber.equal(web3.toWei(0, 'ether'), '0: Wei amount wrong');         // Wei Amount
        investment8[3].should.be.bignumber.equal(web3.toWei(3, 'ether'), '0: Token amount wrong');         // Token Amount
        assert.isTrue(investment8[4], '0: Confirmed wrong');                                             // Confirmed
        assert.isFalse(investment8[5], '0: AttemptedSettlement wrong');                                  // AttemptedSettlement
        assert.isFalse(investment8[6], '0: CompletedSettlement wrong');                                  // CompletedSettlement

        // is presale
        assert.equal(investment9[0], owner);   // Investor
        assert.equal(investment9[1], activeInvestor2);                              // Beneficiary
        investment9[2].should.be.bignumber.equal(web3.toWei(0, 'ether'));           // Wei Amount
        investment9[3].should.be.bignumber.equal(web3.toWei(5, 'ether'));                             // Token Amount
        assert.isTrue(investment9[4]);                                             // Confirmed
        assert.isFalse(investment9[5]);                                             // AttemptedSettlement
        assert.isFalse(investment9[6]);                                             // CompletedSettlement

        // is crowdsales
        assert.equal(investment10[0], activeInvestor2);                      // Investor
        assert.equal(investment10[1], activeInvestor2);                      // Beneficiary
        investment10[2].should.be.bignumber.equal(web3.toWei(2, 'ether'));   // Wei Amount
        investment10[3].should.be.bignumber.equal(web3.toWei(2 * newRate));                  // Token Amount
        assert.isFalse(investment10[4]);                                      // Confirmed
        assert.isFalse(investment10[5]);                                     // AttemptedSettlement
        assert.isFalse(investment10[6]);                                     // CompletedSettlement

        assert.equal(investment11[0], activeInvestor1);                      // Investor
        assert.equal(investment11[1], activeInvestor1);                      // Beneficiary
        investment11[2].should.be.bignumber.equal(web3.toWei(4, 'ether'));   // Wei Amount
        investment11[3].should.be.bignumber.equal(web3.toWei(4 * newRate));                 // Token Amount
        assert.isFalse(investment11[4]);                                     // Confirmed
        assert.isFalse(investment11[5]);                                     // AttemptedSettlement
        assert.isFalse(investment11[6]);                                     // CompletedSettlement

        assert.equal(investment12[0], activeInvestor3);                      // Investor
        assert.equal(investment12[1], activeInvestor3);                      // Beneficiary
        investment12[2].should.be.bignumber.equal(web3.toWei(4, 'ether'));   // Wei Amount
        investment12[3].should.be.bignumber.equal(web3.toWei(4 * newRate));                   // Token Amount
        assert.isFalse(investment12[4]);                                     // Confirmed
        assert.isFalse(investment12[5]);                                     // AttemptedSettlement
        assert.isFalse(investment12[6]);                                     // CompletedSettlement

        assert.equal(investment13[0], activeInvestor4);                      // Investor
        assert.equal(investment13[1], activeInvestor4);                      // Beneficiary
        investment13[2].should.be.bignumber.equal(web3.toWei(5, 'ether'));   // Wei Amount
        investment13[3].should.be.bignumber.equal(web3.toWei(5 * newRate));                 // Token Amount
        assert.isFalse(investment13[4]);                                     // Confirmed
        assert.isFalse(investment13[5]);                                     // AttemptedSettlement
        assert.isFalse(investment13[6]);                                     // CompletedSettlement

        assert.equal(events[0].investmentId.toNumber(), 8);
        assert.equal(events[0].investor, owner);
        assert.isTrue(events[0].confirmed);

        assert.equal(events2[0].investmentId.toNumber(), 9);
        assert.equal(events2[0].investor, owner);
        assert.isTrue(events2[0].confirmed);
    });

    it('should run batchConfirmPayments() successfully', async () => {
        const tx = await icoCrowdsaleInstance.batchConfirmPayments(
            [10, 11, 12, 13],
            {from: activeManager, gas: 1000000}
        );

        const events        = getEvents(tx, 'ChangedInvestmentConfirmation');
        const investment6   = await icoCrowdsaleInstance.investments(10);

        assert.equal(investment6[0], activeInvestor2);                      // Investor
        assert.equal(investment6[1], activeInvestor2);                      // Beneficiary
        investment6[2].should.be.bignumber.equal(web3.toWei(2, 'ether'));   // Wei Amount
        investment6[3].should.be.bignumber.equal(web3.toWei(2 * newRate));                // Token Amount
        assert.isTrue(investment6[4]);                                     // Confirmed
        assert.isFalse(investment6[5]);                                     // AttemptedSettlement
        assert.isFalse(investment6[6]);                                     // CompletedSettlement

        assert.equal(events[0].investmentId.toNumber(), 10);
        assert.equal(events[0].investor, activeInvestor2);
        assert.isTrue(events[0].confirmed);

        assert.equal(events[1].investmentId.toNumber(), 11);
        assert.equal(events[1].investor, activeInvestor1);
        assert.isTrue(events[1].confirmed);

        // is crowdsales
        assert.equal(events[2].investmentId.toNumber(), 12);
        assert.equal(events[2].investor, activeInvestor3);
        assert.isTrue(events[2].confirmed);

        assert.equal(events[3].investmentId.toNumber(), 13);
        assert.equal(events[3].investor, activeInvestor4);
        assert.isTrue(events[3].confirmed);
    });

    it('2nd should run unConfirmPayment() successfully', async () => {
        const tx            = await icoCrowdsaleInstance.unConfirmPayment(10, {from: activeManager, gas: 1000000});
        const events        = getEvents(tx, 'ChangedInvestmentConfirmation');

        const investment8   = await icoCrowdsaleInstance.investments(8);
        const investment9   = await icoCrowdsaleInstance.investments(9);
        const investment10  = await icoCrowdsaleInstance.investments(10);
        const investment11  = await icoCrowdsaleInstance.investments(11);
        const investment12  = await icoCrowdsaleInstance.investments(12);
        const investment13  = await icoCrowdsaleInstance.investments(13);

        // is presale
        assert.equal(investment8[0], owner, '0: Investor wrong');   // Investor
        assert.equal(investment8[1], activeInvestor1, '0: Beneficiary wrong');                           // Beneficiary
        investment8[2].should.be.bignumber.equal(web3.toWei(0, 'ether'), '0: Wei amount wrong');         // Wei Amount
        investment8[3].should.be.bignumber.equal(web3.toWei(3, 'ether'), '0: Token amount wrong');         // Token Amount
        assert.isTrue(investment8[4], '0: Confirmed wrong');                                             // Confirmed
        assert.isFalse(investment8[5], '0: AttemptedSettlement wrong');                                  // AttemptedSettlement
        assert.isFalse(investment8[6], '0: CompletedSettlement wrong');                                  // CompletedSettlement

        // is presale
        assert.equal(investment9[0], owner);   // Investor
        assert.equal(investment9[1], activeInvestor2);                              // Beneficiary
        investment9[2].should.be.bignumber.equal(web3.toWei(0, 'ether'));           // Wei Amount
        investment9[3].should.be.bignumber.equal(web3.toWei(5, 'ether'));                             // Token Amount
        assert.isTrue(investment9[4]);                                             // Confirmed
        assert.isFalse(investment9[5]);                                             // AttemptedSettlement
        assert.isFalse(investment9[6]);                                             // CompletedSettlement

        // is crowdsales
        assert.equal(investment10[0], activeInvestor2);                      // Investor
        assert.equal(investment10[1], activeInvestor2);                      // Beneficiary
        investment10[2].should.be.bignumber.equal(web3.toWei(2, 'ether'));   // Wei Amount
        investment10[3].should.be.bignumber.equal(web3.toWei(2 * newRate));                  // Token Amount
        assert.isFalse(investment10[4]);                                      // Confirmed
        assert.isFalse(investment10[5]);                                     // AttemptedSettlement
        assert.isFalse(investment10[6]);                                     // CompletedSettlement

        assert.equal(investment11[0], activeInvestor1);                      // Investor
        assert.equal(investment11[1], activeInvestor1);                      // Beneficiary
        investment11[2].should.be.bignumber.equal(web3.toWei(4, 'ether'));   // Wei Amount
        investment11[3].should.be.bignumber.equal(web3.toWei(4 * newRate));                 // Token Amount
        assert.isTrue(investment11[4]);                                     // Confirmed
        assert.isFalse(investment11[5]);                                     // AttemptedSettlement
        assert.isFalse(investment11[6]);                                     // CompletedSettlement

        assert.equal(investment12[0], activeInvestor3);                      // Investor
        assert.equal(investment12[1], activeInvestor3);                      // Beneficiary
        investment12[2].should.be.bignumber.equal(web3.toWei(4, 'ether'));   // Wei Amount
        investment12[3].should.be.bignumber.equal(web3.toWei(4 * newRate));                   // Token Amount
        assert.isTrue(investment12[4]);                                     // Confirmed
        assert.isFalse(investment12[5]);                                     // AttemptedSettlement
        assert.isFalse(investment12[6]);                                     // CompletedSettlement

        assert.equal(investment13[0], activeInvestor4);                      // Investor
        assert.equal(investment13[1], activeInvestor4);                      // Beneficiary
        investment13[2].should.be.bignumber.equal(web3.toWei(5, 'ether'));   // Wei Amount
        investment13[3].should.be.bignumber.equal(web3.toWei(5 * newRate));                 // Token Amount
        assert.isTrue(investment13[4]);                                     // Confirmed
        assert.isFalse(investment13[5]);                                     // AttemptedSettlement
        assert.isFalse(investment13[6]);                                     // CompletedSettlement

        assert.equal(events[0].investmentId.toNumber(), 10);
        assert.equal(events[0].investor, activeInvestor2);
        assert.isFalse(events[0].confirmed);
    });

    it('should fail, because we try to trigger batchConfirmPayments with non manager account', async () => {
        await expectThrow(icoCrowdsaleInstance.batchConfirmPayments([8, 9], {from: inactiveManager, gas: 1000000}));
    });

    it('should fail, because we try to trigger settleInvestment before confirmation period is over', async () => {
        await expectThrow(icoCrowdsaleInstance.settleInvestment(11, {from: activeManager, gas: 1000000}));
    });

    it('should fail, because we try to trigger batchSettleInvestments before confirmation period is over', async () => {
        await expectThrow(icoCrowdsaleInstance.batchSettleInvestments([11, 12, 13], {from: activeManager, gas: 1000000}));
    });

    it('should fail, because we try to trigger finalize before confirmation period is over', async () => {
        await expectThrow(icoCrowdsaleInstance.finalize());
    });

    // Time runs out - close Confirmation period
    it('2nd increase time to end 2nd crowdsale', async () => {
        console.log('[ 2nd Settlement Period ]'.yellow);
        await waitNDays(30);
    });

    // Start 2nd Settlement tests
    it('should fail, because we try to trigger a new crowdsale before the 2nd is finalized', async () => {
        const newStartTime = 1575158400; // Sunday, December 1, 2019 12:00:00 AM
        const duration = oneDay * 30; // 30 days
        const rate = 1200; // 800 CHF per 1 ether
        const deltaCap = 40e6 * 1e18; // 40,000,000 delta cap

        await expectThrow(icoCrowdsaleInstance.newCrowdsale(newStartTime, duration, rate, deltaCap));
    });

    it('should fail, because we try to mint tokens for presale after Confirmation period is over', async () => {
        await expectThrow(icoCrowdsaleInstance.mintPresaleTokens(activeInvestor1, 1));
    });

    it('should fail, because we try to trigger confirmPayment after Confirmation period is over', async () => {
        await expectThrow(icoCrowdsaleInstance.confirmPayment(10, {from: activeManager, gas: 1000000}));
    });

    it('should fail, because we try to trigger batchConfirmPayments after Confirmation period is over', async () => {
        await expectThrow(icoCrowdsaleInstance.batchConfirmPayments([11, 12], {from: activeManager, gas: 1000000}));
    });

    it('should fail, because we try to trigger unConfirmPayment after Confirmation period is over', async () => {
        await expectThrow(icoCrowdsaleInstance.unConfirmPayment(8, {from: activeManager, gas: 1000000}));
    });

    it('should fail, because we try to trigger first settleInvestments with investmentId > 8', async () => {
        await expectThrow(icoCrowdsaleInstance.settleInvestment(12, {from: activeInvestor1, gas: 1000000}));
    });

    it('should fail, because we try to trigger first batchSettleInvestments with wrong investmentId order', async () => {
        await expectThrow(icoCrowdsaleInstance.batchSettleInvestments([10, 8, 9], {from: activeInvestor2, gas: 1000000}));
    });

    it('should run settleInvestment for first investment successfully', async () => {
        // So know that going in, investments[8 & 9] are presale investments that have owner listed as the investor address and 0 value for the wei.
        // They have a beneficiary address and a token amount.

        const investment8   = await icoCrowdsaleInstance.investments(8);
        const investment9   = await icoCrowdsaleInstance.investments(9);
        const investment10  = await icoCrowdsaleInstance.investments(10);
        const investment11  = await icoCrowdsaleInstance.investments(11);
        const investment12  = await icoCrowdsaleInstance.investments(12);
        const investment13  = await icoCrowdsaleInstance.investments(13);

        // is presale
        investment8[2].should.be.bignumber.equal(web3.toWei(0, 'ether'));   // Wei Amount
        investment8[3].should.be.bignumber.equal(web3.toWei(3, 'ether'));   // Token Amount
        assert.isTrue(investment8[4]);                                      // Confirmed
        assert.isFalse(investment8[5]);                                     // AttemptedSettlement
        assert.isFalse(investment8[6]);                                     // CompletedSettlement

        // is presale
        investment9[2].should.be.bignumber.equal(web3.toWei(0, 'ether'));   // Wei Amount
        investment9[3].should.be.bignumber.equal(web3.toWei(5, 'ether'));   // Token Amount
        assert.isTrue(investment9[4]);                                     // Confirmed
        assert.isFalse(investment9[5]);                                     // AttemptedSettlement
        assert.isFalse(investment9[6]);                                     // CompletedSettlement

        // is crowdsales
        investment10[2].should.be.bignumber.equal(web3.toWei(2, 'ether'));   // Wei Amount
        investment10[3].should.be.bignumber.equal(web3.toWei(2 * newRate));  // Token Amount
        assert.isFalse(investment10[4]);                                      // Confirmed
        assert.isFalse(investment10[5]);                                     // AttemptedSettlement
        assert.isFalse(investment10[6]);                                     // CompletedSettlement

        investment11[2].should.be.bignumber.equal(web3.toWei(4, 'ether'));   // Wei Amount
        investment11[3].should.be.bignumber.equal(web3.toWei(4 * newRate));                 // Token Amount
        assert.isTrue(investment11[4]);                                      // Confirmed
        assert.isFalse(investment11[5]);                                     // AttemptedSettlement
        assert.isFalse(investment11[6]);                                     // CompletedSettlement

        investment12[2].should.be.bignumber.equal(web3.toWei(4, 'ether'));   // Wei Amount
        investment12[3].should.be.bignumber.equal(web3.toWei(4 * newRate));                   // Token Amount
        assert.isTrue(investment12[4]);                                      // Confirmed
        assert.isFalse(investment12[5]);                                     // AttemptedSettlement
        assert.isFalse(investment12[6]);                                     // CompletedSettlement

        investment13[2].should.be.bignumber.equal(web3.toWei(5, 'ether'));   // Wei Amount
        investment13[3].should.be.bignumber.equal(web3.toWei(5 * newRate));                 // Token Amount
        assert.isTrue(investment13[4]);                                     // Confirmed
        assert.isFalse(investment13[5]);                                     // AttemptedSettlement
        assert.isFalse(investment13[6]);                                     // CompletedSettlement

        // let tokensMinted = await icoCrowdsaleInstance.tokensMinted();
        // let tokensToMint = await icoCrowdsaleInstance.tokensToMint();

        await icoCrowdsaleInstance.settleInvestment(8, {from: inactiveInvestor1, gas: 1000000});

        // tokensMinted = await icoCrowdsaleInstance.tokensMinted();
        // tokensToMint = await icoCrowdsaleInstance.tokensToMint();

        const investmentAfter8   = await icoCrowdsaleInstance.investments(8);
        const investmentAfter9   = await icoCrowdsaleInstance.investments(9);
        const investmentAfter10  = await icoCrowdsaleInstance.investments(10);
        const investmentAfter11  = await icoCrowdsaleInstance.investments(11);
        const investmentAfter12  = await icoCrowdsaleInstance.investments(12);
        const investmentAfter13  = await icoCrowdsaleInstance.investments(13);

        // is presale
        investmentAfter8[2].should.be.bignumber.equal(web3.toWei(0, 'ether'));   // Wei Amount
        investmentAfter8[3].should.be.bignumber.equal(web3.toWei(3, 'ether'));                       // Token Amount
        assert.isTrue(investmentAfter8[4]);                                      // Confirmed
        assert.isTrue(investmentAfter8[5]);                                     // AttemptedSettlement
        assert.isTrue(investmentAfter8[6]);                                     // CompletedSettlement

        // is presale
        investmentAfter9[2].should.be.bignumber.equal(web3.toWei(0, 'ether'));   // Wei Amount
        investmentAfter9[3].should.be.bignumber.equal(web3.toWei(5, 'ether'));                        // Token Amount
        assert.isTrue(investmentAfter9[4]);                                     // Confirmed
        assert.isFalse(investmentAfter9[5]);                                     // AttemptedSettlement
        assert.isFalse(investmentAfter9[6]);                                     // CompletedSettlement

        // is crowdsales
        investmentAfter10[2].should.be.bignumber.equal(web3.toWei(2, 'ether'));   // Wei Amount
        investmentAfter10[3].should.be.bignumber.equal(web3.toWei(2 * newRate));                  // Token Amount
        assert.isFalse(investmentAfter10[4]);                                      // Confirmed
        assert.isFalse(investmentAfter10[5]);                                     // AttemptedSettlement
        assert.isFalse(investmentAfter10[6]);                                     // CompletedSettlement

        investmentAfter11[2].should.be.bignumber.equal(web3.toWei(4, 'ether'));   // Wei Amount
        investmentAfter11[3].should.be.bignumber.equal(web3.toWei(4 * newRate));                 // Token Amount
        assert.isTrue(investmentAfter11[4]);                                      // Confirmed
        assert.isFalse(investmentAfter11[5]);                                     // AttemptedSettlement
        assert.isFalse(investmentAfter11[6]);                                     // CompletedSettlement

        investmentAfter12[2].should.be.bignumber.equal(web3.toWei(4, 'ether'));   // Wei Amount
        investmentAfter12[3].should.be.bignumber.equal(web3.toWei(4 * newRate));                   // Token Amount
        assert.isTrue(investmentAfter12[4]);                                      // Confirmed
        assert.isFalse(investmentAfter12[5]);                                     // AttemptedSettlement
        assert.isFalse(investmentAfter12[6]);                                     // CompletedSettlement

        investmentAfter13[2].should.be.bignumber.equal(web3.toWei(5, 'ether'));   // Wei Amount
        investmentAfter13[3].should.be.bignumber.equal(web3.toWei(5 * newRate));                 // Token Amount
        assert.isTrue(investmentAfter13[4]);                                     // Confirmed
        assert.isFalse(investmentAfter13[5]);                                     // AttemptedSettlement
        assert.isFalse(investmentAfter13[6]);                                     // CompletedSettlement
    });

    it('should fail, because we try to settle an already settled investement again', async () => {
        await expectThrow(icoCrowdsaleInstance.settleInvestment(8, {from: activeInvestor2, gas: 1000000}));
    });

    it('2nd should run batchSettleInvestments successfully', async () => {
        const investment8   = await icoCrowdsaleInstance.investments(8);
        const investment9   = await icoCrowdsaleInstance.investments(9);
        const investment10  = await icoCrowdsaleInstance.investments(10);
        const investment11  = await icoCrowdsaleInstance.investments(11);
        const investment12  = await icoCrowdsaleInstance.investments(12);
        const investment13  = await icoCrowdsaleInstance.investments(13);

        const beforeEthBalance = await web3.eth.getBalance(activeInvestor2);

        // is presale
        investment8[2].should.be.bignumber.equal(web3.toWei(0, 'ether'));   // Wei Amount
        investment8[3].should.be.bignumber.equal(web3.toWei(3, 'ether'));   // Token Amount
        assert.isTrue(investment8[4]);                                      // Confirmed
        assert.isTrue(investment8[5]);                                     // AttemptedSettlement
        assert.isTrue(investment8[6]);                                     // CompletedSettlement

        // is presale
        investment9[2].should.be.bignumber.equal(web3.toWei(0, 'ether'));   // Wei Amount
        investment9[3].should.be.bignumber.equal(web3.toWei(5, 'ether'));   // Token Amount
        assert.isTrue(investment9[4]);                                     // Confirmed
        assert.isFalse(investment9[5]);                                     // AttemptedSettlement
        assert.isFalse(investment9[6]);                                     // CompletedSettlement

        // is crowdsales
        investment10[2].should.be.bignumber.equal(web3.toWei(2, 'ether'));   // Wei Amount
        investment10[3].should.be.bignumber.equal(web3.toWei(2 * newRate));  // Token Amount
        assert.isFalse(investment10[4]);                                      // Confirmed
        assert.isFalse(investment10[5]);                                     // AttemptedSettlement
        assert.isFalse(investment10[6]);                                     // CompletedSettlement

        investment11[2].should.be.bignumber.equal(web3.toWei(4, 'ether'));   // Wei Amount
        investment11[3].should.be.bignumber.equal(web3.toWei(4 * newRate));                 // Token Amount
        assert.isTrue(investment11[4]);                                      // Confirmed
        assert.isFalse(investment11[5]);                                     // AttemptedSettlement
        assert.isFalse(investment11[6]);                                     // CompletedSettlement

        investment12[2].should.be.bignumber.equal(web3.toWei(4, 'ether'));   // Wei Amount
        investment12[3].should.be.bignumber.equal(web3.toWei(4 * newRate));                   // Token Amount
        assert.isTrue(investment12[4]);                                      // Confirmed
        assert.isFalse(investment12[5]);                                     // AttemptedSettlement
        assert.isFalse(investment12[6]);                                     // CompletedSettlement

        investment13[2].should.be.bignumber.equal(web3.toWei(5, 'ether'));   // Wei Amount
        investment13[3].should.be.bignumber.equal(web3.toWei(5 * newRate));                 // Token Amount
        assert.isTrue(investment13[4]);                                     // Confirmed
        assert.isFalse(investment13[5]);                                     // AttemptedSettlement
        assert.isFalse(investment13[6]);                                     // CompletedSettlement

        // let tokensMinted = await icoCrowdsaleInstance.tokensMinted();
        // let tokensToMint = await icoCrowdsaleInstance.tokensToMint();

        const tx = await icoCrowdsaleInstance.batchSettleInvestments([9, 10, 11, 12], {from: activeInvestor2, gas: 1000000});

        // Reports back 'No events fired' - but shows 4 events, including the one below, fired...weeeeird
        // const refundEvents = getEvents(tx, 'Refunded');

        // assert.equal(refundEvents[0].to, activeInvestor2, 'wrong investor');
        // assert.equal(refundEvents[0].value.toNumber(), web3.toWei(2, 'ether'), 'wrong amount');

        const afterEthBalance = await web3.eth.getBalance(activeInvestor2);

        assert.equal(afterEthBalance.sub(beforeEthBalance).toNumber(), 1999686722000000000, 'refunded amount !=');

        const investmentAfter8   = await icoCrowdsaleInstance.investments(8);
        const investmentAfter9   = await icoCrowdsaleInstance.investments(9);
        const investmentAfter10  = await icoCrowdsaleInstance.investments(10);
        const investmentAfter11  = await icoCrowdsaleInstance.investments(11);
        const investmentAfter12  = await icoCrowdsaleInstance.investments(12);
        const investmentAfter13  = await icoCrowdsaleInstance.investments(13);

        // is presale
        investmentAfter8[2].should.be.bignumber.equal(web3.toWei(0, 'ether'));   // Wei Amount
        investmentAfter8[3].should.be.bignumber.equal(web3.toWei(3, 'ether'));                       // Token Amount
        assert.isTrue(investmentAfter8[4]);                                      // Confirmed
        assert.isTrue(investmentAfter8[5]);                                     // AttemptedSettlement
        assert.isTrue(investmentAfter8[6]);                                     // CompletedSettlement

        // is presale
        investmentAfter9[2].should.be.bignumber.equal(web3.toWei(0, 'ether'));   // Wei Amount
        investmentAfter9[3].should.be.bignumber.equal(web3.toWei(5, 'ether'));                        // Token Amount
        assert.isTrue(investmentAfter9[4]);                                     // Confirmed
        assert.isTrue(investmentAfter9[5]);                                     // AttemptedSettlement
        assert.isTrue(investmentAfter9[6]);                                     // CompletedSettlement

        // is crowdsales
        investmentAfter10[2].should.be.bignumber.equal(web3.toWei(2, 'ether'));   // Wei Amount
        investmentAfter10[3].should.be.bignumber.equal(web3.toWei(2 * newRate));                  // Token Amount
        assert.isFalse(investmentAfter10[4]);                                      // Confirmed
        assert.isTrue(investmentAfter10[5]);                                     // AttemptedSettlement
        assert.isTrue(investmentAfter10[6]);                                     // CompletedSettlement

        investmentAfter11[2].should.be.bignumber.equal(web3.toWei(4, 'ether'));   // Wei Amount
        investmentAfter11[3].should.be.bignumber.equal(web3.toWei(4 * newRate));                 // Token Amount
        assert.isTrue(investmentAfter11[4]);                                      // Confirmed
        assert.isTrue(investmentAfter11[5]);                                     // AttemptedSettlement
        assert.isTrue(investmentAfter11[6]);                                     // CompletedSettlement

        investmentAfter12[2].should.be.bignumber.equal(web3.toWei(4, 'ether'));   // Wei Amount
        investmentAfter12[3].should.be.bignumber.equal(web3.toWei(4 * newRate));                   // Token Amount
        assert.isTrue(investmentAfter12[4]);                                      // Confirmed
        assert.isTrue(investmentAfter12[5]);                                     // AttemptedSettlement
        assert.isTrue(investmentAfter12[6]);                                     // CompletedSettlement

        investmentAfter13[2].should.be.bignumber.equal(web3.toWei(5, 'ether'));   // Wei Amount
        investmentAfter13[3].should.be.bignumber.equal(web3.toWei(5 * newRate));                 // Token Amount
        assert.isTrue(investmentAfter13[4]);                                     // Confirmed
        assert.isFalse(investmentAfter13[5]);                                     // AttemptedSettlement
        assert.isFalse(investmentAfter13[6]);                                     // CompletedSettlement

        // do single settlement
        await icoCrowdsaleInstance.settleInvestment(13, {from: inactiveInvestor1, gas: 1000000});

        const investmentAfterA13   = await icoCrowdsaleInstance.investments(13);
        assert.isTrue(investmentAfterA13[5]);                                     // AttemptedSettlement
        assert.isTrue(investmentAfterA13[6]);                                     // CompletedSettlement
    });

    // check to make sure crowdsale is closed and finalized

    it('2nd check balance of wallet (account[6] vs vault balance, pre-finalize)', async () => {
        const vaultBalance = await web3.eth.getBalance(vault);
        const walletBalance =  await web3.eth.getBalance(wallet);

        assert.equal(vaultBalance.toNumber(), web3.toWei(13, 'ether'), 'wrong vault balance');
        assert.equal(walletBalance.toNumber() - initialWalletBalance.toNumber(), 0, 'wrong wallet balance');
    });

    it('2nd should call finalize successfully', async () => {
        console.log('[ 2nd Finalize Crowdsale ]'.yellow);

        // const tokensMinted = await icoCrowdsaleInstance.tokensMinted();
        // const tokensToMint = await icoCrowdsaleInstance.tokensToMint();

        const ownerBalance = await icoTokenInstance.balanceOf(owner);
        const activeManagerBalance = await icoTokenInstance.balanceOf(activeManager);
        const inactiveManagerBalance = await icoTokenInstance.balanceOf(inactiveManager);
        const activeInvestor1Balance = await icoTokenInstance.balanceOf(activeInvestor1);
        const activeInvestor2Balance = await icoTokenInstance.balanceOf(activeInvestor2);
        const activeInvestor3Balance = await icoTokenInstance.balanceOf(activeInvestor3);
        const activeInvestor4Balance = await icoTokenInstance.balanceOf(activeInvestor4);
        const activeInvestor5Balance = await icoTokenInstance.balanceOf(activeInvestor5);
        const inactiveInvestor1Balance = await icoTokenInstance.balanceOf(inactiveInvestor1);
        const walletBalance = await icoTokenInstance.balanceOf(wallet);

        // log.info(ownerBalance.toNumber());
        // log.info(activeManagerBalance.toNumber());
        // log.info(inactiveManagerBalance.toNumber());
        // log.info(activeInvestor1Balance.toNumber());
        // log.info(walletBalance.toNumber());
        // log.info(inactiveInvestor1Balance.toNumber());
        // log.info(activeInvestor5Balance.toNumber());
        // log.info(activeInvestor4Balance.toNumber());
        // log.info(activeInvestor3Balance.toNumber());
        // log.info(activeInvestor2Balance.toNumber());
        // log.info(activeInvestor1Balance.toNumber());

        const totalSum = ownerBalance.add(activeManagerBalance).add(inactiveManagerBalance).add(activeInvestor1Balance)
            .add(activeInvestor2Balance).add(activeInvestor3Balance).add(activeInvestor4Balance).add(activeInvestor5Balance)
            .add(inactiveInvestor1Balance).add(walletBalance);
        const totalSupply = await icoTokenInstance.totalSupply();
        assert.equal(totalSupply.toNumber(), totalSum.toNumber(), 'SRC Token balances not equal');

        await icoCrowdsaleInstance.finalize({from: owner, gas: 1000000});
    });

    it('2nd check balance of wallet (account[6] vs vault balance, post-finalize)', async () => {
        const vaultBalance = await web3.eth.getBalance(vault);
        const walletBalance =  await web3.eth.getBalance(wallet);

        assert.equal(vaultBalance.toNumber(), 0, 'wrong vault balance');
        assert.equal(walletBalance.toNumber() - initialWalletBalance.toNumber(), 12999999999998690000, 'wrong wallet balance');
    });

    it('check to make sure crowdsale is closed and finalized', async () => {
        const hasClosed     = await icoCrowdsaleInstance.hasClosed();
        const isFinalized   = await icoCrowdsaleInstance.isFinalized();
        const state         = await autoRefundVaultInstance.state();

        assert.equal(hasClosed, true, 'hasClosed wrong value');
        assert.equal(isFinalized, true, 'isFinalized wrong value');
        assert.equal(state, 1, 'wrong vault state');
    });

    it('2nd should fail, because we try to mint tokens for presale with a non active crowdsale', async () => {
        await expectThrow(icoCrowdsaleInstance.mintPresaleTokens(activeInvestor1, 1, {from: owner, gas: 1000000}));
    });

    it('2nd should fail, because we try to trigger buyTokens in before contribution time is started', async () => {
        await expectThrow(icoCrowdsaleInstance.buyTokens(activeInvestor1, {from: activeInvestor2, gas: 1000000}));
    });

    it('2nd should fail, because we try to trigger the fallback function before contribution time is started', async () => {
        await expectThrow(icoCrowdsaleInstance.sendTransaction({
            from:   owner,
            value:  web3.toWei(1, 'ether'),
            gas:    700000
        }));
    });

    it('should fail, because we try to trigger a new crowdsale with a start time in the past', async () => {
        await expectThrow(icoCrowdsaleInstance.newCrowdsale(cnf.startTimeTesting, newDuration, newRate, deltaCap));
    });

    // // Extended Testing
    // it('deploy new crowdsale instance for testing', async () => {
    //     console.log('[ Establish 2nd Crowdsale Instance ]'.yellow);

    //     const relativeTime = web3.eth.getBlock('latest').timestamp;

    //     const secondTokenInstance = SrcToken.new();
    //     const secondIcoInstance = SrcCrowdsale.new((relativeTime + (oneDay * 2)), (relativeTime + (oneDay * 5)), cnf.rate, cnf.wallet, secondTokenInstance.address);

    //     // Transfer Ownership
    //     await secondTokenInstance.transferOwnership(secondIcoInstance.address, {from: owner});
    //     const newOwner = await secondTokenInstance.owner();
    //     assert.equal(newOwner, secondIcoInstance.address, 'Src Token owner not correct');
    // });
});

/**
 * AutoRefundVault contract
 */
contract('AutoRefundVault', (accounts) => {
    const owner             = accounts[0];
    const activeInvestor1   = accounts[3];
    const activeInvestor2   = accounts[4];
    const wallet            = accounts[6];

    let vault;
    let vaultAddress;

    let initialWalletBalance;

    const oneDay = 86400;

    const five = web3.toWei(5, 'ether');

    before(async () => {
        vault = await AutoRefundVault.new(wallet);
        vaultAddress = vault.address;
    });

    it('should exercise the AutoRefundVault', async () => {
        await vault.deposit(activeInvestor1, {
            from:   owner,
            value:  web3.toWei(5, 'ether'),
            gas:    700000
        });

        await vault.deposit(activeInvestor2, {
            from:   owner,
            value:  web3.toWei(5, 'ether'),
            gas:    700000
        });

        const balance = await web3.eth.getBalance(vaultAddress);

        assert.equal(five * 2, balance.toNumber(), 'vault test balance !=');
    });

    it('should fail, cannot deposit from non owner', async () => {
        await expectThrow(vault.deposit(activeInvestor1, {
            from:   activeInvestor1,
            value:  web3.toWei(5, 'ether'),
            gas:    700000
        }));
    });

    it('should fail, cannot send ether to fallback function', async () => {
        await expectThrow(vault.sendTransaction({
            from:   owner,
            value:  web3.toWei(5, 'ether'),
            gas:    700000
        }));
    });

    it('should fail, cannot deploy with 0x0 address', async () => {
        await expectThrow(AutoRefundVault.new(0x0));
    });

    it('should fail, can open what is already open', async () => {
        await expectThrow(vault.openVault());
    });

    it('should pass, grant refund for investor form owner', async () => {
        await vault.pushRefund(activeInvestor1);
    });

    it('should fail, cannot refund from non owner', async () => {
        await expectThrow(vault.pushRefund(activeInvestor2, {
            from:   activeInvestor2,
            value:  web3.toWei(5, 'ether'),
            gas:    700000
        }));
    });

    it('should fail, can open what is already open', async () => {
        await expectThrow(vault.openVault());
    });

    it('should close the vault, sending funds to the designated wallet', async () => {
        await vault.close();

        const balance = await web3.eth.getBalance(vaultAddress);

        assert.equal(0, balance.toNumber(), 'vault test balance !=');
    });

    it('should fail, cannot refund in closed state', async () => {
        await expectThrow(vault.pushRefund(activeInvestor2, {
            from:   owner,
            value:  web3.toWei(5, 'ether'),
            gas:    700000
        }));
    });

    it('should fail, cannot deposit in closed state', async () => {
        await expectThrow(vault.deposit(activeInvestor1, {
            from:   owner,
            value:  web3.toWei(5, 'ether'),
            gas:    700000
        }));
    });

    it('should fail, cannot close what is already closed', async () => {
        await expectThrow(vault.close());
    });
});
