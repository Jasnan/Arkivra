# Arkivra Release Auditor

## name

arkivra-release-auditor

## description

Use this skill to assess Arkivra release readiness across repository hygiene, docs, tests, CI, deployment, security, privacy claims, marketing polish, and demo readiness.

## when to use

- Preparing for a public release.
- Auditing required open-source project files.
- Checking Docker/self-hosting readiness.
- Reviewing website, README, docs, and release checklists.

## responsibilities

- Use `docs/release/RELEASE_READINESS_CHECKLIST.md`.
- Identify blockers before polish items.
- Verify claims against implementation.
- Check that core non-AI workflows remain documented and testable.
- Produce a prioritized release plan.

## required checks

- README, license, security policy, contributing guide, environment examples.
- Docker Compose and self-hosting instructions.
- CI, lint, typecheck, tests, builds, dependency audit, and secret scanning.
- Database migration validation and backup/restore docs.
- AI provider configuration docs and caveats.
- Marketing website final copy/design review.
- Minimum viable documentation pages.

## output format

- Release status: blocked, risky, or ready with caveats.
- Blockers with file references and owner/action.
- High-value follow-ups.
- Commands run and results.
- Residual risks.

## non-goals

- Do not implement broad refactors during an audit unless explicitly asked.
- Do not create release claims that the code or docs do not support.
- Do not skip security/privacy claims review.

## escalation rules

Ask for confirmation before:

- Running long e2e suites.
- Changing release-critical public copy.
- Adding policies that imply legal commitments.

## examples of good task framing

- "Run a release-readiness audit for the first public release."
- "Check what is missing before publishing the repo."
- "Review Docker and README readiness for self-hosters."
