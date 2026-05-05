/**
 * ESLint flat config — estimate-app v1.
 *
 * order-app v4 동일 패턴 — React 의존성 폐기, legacy index.html 임베드 → vanilla DOM 만 사용.
 */
import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'dev-dist/**'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        HTMLElement: 'readonly',
        HTMLImageElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLButtonElement: 'readonly',
        Element: 'readonly',
        EventListener: 'readonly',
        EventListenerOrEventListenerObject: 'readonly',
        caches: 'readonly',
        Cache: 'readonly',
        CacheStorage: 'readonly',
        URLSearchParams: 'readonly',
        URL: 'readonly',
        Promise: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
]
