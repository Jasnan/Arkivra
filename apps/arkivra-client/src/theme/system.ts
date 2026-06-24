import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

const config = defineConfig({
  theme: {
    tokens: {
      borders: {
        ui: { value: '1px solid {colors.border.surface}' },
        divider: { value: '1px solid {colors.border.divider}' },
      },

      fonts: {
        body: { value: 'var(--arkivra-font-body)' },

        chat: { value: 'var(--arkivra-font-chat)' },

        document: { value: 'var(--arkivra-font-document)' },

        heading: {
          value: 'var(--arkivra-font-heading)',
        },

        mono: {
          value: 'var(--arkivra-font-mono)',
        },

        sidebar: { value: 'var(--arkivra-font-sidebar)' },

        table: { value: 'var(--arkivra-font-table)' },
      },

      fontSizes: {
        '2xs': { value: '0.75rem' },
        xs: { value: 'var(--arkivra-font-size-xs)' },
        sm: { value: 'var(--arkivra-font-size-sm)' },
        md: { value: 'var(--arkivra-font-size-md)' },
        base: { value: 'var(--arkivra-font-size-md)' },
        lg: { value: 'var(--arkivra-font-size-lg)' },
        xl: { value: 'var(--arkivra-font-size-xl)' },
        '2xl': { value: 'var(--arkivra-font-size-2xl)' },
        '3xl': { value: 'var(--arkivra-font-size-3xl)' },
        '4xl': { value: 'var(--arkivra-font-size-4xl)' },
        '5xl': { value: 'calc(3rem * var(--arkivra-heading-scale))' },
        '6xl': { value: 'calc(3.75rem * var(--arkivra-heading-scale))' },
        '7xl': { value: 'calc(4.5rem * var(--arkivra-heading-scale))' },
      },

      letterSpacings: {
        body: { value: 'var(--arkivra-letter-spacing-body)' },
        heading: { value: 'var(--arkivra-letter-spacing-heading)' },
        display: { value: 'var(--arkivra-letter-spacing-display)' },
      },

      colors: {
        primary: {
          DEFAULT: { value: '#2d6dc3' },
          strong: { value: '#0066ff' },
          light: { value: '#8fb9ff' },
        },

        accent: {
          DEFAULT: { value: '#fad13b' },
        },

        neutral: {
          50: { value: '#f7f9fc' },
          100: { value: '#edf1f8' },
          200: { value: '#dfe4ed' },
          300: { value: '#c5cedb' },
          400: { value: '#92a1b7' },
          500: { value: '#677487' },
          600: { value: '#4f5a6d' },
          700: { value: '#3f4a5a' },
          800: { value: '#2c3542' },
          900: { value: '#19222f' },
          950: { value: '#10161f' },
        },
      },
    },

    textStyles: {
      xs: {
        value: {
          fontFamily: 'body',
          fontSize: 'xs',
          lineHeight: 'var(--arkivra-line-height-ui)',
        },
      },
      sm: {
        value: {
          fontFamily: 'body',
          fontSize: 'sm',
          lineHeight: 'var(--arkivra-line-height-ui)',
        },
      },
      md: {
        value: {
          fontFamily: 'body',
          fontSize: 'md',
          lineHeight: 'var(--arkivra-line-height-body)',
        },
      },
      lg: {
        value: {
          fontFamily: 'heading',
          fontSize: 'lg',
          letterSpacing: 'var(--arkivra-letter-spacing-heading)',
          lineHeight: 'var(--arkivra-line-height-heading)',
        },
      },
      xl: {
        value: {
          fontFamily: 'heading',
          fontSize: 'xl',
          letterSpacing: 'var(--arkivra-letter-spacing-heading)',
          lineHeight: 'var(--arkivra-line-height-heading)',
        },
      },
      '2xl': {
        value: {
          fontFamily: 'heading',
          fontSize: '2xl',
          letterSpacing: 'var(--arkivra-letter-spacing-heading)',
          lineHeight: 'var(--arkivra-line-height-heading)',
        },
      },
      '3xl': {
        value: {
          fontFamily: 'heading',
          fontSize: '3xl',
          letterSpacing: 'var(--arkivra-letter-spacing-display)',
          lineHeight: 'var(--arkivra-line-height-display)',
        },
      },
      '4xl': {
        value: {
          fontFamily: 'heading',
          fontSize: '4xl',
          letterSpacing: 'var(--arkivra-letter-spacing-display)',
          lineHeight: 'var(--arkivra-line-height-display)',
        },
      },
      body: {
        value: {
          fontFamily: 'body',
          fontSize: 'md',
          lineHeight: 'var(--arkivra-line-height-body)',
        },
      },
      bodySmall: {
        value: {
          fontFamily: 'body',
          fontSize: 'sm',
          lineHeight: 'var(--arkivra-line-height-ui)',
        },
      },
      small: {
        value: {
          fontFamily: 'body',
          fontSize: 'xs',
          lineHeight: 'var(--arkivra-line-height-ui)',
        },
      },
      chat: {
        value: {
          fontFamily: 'chat',
          fontSize: 'var(--arkivra-font-size-chat)',
          lineHeight: 'var(--arkivra-line-height-chat)',
        },
      },
      caption: {
        value: {
          fontFamily: 'body',
          fontSize: 'var(--arkivra-font-size-caption)',
          lineHeight: '1.4',
        },
      },
      display: {
        value: {
          fontFamily: 'heading',
          fontSize: '4xl',
          fontWeight: 'semibold',
          letterSpacing: 'var(--arkivra-letter-spacing-display)',
          lineHeight: 'var(--arkivra-line-height-display)',
        },
      },
      label: {
        value: {
          fontFamily: 'body',
          fontSize: 'var(--arkivra-font-size-label)',
          fontWeight: 'medium',
          lineHeight: 'var(--arkivra-line-height-ui)',
        },
      },
      sidebar: {
        value: {
          fontFamily: 'sidebar',
          fontSize: 'var(--arkivra-font-size-sidebar)',
          lineHeight: 'var(--arkivra-line-height-ui)',
        },
      },
      table: {
        value: {
          fontFamily: 'table',
          fontSize: 'var(--arkivra-font-size-table)',
          lineHeight: 'var(--arkivra-line-height-ui)',
        },
      },
      heading: {
        value: {
          fontFamily: 'heading',
          fontSize: 'xl',
          fontWeight: 'semibold',
          letterSpacing: 'var(--arkivra-letter-spacing-heading)',
          lineHeight: 'var(--arkivra-line-height-heading)',
        },
      },
      mono: {
        value: {
          fontFamily: 'mono',
          fontSize: 'sm',
          lineHeight: '1.6',
        },
      },
    },

    semanticTokens: {
      colors: {
        // Background surfaces
        bg: {
          canvas: {
            value: { base: '#fdfaf5', _dark: '#0b1220' },
          },

          surface: {
            value: { base: '#ffffff', _dark: '#0f1b2d' },
          },

          rail: {
            value: { base: '#faf9f5', _dark: '#0b1220' },
          },

          sidebar: {
            value: { base: '#ffffff', _dark: '#0b1220' },
          },

          header: {
            value: { base: '#faf9f5', _dark: '#0b1220' },
          },

          workspace: {
            value: { base: '#ffffff', _dark: '#0f1b2d' },
          },

          workspaceMuted: {
            value: { base: '#ffffff', _dark: '#0b1220' },
          },

          elevated: {
            value: { base: '#ffffff', _dark: '#0f1b2d' },
          },

          overlay: {
            value: { base: '#ffffff', _dark: '#0f1b2d' },
          },

          subtle: {
            value: { base: '#ffffff', _dark: '#0b1220' },
          },

          muted: {
            value: { base: '#ffffff', _dark: '#0f1b2d' },
          },

          modalHeader: {
            value: { base: '#ffffff', _dark: '#0f1b2d' },
          },

          modalContent: {
            value: { base: '#ffffff', _dark: '#0b1220' },
          },

          modalFooter: {
            value: { base: '#ffffff', _dark: '#0f1b2d' },
          },

          modalField: {
            value: { base: '#ffffff', _dark: '#0f1b2d' },
          },

          inverted: {
            value: { base: '#0b1220', _dark: '#fdfaf5' },
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
            value: { base: '#3f4a5a', _dark: '#c5cedb' },
          },

          heading: {
            value: { base: '#2d6dc3', _dark: '#3884eb' },
          },

          muted: {
            value: { base: '#4f5a6d', _dark: '#92a1b7' },
          },

          subtle: {
            value: { base: '#677487', _dark: '#92a1b7' },
          },

          tertiary: {
            value: { base: '#7a6550', _dark: '#9bb3d7' },
          },

          inverted: {
            value: { base: '#ffffff', _dark: '#0b1220' },
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
            value: { base: '#2d6dc3', _dark: '#8fb9ff' },
          },
        },

        // Border colors
        border: {
          DEFAULT: {
            value: { base: '#dfe4ed', _dark: '#2c3542' },
          },

          subtle: {
            value: { base: '#edf1f8', _dark: '#19222f' },
          },

          surface: {
            value: { base: '#dfe4ed', _dark: '#2c3542' },
          },

          divider: {
            value: { base: '#dfe4ed', _dark: '#2c3542' },
          },

          strong: {
            value: { base: '#c5cedb', _dark: '#3f4a5a' },
          },

          inverted: {
            value: { base: '#19222f', _dark: '#c5cedb' },
          },
        },

        // Compatibility alias used by the dashboard for the Arkivra primary accent.
        teal: {
          solid: {
            value: { base: '#2d6dc3', _dark: '#3884eb' },
          },

          subtle: {
            value: { base: '#edf1f8', _dark: 'rgba(56, 132, 235, 0.15)' },
          },

          fg: {
            value: { base: '#2d6dc3', _dark: '#8fb9ff' },
          },

          muted: {
            value: { base: '#8fb9ff', _dark: '#2d6dc3' },
          },

          hover: {
            value: { base: '#0066ff', _dark: '#8fb9ff' },
          },

          focusRing: {
            value: {
              base: 'rgba(45, 109, 195, 0.35)',
              _dark: 'rgba(143, 185, 255, 0.35)',
            },
          },
        },

        // Premium auth surfaces
        auth: {
          canvas: {
            value: { base: '#fdfaf5', _dark: '#0b1220' },
          },

          canvasEnd: {
            value: { base: '#faf9f5', _dark: '#0f1b2d' },
          },

          card: {
            value: {
              base: 'rgba(255, 255, 255, 0.72)',
              _dark: 'rgba(15, 27, 45, 0.72)',
            },
          },

          cardBorder: {
            value: {
              base: 'rgba(148, 163, 184, 0.16)',
              _dark: 'rgba(143, 185, 255, 0.16)',
            },
          },

          field: {
            value: {
              base: 'rgba(255, 255, 255, 0.68)',
              _dark: 'rgba(15, 27, 45, 0.68)',
            },
          },

          fieldBorder: {
            value: {
              base: 'rgba(148, 163, 184, 0.22)',
              _dark: 'rgba(143, 185, 255, 0.18)',
            },
          },

          fieldHover: {
            value: {
              base: 'rgba(255, 255, 255, 0.78)',
              _dark: 'rgba(15, 27, 45, 0.78)',
            },
          },

          primaryFrom: {
            value: { base: '#2d6dc3', _dark: '#3884eb' },
          },

          primaryTo: {
            value: { base: '#0066ff', _dark: '#2d6dc3' },
          },

          glow: {
            value: {
              base: 'rgba(45, 109, 195, 0.12)',
              _dark: 'rgba(56, 132, 235, 0.14)',
            },
          },

          horizon: {
            value: {
              base: 'rgba(45, 109, 195, 0.28)',
              _dark: 'rgba(143, 185, 255, 0.32)',
            },
          },

          link: {
            value: { base: '#2d6dc3', _dark: '#8fb9ff' },
          },

          particle: {
            value: {
              base: 'rgba(45, 109, 195, 0.16)',
              _dark: 'rgba(143, 185, 255, 0.16)',
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

        authCard: {
          value: {
            base:
              '0 8px 18px rgba(15, 23, 42, 0.045)',
            _dark:
              '0 10px 22px rgba(0, 0, 0, 0.2)',
          },
        },

        authButton: {
          value: {
            base: '0 4px 10px rgba(15, 118, 110, 0.1)',
            _dark: '0 5px 12px rgba(20, 184, 166, 0.14)',
          },
        },
      },

      radii: {
        sm: { value: '0.375rem' },

        md: { value: '0.5rem' },

        lg: { value: '0.875rem' },

        xl: { value: '1rem' },

        '2xl': { value: '1.25rem' },

        authCard: { value: '0.875rem' },

        authControl: { value: '0.5rem' },
      },
    },
  },

  globalCss: {
    'html, body, #root': {
      height: '100%',
      minHeight: '100vh',
      overflow: 'hidden',
    },

    body: {
      fontFamily: 'body',
      bg: 'bg.canvas',
      color: 'fg',
    },

    'h1, h2, h3': {
      color: 'fg.heading',
    },

    'button, input, select, textarea': {
      font: 'inherit',
    },

    ':where([data-scope="dialog"][data-part="content"], [data-scope="drawer"][data-part="content"], [data-scope="menu"][data-part="content"], [data-scope="popover"][data-part="content"], [data-scope="select"][data-part="content"])': {
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: 'border.surface',
    },
  },
});

export const arkivraSystem = createSystem(defaultConfig, config);
