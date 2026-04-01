import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use relative paths so Electron's file:// protocol can load assets
  base: './',
  define: {
    // Required by @excalidraw/excalidraw to determine whether to use Preact build
    "process.env.IS_PREACT": JSON.stringify("false"),
  },
  build: {
    rollupOptions: {
      output: {
        // Split large dependencies into separate chunks for better caching
        // and reduced initial bundle size (Context7 + ViteConf 2024 best practice)
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
})
