import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async ({ site }) => {
  const posts = await getCollection('blog', post => !post.data.draft);
  const getBlogPostUrl = (slug: string) => new URL(`blog/${slug}`, site).href;

  const llmTxt = `
# Arkivra

> Arkivra is an open-source document system for organizing files into vaults, searching across them, and optionally chatting with your documents through an operator-configured Ollama-compatible endpoint.

## Blog Posts

${posts.map(post => `- [${post.data.title}](${getBlogPostUrl(post.id)}): ${post.data.description}`).join('\n')}

## Assets

- Arkivra Documentation: unavailable during release prep.
- Arkivra GitHub: unavailable during release prep.
- [Contact](https://jasnan.xyz): Contact the maintainer.

## Legal

- [Privacy Policy](https://arkivra.app/privacy): The privacy policy for Arkivra.
- [Terms](https://arkivra.app/terms-of-service): The terms for Arkivra.
`.trim();

  return new Response(llmTxt);
};
