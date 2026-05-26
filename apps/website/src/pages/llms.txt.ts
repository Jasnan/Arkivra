import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ site }) => {
  const posts = await getCollection('blog');
  const getBlogPostUrl = (slug: string) => new URL(`blog/${slug}`, site).href;

  const llmTxt = `
# Arkivra

> Arkivra is an open-source document system for organizing files into vaults, searching across them, and chatting with your documents using local or cloud AI models.

## Blog Posts

${posts.map(post => `- [${post.data.title}](${getBlogPostUrl(post.slug)}): ${post.data.description}`).join('\n')}

## Assets

- [Arkivra Documentation](https://docs.arkivra.app): Documentation for running and using Arkivra.
- [Arkivra GitHub](https://github.com/Jasnan/Arkivra): The source code for Arkivra.
- [Contact](https://jasnan.xyz): Contact the maintainer.

## Legal

- [Privacy Policy](https://arkivra.app/privacy): The privacy policy for Arkivra.
- [Terms](https://arkivra.app/terms-of-service): The terms for Arkivra.
`.trim();

  return new Response(llmTxt);
};
