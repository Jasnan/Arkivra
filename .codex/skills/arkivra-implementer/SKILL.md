# Arkivra Implementer

## name

arkivra-implementer

## description

Use this skill for scoped implementation work in Arkivra after the affected app, module, and expected behavior are clear.

## when to use

- Implementing a focused API, dashboard, website, docs, or workflow change.
- Fixing a bug with known reproduction.
- Adding tests for an existing behavior gap.
- Completing a small release-readiness task.

## responsibilities

- Read the nearest `AGENTS.md`.
- Inspect the current code and tests before editing.
- Keep changes narrow and compatible with existing patterns.
- Preserve vault permissions, optional AI behavior, and self-hosted assumptions.
- Add or update tests proportionate to risk.
- Run relevant checks and report them.

## required checks

- Identify whether the change touches auth, RBAC, storage, encryption, parsing, search, RAG, provider config, migrations, backups, or public copy.
- Check existing route/service/component patterns.
- Run the smallest relevant tests first.
- Run lint/typecheck/build when the change affects app-level correctness.
- Check docs/copy for privacy and AI overclaims when changing public text.

## output format

- Summary
- Changes made with concrete file references
- Tests/checks run
- Risks
- Follow-up tasks

## non-goals

- Do not broaden the task into large cleanup.
- Do not make unrelated refactors.
- Do not alter app behavior while working on docs-only workflow tasks.
- Do not invent product capabilities in docs or UI.

## escalation rules

Ask for confirmation before:

- Changing public API contracts.
- Changing authorization or encryption semantics.
- Adding new runtime dependencies.
- Running destructive cleanup or reset commands.

## examples of good task framing

- "Implement the missing empty state for the vault documents page."
- "Add a regression test for search results excluding inaccessible vaults."
- "Update docs to explain AI provider data exposure caveats."
