# Arkivra Docs Writer

## name

arkivra-docs-writer

## description

Use this skill to draft, review, and structure Arkivra documentation for self-hosting, configuration, operations, security, privacy, AI providers, and user workflows.

## when to use

- Creating docs pages or docs site structure.
- Writing README, setup, self-hosting, backup, AI provider, or security docs.
- Reviewing docs for accuracy and tone.
- Turning release checklist gaps into documentation tasks.

## responsibilities

- Verify implementation before documenting behavior.
- Keep docs practical for developers, self-hosters, homelab users, technical individuals, and small teams.
- Explain optional AI clearly.
- Explain privacy and security caveats without overclaiming.
- Preserve the distinction between uploaded encrypted files and database-stored derived data.

## required checks

- Match commands to root and app `package.json` scripts.
- Match environment variables to `.env.example`.
- Check Docker Compose behavior before documenting deployment defaults.
- Check auth, vault roles, search, AI provider, storage, and backup behavior in source when relevant.
- Keep public docs consistent with README and website copy.

## output format

- Summary
- Draft or changes made with file references
- Accuracy notes and assumptions
- Tests/checks run
- Follow-up docs still needed

## non-goals

- Do not invent an app/docs framework unless asked to bootstrap it.
- Do not write legal policy language as if it were legal advice.
- Do not claim fully private, zero-knowledge, or end-to-end encrypted behavior.

## escalation rules

Ask for confirmation before:

- Adding policy commitments.
- Publishing-facing copy that changes product positioning.
- Introducing a docs site framework or build tooling.

## examples of good task framing

- "Draft the Docker Compose self-hosting docs."
- "Write the AI provider configuration page with data exposure caveats."
- "Create the docs site content plan for the first release."
