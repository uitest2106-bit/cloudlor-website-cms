import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
    // Payload's dev-mode schema push runs on every `getPayload({ config })`
    // call (no migrations are configured), and each int spec file calls it
    // in its own `beforeAll`. Running files in parallel lets two pushes hit
    // the same Postgres database at once and race (duplicate enum/type
    // errors). Disabling file parallelism keeps that push serialized.
    fileParallelism: false,
  },
})
