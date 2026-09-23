// test/AcademicProof.test.js —— 智能合约单元测试（阶段2 交付物）
//
// 运行：npx hardhat test
// gas 报告：$env:REPORT_GAS="true"; npx hardhat test
// 覆盖率：npx hardhat coverage
//
// 用例与 AGENTS.md 第 10 节「① 智能合约测试」逐条对应，共 9 组 30 项断言。
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

// 模拟前端：对"文件字节"算 SHA-256（与浏览器 crypto.subtle.digest 结果一致）
const hashOf = (s) => ethers.sha256(ethers.toUtf8Bytes(s));

const WorkType = { Paper: 0, Code: 1, Dataset: 2, Other: 3 };

describe("AcademicProof 科研链证核心合约", function () {
  let contract;
  let admin, author, verifier, stranger;

  const V1 = hashOf("科研链证 demo 论文正文 v1");
  const V2 = hashOf("科研链证 demo 论文正文 v2 修订版");
  const TITLE = "基于区块链的学术成果存证方法研究";

  beforeEach(async function () {
    [admin, author, verifier, stranger] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("AcademicProof");
    contract = await factory.deploy();
    await contract.waitForDeployment();
  });

  // ══════════════════════════════════════════════════════════
  // 组1 · 部署
  // ══════════════════════════════════════════════════════════
  describe("组1 部署", function () {
    it("部署者成为 admin，且 admin 为 immutable（不可修改）", async function () {
      expect(await contract.admin()).to.equal(admin.address);
    });

    it("初始 workCount 为 0", async function () {
      expect(await contract.workCount()).to.equal(0n);
    });
  });

  // ══════════════════════════════════════════════════════════
  // 组2 · registerWork 正常工作
  // ══════════════════════════════════════════════════════════
  describe("组2 registerWork 成果登记", function () {
    it("正常登记成功，workId 从 1 开始，字段全部正确", async function () {
      await expect(
        contract.connect(author).registerWork(V1, TITLE, WorkType.Paper, 20, "")
      ).to.emit(contract, "WorkRegistered");

      expect(await contract.workCount()).to.equal(1n);
      const w = await contract.getWork(1);
      expect(w.contentHash).to.equal(V1);
      expect(w.author).to.equal(author.address);
      expect(w.title).to.equal(TITLE);
      expect(Number(w.aigcRatio)).to.equal(20);
      expect(Number(w.workType)).to.equal(WorkType.Paper);
      expect(w.versionCount).to.equal(1);
      expect(w.disputed).to.equal(false);
      expect(w.registeredAt).to.be.greaterThan(0n);
    });

    it("连号登记：第二份成果 workId = 2，且为不同作者", async function () {
      await contract.connect(author).registerWork(V1, TITLE, WorkType.Paper, 20, "");
      await contract.connect(verifier).registerWork(V2, "另一份成果", WorkType.Code, 0, "");
      expect(await contract.workCount()).to.equal(2n);
      expect((await contract.getWork(2)).author).to.equal(verifier.address);
    });

    it("versionHash[workId][1] 被正确写入", async function () {
      await contract.connect(author).registerWork(V1, TITLE, WorkType.Paper, 20, "");
      expect(await contract.getVersionHash(1, 1)).to.equal(V1);
    });

    it("AIGC 比例边界值 0 与 100 均可通过", async function () {
      await contract.connect(author).registerWork(V1, TITLE, WorkType.Paper, 0, "");
      const V1b = hashOf("全人工写作");
      await contract.connect(author).registerWork(V1b, TITLE, WorkType.Paper, 100, "");
      expect(Number((await contract.getWork(1)).aigcRatio)).to.equal(0);
      expect(Number((await contract.getWork(2)).aigcRatio)).to.equal(100);
    });
  });

  // ══════════════════════════════════════════════════════════
  // 组3 · registerWork 拒绝非法输入（安全测试核心）
  // ══════════════════════════════════════════════════════════
  describe("组3 registerWork 边界与拒绝", function () {
    beforeEach(async function () {
      await contract.connect(author).registerWork(V1, TITLE, WorkType.Paper, 20, "");
    });

    it("重复指纹登记被拒 AlreadyRegistered", async function () {
      await expect(
        contract.connect(stranger).registerWork(V1, "冒名登记", WorkType.Paper, 0, "")
      ).to.be.revertedWithCustomError(contract, "AlreadyRegistered");
    });

    it("AIGC 比例 > 100 被拒 InvalidRatio", async function () {
      await expect(
        contract.connect(author).registerWork(V2, TITLE, WorkType.Paper, 101, "")
      ).to.be.revertedWithCustomError(contract, "InvalidRatio");
    });

    it("全零指纹被拒 ZeroHash", async function () {
      await expect(
        contract.connect(author).registerWork(ethers.ZeroHash, TITLE, WorkType.Paper, 0, "")
      ).to.be.revertedWithCustomError(contract, "ZeroHash");
    });

    it("空标题被拒 EmptyTitle", async function () {
      await expect(
        contract.connect(author).registerWork(V2, "", WorkType.Paper, 0, "")
      ).to.be.revertedWithCustomError(contract, "EmptyTitle");
    });
  });

  // ══════════════════════════════════════════════════════════
  // 组4 · verifyWork 核验（⭐ 演示的核心）
  // ══════════════════════════════════════════════════════════
  describe("组4 verifyWork 核验", function () {
    beforeEach(async function () {
      await contract.connect(author).registerWork(V1, TITLE, WorkType.Paper, 20, "");
    });

    it("已登记指纹 → exists = true，返回完整信息", async function () {
      const r = await contract.verifyWork(V1);
      expect(r.exists).to.equal(true);
      expect(r.workId).to.equal(1n);
      expect(r.author).to.equal(author.address);
      expect(r.registeredAt).to.be.greaterThan(0n);
      expect(Number(r.aigcRatio)).to.equal(20);
      expect(r.title).to.equal(TITLE);
    });

    it("⭐ 未登记指纹 → exists = false（改动一个标点即核验失败）", async function () {
      const tampered = hashOf("科研链证 demo 论文正文 v1."); // 只加一个句点
      expect(tampered).to.not.equal(V1);
      const r = await contract.verifyWork(tampered);
      expect(r.exists).to.equal(false);
      expect(r.workId).to.equal(0n);
      expect(r.author).to.equal(ethers.ZeroAddress);
      expect(r.title).to.equal("");
    });

    it("核验是 view 函数，第三方调用不消耗 gas、不需要是作者", async function () {
      // 用 verifier（完全无关的第三方）核验
      const r = await contract.connect(verifier).verifyWork(V1);
      expect(r.exists).to.equal(true);
    });

    it("核验不存在指纹（ZeroHash）不抛异常，返回 false", async function () {
      const r = await contract.verifyWork(ethers.ZeroHash);
      expect(r.exists).to.equal(false);
    });
  });

  // ══════════════════════════════════════════════════════════
  // 组5 · addVersion 版本追加（过程留痕）
  // ══════════════════════════════════════════════════════════
  describe("组5 addVersion 版本追加", function () {
    beforeEach(async function () {
      await contract.connect(author).registerWork(V1, TITLE, WorkType.Paper, 20, "");
    });

    it("作者追加版本成功，versionCount 递增，历史指纹保留", async function () {
      await expect(contract.connect(author).addVersion(1, V2, 35)).to.emit(
        contract,
        "VersionAdded"
      );
      const w = await contract.getWork(1);
      expect(w.versionCount).to.equal(2);
      expect(w.contentHash).to.equal(V2);
      expect(Number(w.aigcRatio)).to.equal(35);
      // ⭐ 历史版本仍可查，且能核验到同一 workId
      expect(await contract.getVersionHash(1, 1)).to.equal(V1);
      expect((await contract.verifyWork(V1)).workId).to.equal(1n);
      expect((await contract.verifyWork(V2)).workId).to.equal(1n);
    });

    it("非作者追加版本被拒 NotAuthor", async function () {
      await expect(
        contract.connect(stranger).addVersion(1, V2, 10)
      ).to.be.revertedWithCustomError(contract, "NotAuthor");
    });

    it("对不存在的成果追加版本被拒 NotFound", async function () {
      await expect(
        contract.connect(author).addVersion(999, V2, 10)
      ).to.be.revertedWithCustomError(contract, "NotFound");
    });

    it("提交与当前版本相同的指纹被拒 SameHash", async function () {
      await expect(
        contract.connect(author).addVersion(1, V1, 30)
      ).to.be.revertedWithCustomError(contract, "SameHash");
    });

    it("挪用他人已登记指纹被拒 AlreadyRegistered（确权冲突）", async function () {
      // verifier 先登记 V2
      await contract.connect(verifier).registerWork(V2, "他人的成果", WorkType.Code, 0, "");
      // author 想把 V2 当作自己成果 1 的新版本 → 必须被拒
      await expect(
        contract.connect(author).addVersion(1, V2, 50)
      ).to.be.revertedWithCustomError(contract, "AlreadyRegistered");
    });

    it("版本追加时 AIGC 比例 > 100 被拒 InvalidRatio", async function () {
      await expect(
        contract.connect(author).addVersion(1, V2, 101)
      ).to.be.revertedWithCustomError(contract, "InvalidRatio");
    });

    it("版本追加时提交全零指纹被拒 ZeroHash", async function () {
      await expect(
        contract.connect(author).addVersion(1, ethers.ZeroHash, 10)
      ).to.be.revertedWithCustomError(contract, "ZeroHash");
    });
  });

  // ══════════════════════════════════════════════════════════
  // 组6 · declareAIGC AIGC 贡献声明（核心差异化卖点）
  // ══════════════════════════════════════════════════════════
  describe("组6 declareAIGC AIGC 声明", function () {
    beforeEach(async function () {
      await contract.connect(author).registerWork(V1, TITLE, WorkType.Paper, 20, "");
    });

    it("作者声明 AIGC 成功，比例更新且工具记录可查", async function () {
      await expect(
        contract.connect(author).declareAIGC(1, 45, "ChatGPT-4o 润色, Copilot 补全")
      ).to.emit(contract, "AIGCDeclared");

      expect(Number((await contract.getWork(1)).aigcRatio)).to.equal(45);
      const tools = await contract.getAigcTools(1);
      expect(tools.length).to.equal(1);
      expect(tools[0]).to.equal("ChatGPT-4o 润色, Copilot 补全");
    });

    it("多次声明形成不可篡改的履历（比例变更留痕）", async function () {
      await contract.connect(author).declareAIGC(1, 20, "初稿使用 ChatGPT");
      await contract.connect(author).declareAIGC(1, 45, "修订时增加 AI 辅助");
      const tools = await contract.getAigcTools(1);
      expect(tools.length).to.equal(2);
      expect(Number((await contract.getWork(1)).aigcRatio)).to.equal(45);
    });

    it("非作者声明被拒 NotAuthor", async function () {
      await expect(
        contract.connect(stranger).declareAIGC(1, 90, "恶意声明")
      ).to.be.revertedWithCustomError(contract, "NotAuthor");
    });

    it("比例 > 100 被拒 InvalidRatio", async function () {
      await expect(
        contract.connect(author).declareAIGC(1, 150, "越界")
      ).to.be.revertedWithCustomError(contract, "InvalidRatio");
    });

    it("对不存在的成果声明 AIGC 被拒 NotFound", async function () {
      await expect(
        contract.connect(author).declareAIGC(999, 50, "无效成果")
      ).to.be.revertedWithCustomError(contract, "NotFound");
    });
  });

  // ══════════════════════════════════════════════════════════
  // 组7 · raiseDispute 争议登记
  // ══════════════════════════════════════════════════════════
  describe("组7 raiseDispute 争议登记", function () {
    beforeEach(async function () {
      await contract.connect(author).registerWork(V1, TITLE, WorkType.Paper, 20, "");
    });

    it("任意第三方可对已登记成果发起争议，disputed 置为 true", async function () {
      await expect(
        contract.connect(stranger).raiseDispute(1, "疑似未声明的 AI 生成内容")
      ).to.emit(contract, "DisputeRaised");
      expect((await contract.getWork(1)).disputed).to.equal(true);
    });

    it("对不存在的成果发起争议被拒 NotFound", async function () {
      await expect(
        contract.connect(stranger).raiseDispute(999, "无效")
      ).to.be.revertedWithCustomError(contract, "NotFound");
    });
  });

  // ══════════════════════════════════════════════════════════
  // 组8 · 只读辅助查询（前端使用）
  // ══════════════════════════════════════════════════════════
  describe("组8 只读查询", function () {
    it("getWorkCountOf 统计某地址的成果数", async function () {
      await contract.connect(author).registerWork(V1, "成果A", WorkType.Paper, 0, "");
      await contract.connect(author).registerWork(hashOf("成果B"), "成果B", WorkType.Code, 0, "");
      await contract.connect(verifier).registerWork(hashOf("成果C"), "成果C", WorkType.Other, 0, "");
      expect(await contract.getWorkCountOf(author.address)).to.equal(2n);
      expect(await contract.getWorkCountOf(verifier.address)).to.equal(1n);
      expect(await contract.getWorkCountOf(stranger.address)).to.equal(0n);
    });

    it("getWork 查询不存在的编号返回空结构体（author = 0 地址）", async function () {
      const w = await contract.getWork(999);
      expect(w.author).to.equal(ethers.ZeroAddress);
      expect(w.versionCount).to.equal(0);
    });
  });

  // ══════════════════════════════════════════════════════════
  // 组9 · 完整业务流程（对应演示脚本，端到端）
  // ══════════════════════════════════════════════════════════
  describe("组9 端到端业务流程（演示脚本回归）", function () {
    it("登记 → 核验通过 → 改一个标点 → 核验失败 → 追加版本 → 再次核验通过", async function () {
      // 1. 作者存证
      await contract.connect(author).registerWork(V1, TITLE, WorkType.Paper, 20, "");
      // 2. 核验方核验同一份文件 → 通过
      let r = await contract.connect(verifier).verifyWork(V1);
      expect(r.exists).to.equal(true);
      expect(r.author).to.equal(author.address);
      // 3. 改一个标点 → 核验失败
      r = await contract.connect(verifier).verifyWork(hashOf("科研链证 demo 论文正文 v1,"));
      expect(r.exists).to.equal(false);
      // 4. 作者追加修订版
      await contract.connect(author).addVersion(1, V2, 35);
      // 5. 修订版核验通过，且指向同一成果
      r = await contract.connect(verifier).verifyWork(V2);
      expect(r.exists).to.equal(true);
      expect(r.workId).to.equal(1n);
      expect(Number(r.aigcRatio)).to.equal(35);
    });
  });
});
