/**
 * @title Auto Refund Vault - inspired by OZ's RefundVault.sol
 * Allows settlement stage of crowdsale to push refunds to investors
 * Allows pull refunds if the crowdsale fails to reach goal (state == Refunding)
 * @version 1.0
 * @author Validity Labs AG <info@validitylabs.org>
 */
pragma solidity ^0.4.21;

import 'openzeppelin-solidity/contracts/math/SafeMath.sol';
import 'openzeppelin-solidity/contracts/ownership/Ownable.sol';

contract AutoRefundVault is Ownable {
    using SafeMath for uint256;

    /*** VARIABLES ***/
    enum State { Active, Closed }

    uint256 public occurrence;   // the current round of the crowdsale
    mapping (address => uint256[1000]) public deposited; // TODO: gas amount - storing 1000 vs being dynamic - expirement in remix 

    address public wallet;
    State public state;

    /*** EVENTS ***/
    event Closed(uint256 vaultBalance);
    event Opened();
    event Refunded(address indexed beneficiary, uint256 weiAmount);

    /**
    * @dev constructor
    * @param _wallet address
    */
    function AutoRefundVault(address _wallet) public {
        require(_wallet != address(0));
        wallet = _wallet;
        state = State.Active;
    }

    /**
    * @param investor address
    */
    function deposit(address investor) onlyOwner public payable {
        require(state == State.Active);
        deposited[investor][occurrence] = deposited[investor][occurrence].add(msg.value);
    }

    function close() onlyOwner public {
        require(state == State.Active);
        state = State.Closed;
        uint256 vaultBalance = address(this).balance;
        emit Closed(vaultBalance);
        wallet.transfer(vaultBalance);
    }

    /*** Custom functions added below ***/

    /**
    * @dev allows the owner to push refunds back to investors during the active state of the vault
    * @param investor address
    */
    function pushRefund(address investor) onlyOwner public returns (bool result) {
        require(state == State.Active);
        uint256 depositedValue = deposited[investor][occurrence];
        deposited[investor][occurrence] = 0;
        result = investor.send(depositedValue);
        emit Refunded(investor, depositedValue);
    }

    /**
    * @dev reopens the vault for a new crowdsale round
    */
    function openVault() onlyOwner public {
        require(state == State.Closed);
        state = State.Active;
        occurrence++;
        emit Opened();
    }
}
