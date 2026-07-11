---
title: Activity and audit
description: Distinguish user-facing activity from administrative and security audit records.
---

Arkivra records two related event streams with different audiences. Activity is a user timeline around documents and vault work. Audit is the administrator and security record with structured outcomes, actors, targets, and request context.

## Vault and document activity

Readable vaults expose activity for user-relevant events such as document upload, view, download, deletion and restore, membership changes, invitations, permission requests, and selected account or AI changes.

Vault owners and administrators can open the vault's **Activity** management view in the current dashboard. Activity visibility can be scoped to the requester, vault owners, or other event-specific audiences; it is not necessarily a global feed of everything in the instance.

Use activity to answer practical questions such as:

- Who uploaded or restored this document?
- When was a member added to this vault?
- Was a vault or ownership request submitted?

## Audit log

Platform administrators can open **Administration** → **Audit Log**. The global audit log includes security, permission, administrative, vault, document, authentication, AI, backup, and system events emitted by implemented routes and workers.

The dashboard can filter by event group and type, severity, outcome, vault, actor, and date range. Open an event's advanced details to inspect identifiers and the redacted metadata that Arkivra exposes to that viewer.

Vault-scoped audit APIs are restricted to vault owners and administrators. The global admin surface is administrator-only.

## What the log is not

Audit coverage follows the events the application emits; it is not a packet capture or a guarantee that every code path has a record. Activity and audit rows live in PostgreSQL and are not encrypted by Arkivra at the application layer.

Arkivra's audit redaction path is intended to keep secrets and sensitive payload material out of serialized audit metadata. Operators should still restrict database and log access and avoid enabling provider request logging with real document content.

## Investigate an event

1. Start with the relevant vault's Activity page for a user-facing timeline.
2. Open the global Audit Log when the question involves permissions, denial, administration, or a failed operation.
3. Filter to the smallest useful date range and vault.
4. Match actor, target, outcome, and event type.
5. Correlate the timestamp with API or worker logs when diagnosing a background failure.

Document access-denied and vault access-denied events can help identify authorization failures. A denied event does not mean access was granted; check its outcome and requested target.

## Retention and backup

Arkivra currently stores activity and audit events in PostgreSQL. They are included in database backups. The public configuration does not expose a separate audit-retention policy, so database growth and retention requirements remain an operator concern.

Do not delete or edit audit rows manually as routine maintenance. If your organization has formal retention or export requirements, assess the current implementation before relying on it as the sole compliance system.

## Related pages

- [Users and permissions](/administration/users-and-permissions/)
- [Privacy and security](/operations/privacy-and-security/)
- [Backups and restore](/operations/backups-and-restore/)
