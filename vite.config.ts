import { defineConfig } from 'vite';

// Client dev server on 3002 (matches the playground capture tooling).
// WebSocket traffic is proxied to the authoritative game server on 3001.
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3002,
    strictPort: true,
    proxy: {
      '/ws': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
      },
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
