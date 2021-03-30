// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.6.0 <0.7.0;

import "./YearnV2YieldSource.sol";
import "../external/openzeppelin/ProxyFactory.sol";

/// @title YearnV2 Yield Source Proxy Factory
/// @notice Minimal proxy pattern for creating new aToken Yield Sources
contract YearnV2YieldSourceProxyFactory is ProxyFactory {

  /// @notice Contract template for deploying proxied aToken Yield Sources
  YearnV2YieldSource public instance;

  /// @notice Initializes the Factory with an instance of the aToken Yield Source
  constructor () public {
    instance = new YearnV2YieldSource();
  }

  /// @notice Creates a new YearnV2 Yield Source as a proxy of the template instance
  /// @param _vault Vault address
  /// @param _token Underlying Token address
  /// @return A reference to the new proxied YearnV2 Yield Source
  function create(
    address _vault,
    address _token
  ) public returns (YearnV2YieldSource) {
    YearnV2YieldSource yearnV2YieldSource = YearnV2YieldSource(deployMinimal(address(instance), ""));

    yearnV2YieldSource.initialize(_vault, _token);
    // yearnV2YieldSource.transferOwnership(_owner);

    return yearnV2YieldSource;
  }
}
