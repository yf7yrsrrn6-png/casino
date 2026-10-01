import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";
import { subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";
import path from "path";

const SOLC_VERSION = "0.8.28";

// Якщо binaries.soliditylang.org недоступний (корпоративний проксі/фаєрвол),
// встановіть USE_SOLCJS=true — буде використано solc-js з npm (пакет `solc`).
if (process.env.USE_SOLCJS === "true") {
  subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args: { solcVersion: string }, _hre, runSuper) => {
    if (args.solcVersion !== SOLC_VERSION) return runSuper();
    const compilerPath = path.join(__dirname, "node_modules", "solc", "soljson.js");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const longVersion: string = require("solc/package.json").version;
    return { compilerPath, isSolcJs: true, version: args.solcVersion, longVersion };
  });
}

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: SOLC_VERSION,
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
  },
  networks: {
    // E2E-тести запускають локальний вузол з chainId 97, щоб збігатися з BSC Testnet.
    hardhat: { chainId: Number(process.env.HARDHAT_CHAIN_ID || 31337) },
    // Лише тестова мережа. Mainnet свідомо не налаштовано.
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
      chainId: 97,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: process.env.BSCSCAN_API_KEY || "",
  },
  gasReporter: { enabled: process.env.REPORT_GAS === "true" },
};

export default config;
