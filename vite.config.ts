import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

/** GitHub Pages serves this project from https://mustafaobaidd1.github.io/strut-topology/ */
export const REPO = 'strut-topology';

export default defineConfig({
  // Same base path in dev, preview and production, so path bugs show up locally.
  base: `/${REPO}/`,
  plugins: [svelte()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  // The solver worker imports shared modules, so it is emitted as an ES module worker.
  worker: { format: 'es' },
  server: { port: 5304, strictPort: true },
  preview: { port: 5404, strictPort: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
