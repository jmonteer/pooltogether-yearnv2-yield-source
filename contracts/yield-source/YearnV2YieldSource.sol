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
        require(IYVaultV2(_vault).activation() != uint256(0), "!vault not initialized");
        // Vaults from 0.3.2 to 0.3.4 have dips in shareValue
        require(!areEqualStrings(IYVaultV2(_vault).apiVersion(), "0.3.2"), "!vault not compatible");
        require(!areEqualStrings(IYVaultV2(_vault).apiVersion(), "0.3.3"), "!vault not compatible");
        require(!areEqualStrings(IYVaultV2(_vault).apiVersion(), "0.3.4"), "!vault not compatible");

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
        IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), _amount);

        _depositInVault();

        _mint(to, shares);
    }

    function redeemToken(uint256 amount) external override returns (uint256) {
        uint256 shares = _tokenToShares(amount);

        uint256 withdrawnAmount = _withdrawFromVault(amount);

        _burn(msg.sender, shares);

        IERC20Upgradeable(token).safeTransfer(msg.sender, withdrawnAmount);

        return withdrawnAmount;
    }

    function sponsor(uint256 amount) external {
        IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), amount);

        _depositInVault();

        emit Sponsored(msg.sender, amount);
    }

    // ************************ INTERNAL FUNCTIONS ************************

    function _depositInVault() internal returns (uint256) {
        // this will deposit full balance (for cases like not enough room in Vault)
        return IYVaultV2(vault).deposit();
    }

    function _withdrawFromVault(uint amount) internal returns (uint256) {
        uint256 yShares = _tokenToYShares(amount);

        require(yShares <= IYVaultV2(vault).maxAvailableShares(), "!not enough shares available for withdrawal");

        // we accept losses to avoid being locked in the Vault (if losses happened for some reason)
        return IYVaultV2(vault).withdraw(yShares, address(this), 10_000);
    }

    function _balanceOfYShares() internal view returns (uint256) {
        return IYVaultV2(vault).balanceOf(address(this));
    }

    function _pricePerYShare() internal view returns (uint256) {
        return IYVaultV2(vault).pricePerShare();
    }

    function _balanceOfToken() internal view returns (uint256) {
        return IERC20Upgradeable(token).balanceOf(address(this));
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

    function areEqualStrings(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(abi.encodePacked(a)) == keccak256(abi.encodePacked(b));
    }
}