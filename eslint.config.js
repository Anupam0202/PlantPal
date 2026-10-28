import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dev-dist/**',
      '**/.wrangler/**',
      '**/node_modules/**',
      '**/routeTree.gen.ts',
      'playwright-report/**',
      'test-results/**',
      'apps/web/public/theme-init.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Render text as text. Raw HTML is not allowed (master prompt §19).',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'localStorage',
          message:
            'Garden records and secrets never live in localStorage. Use the Dexie store or the key vault.',
        },
        {
          object: 'window',
          property: 'localStorage',
          message:
            'Garden records and secrets never live in localStorage. Use the Dexie store or the key vault.',
        },
      ],
      // React Compiler-oriented rules from react-hooks v7 are advisory for now.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
    },
  },
  {
    // Viewing preferences mirror and legacy migration are the only allowed localStorage users.
    files: ['apps/web/src/state/prefs.ts', 'apps/web/src/data/legacy/**'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    // Browser tests seed v3 data and preferences in localStorage; Playwright fixtures call `use()`.
    files: ['apps/web/e2e/**'],
    rules: { 'no-restricted-properties': 'off', 'react-hooks/rules-of-hooks': 'off' },
  },
  {
    files: ['packages/domain/**', 'packages/schemas/**', 'packages/sync/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', '@plantpal/ui', 'dexie'],
              message: 'Domain code must stay free of UI and storage dependencies.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
);
