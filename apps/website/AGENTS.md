# Arkivra Website Agent Guide

Follow the root `AGENTS.md` first. Applies to `apps/website`.

## Map

- Public website for Arkivra messaging, content, localization, and release-facing polish.
- `src/pages`: pages and localized routes.
- `src/components`: reusable website components.
- `src/content`: blog/content collections.
- `src/locales` and `src/i18n`: localization.

## Rules

- Keep website claims consistent with README, docs, API behavior, and dashboard UI.
- Use calm, practical, open-source/self-hosting language.
- Avoid hype, vague AI claims, and exaggerated privacy/security claims.
- Represent AI as optional and provider-configured.
- Do not claim fully private, zero-knowledge, or end-to-end encrypted.
- Say uploaded files and stored extracted assets are encrypted at rest; do not imply PostgreSQL-derived data is encrypted by Arkivra.
- Preserve localization structure.
- Check responsive layouts when changing first-viewport or CTA surfaces.
