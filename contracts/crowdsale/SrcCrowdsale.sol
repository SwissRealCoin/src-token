/**
 * @title SwissRealCoin Crowdsale
 * @version 1.0
 * @author Validity Labs AG <info@validitylabs.org>
 */
pragma solidity ^0.4.21;

import 'openzeppelin-solidity/contracts/crowdsale/validation/CappedCrowdsale.sol';
import 'openzeppelin-solidity/contracts/token/ERC20/TokenVesting.sol';
import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';
import '../tokens/MiniMeTokenInterface.sol';
import './AutoRefundableCrowdsale.sol';
import './SrcCrowdsaleInterface.sol';

contract SrcCrowdsale is SrcCrowdsaleInterface, AutoRefundableCrowdsale, CappedCrowdsale {
    /*** CONSTANTS ***/
    // First Hard Cap
    uint256 public constant INITIAL_HARD_CAP = 150e6 * 1e18;    // 150 million * 1e18 - smallest unit of SRC token
    // Frank per Token
    uint256 public constant CHF_CENT_PER_TOKEN = 100;          // standard CHF per token rate - in cents - 1 CHF => 100 CHF cents

    /*** VARIABLES ***/
    // allow managers to whitelist and confirm contributions by manager accounts
    // managers can be set and altered by owner, multiple manager accounts are possible
    mapping(address => bool) public isManager;

    uint256 public tokensToMint;    // total token supply that has yet to be generated
    uint256 public tokensMinted;    // total token supply that has been generated
    uint256 public crowdsaleRound;

    uint256 public confirmationPeriod = 30 days; // TODO: find out confirmation period requirements
    bool public confirmationPeriodOver; // allows owner/manager to manually end confirmation period

    uint256 public investmentIdLastAttemptedToSettle;

    address public votingContract;
    bool public disabled;

    // tempFix
    uint256 public lastWeiInvestorAmount;

    struct Payment {
        address investor;
        address beneficiary;
        uint256 weiAmount; // due to current OZ structure can't push value to struck w/o changing function signature - see tempFix above
        uint256 tokenAmount;
        bool confirmed;
        bool attemptedSettlement;
        bool completedSettlement;
    }

    Payment[] public investments;

    /*** EVENTS  ***/
    event ChangedManager(address manager, bool active);
    event PresalePurchase(address indexed beneficiary, uint256 tokenAmount);
    event NonEthTokenPurchase(uint256 investmentType, address indexed beneficiary, uint256 tokenAmount);
    event NewCrowdsaleRound(uint256 start, uint256 duration, uint256 rate, uint256 detaTokenCap);
    event ChangedInvestmentConfirmation(uint256 investmentId, address investor, bool confirmed);

    /*** MODIFIERS ***/
    modifier onlyManager() {
        require(isManager[msg.sender]);
        _;
    }

    modifier onlyVotingContract() {
        require(msg.sender == votingContract);
        _;
    }

    modifier onlyNotDisabled() {
        require(!disabled);
        _;
    }

    modifier onlyPresalePhase() {
        require(now < openingTime && crowdsaleRound == 0);
        _;
    }

    modifier onlyCrowdsalePhase() {
        require(now >= openingTime && now < closingTime && !isFinalized);
        _;
    }

    modifier onlyUnderCap(uint256 _amount) {
        require(tokensToMint.add(_amount) <= cap);
        _;
    }

    modifier onlyValidAddress(address _address) {
        require(_address != address(0));
        _;
    }

    modifier onlyNoneZero(address _to, uint256 _amount) {
        require(_to != address(0));
        require(_amount > 0);
        _;
    }

    modifier onlyConfirmPayment() {
        require(now > closingTime && now <= closingTime.add(confirmationPeriod));
        require(!confirmationPeriodOver);
        _;
    }

    modifier onlyConfirmationOver() {
        require(now > closingTime.add(confirmationPeriod) || confirmationPeriodOver);
        _;
    }

    /**
     * @dev constructor Deploy SwissRealCoin Token Crowdsale
     * @param _startTime uint256 Start time of the crowdsale
     * @param _endTime uint256 End time of the crowdsale
     * @param _rateChfPerEth uint256 issueing rate tokens per wei
     * @param _wallet address wallet address of the crowdsale to receive ether from the refund vault
     * @param _token ERC20 token address
     */
    function SrcCrowdsale(
        uint256 _startTime,
        uint256 _endTime,
        uint256 _rateChfPerEth,
        address _wallet,
        address _token
        )
        Crowdsale((_rateChfPerEth.mul(1e2)).div(CHF_CENT_PER_TOKEN), _wallet, ERC20(_token))
        TimedCrowdsale(_startTime, _endTime)
        CappedCrowdsale(INITIAL_HARD_CAP)
        public
        onlyValidAddress(_wallet)
    {
        setManager(msg.sender, true);
    }

    /**
    * @dev low level token purchase ***DO NOT OVERRIDE*** -Matt: Challenge accepted!
    * @param _beneficiary Address performing the token purchase
    */
    function buyTokens(address _beneficiary) public payable {
        uint256 weiAmount = msg.value;
        lastWeiInvestorAmount = weiAmount;
        _preValidatePurchase(_beneficiary, weiAmount);

        // calculate token amount to be created
        uint256 tokens = _getTokenAmount(weiAmount);

        // update state
        weiRaised = weiRaised.add(weiAmount);

        // calculate token amount, push to investments array
        _processPurchase(_beneficiary, tokens);
        // throw event
        emit TokenPurchase(msg.sender, _beneficiary, weiAmount, tokens);

        // forward wei to refund vault
        _forwardFunds();
    }

    /**
     * @dev start a new crowdsale round
     * @param _start uint256
     * @param _duration uint256
     * @param _rateChfPerEth uint256
     * @param _deltaTokenCap uint256
     */
    function newCrowdsale(uint256 _start, uint256 _duration, uint256 _rateChfPerEth, uint256 _deltaTokenCap) public onlyOwner onlyConfirmationOver onlyNotDisabled {
        require(isFinalized);
        require(_start > now);
        require(_duration > 0);
        require(_rateChfPerEth > 0);
        require(_deltaTokenCap > 0);

        openingTime = _start;
        closingTime = _start.add(_duration);
        rate = (_rateChfPerEth.mul(1e2)).div(CHF_CENT_PER_TOKEN);
        cap = cap.add(_deltaTokenCap);
        isFinalized = false;
        confirmationPeriodOver = false;
        crowdsaleRound++;
        vault.openVault();

        emit NewCrowdsaleRound(_start, _duration, _rateChfPerEth, _deltaTokenCap);
    }

    /**
    * @dev Checks whether the cap has been reached. *Overriden* - change to tokensMinted from weiRaised
    * @return Whether the cap was reached
    */
    function capReached() public view returns (bool) {
        return tokensMinted >= cap;
    }

    /**
     * @dev Set / alter manager / whitelister "account". This can be done from owner only
     * @param _manager address address of the manager to create/alter
     * @param _active bool flag that shows if the manager account is active
     */
    function setManager(address _manager, bool _active) public onlyOwner onlyValidAddress(_manager) {
        isManager[_manager] = _active;
        emit ChangedManager(_manager, _active);
    }

    /**
    * @dev set the voting contract address 
    * @param votingContractAddress address
    */
    function setVotingContract(address votingContractAddress) public onlyOwner onlyValidAddress(votingContractAddress) {
        votingContract = votingContractAddress;
    }

    /**
    * @dev onlyOwner allowed to generate tokens, respecting the cap, and only before the crowdsale starts
    * @param _beneficiary address
    * @param _tokenAmount uint256
    */
    function mintPresaleTokens(address _beneficiary, uint256 _tokenAmount) public
        onlyOwner 
        onlyPresalePhase 
        onlyNoneZero(_beneficiary, _tokenAmount) 
        onlyUnderCap(_tokenAmount) 
    {
        _deliverTokens(_beneficiary, _tokenAmount);
        emit PresalePurchase(_beneficiary, _tokenAmount);
    }

    /**
    * @dev onlyOwner allowed to handle batch presale minting
    * @param _beneficiaries address[]
    * @param _amounts uint256[]
    */
    function batchMintTokenPresale(address[] _beneficiaries, uint256[] _amounts) external {
        require(_beneficiaries.length == _amounts.length);

        for (uint256 i; i < _beneficiaries.length; i = i.add(1)) {
            mintPresaleTokens(_beneficiaries[i], _amounts[i]);
        }
    }

    /**
    * @dev onlyOwner allowed to allocate non-ETH investments during the crowdsale
    * @param _investmentType uint256
    * @param _beneficiary address
    * @param _tokenAmount uint256
    */
    function nonEthPurchase(uint256 _investmentType, address _beneficiary, uint256 _tokenAmount) public
        onlyOwner 
        onlyCrowdsalePhase
        onlyNoneZero(_beneficiary, _tokenAmount) 
        onlyUnderCap(_tokenAmount) 
    {
        lastWeiInvestorAmount = 0;
        _processPurchase(_beneficiary, _tokenAmount);
        emit NonEthTokenPurchase(_investmentType, _beneficiary, _tokenAmount);
    }

   /**
    * @dev onlyOwner allowed to handle batches of non-ETH investments
    * @param _investmentTypes uint256[] array of ids to identify investment types IE: BTC, CHF, EUR, etc...
    * @param _beneficiaries address[]
    * @param _amounts uint256[]
    */
    function batchNonEthPurchase(uint256[] _investmentTypes, address[] _beneficiaries, uint256[] _amounts) external {
        require(_beneficiaries.length == _amounts.length && _investmentTypes.length == _amounts.length);

        for (uint256 i; i < _beneficiaries.length; i = i.add(1)) {
            nonEthPurchase(_investmentTypes[i], _beneficiaries[i], _amounts[i]);
        }
    }

    /**
     * @dev confirms payment
     * @param _investmentId uint256 uint256 of the investment id to confirm
     */
    function confirmPayment(uint256 _investmentId) public onlyManager onlyConfirmPayment {
        investments[_investmentId].confirmed = true;
        emit ChangedInvestmentConfirmation(_investmentId, investments[_investmentId].investor, true);
    }

    /**
     * @dev confirms payments via a batch method
     * @param _investmentIds uint256[] array of uint256 of the investment ids to confirm
     */
    function batchConfirmPayments(uint256[] _investmentIds) external onlyManager onlyConfirmPayment {
        uint256 investmentId;

        for (uint256 c; c < _investmentIds.length; c = c.add(1)) {
            investmentId = _investmentIds[c]; // gas optimization
            confirmPayment(investmentId);
        }
    }

    /**
     * @dev unconfirms payment made via investment id
     * @param _investmentId uint256 uint256 of the investment to unconfirm
     */
    function unConfirmPayment(uint256 _investmentId) public onlyManager onlyConfirmPayment {
        investments[_investmentId].confirmed = false;
        emit ChangedInvestmentConfirmation(_investmentId, investments[_investmentId].investor, false);
    }

    /**
    * @dev manually set the confirmation period as complete early, optional
    */
    function finalizeConfirmationPeriod() public onlyOwner onlyConfirmPayment {
        confirmationPeriodOver = true;
    }

    /**
     * @dev settlement of investment made via investment id
     * @param _investmentId uint256 uint256 being the investment id
     */
    function settleInvestment(uint256 _investmentId) public onlyConfirmationOver {
        Payment storage p = investments[_investmentId];

        // investment should not be settled already (prevent double token issueing or repayment)
        require(!p.completedSettlement);

        // investments have to be processed in right order
        // unless we're at first investment, the previous has needs to have undergone an attempted settlement
        require(_investmentId == 0 || investments[_investmentId.sub(1)].attemptedSettlement);

        p.attemptedSettlement = true;

        // just so that we can see which one we attempted last time and can continue with next
        investmentIdLastAttemptedToSettle = _investmentId;

        if (p.confirmed && !capReached()) {
            // if confirmed -> issue tokens and complete settlement

            // calculate number of tokens to be issued to investor
            uint256 tokens = p.tokenAmount;

            // check to see if this purchase sets it over the crowdsale token cap. if not, deliver tokens
            if (tokensMinted.add(tokens) <= cap) {
                tokensToMint = tokensToMint.sub(tokens);
                tokensMinted = tokensMinted.add(tokens);

                // generate tokens for beneficiary
                _deliverTokens(p.beneficiary, tokens);

                p.completedSettlement = true;
            } else {
                if (vault.pushRefund(p.investor)) {
                    p.completedSettlement = true;
                }
            }
        } else {
            // if not confirmed -> reimburse ETH or if fiat (presale) investor: do nothing
            // only complete settlement if investor got their money back
            // (does not throw (as .transfer would)
            // otherwise we would block settlement process of all following investments)
            if (p.investor != address(0) && p.weiAmount > 0) {
                if (vault.pushRefund(p.investor)) {
                    p.completedSettlement = true;
                }
            }
        }
    }

    /** 
    * @dev disable crowdsale contract when voting quorum passes
    */
    function disableCrowdsale() external onlyVotingContract {
        disabled = true;
    }

    /**
     * @dev allows the batch settlement of investments made
     * @param _investmentIds uint256[] array of uint256 of investment ids
     */
    function batchSettleInvestments(uint256[] _investmentIds) external {
        for (uint256 c; c < _investmentIds.length; c = c.add(1)) {
            settleInvestment(_investmentIds[c]);
        }
    }

    /**
    * @dev onlyOwner allows tokens to be tradeable - ends 1st crowdsale round - does not finalize crowdsale in the traditional manner
    */
    function finalize() public onlyOwner onlyConfirmationOver {
        MiniMeTokenInterface(token).enableTransfers(true);
        super.finalize();
    }

    /*** INTERNAL/PRIVATE FUNCTIONS ***/

    /**
    * @dev Validation of an incoming purchase. Use require statements to revert state when conditions are not met. Use super to concatenate validations.
    * @param _beneficiary Address performing the token purchase
    * @param _weiAmount Value in wei involved in the purchase
    */
    function _preValidatePurchase(address _beneficiary, uint256 _weiAmount) internal onlyCrowdsalePhase {
        require(!capReached());
        super._preValidatePurchase(_beneficiary, _weiAmount);
    }

    /**
    * @dev Source of tokens. Override this method to modify the way in which the crowdsale ultimately gets and sends its tokens.
    * @param _beneficiary Address performing the token purchase
    * @param _tokenAmount Number of tokens to be emitted
    */
    function _deliverTokens(address _beneficiary, uint256 _tokenAmount) internal {
        MiniMeTokenInterface(token).generateTokens(_beneficiary, _tokenAmount);
    }

    /**
    * @dev Executed when a purchase has been validated and is ready to be executed. Not necessarily emits/sends tokens.
    * @param _beneficiary Address receiving the tokens
    * @param _tokenAmount Number of tokens to be purchased
    */
    function _processPurchase(address _beneficiary, uint256 _tokenAmount) internal {
        /*** Record & update state variables  ***/
        // Tracks total tokens pending to be minted - this includes presale tokens
        tokensToMint = tokensToMint.add(_tokenAmount);

        // register payment so that later on it can be confirmed (for tokens to be issued or a refund of eth)
        Payment memory newPayment = Payment(msg.sender, _beneficiary, lastWeiInvestorAmount, _tokenAmount, false, false, false);
        investments.push(newPayment);
    }

    /**
    * @dev Override to extend the way in which ether is converted to tokens.
    * @param _weiAmount Value in wei to be converted into tokens
    * @return Number of tokens that can be purchased with the specified _weiAmount
    */
    function _getTokenAmount(uint256 _weiAmount) internal view returns (uint256) {
        return _weiAmount.mul(rate);
    }
}
