// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "../interfaces/VaultAPI.sol";
import "../interfaces/IYieldSource.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract YieldSourceYearnV2 is IYieldSource, ERC20 {
    using SafeERC20 for IERC20;
    using SafeMath for uint;
    
    address public immutable vault;
    address private immutable token; 

    constructor(address _token, address _vault, string memory _name, string memory _symbol) public ERC20(_name, _symbol){
        vault = _vault;
        token = _token;

        // check that the vault uses the specified underlying token 
        require(VaultAPI(_vault).token() == _token, "!incorrect vault");

        IERC20(_token).approve(_vault, type(uint256).max);
    }

    function depositToken() external view override returns (address) {
        return token;
    }

    function balanceOfToken(address addr) external override  returns (uint256) {
        return _sharesToToken(balanceOf(addr));
    }

    function supplyTokenTo(uint256 amount, address to) override external {
        uint256 shares = _tokenToShares(amount);
        _depositInVault(amount);
        _mint(to, shares);
    }

    function redeemToken(uint256 amount) external override returns (uint256) {
        uint256 shares = _tokenToShares(amount);
        
        _burn(msg.sender, shares);
        uint256 ySharesToWithdraw = _sharesToYShares(shares);
        require(ySharesToWithdraw <= VaultAPI(vault).maxAvailableShares(), "!not enough shares available for withdrawal");
        
        uint256 withdrawnAmount = VaultAPI(vault).withdraw(ySharesToWithdraw);
        IERC20(token).safeTransfer(msg.sender, withdrawnAmount);
        return withdrawnAmount;
    }

    event Sponsored(
        address indexed user,
        uint256 amount
    );

    function sponsor(uint256 amount) external {
        _depositInVault(amount);
        emit Sponsored(msg.sender, amount);
    }

    function _balanceOfYShares() internal view returns (uint256) {
        return VaultAPI(vault).balanceOf(address(this));
    }

    function _pricePerYShare() internal view returns (uint256) {
        return VaultAPI(vault).pricePerShare();
    }

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

    function _depositInVault(uint amount) internal returns (uint256) {
        // bring tokens to the Custom Yield Source 
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // check available room for deposits in Vault (some have a deposit limit)
        uint availableToDeposit = VaultAPI(vault).availableDepositLimit(); // returns amount in underlying token        
        require(availableToDeposit >= amount, "!deposit amount too high");
        
        return VaultAPI(vault).deposit(amount);
    }
}