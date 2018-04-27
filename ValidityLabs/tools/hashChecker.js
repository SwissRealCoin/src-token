const sha3      = require('web3-utils').sha3;
const fs        = require('fs');
const assert    = require('assert');

// Valid hashes using Keccak-256

const contracts = {
    Crowdsale       : fs.readFileSync('node_modules/zeppelin-solidity/contracts/crowdsale/Crowdsale.sol'),
    MintableToken   : fs.readFileSync('node_modules/zeppelin-solidity/contracts/token/ERC20/MintableToken.sol'),
    PausableToken   : fs.readFileSync('node_modules/zeppelin-solidity/contracts/token/ERC20/PausableToken.sol'),
    StandardToken   : fs.readFileSync('node_modules/zeppelin-solidity/contracts/token/ERC20/StandardToken.sol'),
    Pausable        : fs.readFileSync('node_modules/zeppelin-solidity/contracts/lifecycle/Pausable.sol'),
    Ownable         : fs.readFileSync('node_modules/zeppelin-solidity/contracts/ownership/Ownable.sol'),
    ERC20           : fs.readFileSync('node_modules/zeppelin-solidity/contracts/token/ERC20/ERC20.sol'),
    BasicToken      : fs.readFileSync('node_modules/zeppelin-solidity/contracts/token/ERC20/BasicToken.sol'),
    ERC20Basic      : fs.readFileSync('node_modules/zeppelin-solidity/contracts/token/ERC20/ERC20Basic.sol'),
    SafeMath        : fs.readFileSync('node_modules/zeppelin-solidity/contracts/math/SafeMath.sol'),
    TokenVesting    : fs.readFileSync('node_modules/zeppelin-solidity/contracts/token/ERC20/TokenVesting.sol')
};

const hashes = {
    Crowdsale     : '0xb7b4c921f94cbe2536475e12b6254856473eb5832d9b63526c56bef41b446777',
    MintableToken : '0x07397a8011758b3be15dbf6923ed292e2facd777441995ba39f8e118f6c63682',
    PausableToken : '0x1f91bb15f141c4488de987a008592cdb7fc5d56ec332e46eb2c2b0b165cc2608',
    StandardToken : '0xd2b344a5259e19ec143074cfa65637a10c40b68395c59808c4af13bccbb2de55',
    Pausable      : '0x49d41cc2b80f7732cdb504d67cd9a84ebeee38f8ec7204c96c2bded71e295f6a',
    Ownable       : '0x1ad4ec802268eb3e02e732ecf8b65c39bb00cdf448e7737aea27ecfa9fd10d6a',
    ERC20         : '0xd0b7ada654221cc9e4cb4a97754b99d2e7c2fb824303f1ba5f1661f4e8086751',
    BasicToken    : '0x948404468d61ff35ea4194650670408dabd65da7f905a1c16888ab84520bf39e',
    ERC20Basic    : '0x1fd84910b5033c9d169995cd88bdd465d37d4a384ef2837b238b88cd26ef74e7',
    SafeMath      : '0x341ba8cb467a3623e819ba1a683ac1d264005186f308505214e5f6bc89446a08',
    TokenVesting  : '0xdcbd9c21e47959f6f45d34d8f956c682a552b607bca487f2dc60e8d811671d21'
};

Object.keys(contracts).forEach((key) => {
    try {
        assert.equal(sha3(contracts[key]), hashes[key], 'Hash mismatch: ' + key);
    } catch (error) {
        console.log(error.message + ' - Zeppelin Framework');
        console.log(key + ': ' + sha3(contracts[key]));
    }
});
