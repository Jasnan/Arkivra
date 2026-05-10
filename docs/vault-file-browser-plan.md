# Vault File Browser Plan

## Goal

Turn vaults from flat document lists into a file-browser style document workspace:

- First-class folders inside each vault.
- Nested folder imports preserve structure.
- Manual folder creation, rename, move, trash, and restore.
- Grid and list views.
- Right-click context menus for common file and folder actions.
- Drag-and-drop move between folders after the core move model is stable.
- A permission model that supports current vault sharing and leaves room for item-level sharing later.

This is a long-lived feature branch plan. Work should land in small task branches created from
`feature/vault-file-browser`, with pull requests targeting `feature/vault-file-browser`. After each
task branch is merged, the next task branch should start from the updated feature branch.

Reference, if needed: https://github.com/FilenCloudDienste/filen-web

## Product Principles

- The vault root should feel like browsing a local drive, not a database table.
- Right-click actions are power-user shortcuts. Every important action must also be reachable from visible buttons or action menus.
- Folders are organization, not storage locations. Moving a file or folder should be metadata-only and should not rewrite encrypted blobs.
- Search and chat should continue to work across accessible documents, with folder-aware filters added deliberately.
- Since Arkivra is not public or production yet, migrations can be breaking if they materially simplify the model.

## Proposed Data Model

Add a first-class folder table.

`vault_folders`

- `id`
- `vault_id`
- `parent_id`, nullable for vault root
- `name`
- `created_by`
- `is_deleted`
- `deleted_at`
- `deleted_by`
- `created_at`
- `updated_at`

Add folder references.

- `documents.folder_id`, nullable for vault root
- `upload_sessions.folder_id`, nullable for vault root
- `upload_sessions.relative_path`, nullable, for folder imports and transfer display

Recommended constraints and rules:

- Max folder depth: 50 by default.
- Folder name max: 255 characters.
- Logical path max: 4096 characters.
- Prevent cycles on folder move.
- Prevent active sibling folder name collisions within the same parent.
- Decide whether active file names must be unique within a folder. A drive-like UX should strongly prefer uniqueness.
- Revisit current duplicate-content rule. Drive-like systems usually allow the same content in different folders.

## Permission Model

Phase 1 should keep vault-wide permissions, mapped to folder/file actions:

- `documents.read`: browse folders and files.
- `documents.create`: create folders and upload files.
- `documents.update`: rename and move folders/files, update metadata.
- `documents.delete`: move folders/files to trash and restore them.
- `documents.download`: download files and, later, folders as archives.
- `tags.manage`: manage document tags.
- `members.manage`: manage vault members.

Because the app is pre-production, this is the right time to adjust naming if useful. One option is
to rename document permissions to item permissions later, but that can be deferred unless the
backend work becomes awkward:

- `items.read`
- `items.create`
- `items.update`
- `items.delete`
- `items.download`

Do not add item-level ACLs in the first implementation. They would affect search, chat, tags,
trash, folder trees, and document chunk access. The folder model should be designed so item-level
permissions can be added later without replacing the tree.

## Branch Workflow

1. Keep `feature/vault-file-browser` as the long-lived integration branch.
2. Create each task branch from the current `feature/vault-file-browser`.
3. Open each PR against `feature/vault-file-browser`, not `main`.
4. Merge one task branch at a time.
5. Start the next task branch only after the previous one has merged into the feature branch.
6. When the full feature is stable, open one final PR from `feature/vault-file-browser` to `main`.

Suggested task branch naming:

- `feature/vault-file-browser/schema`
- `feature/vault-file-browser/folder-api`
- `feature/vault-file-browser/upload-paths`
- `feature/vault-file-browser/browser-ui`
- `feature/vault-file-browser/context-menu`
- `feature/vault-file-browser/move-workflows`

## Phases

### Phase 0: Planning Branch

Purpose: Establish the integration branch and roadmap.

Deliverables:

- Create `feature/vault-file-browser`.
- Add this plan.
- Push the branch to remote.

Definition of done:

- Branch exists locally and remotely.
- No product code changes yet.

### Phase 1: Folder Schema and Core Services

Purpose: Introduce first-class folders and folder-aware documents.

Backend tasks:

- Add `vault_folders` table.
- Add `documents.folder_id`.
- Add `upload_sessions.folder_id` and `upload_sessions.relative_path`.
- Add folder schema exports.
- Add folder service helpers:
  - create folder
  - get folder
  - list folder children
  - resolve ancestors / breadcrumbs
  - validate depth
  - detect move cycles
  - validate active sibling names
- Update document service types to include `folderId`.
- Adjust tests and factories.

Definition of done:

- Database schema supports folders.
- Existing document tests pass with root-level documents.
- Folder service unit/integration tests cover root folders, nested folders, duplicate names, depth cap, and cycle prevention.

### Phase 2: Folder and Item API

Purpose: Expose folder browsing and management through backend routes.

Backend tasks:

- Add routes for:
  - list folder items
  - create folder
  - rename folder
  - move folder
  - trash folder
  - restore folder
  - get breadcrumbs
- Add document move route.
- Update document listing route to accept `folderId`.
- Decide and implement duplicate file-name behavior in a folder.
- Keep all actions behind current vault permission middleware.

Definition of done:

- API can browse root and nested folders.
- API can move documents and folders without touching storage blobs.
- Invalid moves fail cleanly.
- Tests cover permission checks and name collisions.

### Phase 3: Uploads Preserve Folder Structure

Purpose: Folder imports should recreate the client-side directory structure.

Backend tasks:

- Accept `folderId` on upload init and direct multipart document upload.
- Accept `relativePath` for folder imports.
- Create missing folders during upload init or completion inside the target folder.
- Store completed documents in the resolved destination folder.
- Return destination info in upload session summaries.

Frontend tasks:

- Change dropped-file collection to return `{ file, relativePath }`.
- Preserve paths from drag/drop directory APIs and `webkitdirectory` folder picker.
- Update upload manager transfer items with destination folder/path metadata.
- Pass `folderId` and `relativePath` to upload init.
- Show relative path in the transfer queue when present.

Definition of done:

- Dragging a nested folder into a vault recreates nested folders.
- Uploading plain files into the current folder stores them there.
- Transfer resume/reconcile still works.
- Tests cover recursive path extraction.

### Phase 4: File Browser UI Foundation

Purpose: Replace the flat vault table with a folder-aware browser.

Frontend tasks:

- Add file-browser query hooks and API client methods.
- Add breadcrumb navigation.
- Add root/current-folder route state.
- Render folders and documents together.
- Add list view.
- Add grid view.
- Persist view preference locally.
- Add create-folder action.
- Add basic folder open/navigation.
- Keep search and filters functional, with folder scope added only if ready.

Definition of done:

- Users can browse root and nested folders.
- Users can switch list/grid views.
- Users can create folders.
- Existing document detail links still work.
- Empty, loading, and error states are polished.

### Phase 5: Context Menus and Visible Item Actions

Purpose: Add DMS-like right-click actions while preserving accessible visible controls.

Frontend tasks:

- Add item context menu for documents:
  - preview/open
  - download
  - rename
  - move to
  - tags
  - info
  - move to trash
- Add item context menu for folders:
  - open
  - rename
  - move to
  - info
  - move to trash
- Add visible action menu equivalent.
- Add keyboard and mobile fallbacks.

Backend tasks:

- Fill missing support endpoints for info and rename/move/delete workflows.

Definition of done:

- Right-click works in list and grid views.
- All actions are also available without right-click.
- Context menu only shows actions the current user can perform.

### Phase 6: Move Workflows

Purpose: Make moving files and folders ergonomic before adding drag/drop.

Frontend tasks:

- Add `Move to...` dialog with searchable folder tree.
- Support moving one item or selected items.
- Handle conflicts clearly.
- Update browser state after successful moves.

Backend tasks:

- Add bulk move endpoint if needed after single-item route proves out.

Definition of done:

- Users can move files and folders into another folder through a dialog.
- Bulk move works for selected items or is intentionally deferred.
- Cycle and depth errors are clear to the user.

### Phase 7: Drag-and-Drop Move

Purpose: Add desktop-like move behavior.

Frontend tasks:

- Support dragging files/folders onto folder tiles/list rows.
- Support dragging selected items as a group.
- Highlight valid drop targets.
- Block invalid drops visually.
- Support dropping onto breadcrumb segments.
- Keep external file upload drag/drop distinct from internal item move drag/drop.

Definition of done:

- Drag/drop move works in list and grid views.
- Invalid targets are rejected before the API call where possible.
- Upload drops are not confused with internal move drops.

### Phase 8: Trash, Restore, and Folder Deletion Polish

Purpose: Make folder trash behavior predictable.

Backend tasks:

- Decide whether folder trash recursively marks descendants deleted or only marks the folder and hides descendants by ancestry.
- Implement restore semantics and conflict handling.
- Ensure permanent delete removes descendant documents and storage blobs.

Frontend tasks:

- Show folder entries in trash if desired.
- Restore folders with conflict messaging.
- Clearly show counts and sizes when deleting folders.

Definition of done:

- Folder trash and restore behavior is consistent and tested.
- Permanent delete cleans all related file blobs and generated preview assets.

### Phase 9: Search, Chat, and Global Library Integration

Purpose: Make folders visible in higher-level workflows without disrupting RAG.

Tasks:

- Add folder path metadata to document summaries and search results.
- Add folder filter to vault search if useful.
- Show document location in global document library.
- Keep chat citations linking to document detail.
- Decide whether document chat needs breadcrumb context.

Definition of done:

- Search results can show where a document lives.
- Global document views still work.
- Chat and citations are not regressed.

### Phase 10: Optional Advanced Features

These should not block the first complete folder browser:

- Folder download as ZIP.
- Favorites.
- Public links.
- Versions.
- Folder colors.
- Cascading move submenu like Filen.
- Item-level sharing / item-level permissions.
- Recent files and quick access.

## Testing Strategy

Backend:

- Schema and migration tests.
- Folder service integration tests.
- Route permission tests.
- Upload path preservation tests.
- Trash/permanent-delete tests.

Frontend:

- Dropped folder path extraction tests.
- File-browser rendering tests.
- Context menu action tests.
- Move dialog tests.
- Upload manager tests for destination metadata.

Manual QA:

- Create nested folders.
- Upload nested folder tree.
- Rename file and folder.
- Move file and folder.
- Try invalid folder move into descendant.
- Switch grid/list.
- Use right-click and visible menus.
- Confirm search/chat still open documents correctly.

## Open Decisions

- Should duplicate content be allowed in different folders?
- Should duplicate file names be allowed in the same folder?
- Should document detail routes include folder path context or stay document-id based?
- Should folder trash recursively mark descendants or hide by deleted ancestor?
- Should permissions be renamed from `documents.*` to `items.*` during this feature?
- Should the first shipped move UI be dialog-only before drag/drop?
