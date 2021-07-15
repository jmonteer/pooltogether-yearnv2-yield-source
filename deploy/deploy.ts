import { Contract } from 'ethers';
import { getChainByChainId } from 'evm-chains';
import { writeFileSync } from 'fs';

import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction, DeploymentSubmission, DeployResult } from 'hardhat-deploy/types';

import { DAI_ADDRESS_MAINNET, DAI_VAULT_ADDRESS_MAINNET } from '../Constant';
import {
  action,
  alert,
  info,
  success,
  isTestEnvironment as isTestEnvironmentHelper,
} from '../helpers';

const displayLogs = !process.env.HIDE_DEPLOY_LOG;

function displayResult(name: string, result: DeployResult) {
  if (!result.newlyDeployed) {
    alert(`Re-used existing ${name} at ${result.address}`);
  } else {
    success(`${name} deployed at ${result.address}`);
  }
}

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  info('\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
  info('PoolTogether YearnV2 Yield Source - Deploy Script');
  info('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n');

  const { artifacts, getNamedAccounts, deployments, getChainId, ethers, network } = hre;
  const { deploy } = deployments;
  const { getContractAt, provider } = ethers;

  const outputDirectory = `./deployments/${network.name}`;

  let { deployer, multisig } = await getNamedAccounts();

  const chainId = parseInt(await getChainId());

  // 31337 is unit testing, 1337 is for coverage
  const isNotTestChainId = chainId !== 31337 && chainId !== 1337;
  const networkName = isNotTestChainId ? getChainByChainId(chainId)?.network : 'Test';
  const isTestEnvironment = isTestEnvironmentHelper(network);

  info(`Network: ${networkName} (${isTestEnvironment ? 'local' : 'remote'})`);
  info(`Deployer: ${deployer}`);

  if (!multisig) {
    alert(
      `Multisig address not defined for network ${networkName}, falling back to deployer: ${deployer}`,
    );
    multisig = deployer;
  } else {
    info(`Multisig: ${multisig}`);
  }

  action(`Deploying YearnV2YieldSource...`);
  const yearnV2YieldSourceResult: DeployResult = await deploy('YearnV2YieldSource', {
    from: deployer,
    skipIfAlreadyDeployed: true,
  });

  displayResult('YearnV2YieldSource', yearnV2YieldSourceResult);

  const yearnV2YieldSourceContract = await getContractAt(
    'YearnV2YieldSource',
    yearnV2YieldSourceResult.address,
  );

  if (yearnV2YieldSourceContract.newlyDeployed) {
    action('Calling mockInitialize()');
    await yearnV2YieldSourceContract.freeze();
    success('mockInitialize called successfully');
  }

  let proxyFactoryContract: Contract;

  if (isTestEnvironment) {
    action(`TestEnvironment detected, deploying a local GenericProxyFactory`);

    const genericProxyFactoryResult: DeployResult = await deploy('GenericProxyFactory', {
      from: deployer,
      skipIfAlreadyDeployed: true,
    });

    proxyFactoryContract = await getContractAt(
      'GenericProxyFactory',
      genericProxyFactoryResult.address,
    );

    success(`Deployed a local GenericProxyFactory at ${proxyFactoryContract.address}`);
  } else {
    let { genericProxyFactory } = await getNamedAccounts();
    proxyFactoryContract = await getContractAt('GenericProxyFactory', genericProxyFactory);
    success(`GenericProxyFactory deployed at ${proxyFactoryContract.address}`);
  }

  action(`Deploying YearnV2DAIYieldSource...`);
  const yearnV2YieldSourceArtifact = await artifacts.readArtifact('YearnV2YieldSource');
  const yearnV2YieldSourceABI = yearnV2YieldSourceArtifact.abi;

  const yearnV2YieldSourceInterface = new ethers.utils.Interface(yearnV2YieldSourceABI);

  const constructorArgs = yearnV2YieldSourceInterface.encodeFunctionData(
    yearnV2YieldSourceInterface.getFunction('initialize'),
    [
      DAI_VAULT_ADDRESS_MAINNET,
      DAI_ADDRESS_MAINNET,
      18,
      'yvysDAI',
      'PoolTogether Yearn V2 Vault DAI Yield Source',
    ],
  );

  const yearnV2DAIYieldSourceResult = await proxyFactoryContract.create(
    yearnV2YieldSourceContract.address,
    constructorArgs,
  );

  const yearnV2DAIYieldSourceReceipt = await provider.getTransactionReceipt(
    yearnV2DAIYieldSourceResult.hash,
  );

  const yearnV2DAIYieldSourceEvent = proxyFactoryContract.interface.parseLog(
    yearnV2DAIYieldSourceReceipt.logs[0],
  );

  const yearnV2DAIYieldSourceAddress = yearnV2DAIYieldSourceEvent.args.created;

  success(`YearnV2DAIYieldSource deployed at ${yearnV2DAIYieldSourceAddress}`);

  action('Saving deployments file for Yearn V2 DAI');

  const deploymentSubmission: DeploymentSubmission = {
    address: yearnV2DAIYieldSourceAddress,
    abi: yearnV2YieldSourceABI,
    receipt: yearnV2DAIYieldSourceReceipt,
    transactionHash: yearnV2DAIYieldSourceReceipt.transactionHash,
    args: [constructorArgs],
    bytecode: `${await provider.getCode(yearnV2DAIYieldSourceAddress)}`,
  };

  const outputFile = `${outputDirectory}/YearnV2DAIYieldSource.json`;

  action(`Writing to ${outputFile}...`);
  writeFileSync(outputFile, JSON.stringify(deploymentSubmission, null, 2), {
    encoding: 'utf8',
    flag: 'w',
  });

  await deployments.save('YearnV2DAIYieldSource', deploymentSubmission);
};

export default deployFunction;
