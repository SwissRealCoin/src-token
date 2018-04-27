
# Readme
## Caveats
Currently tests are not repeatable executable in the `truffle develop`, but work well with `truffle test`

# Architecture 'Vote By Token Shares'

## Purpose and Functional Requirements

The purpose of this contracts is to allow to vote with tokens on proposals and assign budgets to it.
> We are basing our work heavily on the OpenZeppelin Solidity library. On top of a vanilla Crowdsale we need the ability to keep Ether in Escrow and perform a proposal-vote-payout mechanism. e.g.:
- Crowdsale makes 10k ETH until endTime
- After endTime owner makes a proposal to payOut themselves 1k ETH (they also pass a URL and a hash along with the proposal for explanatory purposes)
- All token hodlers have 2 weeks to vote yes or no on the proposal
- By the end of the 2 week period the result is assessed, if a simple majority votes in favor the amount will be paid out to the beneficiary account specified in the proposal
- If the vote turns out as "no" then there is a 20 day lock up period in which the owner can not make new proposals to prevent spamming by owner.

## Quality Attributes
Smart contracts have intrinsically:
1. **highest security requirements**
2. **high requirements on gas operating costs**. In fact the fluctuating gas prices impose themselfs a risk of service operation.
Derived from the functional requirements no specific Quality Attributes arise.
## Design Principles
1. **Open Closed Principle**: Open for extension, closed for modification. Because security audits are costly and time-consuming, because modification of existing code is more risky than plugging in different modules on well defined interfaces, we endorse this paradigm
2. **Build on Standards**: Reuse existing proven frameworks and libraries when possible (mostly Zeppelin)
## Structure

<figure>
  <img src="https://docs.google.com/drawings/d/e/2PACX-1vSShpqEuN_4H4prc6OWfMu7_Y3x8QOhJQDU7Z4PV4drNCDcTZaTm3wiCpBg9i8fhdMphvFTEmH9xEf9/pub?w=960&h=720" alt="my alt text"/>
  <figcaption> </figcaption>
</figure>

*LoggedTokenCrowdsale*  extend Zeppelins Crowdsale and overrides [createTokenContract()](https://github.com/OpenZeppelin/zeppelin-solidity/blob/master/contracts/crowdsale/Crowdsale.sol#L58") so that we can use our *LoggedToken*. LoggedToken extends *MintableToken* with a feature copied by MiniMeToken: [balanceOfAt(address _owner, uint _blockNumber)](https://github.com/Giveth/minime/blob/master/contracts/MiniMeToken.sol#L282).

This feature is used to snapshot the balance of tokens at proposal creation time. Only those addresses who hold tokens at the given blockheight can then vote on the proposal. *VotingStrategy* encapsulates the algorithm to decide the outcome of a *Proposal* ballot. This would make it easy to change the logic for the next foreseable step: requiring a minimal voting threshold (i.e. a *Quorum*)

## Behavior

### 1. Initialization of the contract system

![Initialization of System UML Sequence Diagramm](https://docs.google.com/drawings/d/e/2PACX-1vTVoR-51Pz5SVK6chiPQP3lvSIKEGCb9e8l97oqaH0QtUgz6TXjx5Ttu7nxylcXiXtgPDCcM39Zjnby/pub?w=960&h=720)

First the *BudgetWallet* contracts must be created and injected in the constructor of the *LoggedTokenCrowdsale*. Only the address of the Wallet is required as the Crowdsale must only send funds to that address without caring if its a contract or an Externally Owned Address (EOA).During construction time, the *LoggedTokenCrowdsale* creates an instance of *LoggedToken*. This in inherited functionality enforced by Zeppelin's *Crowdsale* contract.
Now the constructor of the voting system *BudgetProposalVoting* is called with both the token and the wallet as parameter.
Finally the ownership of the *BudgetWallet* is handed over to the voting system, so that only this contract can withdraw funds.

### 2. Proposal creation

![ ](https://docs.google.com/drawings/d/e/2PACX-1vTcQmGO-_5KbjiUw0vWIdR0vj420rpF4SS3ZteP6tKvoZ0T0UbrzC_7dfKpcoF17LGkG9V3h5i27Q1p/pub?w=604&h=709  "Proposal Creation UML Sequence Diagram")

In order to hinder the voting system to issue proposals before the crowdsale endet, it has always to check `hasEnded()` of the LoggedTokenCrowdsale or better [mintFinished](https://github.com/OpenZeppelin/zeppelin-solidity/blob/master/contracts/token/MintableToken.sol#L20) of the MintableToken not introducing a dependency to the Crowdsale contract.
For now the preconditions for creating a proposals are:
1. crowdsale ended
2. owner is proposing
3. no other proposal is currently voted for or it's budget not redeemed
This allows us to use a simple struct of one active proposals, while logging all proposals as *EVM Events* instead of storing a history of proposals.
4. owner has collected funds of the last proposal if it was successful.
It is important that new proposals remember the blockheight of their creation so that we can retrieve the balance of tokens at creation time borrowing from MiniMeToken's `balanceOfAt()`logic.

### 3. Voting for a proposal

Voting starts after the owner successfully created a new Proposal.
Voting rule is:
 1. Each tokenholder at proposal time blockheight can vote with the weight of his token.
 2. as long as the voting period is not over
 3. he can do this only once per proposal

![Proposal Struct UML Class Diagram](https://docs.google.com/drawings/d/e/2PACX-1vSCa5LAdKXLdO84SY8epOJXmy_p5Ac3Ouv1XSH_FzAZ_P7SfyfqL1ZJcC8OlG_2zeRc7gFa4O6PnnQx/pub?w=656&h=158)

### 4. Redemption of the budget
Following conditions must hold
1. only Owner can redeem
2. voting period must be over to redeem
3. voting must have been successful, `countYesVotes > countNoVotes`, to redeem
4. If not redeemed, owner can't issue a new proposal
## Security Issues
Not comprehensive assesment of security issues
### Economic attacks
1. Front running - a informed attacker can buy many tokens before a specific proposal will be made. He then can use this weight to nudge the outcome towards his advantage.

## Further Improvements
Some suggestions what to do next:
1. Develop a EIP standard for token voting
2. Allow for multiple proposals in parallel
3. Allow for different amounts of budget per proposal

# Development
## Requirements
The server side scripts requires NodeJS 8 to work properly.
Go to [NVM](https://github.com/creationix/nvm) and follow the installation description.
By running `source ./tools/initShell.sh`, the correct NodeJs version will be activated for the current shell.

NVM supports both Linux and OS X, but that’s not to say that Windows users have to miss out. There is a second project named [nvm-windows](https://github.com/coreybutler/nvm-windows) which offers Windows users the possibility of easily managing Node environments.

__nvmrc support for windows users is not given, please make sure you are using the right Node version (as defined in .nvmrc) for this project!__

Yarn is required to be installed globally to minimize the risk of dependency issues.
Go to [Yarn](https://yarnpkg.com/en/docs/install) and choose the right installer for your system.

For the Rinkeby and MainNet deployment, you need Geth on your machine.
Follow the [installation instructions](https://github.com/ethereum/go-ethereum/wiki/Building-Ethereum) for your OS.

Depending on your system the following components might be already available or have to be provided manually:
* [Python](https://www.python.org/downloads/windows/) 2.7 Version only! Windows users should put python into the PATH by cheking the mark in installation process. The windows build tools contain python, so you don't have to install this manually.
* GIT, should already installed on *nix systems. Windows users have to install [GIT](http://git-scm.com/download/win) manually.
* On Windows systems, PowerShell is mandatory
* On Windows systems, windows build tools are required (already installed via package.json)
* make (on Ubuntu this is part of the commonly installed `sudo apt-get install build-essential`)
* On OSX the build tools included in XCode are required

## General
Before running the provided scripts, you have to initialize your current terminal via `source ./tools/initShell.sh` for every terminal in use. This will add the current directory to the system PATH variables and must be repeated for time you start a new terminal window from project base directory. Windows users with installed PoserShell should use the script `. .\tools\initShell.ps1` instead.
```
# *nix
cd <project base directory>
source ./tools/initShell.sh

# Win
cd <project base directory>
. .\tools\initShell.ps1
```

__Every command must be executed from within the projects base directory!__

## Setup
Open your terminal and change into your project base directory. From here, install all needed dependencies.
```
yarn install
```
This will install all required dependecies in the directory _node_modules_.

## Develop
For development, use the convenience run script `yarn dev`, to open a new truffle develop console.

## Compile, migrate, test and coverage
To compile, deploy and test the smart contracts, go into the projects root directory and use the task runner accordingly.
```
# Compile contract
yarn compile

# Migrate contract
yarn migrate

# Test the contract
yarn test

# Run coverage tests
yarn coverage
```

## Public net deployment steps
- Run `yarn test` to ensure all tests are running successfully
- Check config files
    - ./contracts/deployment/contracts/*.js (from, otherAddresses, ...)
    - ./contracts/config/networks.json (gas, gasPrice)
- Start local geth node and unlock fromAccount
- Ensure fromAccount have enought ETH
- Start deployment (`yarn deploy-rinkeby / yarn deploy-mainnet`)
- Verify Contract code on etherscan

## Rinkeby testnet deployment
Start local Rinkeby test node in a separate terminal window and wait for the sync is finished.
```
yarn geth-rinkeby
```

Now you can connect to your local Rinkeby Geth console.
```
geth attach ipc://<PATH>/<TO>/Library/Ethereum/rinkeby/geth.ipc

# e.g.
# geth attach ipc://Users/patrice/Library/Ethereum/rinkeby/geth.ipc
```

Upon setup the node does not contain any private keys and associated accounts. Create an account in the web3 Geth console.
```
web3.personal.newAccount()
```
Press [Enter] twice to skip the password (or set one but then later it has to be provided for unlocking the account).

Read the address and send some Rinkeby Ether to pay for deployment and management transaction fees.
```
web3.eth.accounts
```
You can [obtain Rinkeby testnet Ether](https://www.rinkeby.io/#faucet) from the faucet by pasting your address in social media and pasting the link.

Connect to your rinkeby Geth console and unlock the account for deployment (2700 seconds = 45 minutes).
```
> personal.unlockAccount(web3.eth.accounts[0], "", 2700)
```

Ensure, all config files below `./config/` folder is setup properly. The `from` address will be used for the deployment, usually accounts[0].

After exiting the console by `<STRG> + <D>`, simply run `yarn migrate-rinkeby`.
This may take several minutes to finish.

You can monitor the deployment live via [Rinkeby](https://rinkeby.etherscan.io/address/<YOUR_RINKEBY_ADDRESS>)

After all, your smart contract can be found on etherscan:
https://rinkeby.etherscan.io/address/<REAL_CONTRACT_ADDRESS_HERE>

## MainNet deployment
__This is the production deployment, so please doublecheck all properties in the config files below `config` folder!__

For the MainNet deployment, you need a Geth installation on your machine.
Follow the [installation instructions](https://github.com/ethereum/go-ethereum/wiki/Building-Ethereum) for your OS.

Start local MainNet Ethereum node in a separate terminal window and wait for the sync is finished.
```
geth --syncmode "fast" --rpc
```

Now you can connect to your local MainNet Geth console.
```
geth attach ipc://<PATH>/<TO>/Library/Ethereum/geth.ipc

# e.g.
# geth attach ipc://Users/patrice/Library/Ethereum/geth.ipc
```

While syncing the blockchain, you can monitor the progress by typing `web3.eth.syncing`.
This shows you the highest available block and the current block you are on. If syncing is done, false will be returned. In this case, you can `web3.eth.blockNumber` and compare with the latest BlockNumber on Etherscan.

Upon setup the node does not contain any private keys and associated accounts. Create an account in the web3 Geth console.
```
web3.personal.newAccount("<YOUR_SECURE_PASSWORD>")
```
Enter <YOUR_SECURE_PASSWORD> and Press [Enter] to finish the account creation.

Read the address and send some real Ether to pay for deployment and management transaction fees.
```
web3.eth.accounts
```

Connect to your MainNet Geth console and unlock the account for deployment (240 seconds = 4 minutes).
```
personal.unlockAccount(web3.eth.accounts[0], "<YOUR_SECURE_PASSWORD>", 240)
```

Ensure, all config files below `./config/` folder is setup properly. The `from` address will be used for the deployment, usually accounts[0].

After exiting the console by `<STRG> + <D>`, simply run `yarn migrate-mainnet`.
This may take several minutes to finish.

You can monitor the deployment live via [Etherscan](https://etherscan.io/address/<YOUR_RINKEBY_ADDRESS>)

After all, your smart contract can be found on etherscan:
https://etherscan.io/address/<REAL_CONTRACT_ADDRESS_HERE>

### Contract Verification
The final step for the Rinkeby / MainNet deployment is the contract verificationSmart contract verification.

This can be dome on [Etherscan](https://etherscan.io/address/<REAL_ADDRESS_HERE>) or [Rinkeby Etherscan](https://rinkeby.etherscan.io/address/<REAL_ADDRESS_HERE>).
- Click on the `Contract Creation` link in the `to` column
- Click on the `Contract Code` link

Fill in the following data.
```
Contract Address:       <CONTRACT_ADDRESS>
Contract Name:          <CONTRACT_NAME>
Compiler:               v0.4.19+commit.c4cbbb05
Optimization:           YES
Solidity Contract Code: <Copy & Paste from ./build/bundle/IcoCrowdsale_all.sol>
Constructor Arguments:  <ABI from deployment output>
```
Visit [Solc version number](https://github.com/ethereum/solc-bin/tree/gh-pages/bin) page for determining the correct version number for your project.

- Confirm you are not a robot
- Hit `verify and publish` button

Now your smart contract is verified.
