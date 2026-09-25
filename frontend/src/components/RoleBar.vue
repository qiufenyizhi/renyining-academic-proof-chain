<script setup>
// components/RoleBar.vue —— 角色提示条
// 演示脚本 D6：录屏时需要明确告诉评委「现在是作者视角还是核验方视角」。
// 三个角色由同一人分饰，但界面上必须看起来像三个独立方。
const props = defineProps({
  // author = 作者（学生） | verifier = 核验方（期刊/竞赛/教务） | arbitrator = 仲裁方
  role: { type: String, required: true },
})

const MAP = {
  author: {
    cls: 'author',
    icon: 'EditPen',
    label: '当前身份：作者（学生）',
    desc: '可以登记成果、声明 AIGC 贡献、追加新版本',
  },
  verifier: {
    cls: 'verifier',
    icon: 'View',
    label: '当前身份：核验方（期刊 / 竞赛组委会 / 教务）',
    desc: '只需拖入文件即可独立核验，无需登录、无需连接钱包',
  },
  arbitrator: {
    cls: 'author',
    icon: 'Stamp',
    label: '当前身份：仲裁方（教务 / 组委会）',
    desc: '查看成果完整履历并处理争议',
  },
}

const cfg = MAP[props.role] || MAP.author
</script>

<template>
  <div class="role-bar" :class="cfg.cls">
    <el-icon :size="18"><component :is="cfg.icon" /></el-icon>
    <span class="role-label">{{ cfg.label }}</span>
    <span class="role-desc">{{ cfg.desc }}</span>
  </div>
</template>

<style scoped>
.role-desc {
  opacity: 0.85;
  font-size: 12px;
}
</style>
