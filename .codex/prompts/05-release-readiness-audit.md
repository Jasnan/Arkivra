# Arkivra Release Readiness Audit

Assume the role of `arkivra-release-auditor`.

## Goal

Assess whether Arkivra is ready for a public release and identify blockers, high-risk gaps, and focused follow-up work.

## Inspect

- `docs/release/RELEASE_READINESS_CHECKLIST.md`.
- README, license, `.env.example`, Docker Compose, scripts, package scripts, CI files, and docs.
- Security policy, contributing guide, code of conduct, and other open-source hygiene files.
- API, dashboard, website, and docs status where relevant.
- Public privacy/security/AI claims.

## Do Not Change

- Do not perform large code refactors.
- Do not make release claims that are not supported by code or docs.
- Do not add legal/security policies without confirmation if policy wording implies commitments.

## Requirements

- Prioritize a report first.
- Use concrete file references.
- Separate blockers from follow-ups.
- Run relevant checks when practical, or state what was not run.
- Confirm that core non-AI document management remains first-class.

## Final Output

- Summary
- Changes made
- Tests/checks run
- Risks
- Follow-up tasks
