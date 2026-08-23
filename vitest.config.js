import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // `deprecated/` keeps retired directions in their original layout so that
    // anything can be restored by reversing its path. Their tests came with
    // them, and running tests for code the site no longer ships would report
    // failures nobody is going to fix.
    exclude: ['node_modules/**', 'deprecated/**', 'coverage/**'],
  },
});
