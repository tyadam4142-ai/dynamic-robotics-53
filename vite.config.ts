import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  // A new id on every build, appended to image URLs so browsers never show a stale logo.
  define: {__BUILD_ID__: JSON.stringify(String(Date.now()))},
  build: {outDir: 'dist', chunkSizeWarningLimit: 1500},
});
