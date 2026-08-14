import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
    passWithNoTests: false,
  },
  resolve: {
    alias: {
      '@samhan/design-system': resolve(__dirname, '../web/design-system/src/index.ts'),
      '@samhan/design-system/tokens.css': resolve(__dirname, '../web/design-system/src/tokens/tokens.css'),
      '@samhan/design-system/style.css': resolve(__dirname, '../web/design-system/src/styles/fonts.css'),
      react: resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom'),
    },
  },
})
