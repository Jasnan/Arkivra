import antfu from '@antfu/eslint-config';

export default antfu({
  stylistic: false,
  typescript: true,
  rules: {
    'no-console': 'warn',
    'e18e/prefer-static-regex': 'off',
    'import/first': 'off',
    'jsonc/sort-keys': 'off',
    'node/prefer-global/buffer': 'off',
    'node/prefer-global/process': 'off',
    'perfectionist/sort-exports': 'off',
    'perfectionist/sort-imports': 'off',
    'perfectionist/sort-named-exports': 'off',
    'perfectionist/sort-named-imports': 'off',
    'test/consistent-test-it': 'off',
    'ts/consistent-type-definitions': 'off',
  },
});
