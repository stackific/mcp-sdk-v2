// ESLint flat config for @stackific/mcp-sdk-ts (ESLint 10 + typescript-eslint 8).
//
// Scope: this SDK only (the monorepo's sibling stacks own their own linting).
// The codebase is edge-safe TypeScript, so `tsc --noEmit` (see `task typecheck`)
// already owns type-level correctness; ESLint here focuses on lint-level smells.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Never lint build output, deps, or generated docs.
  { ignores: ['dist/**', 'node_modules/**', 'docs/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // TypeScript's own checker resolves identifiers/globals (the SDK targets
      // `lib: ES2022` + Node types), so ESLint's `no-undef` is redundant noise here.
      'no-undef': 'off',
      // The protocol layer intentionally models open JSON with `unknown`/`any` at
      // the boundaries; surfacing every `any` would drown the signal.
      '@typescript-eslint/no-explicit-any': 'off',
      // Unused bindings are warnings, with the conventional `_`-prefix opt-out used
      // throughout the SDK for deliberately-ignored params/catch bindings.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // Tests assert against loosely-typed wire shapes; relax the noisiest rules there.
  {
    files: ['src/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
