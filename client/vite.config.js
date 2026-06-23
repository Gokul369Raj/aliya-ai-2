import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@monaco-editor/react') || id.includes('monaco-editor')) {
            return 'monaco'
          }

          if (id.includes('cytoscape')) {
            return 'graph-2d'
          }

          if (id.includes('/three/')) {
            return 'graph-three'
          }

          if (
            id.includes('react-force-graph-3d')
            || id.includes('3d-force-graph')
            || id.includes('three-forcegraph')
            || id.includes('three-spritetext')
          ) {
            return 'graph-3d'
          }

          return undefined
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
