<script setup>
// views/VerifyView.vue —— 成果核验（核验方视角）⭐ 演示重点页
//
// 覆盖演示脚本 1:20 - 2:20：
//   D4 核验结果大字：✅ 核验通过 / ❌ 核验失败
//   D5 通过时展示作者地址、登记时间、AIGC 比例、标题
//   D6 角色提示条
//   D8 Etherscan 链接
//
// 关键设计：核验**不需要连接钱包、不需要登录**。
// 走只读 RPC 查询，任何评审方打开网页就能独立验证 —— 这正是产品定位的体现。
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import FileDropzone from '@/components/FileDropzone.vue'
import RoleBar from '@/components/RoleBar.vue'
import { useWallet } from '@/composables/useWallet.js'
import { WORK_TYPE_LABEL, WORK_TYPE_TAG } from '@/contracts/abi.js'
import { formatTimestamp } from '@/utils/format.js'
import { explorerAddressUrl } from '@/contracts/config.js'

const router = useRouter()
const { ensureReadContract } = useWallet()

const dropRef = ref(null)
const verifying = ref(false)
const verdict = ref(null) // 'pass' | 'fail'
const record = ref(null) // 通过时的链上记录
const failedHash = ref('') // 失败时的指纹
const checkedAt = ref('')

const canReverify = computed(() => !!verdict.value)

/// 核验主流程：本地算指纹 → 查链
async function onHashed(fileInfo) {
  verifying.value = true
  verdict.value = null
  record.value = null

  try {
    const c = ensureReadContract()
    const [exists, workId, author, registeredAt, aigcRatio, title] = await c.verifyWork(fileInfo.hash)

    checkedAt.value = formatTimestamp(Math.floor(Date.now() / 1000))

    if (exists) {
      const work = await c.getWork(workId)
      record.value = {
        workId: workId.toString(),
        author,
        registeredAt,
        updatedAt: work.updatedAt,
        aigcRatio: Number(aigcRatio),
        title,
        workType: Number(work.workType),
        versionCount: Number(work.versionCount),
        disputed: work.disputed,
        metaURI: work.metaURI,
        // 该文件对应的版本号：与当前版本一致则为最新版
        isCurrentVersion: work.contentHash === fileInfo.hash,
      }
      verdict.value = 'pass'
    } else {
      failedHash.value = fileInfo.hash
      verdict.value = 'fail'
    }
  } catch (e) {
    ElMessage.error('核验查询失败：' + (e.message || e))
  } finally {
    verifying.value = false
  }
}

function reset() {
  verdict.value = null
  record.value = null
  failedHash.value = ''
  dropRef.value?.clear()
}
</script>

<template>
  <div>
    <RoleBar role="verifier" />

    <h1 class="page-title">成果核验</h1>
    <p class="page-desc">
      拖入一份文件，即可判断它是否与链上登记记录完全一致。
      <strong>无需登录、无需连接钱包、不会上传文件。</strong>
    </p>

    <!-- ============ 核验结论（D4）============ -->
    <div v-if="verdict" class="verdict" :class="verdict === 'pass' ? 'ok' : 'fail'">
      <div class="verdict-icon">
        <el-icon v-if="verdict === 'pass'"><CircleCheckFilled /></el-icon>
        <el-icon v-else><CircleCloseFilled /></el-icon>
      </div>
      <div class="verdict-title">
        {{ verdict === 'pass' ? '核验通过' : '核验失败' }}
      </div>
      <div class="verdict-sub">
        <template v-if="verdict === 'pass'">
          该文件与链上登记记录<strong>完全一致</strong>，作者与登记时间均来自链上，未经任何中心平台转述。
        </template>
        <template v-else>
          该文件与链上任何登记记录<strong>均不匹配</strong>。内容可能已被修改，或从未存证。
        </template>
      </div>
      <div class="verdict-time text-muted">核验时间：{{ checkedAt }}</div>
    </div>

    <!-- ============ 通过：展示链上记录（D5）============ -->
    <div v-if="verdict === 'pass' && record" class="card" style="margin-top: 18px">
      <h2 class="card-title"><el-icon><DocumentChecked /></el-icon> 链上登记信息</h2>

      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">成果标题</div>
          <div class="info-value">{{ record.title }}</div>
        </div>
        <div class="info-item">
          <div class="info-label">成果编号</div>
          <div class="info-value">
            #{{ record.workId }}
            <el-tag v-if="record.disputed" type="danger" size="small" effect="dark" style="margin-left: 6px">
              争议中
            </el-tag>
          </div>
        </div>
        <div class="info-item">
          <div class="info-label">登记作者（钱包地址）</div>
          <div class="info-value mono">
            <a
              v-if="explorerAddressUrl(record.author)"
              :href="explorerAddressUrl(record.author)"
              target="_blank"
              rel="noopener"
            >
              {{ record.author }}
            </a>
            <span v-else>{{ record.author }}</span>
          </div>
        </div>
        <div class="info-item">
          <div class="info-label">链上登记时间</div>
          <div class="info-value">{{ formatTimestamp(record.registeredAt) }}</div>
        </div>
        <div class="info-item">
          <div class="info-label">成果类型</div>
          <div class="info-value">
            <el-tag :type="WORK_TYPE_TAG[record.workType]" size="small" effect="plain">
              {{ WORK_TYPE_LABEL[record.workType] }}
            </el-tag>
          </div>
        </div>
        <div class="info-item">
          <div class="info-label">AIGC 介入比例</div>
          <div class="info-value" style="font-size: 18px; color: var(--brand-primary)">
            {{ record.aigcRatio }}%
          </div>
        </div>
        <div class="info-item">
          <div class="info-label">版本</div>
          <div class="info-value">
            第 {{ record.versionCount }} 版
            <el-tag
              :type="record.isCurrentVersion ? 'success' : 'warning'"
              size="small"
              effect="plain"
              style="margin-left: 6px"
            >
              {{ record.isCurrentVersion ? '当前最新版' : '历史版本' }}
            </el-tag>
          </div>
        </div>
        <div class="info-item">
          <div class="info-label">最近更新时间</div>
          <div class="info-value">{{ formatTimestamp(record.updatedAt) }}</div>
        </div>
      </div>

      <div class="verify-actions">
        <el-button type="primary" @click="router.push(`/work/${record.workId}`)">
          查看完整履历与时间轴
        </el-button>
        <el-button @click="reset">核验另一份文件</el-button>
      </div>

      <el-alert type="success" :closable="false" show-icon style="margin-top: 16px">
        <template #title>这份结论第三方可以独立复现</template>
        任何人拿到同一份文件，用同样的方式重算 SHA-256 并查询链上数据，
        都会得到完全相同的结论——<strong>不需要信任本平台</strong>。
      </el-alert>
    </div>

    <!-- ============ 失败：解释原因 ============ -->
    <div v-if="verdict === 'fail'" class="card" style="margin-top: 18px">
      <h2 class="card-title"><el-icon><WarningFilled /></el-icon> 为什么核验失败</h2>
      <p style="margin-top: 0">
        该文件的指纹在链上<strong>没有任何登记记录</strong>。常见原因：
      </p>
      <ul class="fail-reasons">
        <li>文件内容被修改过——<strong>哪怕只改一个标点，SHA-256 也会完全不同</strong></li>
        <li>这份成果从未在本平台存证</li>
        <li>存证人使用了不同的文件版本（例如存证后又导出过一次）</li>
      </ul>

      <div class="info-label" style="margin-top: 14px">本次核验所用指纹</div>
      <div class="hash-box" style="margin-bottom: 16px">{{ failedHash }}</div>

      <div class="verify-actions">
        <el-button @click="reset">核验另一份文件</el-button>
        <el-button type="primary" plain @click="router.push('/register')">
          去登记这份文件
        </el-button>
      </div>
    </div>

    <!-- ============ 核验入口 ============ -->
    <div v-if="!verdict" class="card">
      <h2 class="card-title"><el-icon><UploadFilled /></el-icon> 拖入待核验的文件</h2>
      <FileDropzone
        ref="dropRef"
        title="拖拽文件到此处，或点击选择"
        sub-title="核验在本地完成指纹计算，仅用指纹查询链上数据"
        @hashed="onHashed"
      />
      <div v-if="verifying" class="text-muted center" style="margin-top: 12px">
        <el-icon class="is-loading"><Loading /></el-icon>
        正在查询链上记录…
      </div>
    </div>

    <!-- 核验就绪后仍保留上传入口，方便连续核验 -->
    <div v-if="verdict" class="card">
      <h2 class="card-title"><el-icon><Refresh /></el-icon> 继续核验</h2>
      <FileDropzone
        ref="dropRef"
        title="拖入另一份文件继续核验"
        sub-title="可用于对比「改一个标点」前后的差异"
        @hashed="onHashed"
      />
    </div>
  </div>
</template>

<style scoped>
.verdict-time {
  margin-top: 14px;
  font-size: 12px;
}

.verify-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 18px;
}

.fail-reasons {
  margin: 8px 0 0;
  padding-left: 20px;
  font-size: 13.5px;
  line-height: 1.9;
}

.fail-reasons strong {
  color: var(--brand-danger);
}
</style>
