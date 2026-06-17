import { glob } from 'astro/loaders';
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishedAt: z.coerce.date(),
    draft: z.boolean().optional().default(false),
    homepageCallout: z.object({
      title: z.string(),
      description: z.string(),
    }).optional(),
    lang: z.enum(['en']).optional(),
    ogImage: z.string().optional(),
    coverImage: z.string().optional(),
  }),
});

export const collections = { blog };
