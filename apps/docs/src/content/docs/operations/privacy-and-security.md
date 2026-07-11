---
title: Privacy and security
description: Understand Arkivra's trust boundaries and protect a self-hosted deployment.
---

Self-hosting gives the operator control over deployment choices; it does not make every part of Arkivra private or encrypted automatically. This page states the implemented boundaries so you can decide which infrastructure and integrations are suitable for your documents.

## Data boundary at a glance

| Data                                            | Where it lives                     | Encrypted by Arkivra            |
| ----------------------------------------------- | ---------------------------------- | ------------------------------- |
| Uploaded originals and retained version sources | Filesystem document storage        | Yes                             |
| Stored extracted asset files                    | Filesystem document storage        | Yes                             |
| Arkivra multipart backup payload                | Backup directory or exported parts | Yes                             |
| Extracted text and chunks                       | PostgreSQL                         | No                              |
| Metadata, tags, folders, and versions           | PostgreSQL                         | No                              |
| Embeddings and search vectors                   | PostgreSQL                         | No                              |
| Chat messages, manifests, and citations         | PostgreSQL                         | No                              |
| Users, sessions, activity, audit, and job state | PostgreSQL                         | No application-layer encryption |
| Logs and provider-side data                     | Operator/provider systems          | Depends on those systems        |

Disk, volume, database, and backup encryption supplied by your host or platform can add protection outside Arkivra. Document that separately rather than attributing it to Arkivra.

## Access control

Regular user access is vault-centric. Owners, editors, and viewers receive different abilities within each vault. Platform privileges control AI use and direct vault creation.

Platform administrators are a high-trust role. The implementation lets them list, directly read, mutate, and manage active vaults across the instance even without an explicit vault membership. They also control users, AI configuration, backups, restore, office conversion, and the global audit log. The aggregate Search and Trash routes currently scope results to explicit vault memberships, which is an inconsistency in those views rather than a security boundary operators should rely on.

Arkivra does not implement document-level ACLs. Use separate vaults when membership needs to differ.

## External processors

Docling receives uploaded document content for parsing. Gotenberg receives supported office files when derived PDF preview conversion is enabled. Their deployment location and logging are operator choices.

Optional AI features can send:

- document chunks, prompts, and conversation history for chat;
- document chunks and queries for embeddings and semantic search;
- selected text or rendered PDF images for translation;
- extracted images for captioning.

A local service can keep this traffic within operator-controlled infrastructure. A hosted or remote endpoint receives document-derived content and may retain or log it. Review the provider's terms, account access, region, logging, and retention settings before enabling the integration.

## Deployment checklist

- Serve Arkivra through HTTPS and set the exact public origin.
- Keep PostgreSQL, Docling, Gotenberg, and model endpoints on trusted networks.
- Remove or restrict development port publishing, including the Compose PostgreSQL host port.
- Use unique, stable, randomly generated auth and encryption secrets.
- Configure SMTP securely and protect OAuth/provider credentials.
- Back up data and secrets separately, then test restore in isolation.
- Limit platform administrator accounts and require TOTP where appropriate.
- Protect application, reverse-proxy, database, and worker logs.
- Apply host, container, PostgreSQL, and dependency updates under your own maintenance policy.

## Logging

Arkivra audit serialization has a redaction path, but general process and integration logs remain an operational boundary. Do not log secrets, tokens, encryption keys, document content, extracted text, embeddings, or full provider payloads.

`ARKIVRA_OLLAMA_LOG_REQUESTS` is disabled by default. Enabling it can expose request and response content and should be limited to controlled debugging with non-sensitive data.

## Authentication considerations

The first-admin bootstrap promotes the oldest registered user when no active administrator exists. Control access to a fresh instance until the intended administrator has registered. Configure working SMTP before requiring email verification.

OAuth callback security depends on an accurate public URL and trusted-origin configuration. Use split-origin overrides only when the architecture requires them; broad trusted-origin lists increase the surface operators must reason about.

## Report vulnerabilities

The repository does not currently publish a `SECURITY.md` or a dedicated vulnerability-reporting channel. Do not post credentials, document samples, or exploit details in a public issue; establish private contact with the maintainer before sharing sensitive evidence. The project is pre-1.0, so assess it against your threat model before storing high-impact material.
