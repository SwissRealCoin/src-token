/**
 * @title SwissRealCoin Liquidator
 *
 *
 * @version 1.0
 * @author Validity Labs AG <info@validitylabs.org>
 */
pragma solidity ^0.4.21;

import 'openzeppelin-solidity/contracts/ownership/Ownable.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';
import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';
import '../tokens/SrvToken.sol';
import './LiquidationWallet.sol';
import './LiquidatorInterface.sol';

contract Liquidator is Ownable, LiquidatorInterface {
    using SafeMath for uint256;

    LiquidationWallet public liquidationWallet;

    // SwissRealCoin
    ERC20 public srcToken;
    // SwissRealVoucher
    ERC20 public srvToken;

    // the voting contract address - used to automate the triggering of liquidation
    address public swissVotingContract;

    // rate for the ERC20 Token to be paid out. rate.mul(SRV_TOKEN_AMOUNT)
    uint256 public rate;
    uint256 public unclaimedRate;

    // boolean to enable Liquidator
    bool public enabled;
    // boolean to mark contract dead
    bool public ended;
    // duration for the investors to claim their SRV in exchange for SRC
    uint256 public claimFundsDuration = 1 years;
    // duration for the SRV holders to claim ERC20 tokens in exchange for SRV
    uint256 public claimUnclaimedDuration = 1 years;
    // the start time in unix for the liquidation to start when triggered
    uint256 public startClaimTime;
    // the start time for the CLAIM_FUNDS state
    uint256 public startClaimUnclaimedTime;
    // the start time for the CLAIM_REMAINDER state
    uint256 public startClaimRemainderTime;
    
    // allow managers to whitelist and confirm contributions by manager accounts
    // managers can be set and altered by owner, multiple manager accounts are possible
    mapping(address => bool) public isManager;

    enum LiquidatorStates { NOT_ACTIVE, ACTIVE, CLAIM_FUNDS, CLAIM_UNCLAIMEDFUNDS, CLAIM_REMAINDER }

    /*** EVENTS  ***/
    event ChangedManager(address manager, bool active);
    event LiquidationTriggered(uint256 timestamp);

    /*** MODIFIERS ***/
    modifier onlyManager() {
        require(isManager[msg.sender]);
        _;
    }

    modifier onlyVotingOrManager() {
        require(isManager[msg.sender] || msg.sender == swissVotingContract);
        _;
    }

    modifier onlyValidAddress(address _address) {
        require(_address != address(0));
        _;
    }

    modifier onlyEnabled() {
        require(enabled);
        _;
    }

    modifier onlyClaimFunds() {
        require(now >= startClaimTime && now < startClaimUnclaimedTime);
        _;
    }

    modifier onlyUnclaimedFunds() {
        require(now >= startClaimUnclaimedTime && now < startClaimRemainderTime);
        _;
    }

    modifier onlyClaimRemainder() {
        require(now >= startClaimRemainderTime);
        _;
    }

    /**
    * @dev constructor
    */
    function Liquidator (ERC20 _srcTokenAddress, address _swissVotingContract, ERC20 _payoutToken) public {
        require(_srcTokenAddress != address(0));
        require(_swissVotingContract != address(0));
        require(_payoutToken != address(0));

        setManager(msg.sender, true);
        swissVotingContract = _swissVotingContract;
        liquidationWallet = createLiquidationWallet(_payoutToken);
        srcToken = _srcTokenAddress;
        srvToken = createTokenContract();
    }

    /**
    * @dev fallback: reject any ether sent in
    */
    function () external payable {
        revert();
    }

    /**
    * @dev retrieve current state in integer form 0 = NOT_ACTIVE, 1= ACTIVE, 2 = CLAIM_FUNDS, 3 = CLAIM_UNCLAIMED, 4 = CLAIM_REMAINDER
    */
    function currentState() external view returns (LiquidatorStates) {
        if (enabled) {
            if (now >= startClaimTime && now < startClaimUnclaimedTime) {
                return LiquidatorStates.CLAIM_FUNDS;
            } else if (now >= startClaimUnclaimedTime && now < startClaimRemainderTime) {
                return LiquidatorStates.CLAIM_UNCLAIMEDFUNDS;
            } else if (now >= startClaimRemainderTime) {
                return LiquidatorStates.CLAIM_REMAINDER;
            }
            return LiquidatorStates.ACTIVE;
        } else {
            return LiquidatorStates.NOT_ACTIVE;
        } 
    }

    /**
    * @dev start the Liquidation process - called by the notary or from the sucessful passing quroum vote smart contract
    */
    function triggerLiquidation() external onlyVotingOrManager {
        require(!enabled);
        enabled = true;
        emit LiquidationTriggered(now);
    }

    /**
    * @dev start the Liquidation process - called by the notary
    * @param _startTime uint256 the start time to kick off the 1st stage of the process
    */
    function setStartTime(uint256 _startTime) external onlyManager onlyEnabled {
        startClaimTime = _startTime;
        startClaimUnclaimedTime = startClaimTime.add(claimFundsDuration);
        startClaimRemainderTime = startClaimUnclaimedTime.add(claimUnclaimedDuration);
    }

    /**
    * @dev rate to be set by the management team to be .mul() by the tokenAmount for total ERC20 payout
    * @param _rate uint256
    */
    function setRate(uint256 _rate) public onlyManager onlyEnabled {
        require(_rate > 0);
        rate = _rate;
    }

    /**
    * @dev unclaimedRate to be set by the management team to be .mul() by the tokenAmount for total ERC20 payout
    * @param _unclaimedRate uint256
    */
    function setUnclaimedRate(uint256 _unclaimedRate) public onlyManager onlyEnabled {
        require(_unclaimedRate > 0);
        unclaimedRate = _unclaimedRate;
    }

    /**
    * @dev allows onlyOwner to set new ERC20 token for payouts
    * @param _token ERC20
    */
    function setNewErc20Token(ERC20 _token) public onlyOwner onlyEnabled {
        liquidationWallet.setNewErc20Token(_token);
    }

    /**
     * @dev Set / alter manager This can be done from owner only
     * @param _manager address address of the manager to create/alter
     * @param _active bool flag that shows if the manager account is active
     */
    function setManager(address _manager, bool _active) public onlyOwner onlyValidAddress(_manager) {
        isManager[_manager] = _active;
        emit ChangedManager(_manager, _active);
    }

    /**
    * @dev allows SwissRealCoin token holders to exchange their tokens for SwissRealVouchers burning SwissRealCoin and claiming initial funds from the liquidation wallet
    */ 
    function claimFunds() external onlyClaimFunds onlyEnabled {
        uint256 tokenAmount = srcToken.allowance(msg.sender, this);

        require(tokenAmount > 0);
        // burn SRC token
        require(srcToken.transferFrom(msg.sender, address(0), tokenAmount));
        // mint Voucher token
        MintableToken(srvToken).mint(msg.sender, tokenAmount);
        // send ERC20 funds
        liquidationWallet.authorizePayment(msg.sender, calcPayment(tokenAmount));     
    }

    /**
    * @dev allows SwissRealVoucher token holders to exchange their claim voucher for unclaimed ERC20 tokens burning SwissRealVoucher
    */
    function claimUnclaimFunds() external onlyUnclaimedFunds onlyEnabled {
        require(srvToken.allowance(msg.sender, this) > 0);

        uint256 tokenAmount = srvToken.allowance(msg.sender, this);
        require(srvToken.transferFrom(msg.sender, this, tokenAmount));
        BurnableToken(srvToken).burn(tokenAmount);
        // send ERC20 funds
        liquidationWallet.authorizePayment(msg.sender, calcRemainingPayment(tokenAmount));
    }

    /**
    * @dev remainding funds sent to beneficiary
    * @param _beneficiary address to receive the remainder funds from liquidator wallet
    */
    function claimRemainder(address _beneficiary) external onlyManager onlyClaimRemainder onlyEnabled onlyValidAddress(_beneficiary) {
        ended = true;
        liquidationWallet.depositRemaindingFunds(_beneficiary);
    }

    /**
    * @dev exchange rate from SwissRealVoucher to Ether
    * @param _tokenAmount uint256
    */
    function calcPayment(uint256 _tokenAmount) public view returns (uint256) {
        return rate.mul(_tokenAmount);
    }

    /**
    * @dev exchange rate from SwissRealVoucher to Ether
    * @param _tokenAmount uint256
    */
    function calcRemainingPayment(uint256 _tokenAmount) public view returns (uint256) {
        return unclaimedRate.mul(_tokenAmount);
    }
    
    /*** INTERNAL/PRIVATE FUNCTIONS ***/

    /**
     * @dev Create new instance of SwissRealVoucher token contract
     */
    function createTokenContract() internal returns (MintableToken) {
        return new SrvToken();
    }

    /**
     * @dev Create new instance of LiquidationWallet wallet contract for pull payments and push remaining balance
     */
    function createLiquidationWallet(ERC20 _payoutToken) internal returns (LiquidationWallet) {
        return new LiquidationWallet(_payoutToken);
    }
}
