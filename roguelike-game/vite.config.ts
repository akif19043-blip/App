import { defineConfig } from 'vitest/config';
import { spriteManifest } from './vite/spriteManifest';

export default defineConfig({
  // Relative asset paths so the build works from any sub-path or file host.
  base: './',
  plugins: [spriteManifest()],
  server: { host: true },
  build: { target: 'es2022', sourcemap: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
