---
title: Users and permissions
description: Manage platform roles, platform privileges, vault roles, invitations, and approval requests.
---

Arkivra has two authorization layers. Platform roles and privileges apply to the instance. Vault roles apply to one vault. Keep the distinction explicit when granting access.

## Platform roles

- **Administrator** can use administration pages, manage users and invitations, approve sensitive requests, configure AI and office conversion, manage backups, inspect the global audit log, and directly operate across active vaults.
- **Member** has no administration access and receives only explicitly granted platform privileges plus access from vault membership.

Administrators implicitly have every platform privilege. Arkivra prevents demotion or disabling of the last active administrator.

:::caution
The implemented administrator role includes direct read and mutation access across active vaults, even without a membership row in each vault. Global Search and Trash currently filter by explicit vault roles, however, so an administrator must also be a vault member for those two aggregate pages to include its documents. Grant the platform role only to people trusted with instance-wide document and administrative access.
:::

## Platform privileges

Regular members can receive:

- **Use AI** (`system.use_ai`) — permits chat and AI-enhanced retrieval when AI is enabled and configured.
- **Create vaults without approval** (`system.create_vaults`) — permits immediate vault creation.

Without Create vaults, a member's create action submits an approval request. Without Use AI, AI search and chat context are unavailable even if the instance-wide AI switch is on.

## Vault roles

- **Owner** manages vault identity, members, invitations, activity, documents, and ownership-sensitive actions.
- **Editor** reads and changes documents and folders.
- **Viewer** reads vault documents without changing them.

Every vault must keep at least one owner. Promoting another member to owner can require administrator approval. A vault role does not grant access to platform administration.

## Invite a platform user

1. Open **Administration** → **Users**.
2. Select **Invite user**.
3. Enter the email address.
4. Choose Member or Administrator.
5. For a member, choose the two optional platform privileges.
6. Send the invitation.

The invitation appears as pending until accepted. An administrator can resend or revoke it. Working SMTP is required for delivery outside the development log fallback.

The Users table also allows administrators to grant or revoke the administrator role, change platform privileges, and disable or reactivate an account. Disabling an account prevents its authorization state from being used; it does not transfer vault ownership automatically, so review owned vaults first.

## Add a vault member

Open the vault's management page and select **Invite member**. An owner or administrator can target an existing user by email or user ID, or initiate an email invitation for someone outside the instance. Choose owner, editor, or viewer.

Some changes are direct and some create an approval request:

- `vault.create` — member requests a new vault;
- `vault.delete` — owner requests destructive vault deletion when approval is required;
- `vault.owner_promote` — owner promotion;
- `vault.external_invite` — invitation to someone outside the current instance.

Administrators review these under **Approval requests**. Approving applies the stored request payload; rejecting records the decision without applying it.

## Remove access safely

Before disabling a user or removing a vault owner:

1. Confirm another active platform administrator exists when changing an administrator.
2. Confirm every affected vault retains at least one owner.
3. Transfer operational responsibility for backups, AI configuration, and provider credentials where relevant.
4. Review pending invitations and approval requests created by that user.

Removing vault membership stops normal member access but does not delete the user's account or personal authentication settings.

## Permission matrix

| Action                                        | Viewer                  | Editor                  | Owner                   | Administrator             |
| --------------------------------------------- | ----------------------- | ----------------------- | ----------------------- | ------------------------- |
| Read vault documents                          | Yes                     | Yes                     | Yes                     | Yes, across active vaults |
| Upload, rename, move, tag, or trash documents | No                      | Yes                     | Yes                     | Yes                       |
| Manage vault members and details              | No                      | No                      | Yes                     | Yes                       |
| Create a vault immediately                    | With platform privilege | With platform privilege | With platform privilege | Yes                       |
| Use AI                                        | With platform privilege | With platform privilege | With platform privilege | Yes                       |
| Manage instance settings and backups          | No                      | No                      | No                      | Yes                       |

See [Activity and audit](/administration/activity-and-audit/) for records created by permission and administrative actions.
