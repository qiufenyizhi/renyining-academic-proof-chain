// src/contracts/abi.js —— AcademicProof 合约 ABI
// 与 blockchain/src/contracts/AcademicProof.sol 严格对应（编译产物提取）
export const CONTRACT_ABI = [
  // ---------------- 只读 ----------------
  'function admin() view returns (address)',
  'function workCount() view returns (uint256)',
  'function hashToWorkId(bytes32) view returns (uint256)',
  'function versionHash(uint256, uint32) view returns (bytes32)',
  'function getWork(uint256) view returns (tuple(bytes32 contentHash, address author, uint64 registeredAt, uint64 updatedAt, uint8 aigcRatio, uint8 workType, string title, string metaURI, bool disputed, uint32 versionCount))',
  'function getVersionHash(uint256 _workId, uint32 _version) view returns (bytes32)',
  'function getAigcTools(uint256 _workId) view returns (string[])',
  'function getWorkCountOf(address _author) view returns (uint256)',

  // ---------------- 核验（演示核心）----------------
  'function verifyWork(bytes32 _contentHash) view returns (bool exists, uint256 workId, address author, uint64 registeredAt, uint8 aigcRatio, string title)',

  // ---------------- 写入 ----------------
  'function registerWork(bytes32 _contentHash, string _title, uint8 _type, uint8 _aigcRatio, string _metaURI) returns (uint256 workId)',
  'function addVersion(uint256 _workId, bytes32 _contentHash, uint8 _aigcRatio)',
  'function declareAIGC(uint256 _workId, uint8 _ratio, string _tools)',
  'function raiseDispute(uint256 _workId, string _reason)',

  // ---------------- 事件 ----------------
  'event WorkRegistered(uint256 indexed workId, bytes32 indexed contentHash, address indexed author, uint64 timestamp, string title)',
  'event VersionAdded(uint256 indexed workId, uint32 version, bytes32 contentHash, uint8 aigcRatio)',
  'event AIGCDeclared(uint256 indexed workId, uint8 ratio, string tools)',
  'event DisputeRaised(uint256 indexed workId, address indexed raiser, string reason)',

  // ---------------- 自定义错误（前端友好提示用）----------------
  'error AlreadyRegistered()',
  'error NotAuthor()',
  'error InvalidRatio()',
  'error NotFound()',
  'error ZeroHash()',
  'error SameHash()',
  'error EmptyTitle()',
]

/// 成果类型枚举，与合约 enum WorkType 一致
export const WORK_TYPE = {
  Paper: 0,
  Code: 1,
  Dataset: 2,
  Other: 3,
}

export const WORK_TYPE_LABEL = {
  0: '论文',
  1: '代码',
  2: '数据集',
  3: '其他',
}

export const WORK_TYPE_TAG = {
  0: '',
  1: 'success',
  2: 'warning',
  3: 'info',
}

/// 自定义错误 → 中文提示（答辩演示时比英文报错友好得多）
export const ERROR_MESSAGE = {
  AlreadyRegistered: '该文件指纹已被登记过。同一份文件不能重复存证；若内容有更新，请使用「版本追加」。',
  NotAuthor: '只有该成果的登记人才能执行此操作。',
  InvalidRatio: 'AIGC 介入比例必须在 0 - 100 之间。',
  NotFound: '未找到该成果，请确认成果编号是否正确。',
  ZeroHash: '文件指纹无效（全零），无法存证。',
  SameHash: '新版本指纹与当前版本完全相同，无需追加。',
  EmptyTitle: '成果标题不能为空。',
}

/// 从任意异常中解析出合约自定义错误名
/// 参考踩坑记录：真实网络只给 "execution reverted"，错误名只在 e.data 选择器里
export function parseContractError(err) {
  const msg = String(err?.shortMessage || err?.message || err || '')

  // 1) 钱包主动拒绝
  if (/user rejected|User denied|ACTION_REJECTED/i.test(msg) || err?.code === 'ACTION_REJECTED') {
    return '你取消了这笔交易。'
  }

  // 2) 余额不足
  if (/insufficient funds/i.test(msg)) {
    return '账户余额不足，无法支付 gas 费。请在 MetaMask 中确认已切换到 Sepolia 并有测试币。'
  }

  // 3) 常见的 ethers 错误
  if (/could not detect network|failed to fetch|network changed/i.test(msg)) {
    return '无法连接区块链网络。请检查网络连接，或稍后重试。'
  }

  // 4) 自定义错误名（部分节点会写进 message）
  const m = msg.match(/custom error '([A-Za-z0-9_]+)\(/)
  if (m && ERROR_MESSAGE[m[1]]) return ERROR_MESSAGE[m[1]]

  // 5) 兜底：把原始信息附上，便于排查（不要静默吞掉）
  return `操作失败：${msg.slice(0, 180)}`
}
