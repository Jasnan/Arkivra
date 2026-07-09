---
title: Roles And Administration
description: Understand platform administration, platform privileges, and vault roles.
---

Arkivra separates platform authorization from vault membership. Platform authorization controls instance-level administration and global privileges. Vault roles control access inside individual vaults.

## Platform

Arkivra stores administrator status internally as a system role:

- `admin`: an administrator who can access admin surfaces, manage users, configure server settings, review audit logs, manage backups, and use administrator capabilities.
- `member`: a regular account without administrator access.

The first registered user is promoted to admin when no active admin exists and that user reaches an authenticated API route.

Platform privileges are global user capabilities:

- `system.use_ai`: allows use of chat and AI-assisted retrieval when AI features and providers are configured.
- `system.create_vaults`: allows creating vaults without approval.

Administrators implicitly receive every platform privilege. Regular members receive only explicitly assigned privileges.

## Vault Roles

Vault membership uses these roles:

- `owner`: manages vault settings, members, invitations, and ownership-sensitive actions.
- `editor`: can work with documents in the vault, including mutating document content where the API allows it.
- `viewer`: can read vault content but cannot mutate documents or manage the vault.

Vault authorization is separate from system administration. Do not treat admin status and vault ownership as the same permission boundary.

## Chat And AI

Chat is controlled by the platform `system.use_ai` privilege and by normal document access.

Chat can use any document the user is already allowed to read. It does not grant access to vaults or documents outside the user's vault memberships. Administrator visibility is not document access.

## Invitations And Requests

Admins can invite users to the instance. Vault owners and admins can invite or add vault members depending on the flow and approval requirements.

Some sensitive vault actions use approval-oriented request types, including vault creation, vault deletion, owner promotion, and external vault invitations.
