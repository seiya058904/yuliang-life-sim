import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // GitHub Pages hosts the project site under /yuliang-life-sim/.
  // Only production builds need the sub-path base; local `npm run dev`
  // keeps serving from /.
  base: command === 'build' ? '/yuliang-life-sim/' : '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: true,
  },
}));
