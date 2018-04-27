/**
 * Test for LiquidationVoting
 *
 * @author Validity Labs AG <info@validitylabs.org>
 */

import {expectThrow, waitNDays, getEvents, BigNumber, cnf, increaseTimeTo} from '../../helpers/tools';
import {logger as log} from '../../../tools/lib/logger';

const Liquidator        = artifacts.require('./Liquidator');
const LiquidationVoting = artifacts.require('./LiquidationVoting');
const SrcToken          = artifacts.require('./SrcToken');

const should = require('chai') // eslint-disable-line
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

const zero  = new BigNumber(0);
const two   = new BigNumber(web3.toWei(2, 'ether'));

const Proposal = {
    amount: 0,
    name: 1,
    url: 2,
    hashvalue: 3,
    beneficiaryAccount: 4,
    blocktime: 5,
    countNoVotes: 6,
    countYesVotes: 7,
    hasVoted: 8
};

const startTimes = [1543622400, 1575158400, 1606780800, 1638316800, 1669852800]; // 2018 - 2022

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

    const rate = 10;
    const unclaimedRate = 5;

    // const votingPeriod = duration.weeks(2);
    // const lockupPeriod = duration.days(20);
    // const budget1 = 123e+17;

    // enum Stages { LockOutPeriod, PendingNextVotingPeriod, AcceptingVotes, VotePassed }

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
        liquidatorAddress = liquidatorInstance.address;
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

    it('should set the Lidquidator address in the LiquidationVoting contract', async () => {
        await liquidationVotingInstance.setLiquidator(liquidatorAddress);
        const liquidator = await liquidationVotingInstance.liquidator();

        assert.equal(liquidator, liquidatorInstance.address, 'liquidator !=');
    });

    it('should instantiate the LiquidationVoting correctly', async () => {
        const votingPeriod = await liquidationVotingInstance.VOTING_PERIOD();
        const dayInSeconds = await liquidationVotingInstance.DAY_IN_SECONDS();
        const yearInSeconds = await liquidationVotingInstance.YEAR_IN_SECONDS();
        const leapYearInSeconds = await liquidationVotingInstance.LEAP_YEAR_IN_SECONDS();
        const orginYear = await liquidationVotingInstance.ORIGIN_YEAR();
        const token = await liquidationVotingInstance.token();
        const votingEnabled = await liquidationVotingInstance.votingEnabled();
        const notaryAddress = await liquidationVotingInstance.notary();
        const currentStage = await liquidationVotingInstance.currentStage();

        assert.equal(votingPeriod.toNumber(), 1987200, 'votingPeriod !=');
        assert.equal(dayInSeconds.toNumber(), 86400, 'dayInSeconds !=');
        assert.equal(yearInSeconds.toNumber(), 31536000, 'yearInSeconds address !=');
        assert.equal(leapYearInSeconds.toNumber(), 31622400, 'leapYearInSecondsd !=');
        assert.equal(orginYear.toNumber(), 1970, 'orgin year != 1970');
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

    /**
     * [ Enable Voting Contract ]
     */

    it('should fail, allow non-notary to enableVoting on Voting contract', async () => {
        await expectThrow(liquidationVotingInstance.enableVoting({from: activeInvestor1, gas: 100000}));

        const currentStage = await liquidationVotingInstance.currentStage();
        assert.equal(currentStage.toNumber(), 0, 'currentStage != 0');
    });

    it('should pass, allow notary to enableVoting on Voting contract', async () => {
        await liquidationVotingInstance.enableVoting({from: notary, gas: 100000});

        const currentStage = await liquidationVotingInstance.currentStage();
        assert.equal(currentStage.toNumber(), 1, 'currentStage != 1');
    });

    it('should fail, allow notary to enableVoting on Voting contract - contract is already enabled!', async () => {
        const previousStage = await liquidationVotingInstance.currentStage();
        await expectThrow(await liquidationVotingInstance.enableVoting({from: notary, gas: 100000}));

        const currentStage = await liquidationVotingInstance.currentStage();
        assert.equal(currentStage.toNumber(), previousStage.toNumber(), 'currentStage != previousStage');
    });

    it('', async () => {

    });

    /**
     * [ Accept Proposal Period ]
     */

    it('should AcceptingProposals', async () => {
        console.log('[ accepting proposals period ]'.yellow);
        const stage  = await voting.stage();
        assert.equal(stage, 0, 'stage not in AcceptingProposals');
    });

    it('should be able to make a proposal', async () => {
        const tx1  = await voting.createProposal(
            budget1,
            'buy Cryptokitten for me',
            'http://cryptokitten.io',
            '0x123',
            beneficiary,
            {from: owner, gas: 1000000}
        );
        const events = getEvents(tx1, 'ProposalCreated');
        assert.equal(events[0].name, 'buy Cryptokitten for me', 'Event doesnt exist');
        const props = await voting.proposals(0);
        assert.equal(props[Proposal.amount], budget1);
        assert.equal(props[Proposal.name], 'buy Cryptokitten for me');
        assert.equal(props[Proposal.url], 'http://cryptokitten.io');
        assert.equal(props[Proposal.hashvalue], '0x1230000000000000000000000000000000000000000000000000000000000000');
        assert.equal(props[Proposal.beneficiaryAccount], beneficiary);
    });

    /**
     * [ Accept Votes Period ]
     */

    it('should AcceptingVotes', async () => {
        console.log('[ accepting votes period ]'.yellow);
        const stage  = await voting.stage();
        assert.equal(stage, 1, 'stage not in AcceptingVotes');
    });

    it('should be able to vote', async () => {
        const tx1 = await voting.vote(
            false,
            {from: activeInvestor1, gas: 1000000}
        );
        const tx2 = await voting.vote(
            true,
            {from: activeInvestor2, gas: 1000000}
        );
        const events = getEvents(tx1, 'ProposalVoted');

        const props = await voting.proposals(0);

        assert.equal(props[Proposal.countNoVotes].toNumber(), 20e+18);
        assert.equal(props[Proposal.countYesVotes].toNumber(), 30e+18);
    });

    it('should move to time after voting period', async () => {
        const before = Number(web3.eth.getBlock(web3.eth.blockNumber).timestamp);
        await increaseTimeTo(before + votingPeriod);
        const now = Number(web3.eth.getBlock(web3.eth.blockNumber).timestamp);
        assert.isAtLeast(now, before + votingPeriod);
    });

    it('should be able to let beneficiaries claim their money', async () => {
        const tx1 = await voting.releaseFunds({from: activeInvestor1, gas: 1000000});

        const events = getEvents(tx1, 'FundsReleased');

        assert.equal(events[0].amount.toNumber(), budget1);
        assert.equal(events[0].beneficiary, beneficiary);
    });

    /**
     * [ Accept Proposals Again Period ]
     */

    it('should AcceptingProposals again', async () => {
        console.log('[ accepting proposals period ]'.yellow);
        const stage  = await voting.stage();
        assert.equal(stage, 0, 'stage not in AcceptingProposals');
    });

    /**
     * [ Accept Votes Again Period ]
     */

    /**
     * [ Vote Passed - Trigger Liquidation ]
     */
});
