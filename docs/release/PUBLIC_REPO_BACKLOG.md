# Public Repository Engineering Backlog

This backlog organizes the repository review findings into release-oriented priorities.
It is scoped to repository quality, maintainability, and public confidence.

## P0 - Required Before Making The Repository Public [ALL IMPLEMENTED]

### 1. Add Repository CI Gates
### 2. Preserve Structured API Error Codes In The Dashboard
### 3. Remove Production Debug Route Logging
### 4. Reconcile Public AI Provider Claims With Current Architecture
### 5. Close Public Documentation Gaps

## P1 - Strongly Recommended Before First User Release [ALL IMPLEMENTED]

### 6. Split The Document Detail Page
### 7. Split The Admin Page By Surface
### 8. Split The App Shell Into Focused Components
### 9. Replace Router `as any` Search Casts With Typed Search Validation
### 10. Standardize API Request Validation
### 11. Add API Error Response Helpers
### 12. Add Dependency Audit And Update Workflow
### 13. Add Schema And Migration Drift Checks

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
