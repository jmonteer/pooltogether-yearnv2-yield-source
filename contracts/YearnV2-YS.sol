// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.6;

import "../interfaces/YieldSourceInterface.sol";
import "../interfaces/VaultAPI.sol";

contract YieldSourceYearnV2 is YieldSourceInterface {
    using SafeERC20 for IERC20;
    using SafeMath for uint;
    
    address public immutable vault;
    address private immutable token_; 

    uint private immutable MIN_DEPOSIT;
    uint private immutable MIN_IDLE_FUNDS;

    constructor(address _token, address _vault, uint _minDeposit, uint _minIdleFunds) {
        vault = _vault;
        token_ = _token;

        MIN_DEPOSIT = _minDeposit; // set up taking into account token decimals
        MIN_IDLE_FUNDS = _minIdleFunds; 
        IERC20(_token).approve(_vault, type(uint256).max);
    }

    function token() external view override returns (address) {
        return token_;
    }

    function balanceOf(address addr) external override  returns (uint256) {
        return IERC20(token_).balanceOf(addr);
    }

    function supplyTo(uint256 amount, address to) override external {
        // bring tokens to the Custom Yield Source 
        IERC20(token_).safeTransferFrom(to, address(this), amount);

        uint currentBalance = IERC20(token_).balanceOf(address(this));
        uint availableBalance = currentBalance > MIN_IDLE_FUNDS ? currentBalance.sub(MIN_IDLE_FUNDS) : 0;

        // check available room for deposits in Vault (some have a deposit limit)
        uint availableToDeposit = VaultAPI(vault).availableDepositLimit();
        // we deposit as much as possible 
        uint amountToDeposit = availableToDeposit > availableBalance ? availableBalance : availableToDeposit;

        // if it does make sense to deposit such amount, it does
        // if it does not, it waits until enough balance has been accumulated
        if(amountToDeposit >= MIN_DEPOSIT) {
            VaultAPI(vault).deposit(amountToDeposit);
        }
    }

    function redeem(uint256 amount) external override returns (uint256 withdrawnAmount) {
        // try to withdraw from idle funds
        // else, will withdraw funds from vault
        if(IERC20(token_).balanceOf(address(this)) >= amount){
            withdrawnAmount = amount;
        } else {
            // mul and div by 1e18 for precision purposes
            uint sharesToWithdraw = amount.mul(1e18).div(VaultAPI(vault).pricePerShare()).div(1e18);
            
            require(sharesToWithdraw <= VaultAPI(vault).maxAvailableShares(), "not enough shares available for withdrawal");

            // TODO: does it make sense to accept greater losses? Default is 0.01%
            withdrawnAmount = VaultAPI(vault).withdraw(sharesToWithdraw);
        }
        IERC20(token_).safeTransfer(msg.sender, withdrawnAmount);
    }
}