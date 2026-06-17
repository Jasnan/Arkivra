---
title: Roles And Administration
description: Understand system roles, vault roles, and vault AI access.
---

# Roles And Administration

Arkivra separates system administration from vault membership. System admins can manage instance-level settings and users, while vault roles control access inside individual vaults.

## System Roles

Arkivra has two system roles:

- `admin`: can access admin surfaces and manage instance-level settings.
- `member`: a regular account without global admin access.

The first registered user is promoted to admin when no active admin exists and that user reaches an authenticated API route.

Arkivra also supports the `system.create_vaults` capability for users who should be able to create vaults without being full admins.

## Vault Roles

Vault membership uses these roles:

- `owner`: manages vault settings, members, invitations, and ownership-sensitive actions.
- `editor`: can work with documents in the vault, including mutating document content where the API allows it.
- `viewer`: can read vault content but cannot mutate documents or manage the vault.

Vault authorization is separate from system administration. Do not treat admin status and vault ownership as the same permission boundary.

## Vault AI Access

Vault AI access is separate from read access. Each vault membership has an AI access level:

- `none`: the user cannot use AI-assisted retrieval for that vault.
- `full`: the user can use document chat and semantic retrieval for that vault.

A user may be able to read documents in a vault while still being blocked from AI-assisted retrieval for that vault.

## Invitations And Requests

Admins can invite users to the instance. Vault owners and admins can invite or add vault members depending on the flow and approval requirements.

Some sensitive vault actions use approval-oriented request types, including vault creation, vault deletion, owner promotion, AI access grants, and external vault invitations.
