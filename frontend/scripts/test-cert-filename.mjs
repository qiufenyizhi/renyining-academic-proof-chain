// scripts/test-cert-filename.mjs —— 验证证书文件名的生成规则
//
// 用法（在 frontend/ 目录下）：
//   node ../blockchain/scripts/../scripts/... 不用记，直接看本文件头部注释
//   实际用法：node scripts/test-cert-filename.mjs
//
// 背景：浏览器「另存为 PDF」默认取 HTML 的 <title> 作为文件名，
// 因此证书文件名由 buildDocTitle() 决定，需要单独验证。

// 直接从源码里提取 buildDocTitle 的实现来测（避免为了测试引入构建步骤）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcPath = path.join(__dirname, '..', 'src', 'utils', 'certificate.js')
const src = fs.readFileSync(srcPath, 'utf8')

// 抽出 MAX_TITLE_LEN 与 buildDocTitle 函数体
const maxLen = Number(src.match(/const MAX_TITLE_LEN = (\d+)/)[1])
const fnMatch = src.match(/function buildDocTitle\(workId, title\) \{([\s\S]*?)\n\}/)
if (!fnMatch) {
  console.error('❌ 未能从 certificate.js 中提取 buildDocTitle')
  process.exit(1)
}

// 用 Function 构造出可调用的函数（沙箱内只有这一个纯函数，无副作用）
const buildDocTitle = new Function('workId', 'title', `
  const MAX_TITLE_LEN = ${maxLen};
  ${fnMatch[1]}
`)

console.log(`MAX_TITLE_LEN = ${maxLen}\n`)
console.log('══════════ 文件名生成验证 ══════════\n')

const cases = [
  {
    label: '① 作者的实际标题（含中文引号）',
    workId: 1,
    title: '“思想道德与法治”课社会实践报告书202503',
  },
  {
    label: '② 普通短标题',
    workId: 2,
    title: '基于区块链的存证方法研究',
  },
  {
    label: '③ 超长标题（应截断）',
    workId: 3,
    title:
      '面向多模态大模型时代的学术成果原创性验证与AIGC贡献度量化存证方法及其在教育评价体系中的应用研究',
  },
  {
    label: '④ 含 Windows 非法字符',
    workId: 4,
    title: '实验报告: 第1/2部分 <草稿> "待改" |v2|',
  },
  {
    label: '⑤ 标题为空（应省略该段）',
    workId: 5,
    title: '',
  },
  {
    label: '⑥ 标题只有空白',
    workId: 6,
    title: '   ',
  },
  {
    label: '⑦ 含换行与多余空格',
    workId: 7,
    title: '  多行   标题\n第二行  ',
  },
  {
    label: '⑧ XSS 载荷（不应影响文件名结构）',
    workId: 8,
    title: '<img src=x onerror=alert(1)>',
  },
]

let allPass = true
for (const c of cases) {
  const name = buildDocTitle(c.workId, c.title)
  const full = name + '.pdf'

  // 校验项
  const checks = []
  checks.push(['以「科研链证-存证证书-」开头', name.startsWith('科研链证-存证证书-')])
  checks.push(['含成果编号', name.includes(`-${c.workId}`)])
  checks.push(['无 Windows 非法字符', !/[\\/:*?"<>|]/.test(name)])
  checks.push(['无首尾空白', name === name.trim()])
  checks.push(['标题段不超过上限 + 省略号', !c.title.trim() || c.title.trim().length <= maxLen || name.endsWith('…')])

  const failed = checks.filter(([, ok]) => !ok)
  if (failed.length) allPass = false

  console.log(`${c.label}`)
  console.log(`  输入标题 : ${JSON.stringify(c.title)}`)
  console.log(`  文件名   : ${full}`)
  console.log(`  文件名长度: ${full.length} 字符`)
  if (failed.length) {
    console.log(`  ❌ 未通过: ${failed.map(([n]) => n).join('、')}`)
  } else {
    console.log(`  ✅ ${checks.length} 项校验通过`)
  }
  console.log('')
}

console.log('══════════ 结论 ══════════')
if (allPass) {
  console.log('✅ 全部用例通过：命名规则正确，且对非法字符、超长标题、空标题均已处理')
} else {
  console.log('❌ 存在未通过用例，请检查 buildDocTitle 实现')
  process.exitCode = 1
}
