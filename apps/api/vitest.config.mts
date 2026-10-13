import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC (not esbuild) so Nest's decorator metadata is emitted in tests too.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
    env: { NODE_ENV: 'test' },
    // Integration tests hash passwords (argon2) and hit a real database; under a busy CI or a
    // parallel turbo run the 5s default is too tight.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
