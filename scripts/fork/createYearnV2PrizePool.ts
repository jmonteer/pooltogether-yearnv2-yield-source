import PoolWithMultipleWinnersBuilder from '@pooltogether/pooltogether-contracts/deployments/mainnet/PoolWithMultipleWinnersBuilder.json';
import RNGBlockhash from '@pooltogether/pooltogether-rng-contracts/deployments/mainnet/RNGBlockhash.json';
import ControlledToken from '@pooltogether/pooltogether-contracts/abis/ControlledToken.json';
import MultipleWinners from '@pooltogether/pooltogether-contracts/abis/MultipleWinners.json';
import YieldSourcePrizePool from '@pooltogether/pooltogether-contracts/abis/YieldSourcePrizePool.json';

import { dai, usdc } from '@studydefi/money-legos/erc20';

import { task } from 'hardhat/config';

import { USDC_VAULT_ADDRESS_MAINNET } from '../../Constant';

import { action, info, success } from '../../helpers';

export default task('fork:create-yearnV2-prize-pool', 'Create YearnV2 Prize Pool').setAction(
  async (taskArguments, hre) => {
    const { artifacts, deployments, ethers, getNamedAccounts } = hre;

    const { constants, provider, getContractAt, utils } = ethers;
    const { AddressZero } = constants;
    const { getBlock, getBlockNumber, getSigner, getTransactionReceipt, send } = provider;
    const { Interface } = utils;

    async function increaseTime(time: number) {
      await send('evm_increaseTime', [time]);
      await send('evm_mine', []);
    }

    const { deployer, genericProxyFactory } = await getNamedAccounts();
    const contractsOwner = getSigner(deployer);

    const { YearnV2YieldSource: yearnV2YieldSourceProxyContract } = await deployments.all();

    info(`Deployer: ${deployer}`);

    action('Deploying YearnV2YieldSource...');

    const genericProxyFactoryContract = await getContractAt(
      'GenericProxyFactory',
      genericProxyFactory,
    );

    const yearnV2YieldSourceArtifact = await artifacts.readArtifact('YearnV2YieldSource');
    const yearnV2YieldSourceABI = yearnV2YieldSourceArtifact.abi;
    const yearnV2YieldSourceInterface = new Interface(yearnV2YieldSourceABI);

    const yearnV2YieldSourceConstructorArgs = yearnV2YieldSourceInterface.encodeFunctionData(
      yearnV2YieldSourceInterface.getFunction('initialize'),
      [
        USDC_VAULT_ADDRESS_MAINNET,
        18,
        'yvysDAI',
        'PoolTogether Yearn V2 Vault DAI Yield Source',
        contractsOwner._address,
      ],
    );

    const createYearnV2YieldSourceResult = await genericProxyFactoryContract.create(
      yearnV2YieldSourceProxyContract.address,
      yearnV2YieldSourceConstructorArgs,
    );

    const createYearnV2YieldSourceReceipt = await getTransactionReceipt(
      createYearnV2YieldSourceResult.hash,
    );

    const createYearnV2YieldSourceEvent = genericProxyFactoryContract.interface.parseLog(
      createYearnV2YieldSourceReceipt.logs[0],
    );

    const yearnV2YieldSourceAddress = createYearnV2YieldSourceEvent.args.created;

    success(`Deployed Yearn V2 Yield Source! ${yearnV2YieldSourceAddress}`);

    info('Deploying YearnV2YieldSourcePrizePool...');

    const poolBuilder = await getContractAt(
      PoolWithMultipleWinnersBuilder.abi,
      PoolWithMultipleWinnersBuilder.address,
      contractsOwner,
    );

    const yearnV2YieldSourcePrizePoolConfig = {
      yieldSource: yearnV2YieldSourceAddress,
      maxExitFeeMantissa: ethers.utils.parseUnits('0.5', 18),
      maxTimelockDuration: 1000,
    };

    const block = await getBlock(await getBlockNumber());

    const multipleWinnersConfig = {
      rngService: RNGBlockhash.address,
      prizePeriodStart: block.timestamp,
      prizePeriodSeconds: 60,
      ticketName: 'Ticket',
      ticketSymbol: 'TICK',
      sponsorshipName: 'Sponsorship',
      sponsorshipSymbol: 'SPON',
      ticketCreditLimitMantissa: ethers.utils.parseEther('0.1'),
      ticketCreditRateMantissa: ethers.utils.parseEther('0.001'),
      numberOfWinners: 1,
    };

    const yieldSourceMultipleWinnersTx = await poolBuilder.createYieldSourceMultipleWinners(
      yearnV2YieldSourcePrizePoolConfig,
      multipleWinnersConfig,
      6,
    );

    const yieldSourceMultipleWinnersReceipt = await getTransactionReceipt(
      yieldSourceMultipleWinnersTx.hash,
    );

    const yieldSourcePrizePoolInitializedEvent = yieldSourceMultipleWinnersReceipt.logs.map(
      (log) => {
        try {
          return poolBuilder.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      },
    );

    const prizePool = await getContractAt(
      YieldSourcePrizePool,
      yieldSourcePrizePoolInitializedEvent[yieldSourcePrizePoolInitializedEvent.length - 1]?.args[
        'prizePool'
      ],
      contractsOwner,
    );

    success(`Deployed YearnV2YieldSourcePrizePool! ${prizePool.address}`);

    const prizeStrategy = await getContractAt(
      MultipleWinners,
      await prizePool.prizeStrategy(),
      contractsOwner,
    );
    await prizeStrategy.addExternalErc20Award(dai.address);

    const usdcAmount = ethers.utils.parseUnits('1000', 6);
    const usdcContract = await getContractAt(usdc.abi, usdc.address, contractsOwner);
    await usdcContract.approve(prizePool.address, usdcAmount);

    info(`Depositing ${ethers.utils.formatUnits(usdcAmount, 6)} USDC...`);

    await prizePool.depositTo(
      contractsOwner._address,
      usdcAmount,
      await prizeStrategy.ticket(),
      AddressZero,
    );

    success('Deposited USDC!');

    info(`Prize strategy owner: ${await prizeStrategy.owner()}`);
    await increaseTime(30);

    // simulating returns in the vault during the prizePeriod
    const usdcProfits = ethers.utils.parseUnits('10000', 6);
    info(`yVault generated ${ethers.utils.formatUnits(usdcProfits, 6)} USDC`);
    await usdcContract.transfer(USDC_VAULT_ADDRESS_MAINNET, usdcProfits);

    await increaseTime(30);

    info('Starting award...');
    await prizeStrategy.startAward();
    await increaseTime(1);

    info('Completing award...');

    const awardTx = await prizeStrategy.completeAward();
    const awardReceipt = await getTransactionReceipt(awardTx.hash);
    const awardLogs = awardReceipt.logs.map((log) => {
      try {
        return prizePool.interface.parseLog(log);
      } catch (e) {
        return null;
      }
    });

    const awarded = awardLogs.find((event) => event && event.name === 'Awarded');

    success(`Awarded ${ethers.utils.formatUnits(awarded?.args?.amount, 6)} USDC!`);

    info('Withdrawing...');
    const ticketAddress = await prizeStrategy.ticket();
    const ticket = await getContractAt(ControlledToken, ticketAddress, contractsOwner);
    const withdrawalAmount = ethers.utils.parseUnits('100', 6);
    const earlyExitFee = await prizePool.callStatic.calculateEarlyExitFee(
      contractsOwner._address,
      ticket.address,
      withdrawalAmount,
    );

    const withdrawTx = await prizePool.withdrawInstantlyFrom(
      contractsOwner._address,
      withdrawalAmount,
      ticket.address,
      earlyExitFee.exitFee,
    );

    const withdrawReceipt = await getTransactionReceipt(withdrawTx.hash);
    const withdrawLogs = withdrawReceipt.logs.map((log) => {
      try {
        return prizePool.interface.parseLog(log);
      } catch (e) {
        return null;
      }
    });

    const withdrawn = withdrawLogs.find((event) => event && event.name === 'InstantWithdrawal');
    success(`Withdrawn ${ethers.utils.formatUnits(withdrawn?.args?.redeemed, 6)} USDC!`);
    success(`Exit fee was ${ethers.utils.formatUnits(withdrawn?.args?.exitFee, 6)} USDC`);

    await prizePool.captureAwardBalance();
    const awardBalance = await prizePool.callStatic.awardBalance();
    success(`Current awardable balance is ${ethers.utils.formatUnits(awardBalance, 6)} USDC`);
  },
);
