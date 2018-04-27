pragma solidity ^0.4.19;

import "zeppelin-solidity/contracts/math/SafeMath.sol";
import "zeppelin-solidity/contracts/ownership/Ownable.sol";
import "../liquidation/LiquidationWallet.sol";
import "../token/MiniMeTokenInterface.sol";
import "../liquidation/LiquidatorInterface.sol";

contract LiquidationVoting is Ownable {
    using SafeMath for uint256;

    /*** Constants  ***/
    uint256 public constant VOTING_PERIOD = 23 days;
    uint256 public constant DAY_IN_SECONDS = 86400;
    uint256 public constant YEAR_IN_SECONDS = 31536000;
    uint256 public constant LEAP_YEAR_IN_SECONDS = 31622400;
    uint16 public constant ORIGIN_YEAR = 1970;

    /*** VARIABLES ***/
    MiniMeTokenInterface public token;
    LiquidatorInterface public liquidator;

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

    enum Stages { LockOutPeriod, PendingNextVotingPeriod, AcceptingVotes, VotePassed }
    Stages public currentStage;

    /*** EVENTS ***/
    event ProposalVoted(address voter, uint256 votes, bool isYes);
    event ProposalCreated(uint256 quorumRate, uint256 blocktime);
    event LiquidationResult(bool result);
    event LiqudationTriggered();

    /*** MODIFIERS ***/
    modifier onlyNotary(){
        require(notary == msg.sender);
        _;
    }

    modifier atStage(Stages _stage) {
        require(currentStage == _stage);
        _;
    }

    modifier onlyEnabled() {
        require(votingEnabled == true);
        _;
    }

    modifier onlyBeforeVotingPeriod(uint256 _blocktime) {
        require(now >=  _blocktime.sub(90 days) && now < _blocktime.sub(1 days));
        _;
    }

    modifier onlyVotingPeriod(uint256 _blocktime) {
        require(now >= _blocktime && now < _blocktime.add(VOTING_PERIOD));
        _;
    }

    modifier onlyAfterVotingPeriod(uint256 _blocktime) {
        require(now >= _blocktime.add(VOTING_PERIOD));
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

        startTimeStamps[0] = 1543622400;
        startTimeStamps[1] = 1575158400;
        startTimeStamps[2] = 1606780800;
        startTimeStamps[3] = 1638316800;
        startTimeStamps[4] = 1669852800;
    }

    /** 
    * @dev sets the address of the liquidator contract to be later triggered if a success quorum is reached
    * @param _liquidator LiquidatorInterface
    */
    function setLiquidator(LiquidatorInterface _liquidator) external onlyOwner {
        liquidator = _liquidator;
    }

    /** 
    * @dev allows the notary to enable this contract to open up the voting process once 95% of the funds are invested 
    */
    function enableVoting() public onlyNotary {
        require(!votingEnabled);
        votingEnabled = true;
        currentStage = Stages.PendingNextVotingPeriod;
    }

    /** 
    * @dev allows the notary to change the quorum rate within 90 days of the next voting period
    * @param _quorumRate uint256 the rate that must be achieved for the quorum to be valid
    */
    function changeQuorumRate(uint256 _quorumRate) public onlyNotary onlyBeforeVotingPeriod(currentProposal().blocktime) {
        require(_quorumRate > 0 && _quorumRate <= 1000);

        // triggers proposal creation
        if (checkProposal()) {
            createProposal();
        }

        currentProposal().quorumRate = _quorumRate;
    }

    /** 
    * @dev vote 
    * @param _isYes bool
    */
    function vote(bool _isYes) public atStage(Stages.AcceptingVotes) onlyVotingPeriod(currentProposal().blocktime) {
        
        // first voter triggers proposal creation
        if (checkProposal()) {
            createProposal();
        }

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
        ProposalVoted(msg.sender, votes, _isYes);
    }

    /** TODO: look over guard stage - solidity documentation 
    * @dev calcProposalResult - allows anyone to call it to calculate the last proposal's results 
    */
    function calcProposalResult() public atStage(Stages.AcceptingVotes) onlyAfterVotingPeriod(currentProposal().blocktime) returns (bool result) {
        Proposal memory proposal = currentProposal();

        uint256 numerator = proposal.countYesVotes.mul(1000);        // x 1000 to move the decimal point over
        uint256 denominator = proposal.countYesVotes.add(proposal.countNoVotes);
        uint256 qResult = numerator.div(denominator);

        if (qResult >= proposal.quorumRate && isYes(proposal.countYesVotes, proposal.countNoVotes)) {
            currentStage = Stages.VotePassed;
            quorumPasses();
            result = true;
        } else {
            currentStage = Stages.PendingNextVotingPeriod;
            result = false;
        }

        LiquidationResult(result);
    }

    /*** INTERNAL/PRIVATE ***/
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
    function createProposal() internal atStage(Stages.PendingNextVotingPeriod) {
        //TODO: require(crowdsale.finalized); //Checklist: this makes sure new tokens cannot be generated during the voting period

        proposals.push(Proposal(600, block.timestamp.sub(1 days), 0, 0));
        currentStage = Stages.AcceptingVotes;
        ProposalCreated(600, block.timestamp);
    }

    /** 
    * @dev checks to see if the latest proposal is from the current year
    */
    function checkProposal() internal view returns (bool) {
        Proposal memory proposal = currentProposal();

        uint256 proposalYear = getYear(proposal.blocktime);
        uint256 currentYear = getYear(now);

        if (proposalYear == currentYear) {
            return true;
        } else {
            return false;
        }
    }

    /** 
    * @dev triggers liquidation contract
    */
    function quorumPasses() internal atStage(Stages.VotePassed) {
        liquidator.triggerLiquidation();
        LiqudationTriggered();
    }

    /**
    * @dev credit to: Piper Merriam Git: https://github.com/pipermerriam/ethereum-datetime/
    * @param timestamp uint timestamp to derive the year from
    */
    function getYear(uint256 timestamp) internal pure returns (uint16) {
        uint256 secondsAccountedFor = 0;
        uint16 year;
        uint256 numLeapYears;

        // Year
        year = uint16(ORIGIN_YEAR + timestamp / YEAR_IN_SECONDS);
        numLeapYears = leapYearsBefore(year) - leapYearsBefore(ORIGIN_YEAR);

        secondsAccountedFor += LEAP_YEAR_IN_SECONDS * numLeapYears;
        secondsAccountedFor += YEAR_IN_SECONDS * (year - ORIGIN_YEAR - numLeapYears);

        while (secondsAccountedFor > timestamp) {
            if (isLeapYear(uint16(year - 1))) {
                secondsAccountedFor -= LEAP_YEAR_IN_SECONDS;
            } else {
                secondsAccountedFor -= YEAR_IN_SECONDS;
            }
            year -= 1;
        }
        return year;
    }

    function isLeapYear(uint16 year) internal pure returns (bool) {
        if (year % 4 != 0) {
            return false;
        }
        if (year % 100 != 0) {
            return true;
        }
        if (year % 400 != 0) {
            return false;
        }
        return true;
    }

    function leapYearsBefore(uint256 year) internal pure returns (uint256) {
        year -= 1;
        return year / 4 - year / 100 + year / 400;
    }
}
