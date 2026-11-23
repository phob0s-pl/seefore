import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here('./src/ui'),
  plugins: [react()],
  build: {
    outDir: here('./dist/ui'),
    emptyOutDir: true,
  },
  server: {
    // `npm run dev`: the page comes from Vite, the model from the command.
    proxy: { '/api': 'http://127.0.0.1:4400' },
  },
  test: {
    root: here('.'),
    include: ['test/**/*.test.ts'],
  },
});
