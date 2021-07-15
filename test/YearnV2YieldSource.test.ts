import debug from 'debug';

import { Signer } from '@ethersproject/abstract-signer';
import { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { ethers, waffle } from 'hardhat';

import {
  YearnV2YieldSourceHarness,
} from '../types';

import IYVaultV2 from '../abis/IYVaultV2.json';
import SafeERC20WrapperUpgradeable from '../abis/SafeERC20WrapperUpgradeable.json';

const toWei = ethers.utils.parseEther;
const MAX_INTEGER = ethers.BigNumber.from('2')
  .pow(ethers.BigNumber.from('256'))
  .sub(ethers.BigNumber.from('1'));
const UNDERLYING_TOKEN_DECIMALS = 18;

describe('yearnV2YieldSource', () => {
  let contractsOwner: Signer;
  let yieldSourceOwner: SignerWithAddress;
  let wallet2: SignerWithAddress;

  let vault: MockContract;
  let hardhatYearnYieldSourceHarness: Contract;
  let yearnV2YieldSource: YearnV2YieldSourceHarness;

  let underlyingToken: MockContract;

  let isInitializeTest = false;

  const yearnV2YieldSourceTokenDecimals = 18;
  const yearnV2YieldSourceTokenSymbol = 'yvysDAI';
  const yearnV2YieldSourceTokenName = 'PoolTogether Yearn V2 Vault DAI Yield Source';

  const initializeYearnV2YieldSource = async (vaultAddress: string, tokenAddress: string, decimals: number) => {
    return await yearnV2YieldSource.initialize(
      vaultAddress,
      tokenAddress,
      decimals,
      yearnV2YieldSourceTokenSymbol,
      yearnV2YieldSourceTokenName,
    );
  };

  beforeEach(async () => {
    const { deployMockContract } = waffle;

    [contractsOwner, yieldSourceOwner, wallet2] = await ethers.getSigners();

    debug('mocking tokens...');

    underlyingToken = await deployMockContract(
      contractsOwner,
      SafeERC20WrapperUpgradeable,
    );

    vault = await deployMockContract(contractsOwner, IYVaultV2);
    await vault.mock.token.returns(underlyingToken.address);
    await vault.mock.activation.returns(1617880430);
    await vault.mock.apiVersion.returns('0.3.0');
    await underlyingToken.mock.allowance.returns(toWei('0'));
    await underlyingToken.mock.approve.withArgs(vault.address, MAX_INTEGER).returns(true);

    debug('mocking contracts...');

    debug('deploying yearnV2YieldSourceProxyFactory...');

    const YearnYieldSource = await ethers.getContractFactory('YearnV2YieldSourceHarness');
    hardhatYearnYieldSourceHarness = await YearnYieldSource.deploy();

    yearnV2YieldSource = await ethers.getContractAt(
      'YearnV2YieldSourceHarness',
      hardhatYearnYieldSourceHarness.address,
      contractsOwner,
    ) as YearnV2YieldSourceHarness;

    if (!isInitializeTest) {
      await initializeYearnV2YieldSource(vault.address, underlyingToken.address, 18);
      await yearnV2YieldSource.transferOwnership(yieldSourceOwner.address);
    }
  });

  describe('initialize()', () => {
    const compatibleVersions = ['0.3.0', '0.3.1', '0.3.5'];
    const incompatibleVersions = ['0.3.2', '0.3.3', '0.3.4'];

    before(() => {
      isInitializeTest = true;
    });

    after(() => {
      isInitializeTest = false;
    });

    for (const v of compatibleVersions) {
      it(`should let use a ${v} vault`, async () => {
        await vault.mock.apiVersion.returns(v);

        await expect(initializeYearnV2YieldSource(vault.address, underlyingToken.address, yearnV2YieldSourceTokenDecimals))
          .to.emit(yearnV2YieldSource, 'YearnV2YieldSourceInitialized')
          .withArgs(
            vault.address,
            underlyingToken.address,
            yearnV2YieldSourceTokenDecimals,
            yearnV2YieldSourceTokenSymbol,
            yearnV2YieldSourceTokenName,
          );
      });
    }

    for (const v of incompatibleVersions) {
      it(`should not let use a ${v} vault`, async () => {
        await vault.mock.apiVersion.returns(v);

        await expect(
          initializeYearnV2YieldSource(vault.address, underlyingToken.address, yearnV2YieldSourceTokenDecimals),
        ).to.be.revertedWith('YearnV2YieldSource/vault-not-compatible');
      });
    }

    it('should fail if vault is address zero', async () => {
      await expect(
        initializeYearnV2YieldSource(
          ethers.constants.AddressZero,
          underlyingToken.address,
          yearnV2YieldSourceTokenDecimals
        ),
      ).to.be.revertedWith('YearnV2YieldSource/vault-not-zero-address');
    });

    it('should fail if token is address zero', async () => {
      await expect(
        initializeYearnV2YieldSource(
          vault.address,
          ethers.constants.AddressZero,
          yearnV2YieldSourceTokenDecimals
        ),
      ).to.be.revertedWith('YearnV2YieldSource/token-not-zero-address');
    });

    it('should fail if token address is different from vault token address', async () => {
      const randomWallet = ethers.Wallet.createRandom();

      await expect(
        initializeYearnV2YieldSource(
          vault.address,
          randomWallet.address,
          yearnV2YieldSourceTokenDecimals
        ),
      ).to.be.revertedWith('YearnV2YieldSource/token-address-different');
    });

    it('should fail if token decimal is not greater than 0', async () => {
      await vault.mock.apiVersion.returns(compatibleVersions[0]);

      await expect(
        initializeYearnV2YieldSource(
          vault.address,
          underlyingToken.address,
          0
        ),
      ).to.be.revertedWith('YearnV2YieldSource/decimals-not-greater-than-zero');
    });
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

  describe('approveMaxAmount()', () => {
    it('should approve vault to spend max uint256 amount', async () => {
      await underlyingToken.mock.allowance.withArgs(yearnV2YieldSource.address, vault.address).returns(ethers.constants.MaxUint256);

			expect(await yearnV2YieldSource.connect(yieldSourceOwner).callStatic.approveMaxAmount()).to.equal(true);
      expect(await underlyingToken.allowance(yearnV2YieldSource.address, vault.address)).to.equal(ethers.constants.MaxUint256);
    });

    it('should fail if not owner', async () => {
			await expect(yearnV2YieldSource.connect(wallet2).callStatic.approveMaxAmount()).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('balanceOfToken()', () => {
    it('should return user balance', async () => {
      await yearnV2YieldSource.mint(yieldSourceOwner.address, toWei('100'));
      await yearnV2YieldSource.mint(wallet2.address, toWei('100'));
      await underlyingToken.mock.balanceOf.withArgs(yearnV2YieldSource.address).returns(toWei('0'));
      await vault.mock.decimals.returns(UNDERLYING_TOKEN_DECIMALS);
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
      expect(await yearnV2YieldSource.callStatic.balanceOfYShares()).to.equal(toWei('1000'));
    });
  });

  describe('_pricePerYShare()', () => {
    it('should return Vault pricePerShare', async () => {
      await vault.mock.pricePerShare.returns(toWei('2'));

      expect(await yearnV2YieldSource.callStatic.pricePerYShare()).to.equal(toWei('2'));
    });
  });

  describe('_tokenToYShares()', () => {
    it('should return yShares', async () => {
      await underlyingToken.mock.balanceOf.withArgs(vault.address).returns(toWei('1000'));
      await vault.mock.pricePerShare.returns(toWei('2'));
      await vault.mock.decimals.returns(UNDERLYING_TOKEN_DECIMALS);

      expect(await yearnV2YieldSource.callStatic.tokenToYShares(toWei('500'))).to.equal(
        toWei('250'),
      );
    });
  });

  describe('_ySharesToToken()', () => {
    it('should return token amount', async () => {
      await underlyingToken.mock.balanceOf.withArgs(vault.address).returns(toWei('1000'));
      await vault.mock.pricePerShare.returns(toWei('2'));
      await vault.mock.decimals.returns(UNDERLYING_TOKEN_DECIMALS);

      expect(await yearnV2YieldSource.callStatic.ySharesToToken(toWei('500'))).to.equal(
        toWei('1000'),
      );
    });
  });

  describe('_tokenToShares()', () => {
    it('should return shares amount', async () => {
      await yearnV2YieldSource.mint(yieldSourceOwner.address, toWei('100'));
      await yearnV2YieldSource.mint(wallet2.address, toWei('100'));
      await underlyingToken.mock.balanceOf.withArgs(yearnV2YieldSource.address).returns(toWei('0'));
      await vault.mock.balanceOf.withArgs(yearnV2YieldSource.address).returns(toWei('1000'));
      await vault.mock.pricePerShare.returns(toWei('1'));
      await vault.mock.decimals.returns(UNDERLYING_TOKEN_DECIMALS);

      expect(await yearnV2YieldSource.tokenToShares(toWei('10'))).to.equal(toWei('2'));
    });

    it('should return tokens if totalSupply is 0', async () => {
      await vault.mock.pricePerShare.returns(toWei('2'));

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
      await vault.mock.decimals.returns(UNDERLYING_TOKEN_DECIMALS);

      expect(await yearnV2YieldSource.sharesToToken(toWei('2'))).to.equal(toWei('10'));
    });

    it('should return shares if totalSupply is 0', async () => {
      await vault.mock.pricePerShare.returns(toWei('2'));

      expect(await yearnV2YieldSource.sharesToToken(toWei('100'))).to.equal(toWei('100'));
    });
  });

  const supplyTokenTo = async (user: SignerWithAddress, userAmount: BigNumber) => {
    const userAddress = user.address;

    await underlyingToken.mock.balanceOf.withArgs(user.address).returns(toWei('200'));
    await underlyingToken.mock.balanceOf.withArgs(yearnV2YieldSource.address).returns(toWei('0'));
    await vault.mock.balanceOf.withArgs(yearnV2YieldSource.address).returns(toWei('300'));
    await vault.mock.pricePerShare.returns(toWei('1'));
    await vault.mock.decimals.returns(UNDERLYING_TOKEN_DECIMALS);

    await underlyingToken.mock.transferFrom
      .withArgs(userAddress, yearnV2YieldSource.address, userAmount)
      .returns(true);
    await underlyingToken.mock.allowance
      .withArgs(yearnV2YieldSource.address, vault.address)
      .returns(toWei('0'));
    await underlyingToken.mock.approve.withArgs(vault.address, userAmount).returns(true);
    await vault.mock.availableDepositLimit.returns(ethers.utils.parseEther('1'));
    await vault.mock.deposit.returns(userAmount);

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
      await vault.mock.deposit.reverts();

      await expect(
        yearnV2YieldSource.supplyTokenTo(amount, yearnV2YieldSource.address),
      ).to.be.revertedWith('');
    });
  });

  describe('setMaxLosses()', () => {
    it('should set max losses', async () => {
      await expect(yearnV2YieldSource.connect(yieldSourceOwner).setMaxLosses(10_000))
        .to.emit(yearnV2YieldSource, 'MaxLossesChanged')
        .withArgs(10_000);
      expect(await yearnV2YieldSource.maxLosses()).to.eq(10_000);

      expect(await yearnV2YieldSource.connect(yieldSourceOwner).callStatic.setMaxLosses(10_000)).to.equal(true);
    });

    it('should not allow to set losses over 100%', async () => {
      await expect(
        yearnV2YieldSource.connect(yieldSourceOwner).setMaxLosses(11_000),
      ).to.be.revertedWith('YearnV2YieldSource/losses-set-too-high');
    });

    it('should not allow other users to set max losses', async () => {
      await expect(yearnV2YieldSource.connect(wallet2).setMaxLosses(10_000)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
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
      await underlyingToken.mock.balanceOf.withArgs(yearnV2YieldSource.address).returns(toWei('0'));

      await vault.mock.balanceOf
        .withArgs(yearnV2YieldSource.address)
        .returns(yieldSourceOwnerBalance);
      await vault.mock.pricePerShare.returns(toWei('1'));
      await vault.mock.maxAvailableShares.returns(redeemAmount);

      await vault.mock['withdraw(uint256,address)']
          .withArgs(redeemAmount, yearnV2YieldSource.address)
          .returns(redeemAmount);
      await vault.mock.decimals.returns(UNDERLYING_TOKEN_DECIMALS);

      await underlyingToken.mock.transfer
        .withArgs(yieldSourceOwner.address, redeemAmount)
        .returns(true);

      const balanceAfter = await vault.balanceOf(yearnV2YieldSource.address);
      const balanceDiff = yieldSourceOwnerBalance.sub(balanceAfter);

      await underlyingToken.mock.transfer
        .withArgs(yieldSourceOwner.address, balanceDiff)
        .returns(true);

      await yearnV2YieldSource.connect(yieldSourceOwner).redeemToken(redeemAmount);

      expect(await yearnV2YieldSource.callStatic.balanceOf(yieldSourceOwner.address)).to.equal(
        yieldSourceOwnerBalance.sub(redeemAmount),
      );
    });

    it('should redeem assets with maxLosses set', async () => {
      await yearnV2YieldSource.mint(yieldSourceOwner.address, yieldSourceOwnerBalance);
      await underlyingToken.mock.balanceOf.withArgs(yearnV2YieldSource.address).returns(toWei('0'));

      await vault.mock.balanceOf
        .withArgs(yearnV2YieldSource.address)
        .returns(yieldSourceOwnerBalance);
      await vault.mock.pricePerShare.returns(toWei('1'));
      await vault.mock.maxAvailableShares.returns(redeemAmount);
      await vault.mock['withdraw(uint256,address,uint256)']
        .withArgs(redeemAmount, yearnV2YieldSource.address, 10_000)
        .returns(redeemAmount);
      await vault.mock.decimals.returns(UNDERLYING_TOKEN_DECIMALS);

      await underlyingToken.mock.transfer
        .withArgs(yieldSourceOwner.address, redeemAmount)
        .returns(true);

      await yearnV2YieldSource.connect(yieldSourceOwner).setMaxLosses(10_000);

      const balanceAfter = await vault.balanceOf(yearnV2YieldSource.address);
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
      await vault.mock.maxAvailableShares.returns(redeemAmount);

      await vault.mock['withdraw(uint256,address)']
          .withArgs(redeemAmount, yearnV2YieldSource.address)
          .returns(redeemAmount);
      await vault.mock.decimals.returns(UNDERLYING_TOKEN_DECIMALS);

      await underlyingToken.mock.balanceOf.withArgs(yearnV2YieldSource.address).returns('0');
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
      await underlyingToken.mock.balanceOf.withArgs(yearnV2YieldSource.address).returns(toWei('0'));
      await vault.mock.pricePerShare.returns(toWei('1'));
      await vault.mock.decimals.returns(UNDERLYING_TOKEN_DECIMALS);

      await vault.mock.maxAvailableShares.returns(redeemAmount);
      await vault.mock.withdraw
        .withArgs(redeemAmount, yearnV2YieldSource.address, 10_000)
        .returns(redeemAmount);

      await vault.mock['withdraw(uint256,address)']
          .withArgs(redeemAmount,yearnV2YieldSource.address)
          .returns(redeemAmount);

      await underlyingToken.mock.balanceOf.withArgs(yearnV2YieldSource.address).returns('0');
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
      await vault.mock.availableDepositLimit.returns(amount);
      await vault.mock.pricePerShare.returns(toWei('1'));
      await vault.mock.balanceOf.withArgs(yearnV2YieldSource.address).returns(toWei('500'));
      await underlyingToken.mock.balanceOf.withArgs(yearnV2YieldSource.address).returns(toWei('0'));
      await underlyingToken.mock.transferFrom
        .withArgs(yieldSourceOwner.address, yearnV2YieldSource.address, amount)
        .returns(true);
      await underlyingToken.mock.allowance
        .withArgs(yearnV2YieldSource.address, vault.address)
        .returns(toWei('0'));
      await underlyingToken.mock.approve.withArgs(vault.address, amount).returns(true);
      await vault.mock.deposit.returns(amount);
      await vault.mock.decimals.returns(UNDERLYING_TOKEN_DECIMALS);
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
      await vault.mock.deposit.reverts();

      await expect(yearnV2YieldSource.connect(yieldSourceOwner).sponsor(amount)).to.be.revertedWith(
        '',
      );
    });
  });
});
