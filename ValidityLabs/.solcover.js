module.exports = {
    copyNodeModules: true,  //false
    //copyPackages: ['zeppelin-solidity'],
    sub: '/src',
    norpc: false,
    skipFiles: ['liquidation/LiquidatorInterface.sol','token/MiniMeTokenInterface.sol','token/WETHToken.sol']
};
