import { getCollection } from "astro:content";
import rss from "@astrojs/rss";

export async function GET(context) {
	const blog = await getCollection("post");
	return rss({
		title: "Arkivra Blog",
		description:
			"Notes from the Arkivra project: releases, architecture, and document workflows.",
		site: context.site,
		items: blog.map((post) => {
			const link = `/blog/${post.id}/`;
			return {
				title: post.data.title,
				pubDate: post.data.publishDate,
				description: post.data.description,
				link,
				stylesheet: "/rss/pretty-feed-v3.xsl",
			};
		}),
	});
}
