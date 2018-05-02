pragma solidity ^0.4.21;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/crowdsale/distribution/FinalizableCrowdsale.sol";
import './AutoRefundVault.sol';

/**
 * @title AutoRefundableCrowdsale
 * @dev Extension of Crowdsale contract that adds a funding goal, and
 * the possibility of users getting a refund if goal is not met.
 * Uses a RefundVault as the crowdsale's vault.
 */
contract AutoRefundableCrowdsale is FinalizableCrowdsale {
    using SafeMath for uint256;

    // refund vault used to hold funds while crowdsale is running
    AutoRefundVault public vault;

    /**
    * @dev Constructor, creates AutoRefundVault. 
    */
    function AutoRefundableCrowdsale() public {
        vault = new AutoRefundVault(wallet);
    }

    /**
    * @dev vault finalization task, called when owner calls finalize()
    */
    function finalization() internal {
        vault.close();
        super.finalization();
    }

    /**
    * @dev Overrides Crowdsale fund forwarding, sending funds to vault.
    */
    function _forwardFunds() internal {
        vault.deposit.value(msg.value)(msg.sender);
    }
}
