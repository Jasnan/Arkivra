---
title: Encryption and key management
description: Understand Arkivra's encryption boundary, configure keys, and rotate the active key version.
---

Arkivra requires key-encryption keys and uses envelope encryption for uploaded originals and stored extracted asset files. Backup archives also use the active key version with backup-specific derivation.

## Generate the first key

Generate 32 random bytes as 64 hexadecimal characters:

```bash
openssl rand -hex 32
```

Configure it with a numeric version label:

```dotenv
ARKIVRA_ENCRYPTION_KEYS=1:<generated-64-hex-character-key>
```

Make the same value available to every Arkivra API and worker process that reads or writes document storage. Restart after changing it.

:::caution
There is no recovery path for an encrypted file when its required key version is lost. Store keys in a protected system outside the Arkivra database, document volume, and Arkivra backup set.
:::

## What Arkivra encrypts

Arkivra application encryption covers:

- uploaded original files for every retained document version;
- stored extracted asset files;
- new multipart backup archives.

Envelope metadata stored with a file identifies the key version needed to unwrap its data key. Arkivra chooses the highest configured key version for newly encrypted data.

## What Arkivra does not encrypt

PostgreSQL stores users, sessions and auth data, vaults, folders, tags, document and version metadata, extracted text, chunks, search vectors, chat messages and manifests, citations, embedding indexes and vectors, activity, audit events, and background-job state. Arkivra does not application-encrypt those rows.

Upload staging, operational logs, provider systems, database backups made outside Arkivra, and infrastructure snapshots must be protected by the operator according to how they are configured. Do not describe Arkivra as zero-knowledge or end-to-end encrypted.

## Rotate keys

1. Generate a new 32-byte key.
2. Add it with a higher version while retaining the old entry:

   ```dotenv
   ARKIVRA_ENCRYPTION_KEYS=1:<old-key>,2:<new-key>
   ```

3. Update every API and worker process atomically or during a maintenance window.
4. Restart and verify a new upload can be previewed and downloaded.
5. Create and test a new backup.

New encryption uses version 2. Existing files remain encrypted under the version recorded when they were written; adding a key does not rewrite the whole document store.

Do not remove version 1 while any retained source, extracted asset, or backup needs it. The current product does not provide a dashboard inventory proving that an old key version is unused, nor a bulk re-encryption workflow that would make removal safe automatically.

## Back up the key ring

Keep protected copies of:

- the full `ARKIVRA_ENCRYPTION_KEYS` value and version labels;
- `ARKIVRA_AUTH_SECRET`;
- the deprecated `ARKIVRA_BACKUP_ENCRYPTION_KEY` if legacy archives still require it;
- provider, OAuth, and SMTP credentials;
- deployment and reverse-proxy configuration.

Store these separately from backup manifests and parts. Test recovery with a copy of the key material rather than assuming it is complete.

## Respond to a suspected key exposure

Adding a new active version stops new files from using the exposed key, but it does not re-encrypt old files. Preserve the old key long enough to read retained data, restrict access to storage and database systems, review audit and infrastructure logs, and plan an explicit data migration if old ciphertext must be replaced.

The exact response depends on what was exposed: an encryption key, auth secret, database, storage volume, provider credential, or combination. Arkivra does not claim that rotating one value remediates every layer.
