# Arkivra Security Review Checklist

Use this checklist for security reviews, PR review, and release audits. Prioritize exploitable issues, data exposure, and permission boundary failures.

## Authentication

- [ ] Session handling follows Better Auth expectations.
- [ ] Protected API routes require authentication.
- [ ] Disabled users cannot access protected resources.
- [ ] Email verification requirements are enforced when configured.
- [ ] OAuth callback URLs and provider secrets are documented safely.
- [ ] Two-factor flows are tested for enable, disable, login, and recovery paths where implemented.

## Authorization and RBAC

- [ ] System admin role checks are separate from vault role checks.
- [ ] System capabilities are checked where required, such as vault creation.
- [ ] Vault owner, editor, and viewer semantics are consistent.
- [ ] Vault AI access levels are enforced for chat and semantic retrieval.
- [ ] The last active admin or owner cannot be removed if implementation intends that protection.
- [ ] Permission request and invitation flows cannot escalate privileges without approval.

## Vault Permission Boundaries

- [ ] Documents are listed only from vaults the caller can access.
- [ ] Preview, download, restore, trash, and permanent-delete actions enforce vault access.
- [ ] Document version list, detail, download, preview, restore, and delete routes enforce the logical document's vault boundary.
- [ ] Folder and tag operations enforce vault access.
- [ ] Search filters enforce vault access.
- [ ] Chat/RAG context is built only from authorized vault/document scope.
- [ ] Chat/RAG context remains pinned to authorized document versions after the first accepted user message.
- [ ] Admin views do not leak document contents unless explicitly authorized.
- [ ] Tests cover negative access cases.

## File Upload Validation

- [ ] Upload endpoints require authentication.
- [ ] Upload targets require vault write permissions.
- [ ] Filenames are normalized or safely stored.
- [ ] Paths cannot escape staging or storage roots.
- [ ] MIME type, extension, size, and content assumptions are validated or documented.
- [ ] Failed uploads clean up staging files.
- [ ] Duplicate, new-version, and restore behavior cannot overwrite unauthorized content.

## File Storage and Encryption-at-Rest Claims

- [ ] Uploaded originals are encrypted at rest as claimed.
- [ ] Extracted assets are encrypted at rest if claimed.
- [ ] Encryption key configuration and rotation behavior are documented accurately.
- [ ] Loss of active encryption key impact is documented.
- [ ] Extracted text, chunks, metadata, chat history, embeddings, and vectors are not described as encrypted unless proven.
- [ ] Storage paths do not expose tenant/user data across worktrees or instances.

## Parser and Docling Boundary

- [ ] Parser input is treated as untrusted.
- [ ] Docling service failures produce safe document processing states.
- [ ] Parser output is validated before persistence.
- [ ] Large or malformed files cannot exhaust resources beyond configured limits.
- [ ] Extracted images/assets are stored safely.
- [ ] Parser logs do not leak document contents unnecessarily.

## RAG and Context Leakage

- [ ] Chat requires authenticated user context.
- [ ] Chat uses permission-aware document/search services.
- [ ] Context selection cannot cross unauthorized vault boundaries.
- [ ] Semantic search respects the same filters as full-text search.
- [ ] Current-version search does not leak historical chunks by default.
- [ ] Explicit version-pinned retrieval cannot cross vault boundaries through supplied document version IDs.
- [ ] Chat history ownership is enforced.
- [ ] Prompt/context logs do not expose sensitive document contents unless deliberately enabled and redacted.
- [ ] Tests cover inaccessible vaults/documents in RAG.

## AI Provider Data Exposure

- [ ] UI and docs explain that configured providers may receive document text or extracted context.
- [ ] Local and remote/cloud provider behavior is not conflated.
- [ ] Provider base URLs and credentials are protected.
- [ ] Provider request logging defaults are safe.
- [ ] Embedding and chat providers are isolated behind provider boundaries.
- [ ] AI-disabled behavior does not call providers.

## Input Validation

- [ ] Request JSON is validated before use.
- [ ] IDs are validated for expected format where practical.
- [ ] Dates, pagination, sorting, filters, and enum values are constrained.
- [ ] Error responses do not expose stack traces or sensitive internals.
- [ ] User-provided display text is escaped in the UI.

## SQL Injection

- [ ] Drizzle query builders or parameterized SQL are used.
- [ ] Raw SQL uses parameters and controlled identifiers.
- [ ] Search queries are sanitized for PostgreSQL full-text search.
- [ ] Sorting and filtering do not concatenate untrusted column names.

## XSS

- [ ] Rendered markdown or extracted text is sanitized.
- [ ] Document metadata and filenames are escaped in the dashboard.
- [ ] Chat messages are rendered safely.
- [ ] Website content and localized strings do not introduce unsafe HTML.

## CSRF and CORS

- [ ] CORS origins are configured from trusted settings.
- [ ] Credentials behavior is deliberate.
- [ ] Auth/session endpoints have appropriate CSRF protections according to Better Auth behavior.
- [ ] Production docs warn against wildcard origins with credentials.

## Rate Limiting and Abuse

- [ ] Login, 2FA, invitation, sensitive action, upload, chat, indexing, and provider-testing endpoints are reviewed for abuse controls.
- [ ] Worker queues handle retries and backoff safely.
- [ ] Expensive parsing, OCR, embedding, and chat paths have resource controls or documented limits.

## Secrets Management

- [ ] `.env.example` contains placeholders only.
- [ ] Real secrets are not committed.
- [ ] `ARKIVRA_AUTH_SECRET`, provider credentials, SMTP credentials, and `ARKIVRA_ENCRYPTION_KEYS` are protected.
- [ ] Secrets are redacted from logs and audit metadata.
- [ ] Backup docs explain encryption key backup requirements.

## Logging and Audit Logging

- [ ] Security-relevant actions emit audit events.
- [ ] User-facing activity is not treated as a security audit substitute.
- [ ] Audit metadata is redacted.
- [ ] Version lifecycle audit metadata excludes extracted text, snippets, embeddings, provider payloads, and encryption keys.
- [ ] Logs do not contain secrets, tokens, provider keys, or raw document contents.
- [ ] Failed sensitive actions are recorded where appropriate.

## Error Handling

- [ ] API errors use stable codes and safe messages.
- [ ] Parser, storage, provider, database, and worker failures do not leave ambiguous states.
- [ ] Maintenance mode prevents unsafe writes during restore.
- [ ] Client error states do not leak hidden resources.

## Dependency Vulnerabilities

- [ ] `pnpm audit` or an equivalent dependency audit has been run.
- [ ] Critical and high vulnerabilities are fixed or documented with mitigation.
- [ ] Docker image versions are reviewed.
- [ ] Transitive parser/PDF/image dependencies are reviewed for relevant CVEs.

## Docker and Deployment Defaults

- [ ] Default secrets are clearly development-only.
- [ ] PostgreSQL is not exposed publicly in production guidance.
- [ ] Volumes persist database, document storage, Docling state, and backups.
- [ ] Reverse proxy/TLS expectations are documented.
- [ ] Production CORS, base URLs, SMTP, and auth URLs are documented.
- [ ] Container health checks do not expose sensitive information.
