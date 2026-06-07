# Troubleshooting

## API Health Check Fails

Run:

```bash
docker compose ps
docker compose logs api
docker compose logs postgres
```

Check that:

- PostgreSQL is healthy.
- `ARKIVRA_DATABASE_URL` points to the right host from the API process.
- `ARKIVRA_AUTH_SECRET` is set to a stable value.
- `ARKIVRA_ENCRYPTION_KEYS` is set if encrypted file storage is expected.

## Dashboard Cannot Reach The API

Check:

- `ARKIVRA_SERVER_BASE_URL`
- `ARKIVRA_WEB_BASE_URL`
- `ARKIVRA_CORS_ORIGINS`
- `BETTER_AUTH_URL`

For local defaults, the dashboard origin is `http://localhost:5173` and the API origin is `http://localhost:1221`.

## Uploads Do Not Process

Check:

```bash
docker compose logs worker
docker compose logs docling
curl http://localhost:5001/health
```

Common causes:

- Docling is still starting.
- The worker process is not running.
- `ARKIVRA_DOCLING_URL` points to the wrong host for the process.
- `ARKIVRA_DOCUMENT_PROCESSING_CONCURRENCY` is too high for the available Docling capacity.

## Full-Text Search Has No Results

Confirm the document processing status is complete. Full-text search depends on extracted text and chunks created during processing.

If parsed text is empty for a scanned document, inspect Docling logs and the document processing state.

## Semantic Search Is Missing Or Falls Back

Confirm:

- AI features are enabled in admin settings.
- The embedding provider points to a reachable Ollama-compatible endpoint.
- The selected embedding model is available.
- An embedding index has completed and is active.
- The user has full AI access for the relevant vault.

Without an active embedding index, Arkivra falls back to full-text search.

## Backups Are Unavailable

Backups require the worker process and backup queue. Check:

```bash
docker compose logs worker
```

Also verify that `ARKIVRA_BACKUPS_PATH` or the Compose `backups` volume is writable.

## Restore Fails

Check that:

- the backup filename starts with `arkivra-backup-` and ends with `.tar.gz`
- the archive format is compatible
- PostgreSQL is reachable
- document storage is writable
- `ARKIVRA_ENCRYPTION_KEYS` includes keys needed by encrypted files

## OAuth Redirects Fail

Confirm the provider callback URL exactly matches the configured production or local API URL:

- Google: `/api/auth/callback/google`
- GitHub: `/api/auth/callback/github`

Also check `BETTER_AUTH_URL` and provider-specific redirect URI variables.

## AI Provider Calls Fail

Check:

- the Ollama-compatible endpoint is reachable from the API and worker
- the selected chat or embedding model is installed on that endpoint
- `ARKIVRA_OLLAMA_LOG_REQUESTS` is disabled unless deliberately debugging provider traffic

Do not enable request logging with sensitive documents unless you have a deliberate redacted logging plan.
