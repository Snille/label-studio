import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const version = readFileSync(new URL('./VERSION', import.meta.url), 'utf8').trim();

// In development, Vite forwards the API to a label-service given in LABEL_SERVICE_URL (a local one by default).
export default defineConfig({
  plugins: [svelte()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    port: 5173,
    // Like the Studio server, the proxy drops the browser origin so label-service sees a server call.
    proxy: { '/api': { target: process.env.LABEL_SERVICE_URL || 'http://127.0.0.1:3230', changeOrigin: true,
      configure: proxy => proxy.on('proxyReq', request => request.removeHeader('origin')) } }
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 600 }
});
