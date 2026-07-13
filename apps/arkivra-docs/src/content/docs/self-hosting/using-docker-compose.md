---
title: Using Docker Compose
description: Deploy the published Arkivra image with PostgreSQL and persistent storage.
---

Arkivra keeps public deployment and source development in separate Compose files:

| File                      | Purpose                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `compose.production.yaml` | Public deployment template. Pulls the published GHCR image and does not build from source.                               |
| `docker-compose.yml`      | Repository contributor stack. Builds `arkivra:local` from the current checkout and publishes PostgreSQL for local tools. |

For a public deployment, copy `compose.production.yaml` into a private deployment directory as `compose.yaml`. Do not combine it with the contributor file. The canonical file connects to an existing Docling endpoint. The [Compose generator](/docker-compose-generator/) can instead add Docling to the stack and can disable, add, or connect to Gotenberg.

## Service layout

The canonical public stack contains:

- **postgres** — PostgreSQL 16 with pgvector, available only on the internal Compose network;
- **arkivra** — the API, dashboard, migrations, document worker, embedding worker, maintenance worker, and backup worker from the published image.

It requires a reachable **Docling** HTTP API for document parsing. Docling can run on bare metal, in another container, or remotely; it is required even when AI is disabled. A generator-created stack can include the tested `quay.io/docling-project/docling-serve-cpu:v1.20.0` image and wait for it to become healthy. The generator can also include the optional Gotenberg service for office-document PDF previews.

Arkivra waits for PostgreSQL to become healthy. Both services use `unless-stopped` restart policies, and Arkivra has its own HTTP health check. The application runs as UID/GID `10001` inside the rootless image.

Two named volumes persist state:

- `postgres-data` contains users, vaults, metadata, extracted text and chunks, search vectors, embeddings, chat history, audit and activity records, and job state.
- `arkivra-data` contains encrypted uploaded source files, encrypted extracted assets, upload staging data, backup sets, and restore maintenance markers.

Neither volume is a complete backup by itself. Preserve both application data and the secrets described in [Backups and restore](/operations/backups-and-restore/).

## Obtain the files

Use the [Compose generator](/docker-compose-generator/) for an interactive setup, or download the canonical files from the repository:

```bash
mkdir arkivra && cd arkivra
umask 077
curl -fsSL https://raw.githubusercontent.com/Jasnan/Arkivra/main/compose.production.yaml -o compose.yaml
curl -fsSL https://raw.githubusercontent.com/Jasnan/Arkivra/main/compose.env.example -o .env
chmod 600 .env
```

The Compose file has no `build` section, source mount, development command, or development dependency. It can run outside a source checkout.

## Configure required values

For the canonical stack, set all five required values in `.env`: `POSTGRES_PASSWORD`, `ARKIVRA_PUBLIC_URL`, `ARKIVRA_DOCLING_URL`, `ARKIVRA_AUTH_SECRET`, and `ARKIVRA_ENCRYPTION_KEYS`. The generated `.env` also records the basic defaults `COMPOSE_PROJECT_NAME`, `POSTGRES_DB_NAME`, `ARKIVRA_PORT`, registration enabled, and email verification disabled.

### PostgreSQL password

Generate a URL-safe hexadecimal password:

```bash
openssl rand -hex 32
```

```dotenv
POSTGRES_PASSWORD=<generated-64-hex-character-value>
```

Keep this value stable. Changing it in `.env` does not change the password already stored in an initialized PostgreSQL volume.

### Authentication secret

Generate a separate secret:

```bash
openssl rand -hex 48
```

```dotenv
ARKIVRA_AUTH_SECRET=<generated-96-hex-character-value>
```

### File-encryption key

Generate another 32-byte value and prefix it with key version `1:`:

```bash
openssl rand -hex 32
```

```dotenv
ARKIVRA_ENCRYPTION_KEYS=1:<generated-64-hex-character-key>
```

For rotation, retain old versions and add a higher version for new files. Removing a key version used by stored files prevents those files from being decrypted.

### Public and Docling URLs

Set the exact browser-facing origin and a Docling Serve URL visible from the container:

```dotenv
ARKIVRA_PUBLIC_URL=https://documents.example.com
ARKIVRA_DOCLING_URL=https://docling.example.com
```

Do not put credentials in these URLs. For a service on the same Compose network, use its service name. For a service on the Docker host, use an address supported by your Docker installation rather than `localhost`, which refers to the Arkivra container itself.

This is a parsing dependency, not an AI provider. Without reachable Docling, Arkivra cannot extract uploaded documents for normal content and full-text search. See [Document processing](/self-hosting/document-processing/) for Docker, native, remote, and Apple Silicon options.

## Image and network defaults

The deployment defaults to the fixed version tag:

```text
ghcr.io/jasnan/arkivra:0.1.0-beta.1
```

The GHCR package must be public, or the Docker client must already be authenticated to pull it. A pull-denied response on an otherwise correct image name can indicate that package visibility still needs to be changed.

To intentionally follow the newest beta, set:

```dotenv
ARKIVRA_IMAGE=ghcr.io/jasnan/arkivra:beta
```

The `beta` tag can change. Review release information and take a tested backup before pulling it. Arkivra does not use or document a `latest` tag for this beta deployment.

By default, Compose publishes Arkivra as `127.0.0.1:3210`. This is suitable for a reverse proxy on the Docker host. To deliberately publish the unencrypted application port on every interface, set `ARKIVRA_BIND_ADDRESS=0.0.0.0` and protect access at the host firewall or network boundary. PostgreSQL is never published by the public file.

## Optional settings

The bootstrap `.env` intentionally contains only the settings needed for a basic deployment. `ARKIVRA_GOTENBERG_URL` is optional for office previews, and `ARKIVRA_OLLAMA_HOST` is optional for an Ollama-based AI setup. SMTP, OAuth, restore, VLM, provider credentials, and operational tuning belong in the [Configuration reference](/self-hosting/configuration/).

Core document management and full-text search do not require an AI provider, but they do require Docling.

## Start and verify

Validate first. `--quiet` avoids printing the fully interpolated environment to your terminal or CI logs:

```bash
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps
curl http://127.0.0.1:3210/api/health
```

Review startup logs if a service is unhealthy:

```bash
docker compose logs arkivra
docker compose logs postgres
```

For a generator-created stack, also inspect `docker compose logs docling` or `docker compose logs gotenberg` when those services are included.

The Arkivra entrypoint applies database migrations before starting the API and workers.

## Update or stop

For a pinned release, change `ARKIVRA_IMAGE` or the image line to the reviewed version, then run:

```bash
docker compose pull
docker compose up -d
```

Stop the services without deleting named volumes:

```bash
docker compose down
```

Do not run `docker compose down --volumes` unless you intend to delete the PostgreSQL and Arkivra named volumes.

## Production checklist

- Terminate TLS at a trusted reverse proxy.
- Set the exact browser-facing HTTPS origin in `ARKIVRA_PUBLIC_URL`.
- Keep PostgreSQL and integration endpoints off public networks.
- Back up the database, stored files, encryption keys, authentication secret, and deployment configuration.
- Configure SMTP before requiring email verification or relying on email invitations and password resets.
- Monitor workers and Docling; a healthy API alone does not prove documents are processing.
- Keep `.env` out of source control and restrict its filesystem permissions.

For local source development, continue with [From source](/self-hosting/from-source/). The root contributor Compose file remains intentionally different from this deployment.
