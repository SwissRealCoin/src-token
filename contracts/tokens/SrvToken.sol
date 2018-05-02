/**
 * @title SwissRealVoucher token
 *
 * @version 1.0
 * @author Validity Labs AG <info@validitylabs.org>
 */
pragma solidity ^0.4.21;

import "openzeppelin-solidity/contracts/token/ERC20/MintableToken.sol";
import "openzeppelin-solidity/contracts/token/ERC20/BurnableToken.sol";

contract SrvToken is MintableToken, BurnableToken {
    string public constant name = "SwissRealVoucher";
    string public constant symbol = "SRV";
    uint8 public constant decimals = 18;

    /**
     * @dev Constructor of SrvToken that instantiates a new Mintable Burnable Token
     */
    function SrvToken() public {}
}
