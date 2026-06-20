---
title: Backups And Restore
description: Create, store, and restore Arkivra backups.
---

Admins can create, list, download, import, and restore backups from the dashboard when the worker process is running.

Backup archives are encrypted multipart backup sets stored in `ARKIVRA_BACKUPS_PATH` or the Compose `backups` volume. Each backup set contains:

- a `.manifest.json` file with backup metadata, encryption metadata, part checksums, and part ordering
- one or more encrypted `.partNNN` files

The encrypted payload contains:

- a SQL dump of the PostgreSQL database
- a copy of filesystem document storage, including uploaded originals, version source files, stored chunk assets, and cached previews

During backup creation, Arkivra enters maintenance mode before taking the database and storage snapshot. New upload, document mutation, processing, cleanup, indexing, backup import, and restore work is paused or rejected while the backup is assembled. The worker waits for already-running mutation jobs to finish, verifies that database-referenced storage files exist, and only then writes the encrypted backup set.

Backups do not include:

- `.env`
- `ARKIVRA_ENCRYPTION_KEYS`
- `ARKIVRA_BACKUP_ENCRYPTION_KEY`
- SMTP, OAuth, or provider secrets
- reverse proxy or TLS configuration
- Docling cache volume data

## Restore Behavior

Restore jobs are handled by the worker. During restore, Arkivra writes a maintenance marker in the backup directory, decrypts and extracts the backup set, restores the database SQL, stages document storage, verifies referenced stored files, swaps storage into place, and removes the maintenance marker when finished.

Backup restore is different from document-version restore. Backup restore replaces deployment state from an archive. Document-version restore creates a new latest version inside an existing logical document.

Before restoring in production:

1. Confirm the backup archive is from a compatible Arkivra version.
2. Confirm `ARKIVRA_BACKUP_ENCRYPTION_KEY` matches the key used to create the backup set.
3. Confirm `ARKIVRA_ENCRYPTION_KEYS` includes every key version needed by encrypted files in the backup.
4. Upload or place the `.manifest.json` file and every `.partNNN` file from the backup set in Arkivra.
5. Take an out-of-band copy of the current database and storage if possible.
6. Stop user traffic or put the deployment behind maintenance controls.

For a fresh-machine restore, configure the new instance with the same required secrets before importing the backup set. Runtime paths, ports, and database URLs may differ, but file-encryption keys, the backup archive key, auth secrets, and provider/OAuth/SMTP secrets must be available when the restored deployment needs them.

## Fresh Instance Restore

For a new installation that does not yet have an active admin account, use `/restore` instead of creating a temporary admin account.

1. Configure the new instance with `ARKIVRA_RESTORE_BOOTSTRAP_TOKEN`, `ARKIVRA_BACKUP_ENCRYPTION_KEY`, `ARKIVRA_ENCRYPTION_KEYS`, `ARKIVRA_AUTH_SECRET`, and any provider/OAuth/SMTP secrets needed by the restored deployment.
2. Open `/restore`.
3. Enter the restore bootstrap token.
4. Select the `.manifest.json` file and every `.partNNN` file from the backup set.
5. Confirm that restore will wipe the fresh instance and replace it with the backup.
6. Start restore, then sign in with an account from the restored backup.

The `/restore` path is disabled automatically once an active admin account exists. Existing initialized deployments should use the authenticated admin backup page instead.

## Backup Part Size

By default, Arkivra writes encrypted backup parts up to 16 GiB each. Set `ARKIVRA_BACKUP_PART_SIZE_BYTES` when an operator needs smaller files for transfer media or backup tooling. For old FAT32-formatted drives, use a value below 4 GiB.

## Disaster Recovery Checklist

Keep separate copies of:

- database and document-storage backups
- `ARKIVRA_ENCRYPTION_KEYS`
- `ARKIVRA_BACKUP_ENCRYPTION_KEY`
- `ARKIVRA_AUTH_SECRET`
- SMTP, OAuth, and provider credentials
- deployment configuration and reverse proxy settings
