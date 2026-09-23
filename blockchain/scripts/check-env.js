// scripts/check-env.js —— 阶段0「最小可行性验证」一键自检
//
// 用法：
//   1) 本地链全流程（不需要 MetaMask、不需要测试币）：
//        npx hardhat run scripts/check-env.js
//   2) 真实 Sepolia 全流程（需要 .env 里配好 PRIVATE_KEY + SEPOLIA_RPC_URL）：
//        npx hardhat run scripts/check-env.js --network sepolia
//
// 通过标准：最后打印「最小可行性验证：全部通过 ✅」
const hre = require("hardhat");

const PASS = "✅";
const FAIL = "❌";
let failures = 0;

function check(label, ok, detail = "") {
  console.log(`  ${ok ? PASS : FAIL} ${label}${detail ? "  → " + detail : ""}`);
  if (!ok) failures += 1;
}

async function main() {
  const net = await hre.ethers.provider.getNetwork();
  const [signer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(signer.address);

  console.log("══════════════════════════════════════════════");
  console.log(" 科研链证 · 阶段0 最小可行性验证自检");
  console.log("══════════════════════════════════════════════");
  console.log(`网络      : ${hre.network.name}`);
  console.log(`chainId   : ${net.chainId}`);
  console.log(`账户      : ${signer.address}`);
  console.log(`余额      : ${hre.ethers.formatEther(balance)} ETH`);
  console.log("");

  // ---------- 1. 连接与余额 ----------
  console.log("[1/6] 网络连接与账户");
  check("RPC 可访问，能取到 chainId", net.chainId > 0n, `chainId=${net.chainId}`);
  check("账户已加载", !!signer.address);
  const isLocal = hre.network.name === "hardhat" || hre.network.name === "localhost";
  if (!isLocal) {
    check("Sepolia 余额 > 0（部署需 gas）", balance > 0n, hre.ethers.formatEther(balance) + " ETH");
  } else {
    console.log("  ⓘ 本地链模式，余额检查跳过（hardhat 默认给足 10000 ETH）");
  }

  // ---------- 2. 部署 ----------
  console.log("\n[2/6] 部署合约");
  const factory = await hre.ethers.getContractFactory("AcademicProof");
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  check("部署成功，拿到合约地址", /^0x[0-9a-fA-F]{40}$/.test(address), address);
  check("admin 为部署账户", (await contract.admin()) === signer.address);
  check("初始 workCount 为 0", (await contract.workCount()) === 0n);

  // ---------- 3. registerWork ----------
  console.log("\n[3/6] registerWork（成果登记 / 存证）");
  // 模拟浏览器端：对文件字节算 SHA-256
  const fileBytes = hre.ethers.toUtf8Bytes("科研链证 demo 论文正文 v1");
  const realHash = hre.ethers.sha256(fileBytes); // 与前端 crypto.subtle.digest('SHA-256') 结果一致
  const title = "基于区块链的学术成果存证方法研究";
  const aigcRatio = 20;

  const tx = await contract.registerWork(realHash, title, 0, aigcRatio, "");
  const rc = await tx.wait();
  check("交易上链成功", rc.status === 1, `block=${rc.blockNumber} gas=${rc.gasUsed}`);
  const workId = await contract.workCount();
  check("workId 从 1 开始", workId === 1n, `workId=${workId}`);

  const w = await contract.getWork(workId);
  check("链上标题正确", w.title === title, w.title);
  check("链上指纹与本地计算一致", w.contentHash === realHash, w.contentHash);
  check("作者 = 调用者", w.author === signer.address);
  check("AIGC 比例 = 通过值", Number(w.aigcRatio) === aigcRatio, String(w.aigcRatio));
  check("registeredAt 为链上时间戳", w.registeredAt > 0n, new Date(Number(w.registeredAt) * 1000).toISOString());
  check("versionCount 初始为 1", Number(w.versionCount) === 1);

  const evt = rc.logs.find((l) => l.fragment && l.fragment.name === "WorkRegistered");
  check("WorkRegistered 事件已触发", !!evt);

  // ---------- 4. verifyWork ----------
  console.log("\n[4/6] verifyWork（核验 —— 演示的核心）");
  const v = await contract.verifyWork(realHash);
  check("同一份文件核验 → exists = true", v[0] === true);
  check("返回的 workId 正确", v[1] === workId, `workId=${v[1]}`);
  check("返回作者正确", v[2] === signer.address);
  check("返回 AIGC 比例正确", Number(v[4]) === aigcRatio);
  check("返回标题正确", v[5] === title);

  // 关键一幕：改一个字节（模拟"改一个标点"）
  const tamperedBytes = hre.ethers.toUtf8Bytes("科研链证 demo 论文正文 v1.");
  const tamperedHash = hre.ethers.sha256(tamperedBytes);
  const v2 = await contract.verifyWork(tamperedHash);
  check("改动一个标点后核验 → exists = false", v2[0] === false);
  check("两个指纹确实不同", tamperedHash !== realHash);
  console.log(`      原文指纹 : ${realHash}`);
  console.log(`      改动指纹 : ${tamperedHash}`);
  console.log("      ↑ 这就是演示视频里最有说服力的「篡改即失效」效果");

  // ---------- 5. 边界与权限 ----------
  console.log("\n[5/6] 边界与权限（安全测试预演）");
  if (!isLocal) {
    console.log("  ⓘ 非本地链，无法模拟第三方账户，权限类用例请用 npm test 在本地跑");
  }
  const other = isLocal
    ? await (async () => {
        const dead = "0x000000000000000000000000000000000000dEaD";
        await hre.network.provider.send("hardhat_impersonateAccount", [dead]);
        const s = await hre.ethers.getSigner(dead);
        await signer.sendTransaction({ to: dead, value: hre.ethers.parseEther("1") });
        return s;
      })()
    : null;

  let dupRejected = false;
  try {
    await contract.registerWork(realHash, "重复登记", 0, 0, "");
  } catch (e) {
    dupRejected = String(e.message).includes("AlreadyRegistered");
  }
  check("重复指纹登记被拒（AlreadyRegistered）", dupRejected);

  let ratioRejected = false;
  try {
    const h3 = hre.ethers.sha256(hre.ethers.toUtf8Bytes("ratio-test"));
    await contract.registerWork(h3, "比例越界", 0, 101, "");
  } catch (e) {
    ratioRejected = String(e.message).includes("InvalidRatio");
  }
  check("AIGC 比例 > 100 被拒（InvalidRatio）", ratioRejected);

  if (other) {
    let notAuthorRejected = false;
    try {
      const h4 = hre.ethers.sha256(hre.ethers.toUtf8Bytes("fake-version"));
      await contract.connect(other).addVersion(workId, h4, 10);
    } catch (e) {
      notAuthorRejected = String(e.message).includes("NotAuthor");
    }
    check("非作者追加版本被拒（NotAuthor）", notAuthorRejected);

    await hre.network.provider.send("hardhat_stopImpersonatingAccount", [
      "0x000000000000000000000000000000000000dEaD",
    ]);
  }

  const zeroCheck = await contract.verifyWork(hre.ethers.ZeroHash);
  check("核验不存在指纹 → exists = false", zeroCheck[0] === false);

  // ---------- 6. 版本追加 + AIGC 声明 ----------
  console.log("\n[6/6] addVersion / declareAIGC（加分模块预演）");
  const v2hash = hre.ethers.sha256(hre.ethers.toUtf8Bytes("科研链证 demo 论文正文 v2 修订版"));
  await (await contract.addVersion(workId, v2hash, 35)).wait();
  const wAfter = await contract.getWork(workId);
  check("版本数增加到 2", Number(wAfter.versionCount) === 2);
  check("当前指纹更新为新版本", wAfter.contentHash === v2hash);
  check("历史版本指纹仍可查（v1）", (await contract.getVersionHash(workId, 1)) === realHash);
  check("新版本也可核验到同一 workId", (await contract.verifyWork(v2hash))[1] === workId);

  await (await contract.declareAIGC(workId, 35, "ChatGPT-4o 用于润色, Copilot 用于代码补全")).wait();
  const tools = await contract.getAigcTools(workId);
  check("AIGC 工具声明已上链", tools.length === 1, tools[0]);
  check("AIGC 比例已更新为 35", Number((await contract.getWork(workId)).aigcRatio) === 35);

  await (await contract.raiseDispute(workId, "疑似未声明的 AI 生成内容")).wait();
  check("争议登记成功", (await contract.getWork(workId)).disputed === true);

  // ---------- 汇总 ----------
  console.log("\n══════════════════════════════════════════════");
  if (failures === 0) {
    console.log(` 最小可行性验证：全部通过 ${PASS}`);
    console.log(" 阶段0 完成，可以进入阶段1（合约完善 + 部署脚本）。");
  } else {
    console.log(` 最小可行性验证：${failures} 项未通过 ${FAIL}`);
    console.log(" 请把上面的失败项贴给 AI 助手排查。");
  }
  console.log("══════════════════════════════════════════════");
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("\n" + FAIL + " 自检脚本异常终止：");
  console.error(e);
  process.exitCode = 1;
});
