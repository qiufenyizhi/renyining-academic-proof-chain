// src/contracts/config.js —— 链与合约配置
//
// 合约地址的唯一权威来源是 blockchain/deployments/sepolia.json
// 部署脚本每次运行都会生成新地址，请以该文件为准，不要手工抄。
// 可用 .env.local 覆盖（Vite 约定：VITE_ 前缀才会暴露给前端）：
//   VITE_CONTRACT_ADDRESS=0x...
//   VITE_CHAIN_ID=11155111

const DEPLOYED_ADDRESS = '0x0Caf124D677DF3250a6cc37772bcc9E0a1de125E'

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || DEPLOYED_ADDRESS

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 11155111)

/// 支持的链（本地 Hardhat 用于日常开发，Sepolia 用于演示与评委试用）
export const CHAINS = {
  31337: {
    id: 31337,
    name: 'Hardhat 本地链',
    shortName: '本地链',
    rpcUrl: 'http://127.0.0.1:8545',
    explorer: '',
    currency: 'ETH',
    isDev: true,
  },
  11155111: {
    id: 11155111,
    name: 'Sepolia 测试网',
    shortName: 'Sepolia',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorer: 'https://sepolia.etherscan.io',
    currency: 'SepoliaETH',
    isDev: false,
  },
}

export const CURRENT_CHAIN = CHAINS[CHAIN_ID] || CHAINS[11155111]

/// 拼出交易/地址的区块浏览器链接
export function explorerTxUrl(txHash) {
  return CURRENT_CHAIN.explorer ? `${CURRENT_CHAIN.explorer}/tx/${txHash}` : ''
}

export function explorerAddressUrl(address) {
  return CURRENT_CHAIN.explorer ? `${CURRENT_CHAIN.explorer}/address/${address}` : ''
}

/// MetaMask 中切换网络用的参数（十六进制 chainId 是钱包的硬性要求）
export const WALLET_CHAIN_PARAMS = {
  chainId: '0x' + CHAIN_ID.toString(16),
  chainName: CURRENT_CHAIN.name,
  nativeCurrency: { name: CURRENT_CHAIN.currency, symbol: CURRENT_CHAIN.currency, decimals: 18 },
  rpcUrls: [CURRENT_CHAIN.rpcUrl],
  blockExplorerUrls: CURRENT_CHAIN.explorer ? [CURRENT_CHAIN.explorer] : undefined,
}
