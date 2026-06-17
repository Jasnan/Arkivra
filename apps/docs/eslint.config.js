import antfu from '@antfu/eslint-config';

export default antfu({
  astro: true,

  stylistic: {
    semi: true,
  },

  ignores: ['.astro/**', 'dist/**', 'src/content/docs/**/*.md'],

  rules: {
    'curly': ['error', 'all'],
    'style/brace-style': ['error', '1tbs', { allowSingleLine: false }],
  },
});
