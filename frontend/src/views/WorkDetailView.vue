<script setup>
// views/WorkDetailView.vue —— 存证详情：完整履历 + 时间轴
//
// 覆盖演示脚本 2:20 - 2:40：
//   D7 时间轴（登记 → AIGC 声明 → 版本追加 → 争议）
//   D9 导出存证证书 PDF
//
// 时间轴数据来源分两部分：
//   - 链上状态（作者、时间、比例、版本数、争议）→ 合约 getWork
//   - 历史事件（版本指纹、AIGC 工具声明历史）→ 合约 getVersionHash / getAigcTools
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useWallet } from '@/composables/useWallet.js'
import { WORK_TYPE_LABEL, WORK_TYPE_TAG, parseContractError } from '@/contracts/abi.js'
import { formatTimestamp, relativeTime, aigcLevel, shortAddress } from '@/utils/format.js'
import { shortHash } from '@/utils/hash.js'
import { exportCertificate } from '@/utils/certificate.js'
import { CONTRACT_ADDRESS, CURRENT_CHAIN, explorerAddressUrl } from '@/contracts/config.js'

const route = useRoute()
const router = useRouter()
const { ensureReadContract, isConnected, requireContract, address } = useWallet()

const loading = ref(true)
const notFound = ref(false)
const work = ref(null)
const versionList = ref([]) // [{ version, hash }]
const toolsHistory = ref([]) // AIGC 工具声明历史

// 操作弹窗
const showVersionDialog = ref(false)
const showAigcDialog = ref(false)
const showDisputeDialog = ref(false)
const actionLoading = ref(false)

const versionForm = ref({ hash: '', ratio: 0 })
const aigcForm = ref({ ratio: 0, tools: '' })
const disputeForm = ref({ reason: '' })

const workId = computed(() => route.params.id)

const isOwner = computed(() => {
  if (!work.value || !address.value) return false
  return work.value.author.toLowerCase() === address.value.toLowerCase()
})

const aigc = computed(() => (work.value ? aigcLevel(work.value.aigcRatio) : null))

/// 时间轴：按时间顺序组装完整履历
const timeline = computed(() => {
  if (!work.value) return []
  const items = []

  items.push({
    key: 'registered',
    time: work.value.registeredAt,
    type: 'success',
    icon: 'CircleCheckFilled',
    title: '成果登记存证',
    desc: `作者 ${shortAddress(work.value.author)} 提交内容指纹，获得成果编号 #${work.value.workId}`,
    tag: '首次登记',
    detail: [{ label: '版本 1 指纹', value: versionList.value[0]?.hash || work.value.contentHash }],
  })

  // 每个历史版本一条记录（版本 1 已并入登记事件）
  versionList.value
    .filter((v) => v.version > 1)
    .forEach((v) => {
      items.push({
        key: `version-${v.version}`,
        time: work.value.updatedAt, // 合约未存每版时间，用最近更新时间近似并在页面注明
        type: 'primary',
        icon: 'Files',
        title: `追加第 ${v.version} 版`,
        desc: '提交新版本指纹，体现过程留痕。历史版本指纹永久保留，仍可单独核验。',
        tag: `v${v.version}`,
        detail: [{ label: `版本 ${v.version} 指纹`, value: v.hash }],
      })
    })

  // AIGC 声明历史
  toolsHistory.value.forEach((t, i) => {
    items.push({
      key: `aigc-${i}`,
      time: i === toolsHistory.value.length - 1 ? work.value.updatedAt : null,
      type: 'warning',
      icon: 'MagicStick',
      title: i === 0 ? 'AIGC 贡献声明' : `AIGC 声明更新（第 ${i + 1} 次）`,
      desc: '作者声明 AI 工具使用情况。声明一经上链不可篡改，作者无法事后改口。',
      tag: 'AIGC',
      detail: [{ label: '声明内容', value: t }],
    })
  })

  if (work.value.disputed) {
    items.push({
      key: 'dispute',
      time: null,
      type: 'danger',
      icon: 'WarningFilled',
      title: '争议登记',
      desc: '该成果已被发起争议，等待仲裁方处理。',
      tag: '争议',
      detail: [],
    })
  }

  // 时间已知的按时间正序；时间未知的排在最后
  return items.sort((a, b) => {
    if (!a.time) return 1
    if (!b.time) return -1
    return Number(a.time) - Number(b.time)
  })
})

async function load() {
  loading.value = true
  notFound.value = false
  try {
    const c = ensureReadContract()
    const id = BigInt(workId.value)
    const w = await c.getWork(id)

    if (!w.author || w.author === '0x0000000000000000000000000000000000000000') {
      notFound.value = true
      return
    }

    work.value = {
      workId: id.toString(),
      contentHash: w.contentHash,
      author: w.author,
      registeredAt: w.registeredAt,
      updatedAt: w.updatedAt,
      aigcRatio: Number(w.aigcRatio),
      workType: Number(w.workType),
      title: w.title,
      metaURI: w.metaURI,
      disputed: w.disputed,
      versionCount: Number(w.versionCount),
    }

    // 拉取各版本指纹
    const vs = []
    for (let i = 1; i <= work.value.versionCount; i++) {
      const h = await c.getVersionHash(id, i)
      vs.push({ version: i, hash: h })
    }
    versionList.value = vs

    // 拉取 AIGC 声明历史
    try {
      toolsHistory.value = await c.getAigcTools(id)
    } catch {
      toolsHistory.value = []
    }
  } catch (e) {
    if (String(e.message).includes('NotFound')) {
      notFound.value = true
    } else {
      ElMessage.error('加载存证详情失败：' + (e.message || e))
    }
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => route.params.id, load)

// ---------------- 操作：版本追加 ----------------
function openVersionDialog() {
  versionForm.value = { hash: '', ratio: work.value.aigcRatio }
  showVersionDialog.value = true
}

async function pickNewVersionFile(file) {
  const { sha256File } = await import('@/utils/hash.js')
  versionForm.value.hash = await sha256File(file)
}

async function submitVersion() {
  if (!versionForm.value.hash) {
    ElMessage.warning('请先选择新版本文件（或填写指纹）')
    return
  }
  actionLoading.value = true
  try {
    const c = requireContract()
    const tx = await c.addVersion(
      BigInt(workId.value),
      versionForm.value.hash,
      Number(versionForm.value.ratio)
    )
    await tx.wait()
    ElMessage.success('新版本已上链')
    showVersionDialog.value = false
    await load()
  } catch (e) {
    ElMessage.error(parseContractError(e))
  } finally {
    actionLoading.value = false
  }
}

// ---------------- 操作：AIGC 声明 ----------------
function openAigcDialog() {
  aigcForm.value = { ratio: work.value.aigcRatio, tools: '' }
  showAigcDialog.value = true
}

async function submitAigc() {
  if (!aigcForm.value.tools.trim()) {
    ElMessage.warning('请填写 AI 工具与用途说明')
    return
  }
  actionLoading.value = true
  try {
    const c = requireContract()
    const tx = await c.declareAIGC(
      BigInt(workId.value),
      Number(aigcForm.value.ratio),
      aigcForm.value.tools.trim()
    )
    await tx.wait()
    ElMessage.success('AIGC 声明已上链')
    showAigcDialog.value = false
    await load()
  } catch (e) {
    ElMessage.error(parseContractError(e))
  } finally {
    actionLoading.value = false
  }
}

// ---------------- 操作：争议登记 ----------------
async function submitDispute() {
  const reason = disputeForm.value.reason.trim()
  if (!reason) {
    ElMessage.warning('请填写争议原因')
    return
  }
  actionLoading.value = true
  try {
    const c = requireContract()
    const tx = await c.raiseDispute(BigInt(workId.value), reason)
    await tx.wait()
    ElMessage.success('争议已登记')
    showDisputeDialog.value = false
    disputeForm.value.reason = ''
    await load()
  } catch (e) {
    ElMessage.error(parseContractError(e))
  } finally {
    actionLoading.value = false
  }
}

// ---------------- 操作：导出证书 ----------------
//
// 实现说明：证书以「HTML + 浏览器打印」方式导出，而不是 jsPDF 直接生成 PDF。
// 原因：jsPDF 默认字体（Helvetica 等标准 PDF 字体）不含中文字形，
// 直接生成会导致中文乱码（2026-09-26 实测确认）。
// 改用浏览器打印可调用系统中文字体，产物为可搜索的矢量文字。
function handleExport() {
  try {
    const ok = exportCertificate({
      workId: work.value.workId,
      title: work.value.title,
      author: work.value.author,
      registeredAt: formatTimestamp(work.value.registeredAt),
      updatedAt: formatTimestamp(work.value.updatedAt),
      aigcRatio: work.value.aigcRatio,
      workTypeLabel: WORK_TYPE_LABEL[work.value.workType],
      versionCount: work.value.versionCount,
      contentHash: work.value.contentHash,
      tools: toolsHistory.value,
      disputed: work.value.disputed,
      contractAddress: CONTRACT_ADDRESS,
      chainName: CURRENT_CHAIN.name,
      explorer: CURRENT_CHAIN.explorer,
    })

    if (!ok) {
      ElMessage.warning('浏览器拦截了新窗口，请允许弹出窗口后重试')
      return
    }

    ElMessage({
      type: 'success',
      duration: 6000,
      message: '证书已在预览页打开，请在打印对话框中选「另存为 PDF」',
    })
  } catch (e) {
    ElMessage.error('导出失败：' + (e.message || e))
  }
}

async function confirmDispute() {
  try {
    await ElMessageBox.confirm(
      '争议记录会永久写入链上且无法撤销。确认发起争议吗？',
      '确认发起争议',
      { type: 'warning', confirmButtonText: '确认发起', cancelButtonText: '取消' }
    )
    await submitDispute()
  } catch {
    /* 用户取消 */
  }
}
</script>

<template>
  <div>
    <div v-if="loading" class="center text-muted" style="padding: 60px 0">
      <el-icon class="is-loading" :size="26"><Loading /></el-icon>
      <div style="margin-top: 10px">正在从链上读取存证记录…</div>
    </div>

    <el-empty v-else-if="notFound" description="未找到该存证记录">
      <el-button type="primary" @click="router.push('/register')">去登记一份新成果</el-button>
      <el-button @click="router.push('/verify')">去核验文件</el-button>
    </el-empty>

    <template v-else-if="work">
      <!-- ============ 头部 ============ -->
      <div class="detail-head">
        <div>
          <h1 class="page-title" style="margin-bottom: 8px">{{ work.title }}</h1>
          <div class="head-tags">
            <el-tag type="primary" effect="dark" size="small">成果编号 #{{ work.workId }}</el-tag>
            <el-tag :type="WORK_TYPE_TAG[work.workType]" size="small" effect="plain">
              {{ WORK_TYPE_LABEL[work.workType] }}
            </el-tag>
            <el-tag v-if="work.disputed" type="danger" size="small" effect="dark">争议中</el-tag>
            <el-tag v-if="work.versionCount > 1" type="info" size="small" effect="plain">
              共 {{ work.versionCount }} 个版本
            </el-tag>
          </div>
        </div>
        <el-button @click="handleExport">
          <el-icon><Printer /></el-icon>
          导出存证证书（PDF）
        </el-button>
      </div>

      <!-- ============ 元信息 ============ -->
      <div class="card">
        <h2 class="card-title"><el-icon><InfoFilled /></el-icon> 链上元信息</h2>
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">登记作者</div>
            <div class="info-value mono">
              <a
                v-if="explorerAddressUrl(work.author)"
                :href="explorerAddressUrl(work.author)"
                target="_blank"
                rel="noopener"
              >
                {{ work.author }}
              </a>
              <span v-else>{{ work.author }}</span>
              <el-tag v-if="isOwner" type="success" size="small" effect="plain" style="margin-left: 6px">
                这是你登记的
              </el-tag>
            </div>
          </div>
          <div class="info-item">
            <div class="info-label">链上登记时间</div>
            <div class="info-value">{{ formatTimestamp(work.registeredAt) }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">最近更新时间</div>
            <div class="info-value">{{ formatTimestamp(work.updatedAt) }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">AIGC 介入比例</div>
            <div class="info-value">
              <span style="font-size: 17px; color: var(--brand-primary); font-weight: 700">
                {{ work.aigcRatio }}%
              </span>
              <el-tag :type="aigc.type" size="small" effect="plain" style="margin-left: 8px">
                {{ aigc.text }}
              </el-tag>
            </div>
          </div>
          <div class="info-item" v-if="work.metaURI">
            <div class="info-label">扩展元信息</div>
            <div class="info-value mono">{{ work.metaURI }}</div>
          </div>
        </div>

        <div class="info-label" style="margin-top: 16px">当前版本内容指纹（SHA-256）</div>
        <div class="hash-box">{{ work.contentHash }}</div>
      </div>

      <!-- ============ 操作区 ============ -->
      <div class="card">
        <h2 class="card-title"><el-icon><Operation /></el-icon> 可执行操作</h2>
        <div class="action-row">
          <el-button :disabled="!isOwner" @click="openVersionDialog">
            <el-icon><Files /></el-icon>
            追加新版本
          </el-button>
          <el-button :disabled="!isOwner" @click="openAigcDialog">
            <el-icon><MagicStick /></el-icon>
            更新 AIGC 声明
          </el-button>
          <el-button type="danger" plain :disabled="work.disputed" @click="showDisputeDialog = true">
            <el-icon><WarningFilled /></el-icon>
            {{ work.disputed ? '已处于争议中' : '发起争议' }}
          </el-button>
        </div>
        <div v-if="!isConnected" class="text-muted" style="font-size: 12.5px; margin-top: 10px">
          只有成果登记人本人才能追加版本或更新声明；发起争议需连接钱包并支付少量 gas。
        </div>
        <div v-else-if="!isOwner" class="text-muted" style="font-size: 12.5px; margin-top: 10px">
          当前钱包不是该成果的登记人，因此追加版本与更新声明不可用（这是合约的权限保护）。
        </div>
      </div>

      <!-- ============ 时间轴（D7）============ -->
      <div class="card">
        <h2 class="card-title"><el-icon><Clock /></el-icon> 存证履历时间轴</h2>
        <el-timeline>
          <el-timeline-item
            v-for="item in timeline"
            :key="item.key"
            :type="item.type"
            :timestamp="item.time ? `${formatTimestamp(item.time)}（${relativeTime(item.time)}）` : '时间未单独记录'"
            placement="top"
            size="large"
          >
            <div class="tl-card">
              <div class="tl-head">
                <el-icon><component :is="item.icon" /></el-icon>
                <span class="tl-title">{{ item.title }}</span>
                <el-tag size="small" effect="plain">{{ item.tag }}</el-tag>
              </div>
              <div class="tl-desc">{{ item.desc }}</div>
              <div v-for="(d, i) in item.detail" :key="i" class="tl-detail">
                <span class="info-label">{{ d.label }}</span>
                <div class="hash-box" style="margin-top: 4px">{{ d.value }}</div>
              </div>
            </div>
          </el-timeline-item>
        </el-timeline>
        <div class="text-muted" style="font-size: 12px; margin-top: 6px">
          说明：合约只保存「最近更新时间」，历史版本与 AIGC 声明的具体时间由链上事件日志承载。
          演示阶段以最近更新时间为近似；答辩时可补充说明这一点。
        </div>
      </div>

      <!-- ============ AIGC 声明历史 ============ -->
      <div class="card" v-if="toolsHistory.length">
        <h2 class="card-title"><el-icon><MagicStick /></el-icon> AIGC 声明记录（全部上链）</h2>
        <el-table :data="toolsHistory.map((t, i) => ({ idx: i + 1, tools: t }))" size="small">
          <el-table-column prop="idx" label="序号" width="70" />
          <el-table-column prop="tools" label="声明内容" />
        </el-table>
      </div>

      <!-- ============ 各版本指纹 ============ -->
      <div class="card">
        <h2 class="card-title"><el-icon><Files /></el-icon> 版本指纹（历史版本仍可单独核验）</h2>
        <el-table :data="versionList" size="small">
          <el-table-column prop="version" label="版本" width="80">
            <template #default="{ row }">
              <el-tag size="small" :type="row.version === work.versionCount ? 'success' : 'info'" effect="plain">
                v{{ row.version }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="内容指纹" class-name="mono-cell">
            <template #default="{ row }">
              <span class="mono">{{ row.hash }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              {{ row.version === work.versionCount ? '当前版本' : '历史版本' }}
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>

    <!-- ============ 弹窗：追加版本 ============ -->
    <el-dialog v-model="showVersionDialog" title="追加新版本" width="560px">
      <el-alert type="info" :closable="false" show-icon style="margin-bottom: 14px">
        追加版本用于记录成果的迭代过程（过程留痕）。历史版本指纹会永久保留，仍可独立核验。
      </el-alert>
      <el-form label-position="top">
        <el-form-item label="新版本文件">
          <input
            type="file"
            @change="(e) => e.target.files[0] && pickNewVersionFile(e.target.files[0])"
          />
          <div class="text-muted" style="font-size: 12px; margin-top: 6px">
            选择文件后会在本地计算指纹，文件同样不会上传。
          </div>
        </el-form-item>
        <el-form-item label="新版本内容指纹">
          <el-input v-model="versionForm.hash" placeholder="选择文件后自动填充，也可手工粘贴" />
        </el-form-item>
        <el-form-item :label="`新版本的 AIGC 介入比例：${versionForm.ratio}%`">
          <el-slider v-model="versionForm.ratio" :min="0" :max="100" :step="5" show-stops />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showVersionDialog = false">取消</el-button>
        <el-button type="primary" :loading="actionLoading" @click="submitVersion">确认上链</el-button>
      </template>
    </el-dialog>

    <!-- ============ 弹窗：AIGC 声明 ============ -->
    <el-dialog v-model="showAigcDialog" title="更新 AIGC 贡献声明" width="560px">
      <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 14px">
        声明会追加写入链上记录，形成不可篡改的履历。此前的声明不会被删除。
      </el-alert>
      <el-form label-position="top">
        <el-form-item label="AI 工具与用途说明">
          <el-input
            v-model="aigcForm.tools"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="例如：ChatGPT-4o 辅助润色第 3 章，Copilot 补全数据处理脚本"
          />
        </el-form-item>
        <el-form-item :label="`AIGC 介入比例：${aigcForm.ratio}%`">
          <el-slider v-model="aigcForm.ratio" :min="0" :max="100" :step="5" show-stops />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAigcDialog = false">取消</el-button>
        <el-button type="primary" :loading="actionLoading" @click="submitAigc">确认上链</el-button>
      </template>
    </el-dialog>

    <!-- ============ 弹窗：争议登记 ============ -->
    <el-dialog v-model="showDisputeDialog" title="发起争议" width="520px">
      <el-form label-position="top">
        <el-form-item label="争议原因">
          <el-input
            v-model="disputeForm.reason"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="例如：疑似存在未声明的 AI 生成内容"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDisputeDialog = false">取消</el-button>
        <el-button type="danger" :loading="actionLoading" @click="confirmDispute">
          确认发起争议
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.head-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.tl-card {
  background: #fff;
  border: 1px solid var(--brand-border);
  border-radius: 10px;
  padding: 13px 15px;
}

.tl-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.tl-title {
  font-weight: 600;
  color: var(--brand-text-strong);
  font-size: 14px;
}

.tl-desc {
  font-size: 13px;
  color: var(--brand-text);
}

.tl-detail {
  margin-top: 10px;
}

.tl-detail .info-label {
  font-size: 12px;
  color: var(--brand-text-muted);
}

:deep(.mono-cell) {
  font-family: var(--brand-mono);
}
</style>
