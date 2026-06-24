import path from "node:path";
import { fileURLToPath } from "node:url";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteUrl = import.meta.env.PUBLIC_SITE_URL || "https://arkivra.app/";

// https://astro.build/config
export default defineConfig({
	site: siteUrl,
	base: "/",
	envPrefix: "PUBLIC_",
	vite: {
		plugins: [tailwindcss()],
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "./src"),
			},
		},
	},

	server: {
		port: 5200,
	},

	integrations: [mdx(), sitemap()],
});
