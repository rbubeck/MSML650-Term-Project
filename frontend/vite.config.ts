import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Build against the same shared workspace source until package build ordering is finalized.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@live-transcription/contracts': fileURLToPath(
        new URL('../packages/contracts/src/index.ts', import.meta.url),
      ),
    },
  },
  server: { host: '127.0.0.1' },
});
