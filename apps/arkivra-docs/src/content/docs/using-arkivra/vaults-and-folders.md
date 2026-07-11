---
title: Vaults and folders
description: Use vaults as access boundaries and folders as a browsing structure.
---

Vaults separate document collections and their membership. Folders organize documents inside one vault. Decide the vault boundary first, then add only as much folder structure as people need for browsing.

## Create a vault

1. Open **Vaults**.
2. Select **Create vault**.
3. Enter a name and optional description.
4. Submit the form.

Administrators and users with the **Create vaults** platform privilege create the vault immediately and become its owner. Other members submit a `vault.create` approval request. An administrator can approve or reject it under **Administration** → **Users** → **Approval requests**.

Platform administrators can see and operate across every active vault, even when they are not listed as a vault member. For regular users, vault membership is the access boundary.

## Understand vault roles

- **Owner** can read and change documents, manage vault details, manage members and invitations, and request or perform vault deletion. Every vault must retain at least one owner.
- **Editor** can read and change documents and folders but cannot manage the vault or its membership.
- **Viewer** can read documents but cannot change document or folder state.

An administrator can perform vault management and document actions independently of membership. Platform role and vault role are still stored and managed separately; granting one does not silently rewrite the other.

See [Users and permissions](/administration/users-and-permissions/) for platform capabilities, invitations, and approval flows.

## Create and navigate folders

1. Open a vault or an existing folder.
2. Select **New folder**.
3. Enter a name and create it.

Owners and editors can create nested folders. The left-hand tree and the main browser show the same folder hierarchy. The list/grid preference is stored in the browser.

To move an item, drag it to a folder or use its action menu and choose **Move to**. Arkivra prevents a folder from being moved into itself or one of its descendants. Renaming or moving a document changes its logical location; it does not create a document version because the uploaded content is unchanged.

## Use folders and tags together

Folders answer “where does this live?” within one vault. Tags answer “what else has this label?” across documents you can access. A practical scheme might use folders for `Clients/Acme/Contracts` and tags for `signed`, `2026`, and `renewal`.

Avoid using separate vaults only to reproduce a folder hierarchy. Use another vault when membership or administrative ownership should differ.

## Manage a vault

Vault owners and administrators can open vault management to:

- change the vault name and description;
- add, invite, remove, or change members;
- review vault activity;
- delete the vault or submit the required approval request.

Owner promotion, external vault invitations, and vault deletion can require administrator approval. Removing or demoting the last owner is blocked.

:::caution
Approved vault deletion removes the vault and its document data. Treat it as an administrative destructive action, not as a substitute for moving individual documents to Trash.
:::

## Delete and restore folders

Deleting a folder soft-deletes its active descendants and documents. The API supports restoring the folder tree, but the current Trash page is document-focused and does not expose a folder-level restore control. Restore individual documents from **Trash** when using the dashboard, and avoid deleting a folder if you need to preserve the exact hierarchy through the current UI.

This is a current interface limitation; it should not be documented as a complete folder-recovery workflow.
