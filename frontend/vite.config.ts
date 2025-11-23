import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import nodeGlobalsPolyfill from '@esbuild-plugins/node-globals-polyfill'
import nodeModulesPolyfill from '@esbuild-plugins/node-modules-polyfill'
import nodePolyfills from 'rollup-plugin-node-polyfills'

// Some package managers/ESM interop cases surface these plugins as objects.
const NodeGlobalsPolyfillPlugin =
  (nodeGlobalsPolyfill as any).NodeGlobalsPolyfillPlugin || nodeGlobalsPolyfill
const NodeModulesPolyfillPlugin =
  (nodeModulesPolyfill as any).NodeModulesPolyfillPlugin || nodeModulesPolyfill

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      process: 'process/browser',
      util: 'util',
      stream: 'stream-browserify',
      assert: 'assert',
      events: 'events',
      buffer: 'buffer',
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
        process: 'process',
      },
      plugins: [
        NodeGlobalsPolyfillPlugin({
          process: true,
          buffer: true,
        }),
        NodeModulesPolyfillPlugin(),
      ],
    },
  },
  build: {
    rollupOptions: {
      plugins: [nodePolyfills()],
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
