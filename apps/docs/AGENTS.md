# Arkivra Docs Agent Guide

Follow the root `AGENTS.md` first. This guide applies to `apps/docs`.

## Scope

The docs app is an Astro Starlight website for publishing Arkivra documentation from Markdown content.

## Commands

```bash
pnpm --filter @arkivra/docs dev
pnpm --filter @arkivra/docs check
pnpm --filter @arkivra/docs build
```

## Documentation Expectations

- Keep docs consistent with the implementation and root `docs` content.
- Avoid privacy and security overclaims.
- State AI provider and embedding-index behavior as optional.
- Prefer practical self-hosting language over marketing claims.
