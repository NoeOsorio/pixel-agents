import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { pixelAgentsPlugin } from '../standalone/vite-plugin.js';

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'standalone' ? [pixelAgentsPlugin()] : [])],
  build: {
    outDir: '../dist/webview',
    emptyOutDir: true,
  },
  base: './',
}));
