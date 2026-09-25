<script setup>
// App.vue —— 全局骨架：顶栏（品牌 + 路由 + 钱包状态）+ 内容区 + 页脚
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useWallet } from '@/composables/useWallet.js'
import { CONTRACT_ADDRESS, CURRENT_CHAIN } from '@/contracts/config.js'

const route = useRoute()
const {
  isConnected,
  isWrongChain,
  shortAddress,
  balance,
  connecting,
  connect,
  switchChain,
  refreshBalance,
} = useWallet()

// 顶栏高亮的当前路由
const navItems = [
  { path: '/', label: '首页' },
  { path: '/register', label: '存证登记' },
  { path: '/verify', label: '成果核验' },
  { path: '/dashboard', label: '数据看板' },
]

async function handleConnect() {
  try {
    await connect()
    ElMessage.success('钱包已连接')
  } catch (e) {
    ElMessage.error(e.message || '连接失败')
  }
}

async function handleSwitch() {
  try {
    await switchChain()
  } catch (e) {
    ElMessage.error('切换网络失败：' + (e.message || e))
  }
}

async function copyAddress() {
  try {
    await navigator.clipboard.writeText(useWallet().address.value)
    ElMessage.success('钱包地址已复制')
  } catch {
    ElMessage.warning('复制失败，请手动选择')
  }
}

// 若之前已授权过，进入页面自动恢复连接（不必重复点按钮）
onMounted(async () => {
  if (window.ethereum?.selectedAddress) {
    try {
      await connect()
    } catch {
      /* 静默失败，用户可手动点击连接 */
    }
  }
})
</script>

<template>
  <div class="app-shell">
    <!-- ================= 顶栏 ================= -->
    <header class="app-header">
      <div class="header-inner">
        <router-link to="/" class="brand">
          <div class="brand-mark">
            <el-icon :size="20"><Stamp /></el-icon>
          </div>
          <div class="brand-text">
            <span class="brand-name">科研链证</span>
            <span class="brand-sub">学术成果原创性与 AIGC 贡献存证平台</span>
          </div>
        </router-link>

        <nav class="app-nav">
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="nav-link"
            :class="{ active: route.path === item.path }"
          >
            {{ item.label }}
          </router-link>
        </nav>

        <div class="header-right">
          <el-tag v-if="isConnected" size="small" effect="plain" class="chain-tag">
            <el-icon><Connection /></el-icon>
            {{ CURRENT_CHAIN.shortName }}
          </el-tag>

          <el-dropdown v-if="isConnected" trigger="click">
            <button class="wallet-chip">
              <span class="dot" />
              {{ shortAddress }}
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>
                  余额 {{ Number(balance).toFixed(4) }} {{ CURRENT_CHAIN.currency }}
                </el-dropdown-item>
                <el-dropdown-item divided @click="copyAddress">复制钱包地址</el-dropdown-item>
                <el-dropdown-item @click="refreshBalance">刷新余额</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <el-button v-else type="primary" :loading="connecting" @click="handleConnect">
            连接钱包
          </el-button>
        </div>
      </div>

      <!-- 网络不对时的醒目提示（演示与评委试用都可能遇到） -->
      <div v-if="isWrongChain" class="chain-warn">
        <el-icon><WarningFilled /></el-icon>
        <span>
          当前钱包网络与项目不匹配，需要切换到
          <strong>{{ CURRENT_CHAIN.name }}</strong>
        </span>
        <el-button size="small" type="warning" plain @click="handleSwitch">
          一键切换
        </el-button>
      </div>
    </header>

    <!-- ================= 内容区 ================= -->
    <main class="app-main">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- ================= 页脚 ================= -->
    <footer class="app-footer">
      <div class="footer-inner">
        <div class="footer-col">
          <strong>科研链证</strong>
          <span>独立第三方存证与核验服务 · 不替代任何写作或投稿平台</span>
        </div>
        <div class="footer-col footer-meta">
          <span>
            合约
            <code>{{ CONTRACT_ADDRESS.slice(0, 10) }}...{{ CONTRACT_ADDRESS.slice(-6) }}</code>
          </span>
          <span>网络 {{ CURRENT_CHAIN.name }}</span>
          <span>文件原文始终保留在本地浏览器，从不上传服务器</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ---------- 顶栏 ---------- */
.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--brand-border);
}

.header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  height: 64px;
  display: flex;
  align-items: center;
  gap: 28px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: inherit;
  flex-shrink: 0;
}

.brand-mark {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--brand-primary), #4f8ef7);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.brand-name {
  font-weight: 700;
  font-size: 16px;
  color: var(--brand-text-strong);
}

.brand-sub {
  font-size: 11px;
  color: var(--brand-text-muted);
}

.app-nav {
  display: flex;
  gap: 4px;
  flex: 1;
}

.nav-link {
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--brand-text-muted);
  text-decoration: none;
  transition: all 0.16s;
}

.nav-link:hover {
  background: var(--brand-bg-soft);
  color: var(--brand-primary);
}

.nav-link.active {
  background: var(--brand-bg-soft);
  color: var(--brand-primary);
  font-weight: 600;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.chain-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.wallet-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 13px;
  border-radius: 20px;
  border: 1px solid var(--brand-border);
  background: #fff;
  font-family: var(--brand-mono);
  font-size: 13px;
  color: var(--brand-text-strong);
  cursor: pointer;
  transition: all 0.16s;
}

.wallet-chip:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
}

.wallet-chip .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--brand-success);
}

.chain-warn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 9px 24px;
  background: #fdf6ec;
  border-top: 1px solid #f5dab1;
  color: #b88230;
  font-size: 13px;
}

/* ---------- 内容 ---------- */
.app-main {
  flex: 1;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  padding: 28px 24px 56px;
}

/* ---------- 页脚 ---------- */
.app-footer {
  border-top: 1px solid var(--brand-border);
  background: #fff;
}

.footer-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px 24px;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--brand-text-muted);
}

.footer-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.footer-col strong {
  color: var(--brand-text-strong);
  font-size: 13px;
}

.footer-meta {
  align-items: flex-end;
  text-align: right;
}

.footer-meta code {
  font-family: var(--brand-mono);
  background: var(--brand-bg-soft);
  padding: 1px 5px;
  border-radius: 4px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.16s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 900px) {
  .header-inner {
    height: auto;
    flex-wrap: wrap;
    padding: 10px 16px;
    gap: 12px;
  }
  .app-nav {
    order: 3;
    width: 100%;
    overflow-x: auto;
  }
  .footer-meta {
    align-items: flex-start;
    text-align: left;
  }
}
</style>
