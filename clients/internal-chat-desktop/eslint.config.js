import tsParser from '@typescript-eslint/parser'

export default [
  { ignores: ['out/**', 'release/**', 'node_modules/**', '*.config.js', '*.config.ts'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaVersion: 2022, sourceType: 'module' } },
  },
]
