// src/utils/format.js —— 展示格式化工具

/// 地址缩略：0x1a2b...3c4d
export function shortAddress(addr, head = 6, tail = 4) {
  if (!addr) return ''
  return `${addr.slice(0, head)}...${addr.slice(-tail)}`
}

/// 链上时间戳（秒）→ 本地可读时间
/// 演示脚本 D3/D5 要求把链上时间格式化成观众能看懂的样子
export function formatTimestamp(ts) {
  if (!ts) return '—'
  const n = Number(ts)
  if (!n) return '—'
  const d = new Date(n * 1000)
  const pad = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`
}

/// 相对时间描述（用于时间轴）
export function relativeTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - Number(ts) * 1000
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  return formatTimestamp(ts).slice(0, 10)
}

/// AIGC 比例 → 颜色语义（0 完全人工，越高 AI 参与越多）
export function aigcLevel(ratio) {
  const r = Number(ratio) || 0
  if (r === 0) return { type: 'info', text: '完全人工' }
  if (r <= 30) return { type: 'success', text: '轻度辅助' }
  if (r <= 60) return { type: 'warning', text: '中度参与' }
  return { type: 'danger', text: '高度依赖' }
}
