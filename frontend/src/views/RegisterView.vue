<script setup>
// views/RegisterView.vue —— 存证登记（作者视角）
//
// 覆盖演示脚本 0:25 - 1:00：
//   D1 拖入文件后实时显示哈希 + 本地计算耗时
//   D2 明确标注「文件未上传，本地计算」
//   D3 提交成功后显示 workId + 链上时间戳（本地时间格式）
//   D8 Etherscan 交易链接（新窗口打开）
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import FileDropzone from '@/components/FileDropzone.vue'
import RoleBar from '@/components/RoleBar.vue'
import { useWallet } from '@/composables/useWallet.js'
import { WORK_TYPE, WORK_TYPE_LABEL, parseContractError } from '@/contracts/abi.js'
import { formatTimestamp } from '@/utils/format.js'
import { shortHash } from '@/utils/hash.js'
import { explorerTxUrl } from '@/contracts/config.js'

const router = useRouter()
const { isConnected, requireContract, isWrongChain } = useWallet()

const dropRef = ref(null)
const submitting = ref(false)
const checking = ref(false)
const existing = ref(null) // 若指纹已登记，存此处
const result = ref(null) // 登记成功结果

const form = reactive({
  title: '',
  workType: WORK_TYPE.Paper,
  aigcRatio: 0,
  metaURI: '',
  // AIGC 声明：勾选的工具 + 用途说明
  tools: [],
  toolsOther: '',
  usage: '',
})

const toolOptions = [
  'ChatGPT / GPT-4o',
  'Claude',
  'DeepSeek',
  'Copilot',
  'Cursor',
  'Gemini',
  '文心一言',
  '通义千问',
]

const canSubmit = computed(() => {
  return !!result.value === false && form.title.trim().length > 0 && !!currentHash.value
})

const currentHash = ref('')

// 使用说明文本：把勾选的工具与用途拼成上链字符串
function buildToolsText() {
  const parts = [...form.tools]
  if (form.toolsOther.trim()) parts.push(form.toolsOther.trim())
  const toolStr = parts.length ? parts.join(', ') : '未使用 AI 工具'
  return form.usage.trim() ? `${toolStr}（用途：${form.usage.trim()}）` : toolStr
}

function onHashed(fileInfo) {
  currentHash.value = fileInfo.hash
  existing.value = null
  result.value = null
  // 若用户还没填标题，用文件名（去扩展名）做个默认值，省一步操作
  if (!form.title.trim()) {
    form.title = fileInfo.name.replace(/\.[^.]+$/, '')
  }
  checkExisting(fileInfo.hash)
}

function onCleared() {
  currentHash.value = ''
  existing.value = null
  result.value = null
}

/// 上链前先查一遍：避免用户白跑一笔必然失败（且要花 gas 估算）的交易
async function checkExisting(hash) {
  checking.value = true
  try {
    const { ensureReadContract } = useWallet()
    const c = ensureReadContract()
    const r = await c.verifyWork(hash)
    if (r[0]) {
      existing.value = {
        workId: r[1].toString(),
        author: r[2],
        registeredAt: r[3],
        aigcRatio: Number(r[4]),
        title: r[5],
      }
    }
  } catch (e) {
    // 查询失败不阻塞流程，交给合约在提交时报错
    console.warn('预检查失败：', e)
  } finally {
    checking.value = false
  }
}

async function submit() {
  if (!isConnected.value) {
    ElMessage.warning('请先在右上角连接钱包')
    return
  }
  if (isWrongChain.value) {
    ElMessage.warning('钱包网络不正确，请先切换到目标网络')
    return
  }
  if (!form.title.trim()) {
    ElMessage.warning('请填写成果标题')
    return
  }
  if (!currentHash.value) {
    ElMessage.warning('请先选择要存证的文件')
    return
  }

  submitting.value = true
  try {
    const c = requireContract()
    const toolsText = buildToolsText()

    // 调用合约：registerWork(bytes32, string, uint8, uint8, string)
    const tx = await c.registerWork(
      currentHash.value,
      form.title.trim(),
      Number(form.workType),
      Number(form.aigcRatio),
      form.metaURI.trim()
    )
    ElMessage.info('交易已提交，等待链上确认…')
    const receipt = await tx.wait()

    // 从事件里取 workId（比再查一次 workCount 更可靠）
    let workId = null
    for (const log of receipt.logs) {
      try {
        const parsed = c.interface.parseLog(log)
        if (parsed && parsed.name === 'WorkRegistered') {
          workId = parsed.args.workId.toString()
          break
        }
      } catch {
        /* 忽略非本合约事件 */
      }
    }

    const work = workId ? await c.getWork(workId) : null

    result.value = {
      workId,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed?.toString(),
      registeredAt: work ? work.registeredAt : 0n,
      title: form.title.trim(),
      aigcRatio: Number(form.aigcRatio),
      toolsText,
      hash: currentHash.value,
      explorerUrl: explorerTxUrl(receipt.hash),
    }
    ElMessage.success('存证成功，已在链上留下不可篡改的记录')
  } catch (e) {
    ElMessage.error(parseContractError(e))
  } finally {
    submitting.value = false
  }
}

function resetAll() {
  result.value = null
  existing.value = null
  currentHash.value = ''
  form.title = ''
  form.workType = WORK_TYPE.Paper
  form.aigcRatio = 0
  form.metaURI = ''
  form.tools = []
  form.toolsOther = ''
  form.usage = ''
  dropRef.value?.clear()
}
</script>

<template>
  <div>
    <RoleBar role="author" />

    <h1 class="page-title">成果登记存证</h1>
    <p class="page-desc">
      选择文件 → 浏览器本地计算指纹 → 填写元信息与 AIGC 声明 → 上链存证。
      <strong>原文不会离开你的设备。</strong>
    </p>

    <!-- ============ 登记成功结果（D3）============ -->
    <div v-if="result" class="card success-card">
      <div class="success-head">
        <el-icon class="ok-icon" :size="40"><CircleCheckFilled /></el-icon>
        <div>
          <div class="success-title">存证成功</div>
          <div class="text-muted">该成果已写入区块链，任何人可独立核验</div>
        </div>
      </div>

      <div class="info-grid" style="margin: 18px 0">
        <div class="info-item">
          <div class="info-label">成果编号（workId）</div>
          <div class="info-value" style="font-size: 20px; color: var(--brand-primary)">
            #{{ result.workId ?? '—' }}
          </div>
        </div>
        <div class="info-item">
          <div class="info-label">链上登记时间</div>
          <div class="info-value">{{ formatTimestamp(result.registeredAt) }}</div>
        </div>
        <div class="info-item">
          <div class="info-label">标题</div>
          <div class="info-value">{{ result.title }}</div>
        </div>
        <div class="info-item">
          <div class="info-label">AIGC 介入比例</div>
          <div class="info-value">{{ result.aigcRatio }}%</div>
        </div>
        <div class="info-item">
          <div class="info-label">所在区块</div>
          <div class="info-value mono">{{ result.blockNumber }}</div>
        </div>
        <div class="info-item">
          <div class="info-label">消耗 gas</div>
          <div class="info-value mono">{{ result.gasUsed }}</div>
        </div>
      </div>

      <div class="info-label">内容指纹（SHA-256）</div>
      <div class="hash-box" style="margin-bottom: 12px">{{ result.hash }}</div>

      <div class="info-label">AIGC 声明（已上链）</div>
      <div class="declared-box" style="margin-bottom: 18px">{{ result.toolsText }}</div>

      <div class="success-actions">
        <el-button type="primary" @click="router.push(`/work/${result.workId}`)">
          查看存证详情与时间轴
        </el-button>
        <el-button v-if="result.explorerUrl" tag="a" :href="result.explorerUrl" target="_blank" rel="noopener">
          在 Etherscan 查看交易
          <el-icon><TopRight /></el-icon>
        </el-button>
        <el-button @click="resetAll">再登记一份</el-button>
      </div>
    </div>

    <!-- ============ 登记表单 ============ -->
    <template v-else>
      <!-- 步骤1：选择文件 -->
      <div class="card">
        <h2 class="card-title">
          <span class="step-no">1</span> 选择文件并计算指纹
        </h2>
        <FileDropzone
          ref="dropRef"
          title="拖拽论文 / 代码 / 数据集到此处，或点击选择"
          sub-title="支持任意格式。文件内容不会上传，只计算 SHA-256 指纹"
          @hashed="onHashed"
          @cleared="onCleared"
        />
      </div>

      <!-- 指纹已存在：给出友好引导，而不是让用户白花一笔 gas -->
      <el-alert
        v-if="existing"
        type="warning"
        :closable="false"
        show-icon
        style="margin-top: 16px"
      >
        <template #title>这份文件已经在链上登记过了</template>
        <div style="margin-top: 6px; font-size: 13px">
          成果编号 <strong>#{{ existing.workId }}</strong>，登记于
          {{ formatTimestamp(existing.registeredAt) }}，当前 AIGC 比例
          {{ existing.aigcRatio }}%。
          <div style="margin-top: 8px">
            <el-button size="small" type="primary" @click="router.push(`/work/${existing.workId}`)">
              查看该存证
            </el-button>
            <el-button size="small" @click="router.push('/verify')">去核验页确认</el-button>
          </div>
          <div style="margin-top: 8px" class="text-muted">
            若内容有更新，请到详情页使用「版本追加」，而不是重复登记。
          </div>
        </div>
      </el-alert>

      <!-- 步骤2：元信息 -->
      <div class="card">
        <h2 class="card-title"><span class="step-no">2</span> 填写成果信息</h2>
        <el-form label-position="top">
          <el-form-item label="成果标题（必填，将写入链上）">
            <el-input
              v-model="form.title"
              maxlength="100"
              show-word-limit
              placeholder="例如：基于区块链的学术成果存证方法研究"
            />
          </el-form-item>

          <el-form-item label="成果类型">
            <el-radio-group v-model="form.workType">
              <el-radio-button
                v-for="(label, val) in WORK_TYPE_LABEL"
                :key="val"
                :value="Number(val)"
              >
                {{ label }}
              </el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="扩展元信息指针（选填，可留空）">
            <el-input
              v-model="form.metaURI"
              placeholder="可填项目仓库地址、论文 DOI 等，demo 阶段留空即可"
            />
          </el-form-item>
        </el-form>
      </div>

      <!-- 步骤3：AIGC 声明 -->
      <div class="card">
        <h2 class="card-title">
          <span class="step-no">3</span> AIGC 贡献声明
          <el-tag size="small" type="primary" effect="plain">核心差异化功能</el-tag>
        </h2>
        <p class="text-muted" style="margin-top: -6px; font-size: 13px">
          如实声明 AI 的参与程度。此声明一经上链即<strong>无法篡改</strong>，
          作者事后无法改口——这正是评审方需要的可信依据。
        </p>

        <el-form label-position="top">
          <el-form-item label="使用了哪些 AI 工具（可多选）">
            <el-checkbox-group v-model="form.tools">
              <el-checkbox v-for="t in toolOptions" :key="t" :value="t">{{ t }}</el-checkbox>
            </el-checkbox-group>
            <el-input
              v-model="form.toolsOther"
              placeholder="其他工具，可自行填写"
              style="margin-top: 10px; max-width: 360px"
            />
          </el-form-item>

          <el-form-item label="AI 具体用途说明（选填）">
            <el-input
              v-model="form.usage"
              type="textarea"
              :rows="2"
              maxlength="200"
              show-word-limit
              placeholder="例如：辅助润色、生成初步框架、代码补全等"
            />
          </el-form-item>

          <el-form-item>
            <template #label>
              <span>AI 介入比例：<strong style="color: var(--brand-primary)">{{ form.aigcRatio }}%</strong></span>
            </template>
            <el-slider
              v-model="form.aigcRatio"
              :min="0"
              :max="100"
              :step="5"
              show-stops
              :marks="{ 0: '完全人工', 50: '一半', 100: '完全 AI' }"
            />
          </el-form-item>
        </el-form>

        <div class="declare-preview">
          <div class="info-label">将写入链上的声明文本</div>
          <div class="declared-box">{{ buildToolsText() }}</div>
        </div>
      </div>

      <!-- 提交 -->
      <div class="card submit-card">
        <div class="submit-left">
          <div class="info-label">摘要确认</div>
          <div class="submit-summary">
            <span>指纹 <span class="mono">{{ shortHash(currentHash) || '尚未选择文件' }}</span></span>
            <span>·</span>
            <span>AIGC {{ form.aigcRatio }}%</span>
            <span>·</span>
            <span>{{ WORK_TYPE_LABEL[form.workType] }}</span>
          </div>
          <div v-if="!isConnected" class="text-muted" style="font-size: 12.5px; margin-top: 4px">
            上链需要签名，请先连接钱包（右上角）
          </div>
        </div>
        <el-button
          type="primary"
          size="large"
          :loading="submitting"
          :disabled="!canSubmit"
          @click="submit"
        >
          <el-icon><Promotion /></el-icon>
          提交上链存证
        </el-button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.step-no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--brand-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.success-card {
  border-color: #bbf7d0;
  background: linear-gradient(180deg, #f0fdf4 0%, #fff 42%);
}

.success-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--brand-border);
}

.ok-icon {
  color: var(--brand-success);
}

.success-title {
  font-size: 20px;
  font-weight: 700;
  color: #15803d;
}

.success-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.declared-box {
  background: #f8fafc;
  border: 1px dashed var(--brand-border);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--brand-text-strong);
}

.declare-preview {
  margin-top: 6px;
}

.declare-preview .info-label {
  font-size: 12px;
  color: var(--brand-text-muted);
  margin-bottom: 5px;
}

.submit-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
}

.submit-summary {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--brand-text-strong);
}
</style>
