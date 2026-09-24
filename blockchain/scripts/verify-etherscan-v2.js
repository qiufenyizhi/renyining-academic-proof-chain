// scripts/verify-etherscan-v2.js —— 通过 Etherscan **V2** API 提交源码验证
//
// 为什么需要这个脚本：
//   Hardhat 2 的 hardhat-verify 最新版只到 2.1.3（dist-tag: hh2），
//   而 Etherscan 已于 2025-05-31 停用 V1 端点、强制 V2。
//   2.1.3 仍打 V1 端点，因此 `npx hardhat verify` 必然报：
//     "You are using a deprecated V1 endpoint, switch to Etherscan API V2"
//   V2 支持只在 hardhat-verify 3.x（需要 Hardhat 3），会破坏现有工程，故不升级。
//
//   ⚠️ Etherscan V2 的两个坑（2026-09-24 实测）：
//     1) 全部参数放 POST body → 报 "Missing or unsupported chainid parameter"
//        （实测 body 里的 chainid 完全不被解析）
//     2) 全部参数放 GET query → standard-json 约 8.6KB，URL 过长，服务器返回 HTML
//     正确姿势：**chainid 放 URL query，其余参数放 POST body**（两种限制都绕开）
//
// 用法：
//   npx hardhat run scripts/verify-etherscan-v2.js --network sepolia
require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");

const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api";
const CHAIN_ID = "11155111"; // Sepolia

// chainid 必须放 query；其余参数放 body
async function post(params) {
  const res = await fetch(`${ETHERSCAN_V2}?chainid=${CHAIN_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  return res.json();
}

async function get(params) {
  const qs = new URLSearchParams({ chainid: CHAIN_ID, ...params });
  const res = await fetch(`${ETHERSCAN_V2}?${qs}`);
  return res.json();
}

async function main() {
  const apiKey = (process.env.ETHERSCAN_API_KEY || "").trim();
  if (!apiKey || apiKey.length !== 34) {
    console.error("❌ .env 里的 ETHERSCAN_API_KEY 缺失或长度不对（应为 34 位）");
    process.exitCode = 1;
    return;
  }

  // 合约地址：优先取部署记录，其次命令行传入
  const recordPath = path.join(__dirname, "..", "deployments", "sepolia.json");
  if (!fs.existsSync(recordPath)) {
    console.error("❌ 找不到 deployments/sepolia.json");
    process.exitCode = 1;
    return;
  }
  const address = JSON.parse(fs.readFileSync(recordPath, "utf8")).address;
  console.log("待验证合约 :", address);
  console.log("chainId    :", CHAIN_ID);

  // 先看是否已验证，避免重复提交
  const pre = await get({
    chainid: CHAIN_ID,
    module: "contract",
    action: "getsourcecode",
    address,
    apikey: apiKey,
  });
  if (pre.status === "1" && pre.result?.[0]?.SourceCode) {
    console.log("✅ 该合约已经通过验证，无需重复提交");
    console.log("   合约名:", pre.result[0].ContractName);
    return;
  }

  // 从 build-info 取精确编译输入
  const buildInfoDir = path.join(__dirname, "..", "artifacts", "build-info");
  const files = fs.readdirSync(buildInfoDir).filter((f) => f.endsWith(".json"));
  if (!files.length) {
    console.error("❌ 没有 build-info，请先 npx hardhat compile");
    process.exitCode = 1;
    return;
  }
  const bi = JSON.parse(fs.readFileSync(path.join(buildInfoDir, files[0]), "utf8"));
  const sourcePath = Object.keys(bi.input.sources).find((k) => k.includes("AcademicProof"));
  const sourceCode = bi.input.sources[sourcePath].content;

  console.log("源文件名   :", sourcePath);
  console.log("编译器     :", bi.solcLongVersion);
  console.log("optimizer  :", JSON.stringify(bi.input.settings.optimizer));

  // 构造 standard-json input（只含本合约，无外部依赖）
  const standardInput = {
    language: "Solidity",
    sources: { [sourcePath]: { content: sourceCode } },
    settings: {
      optimizer: bi.input.settings.optimizer,
      evmVersion: bi.input.settings.evmVersion,
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "evm.methodIdentifiers", "metadata"],
          "": ["ast"],
        },
      },
    },
  };

  console.log("\n正在提交验证请求 ...");
  const submit = await post({
    module: "contract",
    action: "verifysourcecode",
    apikey: apiKey,
    codeformat: "solidity-standard-json-input",
    sourceCode: JSON.stringify(standardInput),
    contractaddress: address,
    contractname: `${sourcePath}:AcademicProof`,
    compilerversion: `v${bi.solcLongVersion}`,
    optimizationUsed: bi.input.settings.optimizer.enabled ? 1 : 0,
    runs: bi.input.settings.optimizer.runs,
    evmversion: bi.input.settings.evmVersion,
    licenseType: 3, // MIT
  });

  console.log("提交返回   :", JSON.stringify(submit));
  if (submit.status !== "1") {
    console.error("\n❌ 提交失败，请把上面的返回内容贴给 AI 助手");
    process.exitCode = 1;
    return;
  }

  const guid = submit.result;
  console.log("GUID       :", guid);
  console.log("\n等待 Etherscan 编译比对（最多轮询 12 次，每次 5 秒）...");
  for (let i = 1; i <= 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const chk = await get({
      chainid: CHAIN_ID,
      module: "contract",
      action: "checkverifystatus",
      guid,
      apikey: apiKey,
    });
    const status = chk.result;
    console.log(`  第 ${i} 次: ${status}`);
    if (status && !/Pending/i.test(status)) {
      if (/Passed|Successfully/i.test(status) || chk.status === "1") {
        console.log("\n✅ 验证成功！");
        console.log(`   https://sepolia.etherscan.io/address/${address}#code`);
      } else {
        console.log("\n❌ 验证未通过，Etherscan 返回：", status);
      }
      return;
    }
  }
  console.log("\n⏳ 仍在处理中，稍后自行到 Etherscan 页面查看是否出现绿色对勾：");
  console.log(`   https://sepolia.etherscan.io/address/${address}#code`);
}

main().catch((e) => {
  console.error("脚本异常：", e);
  process.exitCode = 1;
});
