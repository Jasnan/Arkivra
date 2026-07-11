---
title: Backups and restore
description: Create encrypted backup sets and restore an existing or fresh Arkivra instance.
---

Arkivra backup jobs capture PostgreSQL and filesystem document storage together. A restore replaces the current instance state; it is different from restoring one historical document version.

## What a backup contains

The worker creates an encrypted multipart backup set in the configured backups directory. A set consists of:

- one `.manifest.json` file with Arkivra version, archive format, encryption metadata, part order, sizes, and checksums;
- one or more encrypted `.partNNN` files.

The encrypted payload contains a PostgreSQL SQL dump and filesystem document storage, including uploaded version sources, extracted assets, and cached or derived previews.

It does not contain:

- `.env` or deployment configuration;
- `ARKIVRA_ENCRYPTION_KEYS` or `ARKIVRA_AUTH_SECRET`;
- SMTP, OAuth, Gemini, or other provider credentials;
- reverse-proxy and TLS configuration;
- external Docling, Gotenberg, or Ollama data and models.

## Create and download a backup

1. Sign in as a platform administrator.
2. Open **Administration** → **Backups**.
3. Select **Create backup**.
4. Keep the worker running and wait for the archive to appear.
5. Download the manifest and every listed part.
6. Store the set with a separate protected copy of required secrets and configuration.

Backup creation enables maintenance mode, waits for already-running mutation jobs, checks that database-referenced storage files exist, and then snapshots database and storage. Uploads, document changes, cleanup, indexing, backup imports, and restore work are paused or rejected during this window.

The default maximum part size is 16 GiB. Set `ARKIVRA_BACKUP_PART_SIZE_BYTES` before creating the backup when transfer media or tooling needs smaller parts. The accepted minimum is 512 MiB.

## Restore an initialized instance

1. Take an out-of-band copy of the current database and storage if possible.
2. Confirm the archive comes from a compatible Arkivra version.
3. Configure every encryption key version required by the archive and its stored files.
4. Open **Administration** → **Backups**.
5. Under **Import backup set**, select the manifest and every part.
6. Wait until the set is listed as restorable.
7. Select **Restore**, acknowledge that it replaces the current instance, and queue the job.
8. Keep the worker running and user traffic stopped until restore completes.

Restore writes a maintenance marker, decrypts and extracts the archive, restores PostgreSQL, stages document storage, verifies referenced files, swaps storage into place, and removes the marker after success.

## Restore a fresh instance

Arkivra exposes bootstrap restore API routes when no active administrator exists and `ARKIVRA_RESTORE_BOOTSTRAP_TOKEN` is set. The current dashboard does **not** provide a `/restore` page, so use an HTTP client against the bootstrap API or restore through an already initialized admin UI.

For API bootstrap restore:

1. Configure the new instance with the backup's required `ARKIVRA_ENCRYPTION_KEYS`, a stable `ARKIVRA_AUTH_SECRET`, `ARKIVRA_RESTORE_BOOTSTRAP_TOKEN`, and any provider, OAuth, or SMTP secrets the restored deployment needs.
2. Start the API and worker without registering an administrator.
3. Confirm bootstrap restore is available:

   ```bash
   curl https://documents.example.com/api/restore/bootstrap/status
   ```

4. Wrap and upload the manifest:

   ```bash
   jq '{manifest: .}' arkivra-backup.manifest.json | \
     curl -X POST \
       -H 'Content-Type: application/json' \
       -H 'X-Arkivra-Restore-Token: <restore-token>' \
       --data-binary @- \
       https://documents.example.com/api/restore/bootstrap/imports
   ```

5. Record the returned `backupId`, then upload every part with its exact manifest filename:

   ```bash
   curl -X PUT \
     -H 'X-Arkivra-Restore-Token: <restore-token>' \
     --data-binary @arkivra-backup.part001 \
     https://documents.example.com/api/restore/bootstrap/imports/<backup-id>/parts/arkivra-backup.part001
   ```

6. Queue the destructive restore:

   ```bash
   curl -X POST \
     -H 'Content-Type: application/json' \
     -H 'X-Arkivra-Restore-Token: <restore-token>' \
     --data '{"backupId":"<backup-id>"}' \
     https://documents.example.com/api/restore/bootstrap/restore
   ```

7. Monitor worker logs. After completion, sign in with an account from the restored database.

Bootstrap restore becomes unavailable as soon as an active administrator exists. The token is compared by the API and should be treated as a high-impact secret.

## Encryption keys and legacy archives

New backup archives use the active key version from `ARKIVRA_ENCRYPTION_KEYS` with backup-specific derivation. The restored stored files may depend on older versions too. Keep all needed versions configured.

Older archives made before this scheme also require the deprecated `ARKIVRA_BACKUP_ENCRYPTION_KEY`. Preserve that value only while those legacy backup sets remain in your recovery plan.

## Test recovery

A backup is not proven until it has been restored in an isolated environment. Test that users can sign in, documents download and preview, keyword search works, and background workers resume. Then reconnect optional providers with separately stored credentials.
