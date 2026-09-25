<script setup>
// views/DashboardView.vue —— 数据看板
//
// 阶段3 先做「真实数据 + 轻量可视化」：不引入 ECharts，用 CSS 进度条呈现分布，
// 既能看到真实链上统计，也不增加构建体积。ECharts 图表留到阶段5 按优先级决定。
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useWallet } from '@/composables/useWallet.js'
import { WORK_TYPE_LABEL, WORK_TYPE_TAG } from '@/contracts/abi.js'
import { formatTimestamp, aigcLevel } from '@/utils/format.js'
import { shortHash } from '@/utils/hash.js'

const router = useRouter()
const { ensureReadContract } = useWallet()

const loading = ref(true)
const works = ref([])
const totalCount = ref(0)

const disputedCount = computed(() => works.value.filter((w) => w.disputed).length)
const multiVersionCount = computed(() => works.value.filter((w) => w.versionCount > 1).length)

const avgAigc = computed(() => {
  if (!works.value.length) return 0
  const sum = works.value.reduce((a, w) => a + w.aigcRatio, 0)
  return Math.round((sum / works.value.length) * 10) / 10
})

/// 按 AIGC 区间分布（每 20% 一档）
const aigcBuckets = computed(() => {
  const buckets = [
    { label: '0%（完全人工）', min: 0, max: 0, count: 0 },
    { label: '1% - 20%', min: 1, max: 20, count: 0 },
    { label: '21% - 40%', min: 21, max: 40, count: 0 },
    { label: '41% - 60%', min: 41, max: 60, count: 0 },
    { label: '61% - 80%', min: 61, max: 80, count: 0 },
    { label: '81% - 100%', min: 81, max: 100, count: 0 },
  ]
  works.value.forEach((w) => {
    const b = buckets.find((x) => w.aigcRatio >= x.min && w.aigcRatio <= x.max)
    if (b) b.count += 1
  })
  return buckets
})

const typeBuckets = computed(() => {
  const map = new Map()
  works.value.forEach((w) => {
    map.set(w.workType, (map.get(w.workType) || 0) + 1)
  })
  return [...map.entries()]
    .map(([type, count]) => ({ type, label: WORK_TYPE_LABEL[type], count }))
    .sort((a, b) => b.count - a.count)
})

const maxBucket = computed(() => Math.max(1, ...aigcBuckets.value.map((b) => b.count)))
const maxType = computed(() => Math.max(1, ...typeBuckets.value.map((b) => b.count)))

async function load() {
  loading.value = true
  try {
    const c = ensureReadContract()
    const count = Number(await c.workCount())
    totalCount.value = count

    // demo 规模下逐条读取足够；生产环境应改为事件索引
    const list = []
    for (let i = 1; i <= count; i++) {
      const w = await c.getWork(i)
      list.push({
        workId: i,
        contentHash: w.contentHash,
        author: w.author,
        registeredAt: w.registeredAt,
        aigcRatio: Number(w.aigcRatio),
        workType: Number(w.workType),
        title: w.title,
        disputed: w.disputed,
        versionCount: Number(w.versionCount),
      })
    }
    works.value = list.reverse() // 最新的在前
  } catch (e) {
    ElMessage.error('读取链上数据失败：' + (e.message || e))
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="dash-head">
      <div>
        <h1 class="page-title">数据看板</h1>
        <p class="page-desc" style="margin-bottom: 0">
          全部数据实时来自区块链，任何人可复算，不存在「平台自己统计」的问题。
        </p>
      </div>
      <el-button :loading="loading" @click="load">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </div>

    <div v-loading="loading">
      <!-- ============ 指标卡 ============ -->
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">存证总数</div>
          <div class="stat-value">{{ totalCount }}</div>
          <div class="stat-foot">链上 workCount</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">平均 AIGC 介入比例</div>
          <div class="stat-value">{{ avgAigc }}<span class="unit">%</span></div>
          <div class="stat-foot">全部成果均值</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">多版本成果</div>
          <div class="stat-value">{{ multiVersionCount }}</div>
          <div class="stat-foot">体现过程留痕</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">争议中</div>
          <div class="stat-value" :class="{ danger: disputedCount > 0 }">{{ disputedCount }}</div>
          <div class="stat-foot">待仲裁处理</div>
        </div>
      </div>

      <!-- ============ 分布 ============ -->
      <div class="two-col">
        <div class="card">
          <h2 class="card-title"><el-icon><DataAnalysis /></el-icon> AIGC 介入比例分布</h2>
          <div v-if="!works.length" class="text-muted center" style="padding: 20px 0">
            暂无存证数据
          </div>
          <div v-else class="bar-list">
            <div v-for="b in aigcBuckets" :key="b.label" class="bar-row">
              <div class="bar-label">{{ b.label }}</div>
              <div class="bar-track">
                <div
                  class="bar-fill aigc"
                  :style="{ width: (b.count / maxBucket) * 100 + '%' }"
                />
              </div>
              <div class="bar-count">{{ b.count }}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <h2 class="card-title"><el-icon><PieChart /></el-icon> 成果类型分布</h2>
          <div v-if="!typeBuckets.length" class="text-muted center" style="padding: 20px 0">
            暂无存证数据
          </div>
          <div v-else class="bar-list">
            <div v-for="b in typeBuckets" :key="b.type" class="bar-row">
              <div class="bar-label">{{ b.label }}</div>
              <div class="bar-track">
                <div class="bar-fill type" :style="{ width: (b.count / maxType) * 100 + '%' }" />
              </div>
              <div class="bar-count">{{ b.count }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ============ 明细表 ============ -->
      <div class="card">
        <h2 class="card-title"><el-icon><List /></el-icon> 存证明细（最新在前）</h2>
        <el-table
          :data="works"
          size="small"
          style="width: 100%"
          @row-click="(row) => router.push(`/work/${row.workId}`)"
          class="clickable-table"
        >
          <el-table-column prop="workId" label="编号" width="70">
            <template #default="{ row }">#{{ row.workId }}</template>
          </el-table-column>
          <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
          <el-table-column label="类型" width="90">
            <template #default="{ row }">
              <el-tag :type="WORK_TYPE_TAG[row.workType]" size="small" effect="plain">
                {{ WORK_TYPE_LABEL[row.workType] }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="AIGC" width="90">
            <template #default="{ row }">
              <el-tag :type="aigcLevel(row.aigcRatio).type" size="small" effect="plain">
                {{ row.aigcRatio }}%
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="版本" width="70">
            <template #default="{ row }">v{{ row.versionCount }}</template>
          </el-table-column>
          <el-table-column label="登记时间" width="165">
            <template #default="{ row }">{{ formatTimestamp(row.registeredAt) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <el-tag v-if="row.disputed" type="danger" size="small" effect="dark">争议</el-tag>
              <span v-else class="text-muted">正常</span>
            </template>
          </el-table-column>
          <el-table-column label="指纹" min-width="140">
            <template #default="{ row }">
              <span class="mono">{{ shortHash(row.contentHash, 8, 6) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dash-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.stat-card {
  background: #fff;
  border: 1px solid var(--brand-border);
  border-radius: var(--brand-radius);
  box-shadow: var(--brand-shadow);
  padding: 16px 18px;
}

.stat-label {
  font-size: 12.5px;
  color: var(--brand-text-muted);
  margin-bottom: 6px;
}

.stat-value {
  font-size: 28px;
  font-weight: 800;
  color: var(--brand-text-strong);
  line-height: 1.1;
}

.stat-value.danger {
  color: var(--brand-danger);
}

.stat-value .unit {
  font-size: 15px;
  font-weight: 600;
  margin-left: 2px;
  color: var(--brand-text-muted);
}

.stat-foot {
  font-size: 11.5px;
  color: var(--brand-text-muted);
  margin-top: 4px;
}

.two-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.bar-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bar-row {
  display: grid;
  grid-template-columns: 120px 1fr 34px;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
}

.bar-label {
  color: var(--brand-text-muted);
}

.bar-track {
  height: 10px;
  background: #f2f4f7;
  border-radius: 5px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.3s;
}

.bar-fill.aigc {
  background: linear-gradient(90deg, #6366f1, #2f6bff);
}

.bar-fill.type {
  background: linear-gradient(90deg, #22c55e, #16a34a);
}

.bar-count {
  text-align: right;
  font-family: var(--brand-mono);
  color: var(--brand-text-strong);
}

:deep(.clickable-table .el-table__row) {
  cursor: pointer;
}
</style>
