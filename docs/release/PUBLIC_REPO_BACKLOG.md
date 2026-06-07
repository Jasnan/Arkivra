# Public Repository Engineering Backlog

This backlog organizes the repository review findings into release-oriented priorities.
It is scoped to repository quality, maintainability, and public confidence.

## P0 - Required Before Making The Repository Public

### 1. Add Repository CI Gates

- **Problem statement:** The repository has strong local scripts, but no visible CI workflow was found to run lint, typecheck, tests, builds, or website checks automatically.
- **Why it matters:** A public repository needs a visible quality gate so contributors and users can trust that basic checks run consistently.
- **Expected impact:** Higher confidence in merges, easier contribution review, and fewer broken public commits.
- **Estimated effort:** M
- **Dependencies:** Existing package scripts for root, API, dashboard, and website.
- **Acceptance criteria:**
  - CI runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
  - CI runs the website structural check.
  - CI status is visible for pull requests or pushed branches.

### 2. Preserve Structured API Error Codes In The Dashboard

- **Problem statement:** The dashboard API helper preserves only message and status, dropping backend `error.code`.
- **Why it matters:** Arkivra already uses stable backend error codes. Losing them in the client reduces maintainability and weakens consistent error handling.
- **Expected impact:** More reliable UI states, better testability, and cleaner handling of auth, permissions, maintenance mode, and validation failures.
- **Estimated effort:** S
- **Dependencies:** Existing API error response shape.
- **Acceptance criteria:**
  - `ApiError` includes the backend error code when present.
  - Existing API client tests cover status, message, and code.
  - Callers can branch on structured error codes without parsing messages.

### 3. Remove Production Debug Route Logging

- **Problem statement:** `RouterDebugProbe` logs route state to the browser console and is imported by the app shell.
- **Why it matters:** Debug-only instrumentation in a public repo reduces polish and can leak unnecessary navigation context.
- **Expected impact:** Cleaner production behavior and stronger confidence in release discipline.
- **Estimated effort:** S
- **Dependencies:** None.
- **Acceptance criteria:**
  - Debug route logging is removed or gated behind an explicit development-only flag.
  - Production builds do not import debug probes.
  - Relevant tests or lint checks still pass.

### 4. Reconcile Public AI Provider Claims With Current Architecture

- **Problem statement:** Public copy describes provider-neutral local or cloud AI, while server wiring still has direct Ollama-specific provider construction and model filtering.
- **Why it matters:** Public repository claims must match the implementation, especially for AI data exposure and provider behavior.
- **Expected impact:** More accurate public positioning and fewer misunderstandings from self-hosters.
- **Estimated effort:** M
- **Dependencies:** Current AI settings, provider adapters, README, website copy, and dashboard admin AI surfaces.
- **Acceptance criteria:**
  - Public copy accurately describes implemented provider support.
  - Ollama-specific behavior is clearly named where it remains implementation-specific.
  - No docs or UI copy overstates provider neutrality.

### 5. Close Public Documentation Gaps

- **Problem statement:** README still points to documentation and self-hosting docs as coming soon.
- **Why it matters:** A public self-hosted project needs enough setup, configuration, security, and operations documentation for technical users to evaluate it.
- **Expected impact:** Higher public confidence and fewer avoidable support questions.
- **Estimated effort:** L
- **Dependencies:** Existing README, release checklists, Docker Compose setup, `.env.example`, and docs planning notes.
- **Acceptance criteria:**
  - Public docs cover getting started, Docker Compose, configuration, first admin flow, storage/encryption caveats, backups, search, optional AI, and troubleshooting.
  - README links point to real documentation or clearly bounded local docs.
  - Privacy, encryption, and AI caveats match implementation.

## P1 - Strongly Recommended Before First User Release

### 6. Split The Document Detail Page

- **Problem statement:** The document detail page is a very large file that mixes PDF rendering, translation capture, document actions, breadcrumbs, mutations, tabs, and UI state.
- **Why it matters:** This surface is central to the product and currently has high review and regression risk.
- **Expected impact:** Easier feature work, more focused tests, and better ownership of document workflows.
- **Estimated effort:** L
- **Dependencies:** Existing document queries, document API helpers, PDF preview logic, translation capture helpers, and workspace header behavior.
- **Acceptance criteria:**
  - Preview, metadata, activity, translation, actions, and PDF-specific behavior are separated into focused modules or components.
  - Existing user-visible behavior is preserved.
  - Focused tests cover extracted behavior where practical.

### 7. Split The Admin Page By Surface

- **Problem statement:** The admin page combines users, backups, AI, audit, access control, and UI primitives in one large file.
- **Why it matters:** Admin workflows are security-sensitive and operationally important. Large mixed files make authorization and state regressions harder to review.
- **Expected impact:** Better maintainability of admin flows and clearer test boundaries.
- **Estimated effort:** L
- **Dependencies:** Existing admin API, queries, settings UI components, audit components, and route structure.
- **Acceptance criteria:**
  - Admin users, access, AI, backups, audit, and overview surfaces are split into focused modules.
  - Shared admin UI primitives are extracted only where reused.
  - Existing admin tests continue to cover the same flows.

### 8. Split The App Shell Into Focused Components

- **Problem statement:** The app shell owns navigation, quick search, uploads, account UI, layout state, and debug wiring.
- **Why it matters:** The shell is loaded across the dashboard. Complexity here affects every feature and makes global regressions more likely.
- **Expected impact:** Cleaner global layout ownership and easier changes to navigation, search, and transfers.
- **Estimated effort:** M
- **Dependencies:** Existing layout context, upload manager, search queries, navigation routes, and account state.
- **Acceptance criteria:**
  - Quick search, navigation, account menu, and transfers drawer are separated into focused components or hooks.
  - Global layout behavior remains unchanged.
  - Existing app shell tests are updated or extended.

### 9. Replace Router `as any` Search Casts With Typed Search Validation

- **Problem statement:** Several frontend routes and navigations cast search params instead of validating them through TanStack Router schemas.
- **Why it matters:** Search params are shared state. Untyped casts weaken route correctness and make refactors risky.
- **Expected impact:** Safer navigation, clearer route contracts, and fewer hidden runtime edge cases.
- **Estimated effort:** M
- **Dependencies:** Existing router definitions and route constants.
- **Acceptance criteria:**
  - Search params for document, search, chat, and upload routes are typed and validated.
  - `as any` route/search casts are removed from the reviewed navigation paths.
  - Tests cover representative valid and invalid search states.

### 10. Standardize API Request Validation

- **Problem statement:** Some API routes use Zod schemas while others use hand-rolled validators.
- **Why it matters:** Inconsistent validation increases route drift and makes behavior harder to audit.
- **Expected impact:** More predictable API behavior and easier route review.
- **Estimated effort:** M
- **Dependencies:** Current route modules and existing Zod usage.
- **Acceptance criteria:**
  - Route input validation follows a consistent pattern.
  - Existing stable error codes are preserved.
  - Tests cover success and validation failure cases for migrated routes.

### 11. Add API Error Response Helpers

- **Problem statement:** Route files repeat structured JSON error response construction.
- **Why it matters:** Repetition increases the chance of inconsistent error codes, messages, and statuses.
- **Expected impact:** Smaller route handlers and more consistent API responses.
- **Estimated effort:** S
- **Dependencies:** Existing route response shape and validation approach.
- **Acceptance criteria:**
  - Common helpers cover standard auth, forbidden, validation, not found, and operational errors.
  - Existing response codes and payload shapes remain stable.
  - Route tests continue to pass after adoption in targeted modules.

### 12. Add Dependency Audit And Update Workflow

- **Problem statement:** The review found no visible dependency audit or update workflow for sensitive packages.
- **Why it matters:** Arkivra depends on parser, PDF, auth, AI, and web rendering packages where dependency risk matters.
- **Expected impact:** Better release hygiene and a clearer vulnerability response process.
- **Estimated effort:** M
- **Dependencies:** Package manager scripts, CI, and lockfile.
- **Acceptance criteria:**
  - Dependency audit command or workflow is documented.
  - Critical and high vulnerabilities have a documented response path.
  - Parser, PDF, auth, and AI dependencies are explicitly included in release review.

### 13. Add Schema And Migration Drift Checks

- **Problem statement:** Migration e2e coverage is strong, but there is no explicit drift check between Drizzle schema and migrations.
- **Why it matters:** Self-hosted deployments depend on reliable migration history.
- **Expected impact:** Earlier detection of schema/migration mismatches before release.
- **Estimated effort:** M
- **Dependencies:** Drizzle schema, migration files, migration e2e tests, CI.
- **Acceptance criteria:**
  - A repeatable check detects ungenerated schema changes.
  - The check is documented and included in CI or release workflow.
  - Migration e2e tests remain part of release validation.

## P2 - Technical Debt

### 14. Introduce Shared API Contracts Or Generated Types

- **Problem statement:** The monorepo has API and web apps but no shared package or generated contract layer between them.
- **Why it matters:** Client/server contract drift becomes more likely as API surfaces grow.
- **Expected impact:** Fewer mismatches between API responses and dashboard assumptions.
- **Estimated effort:** L
- **Dependencies:** API route response shapes, web API modules, workspace package structure.
- **Acceptance criteria:**
  - Shared contracts or generated types exist for high-traffic API surfaces.
  - Dashboard API modules consume contract types instead of duplicating shapes.
  - The approach is documented for future API additions.

### 15. Move Ollama-Specific AI Wiring Behind Provider Boundaries

- **Problem statement:** General server wiring directly constructs Ollama embedding behavior and contains Ollama-specific model filtering.
- **Why it matters:** Arkivra's architecture aims to keep provider-specific concerns isolated.
- **Expected impact:** Cleaner AI provider evolution and easier future support for non-Ollama providers.
- **Estimated effort:** L
- **Dependencies:** Admin AI settings, embedding provider adapters, search services, chat services.
- **Acceptance criteria:**
  - Provider-specific model filtering lives in provider-specific modules.
  - General server wiring resolves providers through a neutral gateway or factory.
  - AI-disabled behavior remains unchanged.

### 16. Complete Or Simplify Website i18n

- **Problem statement:** The website has i18n utilities, but they currently always return the default locale and much of the homepage is hard-coded English.
- **Why it matters:** Partial i18n infrastructure adds complexity without delivering localized behavior.
- **Expected impact:** Clearer website architecture and less confusion for future website changes.
- **Estimated effort:** M
- **Dependencies:** Website locale utilities, homepage, localized routes, translations.
- **Acceptance criteria:**
  - Either i18n is completed for supported localized routes, or the website is explicitly simplified to single-locale behavior.
  - Homepage copy follows the chosen approach.
  - Existing i18n route tests are updated to match the chosen behavior.

### 17. Align App Tooling Versions

- **Problem statement:** The dashboard and website use different TypeScript, ESLint config package, and Vitest major versions.
- **Why it matters:** Tooling drift increases maintenance overhead and can make root-level checks less predictable.
- **Expected impact:** More consistent local and CI behavior across apps.
- **Estimated effort:** S
- **Dependencies:** Package manifests, lockfile, app-specific lint/test configs.
- **Acceptance criteria:**
  - Tooling version differences are aligned or explicitly documented.
  - Root scripts continue to pass.
  - Lockfile changes are reviewed for unrelated dependency churn.

### 18. Add Code Ownership Notes For Sensitive Modules

- **Problem statement:** Security-sensitive modules are clearly identified in agent guidance but do not have visible ownership or review routing.
- **Why it matters:** Public contributions need clear review expectations for auth, RBAC, storage, parsing, search, AI, backups, audit, and migrations.
- **Expected impact:** Better review discipline and fewer accidental changes to sensitive surfaces.
- **Estimated effort:** S
- **Dependencies:** Repository hosting choice and module boundaries.
- **Acceptance criteria:**
  - Sensitive paths have ownership or review notes.
  - The guidance covers auth, authorization, storage, parsing, search/RAG, AI, backups, audit, and migrations.
  - Public contributors can identify which changes require stricter review.

### 19. Add Focused Tests Around Extracted Frontend Modules

- **Problem statement:** Large frontend files have tests, but extracting behavior should preserve coverage around hooks/components rather than relying only on broad page tests.
- **Why it matters:** Focused tests make future UI changes less brittle and easier to review.
- **Expected impact:** Better regression coverage for dashboard refactors.
- **Estimated effort:** M
- **Dependencies:** Splitting document detail, admin page, and app shell modules.
- **Acceptance criteria:**
  - Extracted hooks/components have focused tests where behavior is non-trivial.
  - Broad page tests still cover integration behavior.
  - Test coverage maps to loading, error, empty, and permission-sensitive states where applicable.

## P3 - Future Improvements

### 20. Localize Homepage Copy Through The Existing Translation Layer

- **Problem statement:** The homepage contains mostly hard-coded English arrays and strings despite the existing website i18n structure.
- **Why it matters:** Keeping key public copy outside the translation layer increases drift and makes later localization harder.
- **Expected impact:** Cleaner website content ownership and a more consistent public website architecture.
- **Estimated effort:** S
- **Dependencies:** The decision to complete or simplify website i18n.
- **Acceptance criteria:**
  - Homepage copy follows the selected i18n approach.
  - Public positioning, privacy caveats, and AI caveats remain consistent.
  - Website tests and structural checks are updated if needed.
