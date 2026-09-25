// src/utils/certificate.js —— 存证证书导出（jsPDF）
//
// 演示脚本 D9：详情页「一键出证」。
// 证书内容全部取自链上数据，并包含核验方法说明 —— 让拿到证书的人能自行复验。
import jsPDF from 'jspdf'

/**
 * 生成并存证证书 PDF
 * @param {object} data
 *   workId, title, author, registeredAt, updatedAt, aigcRatio, workTypeLabel,
 *   versionCount, contentHash, tools[], disputed, contractAddress, chainName, explorer
 */
export function exportCertificate(data) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const M = 18 // 页边距

  // ---------- 抬头 ----------
  doc.setFillColor(47, 107, 255)
  doc.rect(0, 0, W, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.text('科研链证 · 存证证书', M, 15)
  doc.setFontSize(9)
  doc.text('Academic Proof — Blockchain-based Originality & AIGC Contribution Certificate', M, 23)

  // ---------- 证书编号与时间 ----------
  let y = 44
  doc.setTextColor(60, 60, 60)
  doc.setFontSize(10)
  doc.text(`证书编号：AP-${String(data.workId).padStart(6, '0')}`, M, y)
  doc.text(`导出时间：${new Date().toLocaleString('zh-CN')}`, W - M, y, { align: 'right' })

  y += 4
  doc.setDrawColor(220, 224, 230)
  doc.line(M, y, W - M, y)
  y += 12

  // ---------- 关键信息表 ----------
  const rows = [
    ['成果标题', data.title || '—'],
    ['成果编号', `#${data.workId}`],
    ['成果类型', data.workTypeLabel || '—'],
    ['登记作者', data.author || '—'],
    ['链上登记时间', data.registeredAt || '—'],
    ['最近更新时间', data.updatedAt || '—'],
    ['AIGC 介入比例', `${data.aigcRatio}%`],
    ['当前版本', `第 ${data.versionCount} 版`],
    ['争议状态', data.disputed ? '存在争议' : '无争议'],
    ['所在网络', data.chainName || '—'],
    ['合约地址', data.contractAddress || '—'],
  ]

  doc.setFontSize(10.5)
  rows.forEach(([k, v]) => {
    doc.setTextColor(120, 128, 140)
    doc.text(String(k), M, y)
    doc.setTextColor(20, 24, 40)
    const lines = doc.splitTextToSize(String(v), W - M * 2 - 42)
    doc.text(lines, M + 42, y)
    y += 7 * lines.length
  })

  // ---------- 内容指纹 ----------
  y += 4
  doc.setTextColor(120, 128, 140)
  doc.setFontSize(10.5)
  doc.text('SHA-256 内容指纹', M, y)
  y += 6
  doc.setFillColor(242, 244, 247)
  doc.rect(M, y - 4, W - M * 2, 12, 'F')
  doc.setTextColor(20, 24, 40)
  doc.setFontSize(8.5)
  doc.text(doc.splitTextToSize(data.contentHash || '—', W - M * 2 - 6), M + 3, y + 2)
  y += 18

  // ---------- AIGC 声明 ----------
  if (data.tools && data.tools.length) {
    doc.setTextColor(120, 128, 140)
    doc.setFontSize(10.5)
    doc.text('AIGC 贡献声明（已上链，不可篡改）', M, y)
    y += 6
    data.tools.forEach((t) => {
      const lines = doc.splitTextToSize(`· ${t}`, W - M * 2 - 6)
      doc.setTextColor(20, 24, 40)
      doc.setFontSize(9.5)
      doc.text(lines, M + 3, y)
      y += 5.5 * lines.length
    })
    y += 6
  }

  // ---------- 核验方法 ----------
  doc.setDrawColor(220, 224, 230)
  doc.line(M, y, W - M, y)
  y += 8
  doc.setTextColor(120, 128, 140)
  doc.setFontSize(10.5)
  doc.text('如何独立核验本证书', M, y)
  y += 6.5
  doc.setTextColor(60, 66, 80)
  doc.setFontSize(9.5)
  const steps = [
    '1. 取原始文件，在本地计算其 SHA-256 指纹（可用任何工具，无需联网）。',
    '2. 将计算结果与上方「内容指纹」逐字符比对：一致则说明文件未被修改。',
    '3. 在区块链浏览器中查询合约地址与成果编号，可看到登记时间与作者地址。',
    '4. 任何一处不一致，都说明该文件与链上记录不符。',
  ]
  steps.forEach((s) => {
    const lines = doc.splitTextToSize(s, W - M * 2)
    doc.text(lines, M, y)
    y += 5.6 * lines.length
  })

  y += 4
  doc.setFontSize(8.5)
  doc.setTextColor(140, 146, 158)
  doc.text(
    doc.splitTextToSize(
      '说明：本证书由链上数据生成。证书本身不是凭据，链上指纹才是唯一凭据；' +
        '任何持有原始文件的人都能独立复现上述核验结论，无需信任签发方。',
      W - M * 2
    ),
    M,
    y
  )

  // ---------- 页脚 ----------
  doc.setFontSize(8)
  doc.setTextColor(160, 166, 178)
  doc.text(`科研链证 · ${data.chainName || ''}`, M, 285)
  if (data.explorer) {
    doc.text(`${data.explorer}/address/${data.contractAddress}`, W - M, 285, { align: 'right' })
  }

  const filename = `科研链证-存证证书-${data.workId}-${(data.title || 'untitled').slice(0, 20)}.pdf`
  doc.save(filename)
  return filename
}
