/**
 * Test for WETHToken
 * !!! This Token contract does not get deployed on the mainnet - soley used for testing purposes !!!
 *
 * @author Validity Labs AG <info@validitylabs.org>
 */

import {expectThrow, getEvents, BigNumber} from '../../helpers/tools';
import {logger as log} from '../../../tools/lib/logger';

const WETHToken = artifacts.require('./WETHToken');

const should = require('chai') // eslint-disable-line
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

/**
 * WETHToken contract
 */
contract('WETHToken', (accounts) => {
    const owner         = accounts[0];
    const tokenHolder1  = accounts[5];
    const tokenHolder2  = accounts[6];
    const tokenHolder3  = accounts[7];

    // Provide wEthTokenInstance for every test case
    let wEthTokenInstance;
    beforeEach(async () => {
        wEthTokenInstance = await WETHToken.deployed();
    });

    it('should instantiate the ICO token correctly', async () => {
        log.info('[ Instantiate Token Correctly ]');

        const name      = await wEthTokenInstance.name();
        const symbol    = await wEthTokenInstance.symbol();
        const decimals  = await wEthTokenInstance.decimals();

        assert.equal(name, 'Test W-Eth', 'Name does not match');
        assert.equal(symbol, 'WETH', 'Symbol does not match');
        assert.equal(decimals, 18, 'Decimals does not match');
    });

    it('should transfer token of owner to tokenHolder1 & tokenHolder2 using the transfer method', async () => {
        const ownerBalance1 = await wEthTokenInstance.balanceOf(owner);
        const tokenHolder1Balance1 = await wEthTokenInstance.balanceOf(tokenHolder1);
        const tokenHolder2Balance1 = await wEthTokenInstance.balanceOf(tokenHolder2);

        const tx = await wEthTokenInstance.transfer(tokenHolder1, 10, {from: owner});
        const tx2 = await wEthTokenInstance.transfer(tokenHolder2, 5, {from: tokenHolder1});

        const ownerBalance2 = await wEthTokenInstance.balanceOf(owner);
        const tokenHolder1Balance2 = await wEthTokenInstance.balanceOf(tokenHolder1);
        const tokenHolder2Balance2 = await wEthTokenInstance.balanceOf(tokenHolder2);

        // Testing events
        const transferEvents = getEvents(tx, 'Transfer');
        const transferEvents2 = getEvents(tx2, 'Transfer');

        assert.equal(transferEvents[0].from, owner, 'Transfer event from address doesn\'t match against tokenHolder1 address');
        assert.equal(transferEvents[0].to, tokenHolder1, 'Transfer event to address doesn\'t match against tokenHolder2 address');
        transferEvents[0].value.should.be.bignumber.equal(10);

        assert.equal(transferEvents2[0].from, tokenHolder1, 'Transfer event from address doesn\'t match against tokenHolder1 address');
        assert.equal(transferEvents2[0].to, tokenHolder2, 'Transfer event to address doesn\'t match against tokenHolder2 address');
        transferEvents2[0].value.should.be.bignumber.equal(5);

        assert.equal((ownerBalance1.toNumber() - 10), ownerBalance2, 'owner balances not equal');
        assert.equal(tokenHolder1Balance2.toNumber(), 5, 'tokenHolder1 balances not equal');
        assert.equal(tokenHolder2Balance2.toNumber(), 5, 'tokenHolder2 balances not equal');
    });

    it('should transfer token of tokenHolder2 back to tokenHolder1 using the transferFrom method', async () => {
        const tokenHolder2Balance1  = await wEthTokenInstance.balanceOf(tokenHolder2);
        const tokenHolder3Balance1  = await wEthTokenInstance.balanceOf(tokenHolder3);

        const allow1 = await wEthTokenInstance.allowance(tokenHolder2, tokenHolder1);
        allow1.should.be.bignumber.equal(0);

        await wEthTokenInstance.approve(tokenHolder1, 5, {from: tokenHolder2});

        const allow2 = await wEthTokenInstance.allowance(tokenHolder2, tokenHolder1);
        allow2.should.be.bignumber.equal(5);

        const tx = await wEthTokenInstance.transferFrom(tokenHolder2, tokenHolder1, 5, {from: tokenHolder1});

        const tokenHolder1Balance2  = await wEthTokenInstance.balanceOf(tokenHolder1);
        const tokenHolder2Balance2  = await wEthTokenInstance.balanceOf(tokenHolder2);
        const tokenHolder3Balance2  = await wEthTokenInstance.balanceOf(tokenHolder3);

        assert.equal(tokenHolder3Balance1.toNumber(), tokenHolder3Balance2.toNumber(), 'tokenHolder3Balance1 not equal');
        assert.equal((tokenHolder1Balance2.toNumber() - 5), allow2.toNumber(), 'tokenHolder1Balance2 not equal');
        assert.equal(tokenHolder2Balance2.toNumber(), (tokenHolder2Balance1.toNumber() - allow2), 'tokenHolder2Balance2 not equal');

        // Testing events
        const transferEvents = getEvents(tx, 'Transfer');

        assert.equal(transferEvents[0].from, tokenHolder2, 'Transfer event from address doesn\'t match against tokenHolder2 address');
        assert.equal(transferEvents[0].to, tokenHolder1, 'Transfer event to address doesn\'t match against tokenHolder1 address');
        transferEvents[0].value.should.be.bignumber.equal(5);
    });
});
