import { createRouter, createWebHashHistory } from 'vue-router'

// 使用 hash 模式：静态托管（Vercel / GitHub Pages）无需服务端 rewrite 配置，
// 评委直接打开链接、刷新任意子页面都不会 404。
const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: '首页' },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/RegisterView.vue'),
    meta: { title: '存证登记', role: 'author' },
  },
  {
    path: '/verify',
    name: 'verify',
    component: () => import('@/views/VerifyView.vue'),
    meta: { title: '成果核验', role: 'verifier' },
  },
  {
    path: '/work/:id',
    name: 'work-detail',
    component: () => import('@/views/WorkDetailView.vue'),
    meta: { title: '存证详情' },
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { title: '数据看板' },
  },
  // 兜底：未知路径回首页
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.afterEach((to) => {
  const t = to.meta?.title
  document.title = t ? `${t} · 科研链证` : '科研链证 —— 学术成果原创性与AIGC贡献存证平台'
})

export default router
