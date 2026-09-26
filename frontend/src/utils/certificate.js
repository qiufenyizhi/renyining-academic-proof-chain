// src/utils/certificate.js —— 存证证书导出
//
// 演示脚本 D9：详情页「一键出证」。
// 证书内容全部取自链上数据，并包含核验方法说明 —— 让拿到证书的人能自行复验。
//
// ─────────────────────────────────────────────────────────────────────
// 为什么用「HTML + 浏览器打印」而不是 jsPDF 直接生成 PDF
//
// 2026-09-26 实测发现：jsPDF 默认使用 PDF 标准字体（Helvetica 等），
// 这是 WinAnsi 编码、仅含约 200 个西文字形的字体，【完全不含中文字形】。
// 导出的 PDF 中文字全部乱码（经检查：无 FontFile2 内嵌字体、无 ToUnicode 映射表）。
//
// 解决方案对比：
//   A. 给 jsPDF 内嵌中文字体 → 需 5-15MB 字体文件（或用 fonttools 做子集化，需 Python）
//   B. 改用浏览器打印 → 调用系统字体（微软雅黑等），中文渲染完美，
//      产物是【可搜索的矢量文字】，且零额外依赖、零包体积增长
//
// 本实现选择 B。代价是需用户在打印对话框中点一次「另存为 PDF」。
// ─────────────────────────────────────────────────────────────────────

/// HTML 转义，防止链上标题等用户可控字符串造成 XSS
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/// 生成证书的文档标题 —— 同时作为「另存为 PDF」时的默认文件名
///
/// 命名规则：科研链证-存证证书-{workId}-{标题}
/// 例：科研链证-存证证书-1-"思想道德与法治"课社会实践报告书202503
///
/// 三点处理：
///   1. 剔除 Windows 文件名非法字符 \\ / : * ? " < > |，替换为下划线
///   2. 标题超过 MAX_TITLE_LEN 字符时截断并加省略号（避免文件名过长）
///   3. 标题为空时省略该段（不留多余的连字符）
const MAX_TITLE_LEN = 40

function buildDocTitle(workId, title) {
  const base = `科研链证-存证证书-${workId}`

  let t = String(title ?? '')
    .replace(/[\\/:*?"<>|]/g, '_') // 非法字符
    .replace(/\s+/g, ' ') // 连续空白压成一个空格
    .trim()

  if (!t) return base

  if (t.length > MAX_TITLE_LEN) {
    t = t.slice(0, MAX_TITLE_LEN) + '…'
  }

  return `${base}-${t}`
}

/** 供测试与调试：查看某个成果会生成什么文件名 */
export { buildDocTitle }

function buildCertificateHtml(data) {
  const rows = [
    ['成果标题', data.title],
    ['成果编号', `#${data.workId}`],
    ['成果类型', data.workTypeLabel],
    ['登记作者', data.author],
    ['链上登记时间', data.registeredAt],
    ['最近更新时间', data.updatedAt],
    ['AIGC 介入比例', `${data.aigcRatio}%`],
    ['当前版本', `第 ${data.versionCount} 版`],
    ['争议状态', data.disputed ? '存在争议' : '无争议'],
    ['所在网络', data.chainName],
    ['合约地址', data.contractAddress],
  ]

  const infoRows = rows
    .map(
      ([k, v]) =>
        `<tr><th>${esc(k)}</th><td>${esc(v ?? '—')}</td></tr>`
    )
    .join('')

  // 文件名：浏览器「另存为 PDF」默认取 <title> 作为文件名。
  // 命名规则：科研链证-存证证书-{workId}-{标题}
  // 标题可能很长，需限制长度并剔除文件名非法字符（Windows 不允许 \ / : * ? " < > |）。
  const docTitle = buildDocTitle(data.workId, data.title)

  const toolsBlock = data.tools && data.tools.length
    ? `<h2>三、AIGC 贡献声明（已上链，不可篡改）</h2>
       <ul class="tools">${data.tools.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
    : ''

  // 章节编号随 AIGC 声明是否存在而调整，避免出现「三、」跳号
  const verifyNo = data.tools && data.tools.length ? '四' : '三'

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<title>${esc(docTitle)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB",
                 "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;
    color: #101828; font-size: 13px; line-height: 1.7; margin: 0;
  }
  .head {
    background: #2f6bff; color: #fff; padding: 16px 20px; border-radius: 6px;
    margin-bottom: 18px;
  }
  .head h1 { margin: 0 0 4px; font-size: 21px; letter-spacing: 1px; }
  .head p { margin: 0; font-size: 10.5px; opacity: .9; }
  .meta {
    display: flex; justify-content: space-between; font-size: 11.5px;
    color: #475467; padding-bottom: 8px; border-bottom: 1px solid #dfe3e8;
    margin-bottom: 16px;
  }
  h2 {
    font-size: 13.5px; margin: 18px 0 8px; padding-left: 9px;
    border-left: 3px solid #2f6bff; color: #101828;
  }
  table { width: 100%; border-collapse: collapse; }
  th, td {
    text-align: left; padding: 6px 10px; font-size: 12px;
    border-bottom: 1px solid #eef0f3; vertical-align: top;
  }
  th { color: #667085; font-weight: 500; width: 108px; white-space: nowrap; }
  .mono {
    font-family: Consolas, "Courier New", monospace;
    font-size: 11.5px; word-break: break-all;
  }
  .hash {
    background: #f2f4f7; border: 1px solid #e4e7ec; border-radius: 5px;
    padding: 9px 11px; margin-top: 4px;
  }
  ul.tools { margin: 4px 0 0; padding-left: 20px; }
  ul.tools li { font-size: 12px; }
  ol.steps { margin: 4px 0 0; padding-left: 20px; font-size: 12px; }
  ol.steps li { margin-bottom: 5px; }
  .note {
    margin-top: 16px; padding: 10px 12px; background: #f8fafc;
    border: 1px solid #e4e7ec; border-radius: 5px;
    font-size: 11px; color: #475467;
  }
  .foot {
    margin-top: 22px; padding-top: 10px; border-top: 1px solid #dfe3e8;
    font-size: 10.5px; color: #667085;
    display: flex; justify-content: space-between;
  }
  .tip {
    background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412;
    padding: 10px 13px; border-radius: 5px; font-size: 12px;
    margin-bottom: 16px;
  }
  @media print { .tip { display: none; } }
  .fname { margin-top: 6px; }
  .fname code {
    font-family: Consolas, "Courier New", monospace;
    background: #fff; padding: 2px 6px; border-radius: 4px;
    border: 1px solid #fed7aa; word-break: break-all;
  }
</style>
</head>
<body>
  <div class="tip">
    <b>请在打印对话框中选择「另存为 PDF」</b>，并关闭「页眉和页脚」以获得干净的证书。
    另存时的默认文件名即为下方所示，可在对话框中自行修改。
    <div class="fname">建议文件名：<code>${esc(docTitle)}.pdf</code></div>
  </div>

  <div class="head">
    <h1>科研链证 · 存证证书</h1>
    <p>Academic Proof — Blockchain-based Originality &amp; AIGC Contribution Certificate</p>
  </div>

  <div class="meta">
    <span>证书编号：AP-${esc(String(data.workId).padStart(6, '0'))}</span>
    <span>导出时间：${esc(new Date().toLocaleString('zh-CN'))}</span>
  </div>

  <h2>一、成果信息</h2>
  <table>${infoRows}</table>

  <h2>二、内容指纹（SHA-256）</h2>
  <div class="hash mono">${esc(data.contentHash ?? '—')}</div>

  ${toolsBlock}

  <h2>${verifyNo}、如何独立核验本证书</h2>
  <ol class="steps">
    <li>取原始文件，在本地计算其 SHA-256 指纹（可用任何工具，无需联网）。</li>
    <li>将计算结果与上方「内容指纹」逐字符比对：一致则说明文件未被修改。</li>
    <li>在区块链浏览器中查询合约地址与成果编号，可看到登记时间与作者地址。</li>
    <li>任何一处不一致，都说明该文件与链上记录不符。</li>
  </ol>

  <div class="note">
    说明：本证书由链上数据生成。证书本身不是凭据，<b>链上指纹才是唯一凭据</b>；
    任何持有原始文件的人都能独立复现上述核验结论，无需信任签发方。
  </div>

  <div class="foot">
    <span>科研链证 · ${esc(data.chainName ?? '')}</span>
    <span class="mono">${
      data.explorer ? esc(`${data.explorer}/address/${data.contractAddress}`) : esc(data.contractAddress ?? '')
    }</span>
  </div>

  <script>
    // 等字体与布局就绪后再唤起打印，避免打印出未排版完成的内容
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 350);
    });
  <\/script>
</body>
</html>`
}

/**
 * 导出存证证书 —— 打开浏览器打印对话框，由用户「另存为 PDF」
 * @param {object} data 见 buildCertificateHtml
 * @returns {boolean} 是否成功打开打印页面
 */
export function exportCertificate(data) {
  const html = buildCertificateHtml(data)

  // 用 Blob URL 而非 document.write：避免污染当前页面、也便于被浏览器识别为独立文档
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const win = window.open(url, '_blank')
  if (!win) {
    URL.revokeObjectURL(url)
    return false
  }

  // 打印窗口关闭后回收 Blob URL，避免内存泄漏
  const timer = setInterval(() => {
    if (win.closed) {
      clearInterval(timer)
      URL.revokeObjectURL(url)
    }
  }, 1000)

  return true
}

/** 供测试与调试：直接拿到证书 HTML 字符串 */
export { buildCertificateHtml }
