import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async ({ site }) => {
  const posts = await getCollection('blog', post => !post.data.draft);
  const getBlogPostUrl = (slug: string) => new URL(`blog/${slug}`, site).href;

  const llmTxt = `
# Arkivra

> Arkivra is an open-source document management system for organizing files in vaults, searching their contents, and using optional provider-configured AI features when they fit your workflow.

## Blog Posts

${posts.map(post => `- [${post.data.title}](${getBlogPostUrl(post.id)}): ${post.data.description}`).join('\n')}

## Assets

- [Arkivra Documentation](https://docs.arkivra.app): Self-hosting, configuration, search, AI providers, encryption, backups, and operations.
- [Arkivra GitHub](https://github.com/Jasnan/Arkivra): Source code and issues.
- [Contact](https://jasnan.xyz): Contact the maintainer.

## Legal

- [Privacy Policy](https://arkivra.app/privacy): The privacy policy for Arkivra.
- [Terms](https://arkivra.app/terms-of-service): The terms for Arkivra.
`.trim();

  return new Response(llmTxt);
};
