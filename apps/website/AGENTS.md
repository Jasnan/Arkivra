# Arkivra Marketing Website Agent Guide

Follow the root `AGENTS.md` first. This guide applies to `apps/website`.

## Scope

The marketing website is an Astro app for Arkivra public messaging, localized pages, content, and release-facing polish.

## Structure

- `src/pages`: Astro pages and localized routes.
- `src/components`: reusable website components.
- `src/content`: content collections such as blog content.
- `src/locales` and `src/i18n`: localization content and utilities.
- `src/styles`: global styling.
- `uno.config.ts`: UnoCSS configuration.

## Commands

```bash
pnpm --filter @arkivra/website dev
pnpm --filter @arkivra/website lint
pnpm --filter @arkivra/website check
pnpm --filter @arkivra/website test
pnpm --filter @arkivra/website build
```

## Copy Tone

- Use calm, mature, self-hosted infrastructure language.
- Avoid startup hype, vague AI claims, and exaggerated privacy claims.
- Prefer "optional AI", "configured provider", "self-hosted document management", "vaults", "full-text search", and "semantic search when enabled".
- Do not claim Arkivra is fully private, zero-knowledge, or end-to-end encrypted.
- Say that uploaded files are encrypted at rest, while extracted text, chunks, metadata, chat history, and embeddings may be stored in PostgreSQL when features require them.

## Review Expectations

- Keep website claims consistent with the README, docs, API behavior, and dashboard UI.
- Check that AI provider configuration is represented as optional and user-controlled.
- Confirm that self-hosting, open-source licensing, and practical privacy are first-viewport concepts.
- Preserve localization structure when editing public copy.
- Run `astro check` and build for structural changes.
