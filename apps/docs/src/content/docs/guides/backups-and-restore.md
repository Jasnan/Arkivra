---
title: Backups And Restore
description: Create, store, and restore Arkivra backups.
---

# Backups And Restore

Admins can create, list, download, and restore backups from the dashboard when the worker process is running.

Backup archives are `.tar.gz` files stored in `ARKIVRA_BACKUPS_PATH` or the Compose `backups` volume. The archive contains:

- a SQL dump of the PostgreSQL database
- a copy of filesystem document storage
- backup metadata

Backups do not include:

- `.env`
- `ARKIVRA_ENCRYPTION_KEYS`
- SMTP, OAuth, or provider secrets
- reverse proxy or TLS configuration
- Docling cache volume data

## Restore Behavior

Restore jobs are handled by the worker. During restore, Arkivra writes a maintenance marker in the backup directory, restores the database SQL, replaces document storage, verifies referenced stored files, and removes the maintenance marker when finished.

Backup restore is different from document-version restore. Backup restore replaces deployment state from an archive. Document-version restore creates a new latest version inside an existing logical document.

Before restoring in production:

1. Confirm the backup archive is from a compatible Arkivra version.
2. Confirm `ARKIVRA_ENCRYPTION_KEYS` includes every key version needed by encrypted files in the backup.
3. Take an out-of-band copy of the current database and storage if possible.
4. Stop user traffic or put the deployment behind maintenance controls.

## Disaster Recovery Checklist

Keep separate copies of:

- database and document-storage backups
- `ARKIVRA_ENCRYPTION_KEYS`
- `ARKIVRA_AUTH_SECRET`
- SMTP, OAuth, and provider credentials
- deployment configuration and reverse proxy settings
