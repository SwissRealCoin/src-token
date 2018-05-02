/**
 * @title LiquidatorInterface
 * @version 1.0
 * @author Validity Labs AG <info@validitylabs.org>
 */
pragma solidity ^0.4.21;

interface LiquidatorInterface {
    function triggerLiquidation() external;
    function claimFunds() external;
    function claimUnclaimFunds() external;
    function claimRemainder(address _beneficiary) external;
}
