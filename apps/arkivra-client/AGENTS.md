# Arkivra Dashboard Agent Guide

Follow the root `AGENTS.md` first. Applies to `apps/arkivra-client`.

## Map

- React/Vite/TypeScript dashboard with Chakra UI v3, TanStack Router/Query, Better Auth, and assistant UI components.
- `src/features`: domain UI for auth, vaults, documents, search, chat, admin, audit, uploads, settings, tags, and preferences.
- `src/components`: shared UI/layout only when genuinely reused.
- `src/lib`: API/auth clients and utilities.
- `src/theme`: Chakra system and tokens.

## Rules

- Keep behavior in the relevant feature folder unless truly shared.
- Use existing Chakra/tokens/shared components before adding new patterns.
- Keep operational surfaces dense, scannable, and work-focused.
- Include loading, empty, error, disabled, and success states.
- Preserve keyboard navigation, focus states, labels, and accessible names.
- Avoid UI copy that overclaims privacy, security, AI availability, or encryption.
- Show AI-disabled/provider-missing states clearly.
- Client permission checks are UX hints; API checks are authoritative.
- Do not log secrets, tokens, provider creds, document contents, extracted text, or embeddings.
- Test changed UI behavior, API client behavior, permission rendering, and regression-prone flows.
