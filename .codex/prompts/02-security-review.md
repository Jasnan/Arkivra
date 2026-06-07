# Arkivra Security Review

Assume the role of `arkivra-security-auditor`.

## Goal

Review the requested area for security, authorization, data exposure, and release-blocking risks.

## Inspect

- Root and app-specific `AGENTS.md`.
- Authentication and session handling.
- System roles, system capabilities, vault membership, vault roles, and vault AI access levels.
- Routes and services for the requested workflow.
- Upload, storage, encryption, parsing, Docling, backups, search, embeddings, chat/RAG, audit, and logs when relevant.
- Public docs/copy if security or privacy claims are in scope.

## Do Not Change

- Do not change auth, RBAC, encryption, backup, or provider data flow unless explicitly requested.
- Do not make unsupported privacy or security claims.
- Do not run destructive database or filesystem operations without confirmation.

## Requirements

- Prioritize a report first.
- Include concrete file references.
- Explain the exploit/failure mode for each finding.
- Require tests/checks for permission boundaries and sensitive paths.
- Distinguish uploaded encrypted files from database-stored derived data.

## Final Output

- Summary
- Changes made
- Tests/checks run
- Risks
- Follow-up tasks
