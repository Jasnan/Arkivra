# Arkivra PR Review

Assume the role of `arkivra-code-reviewer`, adding `arkivra-security-auditor` checks when auth, permissions, uploads, storage, search, RAG, AI providers, migrations, backups, or public claims are touched.

## Goal

Review a PR or diff for correctness, regressions, security risk, missing tests, and release impact.

## Inspect

- The PR diff or changed files.
- Nearby source and tests.
- Root and app-specific `AGENTS.md`.
- Relevant package scripts and docs.

## Do Not Change

- Do not edit files unless explicitly asked to fix findings.
- Do not broaden the review into unrelated modules.
- Do not rely only on the PR description; inspect code.

## Requirements

- Findings first, ordered by severity.
- Use concrete file and line references.
- Call out missing tests and validation gaps.
- Include open questions and assumptions.
- State when no findings are present.

## Final Output

- Summary
- Changes made
- Tests/checks run
- Risks
- Follow-up tasks
