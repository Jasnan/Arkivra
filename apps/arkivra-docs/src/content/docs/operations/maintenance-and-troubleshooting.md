---
title: Maintenance and troubleshooting
description: Update and monitor an Arkivra instance and diagnose common deployment, processing, search, AI, and restore problems.
---

Arkivra runs an API and several background workers against PostgreSQL and filesystem storage. Check the whole path when diagnosing a problem: a healthy web response does not prove that document processing, indexing, backup, or maintenance work is running.

## Routine maintenance

### Monitor the deployment

For a public Compose deployment directory:

```bash
docker compose ps
curl http://localhost:3210/api/health
docker compose logs --tail=200 arkivra
docker compose logs --tail=200 postgres
```

Monitor disk use for PostgreSQL and the configured Arkivra named volume or host directory, PostgreSQL health, worker errors, Docling capacity, backup completion, and embedding-index coverage when AI is enabled.

### Update a published-image deployment

Arkivra does not yet have a stable release line. Before updating the pinned beta image:

1. Review repository changes and any available tagged release notes.
2. Create and export a tested Arkivra backup.
3. Preserve deployment configuration and secrets separately.
4. Stop user traffic when the change warrants a maintenance window.
5. Change `ARKIVRA_IMAGE` or the Compose image line to the reviewed beta version.
6. Pull and start:

   ```bash
   docker compose pull
   docker compose up -d
   ```

7. Watch migration and startup logs, then test sign-in, document download, a small upload, keyword search, and background processing.

The production container runs migrations before a web-capable process starts. Do not use an unreviewed movable tag for an important deployment.

### Update a checkout-based development stack

The repository `docker-compose.yml` remains the local image-build path. After updating the checkout, rebuild it with:

```bash
docker compose up -d --build
```

Source deployments that run pnpm processes directly must run `pnpm db:migrate` before starting code that expects a newer schema.

### Review Trash and backups

The worker schedules permanent deletion of expired soft-deleted documents using the configured retention days and cron expression. Ensure that behavior matches your recovery policy.

Download backup manifests and every part to storage outside the Arkivra host. Periodically restore one in isolation; a list entry in the Backups page is not proof of recoverability.

## API health check fails

Check that:

- PostgreSQL is healthy and the API's `ARKIVRA_DATABASE_URL` uses a host reachable from its network;
- required `ARKIVRA_ENCRYPTION_KEYS` and `ARKIVRA_DOCLING_URL` values are present;
- production uses a non-placeholder `ARKIVRA_AUTH_SECRET`;
- migrations completed;
- the configured port is not already in use.

Startup validation fails deliberately when encryption keys or the Docling URL are missing.

## Dashboard, sign-in, or OAuth fails

For repository Compose defaults, the dashboard and API share `http://localhost:3210`. Source development uses `http://localhost:5173` with `/api` proxied to port 1221.

Confirm `ARKIVRA_PUBLIC_URL` exactly matches the browser-facing scheme, host, and port. For OAuth, register the corresponding `/api/auth/callback/google` or `/api/auth/callback/github` URL. Check reverse-proxy forwarding and cookie behavior before adding broad CORS or trusted-origin overrides.

If required email verification, invitations, or password resets do not arrive, inspect SMTP errors. Without SMTP, messages are printed only to API logs.

## Upload or processing fails

For a stalled transfer, check API reachability, upload-size limits, session expiry, and free space in upload staging. A browser reload may require the user to select the source file again to continue a resumable upload.

For a public Compose bind mount, confirm `ARKIVRA_DATA_DIR` is an existing absolute path. On Linux, inspect it with `ls -ldn <path>` and confirm UID/GID `10001:10001` can write to it. Permission errors in Arkivra logs usually mean the host directory, one of its parents, or a network filesystem's server-side UID mapping blocks the rootless container user. Do not solve this with world-writable permissions.

For processing:

```bash
curl http://127.0.0.1:5001/health
docker compose logs --tail=200 arkivra
```

Use the Docling address visible from the worker, not necessarily the host browser. Confirm the worker process role includes `worker`; lower `ARKIVRA_DOCUMENT_WORKER_CONCURRENCY` when Docling is overloaded. After correcting the problem, retry failed documents from their action menu rather than uploading another version.

## Preview is unavailable

- PDF and supported image previews depend on the source and render path.
- Text content requires successful extraction.
- Office and OpenDocument visual previews require a configured, healthy Gotenberg service and enabled Office Converter settings.
- Historical version previews are intentionally more limited than the current version.

Use **Content** or download the original when extraction succeeded but a visual preview is unavailable.

## Keyword search has no result

Confirm the current document version is active and processing completed. Open **Content** to verify the expected words were extracted. Normal dashboard search excludes Trash and historical versions.

Scanned or mixed PDFs may need better OCR capacity or Docling VLM configuration. Review the document processing error and Docling logs.

## AI search or chat is unavailable

In **Administration** → **AI Settings**, confirm:

- AI is enabled;
- at least one configured provider is healthy;
- the selected chat, translation, and embedding models are still discovered;
- a semantic index is active and chunk coverage is progressing;
- the regular user has the **Use AI** privilege.

Check provider connectivity from both API and worker environments. For Gemini, the configured secret reference must resolve there. For Ollama, the selected models must be pulled on the target endpoint.

Keyword search remains the diagnostic fallback when semantic retrieval is unavailable.

## Backup or restore fails

Backups and restore require a running worker and writable backup and document-storage paths. During a job, maintenance-mode responses are expected for conflicting mutations.

For an imported set, confirm the manifest and every exact part filename are present, checksums and sizes match, and the archive format is supported. Configure the archive key version and every old key version needed by stored files. Legacy sets may also need `ARKIVRA_BACKUP_ENCRYPTION_KEY`.

Fresh-instance bootstrap restore is available only before an active administrator exists and only when `ARKIVRA_RESTORE_BOOTSTRAP_TOKEN` is configured. The current dashboard has no `/restore` page; use the documented bootstrap API flow.

## Maintenance mode persists

Do not delete a maintenance marker while a backup or restore worker may still be running. First inspect worker logs and job state, confirm no restore is active, and take an out-of-band copy of the database and storage. A stale marker after a crashed restore can indicate partially staged state that needs investigation rather than a flag that is safe to remove blindly.

## Get useful diagnostic evidence

When reporting a problem, include the Arkivra version or commit, deployment method, process role, sanitized configuration names, relevant timestamps, document type and size, job or backup ID, and redacted logs. Never include auth secrets, encryption keys, provider tokens, document text, embeddings, or unredacted provider payloads.

Use a public repository issue only for non-sensitive bugs. The repository does not currently publish a dedicated vulnerability-reporting process; establish private contact with the maintainer before sharing security details or sensitive evidence.
