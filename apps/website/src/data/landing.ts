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
		title: "Open source",
		description:
			"Arkivra is released under AGPL-3.0. Review the code or adapt it to your setup.",
	},
	{
		icon: Server,
		title: "Self-hostable",
		description:
			"Deploy with Docker on a home server or any Docker-capable host you manage.",
	},
	{
		icon: ShieldCheck,
		title: "Flexible AI setup",
		description:
			"Use an AI endpoint you operate or connect a supported cloud provider. AI can also remain disabled.",
	},
	{
		icon: LockKeyhole,
		title: "Encrypted file storage",
		description:
			"Uploaded originals and stored extracted asset files are encrypted at rest using keys configured for your deployment.",
	},
	{
		icon: ClipboardList,
		title: "Activity and audit",
		description:
			"Activity and audit logs record document actions. They also cover access, permission and administrative events.",
	},
	{
		icon: RotateCcw,
		title: "Encrypted backups",
		description:
			"Create encrypted backup sets containing PostgreSQL and document storage for Arkivra's restore workflow.",
	},
];

export const documentPillars = [
	{
		title: "Organize",
		description:
			"Use vaults to separate different areas of life. Add folders, tags and metadata for more structure.",
		visual: "organize",
	},
	{
		title: "Search",
		description:
			"Search extracted text instead of relying on file names. Use filters to narrow larger result sets.",
		visual: "search",
	},
	{
		title: "Understand",
		description:
			"When AI is enabled, search by meaning and ask questions across individual documents or entire vaults.",
		visual: "understand",
	},
] as const;

export const documentFeatures = [
	{
		icon: Folder,
		title: "Vault organization",
		description:
			"Separate personal and household records into dedicated vaults.",
	},
	{
		icon: Tag,
		title: "Tags & metadata",
		description:
			"Add context for filtering and group related records without changing the folder structure.",
	},
	{
		icon: History,
		title: "Version history",
		description:
			"Upload a replacement while keeping earlier versions available for review or restore.",
	},
	{
		icon: Users,
		title: "Access control",
		description: "Control which accounts can view or update each vault.",
	},
];

export const retrievalFeatures = [
	{
		icon: Search,
		title: "Full-text search",
		description:
			"Find exact words and phrases in text extracted during document processing.",
	},
	{
		icon: FileText,
		title: "Scanned documents",
		description:
			"Turn supported scanned PDFs and images into content you can search.",
	},
	{
		icon: SlidersHorizontal,
		title: "Filters & metadata",
		description:
			"Narrow results by vault, tag, metadata, or processing state to reach the right record faster.",
	},
];

export const optionalAiFeatures = [
	{
		icon: Brain,
		title: "Semantic search",
		description:
			"Find passages with related meaning even when they use different wording.",
	},
	{
		icon: MessageCircle,
		title: "Chat with documents",
		description:
			"Ask questions across selected documents, individual vaults, or all records you can access.",
	},
	{
		icon: Languages,
		title: "Document translation",
		description:
			"Translate supported PDFs between English and German using the configured model.",
	},
];

export const aiFlexibilityNote =
	"Use an endpoint you operate or a supported cloud provider. The selected provider determines where model requests are processed.";

export const faqItems = [
	{
		question: "Does Arkivra require AI?",
		answer:
			"No. You can upload and organize files, search extracted content, manage versions, recover deleted items, and create backups without connecting an AI provider.",
	},
	{
		question: "What does optional AI mean?",
		answer:
			"An administrator must configure a supported provider, choose the models, and enable AI before anyone can use semantic search, document chat, or PDF translation. The core document workflow remains available without it.",
	},
	{
		question: "Where does Arkivra process documents?",
		answer:
			"You choose where Arkivra and its required Docling processing endpoint run. Core document management and full-text search do not use an AI provider. Content may leave that environment if you configure remote processing, AI, storage, or backup services.",
	},
	{
		question: "What happens when I use a remote AI provider?",
		answer:
			"Arkivra sends the content needed for the feature you use. That can include query text and document chunks for semantic search, document context and conversation history for chat, or selected text and page images for translation. The provider may process or retain that data under its own policies.",
	},
	{
		question: "What is semantic search?",
		answer:
			"Regular search looks for matching words. Semantic search looks for matching meaning, so a search for car insurance may also find documents that mention vehicle coverage.",
	},
	{
		question: "Can Arkivra search scanned PDFs and documents?",
		answer:
			"Yes. Arkivra can extract searchable text from supported scanned PDFs and images. The result depends on scan quality and how the document processing pipeline is configured.",
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
