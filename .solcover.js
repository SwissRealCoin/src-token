module.exports = {
    copyNodeModules: false,
    compileCommand: '../node_modules/.bin/truffle compile',
    testCommand: '../node_modules/.bin/truffle test --network coverage',
    copyPackages: ['openzeppelin-solidity'],
    norpc: false,
    skipFiles: ['liquidation/LiquidatorInterface.sol','tokens/MiniMeTokenInterface.sol','tokens/WETHToken.sol']
};
