# Dependency Audit And Update Workflow

Use this workflow before public releases, when changing dependencies, and when a scheduled dependency audit fails.

## Commands

Run the high-and-critical audit from the repository root:

```bash
pnpm deps:audit
```

For a release-focused runtime dependency check:

```bash
pnpm deps:audit:prod
```

To review available package updates:

```bash
pnpm deps:outdated
```

`pnpm audit` uses the configured package registry. If the registry is unavailable, rerun the command before accepting a release.

## CI Coverage

`.github/workflows/dependency-audit.yml` runs `pnpm deps:audit`:

- on pull requests that change package manifests, the lockfile, or the audit workflow;
- on pushes to `main` that change those files;
- weekly by schedule;
- manually through `workflow_dispatch`.

The audit fails on high or critical advisories. Do not ignore a failing audit without documenting the advisory, affected package, exposure, mitigation, and follow-up issue.

## High And Critical Vulnerability Response

For each high or critical advisory:

1. Identify whether the vulnerable package is runtime, development-only, optional, or Docker image related.
2. Check whether Arkivra uses the affected code path, including transitive use through parser, PDF, auth, AI, and rendering packages.
3. Prefer updating the direct dependency and regenerating `pnpm-lock.yaml`.
4. If only a transitive package is affected, prefer a dependency update that naturally resolves it. Use a pnpm override only when the override is compatible and documented in the PR.
5. If no fix is available, document the risk, affected versions, current exposure, mitigation, and owner before release.
6. Run the smallest relevant checks for the affected surface, then broaden to app build/typecheck/test coverage when the package affects shared runtime behavior.

Release-impacting vulnerabilities must be fixed or explicitly accepted with a documented caveat before a public release.

## Current Overrides

The root `package.json` pins Vite through a pnpm override so transitive website tooling uses a patched Vite 6.4.x release. Keep this override until all direct and transitive Vite consumers resolve to a patched version without it.

## Sensitive Dependency Review Areas

Review these dependency areas during release readiness and when the related packages change:

| Area                              | Current packages and images                                                                                                 | Review focus                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Parser, PDF, and image processing | `pdfjs-dist`, `pdf-lib`, `react-pdf`, `@napi-rs/canvas`, Docling Docker image                                               | CVEs in parsers, malformed file handling, native package advisories, Docker image version advisories |
| Authentication                    | `better-auth`                                                                                                               | Auth bypass, session handling, token handling, CSRF/CORS-related advisories                          |
| AI providers and chat             | `ai`, `@ai-sdk/openai-compatible`, `@ai-sdk/react`, `@assistant-ui/react`, `@assistant-ui/react-ai-sdk`, `ollama`           | Provider request handling, streaming, prompt/content exposure, remote provider caveats               |
| Web rendering and Markdown        | `react`, `react-dom`, `vite`, `astro`, `react-markdown`, `rehype-sanitize`, `remark-gfm`, Chakra UI, routing/query packages | XSS, unsafe rendering, dev server advisories that affect production builds, sanitization regressions |
| Storage, database, and migrations | `pg`, `postgres`, `drizzle-orm`, `drizzle-kit`                                                                              | Query handling, migration tooling advisories, connection handling                                    |

Also review Docker base images and service images used by Docker Compose before release. The dependency audit script covers npm packages only; Docker image review is a separate release check.
