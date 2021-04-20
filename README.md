<p align="center">
  <a href="https://github.com/pooltogether/pooltogether--brand-assets">
    <img src="https://github.com/pooltogether/pooltogether--brand-assets/blob/977e03604c49c63314450b5d432fe57d34747c66/logo/pooltogether-logo--purple-gradient.png?raw=true" alt="PoolTogether Brand" style="max-width:100%;" width="200">
  </a>
</p>

<br />

# PoolTogether YearnV2 Yield Source 👻

[![Coverage Status](https://coveralls.io/repos/github/jmonteer/pooltogether-yearnv2-yield-source/badge.svg?branch=first_iteration)](https://coveralls.io/github/jmonteer/pooltogether-yearnv2-yield-source?branch=first_iteration)[![built-with openzeppelin](https://img.shields.io/badge/built%20with-OpenZeppelin-3677FF)](https://docs.openzeppelin.com/)![Building](https://github.com/jmonteer/pooltogether-yearnv2-yield-source/actions/workflows/main.yml/badge.svg)


PoolTogether Yield Source that uses [Yearn](https://yearn.finance/) V2 to generate yield by depositing the deposit token in any Yearn Vault that accepts that token.

# Usage
This PoolTogether Yield Source is compatible for Yearn V2 Vaults with versions lower than 0.3.2 and higher than 0.3.4. This is due to a bug in the vaults' sandwich protection that lead to small temporary dips in share value. At the time of writing, vaults in prod that are not working with this integrations are:
- WETH yVault (0.3.2) (https://etherscan.io/address/0xa9fE4601811213c340e850ea305481afF02f5b28)
- YFI yVault (0.3.2) (https://etherscan.io/address/0xE14d13d8B3b85aF791b2AADD661cDBd5E6097Db1)
- 1INCH yVault (0.3.2) (https://etherscan.io/address/0xB8C3B7A2A618C552C23B1E4701109a9E756Bab67)
- Curve Iron Bank Pool (0.3.2) (https://etherscan.io/address/0x27b7b1ad7288079A66d12350c828D3C00A6F07d7)

Also, at the time of writing, no more Vaults with this bug are being deployed so all the future Vaults should be compatible.

## Deployment
Follow Installation instructions.

`yarn deploy <network_name>`

The deployment script can be found in `deploy/deploy.ts`.

## Development

Clone this repository and enter the directory.

### Installation

Install dependencies:

```
yarn
```

This project uses [Yarn 2](https://yarnpkg.com), dependencies should get installed pretty quickly.

### Env

We use [direnv](https://direnv.net) to manage environment variables. You'll likely need to install it.

Copy `.envrc.example` and write down the env variables needed to run this project.
```
cp .envrc.example .envrc
```

Once your env variables are setup, load them with:
```
direnv allow
```

### Test

We use the [Hardhat](https://hardhat.org) ecosystem to test and deploy our contracts.

To run unit tests:

```
yarn test
```

To run [solhint](https://protofire.github.io/solhint/) and tests:

```
yarn verify
```

To run coverage:

```
yarn coverage
```

### Mainnet fork

Before deploying, you can make sure your implementation works by deploying a Yield Source Prize Pool on a fork of Mainnet.

Start Mainnet fork in a terminal window with the command:

```
yarn start-fork
```

In another window, start the scripts to deploy and create a YearnV2 Yield Source Prize Pool, deposit USDC into it, send some profit to the Vault, award the prize and withdraw. 

```
yarn deploy-fork && yarn run-fork
```

### Contract Verification

Once deployment is done, you can verify your contracts on [Etherscan](https://etherscan.io) by typing:

```
yarn verify <NETWORK_NAME>
```

### Code quality

[Prettier](https://prettier.io) is used to format TypeScript code. Use it by running:

```
yarn format
```

[Solhint](https://protofire.github.io/solhint/) is used to lint Solidity files. Run it with:
```
yarn hint
```

[TypeChain](https://github.com/ethereum-ts/Typechain) is used to generates types for scripts and tests. Generate types by running:
```
yarn typechain
```
