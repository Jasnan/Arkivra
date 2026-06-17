import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightThemeRapide from 'starlight-theme-rapide';

export default defineConfig({
  site: 'https://docs.arkivra.app',
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
          label: 'Start Here',
          items: [
            { label: 'Overview', slug: 'index' },
            { label: 'Getting Started', slug: 'getting-started' },
            { label: 'Docker Compose', slug: 'docker-compose' },
            { label: 'Configuration', slug: 'configuration' },
            { label: 'First Admin And Auth', slug: 'first-admin-and-auth' },
          ],
        },
        {
          label: 'Operations',
          items: [
            { label: 'Document Versioning', slug: 'document-versioning' },
            { label: 'Storage, Encryption, And Backups', slug: 'storage-encryption-backups' },
            { label: 'Search And Optional AI', slug: 'search-and-ai' },
            { label: 'Troubleshooting', slug: 'troubleshooting' },
          ],
        },
        {
          label: 'Development',
          items: [
            { label: 'CI Strategy', slug: 'ci' },
            { label: 'Local Worktrees', slug: 'local-worktrees' },
            { label: 'Document Versioning Architecture', slug: 'architecture/document-versioning' },
          ],
        },
      ],
    }),
  ],
});
