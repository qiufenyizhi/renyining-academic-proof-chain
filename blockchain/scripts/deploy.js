// scripts/deploy.js —— 部署 AcademicProof 并输出前端可直接粘贴的地址
const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log("──────────────────────────────────────────────");
  console.log("网络      :", hre.network.name, "(chainId:", (await hre.ethers.provider.getNetwork()).chainId.toString() + ")");
  console.log("部署账户  :", deployer.address);
  console.log("账户余额  :", hre.ethers.formatEther(balance), "ETH");
  console.log("──────────────────────────────────────────────");

  if (balance === 0n) {
    console.warn("⚠️  余额为 0，部署会失败。请先到水龙头领取 Sepolia 测试币。");
    console.warn("    见 docs/环境搭建手册.md「第三步」。");
  }

  console.log("正在部署 AcademicProof ...");
  const factory = await hre.ethers.getContractFactory("AcademicProof");
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  const receipt = await deployTx.wait();

  console.log("");
  console.log("✅ 部署成功");
  console.log("合约地址     :", address);
  console.log("部署交易哈希 :", deployTx.hash);
  console.log("所在区块     :", receipt.blockNumber);
  console.log("消耗 gas     :", receipt.gasUsed.toString());

  // 浏览器链接（Sepolia 才有意义）
  if (hre.network.name === "sepolia") {
    console.log("Etherscan    : https://sepolia.etherscan.io/address/" + address);
    console.log("提醒         : 到 https://sepolia.etherscan.io/verifyContract 上传源码完成验证，答辩时可展示");
  }

  // 落盘部署记录，前端与文档都从这里取地址
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const record = {
    network: hre.network.name,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    address,
    deployer: deployer.address,
    txHash: deployTx.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    deployedAt: new Date().toISOString(),
  };
  const outFile = path.join(outDir, `${hre.network.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(record, null, 2));
  console.log("部署记录已写入:", path.relative(process.cwd(), outFile));

  console.log("");
  console.log("把下面两行贴进前端 frontend/.env.local ：");
  console.log(`VITE_CONTRACT_ADDRESS=${address}`);
  console.log(
    `VITE_CHAIN_ID=${record.chainId}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
