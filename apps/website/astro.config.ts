import mdx from '@astrojs/mdx';

import sitemap from '@astrojs/sitemap';
import astroExpressiveCode from 'astro-expressive-code';
import { defineConfig } from 'astro/config';
import UnoCSS from 'unocss/astro';

export default defineConfig({
  site: 'https://arkivra.app',
  vite: {
    build: {
      target: 'es2022',
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'es2022',
      },
    },
  },

  integrations: [
    UnoCSS({ injectReset: true }),
    sitemap(),
    astroExpressiveCode({
      themes: ['vitesse-dark', 'github-light'],
      styleOverrides: {
        frames: {
          shadowColor: 'transparent',
        },
      },
      defaultProps: {
        overridesByLang: {
          'bash,sh,shell': {
            frame: 'none',
          },
        },
      },
    }),
    mdx(),
  ],

  output: 'static',
});
