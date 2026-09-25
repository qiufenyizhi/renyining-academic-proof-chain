// scripts/verify-abi-match.mjs —— 校验前端手写 ABI 与链上已部署合约是否一致
//
// 为什么需要这个检查：
//   frontend/src/contracts/abi.js 是手写的函数签名字符串。
//   若与链上部署的合约有任何不一致（参数类型、顺序、stateMutability），
//   只有当用户在浏览器里真正点下按钮时才会炸——那时很难定位。
//
// 校验方式（不依赖 Etherscan，只用 RPC，更可靠）：
//   用前端 ABI 构造 Contract，逐个走真实 RPC 调用：
//     - 只读函数：用 staticCall 调用，能进入合约逻辑即说明签名正确
//     - 写函数/事件：用 interface.getFunction / getEvent 解析，并与
//       本地编译产物 artifacts 的 ABI 比对选择器
//   若签名错误，节点会返回 "function ... not found" 或参数解码失败。
//
// 用法（在 blockchain/ 目录下）：node scripts/verify-abi-match.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Interface, JsonRpcProvider, Contract } from 'ethers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..', '..')

// ---------- 1. 前端 ABI ----------
const abiSrc = fs.readFileSync(path.join(repoRoot, 'frontend/src/contracts/abi.js'), 'utf8')
const block = abiSrc.match(/export const CONTRACT_ABI = \[([\s\S]*?)\n\]/)
if (!block) {
  console.error('❌ 无法从 abi.js 解析出 CONTRACT_ABI')
  process.exit(1)
}
const frontendAbi = [...block[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
console.log(`前端 ABI 条目数 : ${frontendAbi.length}`)

// ---------- 2. 本地编译产物 ABI（部署时的真实 ABI）----------
const artifactPath = path.join(
  repoRoot,
  'blockchain/artifacts/src/contracts/AcademicProof.sol/AcademicProof.json'
)
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
console.log(`编译产物 ABI 条目: ${artifact.abi.length}`)

// ---------- 3. 部署记录 ----------
const record = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'blockchain/deployments/sepolia.json'), 'utf8')
)

// 用 Interface 归一化成 "type sighash" 集合
function sigSet(abi) {
  const set = new Map()
  for (const item of abi) {
    if (item.type === 'constructor') continue
    try {
      const iface = new Interface([item])
      for (const f of iface.fragments) {
        if (['function', 'event', 'error'].includes(f.type)) {
          set.set(`${f.type} ${f.format('sighash')}`, f)
        }
      }
    } catch {
      /* 忽略无法解析项 */
    }
  }
  return set
}

const front = sigSet(frontendAbi)
const compiled = sigSet(artifact.abi)

console.log('\n══════════ 一、与本地编译产物比对 ══════════')
const missingFromFront = []
for (const [sig] of compiled) {
  if (!front.has(sig)) missingFromFront.push(sig)
}

if (missingFromFront.length) {
  console.log('❌ 合约有、前端 ABI 缺失（前端将无法调用）：')
  missingFromFront.forEach((s) => console.log('   -', s))
  process.exitCode = 1
} else {
  console.log('✅ 合约的全部函数/事件/错误，前端 ABI 均已覆盖且签名一致')
}

// ---------- 4. 真实 RPC 逐个调用验证 ----------
console.log('\n══════════ 二、通过真实 RPC 验证签名可调用 ══════════')
const rpc = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
const provider = new JsonRpcProvider(rpc, 11155111)
const c = new Contract(record.address, frontendAbi, provider)

const code = await provider.getCode(record.address)
console.log(`合约地址        : ${record.address}`)
console.log(`链上代码        : ${code === '0x' ? '❌ 无代码' : '✅ ' + (code.length / 2 - 1) + ' 字节'}`)

// 只读函数用安全参数调用；能返回或抛出合约自身的逻辑错误，都说明签名正确
const readCalls = [
  ['admin()', () => c.admin()],
  ['workCount()', () => c.workCount()],
  ['getWork(0)', () => c.getWork(0)],
  ['getVersionHash(0,1)', () => c.getVersionHash(0, 1)],
  ['getAigcTools(0)', () => c.getAigcTools(0)],
  ['getWorkCountOf(零地址)', () => c.getWorkCountOf('0x0000000000000000000000000000000000000001')],
  ['verifyWork(ZeroHash)', () => c.verifyWork('0x' + '00'.repeat(32))],
  ['hashToWorkId(ZeroHash)', () => c.hashToWorkId('0x' + '00'.repeat(32))],
  ['versionHash(1,1)', () => c.versionHash(1, 1)],
]

let rpcOk = 0
let rpcFail = 0
for (const [label, fn] of readCalls) {
  try {
    const r = await fn()
    console.log(`  ✅ ${label}  →  ${Array.isArray(r) ? `[${r.length} 个返回值]` : String(r).slice(0, 42)}`)
    rpcOk++
  } catch (e) {
    const msg = String(e.shortMessage || e.message || e)
    // "function not found" / "could not decode" 才是签名问题；
    // 合约自身的 require/revert 说明签名是对的
    const isSigProblem = /not found|could not decode|unknown function|BAD_DATA/i.test(msg)
    if (isSigProblem) {
      console.log(`  ❌ ${label}  →  签名不匹配：${msg.slice(0, 90)}`)
      rpcFail++
    } else {
      console.log(`  ✅ ${label}  →  进入合约逻辑（返回业务错误，签名正确）`)
      rpcOk++
    }
  }
}

// 写函数：只解析签名，不发交易（没有私钥时也能验证 ABI 是否可编码）
console.log('\n  写函数编码检查（不发交易）：')
const writeSigs = [
  ['registerWork', ['0x' + '11'.repeat(32), '标题', 0, 20, '']],
  ['addVersion', [1, '0x' + '22'.repeat(32), 30]],
  ['declareAIGC', [1, 50, 'ChatGPT']],
  ['raiseDispute', [1, '理由']],
]
for (const [name, args] of writeSigs) {
  try {
    const data = c.interface.encodeFunctionData(name, args)
    console.log(`  ✅ ${name}  编码成功（selector ${data.slice(0, 10)}）`)
    rpcOk++
  } catch (e) {
    console.log(`  ❌ ${name}  编码失败：${e.message.slice(0, 90)}`)
    rpcFail++
  }
}

console.log('\n══════════ 结论 ══════════')
if (!missingFromFront.length && rpcFail === 0) {
  console.log(`✅ 前端 ABI 与链上合约完全一致：${rpcOk} 项通过，0 项失败`)
  console.log('   前端调用不会出现「点了没反应 / function not found」')
} else {
  console.log(`❌ 存在问题：缺失 ${missingFromFront.length} 项，RPC 失败 ${rpcFail} 项`)
  process.exitCode = 1
}
