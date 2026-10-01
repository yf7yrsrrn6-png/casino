// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev ЛИШЕ ДЛЯ ТЕСТІВ. Токен, що при transfer намагається повторно викликати ескроу.
contract ReentrantToken is ERC20 {
    address public victim;
    bytes public payload;

    constructor() ERC20("Evil", "EVL") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(address target_, bytes calldata payload_) external {
        victim = target_;
        payload = payload_;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (victim != address(0) && (from == victim || to == victim)) {
            (bool ok, bytes memory ret) = victim.call(payload);
            if (!ok) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
    }
}
