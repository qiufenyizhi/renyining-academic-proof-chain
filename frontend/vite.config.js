import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 科研链证 —— Vite 配置
// 纯前端 SPA：构建产物可直接部署到 Vercel / GitHub Pages，无后端依赖
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // 端口被占用时直接报错，不要静默换成别的端口 ——
    // 录屏与演示需要固定地址，端口漂移会让人以为服务没起来
    strictPort: true,
    host: '127.0.0.1',
  },
  build: {
    outDir: 'dist',
    // 评委若用较旧浏览器也能打开
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
})
