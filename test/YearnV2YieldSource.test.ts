import debug from 'debug';

import { Signer } from '@ethersproject/abstract-signer';
import { BigNumber } from '@ethersproject/bignumber';
import { JsonRpcProvider } from '@ethersproject/providers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import { expect } from 'chai';
import { ethers, waffle } from 'hardhat';

// TYPES
import {
  IERC20Upgradeable as ERC20,
  IYieldSource as YieldSource,
  IYVaultV2 as Vault,
  YearnV2YieldSourceHarness,
  YearnV2YieldSourceProxyFactoryHarness
} from '../types';
// ABIs
import IYVaultV2 from '../abis/IYVaultV2.json';
import IYieldSource from '../abis/IYieldSource.json';
import SafeERC20WrapperUpgradeable from '../abis/SafeERC20WrapperUpgradeable.json';

const toWei = ethers.utils.parseEther;
const MAX_INTEGER = ethers.BigNumber.from('2').pow(ethers.BigNumber.from('256')).sub(ethers.BigNumber.from('1'));
describe('yearnV2YieldSource', () => {
  let contractsOwner: Signer;
  let yieldSourceOwner: SignerWithAddress;
  let wallet2: SignerWithAddress;
  let provider: JsonRpcProvider;

  let vault: Vault;
  let yearnV2YieldSource: YearnV2YieldSourceHarness;

  let underlyingToken: ERC20;

  beforeEach(async () => {
    const { deployMockContract } = waffle;

    [contractsOwner, yieldSourceOwner, wallet2] = await ethers.getSigners();
    provider = waffle.provider;

    debug('mocking tokens...');

    underlyingToken = ((await deployMockContract(
      contractsOwner,
      SafeERC20WrapperUpgradeable,
    )) as unknown) as ERC20;

    vault = ((await deployMockContract(contractsOwner, IYVaultV2)) as unknown) as Vault;
    await vault.mock.token.returns(underlyingToken.address);
    await vault.mock.activation.returns(1617880430);
    await vault.mock.apiVersion.returns("0.3.0");
    await underlyingToken.mock.approve
      .withArgs(vault.address, MAX_INTEGER)
      .returns(true);

    debug('mocking contracts...');

    debug('deploying yearnV2YieldSourceProxyFactory...');

    const yearnV2YieldSourceProxyFactory = await ethers.getContractFactory(
      'YearnV2YieldSourceProxyFactoryHarness',
    );
    const hardhatyearnV2YieldSourceProxyFactory = (await yearnV2YieldSourceProxyFactory.deploy()) as YearnV2YieldSourceProxyFactoryHarness;

    const initializeTx = await hardhatyearnV2YieldSourceProxyFactory.create(
      vault.address,
      underlyingToken.address
    );

    const receipt = await provider.getTransactionReceipt(initializeTx.hash);
    const proxyCreatedEvent = hardhatyearnV2YieldSourceProxyFactory.interface.parseLog(
      receipt.logs[0],
    );

    expect(proxyCreatedEvent.name).to.equal('ProxyCreated');

    yearnV2YieldSource = (await ethers.getContractAt(
      'YearnV2YieldSourceHarness',
      proxyCreatedEvent.args.proxy,
      contractsOwner,
    )) as YearnV2YieldSourceHarness;
  });

  describe('create()', () => {
    it('should create yearnV2YieldSource', async () => {
      expect(await yearnV2YieldSource.vault()).to.equal(vault.address);
    });
  });

  describe('depositToken()', () => {
    it('should return the underlying token', async () => {
      expect(await yearnV2YieldSource.depositToken()).to.equal(underlyingToken.address);
    });
  });

  describe('balanceOfToken()', () => {
    it('should return user balance', async () => {
      await yearnV2YieldSource.mint(yieldSourceOwner.address, toWei('100'));
      await yearnV2YieldSource.mint(wallet2.address, toWei('100'));
      await underlyingToken.mock.balanceOf.withArgs(yearnV2YieldSource.address).returns(toWei('0'));
      await vault.mock.balanceOf.withArgs(yearnV2YieldSource.address).returns(toWei('200'));
      await vault.mock.pricePerShare.returns(toWei('2'));
      expect(await yearnV2YieldSource.callStatic.balanceOfToken(wallet2.address)).to.equal(
        toWei('200'),
      );
    });
  });

  describe('_balanceOfYShares()', () => {
    it('should return YieldSource yShares balance', async () => {
      await vault.mock.balanceOf.withArgs(yearnV2YieldSource.address).returns(toWei('1000'));
      await vault.mock.pricePerShare.returns(toWei('2'));
      expect(await yearnV2YieldSource.callStatic.balanceOfYShares()).to.equal(
        toWei('1000'),
      );
    });
  });


  describe('_pricePerYShare()', () => {
    it('should return Vault pricePerShare', async () => {
      await vault.mock.pricePerShare.returns(toWei('2'));
      expect(await yearnV2YieldSource.callStatic.pricePerYShare()).to.equal(
        toWei('2'),
      );
    });
  });

  describe('_tokenToYShares()', () => {
    it('should return yShares', async () => {
      await underlyingToken.mock.balanceOf
        .withArgs(vault.address)
        .returns(toWei('1000'));
      await vault.mock.pricePerShare.returns(toWei('2'));
      expect(await yearnV2YieldSource.callStatic.tokenToYShares(toWei('500'))).to.equal(
        toWei('250'),
      );
    });

    it('should return token amount if totalSupply is 0', async () => {
      await vault.mock.pricePerShare.returns(toWei('2'));

      expect(await yearnV2YieldSource.ySharesToToken(toWei('100'))).to.equal(toWei('200'));
    });
  });

  describe('_ySharesToToken()', () => {
    it('should return token amount', async () => {
      await underlyingToken.mock.balanceOf
        .withArgs(vault.address)
        .returns(toWei('1000'));
      await vault.mock.pricePerShare.returns(toWei('2'));
      expect(await yearnV2YieldSource.callStatic.ySharesToToken(toWei('500'))).to.equal(
        toWei('1000'),
      );
    });

    it('should return token amount if totalSupply is 0', async () => {
      await vault.mock.pricePerShare.returns(toWei('2'));

      expect(await yearnV2YieldSource.ySharesToToken(toWei('100'))).to.equal(toWei('200'));
    });
  });

  describe('_tokenToShares()', () => {
    it('should return shares amount', async () => {
      await yearnV2YieldSource.mint(yieldSourceOwner.address, toWei('100'));
      await yearnV2YieldSource.mint(wallet2.address, toWei('100'));
      await underlyingToken.mock.balanceOf.withArgs(yearnV2YieldSource.address).returns(toWei('0'));
      await vault.mock.balanceOf.withArgs(yearnV2YieldSource.address).returns(toWei('1000'));
      await vault.mock.pricePerShare.returns(toWei('1'));

      expect(await yearnV2YieldSource.tokenToShares(toWei('10'))).to.equal(toWei('2'));
    });

    it('should return tokens if totalSupply is 0', async () => {
      await vault.mock.pricePerShare.returns(toWei('1'));
      
      expect(await yearnV2YieldSource.tokenToShares(toWei('100'))).to.equal(toWei('100'));
    });
  });

  describe('_sharesToToken()', () => {
    it('should return tokens amount', async () => {
      await yearnV2YieldSource.mint(yieldSourceOwner.address, toWei('100'));
      await yearnV2YieldSource.mint(wallet2.address, toWei('100'));
      await underlyingToken.mock.balanceOf.withArgs(yearnV2YieldSource.address).returns(toWei('0'));
      await vault.mock.balanceOf.withArgs(yearnV2YieldSource.address).returns(toWei('1000'));
      await vault.mock.pricePerShare.returns(toWei('1'));

      expect(await yearnV2YieldSource.sharesToToken(toWei('2'))).to.equal(toWei('10'));
    });

    it('should return shares if totalSupply is 0', async () => {
      await vault.mock.pricePerShare.returns(toWei('1'));

      expect(await yearnV2YieldSource.sharesToToken(toWei('100'))).to.equal(toWei('100'));
    });
  });

  const supplyTokenTo = async (user: SignerWithAddress, userAmount: BigNumber) => {
    const userAddress = user.address;

    await underlyingToken.mock.balanceOf.withArgs(user.address).returns(toWei('200'));
    await underlyingToken.mock.balanceOf.withArgs(yearnV2YieldSource.address).returns(toWei('0'));
    await vault.mock.balanceOf.withArgs(yearnV2YieldSource.address).returns(toWei('300'));
    await vault.mock.pricePerShare.returns(toWei('1'));

    await underlyingToken.mock.transferFrom
      .withArgs(userAddress, yearnV2YieldSource.address, userAmount)
      .returns(true);
    await underlyingToken.mock.allowance
      .withArgs(yearnV2YieldSource.address, vault.address)
      .returns(toWei('0'));
    await underlyingToken.mock.approve.withArgs(vault.address, userAmount).returns(true);
    await vault.mock.availableDepositLimit
      .returns(userAmount);
    await vault.mock.deposit
      .returns(userAmount);

    await yearnV2YieldSource.connect(user).supplyTokenTo(userAmount, userAddress);
  };

  describe('supplyTokenTo()', () => {
    let amount: BigNumber;

    beforeEach(async () => {
      amount = toWei('100');
    });

    it('should supply assets if totalSupply is 0', async () => {
      await supplyTokenTo(yieldSourceOwner, amount);
      expect(await yearnV2YieldSource.totalSupply()).to.equal(amount);
    });

    it('should supply assets if totalSupply is not 0', async () => {
      await yearnV2YieldSource.mint(yieldSourceOwner.address, toWei('100'));
      await yearnV2YieldSource.mint(wallet2.address, toWei('100'));
      await supplyTokenTo(yieldSourceOwner, amount);
    });

    it('should revert on error', async () => {
      await underlyingToken.mock.approve.withArgs(vault.address, amount).returns(true);
      await vault.mock.deposit
        .reverts();

      await expect(
        yearnV2YieldSource.supplyTokenTo(amount, yearnV2YieldSource.address),
      ).to.be.revertedWith('');
    });
  });

  describe('redeemToken()', () => {
    let yieldSourceOwnerBalance: BigNumber;
    let redeemAmount: BigNumber;

    beforeEach(() => {
      yieldSourceOwnerBalance = toWei('300');
      redeemAmount = toWei('100');
    });

    it('should redeem assets', async () => {
      await yearnV2YieldSource.mint(yieldSourceOwner.address, yieldSourceOwnerBalance);
      await underlyingToken.mock.balanceOf
      .withArgs(yearnV2YieldSource.address)
      .returns(toWei('0'));
      
      await vault.mock.balanceOf
        .withArgs(yearnV2YieldSource.address)
        .returns(yieldSourceOwnerBalance);
      await vault.mock.pricePerShare.returns(toWei('1'));
      await vault.mock.maxAvailableShares
        .returns(redeemAmount);
      await vault.mock.withdraw
        .withArgs(redeemAmount, yearnV2YieldSource.address, 10_000)
        .returns(redeemAmount);

      await underlyingToken.mock.transfer
        .withArgs(yieldSourceOwner.address, redeemAmount)
        .returns(true);

      const balanceAfter = await vault.balanceOf(yearnV2YieldSource.address)
      const balanceDiff = yieldSourceOwnerBalance.sub(balanceAfter);

      await underlyingToken.mock.transfer
      .withArgs(yieldSourceOwner.address, balanceDiff)
      .returns(true);

      await yearnV2YieldSource.connect(yieldSourceOwner).redeemToken(redeemAmount);

      expect(await yearnV2YieldSource.callStatic.balanceOf(yieldSourceOwner.address)).to.equal(
        yieldSourceOwnerBalance.sub(redeemAmount),
      );
    });

    it('should not be able to redeem assets if balance is 0', async () => {
      await vault.mock.balanceOf
        .withArgs(yearnV2YieldSource.address)
        .returns(yieldSourceOwnerBalance);
      await vault.mock.pricePerShare.returns(toWei('1'));
      await vault.mock.maxAvailableShares
        .returns(redeemAmount);
      await vault.mock.withdraw
        .withArgs(redeemAmount, yearnV2YieldSource.address, 10_000)
        .returns(redeemAmount);

      await underlyingToken.mock.transfer
        .withArgs(yieldSourceOwner.address, redeemAmount)
        .returns(true);


      await expect(
        yearnV2YieldSource.connect(yieldSourceOwner).redeemToken(redeemAmount),
      ).to.be.revertedWith('ERC20: burn amount exceeds balance');
    });

    it('should fail to redeem if amount superior to balance', async () => {
      const yieldSourceOwnerLowBalance = toWei('10');

      await yearnV2YieldSource.mint(yieldSourceOwner.address, yieldSourceOwnerLowBalance);
      await vault.mock.balanceOf
        .withArgs(yearnV2YieldSource.address)
        .returns(yieldSourceOwnerLowBalance);
      await underlyingToken.mock.balanceOf
        .withArgs(yearnV2YieldSource.address)
        .returns(toWei('0'));
      await vault.mock.pricePerShare.returns(toWei('1'));
      await vault.mock.maxAvailableShares
          .returns(redeemAmount);
      await vault.mock.withdraw
          .withArgs(redeemAmount, yearnV2YieldSource.address, 10_000)
          .returns(redeemAmount);

      await underlyingToken.mock.transfer
        .withArgs(yieldSourceOwner.address, yieldSourceOwnerLowBalance)
        .returns(true);

      await expect(
        yearnV2YieldSource.connect(yieldSourceOwner).redeemToken(redeemAmount),
      ).to.be.revertedWith('ERC20: burn amount exceeds balance');
    });
  });

  describe('sponsor()', () => {
    let amount: BigNumber;

    beforeEach(async () => {
      amount = toWei('500');
    });

    it('should sponsor Yield Source', async () => {
      const wallet2Amount = toWei('100');
      await yearnV2YieldSource.mint(wallet2.address, wallet2Amount);
      await vault.mock.availableDepositLimit
        .returns(amount);
      await vault.mock.pricePerShare
        .returns(toWei('1'));
      await vault.mock.balanceOf
        .withArgs(yearnV2YieldSource.address)
        .returns(toWei('500'));
      await underlyingToken.mock.balanceOf
        .withArgs(yearnV2YieldSource.address)
        .returns(toWei('0'));
      await underlyingToken.mock.transferFrom
        .withArgs(yieldSourceOwner.address, yearnV2YieldSource.address, amount)
        .returns(true);
      await underlyingToken.mock.allowance
        .withArgs(yearnV2YieldSource.address, vault.address)
        .returns(toWei('0'));
      await underlyingToken.mock.approve.withArgs(vault.address, amount).returns(true);
      await vault.mock.deposit
        .returns(amount);

      await yearnV2YieldSource.connect(yieldSourceOwner).sponsor(amount);
      await vault.mock.balanceOf
        .withArgs(yearnV2YieldSource.address)
        .returns(amount.add(wallet2Amount));
      expect(await yearnV2YieldSource.callStatic.balanceOfToken(wallet2.address)).to.equal(
        amount.add(wallet2Amount),
      );
    });

    it('should revert on error', async () => {
      await underlyingToken.mock.transferFrom
        .withArgs(yieldSourceOwner.address, yearnV2YieldSource.address, amount)
        .returns(true);
      await underlyingToken.mock.allowance
        .withArgs(yearnV2YieldSource.address, vault.address)
        .returns(toWei('0'));
      await underlyingToken.mock.approve.withArgs(vault.address, amount).returns(true);
      await vault.mock.deposit
        .reverts();

      await expect(yearnV2YieldSource.connect(yieldSourceOwner).sponsor(amount)).to.be.revertedWith(
        '',
      );
    });
  });
});
