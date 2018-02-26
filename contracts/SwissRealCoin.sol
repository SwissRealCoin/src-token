pragma solidity ^0.4.18;


import 'zeppelin-solidity/contracts/token/ERC20/StandardToken.sol';


/**
 * @title SwissRealCoin
 * @dev Based on ERC20 implementation from zeppelin framework.
 */
contract SwissRealCoin is StandardToken {

  string public constant name = "SwissRealCoin"; // solium-disable-line uppercase
  string public constant symbol = "CHRC"; // solium-disable-line uppercase
  uint8 public constant decimals = 18; // solium-disable-line uppercase

  uint256 public constant INITIAL_SUPPLY = 1000000000 * (10 ** uint256(decimals));

  /**
   * @dev Constructor that gives msg.sender all of existing tokens.
   */
  function SwissRealCoin() public {
    totalSupply_ = INITIAL_SUPPLY;
    balances[msg.sender] = INITIAL_SUPPLY;
    Transfer(0x0, msg.sender, INITIAL_SUPPLY);
  }

}