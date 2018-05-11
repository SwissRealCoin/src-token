/**
 * Test for SwissRealCoin Crowdsale - End to End Test
 *
 * @author Validity Labs AG <info@validitylabs.org>
 */

import {expectThrow, waitNDays, getEvents, BigNumber, cnf, increaseTimeTo} from '../../helpers/tools';
import {logger as log} from '../../../tools/lib/logger';

const SrcCrowdsale  = artifacts.require('./SrcCrowdsale');
const SrcToken      = artifacts.require('./SrcToken');
const AutoRefundVault = artifacts.require('./AutoRefundVault');
const Liquidator        = artifacts.require('./Liquidator');
const LiquidationVoting = artifacts.require('./LiquidationVoting');
const LiquidatorWallet  = artifacts.require('./LiquidationWallet');
const SrvToken          = artifacts.require('./SrvToken');
const WETHToken         = artifacts.require('./WETHToken');

const should = require('chai') // eslint-disable-line
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

/**
 * SrcCrowdsale contract
 */
contract('End to End Test', (accounts) => {
    const owner             = accounts[0];
    const activeManager     = accounts[1];
    const inactiveManager   = accounts[2];
    const activeInvestor1   = accounts[3];
    const activeInvestor2   = accounts[4];
    const inactiveInvestor1 = accounts[5];
    const wallet            = accounts[6];
    const activeInvestor3   = accounts[7];
    const activeInvestor4   = accounts[8];
    const notary            = accounts[9];

    // Provide icoCrowdsaleInstance, icoTokenInstance, autoRefundVaultInstance for every test case
    let icoCrowdsaleInstance;
    let icoTokenAddress;
    let icoTokenInstance;
    let autoRefundVaultInstance;

    let vault;
    let vaultWallet;

    let initialWalletBalance;
    let vaultBalancePreFinalize;

    const three = web3.toWei(3, 'ether');
    const five = web3.toWei(5, 'ether');

    const oneDay = 86400;
    const newDuration = oneDay * 30; // 30 days
    const newRate = 800; // 800 CHF per 1 ether
    const deltaCap = 30e6 * 1e18; // 30,000,000 delta cap

    const icoStartTime = 1704067200; // Monday, January 1, 2024 12:00:00 AM
    const icoEndTime = 1705276800;   // Monday, January 15, 2024 12:00:00 AM
    const icoRate = 400;

    const startTimes = [1733011200, 1764547200, 1796083200, 1827619200]; // 2024 - 2027

    const rate = 10;
    const unclaimedRate = 5;

    // const votingPeriod = duration.days(23);

    // enum Stages 0 = LockOutPeriod, 1 = PendingVoting, 2 = AcceptingVotes, 3 = PendingResult, 4 = VotePassed

    // Provide an instance for every test case
    let liquidatorAddress;
    let liquidatorInstance;
    let liquidationVotingInstance;
    let liquidationVotingAddress;
    let voucherTokenAddress;
    let voucherTokenInstance;
    let liquidationWalletAddress;
    let liquidationWalletInstance;
    let payoutTokenAddress;
    let payoutTokenInstance;

    let activeInvestor1VotingBalance;
    let activeInvestor2VotingBalance;
    let activeInvestor3VotingBalance;

    before(async () => {
        // deploy new instances
        icoTokenInstance        = await SrcToken.new();
        icoTokenAddress         = icoTokenInstance.address;

        // SrcCrowdsale(uint256 _startTime, uint256 _endTime, uint256 _rateChfPerEth, address _wallet, address _token
        icoCrowdsaleInstance    = await SrcCrowdsale.new(icoStartTime, icoEndTime, icoRate, wallet, icoTokenAddress);

        payoutTokenInstance     = await WETHToken.new();
        payoutTokenAddress      = payoutTokenInstance.address;

        // LiquidationVoting(address _notary, MiniMeTokenInterface _token)
        liquidationVotingInstance   = await LiquidationVoting.new(notary, icoTokenAddress, icoCrowdsaleInstance.address);
        liquidationVotingAddress    = liquidationVotingInstance.address;

        // Liquidator (ERC20 _srcTokenAddress, address _swissVotingContract, ERC20 _payoutToken)
        liquidatorInstance          = await Liquidator.new(icoTokenAddress, liquidationVotingAddress, payoutTokenAddress);
        liquidatorAddress           = liquidatorInstance.address;

        liquidationWalletAddress    = await liquidatorInstance.liquidationWallet();
        liquidationWalletInstance   = await LiquidatorWallet.at(liquidationWalletAddress);

        voucherTokenAddress         = await liquidatorInstance.srvToken();
        voucherTokenInstance        = await SrvToken.at(voucherTokenAddress);
    });

    it('increase time to accept investments', async () => {
        console.log('[ Contribution period ]'.yellow);
        await increaseTimeTo(1703894400);   // Saturday, December 30, 2023 12:00:00 AM
    });

    /**
     * [ Pre contribution period ]
     */

    it('should setup the ICO contracts as the owner to the SRC Token', async () => {
        await icoTokenInstance.transferOwnership(icoCrowdsaleInstance.address, {from: owner});
        const newOwner = await icoTokenInstance.owner();

        assert.equal(newOwner, icoCrowdsaleInstance.address, 'Src Token owner not correct');
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

    it('should setup the voting contract address', async () => {
        await icoCrowdsaleInstance.setVotingContract(liquidationVotingAddress);

        const votingAddress = await icoCrowdsaleInstance.votingContract();

        assert.equal(votingAddress, liquidationVotingAddress, 'voting address !=');
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

    it('should mint tokens for presale', async () => {
        const activeInvestor1Balance1   = await icoTokenInstance.balanceOf(activeInvestor1);
        const activeInvestor2Balance1   = await icoTokenInstance.balanceOf(activeInvestor2);

        activeInvestor1Balance1.should.be.bignumber.equal(new BigNumber(0));
        activeInvestor2Balance1.should.be.bignumber.equal(new BigNumber(0));

        const tx1 = await icoCrowdsaleInstance.batchMintTokenPresale([activeInvestor1, activeInvestor2], [three, five]);

        const activeInvestor1Balance2 = await icoTokenInstance.balanceOf(activeInvestor1);
        const activeInvestor2Balance2 = await icoTokenInstance.balanceOf(activeInvestor2);

        activeInvestor1Balance2.should.be.bignumber.equal(three);
        activeInvestor2Balance2.should.be.bignumber.equal(five);

        // Testing events
        const events1 = getEvents(tx1, 'PresalePurchase');

        assert.equal(events1[0].beneficiary, activeInvestor1, '');
        assert.equal(events1[1].beneficiary, activeInvestor2, '');

        events1[0].tokenAmount.should.be.bignumber.equal(three);
        events1[1].tokenAmount.should.be.bignumber.equal(five);
    });

    /**
     * [ Contribution period ]
     */

    it('increase time to accept investments', async () => {
        console.log('[ Contribution period ]'.yellow);
        await increaseTimeTo(icoStartTime);
    });

    it('should call single non-ETH investment function during crowdsale', async () => {
        const activeInvestor1Balance1   = await icoTokenInstance.balanceOf(activeInvestor1);
        const activeInvestor2Balance1   = await icoTokenInstance.balanceOf(activeInvestor2);

        activeInvestor1Balance1.should.be.bignumber.equal(three);
        activeInvestor2Balance1.should.be.bignumber.equal(five);

        const tx1 = await icoCrowdsaleInstance.nonEthPurchase(0, activeInvestor1, three);   // investments(0)
        const tx2 = await icoCrowdsaleInstance.nonEthPurchase(1, activeInvestor2, five);    // investments(1)

        const activeInvestor1Balance2 = await icoTokenInstance.balanceOf(activeInvestor1);
        const activeInvestor2Balance2 = await icoTokenInstance.balanceOf(activeInvestor2);

        activeInvestor1Balance2.should.be.bignumber.equal(three);
        activeInvestor2Balance2.should.be.bignumber.equal(five);

        // Testing events
        const events1 = getEvents(tx1, 'NonEthTokenPurchase');
        const events2 = getEvents(tx2, 'NonEthTokenPurchase');

        assert.equal(events1[0].investmentType.toNumber(), 0, 'activeInvestor1 investmentType !=');
        assert.equal(events2[0].investmentType.toNumber(), 1, 'activeInvestor2 investmentType !=');

        assert.equal(events1[0].beneficiary, activeInvestor1, '');
        assert.equal(events2[0].beneficiary, activeInvestor2, '');

        events1[0].tokenAmount.should.be.bignumber.equal(three);
        events2[0].tokenAmount.should.be.bignumber.equal(five);
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

        const tx2   = await icoCrowdsaleInstance.sendTransaction({  // investments(4)
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

        const tx3   = await icoCrowdsaleInstance.sendTransaction({  // investments(5)
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

        const vaultBalance = await web3.eth.getBalance(vault);
        assert.equal(vaultBalance.toNumber(), web3.toWei(14, 'ether'), 'vault balance not equal');
    });

    /**
     * [ Confirmation period ]
     */

    it('should fail, because we try to trigger nonEthPurchase in Confirmation period', async () => {
        console.log('[ Confirmation period ]'.yellow);
        await increaseTimeTo(icoEndTime + 1);
        await expectThrow(icoCrowdsaleInstance.nonEthPurchase(0, activeInvestor1, 3));
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

        assert.equal(events[0].investmentId.toNumber(), 2);
        assert.equal(events[0].investor, activeInvestor2);
        assert.isTrue(events[0].confirmed);

        assert.equal(events2[0].investmentId.toNumber(), 0);
        assert.equal(events2[0].investor, owner);
        assert.isTrue(events2[0].confirmed);
    });

    it('should run batchConfirmPayments() successfully', async () => {
        const tx = await icoCrowdsaleInstance.batchConfirmPayments(
            [0, 1, 2, 3, 4],
            {from: activeManager, gas: 1000000}
        );

        const events        = getEvents(tx, 'ChangedInvestmentConfirmation');
        const investment6   = await icoCrowdsaleInstance.investments(5);

        assert.equal(investment6[0], activeInvestor4);                      // Investor
        assert.equal(investment6[1], activeInvestor4);                      // Beneficiary
        investment6[2].should.be.bignumber.equal(web3.toWei(5, 'ether'));   // Wei Amount
        investment6[3].should.be.bignumber.equal(web3.toWei(5 * cnf.rateChfPerEth));                // Token Amount
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

        assert.equal(events[0].investmentId.toNumber(), 5);
        assert.equal(events[0].investor, activeInvestor4);
        assert.isFalse(events[0].confirmed);

        assert.equal(events2[0].investmentId.toNumber(), 1);
        assert.equal(events2[0].investor, owner);
        assert.isFalse(events2[0].confirmed);
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

    it('should fail, because we try to trigger confirmPayment after Confirmation has been set to TRUE', async () => {
        await expectThrow(icoCrowdsaleInstance.confirmPayment(0, {from: activeManager, gas: 1000000}));
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

    // Settlement Period

    it('should run settleInvestment for first investment successfully', async () => {
        // So know that going in, investments[0 & 1] are presale investments that have owner listed as the investor address and 0 value for the wei.
        // They have a beneficiary address and a token amount.

        const investment0   = await icoCrowdsaleInstance.investments(0);
        const investment1   = await icoCrowdsaleInstance.investments(1);
        const investment2   = await icoCrowdsaleInstance.investments(2);
        const investment3   = await icoCrowdsaleInstance.investments(3);
        const investment4   = await icoCrowdsaleInstance.investments(4);
        const investment5   = await icoCrowdsaleInstance.investments(5);

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

        await icoCrowdsaleInstance.settleInvestment(0, {from: inactiveInvestor1, gas: 1000000});

        const investmentAfter0   = await icoCrowdsaleInstance.investments(0);
        const investmentAfter1   = await icoCrowdsaleInstance.investments(1);
        const investmentAfter2   = await icoCrowdsaleInstance.investments(2);
        const investmentAfter3   = await icoCrowdsaleInstance.investments(3);
        const investmentAfter4   = await icoCrowdsaleInstance.investments(4);
        const investmentAfter5   = await icoCrowdsaleInstance.investments(5);

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

        await icoCrowdsaleInstance.batchSettleInvestments([1, 2, 3], {from: activeInvestor2, gas: 1000000});

        const investmentAfter0   = await icoCrowdsaleInstance.investments(0);
        const investmentAfter1   = await icoCrowdsaleInstance.investments(1);
        const investmentAfter2   = await icoCrowdsaleInstance.investments(2);
        const investmentAfter3   = await icoCrowdsaleInstance.investments(3);
        const investmentAfter4   = await icoCrowdsaleInstance.investments(4);
        const investmentAfter5   = await icoCrowdsaleInstance.investments(5);

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

        await icoCrowdsaleInstance.settleInvestment(5, {from: inactiveInvestor1, gas: 1000000});

        const etherVaultAfter         = await web3.eth.getBalance(vault);
        const etherInvestorAfter      = await web3.eth.getBalance(activeInvestor4);
        const tokenInvestor3After     = await icoTokenInstance.balanceOf(activeInvestor4);

        etherVaultBefore.sub(etherVaultAfter).should.be.bignumber.equal(web3.toWei(5, 'ether'));
        etherInvestorBefore.add(web3.toWei(5, 'ether')).should.be.bignumber.equal(etherInvestorAfter);
        tokenInvestor3Before.should.be.bignumber.equal(tokenInvestor3After);
    });

    it('check balance of wallet (account[6] vs vault balance, pre-finalize)', async () => {
        vaultBalancePreFinalize = await web3.eth.getBalance(vault);
        const walletBalance =  await web3.eth.getBalance(wallet);

        assert.equal(vaultBalancePreFinalize.toNumber(), web3.toWei(9, 'ether'), 'wrong vault balance');
        assert.equal(walletBalance.toNumber() - initialWalletBalance.toNumber(), 0, 'wrong wallet balance');
    });

    it('should call finalize successfully', async () => {
        console.log('[ Finalize Crowdsale ]'.yellow);

        const ownerBalance = await icoTokenInstance.balanceOf(owner);
        const activeManagerBalance = await icoTokenInstance.balanceOf(activeManager);
        const inactiveManagerBalance = await icoTokenInstance.balanceOf(inactiveManager);
        const activeInvestor1Balance = await icoTokenInstance.balanceOf(activeInvestor1);
        const activeInvestor2Balance = await icoTokenInstance.balanceOf(activeInvestor2);
        const activeInvestor3Balance = await icoTokenInstance.balanceOf(activeInvestor3);
        const activeInvestor4Balance = await icoTokenInstance.balanceOf(activeInvestor4);
        const inactiveInvestor1Balance = await icoTokenInstance.balanceOf(inactiveInvestor1);
        const walletBalance = await icoTokenInstance.balanceOf(wallet);

        const totalSum = ownerBalance.add(activeManagerBalance).add(inactiveManagerBalance).add(activeInvestor1Balance)
            .add(activeInvestor2Balance).add(activeInvestor3Balance).add(activeInvestor4Balance)
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
        assert.isAbove(walletBalance.toNumber(), initialWalletBalance.toNumber(), 'wrong wallet balance');
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
        await expectThrow(icoCrowdsaleInstance.nonEthPurchase(0, activeInvestor1, 1, {from: owner, gas: 1000000}));
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

    // Token Voting

    it('should instantiate the Liquidation Voting correctly', async () => {
        console.log('[ Disabled Period ]'.yellow);
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

    it('should set the Lidquidator address in the LiquidationVoting contract', async () => {
        await liquidationVotingInstance.setLiquidator(liquidatorAddress);
        const liquidator = await liquidationVotingInstance.liquidator();

        assert.equal(liquidator, liquidatorInstance.address, 'liquidator !=');
    });

    it('should instantiate the LiquidationVoting correctly', async () => {
        const votingPeriod = await liquidationVotingInstance.VOTING_PERIOD();
        const token = await liquidationVotingInstance.token();
        const votingEnabled = await liquidationVotingInstance.votingEnabled();
        const notaryAddress = await liquidationVotingInstance.notary();
        const currentStage = await liquidationVotingInstance.currentStage();

        assert.equal(votingPeriod.toNumber(), 1987200, 'votingPeriod !=');
        assert.equal(token, icoTokenAddress, 'token !=');
        assert.equal(votingEnabled, false, 'voting not enabled');
        assert.equal(notaryAddress, notary, 'notary !=');
        assert.equal(currentStage.toNumber(), 0, 'currentStage != 0');
    });

    it('should fail, CalcProposalResult, as contract is not enabled', async () => {
        await expectThrow(liquidationVotingInstance.calcProposalResult());
    });

    it('should fail, cannot vote - not a valid voting period && contract is not enabled', async () => {
        await expectThrow(liquidationVotingInstance.vote(true, {from: activeInvestor1, gas: 100000}));
    });

    /**
     * [ Enable Voting Contract ]
     */

    it('should pass, allow notary to enableVoting on Voting contract', async () => {
        await liquidationVotingInstance.enableVoting({from: notary, gas: 200000});

        const currentStage = await liquidationVotingInstance.currentStage();
        assert.equal(currentStage.toNumber(), 1, 'currentStage != 1');

        console.log('[ Enabled Period ]'.yellow);
    });

    it('should fail, cannot vote - not a valid voting period', async () => {
        await expectThrow(liquidationVotingInstance.vote(true, {from: activeInvestor1, gas: 100000}));
    });

    // test Liquidator Contract
    it('should fail, because we try to set start time on an inactive contract', async () => {
        console.log('[ Test Liquidator Contract ]'.yellow);
        await expectThrow(liquidatorInstance.setStartTime(1548806400)); // Wednesday, January 30, 2019 12:00:00 AM
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
        console.log('[ Test Liquidator Contract End ]'.yellow);
    });
    // end Liquidator Contract tests

    /**
     * [ Pending Voting Period ]
     */

    it('should be pending voting', async () => {
        console.log('[ Pending Voting Period ]'.yellow);
        const currentStage = await liquidationVotingInstance.currentStage();
        assert.equal(currentStage.toNumber(), 1, 'currentStage != 1');
    });

    it('increase time witin 90 days of voting period', async () => {
        console.log('[ Witin 90 days of voting period ]'.yellow);
        await increaseTimeTo(startTimes[0] - (oneDay * 90) + 1);
    });

    it('notary should be able to change quorum rate to 55%', async () => {
        await liquidationVotingInstance.changeQuorumRate(550, {from: notary, gas: 100000});
        const currentRate = await liquidationVotingInstance.currentRate();

        assert.equal(currentRate.toNumber(), 550, 'currentRate != 550');
    });

    /**
     * [ Accept Votes Period ]
     */

    it('increase time accept votes', async () => {
        console.log('[ Accept Voting Period ]'.yellow);
        await increaseTimeTo(startTimes[0]);

        activeInvestor1VotingBalance = await icoTokenInstance.balanceOf(activeInvestor1);
        activeInvestor2VotingBalance = await icoTokenInstance.balanceOf(activeInvestor2);
        activeInvestor3VotingBalance = await icoTokenInstance.balanceOf(activeInvestor3);
    });

    it('should fail, notary should not be able to change quorum rate to 55%', async () => {
        await expectThrow(liquidationVotingInstance.changeQuorumRate(550, {from: notary, gas: 100000}));
    });

    it('should in accepting votes stage', async () => {
        await liquidationVotingInstance.ping();
        const currentStage = await liquidationVotingInstance.currentStage();
        assert.equal(currentStage.toNumber(), 2, 'currentStage != 2');
    });

    it('should fail, calling calcProposalResult to get proposal outcome', async () => {
        await expectThrow(liquidationVotingInstance.calcProposalResult());
    });

    it('should be able to vote', async () => {
        const tx1 = await liquidationVotingInstance.vote(false, {from: activeInvestor1, gas: 1000000});
        const tx2 = await liquidationVotingInstance.vote(true, {from: activeInvestor2, gas: 1000000});

        const events = getEvents(tx1, 'ProposalVoted');
        const events2 = getEvents(tx2, 'ProposalVoted');

        assert.equal(events[0].voter, activeInvestor1, 'activeInvestor1 != voter');
        assert.equal(events2[0].voter, activeInvestor2, 'activeInvestor2 != voter');

        assert.equal(events[0].votes.toNumber(), activeInvestor1VotingBalance.toNumber(), 'activeInvestor1 votes != votes');
        assert.equal(events2[0].votes.toNumber(), activeInvestor2VotingBalance.toNumber(), 'activeInvestor2 votes != votes');

        assert.equal(events[0].isYes, false, 'activeInvestor1 boolean !=');
        assert.equal(events2[0].isYes, true, 'activeInvestor2 boolean !=');

        const props = await liquidationVotingInstance.proposals(0);

        assert.equal(props[0].toNumber(), 550, 'quorum rate !=');
        assert.equal(props[1].toNumber(), startTimes[0], 'blocktime !=');
        assert.equal(props[2].toNumber(), activeInvestor1VotingBalance.toNumber(), 'countNoVotes !=');
        assert.equal(props[3].toNumber(), activeInvestor2VotingBalance.toNumber(), 'countYesVotes !=');
    });

    it('should move to time after voting period', async () => {
        await increaseTimeTo(startTimes[0] + (oneDay * 23) + 1);
        console.log('[ Pending Results Period ]'.yellow);
    });

    /**
    * [ Pending Results Period ]
    */

    it('should call calcProposalResult to get proposal outcome', async () => {
        const tx = await liquidationVotingInstance.calcProposalResult({from: inactiveInvestor1, gas: 1000000});

        const events = getEvents(tx, 'LiquidationResult');

        assert.equal(events[0].didPass, false, 'didPass !=');
        assert.equal(events[0].qResult.toNumber(), 2, 'qResult != %');
    });

    it('should fail, cannot vote - not a valid voting period', async () => {
        await expectThrow(liquidationVotingInstance.vote(true, {from: activeInvestor1, gas: 100000}));
    });

    it('should fail, calling calcProposalResult to get proposal outcome', async () => {
        await expectThrow(liquidationVotingInstance.calcProposalResult({from: inactiveInvestor1, gas: 200000}));
    });

    /**
    * [ Pending Voting Period, again ]
    */

    it('should verify proposal', async () => {
        const props = await liquidationVotingInstance.proposals(1);

        assert.equal(props[0].toNumber(), 600, 'quorum rate !=');
        assert.equal(props[1].toNumber(), startTimes[1], 'blocktime !=');
        assert.equal(props[2].toNumber(), 0, 'countNoVotes !=');
        assert.equal(props[3].toNumber(), 0, 'countYesVotes !=');
    });

    it('should be pending voting', async () => {
        console.log('[ Pending Voting Period, again]'.yellow);
        const currentStage = await liquidationVotingInstance.currentStage();
        assert.equal(currentStage.toNumber(), 1, 'currentStage != 1');
    });

    it('should fail, cannot vote - not a valid voting period', async () => {
        await expectThrow(liquidationVotingInstance.vote(true, {from: activeInvestor1, gas: 100000}));
    });

    it('should fail, cannot vote - not a valid voting period', async () => {
        await expectThrow(liquidationVotingInstance.vote(true, {from: activeInvestor1, gas: 100000}));
    });

    it('increase time witin 90 days of voting period', async () => {
        console.log('[ Witin 90 days of voting period ]'.yellow);
        await increaseTimeTo(startTimes[1] - (oneDay * 90) + 1);
    });

    /**
    * [ Accept Votes Period, again ]
    */

    it('increase time accept votes', async () => {
        console.log('[ Accept Voting Period, again ]'.yellow);
        await increaseTimeTo(startTimes[1] + 1);
    });

    it('should fail, notary should be able to change quorum rate to 55%', async () => {
        await expectThrow(liquidationVotingInstance.changeQuorumRate(550, {from: notary, gas: 100000}));
    });

    it('should in accepting votes stage, again', async () => {
        await liquidationVotingInstance.ping();
        const currentStage = await liquidationVotingInstance.currentStage();
        assert.equal(currentStage.toNumber(), 2, 'currentStage != 2');
    });

    it('should fail, calling calcProposalResult to get proposal outcome', async () => {
        await expectThrow(liquidationVotingInstance.calcProposalResult({from: activeInvestor1, gas: 1000000}));
    });

    it('should be able to vote, again', async () => {
        const tx1 = await liquidationVotingInstance.vote(true, {from: activeInvestor1, gas: 1000000});
        const tx2 = await liquidationVotingInstance.vote(false, {from: activeInvestor2, gas: 1000000});
        const tx3 = await liquidationVotingInstance.vote(true, {from: activeInvestor3, gas: 1000000});

        const events = getEvents(tx1, 'ProposalVoted');
        const events2 = getEvents(tx2, 'ProposalVoted');
        const events3 = getEvents(tx3, 'ProposalVoted');

        assert.equal(events[0].voter, activeInvestor1, 'activeInvestor1 != voter');
        assert.equal(events2[0].voter, activeInvestor2, 'activeInvestor2 != voter');
        assert.equal(events3[0].voter, activeInvestor3, 'activeInvestor3 != voter');

        assert.equal(events[0].votes.toNumber(), activeInvestor1VotingBalance.toNumber(), 'activeInvestor1 votes != votes');
        assert.equal(events2[0].votes.toNumber(), activeInvestor2VotingBalance.toNumber(), 'activeInvestor2 votes != votes');
        assert.equal(events3[0].votes.toNumber(), activeInvestor3VotingBalance.toNumber(), 'activeInvestor3 votes != votes');

        assert.equal(events[0].isYes, true, 'activeInvestor1 boolean !=');
        assert.equal(events2[0].isYes, false, 'activeInvestor2 boolean !=');
        assert.equal(events3[0].isYes, true, 'activeInvestor3 boolean !=');

        const props = await liquidationVotingInstance.proposals(1);

        assert.equal(props[0].toNumber(), 600, 'quorum rate !=');
        assert.equal(props[1].toNumber(), startTimes[1], 'blocktime !=');
        assert.equal(props[2].toNumber(), activeInvestor2VotingBalance.toNumber(), 'countNoVotes !=');
        assert.equal(props[3].toNumber(), (activeInvestor1VotingBalance.toNumber() + activeInvestor3VotingBalance.toNumber()), 'countYesVotes !=');
    });

    it('should fail, calling calcProposalResult to get proposal outcome, again', async () => {
        await expectThrow(liquidationVotingInstance.calcProposalResult());
    });

    it('should move to time after voting period', async () => {
        await increaseTimeTo(startTimes[1] + (oneDay * 23) + 1);
        console.log('[ Pending Results Period, again ]'.yellow);
    });

    it('should fail, cannot vote - not a valid voting period', async () => {
        await expectThrow(liquidationVotingInstance.vote(true, {from: activeInvestor1, gas: 100000}));
    });

    /**
    * [ Pending Results Call]
    */

    it('should call calcProposalResult to get proposal outcome', async () => {
        const tx = await liquidationVotingInstance.calcProposalResult({from: inactiveManager, gas: 1000000});

        const events = getEvents(tx, 'LiquidationResult');

        assert.equal(events[0].didPass, true, 'didPass !=');
        assert.equal(events[0].qResult.toNumber(), 998, 'qResult != %');
    });

    it('should fail, calling calcProposalResult to get proposal outcome', async () => {
        await expectThrow(liquidationVotingInstance.calcProposalResult({from: inactiveInvestor1, gas: 100000}));
    });

    it('should verify disabled = false', async () => {
        const disabled = await icoCrowdsaleInstance.disabled();

        assert.isTrue(disabled);
    });

    it('should fail, because we try to trigger a new crowdsale on a disabled crowdsale', async () => {
        await expectThrow(icoCrowdsaleInstance.newCrowdsale(startTimes[2], newDuration, newRate, deltaCap));
    });

    /**
    * [ Vote Passed - Trigger Liquidation ]
    */

    it('should be in VotePassed stage', async () => {
        const currentStage = await liquidationVotingInstance.currentStage();
        assert.equal(currentStage.toNumber(), 4, 'currentStage != 4');
    });

    // !!! Trigger Liquidation !!!
    it('should pass, because contract is active', async () => {
        const enabled = await liquidatorInstance.enabled();
        assert.equal(enabled, true, 'should be true');
    });

    it('should fail, because contract is already triggered', async () => {
        await expectThrow(liquidatorInstance.triggerLiquidation());
    });

    it('should pass, because we try to set rate time on an active contract', async () => {
        await liquidatorInstance.setRate(rate);
        const checkRate = await liquidatorInstance.rate();
        assert.equal(checkRate.toNumber(), rate, 'rate !=');
    });

    it('should pass, because we try to set a ERC20 token on an active contract', async () => {
        await liquidatorInstance.setNewErc20Token(payoutTokenAddress);
    });

    it('should pass, because we try to set unClaimedRate time on an active contract', async () => {
        await liquidatorInstance.setUnclaimedRate(unclaimedRate);
        const checkUnclaimedRate = await liquidatorInstance.unclaimedRate();
        assert.equal(checkUnclaimedRate.toNumber(), unclaimedRate, 'unclaimedRate !=');
    });

    it('should pass, because we try to set start time on an inactive contract', async () => {
        await liquidatorInstance.setStartTime(startTimes[2]); // 2021
    });

    it('should pass, contract in active state', async () => {
        const currentState = await liquidatorInstance.currentState();
        assert.equal(currentState.toNumber(), 1, 'state is incorrect; should be 1');
        console.log('[ Test Liquidator Contract End ]'.yellow);
    });

    // Liquidation
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
        assert.equal(currentState.toNumber(), 1, 'state is incorrect; should be 1');
        assert.equal(enabled, true, 'should be true');
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
        await liquidatorInstance.setStartTime(startTimes[2]);
    });

    it('should pass, contract in active state', async () => {
        const currentState = await liquidatorInstance.currentState();
        assert.equal(currentState.toNumber(), 1, 'state is incorrect; should be 1');
    });

    // !!! CLAIM !!!
    it('increase time to claim funds', async () => {
        console.log('[ Claim Funds period ]'.yellow);
        await increaseTimeTo(startTimes[2] + 1);
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
        await voucherTokenInstance.approve(liquidatorInstance.address, 20000, {from: inactiveManager, gas: 1000000});
        const allowance = await voucherTokenInstance.allowance(inactiveManager, liquidatorInstance.address);

        assert.equal(allowance.toNumber(), 20000, 'allowance !=');

        await expectThrow(liquidatorInstance.claimUnclaimFunds({from: inactiveManager, gas: 1000000}));
    });

    it('should fail, because we try to claim remainder funds on an active contract in the wrong state', async () => {
        await expectThrow(liquidatorInstance.claimRemainder(inactiveManager));
    });

    // !!! UNCLAIMED !!!
    it('increase time to claim unclaim funds', async () => {
        console.log('[ Claim Unclaimed Funds period ]'.yellow);
        await increaseTimeTo(startTimes[2] + 31536000 + 1);
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
        await icoTokenInstance.approve(liquidatorInstance.address, 20000, {from: inactiveManager, gas: 1000000});
        const allowance = await icoTokenInstance.allowance(inactiveManager, liquidatorInstance.address);

        assert.equal(allowance.toNumber(), 20000, 'allowance !=');
        await expectThrow(liquidatorInstance.claimFunds({from: inactiveInvestor1, gas: 1000000}));
    });

    it('should fail, because we try to claim remainder funds on an active contract in the wrong state', async () => {
        await expectThrow(liquidatorInstance.claimRemainder(inactiveManager));
    });

    // !!! REMAINDER !!!
    it('increase time to allow forwarding of  remaining funds', async () => {
        console.log('[ Transfer Remaining Funds period ]'.yellow);
        await increaseTimeTo(startTimes[2] + (31536000 * 2) + 1);
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
