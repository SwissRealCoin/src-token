/**
 * @title Test Wrapped ETH token used to test the Liquidator and LiquidatorWallet
 *
 * @version 1.0
 * @author Validity Labs AG <info@validitylabs.org>
 */
pragma solidity ^0.4.21;

import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";

contract WETHToken is StandardToken {
    string public constant name = "Test W-Eth";
    string public constant symbol = "WETH";
    uint8 public constant decimals = 18;

    uint256 public constant INITIAL_SUPPLY = 100000 * 1e18; //100,000 tokens

    /**
     * @dev Constructor of WETHToken that instantiates a new Mintable Burnable Token
     */
    function WETHToken() public {
        totalSupply_ = INITIAL_SUPPLY;
        balances[msg.sender] = INITIAL_SUPPLY;
        emit Transfer(0x0, msg.sender, INITIAL_SUPPLY);
    }
}
