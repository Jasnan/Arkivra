---
title: Document Encryption
description: Configure encryption at rest for uploaded files and extracted assets.
---

# Document Encryption

When `ARKIVRA_ENCRYPTION_KEYS` is configured, Arkivra uses envelope encryption for uploaded original files and stored extracted assets.

Generate a key:

```bash
openssl rand -hex 32
```

Use it as:

```bash
ARKIVRA_ENCRYPTION_KEYS=1:<generated-64-hex-character-key>
```

## What Is Encrypted

Arkivra encrypts stored uploaded originals and extracted asset files when encryption keys are configured.

The PostgreSQL database stores application state and derived data, including users, vaults, folders, tags, document metadata, document version rows, extracted text, chunks, search vectors, chat history, version-pinned chat manifests, citation metadata, embedding indexes, audit logs, activity logs, and job state. Do not treat those database rows as encrypted by Arkivra unless your deployment provides separate database-level encryption.

## Key Rotation

Keep old key versions available and add a higher version for new files:

```bash
ARKIVRA_ENCRYPTION_KEYS=1:<old-key>,2:<new-key>
```

Removing a key version that was used for stored files prevents those files from being decrypted.

Back up `ARKIVRA_ENCRYPTION_KEYS` separately from backup archives. A backup containing encrypted files is only usable when the matching key versions are also preserved.
