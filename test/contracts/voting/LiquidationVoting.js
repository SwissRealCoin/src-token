/**
 * Test for LiquidationVoting
 *
 * @author Validity Labs AG <info@validitylabs.org>
 */

import {expectThrow, waitNDays, getEvents, BigNumber, cnf, increaseTimeTo} from '../../helpers/tools';
import {logger as log} from '../../../tools/lib/logger';

const Liquidator        = artifacts.require('./Liquidator');
const LiquidationVoting = artifacts.require('./LiquidationVoting');
const LiquidatorWallet  = artifacts.require('./LiquidationWallet');
const SrcToken          = artifacts.require('./SrcToken');
const WETHToken         = artifacts.require('./WETHToken');

const should = require('chai') // eslint-disable-line
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

/**
 * LiquidationVoting contract
 */
contract('LiquidationVoting', (accounts) => {
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

    const oneDay = 86400;
    const startTimes = [1543622400, 1575158400, 1606780800, 1638316800, 1669852800]; // 2018 - 2022

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
        liquidationVotingInstance   = await LiquidationVoting.deployed();
        liquidatorInstance          = await Liquidator.deployed();
        liquidationWalletAddress    = await liquidatorInstance.liquidationWallet();
        icoTokenAddress             = await liquidationVotingInstance.token();
        icoTokenInstance            = await SrcToken.at(icoTokenAddress);
        liquidatorAddress           = liquidatorInstance.address;

        liquidationWalletAddress    = await liquidatorInstance.liquidationWallet();
        liquidationWalletInstance   = await LiquidatorWallet.at(liquidationWalletAddress);

        payoutTokenAddress          = await liquidationWalletInstance.token();
        payoutTokenInstance         = await WETHToken.at(payoutTokenAddress);
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

    it('should instantiate the Liquidator correctly', async () => {
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
        // const dayInSeconds = await liquidationVotingInstance.DAY_IN_SECONDS();
        // const yearInSeconds = await liquidationVotingInstance.YEAR_IN_SECONDS();
        // const leapYearInSeconds = await liquidationVotingInstance.LEAP_YEAR_IN_SECONDS();
        // const orginYear = await liquidationVotingInstance.ORIGIN_YEAR();
        const token = await liquidationVotingInstance.token();
        const votingEnabled = await liquidationVotingInstance.votingEnabled();
        const notaryAddress = await liquidationVotingInstance.notary();
        const currentStage = await liquidationVotingInstance.currentStage();

        assert.equal(votingPeriod.toNumber(), 1987200, 'votingPeriod !=');
        // assert.equal(dayInSeconds.toNumber(), 86400, 'dayInSeconds !=');
        // assert.equal(yearInSeconds.toNumber(), 31536000, 'yearInSeconds address !=');
        // assert.equal(leapYearInSeconds.toNumber(), 31622400, 'leapYearInSecondsd !=');
        // assert.equal(orginYear.toNumber(), 1970, 'orgin year != 1970');
        assert.equal(token, icoTokenAddress, 'token !=');
        assert.equal(votingEnabled, false, 'voting not enabled');
        assert.equal(notaryAddress, notary, 'notary !=');
        assert.equal(currentStage.toNumber(), 0, 'currentStage != 0');
    });

    it('should check start times for the LiquidationVoting correctly', async () => {
        const time0 = await liquidationVotingInstance.startTimeStamps(0);
        const time1 = await liquidationVotingInstance.startTimeStamps(1);
        const time2 = await liquidationVotingInstance.startTimeStamps(2);
        const time3 = await liquidationVotingInstance.startTimeStamps(3);
        const time4 = await liquidationVotingInstance.startTimeStamps(4);
        const currentTimeStamp = await liquidationVotingInstance.currentTimeStamp();

        assert.equal(currentTimeStamp, 0, 'currentTimeStamp != 0');
        assert.equal(time0, startTimes[0], 'time0 !=');
        assert.equal(time1, startTimes[1], 'time1 !=');
        assert.equal(time2, startTimes[2], 'time2 !=');
        assert.equal(time3, startTimes[3], 'time3 !=');
        assert.equal(time4, startTimes[4], 'time4 !=');
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

    it('should fail, allow non-notary to enableVoting on Voting contract', async () => {
        await expectThrow(liquidationVotingInstance.enableVoting({from: activeInvestor1, gas: 200000}));

        const currentStage = await liquidationVotingInstance.currentStage();
        assert.equal(currentStage.toNumber(), 0, 'currentStage != 0');
    });

    it('should pass, allow notary to enableVoting on Voting contract', async () => {
        await liquidationVotingInstance.enableVoting({from: notary, gas: 200000});

        const currentStage = await liquidationVotingInstance.currentStage();
        assert.equal(currentStage.toNumber(), 1, 'currentStage != 1');

        console.log('[ Enabled Period ]'.yellow);
    });

    it('should fail, notary to enableVoting on Voting contract - contract is already enabled!', async () => {
        const previousStage = await liquidationVotingInstance.currentStage();

        await expectThrow(liquidationVotingInstance.enableVoting({from: notary, gas: 200000}));

        const currentStage = await liquidationVotingInstance.currentStage();
        assert.equal(currentStage.toNumber(), previousStage.toNumber(), 'currentStage != previousStage');
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

    it('notary should be able to change qurorum rate to 55%', async () => {
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
    });

    it('should fail, notary should not be able to change qurorum rate to 55%', async () => {
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
        const tx1 = await liquidationVotingInstance.vote(true, {from: activeInvestor1, gas: 1000000});
        const tx2 = await liquidationVotingInstance.vote(false, {from: activeInvestor2, gas: 1000000});

        const events = getEvents(tx1, 'ProposalVoted');
        const events2 = getEvents(tx2, 'ProposalVoted');

        assert.equal(events[0].voter, activeInvestor1, 'activeInvestor1 != voter');
        assert.equal(events2[0].voter, activeInvestor2, 'activeInvestor2 != voter');

        assert.equal(events[0].votes.toNumber(), 10000, 'activeInvestor1 votes != votes');
        assert.equal(events2[0].votes.toNumber(), 20000, 'activeInvestor2 votes != votes');

        assert.equal(events[0].isYes, true, 'activeInvestor1 boolean !=');
        assert.equal(events2[0].isYes, false, 'activeInvestor2 boolean !=');

        const props = await liquidationVotingInstance.proposals(0);

        assert.equal(props[0].toNumber(), 550, 'quorum rate !=');
        assert.equal(props[1].toNumber(), startTimes[0], 'blocktime !=');
        assert.equal(props[2].toNumber(), 20000, 'countNoVotes !=');
        assert.equal(props[3].toNumber(), 10000, 'countYesVotes !=');
    });

    it('should fail, calling calcProposalResult to get proposal outcome', async () => {
        await expectThrow(liquidationVotingInstance.calcProposalResult());
    });

    it('should fail, notary to enableVoting on Voting contract - contract is already enabled!', async () => {
        const previousStage = await liquidationVotingInstance.currentStage();

        await expectThrow(liquidationVotingInstance.enableVoting({from: notary, gas: 200000}));

        const currentStage = await liquidationVotingInstance.currentStage();
        assert.equal(currentStage.toNumber(), previousStage.toNumber(), 'currentStage != previousStage');
    });

    it('should move to time after voting period', async () => {
        await increaseTimeTo(startTimes[0] + (oneDay * 23) + 1);
        console.log('[ Pending Results Period ]'.yellow);
    });

    /**
    * [ Pending Results Period ]
    */

    it('should call calcProposalResult to get proposal outcome', async () => {
        const tx = await liquidationVotingInstance.calcProposalResult({from: inactiveInvestor1, gas: 200000});

        const events = getEvents(tx, 'LiquidationResult');

        assert.equal(events[0].didPass, false, 'didPass !=');
        assert.equal(events[0].qResult.toNumber(), 333, 'qResult != 333 (33.3%)');
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

    it('should fail, notary should be able to change qurorum rate to 55%', async () => {
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

        assert.equal(events[0].votes.toNumber(), 10000, 'activeInvestor1 votes != votes');
        assert.equal(events2[0].votes.toNumber(), 20000, 'activeInvestor2 votes != votes');
        assert.equal(events3[0].votes.toNumber(), 30000, 'activeInvestor3 votes != votes');

        assert.equal(events[0].isYes, true, 'activeInvestor1 boolean !=');
        assert.equal(events2[0].isYes, false, 'activeInvestor2 boolean !=');
        assert.equal(events3[0].isYes, true, 'activeInvestor3 boolean !=');

        const props = await liquidationVotingInstance.proposals(1);

        assert.equal(props[0].toNumber(), 600, 'quorum rate !=');
        assert.equal(props[1].toNumber(), startTimes[1], 'blocktime !=');
        assert.equal(props[2].toNumber(), 20000, 'countNoVotes !=');
        assert.equal(props[3].toNumber(), 40000, 'countYesVotes !=');
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
        const tx = await liquidationVotingInstance.calcProposalResult({from: inactiveInvestor3, gas: 100000});

        const events = getEvents(tx, 'LiquidationResult');

        assert.equal(events[0].didPass, true, 'didPass !=');
        assert.equal(events[0].qResult.toNumber(), 666, 'qResult != 666 (66.6%)');
    });

    it('should fail, calling calcProposalResult to get proposal outcome', async () => {
        await expectThrow(liquidationVotingInstance.calcProposalResult({from: inactiveInvestor1, gas: 100000}));
    });

    /**
    * [ Vote Passed - Trigger Liquidation ]
    */

    it('should be in VotePassed stage', async () => {
        const currentStage = await liquidationVotingInstance.currentStage();
        assert.equal(currentStage.toNumber(), 4, 'currentStage != 4');
    });

    // test more Liquidator contract
    it('should pass, because contract is active', async () => {
        console.log('[ Test Liquidator Contract ]'.yellow);
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
        await liquidatorInstance.setStartTime(startTimes[2]); // 2021
    });

    it('should pass, contract in active state', async () => {
        const currentState = await liquidatorInstance.currentState();
        assert.equal(currentState.toNumber(), 1, 'state is incorrect; should be 1');
        console.log('[ Test Liquidator Contract End ]'.yellow);
    });
    // end tests
});
