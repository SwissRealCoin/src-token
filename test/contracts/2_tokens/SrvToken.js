/**
 * Test for SrvToken
 *
 * @author Validity Labs AG <info@validitylabs.org>
 */

import {expectThrow, getEvents, BigNumber} from '../../helpers/tools';
import {logger as log} from '../../../tools/lib/logger';

const SrvToken = artifacts.require('./SrvToken');

const should = require('chai') // eslint-disable-line
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

/**
 * SrvToken contract
 */
contract('SrvToken', (accounts) => {
    const owner         = accounts[0];
    const tokenHolder1  = accounts[5];
    const tokenHolder2  = accounts[6];
    const tokenHolder3  = accounts[7];

    // Provide srvTokenInstance for every test case
    let srvTokenInstance;
    beforeEach(async () => {
        srvTokenInstance = await SrvToken.deployed();
    });

    it('should instantiate the Voucher token correctly', async () => {
        log.info('[ Pause Period ]');

        const isOwnerAccountZero    = await srvTokenInstance.owner() === owner;
        const name      = await srvTokenInstance.name();
        const symbol    = await srvTokenInstance.symbol();
        const decimals  = await srvTokenInstance.decimals();

        assert.isTrue(isOwnerAccountZero, 'Owner is not the first account: ' + srvTokenInstance.owner());
        assert.equal(name, 'SwissRealVoucher', 'Name does not match');
        assert.equal(symbol, 'SRV', 'Symbol does not match');
        assert.equal(decimals, 18, 'Decimals does not match');
    });

    it('should mint 5 tokens for each token holder', async () => {
        let balanceTokenHolder1 = await srvTokenInstance.balanceOf(tokenHolder1);
        let balanceTokenHolder2 = await srvTokenInstance.balanceOf(tokenHolder2);
        let balanceTokenHolder3 = await srvTokenInstance.balanceOf(tokenHolder3);
        let totalSupply         = await srvTokenInstance.totalSupply();

        assert.equal(balanceTokenHolder1, 0, 'Wrong token balance of tokenHolder1 (is not 0): ' + balanceTokenHolder1);
        assert.equal(balanceTokenHolder2, 0, 'Wrong token balance of tokenHolder2 (is not 0): ' + balanceTokenHolder2);
        assert.equal(balanceTokenHolder3, 0, 'Wrong token balance of tokenHolder3 (is not 0): ' + balanceTokenHolder3);
        assert.equal(totalSupply, 0, 'Wrong total supply (is not 0): ' + totalSupply);

        const tx1 = await srvTokenInstance.mint(tokenHolder1, 5);
        const tx2 = await srvTokenInstance.mint(tokenHolder2, 5);
        const tx3 = await srvTokenInstance.mint(tokenHolder3, 5);

        balanceTokenHolder1 = await srvTokenInstance.balanceOf(tokenHolder1);
        balanceTokenHolder2 = await srvTokenInstance.balanceOf(tokenHolder2);
        balanceTokenHolder3 = await srvTokenInstance.balanceOf(tokenHolder3);
        totalSupply         = await srvTokenInstance.totalSupply();

        assert.equal(balanceTokenHolder1, 5, 'Wrong token balance of tokenHolder1 (is not 5): ' + balanceTokenHolder1);
        assert.equal(balanceTokenHolder2, 5, 'Wrong token balance of tokenHolder2 (is not 5): ' + balanceTokenHolder2);
        assert.equal(balanceTokenHolder3, 5, 'Wrong token balance of tokenHolder3 (is not 5): ' + balanceTokenHolder3);
        assert.equal(totalSupply, 15, 'Wrong total supply (is not 15): ' + totalSupply);

        // Testing events
        const events1 = getEvents(tx1);
        const events2 = getEvents(tx2);
        const events3 = getEvents(tx3);

        events1.Mint[0].amount.should.be.bignumber.equal(5);
        events2.Mint[0].amount.should.be.bignumber.equal(5);
        events3.Mint[0].amount.should.be.bignumber.equal(5);

        assert.equal(events1.Mint[0].to, tokenHolder1, 'Mint event to address doesn\'t match against tokenHolder1 address');
        assert.equal(events2.Mint[0].to, tokenHolder2, 'Mint event to address doesn\'t match against tokenHolder2 address');
        assert.equal(events3.Mint[0].to, tokenHolder3, 'Mint event to address doesn\'t match against tokenHolder3 address');

        events1.Transfer[0].value.should.be.bignumber.equal(5);
        events2.Transfer[0].value.should.be.bignumber.equal(5);
        events3.Transfer[0].value.should.be.bignumber.equal(5);
    });

    it('should transfer token of tokenHolder1 to tokenHolder2 using the transfer method', async () => {
        const tokenHolder1Balance1                  = await srvTokenInstance.balanceOf(tokenHolder1);
        const tokenHolder2Balance1                  = await srvTokenInstance.balanceOf(tokenHolder2);

        const tx = await srvTokenInstance.transfer(tokenHolder2, 5, {from: tokenHolder1});

        const tokenHolder2Balance2                  = await srvTokenInstance.balanceOf(tokenHolder2);

        tokenHolder2Balance1.plus(tokenHolder1Balance1).should.be.bignumber.equal(tokenHolder2Balance2);

        // Testing events
        const transferEvents = getEvents(tx, 'Transfer');

        assert.equal(transferEvents[0].from, tokenHolder1, 'Transfer event from address doesn\'t match against tokenHolder1 address');
        assert.equal(transferEvents[0].to, tokenHolder2, 'Transfer event to address doesn\'t match against tokenHolder2 address');
        transferEvents[0].value.should.be.bignumber.equal(5);
    });

    it('should transfer token of tokenHolder2 back to tokenHolder1 using the transferFrom method', async () => {
        const tokenHolder2Balance1  = await srvTokenInstance.balanceOf(tokenHolder2);
        const tokenHolder3Balance1  = await srvTokenInstance.balanceOf(tokenHolder3);

        const allow1 = await srvTokenInstance.allowance(tokenHolder2, tokenHolder1);
        allow1.should.be.bignumber.equal(0);

        await srvTokenInstance.approve(tokenHolder1, 5, {from: tokenHolder2});

        const allow2 = await srvTokenInstance.allowance(tokenHolder2, tokenHolder1);
        allow2.should.be.bignumber.equal(5);

        const tx = await srvTokenInstance.transferFrom(tokenHolder2, tokenHolder1, 5, {from: tokenHolder1});

        const tokenHolder1Balance2  = await srvTokenInstance.balanceOf(tokenHolder1);
        const tokenHolder2Balance2  = await srvTokenInstance.balanceOf(tokenHolder2);
        const tokenHolder3Balance2  = await srvTokenInstance.balanceOf(tokenHolder3);

        tokenHolder3Balance1.should.be.bignumber.equal(tokenHolder3Balance2);
        tokenHolder1Balance2.should.be.bignumber.equal(allow2);
        tokenHolder2Balance2.should.be.bignumber.equal(tokenHolder2Balance1.minus(allow2));

        // Testing events
        const transferEvents = getEvents(tx, 'Transfer');

        assert.equal(transferEvents[0].from, tokenHolder2, 'Transfer event from address doesn\'t match against tokenHolder2 address');
        assert.equal(transferEvents[0].to, tokenHolder1, 'Transfer event to address doesn\'t match against tokenHolder1 address');
        transferEvents[0].value.should.be.bignumber.equal(5);
    });

    it('should burn 3 tokens of tokenHolder2', async () => {
        const tx = await srvTokenInstance.burn(3, {from: tokenHolder2});
        const tokenHolder2Balance  = await srvTokenInstance.balanceOf(tokenHolder2);

        const events = getEvents(tx, 'Burn');

        assert.equal(tokenHolder2Balance, 2, 'balances not equal');
        assert.equal(events[0].burner, tokenHolder2, 'burner address not equal');
        assert.equal(events[0].value, 3, 'values not equal');
    });
});
