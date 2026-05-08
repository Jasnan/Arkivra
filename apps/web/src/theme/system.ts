import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

const config = defineConfig({
  theme: {
    tokens: {
      fonts: {
        body: { value: "'Inter', ui-sans-serif, system-ui, sans-serif" },

        heading: {
          value: "'Inter', ui-sans-serif, system-ui, sans-serif",
        },

        mono: {
          value:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        },
      },
    },

    semanticTokens: {
      colors: {
        // Background surfaces
        bg: {
          canvas: {
            value: { base: '#f5f6f8', _dark: '#0b0d12' },
          },

          surface: {
            value: { base: '#ffffff', _dark: '#11141b' },
          },

          elevated: {
            value: { base: '#ffffff', _dark: '#171b23' },
          },

          overlay: {
            value: { base: '#ffffff', _dark: '#1d222b' },
          },

          subtle: {
            value: { base: '#fafbfc', _dark: '#131720' },
          },

          muted: {
            value: { base: '#f1f3f5', _dark: '#0f131a' },
          },

          inverted: {
            value: { base: '#0b0d12', _dark: '#fafafa' },
          },

          // Status backgrounds
          error: {
            value: { base: '#fef2f2', _dark: '#341818' },
          },

          warning: {
            value: { base: '#fff8e8', _dark: '#332711' },
          },

          success: {
            value: { base: '#edfdf3', _dark: '#13281a' },
          },

          info: {
            value: { base: '#eef6ff', _dark: '#132235' },
          },
        },

        // Foreground/text colors
        fg: {
          DEFAULT: {
            value: { base: '#111827', _dark: '#e7eaf0' },
          },

          muted: {
            value: { base: '#4b5563', _dark: '#a1a8b3' },
          },

          subtle: {
            value: { base: '#6b7280', _dark: '#7b8494' },
          },

          inverted: {
            value: { base: '#fafafa', _dark: '#0b0d12' },
          },

          // Status foregrounds
          error: {
            value: { base: '#dc2626', _dark: '#f87171' },
          },

          warning: {
            value: { base: '#c77b07', _dark: '#f6c453' },
          },

          success: {
            value: { base: '#15803d', _dark: '#4ade80' },
          },

          info: {
            value: { base: '#2563eb', _dark: '#60a5fa' },
          },
        },

        // Border colors
        border: {
          DEFAULT: {
            value: { base: '#e3e7ea', _dark: '#242a35' },
          },

          subtle: {
            value: { base: '#edf1f3', _dark: '#1c212b' },
          },

          strong: {
            value: { base: '#d5dbe0', _dark: '#313846' },
          },

          inverted: {
            value: { base: '#111827', _dark: '#e7eaf0' },
          },
        },

        // Arkivra teal accents
        teal: {
          solid: {
            value: { base: '#178a7b', _dark: '#14b8a6' },
          },

          subtle: {
            value: { base: '#dff5f0', _dark: '#17352f' },
          },

          fg: {
            value: { base: '#11675d', _dark: '#5eead4' },
          },

          muted: {
            value: { base: '#9ee7d8', _dark: '#0c544d' },
          },

          hover: {
            value: { base: '#136f63', _dark: '#2dd4bf' },
          },

          focusRing: {
            value: {
              base: 'rgba(23, 138, 123, 0.35)',
              _dark: 'rgba(20, 184, 166, 0.35)',
            },
          },
        },
      },

      shadows: {
        xs: {
          value: {
            base: '0 1px 2px rgba(15, 23, 42, 0.04)',
            _dark: '0 1px 2px rgba(0, 0, 0, 0.22)',
          },
        },

        sm: {
          value: {
            base:
              '0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)',
            _dark: '0 2px 4px rgba(0, 0, 0, 0.28)',
          },
        },

        md: {
          value: {
            base:
              '0 4px 8px rgba(15, 23, 42, 0.05), 0 2px 4px rgba(15, 23, 42, 0.03)',
            _dark: '0 6px 12px rgba(0, 0, 0, 0.32)',
          },
        },

        lg: {
          value: {
            base:
              '0 12px 20px rgba(15, 23, 42, 0.06), 0 4px 8px rgba(15, 23, 42, 0.04)',
            _dark: '0 12px 24px rgba(0, 0, 0, 0.38)',
          },
        },

        xl: {
          value: {
            base:
              '0 24px 32px rgba(15, 23, 42, 0.08), 0 8px 16px rgba(15, 23, 42, 0.05)',
            _dark: '0 20px 32px rgba(0, 0, 0, 0.45)',
          },
        },
      },

      radii: {
        sm: { value: '0.375rem' },

        md: { value: '0.5rem' },

        lg: { value: '0.875rem' },

        xl: { value: '1rem' },

        '2xl': { value: '1.25rem' },
      },
    },
  },

  globalCss: {
    'html, body, #root': {
      minHeight: '100vh',
    },

    body: {
      fontFamily: 'body',
      bg: 'bg.canvas',
      color: 'fg',
      textRendering: 'optimizeLegibility',
      WebkitFontSmoothing: 'antialiased',
      MozOsxFontSmoothing: 'grayscale',
    },

    'button, input, select, textarea': {
      font: 'inherit',
    },
  },
});

export const arkivraSystem = createSystem(defaultConfig, config);
