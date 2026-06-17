---
title: CI Strategy
---

# CI Strategy

Arkivra uses path-aware pull request CI to keep expensive monorepo checks focused on the areas that changed. Baseline quality gates still run on every pull request.

## Baseline Pull Request Checks

This check runs for every pull request and should remain a required branch protection check:

- `CI / Lint, typecheck, and build`

The dependency audit runs `pnpm deps:audit`, which fails on high or critical npm advisories. On pull requests it runs only when dependency manifests, `pnpm-lock.yaml`, package manifests, or audit workflow files change. It still runs on every `main` push, on the weekly schedule, and through manual dispatch.

## Path Detection

The `CI` workflow has a central `Detect changed paths` job powered by `dorny/paths-filter`. Downstream jobs read its outputs instead of duplicating path expressions in each job.

Current outputs:

| Output               | Matching paths                                                                                                | Used by                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `api_changed`        | `apps/arkivra-server/**`                                                                                      | Exposed for future CI routing and diagnostics |
| `web_changed`        | `apps/arkivra-client/**`                                                                                      | Exposed for future CI routing and diagnostics |
| `website_changed`    | `apps/website/**`                                                                                             | Exposed for future CI routing and diagnostics |
| `docs_changed`       | `apps/docs/**`, `docs/**`                                                                                     | Exposed for future CI routing and diagnostics |
| `fast_tests_changed` | `apps/arkivra-server/**`, `apps/arkivra-client/**`, packages, package manifests, `pnpm-lock.yaml`             | `Fast tests`                                  |
| `postgresql_changed` | DB-backed API modules, parser persistence, server wiring, package/lockfile changes, CI workflow changes       | `PostgreSQL-backed tests`                     |
| `migration_changed`  | Drizzle migrations, Drizzle schema, migration/drift scripts, package/lockfile changes, CI workflow changes    | `Migration drift`                             |
| `docling_changed`    | Docling client/parser/parsing paths, Docling e2e fixtures, document worker paths, Docker, packages, workflows | `Docling e2e tests`                           |

The workflow itself is not path-filtered. This avoids required checks being left pending when GitHub skips an entire workflow. Expensive jobs use job-level `if` conditions; when they are not relevant, GitHub records them as skipped instead of pending.

## Pull Request Job Routing

| Change type                                                                        | Static checks | Dependency audit                | Fast tests                                                             | PostgreSQL-backed tests                       | Migration drift                                               | Docling e2e tests                                           |
| ---------------------------------------------------------------------------------- | ------------- | ------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| Website-only PR, such as `apps/website/**`                                         | Run           | Run only for dependency changes | Skip                                                                   | Skip                                          | Skip                                                          | Skip                                                        |
| Docs-only PR, such as `apps/docs/**` or `docs/**`                                  | Run           | Run only for dependency changes | Skip                                                                   | Skip                                          | Skip                                                          | Skip                                                        |
| Web-only PR, such as `apps/arkivra-client/**`                                      | Run           | Run only for dependency changes | Run                                                                    | Skip                                          | Skip                                                          | Skip                                                        |
| Generic API PR, such as route, service, or test refactors                          | Run           | Run only for dependency changes | Run                                                                    | Run only when a DB-backed API surface changes | Skip unless schema, migrations, or migration tooling change   | Skip unless Docling, parsing, processing, or Docker changes |
| Database or migration PR, such as Drizzle schema, migrations, or migration scripts | Run           | Run only for dependency changes | Run for `apps/arkivra-server/**`; skip for migration-only root changes | Run                                           | Run                                                           | Skip unless Docling-related paths also change               |
| Docling integration PR, such as parser, processing, Docling client, or `docker/**` | Run           | Run only for dependency changes | Run for API/package changes; skip for `docker/**` only                 | Run only when DB-backed API paths also change | Run only when schema, migrations, or migration tooling change | Run                                                         |

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
