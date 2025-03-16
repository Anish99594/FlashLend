import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Explicitly polyfill 'buffer' module
      buffer: true,
      global: true, // Inject Buffer into global scope
    }),
  ],
  esbuild: {
    loader: 'jsx',
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.json': 'json' },
    },
  },
});