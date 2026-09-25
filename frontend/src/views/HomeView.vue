<script setup>
// views/HomeView.vue —— 首页：价值主张 + 连接钱包 + 四层架构图
//
// 演示脚本 0:00-0:15 与 2:40-3:00 都停在本页：
//   - 0:00 需要 15 秒内讲清「痛点 + 一句话定位」
//   - 2:40 需要落回「为什么必须区块链」，并叠加四层架构图（D10）
import { RouterLink } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useWallet } from '@/composables/useWallet.js'
import { CONTRACT_ADDRESS, CURRENT_CHAIN, explorerAddressUrl } from '@/contracts/config.js'

const { isConnected, shortAddress, connecting, connect } = useWallet()

const pains = [
  {
    title: '查重结论不可独立验证',
    desc: '现有系统只给一个百分比，结论由平台自证，第三方无法复现，报告可被 PS。',
  },
  {
    title: 'AIGC 贡献无据可查',
    desc: 'AI 写了多少、人工改了多少，完全没有记录手段——这是本作品的核心差异化卖点。',
  },
  {
    title: '时间戳争议',
    desc: '代码作业、竞赛作品的「谁先谁后」缺乏可信的时间证据。',
  },
  {
    title: '成果确权脆弱',
    desc: '中心化存档一旦丢失或被篡改，无从追溯、无法自证。',
  },
]

// 四层架构（对照 PPT 范例的四层画法）
const layers = [
  {
    name: '应用·服务层',
    color: '#eef2ff',
    items: ['成果登记', 'AIGC 声明', '核验查询', '版本追加', '争议登记'],
  },
  {
    name: '用户层',
    color: '#f0fdf4',
    items: ['作者（学生）', '核验方（期刊/竞赛/教务）', '仲裁方'],
  },
  {
    name: '网络·共识层',
    color: '#fff7ed',
    items: ['Sepolia 测试网（在线 Demo）', 'FISCO BCOS 联盟链（教学可信联盟）'],
  },
  {
    name: '系统架构层',
    color: '#f8fafc',
    items: ['浏览器本地 SHA-256', 'ethers.js v6', 'Solidity 智能合约', '原文永不上传'],
  },
]

async function handleConnect() {
  try {
    await connect()
    ElMessage.success('钱包已连接，可以开始存证')
  } catch (e) {
    ElMessage.error(e.message || '连接失败')
  }
}
</script>

<template>
  <div>
    <!-- ============ 价值主张 ============ -->
    <section class="hero">
      <div class="hero-badge">
        <el-icon><Stamp /></el-icon>
        独立第三方存证与核验服务
      </div>
      <h1 class="hero-title">
        科研链证
        <span class="hero-sub">基于区块链的学术成果原创性与 AIGC 贡献存证平台</span>
      </h1>
      <p class="hero-lead">
        我们不替代任何写作或投稿平台。作者在任何地方写完论文、代码，
        都能在这里留下一个<strong>不可篡改的指纹</strong>；
        任何评审方、期刊、竞赛组委会都能<strong>独立验证</strong>其原创性与 AI 使用情况，
        <em>而不需要信任存证平台本身</em>。
      </p>

      <div class="hero-actions">
        <el-button v-if="!isConnected" type="primary" size="large" :loading="connecting" @click="handleConnect">
          <el-icon><Wallet /></el-icon>
          连接钱包开始存证
        </el-button>
        <template v-else>
          <el-button type="primary" size="large" @click="$router.push('/register')">
            <el-icon><EditPen /></el-icon>
            去登记成果
          </el-button>
          <span class="connected-hint">
            已连接 <span class="mono">{{ shortAddress }}</span>
          </span>
        </template>

        <el-button size="large" @click="$router.push('/verify')">
          <el-icon><View /></el-icon>
          我要核验一份文件
        </el-button>
      </div>

      <div class="hero-strip">
        <div class="strip-item">
          <el-icon><Lock /></el-icon>
          <span>原文永不上传服务器</span>
        </div>
        <div class="strip-item">
          <el-icon><Cpu /></el-icon>
          <span>浏览器本地计算 SHA-256</span>
        </div>
        <div class="strip-item">
          <el-icon><CircleCheck /></el-icon>
          <span>任何人可独立核验</span>
        </div>
      </div>
    </section>

    <!-- ============ 痛点 ============ -->
    <section class="card">
      <h2 class="card-title"><el-icon><WarningFilled /></el-icon> 我们要解决的问题</h2>
      <div class="pain-grid">
        <div v-for="p in pains" :key="p.title" class="pain-item">
          <div class="pain-title">{{ p.title }}</div>
          <div class="pain-desc">{{ p.desc }}</div>
        </div>
      </div>
    </section>

    <!-- ============ 四层架构图（D10）============ -->
    <section class="card">
      <h2 class="card-title"><el-icon><Grid /></el-icon> 系统架构（四层）</h2>
      <div class="arch">
        <div v-for="(layer, i) in layers" :key="layer.name" class="arch-layer">
          <div class="arch-name" :style="{ background: layer.color }">
            <span class="arch-idx">{{ layers.length - i }}</span>
            {{ layer.name }}
          </div>
          <div class="arch-items">
            <span v-for="it in layer.items" :key="it" class="arch-chip">{{ it }}</span>
          </div>
        </div>
      </div>
      <p class="arch-note text-muted">
        分层依据：<strong>原文与计算在链下，只有指纹与关键状态上链</strong>。
        因此系统没有性能瓶颈——核验是免费的只读查询，存证只写入 32 字节指纹。
      </p>
    </section>

    <!-- ============ 为什么必须是区块链 ============ -->
    <section class="card why">
      <h2 class="card-title"><el-icon><QuestionFilled /></el-icon> 为什么非要区块链？</h2>
      <div class="why-body">
        <p>
          因为这里需要的是<strong>互不信任的多方共同验证</strong>。
          如果用中心化数据库，<em>记录方同时就是验证方，自证没有意义</em>。
        </p>
        <p>
          而链上指纹 + 时间戳，让期刊、竞赛组委会、教务<strong>任何一方都能独立核验</strong>，
          不需要信任我们。
        </p>
        <div class="why-compare">
          <div class="compare-col bad">
            <div class="compare-head">中心化存证</div>
            <div class="compare-body">记录方 = 验证方，报告可 PS，结论不可复现</div>
          </div>
          <div class="compare-col good">
            <div class="compare-head">科研链证</div>
            <div class="compare-body">拿原文重算哈希即可验证，不依赖平台信用</div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ 链上信息 ============ -->
    <section class="card">
      <h2 class="card-title"><el-icon><Link /></el-icon> 当前部署信息</h2>
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">网络</div>
          <div class="info-value">{{ CURRENT_CHAIN.name }}</div>
        </div>
        <div class="info-item">
          <div class="info-label">合约地址</div>
          <div class="info-value mono">
            <a v-if="CURRENT_CHAIN.explorer" :href="explorerAddressUrl(CONTRACT_ADDRESS)" target="_blank" rel="noopener">
              {{ CONTRACT_ADDRESS }}
            </a>
            <span v-else>{{ CONTRACT_ADDRESS }}</span>
          </div>
        </div>
        <div class="info-item">
          <div class="info-label">源码验证</div>
          <div class="info-value">
            <el-tag v-if="CURRENT_CHAIN.explorer" type="success" size="small" effect="plain">
              已在 Etherscan 验证
            </el-tag>
            <span v-else>本地开发链</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ---------- Hero ---------- */
.hero {
  text-align: center;
  padding: 26px 0 34px;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--brand-primary);
  background: var(--brand-bg-soft);
  border-radius: 20px;
  padding: 5px 14px;
  margin-bottom: 16px;
}

.hero-title {
  margin: 0 0 16px;
  font-size: 40px;
  font-weight: 800;
  color: var(--brand-text-strong);
  letter-spacing: 2px;
}

.hero-sub {
  display: block;
  font-size: 15px;
  font-weight: 400;
  letter-spacing: 0;
  color: var(--brand-text-muted);
  margin-top: 8px;
}

.hero-lead {
  max-width: 760px;
  margin: 0 auto 26px;
  font-size: 15px;
  line-height: 1.85;
  color: var(--brand-text);
}

.hero-lead em {
  font-style: normal;
  color: var(--brand-primary);
  font-weight: 600;
}

.hero-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 22px;
}

.connected-hint {
  font-size: 13px;
  color: var(--brand-text-muted);
}

.hero-strip {
  display: flex;
  justify-content: center;
  gap: 26px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--brand-text-muted);
}

.strip-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* ---------- 痛点 ---------- */
.pain-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 14px;
}

.pain-item {
  border-left: 3px solid var(--brand-danger);
  background: #fef2f2;
  border-radius: 0 8px 8px 0;
  padding: 12px 14px;
}

.pain-title {
  font-weight: 600;
  color: #b91c1c;
  margin-bottom: 4px;
  font-size: 14px;
}

.pain-desc {
  font-size: 13px;
  color: var(--brand-text);
}

/* ---------- 架构图 ---------- */
.arch {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.arch-layer {
  display: grid;
  grid-template-columns: 190px 1fr;
  gap: 12px;
  align-items: center;
}

.arch-name {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--brand-border);
  font-weight: 600;
  font-size: 13px;
  color: var(--brand-text-strong);
}

.arch-idx {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--brand-primary);
  color: #fff;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.arch-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.arch-chip {
  font-size: 12.5px;
  padding: 7px 12px;
  border-radius: 7px;
  background: #fff;
  border: 1px solid var(--brand-border);
  color: var(--brand-text);
}

.arch-note {
  margin: 16px 0 0;
  font-size: 12.5px;
}

/* ---------- 为什么用区块链 ---------- */
.why-body p {
  margin: 0 0 12px;
  font-size: 14px;
}

.why-body em {
  font-style: normal;
  color: var(--brand-danger);
  font-weight: 600;
}

.why-compare {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.compare-col {
  border-radius: 8px;
  padding: 13px 15px;
  border: 1px solid;
}

.compare-col.bad {
  background: #fef2f2;
  border-color: #fecaca;
}

.compare-col.good {
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.compare-head {
  font-weight: 700;
  margin-bottom: 5px;
  font-size: 13.5px;
}

.compare-col.bad .compare-head {
  color: #b91c1c;
}

.compare-col.good .compare-head {
  color: #15803d;
}

.compare-body {
  font-size: 13px;
}

@media (max-width: 760px) {
  .hero-title {
    font-size: 28px;
  }
  .arch-layer {
    grid-template-columns: 1fr;
  }
}
</style>
