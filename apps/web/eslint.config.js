import antfu from '@antfu/eslint-config';

export default antfu({
  stylistic: false,
  typescript: true,
  react: true,
  rules: {
    'no-console': 'warn',
    'jsonc/sort-keys': 'off',
    'perfectionist/sort-exports': 'off',
    'perfectionist/sort-imports': 'off',
    'perfectionist/sort-named-exports': 'off',
    'perfectionist/sort-named-imports': 'off',
    'react/prefer-namespace-import': 'off',
  },
});
