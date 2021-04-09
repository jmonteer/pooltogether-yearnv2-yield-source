// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "../interfaces/IYieldSource.sol";
import "../external/yearn/IYVaultV2.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

contract YearnV2YieldSource is IYieldSource, ERC20Upgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeMathUpgradeable for uint;
    
    address public vault;
    address internal token; 
    uint256 internal constant MIN_HOLDINGS = 10_000;
    uint256 internal constant MAX_BPS = 100_000;

    event Sponsored(
        address indexed user,
        uint256 amount
    );

    event YieldSourceYearnV2Initialized(
        address vault,
        address token
    );

    function initialize(
        address _vault,
        address _token
    ) 
        public 
    {
        require(vault == address(0), "!already initialized");
        require(IYVaultV2(_vault).token() == _token, "!incorrect vault");
        require(IYVaultV2(_vault).activation != 0, "!vault not initialized");

        vault = _vault;
        token = _token;

        IERC20Upgradeable(_token).approve(_vault, type(uint256).max);

        emit YieldSourceYearnV2Initialized(
            _vault,
            _token
        );
    }

    function depositToken() external view override returns (address) {
        return token;
    }

    function balanceOfToken(address addr) external override returns (uint256) {
        return _sharesToToken(balanceOf(addr));
    }

    function supplyTokenTo(uint256 _amount, address to) override external {
        uint256 shares = _tokenToShares(_amount);
        
        // NOTE: we have to deposit after calculating shares to mint
        // NOTE: the required buffer is calculated AFTER depositing tokens
        IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), _amount);

        uint256 amountToBuffer = 0;
        uint256 amountFromBuffer = 0;
        uint256 amountToDeposit = _amount;
        
        uint256 _balance = _balanceOfToken();
        uint256 _buffer = _requiredBuffer(); 
        if(_balance < _buffer || _balance == 0) {
            amountToBuffer = _buffer.sub(_balance);
            // NOTE: if balance == 0, _requiredBuffer will be 0. First deposit is 100% for buffer
            if(_balance == 0) amountToBuffer == _amount;
            amountToBuffer = Math.min(amountToBuffer, _amount);
        } else {
            amountFromBuffer = _balance.sub(_buffer);
        }

        _depositInVault(_amount.add(amountFromBuffer).sub(amountToBuffer));
        _mint(to, shares);
    }

    function redeemToken(uint256 amount) external override returns (uint256) {
        uint256 shares = _tokenToShares(amount);

        uint256 withdrawnAmount = 0;
        uint256 yShares = _ySharesToWithdraw(amount);
        if(yShares > 0){
            withdrawnAmount = _withdrawFromVault(yShares);
        }

        _burn(msg.sender, shares);
        require(_balanceOfToken() > amount, "!not enough tokens to withdraw. Wait until profits are unlocked");
        IERC20Upgradeable(token).safeTransfer(msg.sender, amount);

        return amount;
    }

    function sponsor(uint256 amount) external {
        IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), amount);

        _depositInVault(amount);

        emit Sponsored(msg.sender, amount);
    }

    // ************************ INTERNAL FUNCTIONS ************************

    function _depositInVault(uint amount) internal returns (uint256) {
        // check available room for deposits in Vault (some have a deposit limit)
        uint availableToDeposit = IYVaultV2(vault).availableDepositLimit(); // returns amount in underlying token

        amount = Math.min(availableToDeposit, amount);

        return IYVaultV2(vault).deposit(amount);
    }

    function _withdrawFromVault(uint yShares) internal returns (uint256) {
        require(yShares <= IYVaultV2(vault).maxAvailableShares(), "!not enough shares available for withdrawal");

        return IYVaultV2(vault).withdraw(yShares);
    }

    function _balanceOfYShares() internal view returns (uint256) {
        return IYVaultV2(vault).balanceOf(address(this));
    }

    function _pricePerYShare() internal view returns (uint256) {
        return IYVaultV2(vault).pricePerShare();
    }

    function _balanceOfToken() internal view returns (uint256) {
        return IERC20Upgradeable(_token).balanceOf(address(this));
    }

    function _totalAssetsInToken() internal view returns (uint256) {
        return _balanceOfToken().add(_ySharesToToken(_balanceOfYShares()));
    }

    function _requiredBuffer() internal view returns (uint256) {
        return _totalAssetsInToken().mul(MIN_HOLDINGS).div(MAX_BPS);
    }

    // ************************ CALCS ************************

    function _tokenToYShares(uint256 tokens) internal view returns (uint256) {
        return tokens.mul(1e18).div(_pricePerYShare());
    }

    function _ySharesToToken(uint256 yShares) internal view returns (uint256) {
        return yShares.mul(_pricePerYShare()).div(1e18);
    }

    function _tokenToShares(uint256 tokens) internal view returns (uint256 shares) {
        if(totalSupply() == 0) {
            shares = tokens;
        } else {
            uint256 _totalTokens = _totalAssetsInToken();
            shares = tokens.mul(totalSupply()).div(_totalTokens);
        }
    }

    function _sharesToToken(uint256 shares) internal view returns (uint256 tokens) {
        if(totalSupply() == 0) {
            tokens = shares;
        } else {
            uint256 _totalTokens = _totalAssetsInToken();
            tokens = shares.mul(_totalTokens).div(totalSupply());
        }
    }

    function _ySharesToWithdraw(uint256 amount) internal view returns (uint256) {
        uint256 _vaultLastReport = vault.lastReport();
        uint256 _vaultLockedProfitDegration = vault.lockedProfitDegration();
        uint256 _lockedFundsRatio = (block.timestamp.sub(_vaultLastReport)) * _vaultLockedProfitDegration;
        // Only withdraw from Vault if it has not locked profits
        bool withdrawFromVault = _lockedFundsRatio >= 1e18; // DEGREDATION_COEFFICIENT (private constant in Vault)

        if(withdrawFromVault) {
            // calc amount to withdraw
            uint256 amountFromBuffer = amount.mul(MIN_HOLDINGS).div(MAX_BPS);
            // amount to withdraw is the amount being redeemed + an extra amount to keep the buffer (if needed)
            // The buffer after withdrawal has to take into account current withdrawal
            uint256 newBuffer = _requiredBuffer().sub(amountFromBuffer);
            uint256 newBalance = _balanceOfToken().sub(amountFromBuffer);

            // NOTE: withdraw only 90% as 10% will be taken from buffer
            amount = amount.sub(amountFromBuffer);

            // if the buffer is not enough, add the required amount
            amount = newBuffer > newBalance ? amount.add(newBuffer.sub(newBalance)) : amount;

            return _tokenToYShares(amount);
        } else {
            return 0;
        }
    }
}