//
//import { defineConfig } from 'vite'
//import react from '@vitejs/plugin-react'
//import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
//export default defineConfig({
// plugins: [
//    react(),
//    tailwindcss(),
//  ],
//  base: './',
//  server: {
//    proxy: {
//      '/api': {
//        target: 'http://localhost:8000',
//        changeOrigin: true,
//        secure: false,
//      }
//    }
//  },
//})


import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
  // 어디에 배포되든 dist/ 하위에서 자산을 찾도록 상대 경로로 고정합니다.
  // (예: /HRClib/dist/ 에서 ./assets/... 로 로드)
  base: './',
  server: {
    // Vite dev(5173)에서 /api 요청을 FastAPI(8000)로 프록시
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  experimental: {
    // 일부 환경에서 base가 무시되고 /assets 로 고정되는 케이스를 방지하기 위해
    // HTML에서 생성되는 자산 URL을 강제로 상대경로로 렌더링합니다.
    renderBuiltUrl(filename, { hostType }) {
      if (hostType === 'html') {
        return { relative: true }
      }
      return filename
    },
  },
})