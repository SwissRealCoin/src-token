/**
 * Test for SrcToken
 *
 * @author Validity Labs AG <info@validitylabs.org>
 */

import {expectThrow, getEvents, BigNumber} from '../../helpers/tools';
import {logger as log} from '../../../tools/lib/logger';

const SrcToken = artifacts.require('./SrcToken');

const should = require('chai') // eslint-disable-line
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

// TODO: APPROVE AND CALL
/**
 * SrcToken contract
 */
contract('SrcToken', (accounts) => {
    const owner         = accounts[0];
    const tokenHolder1  = accounts[5];
    const tokenHolder2  = accounts[6];
    const tokenHolder3  = accounts[7];

    const blockNum = [];

    // Provide srcTokenInstance for every test case
    let srcTokenInstance;
    before(async () => {
        srcTokenInstance = await SrcToken.deployed();
    });

    /**
     * [ Pause Period ]
     */

    it('should instantiate the ICO token correctly', async () => {
        log.info('[ Pause Period ]');

        const isOwnerAccountZero    = await srcTokenInstance.owner() === owner;
        const name                  = await srcTokenInstance.name();
        const symbol                = await srcTokenInstance.symbol();
        const decimals              = await srcTokenInstance.decimals();
        const paused                = await srcTokenInstance.transfersEnabled();

        assert.isTrue(isOwnerAccountZero, 'Owner is not the first account: ' + srcTokenInstance.owner());
        assert.equal(name, 'SwissRealCoin', 'Name does not match');
        assert.equal(symbol, 'SRC', 'Symbol does not match');
        assert.equal(decimals, 18, 'Decimals does not match');
        assert.isFalse(paused);

        blockNum[0] = web3.eth.blockNumber;
    });

    it('should fail, because we try to transfer on a paused contract', async () => {
        await expectThrow(srcTokenInstance.transfer(tokenHolder2, 1, {from: tokenHolder1}));
    });

    it('should fail, because we try to approve on a paused contract', async () => {
        await expectThrow(srcTokenInstance.approve(tokenHolder2, 100, {from: tokenHolder1}));
    });

    it('should mint 5 tokens for each token holder', async () => {
        blockNum[1] = web3.eth.blockNumber;

        let balanceTokenHolder1 = await srcTokenInstance.balanceOf(tokenHolder1);
        let balanceTokenHolder2 = await srcTokenInstance.balanceOf(tokenHolder2);
        let balanceTokenHolder3 = await srcTokenInstance.balanceOf(tokenHolder3);
        let totalSupply         = await srcTokenInstance.totalSupply();

        assert.equal(balanceTokenHolder1, 0, 'Wrong token balance of tokenHolder1 (is not 0): ' + balanceTokenHolder1);
        assert.equal(balanceTokenHolder2, 0, 'Wrong token balance of tokenHolder2 (is not 0): ' + balanceTokenHolder2);
        assert.equal(balanceTokenHolder3, 0, 'Wrong token balance of tokenHolder3 (is not 0): ' + balanceTokenHolder3);
        assert.equal(totalSupply, 0, 'Wrong total supply (is not 0): ' + totalSupply);

        const tx1 = await srcTokenInstance.generateTokens(tokenHolder1, 5);
        const tx2 = await srcTokenInstance.generateTokens(tokenHolder2, 5);
        const tx3 = await srcTokenInstance.generateTokens(tokenHolder3, 5);

        balanceTokenHolder1 = await srcTokenInstance.balanceOf(tokenHolder1);
        balanceTokenHolder2 = await srcTokenInstance.balanceOf(tokenHolder2);
        balanceTokenHolder3 = await srcTokenInstance.balanceOf(tokenHolder3);
        totalSupply         = await srcTokenInstance.totalSupply();

        assert.equal(balanceTokenHolder1, 5, 'Wrong token balance of tokenHolder1 (is not 5): ' + balanceTokenHolder1);
        assert.equal(balanceTokenHolder2, 5, 'Wrong token balance of tokenHolder2 (is not 5): ' + balanceTokenHolder2);
        assert.equal(balanceTokenHolder3, 5, 'Wrong token balance of tokenHolder3 (is not 5): ' + balanceTokenHolder3);
        assert.equal(totalSupply, 15, 'Wrong total supply (is not 15): ' + totalSupply);

        // Testing events
        const events1 = getEvents(tx1);
        const events2 = getEvents(tx2);
        const events3 = getEvents(tx3);

        assert.equal(events1.Transfer[0]._to, tokenHolder1, 'Transfer event to address doesn\'t match against tokenHolder1 address');
        assert.equal(events2.Transfer[0]._to, tokenHolder2, 'Transfer event to address doesn\'t match against tokenHolder2 address');
        assert.equal(events3.Transfer[0]._to, tokenHolder3, 'Transfer event to address doesn\'t match against tokenHolder3 address');

        events1.Transfer[0]._amount.should.be.bignumber.equal(5);
        events2.Transfer[0]._amount.should.be.bignumber.equal(5);
        events3.Transfer[0]._amount.should.be.bignumber.equal(5);

        blockNum[2] = web3.eth.blockNumber;
    });

    /**
     * [ Free Period ]
     */

    it('should unpause ICO token correctly', async () => {
        log.info('[ Free Period ]');

        await srcTokenInstance.enableTransfers(true, {from: owner});
        const paused = await srcTokenInstance.transfersEnabled();

        assert.isTrue(paused);
    });

    it('should pass, transfer 0 tokens - throws event', async () => {
        const tx = await srcTokenInstance.transfer(tokenHolder2, 0, {from: tokenHolder1});

        // Testing events
        const transferEvents = getEvents(tx, 'Transfer');

        assert.equal(transferEvents[0]._from, tokenHolder1, 'Transfer event from address doesn\'t match against tokenHolder1 address');
        assert.equal(transferEvents[0]._to, tokenHolder2, 'Transfer event to address doesn\'t match against tokenHolder2 address');
        transferEvents[0]._amount.should.be.bignumber.equal(0);

        blockNum[3] = web3.eth.blockNumber;
    });

    it('should fail, transfer tokens to Token Contract', async () => {
        await expectThrow(srcTokenInstance.transfer(srcTokenInstance.address, 1, {from: tokenHolder1}));
    });

    it('should fail, cannot sent ether to fallback', async () => {
        await expectThrow(srcTokenInstance.sendTransaction({  // investments(3)
            from:   tokenHolder1,
            value:  web3.toWei(3, 'ether'),
            gas:    1000000
        }));
    });

    it('should transfer token of tokenHolder1 to tokenHolder2 using the transfer method', async () => {
        const tokenHolder1Balance1 = await srcTokenInstance.balanceOf(tokenHolder1);
        const tokenHolder2Balance1 = await srcTokenInstance.balanceOf(tokenHolder2);

        const tx = await srcTokenInstance.transfer(tokenHolder2, 5, {from: tokenHolder1});

        const tokenHolder2Balance2 = await srcTokenInstance.balanceOf(tokenHolder2);

        tokenHolder2Balance1.plus(tokenHolder1Balance1).should.be.bignumber.equal(tokenHolder2Balance2);

        // Testing events
        const transferEvents = getEvents(tx, 'Transfer');

        assert.equal(transferEvents[0]._from, tokenHolder1, 'Transfer event from address doesn\'t match against tokenHolder1 address');
        assert.equal(transferEvents[0]._to, tokenHolder2, 'Transfer event to address doesn\'t match against tokenHolder2 address');
        transferEvents[0]._amount.should.be.bignumber.equal(5);

        blockNum[3] = web3.eth.blockNumber;
    });

    it('should transfer token of tokenHolder2 back to tokenHolder1 using the transferFrom method', async () => {
        const tokenHolder2Balance1  = await srcTokenInstance.balanceOf(tokenHolder2);
        const tokenHolder3Balance1  = await srcTokenInstance.balanceOf(tokenHolder3);

        const allow1 = await srcTokenInstance.allowance(tokenHolder2, tokenHolder1);
        allow1.should.be.bignumber.equal(0);

        await srcTokenInstance.approve(tokenHolder1, 5, {from: tokenHolder2});

        const allow2 = await srcTokenInstance.allowance(tokenHolder2, tokenHolder1);
        allow2.should.be.bignumber.equal(5);

        const tx = await srcTokenInstance.transferFrom(tokenHolder2, tokenHolder1, 5, {from: tokenHolder1});

        const tokenHolder1Balance2  = await srcTokenInstance.balanceOf(tokenHolder1);
        const tokenHolder2Balance2  = await srcTokenInstance.balanceOf(tokenHolder2);
        const tokenHolder3Balance2  = await srcTokenInstance.balanceOf(tokenHolder3);

        tokenHolder3Balance1.should.be.bignumber.equal(tokenHolder3Balance2);
        tokenHolder1Balance2.should.be.bignumber.equal(allow2);
        tokenHolder2Balance2.should.be.bignumber.equal(tokenHolder2Balance1.minus(allow2));

        // Testing events
        const transferEvents = getEvents(tx, 'Transfer');

        assert.equal(transferEvents[0]._from, tokenHolder2, 'Transfer event from address doesn\'t match against tokenHolder2 address');
        assert.equal(transferEvents[0]._to, tokenHolder1, 'Transfer event to address doesn\'t match against tokenHolder1 address');
        transferEvents[0]._amount.should.be.bignumber.equal(5);

        blockNum[4] = web3.eth.blockNumber;
    });

    it('Should Destroy 3 tokens from tokenHolder1', async () => {
        await srcTokenInstance.destroyTokens(tokenHolder1, 3, {from: owner, gas: 200000});
        const tokenHolder1Balance  = await srcTokenInstance.balanceOf(tokenHolder1);
        const totalSupply = await srcTokenInstance.totalSupply();
        assert.equal(totalSupply.toNumber(), 12);
        assert.equal(tokenHolder1Balance, 2);

        blockNum[5] = web3.eth.blockNumber;
    });

    it('History of balances should match as expected', async () => {
        let balance = await srcTokenInstance.balanceOfAt(owner, blockNum[0]);
        assert.equal(balance, 0);
        balance = await srcTokenInstance.balanceOfAt(tokenHolder1, blockNum[0]);
        assert.equal(balance, 0);
        balance = await srcTokenInstance.balanceOfAt(tokenHolder2, blockNum[0]);
        assert.equal(balance, 0);
        balance = await srcTokenInstance.balanceOfAt(tokenHolder3, blockNum[0]);
        assert.equal(balance, 0);

        balance = await srcTokenInstance.balanceOfAt(owner, blockNum[1]);
        assert.equal(balance, 0);
        balance = await srcTokenInstance.balanceOfAt(tokenHolder1, blockNum[1]);
        assert.equal(balance, 0);
        balance = await srcTokenInstance.balanceOfAt(tokenHolder2, blockNum[1]);
        assert.equal(balance, 0);
        balance = await srcTokenInstance.balanceOfAt(tokenHolder3, blockNum[1]);
        assert.equal(balance, 0);

        balance = await srcTokenInstance.balanceOfAt(owner, blockNum[2]);
        assert.equal(balance, 0);
        balance = await srcTokenInstance.balanceOfAt(tokenHolder1, blockNum[2]);
        assert.equal(balance, 5);
        balance = await srcTokenInstance.balanceOfAt(tokenHolder2, blockNum[2]);
        assert.equal(balance, 5);
        balance = await srcTokenInstance.balanceOfAt(tokenHolder3, blockNum[2]);
        assert.equal(balance, 5);

        balance = await srcTokenInstance.balanceOfAt(owner, blockNum[3]);
        assert.equal(balance, 0);
        balance = await srcTokenInstance.balanceOfAt(tokenHolder1, blockNum[3]);
        assert.equal(balance, 0);
        balance = await srcTokenInstance.balanceOfAt(tokenHolder2, blockNum[3]);
        assert.equal(balance, 10);
        balance = await srcTokenInstance.balanceOfAt(tokenHolder3, blockNum[3]);
        assert.equal(balance, 5);

        balance = await srcTokenInstance.balanceOfAt(owner, blockNum[4]);
        assert.equal(balance, 0);
        balance = await srcTokenInstance.balanceOfAt(tokenHolder1, blockNum[4]);
        assert.equal(balance, 5);
        balance = await srcTokenInstance.balanceOfAt(tokenHolder2, blockNum[4]);
        assert.equal(balance, 5);
        balance = await srcTokenInstance.balanceOfAt(tokenHolder3, blockNum[4]);
        assert.equal(balance, 5);

        balance = await srcTokenInstance.balanceOfAt(owner, blockNum[5]);
        assert.equal(balance, 0);
        balance = await srcTokenInstance.balanceOfAt(tokenHolder1, blockNum[5]);
        assert.equal(balance, 2);
        balance = await srcTokenInstance.balanceOfAt(tokenHolder2, blockNum[5]);
        assert.equal(balance, 5);
        balance = await srcTokenInstance.balanceOfAt(tokenHolder3, blockNum[5]);
        assert.equal(balance, 5);
    });
});
