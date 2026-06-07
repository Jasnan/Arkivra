# Arkivra Architecture Review Checklist

Use this checklist when reviewing architecture, planning refactors, or validating release readiness.

## Domain Boundaries

- [ ] Core document management works without AI.
- [ ] Vaults are the central ownership and authorization boundary.
- [ ] Document, vault, folder, tag, upload, search, chat, audit, activity, backup, and admin domains remain clear.
- [ ] Activity and audit concepts are separate.
- [ ] Provider-specific concerns do not leak into core domain services.
- [ ] Shared utilities are introduced only when they remove real duplication or clarify boundaries.

## API Route Organization

- [ ] Hono routes are registered from `src/modules/server/server.ts`.
- [ ] Protected route prefixes require authentication.
- [ ] Route handlers validate inputs before service calls.
- [ ] Route handlers return structured JSON errors with stable codes.
- [ ] Route files do not accumulate reusable business logic that belongs in services.
- [ ] Route tests cover success, validation, authentication, and authorization failures.

## Service Boundaries

- [ ] Services own reusable domain behavior.
- [ ] Services receive dependencies explicitly, such as database, storage, encryption, providers, and queues.
- [ ] Services are testable without starting the full app when practical.
- [ ] Services avoid direct provider calls unless they are provider-specific services.
- [ ] Services preserve permission filters when returning domain data.

## Database Schema Consistency

- [ ] Drizzle schema is the source of truth.
- [ ] Table names, foreign keys, indexes, and uniqueness constraints match domain rules.
- [ ] Soft-delete, restore, and retention behavior are represented consistently.
- [ ] Authorization tables support system roles, capabilities, vault roles, memberships, and AI access levels.
- [ ] Search, chunk, embedding, and metadata tables support non-AI and AI-enabled operation.
- [ ] Audit and activity schemas support their separate purposes.

## Drizzle Migration Quality

- [ ] Generated migrations match schema changes.
- [ ] Migrations are ordered and named clearly.
- [ ] Migration metadata is committed with SQL files.
- [ ] Destructive changes are avoided or documented with backup implications.
- [ ] Clean database migration succeeds.
- [ ] Existing database migration path is tested for release-impacting changes.

## Search and Indexing Architecture

- [ ] Full-text search works without AI.
- [ ] Semantic search depends on active embedding index state.
- [ ] Search services apply authorization filters for every retrieval mode.
- [ ] Embedding index lifecycle is explicit and observable.
- [ ] Indexing failures do not break core document management.
- [ ] Search ranking and fallback behavior are predictable and documented.

## AI Provider Gateway Boundaries

- [ ] AI providers are optional and runtime-configured.
- [ ] Provider adapters are isolated from Arkivra domain logic.
- [ ] Chat providers and embedding providers can evolve independently.
- [ ] Local and remote provider data exposure is clear.
- [ ] AI-disabled paths do not make provider calls.
- [ ] Provider errors are surfaced safely and do not corrupt domain state.

## Background Jobs and Workers

- [ ] Web and worker process modes are separated intentionally.
- [ ] Job payloads contain enough context without exposing unnecessary sensitive data.
- [ ] Retries, failure states, and cleanup behavior are clear.
- [ ] Document processing, embedding indexing, backups, restores, and maintenance jobs are idempotent where needed.
- [ ] Worker tests cover failure and recovery behavior.
- [ ] Maintenance mode protects restore operations.

## Error Handling

- [ ] Domain errors map to safe API responses.
- [ ] Expected operational failures are handled without crashing unrelated workflows.
- [ ] Parser, storage, provider, queue, and database failures produce clear states.
- [ ] Client-facing messages are actionable but do not expose internals.
- [ ] Error codes are stable enough for dashboard handling.

## Observability and Logging

- [ ] Logs include enough operational context to debug processing, search, backups, and provider failures.
- [ ] Logs avoid secrets, document contents, extracted text, embeddings, provider credentials, and auth tokens.
- [ ] Audit events cover security-relevant actions.
- [ ] Activity events cover user-facing timeline/context actions.
- [ ] Release docs explain how self-hosters can inspect health and failures.

## Testability

- [ ] Pure domain logic has unit tests.
- [ ] Route behavior has integration tests where permissions matter.
- [ ] Authorization boundaries have negative tests.
- [ ] Migrations have e2e validation.
- [ ] Worker and backup flows have e2e or integration coverage.
- [ ] Dashboard permission and async states have frontend tests where practical.
- [ ] Website copy/build changes run Astro checks.

## Frontend Architecture

- [ ] Dashboard features stay in `apps/web/src/features`.
- [ ] Shared components live in `apps/web/src/components` only when reused.
- [ ] Chakra UI v3 system tokens are used consistently.
- [ ] Client-side permission checks are UX hints, not security boundaries.
- [ ] API client behavior is centralized enough to handle auth and errors consistently.
- [ ] Loading, empty, error, and permission-denied states are part of feature design.

## Documentation Architecture

- [ ] Docs distinguish quick start, self-hosting, configuration, operations, security, and user workflows.
- [ ] Docs site structure, when added, has a clear source app/package location.
- [ ] Docs commands match package scripts and Docker Compose behavior.
- [ ] Docs avoid unsupported claims.
- [ ] AI provider docs explain optional behavior, active embedding indexes, and data exposure caveats.
