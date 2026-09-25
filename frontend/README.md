# 科研链证 · 前端

基于区块链的学术成果原创性与 AIGC 贡献存证平台 —— 纯前端单页应用（SPA）。

## 快速开始

```powershell
cd frontend
npm install
npm run dev        # 开发服务器 http://127.0.0.1:5173/
```

其他命令：

```powershell
npm run build      # 生产构建 → dist/
npm run preview    # 预览构建产物 http://127.0.0.1:4173/
```

> `dev` 与 `preview` 都设置了 `strictPort`，端口被占用时会直接报错而不是静默换端口。

## 技术栈

| 项 | 选型 | 说明 |
| --- | --- | --- |
| 框架 | **Vue 3**（`<script setup>` 组合式 API） | |
| 构建 | **Vite 5** | 路由级懒加载，构建 2135 模块 0 报错 |
| 链交互 | **ethers.js v6** | ⚠️ v6 与 v5 API 差异极大，**全项目统一 v6，不要混用** |
| UI | **Element Plus** + 官方图标 | 中文化 locale 已配置 |
| 证书导出 | jsPDF | 详情页「导出存证证书」 |
| 路由 | Vue Router 4（**hash 模式**） | 静态托管无需服务端 rewrite，评委刷新任意子页不 404 |

## 页面结构（5 个路由）

| 路由 | 文件 | 作用 | 演示脚本对应 |
| --- | --- | --- | --- |
| `/` | `views/HomeView.vue` | 价值主张、钱包连接、四层架构图、为什么必须上链 | 0:00-0:15、2:40-3:00 |
| `/register` | `views/RegisterView.vue` | 存证登记：拖文件 → 本地算指纹 → 填 AIGC 声明 → 上链 | 0:25-1:00 |
| `/verify` | `views/VerifyView.vue` | **核验（重点页）**：拖文件 → 查链 → 大字结论 ✅/❌ | 1:20-2:20 |
| `/work/:id` | `views/WorkDetailView.vue` | 详情：元信息 + 时间轴 + 版本表 + 追加版本/声明/争议/导出证书 | 2:20-2:40 |
| `/dashboard` | `views/DashboardView.vue` | 数据看板：总数、AIGC 分布、类型分布、明细表 | — |

## 目录说明

```
frontend/
├── src/
│   ├── components/
│   │   ├── FileDropzone.vue     # 拖拽上传 + 本地算哈希 + 显示耗时（D1/D2）
│   │   └── RoleBar.vue          # 角色提示条：作者 / 核验方 / 仲裁方（D6）
│   ├── composables/
│   │   └── useWallet.js         # 钱包连接、链切换、可写/只读合约实例（全局单例）
│   ├── contracts/
│   │   ├── abi.js               # 合约 ABI + 自定义错误中文映射
│   │   └── config.js            # 合约地址、链配置、区块浏览器链接
│   ├── utils/
│   │   ├── hash.js              # ⭐ 浏览器本地 SHA-256（核心亮点）
│   │   ├── certificate.js       # jsPDF 存证证书
│   │   └── format.js            # 地址/时间戳/比例格式化
│   ├── router/index.js
│   ├── styles/main.css          # 设计变量与通用样式
│   ├── views/                   # 5 个页面
│   ├── App.vue                  # 顶栏（品牌+导航+钱包）+ 内容 + 页脚
│   └── main.js
├── index.html
├── vite.config.js
└── package.json
```

## 三个必须知道的设计决策

### 1. 文件永远不上传服务器

`utils/hash.js` 用 Web Crypto API 在**浏览器本地**计算 SHA-256，只有 32 字节指纹上链。
原文不经过任何网络请求。这同时解决**隐私**与**信任**两个问题——存证平台自己都拿不到原文。

### 2. 核验不需要钱包、不需要登录

`VerifyView` 走 `JsonRpcProvider` 只读查询（`useWallet().ensureReadContract()`），
任何评审方打开网页、拖入文件就能独立验证。这是产品定位「不依赖平台自证」的直接体现。

### 3. 合约地址只有一个权威来源

`blockchain/deployments/sepolia.json`。前端 `contracts/config.js` 内置了当前地址作为兜底，
但**重新部署合约后必须同步更新它**，或改用 `.env.local` 覆盖：

```
VITE_CONTRACT_ADDRESS=0x...
VITE_CHAIN_ID=11155111
```

## 修改合约后的一致性检查（重要）

前端 ABI 是手写的函数签名字符串，容易与合约脱节。**改合约后务必跑一次**：

```powershell
cd blockchain
node scripts/verify-abi-match.mjs
```

它会：① 与编译产物 ABI 比对，确保无遗漏 ② 通过真实 RPC 逐个调用，确认签名可编码可调用。
若返回非 0，说明前端 ABI 需要同步更新。

## 演示脚本需求对照（D1-D10）

| 编号 | 需求 | 实现位置 | 状态 |
| --- | --- | --- | --- |
| D1 | 上传后实时显示哈希 + 计算耗时 | `FileDropzone.vue`（`sha256FileTimed`） | ✅ |
| D2 | 明确标注「文件未上传，本地计算」 | `FileDropzone.vue` `.privacy-note` | ✅ |
| D3 | 显示 workId + 链上时间戳（本地时间） | `RegisterView.vue` 成功卡片 | ✅ |
| D4 | 核验结果大字 ✅/❌ | `VerifyView.vue` + `styles/main.css` `.verdict` | ✅ |
| D5 | 通过时展示作者/时间/AIGC/标题 | `VerifyView.vue` 链上登记信息 | ✅ |
| D6 | 角色提示条 | `RoleBar.vue` | ✅ |
| D7 | 详情页时间轴 | `WorkDetailView.vue`（`el-timeline`） | ✅ |
| D8 | Etherscan 链接（新窗口） | `RegisterView` / `VerifyView` / `WorkDetailView` | ✅ |
| D9 | 导出存证证书 PDF | `utils/certificate.js` | ✅ |
| D10 | 四层架构图 | `HomeView.vue` 系统架构区块 | ✅ |

## 已知限制（演示阶段的有意取舍）

- **时间轴的时间精度**：合约只保存「最近更新时间」，各历史版本与 AIGC 声明的具体时间在链上事件日志里。
  当前用最近更新时间近似显示，并在页面上注明了这一点。若要精确，需在阶段5 加事件索引（读 `queryFilter`）。
- **数据看板**：当前为遍历 `workCount` 读取（demo 规模够用）。生产环境应改为事件索引。
- **ECharts 图表**：尚未引入，当前用 CSS 进度条呈现分布。阶段5 按时间余量决定是否加。
