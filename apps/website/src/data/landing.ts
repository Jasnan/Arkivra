import {
	Brain,
	ClipboardList,
	FileText,
	Folder,
	GitFork,
	History,
	Languages,
	LockKeyhole,
	MessageCircle,
	RotateCcw,
	Search,
	Server,
	ShieldCheck,
	SlidersHorizontal,
	Tag,
	Users,
} from "@lucide/astro";

export const docsUrl = "https://docs.arkivra.app/";
export const selfHostingGuideUrl =
	"https://docs.arkivra.app/self-hosting/using-docker-compose/";
export const githubUrl = "https://github.com/Jasnan/Arkivra";

export const navigationItems = [
	{ name: "Home", href: "#hero" },
	{ name: "Features", href: "#features" },
	{ name: "FAQ", href: "#faq" },
];

export const values = [
	{
		icon: GitFork,
		title: "Open Source",
		description:
			"Fully open source under AGPL-3.0. Inspect the code, contribute improvements, and deploy with confidence",
	},
	{
		icon: Server,
		title: "Self-Hostable",
		description:
			"Deploy with Docker and run Arkivra on your own servers or private infrastructure.",
	},
	{
		icon: ShieldCheck,
		title: "Privacy choices",
		description:
			"Keep AI local, connect supported cloud providers, or disable it entirely. You decide where your documents are processed.",
	},
	{
		icon: LockKeyhole,
		title: "Document Encryption",
		description:
			"Original files and extracted assets are encrypted at rest, with security controlled by your own deployment.",
	},
	{
		icon: ClipboardList,
		title: "Audit & Activity",
		description:
			"Track user activity, access events, and document changes with detailed audit logs.",
	},
	{
		icon: RotateCcw,
		title: "Backups & Recovery",
		description: "Create full instance backups for easy recovery or migration.",
	},
];

export const documentPillars = [
	{
		title: "Organize",
		description:
			"Create vaults, folders, tags, and collections that match how your documents are stored in real life.",
		visual: "organize",
	},
	{
		title: "Search",
		description:
			"Find documents quickly with full-text search, filters, metadata, and optional semantic search.",
		visual: "search",
	},
	{
		title: "Understand",
		description:
			"Use optional AI to ask questions, summarize files, translate documents, and retrieve the information buried inside your archive.",
		visual: "understand",
	},
] as const;

export const documentFeatures = [
	{
		icon: Folder,
		title: "Vault organization",
		description:
			"Group documents into vaults that match how your records belong together.",
	},
	{
		icon: Tag,
		title: "Tags & metadata",
		description: "Keep documents easier to filter, recognize, and find later.",
	},
	{
		icon: History,
		title: "Version history",
		description:
			"Keep older versions available when documents change over time.",
	},
	{
		icon: Users,
		title: "Access control",
		description:
			"Manage who can view, upload, and organize documents in each vault.",
	},
];

export const retrievalFeatures = [
	{
		icon: Search,
		title: "Full-text search",
		description: "Search document content, not just file names.",
	},
	{
		icon: FileText,
		title: "Scanned documents",
		description: "Extract searchable text from scanned PDFs and images.",
	},
	{
		icon: SlidersHorizontal,
		title: "Filters & metadata",
		description: "Narrow results by vault, tag, metadata, or processing state.",
	},
];

export const optionalAiFeatures = [
	{
		icon: Brain,
		title: "Semantic search",
		description: "Find related information by meaning.",
	},
	{
		icon: MessageCircle,
		title: "Chat with documents",
		description: "Ask questions across selected documents or entire vaults.",
	},
	{
		icon: Languages,
		title: "Document translation",
		description: "Translate documents when translation is enabled.",
	},
];

export const aiFlexibilityNote =
	"Bring your own AI setup: connect local models or supported cloud providers when AI fits your setup.";

export const faqItems = [
	{
		question: "Do I need AI to use Arkivra?",
		answer:
			"No. Arkivra works without AI. Upload documents, organize vaults, search content, manage versions, restore files, and create backups without connecting any AI provider.",
	},
	{
		question: "What does optional AI mean?",
		answer:
			"AI features are disabled by default. If you want AI-assisted features such as semantic search, chat, or translation, you can connect local models or supported cloud providers using your own configuration.",
	},
	{
		question: "Do my documents leave my computer?",
		answer:
			"Arkivra is self-hosted, so documents stay within the infrastructure you choose to run it on. Core document management and full-text search do not require any AI provider. If you configure remote AI providers, remote storage, or off-site backups, the content required for those features may be sent to those services according to your configuration.",
	},
	{
		question: "What happens when I use a remote AI provider?",
		answer:
			"Arkivra only sends the content required for the AI feature being used. Depending on configuration, this may include document text for indexing or document context for chat and other AI-assisted workflows.",
	},
	{
		question: "What is semantic search?",
		answer:
			"Regular search looks for matching words. Semantic search looks for matching meaning, so a search for car insurance may also find documents that mention vehicle coverage.",
	},
	{
		question: "Can Arkivra search scanned PDFs and documents?",
		answer:
			"Yes. Arkivra can extract searchable text from many scanned PDFs and images. Results depend on scan quality and the configured document processing pipeline.",
	},
	{
		question: "What license is Arkivra released under?",
		answer:
			"Arkivra is open source under the AGPL-3.0 license. The source code, issue tracker, and project roadmap are available on GitHub.",
	},
];

export const footerLinks = {
	project: [
		{ name: "Features", href: "#features" },
		{ name: "FAQ", href: "#faq" },
	],
	resources: [
		{ name: "Documentation", href: docsUrl },
		{ name: "Docker guide", href: selfHostingGuideUrl },
		{ name: "GitHub", href: githubUrl },
	],
	legal: [
		{ name: "Privacy Policy", href: "/privacy" },
		{ name: "Terms of Service", href: "/terms-of-service" },
	],
};
