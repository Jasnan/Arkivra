import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

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
    },
  },
  globalCss: {
    'html, body, #root': {
      minHeight: '100vh',
    },
    body: {
      fontFamily: 'body',
    },
    'button, input, select, textarea': {
      font: 'inherit',
    },
  },
});

export const arkivraSystem = createSystem(defaultConfig, config);
