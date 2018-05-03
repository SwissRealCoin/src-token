pragma solidity ^0.4.21;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "../liquidation/LiquidationWallet.sol";
import "../tokens/MiniMeTokenInterface.sol";
import "../liquidation/LiquidatorInterface.sol";

contract LiquidationVoting is Ownable {
    using SafeMath for uint256;

    /*** Constants  ***/
    uint256 public constant VOTING_PERIOD = 23 days;

    /*** VARIABLES ***/
    MiniMeTokenInterface public token;
    LiquidatorInterface public liquidator;

    bool public didCalc;    // used to track if the calculate of the quorumrate as already been achieve for the current voting round
    bool public votingEnabled;
    address public notary;

    // TODO: hardcode next 100 years of start times
    uint256[100] public startTimeStamps;
    uint256 public currentTimeStamp;

    struct Proposal {
        uint256  quorumRate;    // the minimum percentage that must participate defaults to 60?
        uint256  blocktime;     // the blocktime (aka snapshot) of the voter's weight in vote and start of voting?
        uint256  countNoVotes;
        uint256  countYesVotes;
        mapping(address => bool)  hasVoted;
    }
    Proposal[] public proposals;
    uint256 public votingRound;

    // 0 = LockOutPeriod, 1 = PendingVoting, 2 = AcceptingVotes, 3 = PendingResult, 4 = VotePassed
    enum Stages { LockOutPeriod, PendingVoting, AcceptingVotes, PendingResult, VotePassed }
    Stages public currentStage;

    /*** EVENTS ***/
    event ProposalVoted(address voter, uint256 votes, bool isYes);
    event ProposalCreated(uint256 quorumRate, uint256 blocktime);
    event LiquidationResult(bool didPass, uint256 qResult);
    event LiqudationTriggered();

    /*** MODIFIERS ***/
    modifier onlyNotary(){
        require(notary == msg.sender);
        _;
    }

    // This modifier progresses to the proper stage that's time dependant
    modifier timedTransition()
    {   
        require(currentStage != Stages.VotePassed);

        uint256 _blocktime = currentProposal().blocktime;

        if (now >= _blocktime && now < _blocktime.add(VOTING_PERIOD)) {
            currentStage = Stages.AcceptingVotes;
            didCalc = false;
        } else if (now >= _blocktime.add(VOTING_PERIOD)) {
            currentStage = Stages.PendingResult;
        }
        _;
    }

    modifier atStage(Stages _stage) {
        require(currentStage == _stage);
        _;
    }

    // This modifier goes to the next stage after the function has completed successfully.
    modifier transitionNext()
    {
        _;
        nextStage();
    }

    modifier onlyDisabled() {
        require(!votingEnabled);
        _;
    }

    modifier onlyBeforeVotingPeriod(uint256 _blocktime) {
        require(now >=  _blocktime.sub(90 days) && now < _blocktime.sub(1 days));
        _;
    }

    /** 
    * @dev LiquidationVoting 
    * @param _notary address
    * @param _token MiniMeTokenInterface
    */
    function LiquidationVoting(address _notary, MiniMeTokenInterface _token) public onlyOwner {
        require(address(_token) != address(0x0));
        require(address(_notary) != address(0x0));
        
        notary = _notary;
        token = _token;
        votingEnabled = false;
        currentStage = Stages.LockOutPeriod;

        startTimeStamps[0] = 1669852800;
        startTimeStamps[1] = 1701388800;
        startTimeStamps[2] = 1733011200;
    }

    /**
    * @dev ping an update on the contract
     */
    function ping() external timedTransition {}

    /** 
    * @dev sets the address of the liquidator contract to be later triggered if a success quorum is reached
    * @param _liquidator LiquidatorInterface
    */
    function setLiquidator(LiquidatorInterface _liquidator) external onlyOwner onlyDisabled {
        liquidator = _liquidator;
    }

    /** 
    * @dev allows the notary to enable this contract to open up the proposal/voting process once 95% of the funds are invested 
    */
    function enableVoting() public onlyNotary transitionNext onlyDisabled {
        votingEnabled = true;
        createProposal();
    }

    /** 
    * @dev allows the notary to change the quorum rate within 90 days of the next voting period
    * @param _quorumRate uint256 the rate that must be achieved for the quorum to be valid
    */
    function changeQuorumRate(uint256 _quorumRate) public onlyNotary onlyBeforeVotingPeriod(currentProposal().blocktime) {
        require(_quorumRate > 0 && _quorumRate <= 1000);

        proposals[proposals.length - 1].quorumRate = _quorumRate;
    }

    /** 
    * @dev vote 
    * @param _isYes bool
    */
    function vote(bool _isYes) public timedTransition atStage(Stages.AcceptingVotes) {
        uint256 votes = token.balanceOfAt(msg.sender, currentProposal().blocktime);
        require(votes > 0);
        Proposal storage proposal = proposals[proposals.length - 1];
        require(!proposal.hasVoted[msg.sender]);

        proposal.hasVoted[msg.sender] == true;
        if (_isYes){
            proposal.countYesVotes = proposal.countYesVotes + votes;
        } else {
            proposal.countNoVotes = proposal.countNoVotes + votes;
        }
        emit ProposalVoted(msg.sender, votes, _isYes);
    }

    /**
    * @dev calcProposalResult - allows anyone to call it to calculate the last proposal's results 
    */
    function calcProposalResult() public timedTransition atStage(Stages.PendingResult) returns (bool didPass) {
        require(!didCalc);
        
        didCalc = true;
        Proposal memory proposal = currentProposal();

        uint256 numerator = proposal.countYesVotes.mul(1000);        // x 1000 to move the decimal point over
        uint256 denominator = proposal.countYesVotes.add(proposal.countNoVotes);
        uint256 qResult = numerator.div(denominator);

        if (qResult >= proposal.quorumRate && isYes(proposal.countYesVotes, proposal.countNoVotes)) {
            didPass = true;
            votingRound++;
            currentStage = Stages.VotePassed;
            quorumPasses();
        } else {
            didPass = false;
            createProposal();   // create proposal for next year
            currentStage = Stages.PendingVoting;
        }

        emit LiquidationResult(didPass, qResult);
    }

    /** 
    * @dev return the current proposal's quorum rate
    */
    function currentRate() external view returns (uint256) {
        Proposal memory proposal = currentProposal();
        return proposal.quorumRate;
    }

    /*** INTERNAL/PRIVATE ***/
    /** 
    * @dev progresses to the next stage
    */
    function nextStage() internal {
        currentStage = Stages(uint256(currentStage) + 1);
    }

    /** 
    * @dev isYes
    * @param countYes uint256
    * @param countNo uint256
    */
    function isYes(uint256 countYes, uint256 countNo) internal pure returns (bool) {
        return countYes > countNo;
    }

    /** 
    * @dev returns the current proposal
    */
    function currentProposal() internal view returns (Proposal) {
        return proposals[proposals.length - 1];
    }

     /** 
    * @dev createProposal
    */
    function createProposal() internal {
        uint256 time = startTimeStamps[currentTimeStamp];
        currentTimeStamp++;
        proposals.push(Proposal(600, time, 0, 0));  // default is 600 or 60.0%
        emit ProposalCreated(600, time);
    }

    /** 
    * @dev triggers liquidation contract
    */
    function quorumPasses() internal atStage(Stages.VotePassed) {
        liquidator.triggerLiquidation();
        emit LiqudationTriggered();
    }
}
