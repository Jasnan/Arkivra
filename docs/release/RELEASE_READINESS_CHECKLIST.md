# Arkivra Release Readiness Checklist

Use this checklist before a public release. Treat unchecked critical items as blockers until they are either fixed or explicitly accepted with a documented caveat.

## Repository Hygiene

- [ ] Root README explains what Arkivra is, current status, supported surfaces, and quick start.
- [ ] License file exists and matches package metadata.
- [ ] `SECURITY.md` exists with supported versions, vulnerability reporting, and no overclaimed guarantees.
- [ ] `CONTRIBUTING.md` exists with setup, branch, test, commit, and PR expectations.
- [ ] Code of conduct decision is documented. Add `CODE_OF_CONDUCT.md` if the project wants one for public contribution.
- [ ] `.env.example` is complete, safe for local development, and explains required secrets.
- [ ] Generated artifacts, local storage, backups, and secrets are ignored.
- [ ] Release notes or changelog plan exists.

## Package and Build Health

- [ ] `pnpm install` succeeds from a clean checkout.
- [ ] `pnpm format:check` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test` passes or documented non-release-blocking failures are accepted.
- [ ] `pnpm build` passes.
- [ ] App-specific checks pass:
  - [ ] `pnpm --filter @arkivra/api build`
  - [ ] `pnpm --filter @arkivra/web build`
  - [ ] `pnpm --filter @arkivra/website check`
  - [ ] `pnpm --filter @arkivra/website build`
  - [ ] `pnpm --filter @arkivra/docs check`
  - [ ] `pnpm --filter @arkivra/docs build`

## CI and Automation

- [ ] CI workflow exists for install, lint, typecheck, tests, and build.
- [ ] CI uses pnpm and the repo package manager version.
- [ ] CI covers API, dashboard, website, and docs.
- [ ] CI documents any external service dependencies.
- [ ] Commit message validation is either documented or automated.

## Dependency and Secret Hygiene

- [ ] Dependency audit is run using `pnpm deps:audit` or the [dependency audit workflow](./DEPENDENCY_AUDIT_WORKFLOW.md), and release-impacting vulnerabilities are fixed or documented.
- [ ] Parser, PDF, auth, AI, and rendering dependencies are reviewed using the sensitive dependency list in the dependency audit workflow.
- [ ] Secret scanning is run against the repo history and working tree.
- [ ] No real secrets are present in `.env.example`, docs, tests, screenshots, or logs.
- [ ] Docker images and base images are reviewed for known issues.

## Docker and Self-Hosting

- [ ] `docker compose up -d` starts PostgreSQL with pgvector, Docling, API, and worker.
- [ ] Health check works at `http://localhost:1221/api/health`.
- [ ] Dashboard is reachable at the documented URL.
- [ ] Required production secrets are documented, especially `ARKIVRA_AUTH_SECRET` and `ARKIVRA_ENCRYPTION_KEYS`.
- [ ] Persistent volumes for PostgreSQL, document storage, Docling data, and backups are documented.
- [ ] Reverse proxy and TLS expectations are documented.
- [ ] Upgrade and rollback caveats are documented.

## Database and Migrations

- [ ] Drizzle schema matches generated migrations: `pnpm db:check`.
- [ ] `pnpm db:migrate` succeeds on a clean database.
- [ ] Migration e2e tests pass: `pnpm --filter @arkivra/api test:e2e:migrations`.
- [ ] Destructive migration risks are documented.
- [ ] pgvector extension requirements are documented.
- [ ] Backup before upgrade is documented.

## Core Product Workflows

- [ ] First admin/bootstrap flow works.
- [ ] Email/password authentication works.
- [ ] OAuth behavior is documented if enabled.
- [ ] Two-factor authentication behavior is tested or documented.
- [ ] Vault creation, membership, roles, and invitations work.
- [ ] Upload, processing, preview, download, document versioning, restore, and trash workflows work.
- [ ] Upload conflict strategies are tested or manually verified: skip, keep both, and new version.
- [ ] Folder, tag, metadata, and filtering workflows work.
- [ ] Full-text search works without AI enabled.
- [ ] Default document search returns current completed versions only, and historical search is explicitly requested.
- [ ] Worker processing recovers from common failure states.

## Tests

- [ ] API non-e2e tests pass.
- [ ] API authorization e2e tests pass.
- [ ] API processing e2e tests pass.
- [ ] API persistence e2e tests pass.
- [ ] API backup e2e tests pass.
- [ ] API background job e2e tests pass.
- [ ] Dashboard tests pass.
- [ ] Website tests pass.
- [ ] Manual smoke test covers upload, parse, version restore, search, preview, download, purge, and backup.
- [ ] Manual versioning smoke test covers upload v1, upload v2 as a new version, freeze a chat, upload v3, restore v1 to v4, and verify the frozen chat does not switch to v3 or v4.

## Backup and Restore

- [ ] Backup creation is documented.
- [ ] Restore flow is documented.
- [ ] Maintenance mode behavior during restore is documented.
- [ ] Storage and database consistency expectations are documented.
- [ ] Version-owned source files, previews, chunks, embeddings, chat manifests, and citation metadata are covered by backup and restore validation.
- [ ] Encryption key backup warning is prominent.
- [ ] Loss of encryption key impact is documented.

## AI Provider Configuration

- [ ] Docs explain that AI features are optional.
- [ ] Docs explain that document management and full-text search work without AI.
- [ ] Local provider setup is documented where supported.
- [ ] Remote/cloud provider caveats are documented.
- [ ] Semantic search requirements are documented, including active embedding index behavior.
- [ ] Full-text fallback behavior is documented.
- [ ] Provider credentials are stored and handled according to implementation.
- [ ] RAG/chat permission boundaries are tested or reviewed, including frozen document-version manifests.

## Privacy and Security Claims Audit

- [ ] README, website, docs, UI copy, and screenshots avoid unsupported claims.
- [ ] No "fully private", "zero knowledge", or end-to-end encrypted claims appear unless proven by code.
- [ ] Uploaded files and extracted assets encryption-at-rest claims match implementation.
- [ ] Extracted text, chunks, metadata, chat history, embeddings, and vectors are described accurately.
- [ ] Document-version deletion and permanent purge docs do not imply purged source content remains available.
- [ ] AI provider data exposure is clear.
- [ ] Audit logs and activity logs are described separately.

## Marketing Website

- [ ] Homepage positioning is self-hosted-first, open-source-first, and optional-AI.
- [ ] Copy avoids hype and unsupported privacy/security claims.
- [ ] Feature descriptions match actual product behavior.
- [ ] CTAs point to real destinations or clearly marked coming-soon destinations.
- [ ] Responsive and accessibility review is complete.
- [ ] `pnpm --filter @arkivra/website check` passes.
- [ ] `pnpm --filter @arkivra/website build` passes.

## Documentation Site Minimum Viable Pages

- [ ] Introduction.
- [ ] Changelog or release status.
- [ ] Docker Compose self-hosting.
- [ ] From-source setup.
- [ ] Configuration reference.
- [ ] First admin and auth setup.
- [ ] Roles and administration.
- [ ] Document versioning, historical restore, individual version deletion, and permanent purge behavior.
- [ ] Document encryption.
- [ ] Backups and restore.
- [ ] Search and optional semantic search.
- [ ] Optional AI providers.
- [ ] OAuth setup.
- [ ] Troubleshooting.

## Demo Readiness

- [ ] Demo data is safe and contains no private documents.
- [ ] Demo flow works without remote AI.
- [ ] Optional AI demo uses clear provider/data caveats.
- [ ] Screenshots or recordings do not expose secrets.
- [ ] Known release limitations are documented.
