<script setup>
// components/FileDropzone.vue
// 拖拽 / 点击选择文件 → 浏览器本地计算 SHA-256 → 显示指纹与耗时
//
// ⭐ 演示脚本 D1（实时显示哈希 + 耗时）与 D2（明确标注文件未上传）由本组件承载。
// 文件内容从不经过网络：整个流程只用 File.arrayBuffer() 与 Web Crypto。
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { sha256FileTimed, formatBytes, shortHash } from '@/utils/hash.js'

const props = defineProps({
  // 上传区主文案
  title: { type: String, default: '拖拽文件到此处，或点击选择' },
  subTitle: { type: String, default: '支持任意格式：论文、代码压缩包、数据集等' },
  // 是否显示耗时（核验页不需要太强调，登记页需要）
  showCost: { type: Boolean, default: true },
})

const emit = defineEmits(['hashed', 'cleared'])

const dragging = ref(false)
const computing = ref(false)
const fileInfo = ref(null) // { name, size, hash, costMs }
const inputRef = ref(null)

const hasFile = computed(() => !!fileInfo.value)

function pick() {
  inputRef.value?.click()
}

function onDrop(e) {
  dragging.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) handleFile(f)
}

function onSelect(e) {
  const f = e.target.files?.[0]
  if (f) handleFile(f)
  // 允许重复选择同一个文件
  e.target.value = ''
}

async function handleFile(file) {
  computing.value = true
  fileInfo.value = null
  try {
    const { hash, costMs } = await sha256FileTimed(file)
    fileInfo.value = {
      name: file.name,
      size: file.size,
      hash,
      costMs,
    }
    emit('hashed', fileInfo.value)
  } catch (err) {
    ElMessage.error('计算文件指纹失败：' + (err.message || err))
  } finally {
    computing.value = false
  }
}

function clear() {
  fileInfo.value = null
  emit('cleared')
}

// 供父组件读取当前文件信息
defineExpose({ clear, hasFile, fileInfo })
</script>

<template>
  <div>
    <input ref="inputRef" type="file" style="display: none" @change="onSelect" />

    <!-- 未选择文件：拖拽区 -->
    <div
      v-if="!hasFile && !computing"
      class="upload-zone"
      :class="{ dragover: dragging }"
      @click="pick"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <el-icon class="up-icon" :size="40"><UploadFilled /></el-icon>
      <div class="up-main">{{ title }}</div>
      <div class="up-sub">{{ subTitle }}</div>
      <div style="margin-top: 14px">
        <span class="privacy-note">
          <el-icon><Lock /></el-icon>
          文件不会上传服务器，指纹在浏览器本地计算
        </span>
      </div>
    </div>

    <!-- 计算中 -->
    <div v-else-if="computing" class="upload-zone">
      <el-icon class="up-icon is-loading" :size="34"><Loading /></el-icon>
      <div class="up-main">正在本地计算 SHA-256 指纹…</div>
      <div class="up-sub">此时没有任何数据被发送到网络</div>
    </div>

    <!-- 已算出指纹 -->
    <div v-else class="file-result">
      <div class="file-head">
        <div class="file-name">
          <el-icon><Document /></el-icon>
          <span>{{ fileInfo.name }}</span>
          <el-tag size="small" type="info" effect="plain">{{ formatBytes(fileInfo.size) }}</el-tag>
        </div>
        <el-button link type="primary" @click="clear">重新选择</el-button>
      </div>

      <div class="hash-label">
        <span>SHA-256 内容指纹</span>
        <span v-if="showCost" class="cost">
          本地计算耗时 <strong>{{ fileInfo.costMs }}</strong> ms
        </span>
        <span class="privacy-note">
          <el-icon><Lock /></el-icon>
          文件未上传
        </span>
      </div>

      <div class="hash-box">{{ fileInfo.hash }}</div>

      <div class="file-foot text-muted">
        指纹缩略：<span class="mono">{{ shortHash(fileInfo.hash) }}</span>
        · 这 32 字节是链上唯一凭据，原文始终留在你的设备上
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-result {
  border: 1px solid var(--brand-border);
  border-radius: var(--brand-radius);
  padding: 16px;
  background: #fff;
}

.file-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.file-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--brand-text-strong);
  min-width: 0;
}

.file-name span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hash-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--brand-text-muted);
  margin-bottom: 7px;
  flex-wrap: wrap;
}

.hash-label .cost strong {
  color: var(--brand-primary);
  font-family: var(--brand-mono);
}

.file-foot {
  margin-top: 9px;
  font-size: 12px;
}
</style>
