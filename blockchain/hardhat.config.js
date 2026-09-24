require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("dotenv").config();

const SEPOLIA_RPC_URL =
  process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

// 只有存在合法私钥时才注入账户，否则 hardhat 会因空私钥报错
const sepoliaAccounts = /^0x[0-9a-fA-F]{64}$/.test(PRIVATE_KEY) ? [PRIVATE_KEY] : [];

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // 与 Sepolia 当前 EVM 版本对齐（Prague 亦兼容；如需 FISCO 场景可下调）
      evmVersion: "cancun",
    },
  },

  paths: {
    sources: "./src/contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },

  networks: {
    // 本地链：hardhat node 用，测试与预演都在这里跑
    hardhat: {
      chainId: 31337,
      // 打开后可在 console.log 里看到每次调用的 gas 与返回值
      // loggingEnabled: true,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // 演示链：前端连它，部署到 Vercel 给评委在线试用
    sepolia: {
      url: SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: sepoliaAccounts,
    },
    // 说明：曾尝试配置 sepolia_fork（本地分叉真实测试网）来离线复现真实网络的报错行为，
    // 但本版 Hardhat（2.29.1 / EDR 0.3.8）对具名网络无法启用 forking
    // （hardhat_setBalance / hardhat_metadata 均返回 Method not found），故不保留该配置。
    // 需要验证真实网络行为时，直接跑：--network sepolia
  },

  etherscan: {
    apiKey: { sepolia: ETHERSCAN_API_KEY },
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    // 不配 COINMARKETCAP_API_KEY 时只输出 gas 用量，不输出美元估值
    excludeContracts: [],
  },

  mocha: {
    timeout: 60000,
  },
};
