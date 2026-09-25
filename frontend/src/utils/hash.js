// src/utils/hash.js
//
// ⭐ 本项目的核心技术亮点所在 ⭐
//
// 文件**永远不离开用户的浏览器**：用 Web Crypto API 在本地计算 SHA-256 指纹，
// 只有这 32 字节的指纹会写到链上。原文不上传任何服务器 ——
// 这同时解决了「隐私」与「信任」两个问题：存证平台自己都拿不到原文，自然无法作恶。

/// 计算文件的 SHA-256 指纹，返回 0x 前缀的 32 字节十六进制字符串
/// 与 Solidity 的 bytes32 完全对应，也与链上 ethers.sha256() 结果一致
export async function sha256File(file) {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return '0x' + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/// 计算字符串的 SHA-256（用于演示与测试）
export async function sha256Text(text) {
  const buf = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return '0x' + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/// 带耗时统计的版本 —— 演示视频 D1 需要显示「本地计算耗时 xx ms」
export async function sha256FileTimed(file) {
  const start = performance.now()
  const hash = await sha256File(file)
  const costMs = performance.now() - start
  return { hash, costMs: Math.round(costMs * 10) / 10 }
}

/// 人类可读的文件大小
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`
}

/// 指纹缩略显示：0x7f3a9c...a1b2
export function shortHash(hash, head = 10, tail = 6) {
  if (!hash || hash.length <= head + tail + 3) return hash || ''
  return `${hash.slice(0, head)}...${hash.slice(-tail)}`
}
