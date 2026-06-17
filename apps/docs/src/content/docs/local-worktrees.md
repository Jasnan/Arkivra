---
title: Local Worktrees
---

# Local Git Worktrees

Arkivra supports running multiple local Git worktrees on the same machine. Each worktree should have its own `.env` file with distinct ports and an `APP_INSTANCE` name.

## Recommended Convention

Keep the first checkout on the defaults:

```dotenv
ARKIVRA_WEB_PORT=5173
ARKIVRA_PORT=1221
ARKIVRA_DATABASE_URL=postgres://arkivra:arkivra@127.0.0.1:5432/arkivra
```

For each additional worktree, reserve the next frontend/API pair and use a separate database:

```dotenv
APP_INSTANCE=ui-chat
ARKIVRA_WEB_PORT=5174
ARKIVRA_PORT=1222
ARKIVRA_DATABASE_URL=postgres://arkivra:arkivra@127.0.0.1:5432/arkivra_ui_chat
```

```dotenv
APP_INSTANCE=rag
ARKIVRA_WEB_PORT=5175
ARKIVRA_PORT=1223
ARKIVRA_DATABASE_URL=postgres://arkivra:arkivra@127.0.0.1:5432/arkivra_rag
```

When `ARKIVRA_SERVER_BASE_URL`, `ARKIVRA_WEB_BASE_URL`, `ARKIVRA_CORS_ORIGINS`, and `ARKIVRA_AUTH_TRUSTED_ORIGINS` are omitted, Arkivra derives local URLs from `ARKIVRA_PORT` and `ARKIVRA_WEB_PORT`.

## Runtime State

Set `APP_INSTANCE` in secondary worktrees. With explicit path env vars omitted, Arkivra stores local runtime files under the API process working directory. With the repo scripts, that is normally `apps/arkivra-server`:

```text
apps/arkivra-server/var/<APP_INSTANCE>/document-storage
apps/arkivra-server/var/<APP_INSTANCE>/upload-staging
apps/arkivra-server/var/<APP_INSTANCE>/backups
```

The worker queue names are also prefixed with `APP_INSTANCE`, so an API and worker from one worktree do not claim jobs created by another worktree when they temporarily share a database.

Worker mode does not bind a network port. Its local isolation comes from `APP_INSTANCE`, the configured database URL, and the filesystem paths above.

For stronger isolation, use one Postgres database per worktree. This is recommended because document metadata, users, auth sessions, admin settings, and chat history all live in Postgres.

## Running A Worktree

From the worktree root:

```bash
cp .env.example .env
# Edit APP_INSTANCE, ARKIVRA_WEB_PORT, ARKIVRA_PORT, and ARKIVRA_DATABASE_URL.
pnpm db:migrate
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

Vite runs with `strictPort`, so it fails fast if another worktree is already using the configured frontend port.

## Shared Local Services

Docling and Ollama can usually be shared across worktrees:

```dotenv
ARKIVRA_DOCLING_URL=http://127.0.0.1:5001
ARKIVRA_OLLAMA_HOST=http://127.0.0.1:11434
```

If you run separate Docker Compose stacks for each worktree, also assign unique host ports:

```dotenv
ARKIVRA_POSTGRES_PORT=5433
ARKIVRA_DOCLING_PORT=5002
COMPOSE_PROJECT_NAME=arkivra-ui-chat
```

The application containers use the internal service ports, so `ARKIVRA_POSTGRES_PORT` and `ARKIVRA_DOCLING_PORT` only affect host access.

## OAuth Redirects

If OAuth is enabled, update provider redirect URLs for the worktree API port:

```dotenv
GOOGLE_REDIRECT_URI=http://localhost:1222/api/auth/callback/google
GITHUB_REDIRECT_URI=http://localhost:1222/api/auth/callback/github
```
