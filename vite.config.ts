import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages hosts the project site under /yuliang-life-sim/.
  // Production builds and the release-acceptance preview of that build need
  // the sub-path base; local `npm run dev` keeps serving from /.
  base: command === 'build' || isPreview ? '/yuliang-life-sim/' : '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: true,
  },
}));
