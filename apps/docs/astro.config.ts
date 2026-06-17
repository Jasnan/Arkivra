import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightThemeRapide from 'starlight-theme-rapide';

export default defineConfig({
  site: 'https://docs.arkivra.app',
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
    starlight({
      title: 'Arkivra Docs',
      description: 'Self-hosted document management documentation for Arkivra.',
      favicon: '/favicon.svg',
      logo: {
        src: './src/assets/arkivra-sidebar-logo.svg',
        alt: 'Arkivra',
      },
      plugins: [starlightThemeRapide()],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/Jasnan/Arkivra',
        },
      ],
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'index' },
            { label: 'Changelog', slug: 'changelog' },
          ],
        },
        {
          label: 'Self Hosting',
          items: [
            { label: 'Using Docker Compose', slug: 'self-hosting/using-docker-compose' },
            { label: 'From Source', slug: 'self-hosting/from-source' },
            { label: 'Configuration', slug: 'self-hosting/configuration' },
            { label: 'First Admin And Auth', slug: 'self-hosting/first-admin-and-auth' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Roles And Administration', slug: 'guides/roles-and-administration' },
            { label: 'Document Versioning', slug: 'guides/document-versioning' },
            { label: 'Document Encryption', slug: 'guides/document-encryption' },
            { label: 'Backups And Restore', slug: 'guides/backups-and-restore' },
            { label: 'Search', slug: 'guides/search' },
            { label: 'AI Providers', slug: 'guides/ai-providers' },
            { label: 'OAuth Setup', slug: 'guides/oauth-setup' },
          ],
        },
        {
          label: 'Resources',
          items: [{ label: 'Troubleshooting', slug: 'resources/troubleshooting' }],
        },
      ],
    }),
  ],
});
