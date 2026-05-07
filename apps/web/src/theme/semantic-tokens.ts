import { defineSemanticTokens } from '@chakra-ui/react';

export const semanticTokens = defineSemanticTokens({
  colors: {
    app: {
      bg: { value: { base: '#eef3f7', _dark: '#08111f' } },
      shell: { value: { base: '#e4ebf1', _dark: '#0b1626' } },
      header: { value: { base: '#f7fafc', _dark: '#0f1c2d' } },
    },
    surface: {
      default: { value: { base: '#ffffff', _dark: '#111f31' } },
      subtle: { value: { base: '#f3f7fa', _dark: '#16263a' } },
      raised: { value: { base: '#ffffff', _dark: '#17273b' } },
      selected: { value: { base: '#e6f0f8', _dark: '#1b344f' } },
      strong: { value: { base: '#0f2742', _dark: '#d6e8f7' } },
    },
    border: {
      default: { value: { base: '#cfd9e3', _dark: '#26384d' } },
      subtle: { value: { base: '#dde6ee', _dark: '#1d2d40' } },
      focus: { value: { base: '#2f80c8', _dark: '#67b7f7' } },
    },
    text: {
      default: { value: { base: '#102033', _dark: '#e7eef6' } },
      muted: { value: { base: '#536477', _dark: '#9aaabd' } },
      subtle: { value: { base: '#748399', _dark: '#74869d' } },
      inverse: { value: { base: '#f8fbfd', _dark: '#0c1725' } },
    },
    accent: {
      default: { value: { base: '#256fa8', _dark: '#6db7f2' } },
      emphasis: { value: { base: '#17527f', _dark: '#9fd4ff' } },
      subtle: { value: { base: '#dcecf8', _dark: '#16314d' } },
      fg: { value: { base: '#0d3f63', _dark: '#d8edff' } },
    },
    status: {
      success: { value: { base: '#267451', _dark: '#79d9aa' } },
      successSubtle: { value: { base: '#dff5ea', _dark: '#123626' } },
      warning: { value: { base: '#a66b13', _dark: '#f0c46b' } },
      warningSubtle: { value: { base: '#fff2d6', _dark: '#3d2c12' } },
      danger: { value: { base: '#b43b4a', _dark: '#ff9aa7' } },
      dangerSubtle: { value: { base: '#fde5e8', _dark: '#45202a' } },
      info: { value: { base: '#226a9f', _dark: '#8ecdf8' } },
      infoSubtle: { value: { base: '#e1f0fa', _dark: '#143049' } },
    },
    document: {
      pdf: { value: { base: '#b43b4a', _dark: '#ff9aa7' } },
      image: { value: { base: '#287b5b', _dark: '#85dfb5' } },
      text: { value: { base: '#226a9f', _dark: '#8ecdf8' } },
      office: { value: { base: '#4860a8', _dark: '#a7b8ff' } },
      sheet: { value: { base: '#8a6a18', _dark: '#e8ce75' } },
      generic: { value: { base: '#536477', _dark: '#9aaabd' } },
    },
  },
});
