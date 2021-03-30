import { expect } from 'chai';
import { ethers } from 'hardhat';

import { YearnV2YieldSourceProxyFactory } from '../types';
import { USDC_ADDRESS, USDC_VAULT_ADDRESS } from './Constant';

describe('YearnV2YieldSourceProxyFactory', () => {

  describe('create()', () => {
    it('should create a new YearnV2 Yield Source', async () => {
      const provider = ethers.provider;

      const YearnV2YieldSourceProxyFactory = await ethers.getContractFactory(
        'YearnV2YieldSourceProxyFactory',
      );

      const hardhatYearnV2YieldSourceProxyFactory = (await YearnV2YieldSourceProxyFactory.deploy()) as YearnV2YieldSourceProxyFactory;

      const tx = await hardhatYearnV2YieldSourceProxyFactory.create(
        USDC_ADDRESS,
        USDC_VAULT_ADDRESS
      );
      const receipt = await provider.getTransactionReceipt(tx.hash);
      const event = hardhatYearnV2YieldSourceProxyFactory.interface.parseLog(receipt.logs[0]);

      expect(event.name).to.equal('ProxyCreated');
    });
  });
});
