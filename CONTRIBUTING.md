# Contributing to Arkivra

Thank you for considering a contribution to Arkivra. Bug reports, documentation improvements, focused fixes, and thoughtful product feedback are welcome.

Arkivra is currently a public beta maintained as a focused, self-hostable document management system. Contributions should preserve its documents-first approach: core organization and full-text search must work without an AI provider, while AI features remain optional and provider-configured.

## Choose the right place

- Use [GitHub Discussions](https://github.com/Jasnan/Arkivra/discussions) for questions, early feature ideas, deployment help, and general feedback.
- Use the [issue tracker](https://github.com/Jasnan/Arkivra/issues) for reproducible bugs and concrete feature proposals.
- Follow the [security policy](SECURITY.md) for suspected vulnerabilities. Do not open a public issue for a security report.

Please search existing issues and discussions before starting a new one.

## Feature proposals and project direction

Opening an issue or discussion does not mean a proposal has been accepted. Popularity alone also does not determine Arkivra's roadmap.

Before implementing a new feature or substantial behavior change:

1. Start an Ideas discussion or open a feature proposal.
2. Describe the problem, intended users, and why the change belongs in Arkivra.
3. Wait for a maintainer to agree on the scope and mark the work as accepted or ready for development.

Pull requests that implement unapproved features may be closed without detailed review. This protects contributor time and keeps the project moving in a deliberate direction.

Small documentation corrections and tightly scoped bug fixes do not always require prior approval. Open an issue first when the change is substantial, affects stored data or permissions, changes an interface or configuration, or may need product discussion.

## Development setup

Arkivra is a pnpm monorepo that requires Node.js 22 and pnpm 10.30.3. PostgreSQL 16 with pgvector and a reachable Docling Serve endpoint are required for the complete document workflow.

Follow the [source development guide](https://docs.arkivra.app/self-hosting/from-source/) for setup and startup instructions.

The main packages are:

| Path                  | Purpose                                                     |
| --------------------- | ----------------------------------------------------------- |
| `apps/arkivra-server` | API, workers, database, storage, search, and administration |
| `apps/arkivra-client` | React dashboard                                             |
| `apps/arkivra-docs`   | Documentation website                                       |
| `apps/website`        | Marketing website                                           |

## Working on a change

- Branch from `main` and keep the change focused on one concern.
- Follow existing patterns before introducing new abstractions.
- Add or update tests for behavior changes.
- Update documentation when behavior, configuration, deployment, or user-facing workflows change.
- Do not include secrets, credentials, private documents, extracted text, provider payloads, or production data in commits, fixtures, logs, issues, or pull requests.
- Keep core document management and full-text search independent of optional AI providers.
- Preserve vault-centric permissions and the separation between vault membership and platform administration.

Use Conventional Commit headers with a lowercase subject, for example:

```text
fix(search): preserve vault filters
docs: clarify Docker update steps
```

Repository commits also require a `Changes:` section with at least one human-readable bullet. See `scripts/validate-commit-message.mjs` for the accepted types and exact format.

## Checks

Run the narrowest relevant checks first. Common repository checks include:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:fast
pnpm build
```

Database, migration, authorization, search, AI, storage, and shared changes may require broader integration checks. If a check cannot be run locally, explain why in the pull request.

## Pull requests

- Link the accepted issue for a feature or substantial change.
- Explain the problem and the chosen approach, not only the files changed.
- Keep unrelated cleanup out of the pull request.
- Include tests and documentation appropriate to the risk.
- Call out migrations, compatibility concerns, security implications, and changes to data handling.
- Complete the pull request template and respond to review feedback.

A submitted pull request is a proposal. Maintainers may request changes, reduce its scope, defer it, or decline it when it does not fit the project direction or maintenance capacity.

By contributing, you agree that your contribution is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE).
