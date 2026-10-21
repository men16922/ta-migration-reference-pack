import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 키트 API: `onprem-atlas serve --db … --port 8770`
    proxy: { '/api': `http://127.0.0.1:${process.env.ATLAS_API_PORT ?? '8770'}`, '/editor': `http://127.0.0.1:${process.env.ATLAS_API_PORT ?? '8770'}` },
  },
  preview: {
    proxy: { '/api': `http://127.0.0.1:${process.env.ATLAS_API_PORT ?? '8770'}`, '/editor': `http://127.0.0.1:${process.env.ATLAS_API_PORT ?? '8770'}` },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          carbon: ['@carbon/react', '@carbon/icons-react'],
        },
      },
    },
  },
});
