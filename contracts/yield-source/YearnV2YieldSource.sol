// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "../interfaces/VaultAPI.sol";
import "../interfaces/IYieldSource.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

contract YearnV2YieldSource is IYieldSource, ERC20Upgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeMathUpgradeable for uint;
    
    address public vault;
    address internal token; 

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
        require(VaultAPI(_vault).token() == _token, "!incorrect vault");

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

    function supplyTokenTo(uint256 amount, address to) override external {
        // bring tokens to the Custom Yield Source 
        IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), amount);
        
        uint256 shares = _tokenToShares(amount);
        _depositInVault(amount);
        _mint(to, shares);
    }

    function redeemToken(uint256 amount) external override returns (uint256) {
        uint256 shares = _tokenToShares(amount);
        
        uint256 withdrawnAmount = _withdrawFromVault(shares);
        _burn(msg.sender, shares);
        IERC20Upgradeable(token).safeTransfer(msg.sender, withdrawnAmount);

        return withdrawnAmount;
    }

    function sponsor(uint256 amount) external {
        _depositInVault(amount);
        emit Sponsored(msg.sender, amount);
    }

    // ************************ INTERNAL FUNCTIONS ************************

    function _depositInVault(uint amount) internal returns (uint256) {
        // check available room for deposits in Vault (some have a deposit limit)
        uint availableToDeposit = VaultAPI(vault).availableDepositLimit(); // returns amount in underlying token        
        require(availableToDeposit >= amount, "!deposit amount too high");
        
        return VaultAPI(vault).deposit(amount);
    }

    function _withdrawFromVault(uint shares) internal returns (uint256) {
        uint256 ySharesToWithdraw = _sharesToYShares(shares);
        require(ySharesToWithdraw <= VaultAPI(vault).maxAvailableShares(), "!not enough shares available for withdrawal");

        return VaultAPI(vault).withdraw(ySharesToWithdraw);
    }

    function _balanceOfYShares() internal view returns (uint256) {
        return VaultAPI(vault).balanceOf(address(this));
    }

    function _pricePerYShare() internal view returns (uint256) {
        return VaultAPI(vault).pricePerShare();
    }

    // ************************  FUNCTIONS ************************

    function _tokenToYShares(uint256 tokens) internal view returns (uint256) {
        return tokens.mul(1e18).div(_pricePerYShare());
    }

    function _ySharesToToken(uint256 yShares) internal view returns (uint256) {
        return yShares.mul(_pricePerYShare()).div(1e18);
    }

    function _sharesToYShares(uint shares) internal view returns (uint256 yShares) {
        if(totalSupply() == 0) {
            yShares = shares;
        } else {
            uint256 totalYShares = _balanceOfYShares();
            yShares = shares.mul(totalYShares).div(totalSupply());
        }
    }

    function _tokenToShares(uint256 tokens) internal view returns (uint256 shares) {
        if(totalSupply() == 0) {
            shares = _tokenToYShares(tokens);
        } else {
            uint256 _tokensInVault = _ySharesToToken(_balanceOfYShares());
            shares = tokens.mul(totalSupply()).div(_tokensInVault);
        }
    }

    function _sharesToToken(uint256 shares) internal view returns (uint256 tokens) {
        if(totalSupply() == 0) {
            tokens = _ySharesToToken(shares);
        } else {
            uint256 _tokensInVault = _ySharesToToken(_balanceOfYShares());
            tokens = shares.mul(_tokensInVault).div(totalSupply());
        }
    }
}