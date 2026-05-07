import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';
import { layerStyles } from './layer-styles';
import { semanticTokens } from './semantic-tokens';
import { textStyles } from './text-styles';

const config = defineConfig({
  theme: {
    tokens: {
      fonts: {
        body: { value: "'Inter', ui-sans-serif, system-ui, sans-serif" },
        heading: { value: "'Inter', ui-sans-serif, system-ui, sans-serif" },
        mono: {
          value:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        },
      },
      radii: {
        sm: { value: '0.375rem' },
        md: { value: '0.5rem' },
        lg: { value: '0.625rem' },
        xl: { value: '0.75rem' },
      },
    },
    semanticTokens,
    layerStyles,
    textStyles,
  },
  globalCss: {
    'html, body, #root': {
      minHeight: '100vh',
    },
    body: {
      bg: 'app.bg',
      color: 'text.default',
      fontFamily: 'body',
      WebkitFontSmoothing: 'antialiased',
      MozOsxFontSmoothing: 'grayscale',
    } as any,
    'button, input, select, textarea': {
      font: 'inherit',
    },
  },
});

export const arkivraSystem = createSystem(defaultConfig, config);
