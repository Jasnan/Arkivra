import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

// Catppuccin palette values are from https://catppuccin.com/palette/ (MIT).
const catppuccin = {
  latte: {
    rosewater: '#dc8a78',
    flamingo: '#dd7878',
    pink: '#ea76cb',
    mauve: '#8839ef',
    red: '#d20f39',
    maroon: '#e64553',
    peach: '#fe640b',
    yellow: '#df8e1d',
    green: '#40a02b',
    teal: '#179299',
    sky: '#04a5e5',
    sapphire: '#209fb5',
    blue: '#1e66f5',
    lavender: '#7287fd',
    text: '#4c4f69',
    subtext1: '#5c5f77',
    subtext0: '#6c6f85',
    overlay2: '#7c7f93',
    overlay1: '#8c8fa1',
    overlay0: '#9ca0b0',
    surface2: '#acb0be',
    surface1: '#bcc0cc',
    surface0: '#ccd0da',
    base: '#eff1f5',
    mantle: '#e6e9ef',
    crust: '#dce0e8',
  },
  mocha: {
    rosewater: '#f5e0dc',
    flamingo: '#f2cdcd',
    pink: '#f5c2e7',
    mauve: '#cba6f7',
    red: '#f38ba8',
    maroon: '#eba0ac',
    peach: '#fab387',
    yellow: '#f9e2af',
    green: '#a6e3a1',
    teal: '#94e2d5',
    sky: '#89dceb',
    sapphire: '#74c7ec',
    blue: '#89b4fa',
    lavender: '#b4befe',
    text: '#cdd6f4',
    subtext1: '#bac2de',
    subtext0: '#a6adc8',
    overlay2: '#9399b2',
    overlay1: '#7f849c',
    overlay0: '#6c7086',
    surface2: '#585b70',
    surface1: '#45475a',
    surface0: '#313244',
    base: '#1e1e2e',
    mantle: '#181825',
    crust: '#11111b',
  },
} as const;

const latte = catppuccin.latte;
const mocha = catppuccin.mocha;

const alpha = (hex: string, opacity: number) => {
  const value = hex.replace('#', '');
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
};

const makeColorPalette = (
  light: string,
  dark: string,
  lightSubtle: string,
  darkSubtle: string,
  lightMuted: string,
  darkMuted: string,
  lightFg = light,
  darkFg = dark,
) => ({
  solid: {
    value: { base: light, _dark: dark },
  },
  subtle: {
    value: { base: lightSubtle, _dark: darkSubtle },
  },
  fg: {
    value: { base: lightFg, _dark: darkFg },
  },
  muted: {
    value: { base: lightMuted, _dark: darkMuted },
  },
  hover: {
    value: { base: lightFg, _dark: darkFg },
  },
  focusRing: {
    value: { base: alpha(light, 0.35), _dark: alpha(dark, 0.38) },
  },
});

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
          DEFAULT: { value: latte.blue },
          strong: { value: latte.sapphire },
          light: { value: mocha.blue },
        },

        accent: {
          DEFAULT: { value: latte.peach },
        },

        neutral: {
          50: { value: latte.base },
          100: { value: latte.mantle },
          200: { value: latte.crust },
          300: { value: latte.surface0 },
          400: { value: latte.surface2 },
          500: { value: latte.overlay1 },
          600: { value: latte.overlay2 },
          700: { value: latte.subtext0 },
          800: { value: latte.subtext1 },
          900: { value: latte.text },
          950: { value: mocha.crust },
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
            value: { base: latte.base, _dark: mocha.base },
          },

          surface: {
            value: { base: latte.base, _dark: mocha.surface0 },
          },

          rail: {
            value: { base: latte.mantle, _dark: mocha.mantle },
          },

          sidebar: {
            value: { base: latte.mantle, _dark: mocha.mantle },
          },

          header: {
            value: { base: latte.mantle, _dark: mocha.mantle },
          },

          workspace: {
            value: { base: latte.base, _dark: mocha.base },
          },

          workspaceMuted: {
            value: { base: latte.mantle, _dark: mocha.mantle },
          },

          cardHover: {
            value: { base: latte.surface0, _dark: mocha.surface0 },
          },

          elevated: {
            value: { base: latte.base, _dark: mocha.surface0 },
          },

          overlay: {
            value: { base: latte.base, _dark: mocha.surface0 },
          },

          subtle: {
            value: { base: latte.base, _dark: mocha.surface0 },
          },

          muted: {
            value: { base: latte.mantle, _dark: mocha.mantle },
          },

          modalHeader: {
            value: { base: latte.base, _dark: mocha.surface0 },
          },

          modalContent: {
            value: { base: latte.base, _dark: mocha.base },
          },

          modalFooter: {
            value: { base: latte.base, _dark: mocha.surface0 },
          },

          modalField: {
            value: { base: latte.base, _dark: mocha.surface0 },
          },

          inverted: {
            value: { base: mocha.crust, _dark: latte.base },
          },

          // Status backgrounds
          error: {
            value: { base: alpha(latte.red, 0.12), _dark: alpha(mocha.red, 0.14) },
          },

          warning: {
            value: { base: alpha(latte.yellow, 0.14), _dark: alpha(mocha.yellow, 0.14) },
          },

          success: {
            value: { base: alpha(latte.green, 0.12), _dark: alpha(mocha.green, 0.14) },
          },

          info: {
            value: { base: alpha(latte.blue, 0.12), _dark: alpha(mocha.blue, 0.14) },
          },
        },

        // App shell colors follow Catppuccin VS Code Explorer/file tree defaults.
        shell: {
          sideBar: {
            value: { base: latte.mantle, _dark: mocha.mantle },
          },

          sideBarSectionHeader: {
            value: { base: latte.mantle, _dark: mocha.mantle },
          },

          secondarySideBar: {
            value: { base: latte.base, _dark: mocha.base },
          },

          sideBarTitleForeground: {
            value: { base: latte.text, _dark: mocha.text },
          },

          editor: {
            value: { base: latte.base, _dark: mocha.base },
          },

          foreground: {
            value: { base: latte.text, _dark: mocha.text },
          },

          inactiveForeground: {
            value: { base: latte.subtext1, _dark: mocha.subtext1 },
          },

          hoverBackground: {
            value: { base: alpha(latte.surface0, 0.52), _dark: alpha(mocha.surface0, 0.58) },
          },

          selectionBackground: {
            value: { base: alpha(latte.surface0, 0.74), _dark: alpha(mocha.surface0, 0.78) },
          },

          selectionForeground: {
            value: { base: latte.text, _dark: mocha.text },
          },

          accentForeground: {
            value: { base: latte.blue, _dark: mocha.blue },
          },

          border: {
            value: { base: 'transparent', _dark: 'transparent' },
          },

          secondaryBorder: {
            value: { base: latte.surface1, _dark: mocha.surface1 },
          },
        },

        // Foreground/text colors
        fg: {
          DEFAULT: {
            value: { base: latte.text, _dark: mocha.text },
          },

          heading: {
            value: { base: latte.text, _dark: mocha.text },
          },

          muted: {
            value: { base: latte.subtext1, _dark: mocha.subtext1 },
          },

          subtle: {
            value: { base: latte.subtext0, _dark: mocha.subtext0 },
          },

          tertiary: {
            value: { base: latte.overlay2, _dark: mocha.overlay2 },
          },

          inverted: {
            value: { base: '#ffffff', _dark: mocha.crust },
          },

          // Status foregrounds
          error: {
            value: { base: latte.red, _dark: mocha.red },
          },

          warning: {
            value: { base: latte.yellow, _dark: mocha.yellow },
          },

          success: {
            value: { base: latte.green, _dark: mocha.green },
          },

          info: {
            value: { base: latte.blue, _dark: mocha.blue },
          },
        },

        // Border colors
        border: {
          DEFAULT: {
            value: { base: latte.surface1, _dark: mocha.surface1 },
          },

          subtle: {
            value: { base: latte.surface0, _dark: mocha.surface0 },
          },

          surface: {
            value: { base: latte.surface0, _dark: mocha.surface1 },
          },

          divider: {
            value: { base: latte.surface0, _dark: mocha.surface1 },
          },

          strong: {
            value: { base: latte.surface2, _dark: mocha.surface2 },
          },

          inverted: {
            value: { base: latte.text, _dark: mocha.text },
          },
        },

        // Compatibility alias used by the dashboard for the Arkivra primary accent.
        teal: {
          ...makeColorPalette(
            latte.blue,
            mocha.blue,
            alpha(latte.blue, 0.12),
            alpha(mocha.blue, 0.15),
            alpha(latte.blue, 0.32),
            alpha(mocha.blue, 0.32),
          ),
        },

        gray: makeColorPalette(
          latte.overlay1,
          mocha.overlay1,
          latte.surface0,
          mocha.surface0,
          latte.surface2,
          mocha.surface2,
          latte.text,
          mocha.text,
        ),

        red: makeColorPalette(
          latte.red,
          mocha.red,
          alpha(latte.red, 0.12),
          alpha(mocha.red, 0.15),
          alpha(latte.red, 0.3),
          alpha(mocha.red, 0.35),
        ),

        orange: makeColorPalette(
          latte.peach,
          mocha.peach,
          alpha(latte.peach, 0.12),
          alpha(mocha.peach, 0.15),
          alpha(latte.peach, 0.32),
          alpha(mocha.peach, 0.35),
        ),

        yellow: makeColorPalette(
          latte.yellow,
          mocha.yellow,
          alpha(latte.yellow, 0.12),
          alpha(mocha.yellow, 0.15),
          alpha(latte.yellow, 0.32),
          alpha(mocha.yellow, 0.35),
        ),

        green: makeColorPalette(
          latte.green,
          mocha.green,
          alpha(latte.green, 0.12),
          alpha(mocha.green, 0.15),
          alpha(latte.green, 0.32),
          alpha(mocha.green, 0.35),
        ),

        blue: makeColorPalette(
          latte.blue,
          mocha.blue,
          alpha(latte.blue, 0.12),
          alpha(mocha.blue, 0.15),
          alpha(latte.blue, 0.32),
          alpha(mocha.blue, 0.35),
        ),

        cyan: makeColorPalette(
          latte.sky,
          mocha.sky,
          alpha(latte.sky, 0.12),
          alpha(mocha.sky, 0.15),
          alpha(latte.sky, 0.32),
          alpha(mocha.sky, 0.35),
          latte.sapphire,
          mocha.sky,
        ),

        purple: makeColorPalette(
          latte.mauve,
          mocha.mauve,
          alpha(latte.mauve, 0.12),
          alpha(mocha.mauve, 0.15),
          alpha(latte.mauve, 0.32),
          alpha(mocha.mauve, 0.35),
        ),

        pink: makeColorPalette(
          latte.pink,
          mocha.pink,
          alpha(latte.pink, 0.12),
          alpha(mocha.pink, 0.15),
          alpha(latte.pink, 0.32),
          alpha(mocha.pink, 0.35),
        ),

        // Premium auth surfaces
        auth: {
          canvas: {
            value: { base: latte.base, _dark: mocha.base },
          },

          canvasEnd: {
            value: { base: latte.mantle, _dark: mocha.mantle },
          },

          card: {
            value: {
              base: 'rgba(255, 255, 255, 0.72)',
              _dark: alpha(mocha.surface0, 0.72),
            },
          },

          cardBorder: {
            value: {
              base: alpha(latte.overlay0, 0.18),
              _dark: alpha(mocha.blue, 0.16),
            },
          },

          field: {
            value: {
              base: 'rgba(255, 255, 255, 0.68)',
              _dark: alpha(mocha.surface0, 0.68),
            },
          },

          fieldBorder: {
            value: {
              base: alpha(latte.overlay0, 0.24),
              _dark: alpha(mocha.blue, 0.18),
            },
          },

          fieldHover: {
            value: {
              base: 'rgba(255, 255, 255, 0.78)',
              _dark: alpha(mocha.surface0, 0.78),
            },
          },

          primaryFrom: {
            value: { base: latte.blue, _dark: mocha.blue },
          },

          primaryTo: {
            value: { base: latte.sapphire, _dark: mocha.sapphire },
          },

          glow: {
            value: {
              base: alpha(latte.blue, 0.12),
              _dark: alpha(mocha.blue, 0.14),
            },
          },

          horizon: {
            value: {
              base: alpha(latte.blue, 0.28),
              _dark: alpha(mocha.blue, 0.32),
            },
          },

          link: {
            value: { base: latte.blue, _dark: mocha.blue },
          },

          particle: {
            value: {
              base: alpha(latte.blue, 0.16),
              _dark: alpha(mocha.blue, 0.16),
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
