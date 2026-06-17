# Arkivra Dashboard Agent Guide

Follow the root `AGENTS.md` first. This guide applies to `apps/arkivra-client`.

## Scope

The dashboard is a React/Vite/TypeScript app using Chakra UI v3, TanStack Router, TanStack Query, Better Auth, assistant UI components, and feature folders under `src/features`.

## Structure

- `src/app`: providers, router, routes.
- `src/components`: shared UI, layout, navigation, brand, and providers.
- `src/features`: domain-specific UI for auth, vaults, documents, search, chat, admin, audit, uploads, settings, tags, and user preferences.
- `src/lib`: API client, auth client, utilities, localization helpers.
- `src/theme`: Chakra system and design tokens.
- `src/test`: test setup and helpers.

## Commands

```bash
pnpm --filter @arkivra/web dev
pnpm --filter @arkivra/web lint
pnpm --filter @arkivra/web typecheck
pnpm --filter @arkivra/web test
pnpm --filter @arkivra/web build
```

## UI and Code Conventions

- Keep feature behavior inside the relevant `src/features/*` area unless it is truly shared.
- Use existing Chakra UI v3 patterns and tokens from `src/theme/system.ts`.
- Prefer existing shared components before adding new ones.
- Use lucide-react icons for familiar actions when the app already uses icons.
- Do not redesign major surfaces unless explicitly requested.
- Keep operational dashboards dense, scannable, and work-focused.

## UX Expectations

- Include loading, empty, error, disabled, and success states for async flows.
- Preserve keyboard navigation, focus states, labels, and accessible names.
- Avoid UI text that overclaims privacy, security, AI availability, or encryption.
- Make AI-disabled and provider-not-configured states clear.
- For document, vault, search, and chat screens, reflect permission limits clearly without leaking hidden resource details.
- Keep mobile and desktop layouts free of overlapping text or controls.

## Data and Security Expectations

- Treat API errors and authorization failures as expected states.
- Do not expose secrets, tokens, provider credentials, document contents, extracted text, or embeddings in client logs.
- Never infer permissions solely on the client. Client checks are for UX; API checks are authoritative.
- Preserve vault-centric language unless the API proves a narrower permission model.

## Testing Expectations

- Use Vitest and Testing Library patterns already present in the app.
- Add tests for changed UI behavior, API client behavior, permission-dependent rendering, and regression-prone flows.
- Run browser/manual checks for layout-sensitive dashboard changes.
