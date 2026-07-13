// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://docs.arkivra.app',
	redirects: {
		'/guides/ai-providers': '/ai/providers-and-models',
		'/guides/backups-and-restore': '/operations/backups-and-restore',
		'/guides/document-encryption': '/operations/encryption-and-key-management',
		'/guides/document-versioning': '/using-arkivra/versions-and-trash',
		'/guides/oauth-setup': '/self-hosting/authentication-and-email',
		'/guides/roles-and-administration': '/administration/users-and-permissions',
		'/guides/search': '/using-arkivra/search',
		'/resources/troubleshooting': '/operations/maintenance-and-troubleshooting',
		'/self-hosting/docling-prerequisite': '/self-hosting/document-processing',
		'/self-hosting/first-admin-and-auth': '/self-hosting/authentication-and-email',
	},
	integrations: [
		starlight({
			title: 'Arkivra Docs',
			favicon: '/favicon.svg',
			components: {
				Footer: './src/components/DocsFooter.astro',
				SocialIcons: './src/components/GitHubStarButton.astro',
				ThemeSelect: './src/components/ThemeToggle.astro',
			},
			logo: {
				light: './src/assets/arkivra-logo.svg',
				dark: './src/assets/arkivra-logo-dark.svg',
				alt: 'Arkivra',
			},
			customCss: ['./src/styles/custom.css'],
			sidebar: [
				{
					label: 'Getting started',
					items: [
						{ label: 'Overview', slug: 'index' },
						{ label: 'Quick start', slug: 'getting-started/quick-start' },
						{ label: 'First steps', slug: 'getting-started/first-steps' },
					],
				},
				{
					label: 'Install and configure',
					items: [
						{ label: 'Using Docker Compose', slug: 'self-hosting/using-docker-compose' },
						{ label: 'Compose generator', link: '/docker-compose-generator' },
						{ label: 'From Source', slug: 'self-hosting/from-source' },
						{ label: 'Document processing', slug: 'self-hosting/document-processing' },
						{ label: 'Configuration reference', slug: 'self-hosting/configuration' },
						{ label: 'Authentication and email', slug: 'self-hosting/authentication-and-email' },
					],
				},
				{
					label: 'Use Arkivra',
					items: [
						{ label: 'Vaults and folders', slug: 'using-arkivra/vaults-and-folders' },
						{ label: 'Upload and process documents', slug: 'using-arkivra/upload-and-process' },
						{ label: 'Tags and organization', slug: 'using-arkivra/tags-and-organization' },
						{ label: 'View and manage documents', slug: 'using-arkivra/view-and-manage-documents' },
						{ label: 'Versions and trash', slug: 'using-arkivra/versions-and-trash' },
						{ label: 'Search', slug: 'using-arkivra/search' },
						{ label: 'Chat and document context', slug: 'using-arkivra/chat-and-context' },
						{ label: 'PDF translation', slug: 'using-arkivra/pdf-translation' },
					],
				},
				{
					label: 'Configure AI',
					items: [
						{ label: 'Providers and models', slug: 'ai/providers-and-models' },
						{ label: 'Semantic indexing', slug: 'ai/semantic-indexing' },
					],
				},
				{
					label: 'Administration',
					items: [
						{ label: 'Users and permissions', slug: 'administration/users-and-permissions' },
						{ label: 'Activity and audit', slug: 'administration/activity-and-audit' },
					],
				},
				{
					label: 'Operations',
					items: [
						{ label: 'Backups and restore', slug: 'operations/backups-and-restore' },
						{
							label: 'Encryption and key management',
							slug: 'operations/encryption-and-key-management',
						},
						{ label: 'Privacy and security', slug: 'operations/privacy-and-security' },
						{
							label: 'Maintenance and troubleshooting',
							slug: 'operations/maintenance-and-troubleshooting',
						},
					],
				},
				{
					label: 'Resources',
					items: [{ label: 'Changelog', slug: 'changelog' }],
				},
			],
		}),
	],
});
