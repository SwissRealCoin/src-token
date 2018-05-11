/**
 * @title SrcCrowdsaleInterface
 * @version 1.0
 * @author Validity Labs AG <info@validitylabs.org>
 */
pragma solidity ^0.4.21;

interface SrcCrowdsaleInterface { 
    /**
    * @dev function for voting contract to call if quorum passes to disable crowdsale from future sales
    */
    function disableCrowdsale() external;
}
