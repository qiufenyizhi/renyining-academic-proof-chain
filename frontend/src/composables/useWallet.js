// src/composables/useWallet.js —— 钱包连接与合约实例（全局单例状态）
//
// 设计要点：钱包地址即身份，不做注册/登录系统。
// ethers.js 统一使用 v6 API（与 v5 差异极大，切勿混用）。
import { ref, computed, shallowRef } from 'vue'
import { BrowserProvider, Contract, JsonRpcProvider, formatEther } from 'ethers'
import { CONTRACT_ABI } from '@/contracts/abi.js'
import { CONTRACT_ADDRESS, CHAIN_ID, CURRENT_CHAIN } from '@/contracts/config.js'

// ---- 全局单例状态 ----
const provider = shallowRef(null) // BrowserProvider（只读查询）
const signer = shallowRef(null) // 已连接的签名者（写交易）
const contract = shallowRef(null) // 可写合约实例
const readContract = shallowRef(null) // 只读合约实例（未连接钱包时也能核验）
const address = ref('')
const chainId = ref(0)
const balance = ref('0')
const connecting = ref(false)

// 只读合约：不依赖钱包，任何人打开核验页都能查询链上数据
function ensureReadContract() {
  if (!readContract.value) {
    const rpc = new JsonRpcProvider(CURRENT_CHAIN.rpcUrl, CHAIN_ID)
    readContract.value = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, rpc)
  }
  return readContract.value
}

export function useWallet() {
  const isConnected = computed(() => !!address.value)
  const isWrongChain = computed(() => isConnected.value && chainId.value !== CHAIN_ID)
  const shortAddress = computed(() =>
    address.value ? `${address.value.slice(0, 6)}...${address.value.slice(-4)}` : ''
  )

  /// 连接 MetaMask
  async function connect() {
    if (!window.ethereum) {
      throw new Error('未检测到 MetaMask。请先安装浏览器扩展：https://metamask.io/download/')
    }
    connecting.value = true
    try {
      const browserProvider = new BrowserProvider(window.ethereum)
      await browserProvider.send('eth_requestAccounts', [])
      const s = await browserProvider.getSigner()
      const network = await browserProvider.getNetwork()

      provider.value = browserProvider
      signer.value = s
      address.value = await s.getAddress()
      chainId.value = Number(network.chainId)
      contract.value = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, s)
      await refreshBalance()

      // 监听账户与网络变化，避免用户切换后前端状态错乱
      bindWalletEvents()
      return address.value
    } finally {
      connecting.value = false
    }
  }

  let bound = false
  function bindWalletEvents() {
    if (bound || !window.ethereum) return
    bound = true
    window.ethereum.on('accountsChanged', async (accounts) => {
      if (!accounts || accounts.length === 0) {
        disconnect()
      } else {
        // 重新连接以获得新的 signer
        await connect()
      }
    })
    window.ethereum.on('chainChanged', () => {
      // 网络切换后整页刷新最稳妥，避免残留旧实例
      window.location.reload()
    })
  }

  function disconnect() {
    provider.value = null
    signer.value = null
    contract.value = null
    address.value = ''
    balance.value = '0'
  }

  async function refreshBalance() {
    if (!provider.value || !address.value) return
    const bal = await provider.value.getBalance(address.value)
    balance.value = formatEther(bal)
  }

  /// 请求钱包切换到本项目配置的链
  async function switchChain() {
    if (!window.ethereum) throw new Error('未检测到 MetaMask')
    const hexChainId = '0x' + CHAIN_ID.toString(16)
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId }],
      })
    } catch (err) {
      // 4902 = 钱包里还没有这个网络，尝试添加
      if (err.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: hexChainId,
              chainName: CURRENT_CHAIN.name,
              nativeCurrency: {
                name: CURRENT_CHAIN.currency,
                symbol: CURRENT_CHAIN.currency,
                decimals: 18,
              },
              rpcUrls: [CURRENT_CHAIN.rpcUrl],
              blockExplorerUrls: CURRENT_CHAIN.explorer ? [CURRENT_CHAIN.explorer] : undefined,
            },
          ],
        })
      } else {
        throw err
      }
    }
  }

  /// 取可写合约；未连接则抛出清晰错误
  function requireContract() {
    if (!contract.value) {
      throw new Error('请先连接钱包，再执行上链操作。')
    }
    return contract.value
  }

  return {
    // 状态
    address,
    chainId,
    balance,
    connecting,
    contract,
    isConnected,
    isWrongChain,
    shortAddress,
    // 方法
    connect,
    disconnect,
    switchChain,
    refreshBalance,
    requireContract,
    ensureReadContract,
  }
}
