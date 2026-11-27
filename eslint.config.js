import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import oxlint from 'eslint-plugin-oxlint'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  // le regole già coperte da oxlint non vengono ripetute da ESLint
  ...oxlint.configs['flat/recommended'],
)
