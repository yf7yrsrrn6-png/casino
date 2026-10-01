// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev ЛИШЕ ДЛЯ ЛОКАЛЬНИХ E2E. Мінімальний Multicall3 (aggregate3, getEthBalance), який у справжніх
///      мережах (зокрема BSC Testnet) уже задеплоєно за адресою 0xcA11bde05977b3631167028862bE2a173976CA11.
///      На локальному вузлі e2e-стенд розміщує цей код за тією ж адресою (hardhat_setCode).
contract Multicall3 {
    struct Call3 {
        address target;
        bool allowFailure;
        bytes callData;
    }

    struct Result {
        bool success;
        bytes returnData;
    }

    function aggregate3(Call3[] calldata calls) external payable returns (Result[] memory returnData) {
        returnData = new Result[](calls.length);
        for (uint256 i = 0; i < calls.length; i++) {
            (bool ok, bytes memory ret) = calls[i].target.call(calls[i].callData);
            require(ok || calls[i].allowFailure, "Multicall3: call failed");
            returnData[i] = Result(ok, ret);
        }
    }

    function getEthBalance(address addr) external view returns (uint256) {
        return addr.balance;
    }

    function getCurrentBlockTimestamp() external view returns (uint256) {
        return block.timestamp;
    }

    function getBlockNumber() external view returns (uint256) {
        return block.number;
    }
}
