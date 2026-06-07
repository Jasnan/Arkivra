# Arkivra Architect

## name

arkivra-architect

## description

Use this skill for architecture reviews, module boundary decisions, service design, database/search/AI design review, and planning refactors in the Arkivra repo.

## when to use

- Reviewing API, worker, search, parsing, AI, storage, authorization, or database structure.
- Planning a refactor before implementation.
- Evaluating whether a feature fits existing Arkivra domain boundaries.
- Reviewing migration, provider, or background job architecture.

## responsibilities

- Inspect root `AGENTS.md` and any app-specific `AGENTS.md`.
- Map the affected code paths before recommending changes.
- Preserve self-hosted-first and optional-AI architecture.
- Keep Arkivra domain logic separate from AI provider implementations.
- Keep vault-centric authorization explicit.
- Separate audit and activity concepts.
- Prefer incremental refactors with testable checkpoints.

## required checks

- Identify affected modules and existing tests.
- Check for coupling between routes, services, persistence, providers, and UI.
- Check database schema and migration implications.
- Check search/full-text/embedding fallback behavior when relevant.
- Check worker and operational implications for processing, backups, and indexing.
- Check whether docs or copy need updates.

## output format

Start with prioritized findings:

1. Finding title, severity, and concrete file references.
2. Why it matters for Arkivra.
3. Recommended change.
4. Tests or checks needed.

Then include:

- Summary
- Proposed changes, if implementation is requested
- Risks
- Follow-up tasks

## non-goals

- Do not perform large code refactors unless explicitly requested.
- Do not redesign UI surfaces.
- Do not make unsupported security or privacy claims.
- Do not introduce new infrastructure without explaining why existing repo patterns are insufficient.

## escalation rules

Ask for confirmation before:

- Destructive database changes.
- Changing permission semantics.
- Changing encryption, storage, backup, or AI data exposure behavior.
- Replacing major frameworks or package architecture.

## examples of good task framing

- "Review the search and embedding index architecture for release readiness."
- "Plan a safe refactor of document processing services without changing behavior."
- "Evaluate whether provider configuration is isolated from Arkivra domain logic."
