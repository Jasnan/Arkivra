import antfu from '@antfu/eslint-config';

export default antfu({
  typescript: true,
  react: true,
  rules: {
    'no-console': 'warn',
    'style/semi': ['error', 'always'],
  },
});
