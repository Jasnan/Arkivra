---
title: Document Encryption
description: Configure encryption at rest for uploaded files and extracted assets.
---

Arkivra requires `ARKIVRA_ENCRYPTION_KEYS` and uses envelope encryption for uploaded original files and stored extracted assets. New backup archives also use the active key version from `ARKIVRA_ENCRYPTION_KEYS` with backup-specific key derivation.

Generate a key:

```bash
openssl rand -hex 32
```

Use it as:

```bash
ARKIVRA_ENCRYPTION_KEYS=1:<generated-64-hex-character-key>
```

## What Is Encrypted

Arkivra encrypts stored uploaded originals and extracted asset files.

The PostgreSQL database stores application state and derived data, including users, vaults, folders, tags, document metadata, document version rows, extracted text, chunks, search vectors, chat history, version-pinned chat manifests, citation metadata, embedding indexes, audit logs, activity logs, and job state. Do not treat those database rows as encrypted by Arkivra unless your deployment provides separate database-level encryption.

## Key Rotation

Keep old key versions available and add a higher version for new files:

```bash
ARKIVRA_ENCRYPTION_KEYS=1:<old-key>,2:<new-key>
```

Removing a key version that was used for stored files prevents those files from being decrypted.

Back up `ARKIVRA_ENCRYPTION_KEYS` separately from backup archives. A backup is only usable when the key versions required by the archive and stored files are also preserved.
