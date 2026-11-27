import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const src = (pkg: string) => fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url))

export default defineConfig({
  resolve: {
    // nei test i pacchetti del workspace si usano dai sorgenti, senza compilarli prima
    alias: { '@vitalegi/api-client': src('api-client') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['packages/*/src/**/__tests__/**/*.spec.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
})
