---
title: Storage, Encryption, And Backups
---

# Storage, Encryption, And Backups

## Storage Model

Arkivra currently implements filesystem storage. Uploaded originals and extracted assets are stored under `ARKIVRA_STORAGE_FS_PATH` or the Compose `document-storage` volume. Source files, page previews, and extracted assets are owned by immutable document versions, not only by the logical document row.

The PostgreSQL database stores application state and derived data, including users, vaults, folders, tags, document metadata, document version rows, extracted text, chunks, search vectors, chat history, version-pinned chat manifests, citation metadata, embedding indexes, audit logs, activity logs, and job state.

## Encryption At Rest

When `ARKIVRA_ENCRYPTION_KEYS` is configured, Arkivra uses envelope encryption for uploaded original files and stored extracted assets. The key format is:

```bash
ARKIVRA_ENCRYPTION_KEYS=1:<64-hex-character-key>
```

Important caveats:

- Extracted text, chunks, metadata, chat history, embeddings, and vectors may be stored in PostgreSQL and are not described as encrypted by Arkivra.
- If `ARKIVRA_ENCRYPTION_KEYS` is empty, encryption services are disabled for new stored files.
- Losing a key version that was used for stored files means those files cannot be decrypted.
- Back up `ARKIVRA_ENCRYPTION_KEYS` separately from backup archives.

## Backups

Admins can create, list, download, and restore backups from the dashboard when the worker process is running.

Backup archives are `.tar.gz` files stored in `ARKIVRA_BACKUPS_PATH` or the Compose `backups` volume. The archive contains:

- a SQL dump of the PostgreSQL database
- a copy of filesystem document storage
- backup metadata

Document versions are included through those database and storage copies. Restored backups therefore depend on both the version rows in PostgreSQL and the corresponding version-owned source and asset files in document storage.

Backups do not include:

- `.env`
- `ARKIVRA_ENCRYPTION_KEYS`
- SMTP/OAuth/provider secrets
- reverse proxy or TLS configuration
- Docling cache volume data

## Restore Behavior

Restore jobs are handled by the worker. During restore, Arkivra writes a maintenance marker in the backup directory, restores the database SQL, replaces document storage, verifies referenced stored files, and removes the maintenance marker when finished.

Backup restore is different from document-version restore. Backup restore replaces deployment state from an archive. Document-version restore creates a new latest version inside an existing logical document and does not overwrite the backup archive or deployment state.

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
