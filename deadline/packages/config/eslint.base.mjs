import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Shared ESLint rules for every DEADLINE package.
 *
 * The important ones are the bans: no `any`, no unused code, and no loose
 * equality. Those are the rules that keep a codebase this size honest.
 */
export const deadlineRules = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
  ],
  '@typescript-eslint/consistent-type-imports': [
    'warn',
    { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
  ],
  eqeqeq: ['error', 'smart'],
  'prefer-const': 'error',
  'no-console': 'off',
};

/** Flat-config preset. Spread it into a package's eslint.config.mjs. */
export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: deadlineRules,
  },
  {
    ignores: ['dist/**', '.next/**', 'node_modules/**', 'coverage/**', '*.config.*'],
  },
];
