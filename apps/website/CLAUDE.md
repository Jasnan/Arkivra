# CLAUDE.md

This file provides guidance when working with this repository.

## Project Overview

Arkivra website is a static Astro site for the Arkivra open-source document management system.

The current site is English-only. Some i18n helpers remain from the original template, but only the `en` locale is enabled.

## Tech Stack

- **Framework:** Astro
- **Styling:** UnoCSS
- **Deployment:** Static build for Cloudflare Pages
- **Package Manager:** pnpm
- **Content:** MDX for blog posts and markdown pages
- **Testing:** Vitest

## Development Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm preview
pnpm lint
pnpm lint:fix
pnpm check
pnpm test
```

## Notes

- Main marketing copy lives in `src/locales/en.ts`.
- Main pages live directly under `src/pages/`; the site is English-only.
- Blog content lives in `src/content/blog/`.
- Shared social and project links live in `src/socials.ts`.
