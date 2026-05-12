import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';

/**
 * Repo-wide ESLint (flat config, single root file).
 *
 * Uses `recommended` presets (not type-checked strict mode) so `npm run lint` stays actionable
 * on this codebase without mass refactors; use `npm run check` for full `tsc` coverage.
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'coverage/**',
      '_import-storyteller-pom/**',
      'eslint.config.mjs',
      '*.json',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      /* Core rules — intentional patterns elsewhere in drivers / fixtures */
      'no-case-declarations': 'off',
      'no-empty-pattern': 'off',
      'no-unused-vars': 'off',
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',

      /* Narrator compares constructor prototypes safely with `prototype.isPrototypeOf`. */
      'no-prototype-builtins': 'off',

      /** Driver interface stubs expose `async` without `await` in default no-op paths. */
      '@typescript-eslint/require-await': 'off',
    },
  },
  eslintConfigPrettier,
);
