---
title: CI Strategy
---

# CI Strategy

Arkivra uses path-aware pull request CI to keep expensive monorepo checks focused on the areas that changed. Baseline quality gates still run on every pull request.

## Baseline Pull Request Checks

These checks run for every pull request and should remain required branch protection checks:

- `CI / Lint, typecheck, and build`
- `Dependency Audit / Audit high and critical dependency vulnerabilities`

The dependency audit runs `pnpm deps:audit`, which fails on high or critical npm advisories.

## Path Detection

The `CI` workflow has a central `Detect changed paths` job powered by `dorny/paths-filter`. Downstream jobs read its outputs instead of duplicating path expressions in each job.

Current outputs:

| Output               | Matching paths                                                                | Used by                                       |
| -------------------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| `api_changed`        | `apps/arkivra-server/**`                                                      | Exposed for future CI routing and diagnostics |
| `web_changed`        | `apps/arkivra-client/**`                                                      | Exposed for future CI routing and diagnostics |
| `website_changed`    | `apps/website/**`                                                             | Exposed for future CI routing and diagnostics |
| `fast_tests_changed` | `apps/arkivra-server/**`, `apps/arkivra-client/**`, `packages/**`             | `Fast tests`                                  |
| `db_changed`         | `apps/arkivra-server/**`, `drizzle/**`, `packages/**`, `.github/workflows/**` | `PostgreSQL-backed tests`, `Migration drift`  |
| `docling_changed`    | `apps/arkivra-server/**`, `packages/**`, `docker/**`, `.github/workflows/**`  | `Docling e2e tests`                           |

The workflow itself is not path-filtered. This avoids required checks being left pending when GitHub skips an entire workflow. Expensive jobs use job-level `if` conditions; when they are not relevant, GitHub records them as skipped instead of pending.

## Pull Request Job Routing

| Change type                                                                        | Baseline checks | Fast tests                                                        | PostgreSQL-backed tests                                         | Migration drift                                                 | Docling e2e tests                                                 |
| ---------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| Website-only PR, such as `apps/website/**`                                         | Run             | Skip                                                              | Skip                                                            | Skip                                                            | Skip                                                              |
| Web-only PR, such as `apps/arkivra-client/**`                                      | Run             | Run                                                               | Skip                                                            | Skip                                                            | Skip                                                              |
| API-only PR, such as `apps/arkivra-server/**`                                      | Run             | Run                                                               | Run                                                             | Run                                                             | Run                                                               |
| Database or migration PR, such as `apps/arkivra-server/drizzle/**` or `drizzle/**` | Run             | Run for `apps/arkivra-server/**`; skip for root `drizzle/**` only | Run                                                             | Run                                                             | Run for `apps/arkivra-server/**`; skip for root `drizzle/**` only |
| Docling integration PR, such as API ingestion code or `docker/**`                  | Run             | Run for API/package changes; skip for `docker/**` only            | Run for API/package/workflow changes; skip for `docker/**` only | Run for API/package/workflow changes; skip for `docker/**` only | Run                                                               |

Documentation-only changes, `README.md`, and non-runtime repository metadata run the baseline checks only unless they also touch `.github/workflows/**`.

## Nightly CI

`.github/workflows/nightly.yml` runs every night and can also be started manually. It does not use path filters.

Nightly coverage includes:

- Full PostgreSQL-backed test suite through `pnpm test:db`
- Migration drift through `pnpm db:check`
- Full Docling e2e suite through `pnpm test:e2e:docling`
- Security scanning through `pnpm deps:audit`

Use nightly CI to catch dependency, service image, parser, database, and integration drift that a path-filtered pull request may not exercise.

When adding a future Playwright e2e suite, add it to the nightly workflow first. Then decide whether it should also have a pull request path filter based on the runtime surface it covers.
