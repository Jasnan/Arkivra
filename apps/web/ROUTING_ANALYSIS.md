# Routing Analysis & Refactoring Plan

## Critical Bug

### Hard `<a>` tags causing full page reloads
**File:** `src/features/documents/components/document-library-list.tsx`
**Lines:** 257, 294, 309, 324

All document row links use plain `<a href={detailLink}>` instead of React Router's `<Link to={...}>`. Every click triggers a full browser navigation — destroying client-side state, re-running auth checks, and breaking the SPA experience. This is the most likely root cause of user reports about not being able to navigate between routes.

---

## Major Structural Issues

### 1. Dual URL patterns for the same resources (HIGH)

All features exist in two parallel URL trees:

| Global scope | Vault scoped |
|---|---|
| `/documents` | `/vaults/:vaultId/documents` |
| `/documents/trash` | `/vaults/:vaultId/documents/trash` |
| `/documents/:vaultId/:documentId` | `/vaults/:vaultId/documents/:documentId` |
| `/tags` | `/vaults/:vaultId/tags` |
| `/chat` | `/vaults/:vaultId/chat` |
| `/transfers` | *(missing)* |

The same components render for both, deducing context from `useParams()`. The `parentRoute` logic in `DocumentDetailPage` (line 86-88) becomes fragile — it guesses whether you came from global or vault-scoped based on path prefix:

```ts
const parentRoute = location.pathname.startsWith('/documents/')
  ? '/documents'
  : `/vaults/${vaultId}/documents`;
```

### 2. No route path constants (HIGH)

Every route path is a hardcoded string literal across 15+ files. No TypeScript safety, no single source of truth. A typo produces a silent 404.

### 3. Inconsistent `documentLink` prop (MEDIUM)

| Source | Path format |
|---|---|
| `AllDocumentsPage` | `/documents/${vaultId}/${documentId}` |
| `SearchPage` | `/vaults/${vaultId}/documents/${documentId}` |
| `document-library-list.tsx` fallback | `/vaults/${document.vaultId}/documents/${document.documentId}` |

The same document detail page can be reached via two different URLs with different back-navigation behavior.

### 4. Completely flat route tree (MEDIUM)

All protected routes are children of a single `/*` parent in `router.tsx`. No nested layouts — every vault-scoped page independently manages its vault context via `useParams()`. This misses opportunities for:
- Shared vault-level header/navigation tabs
- Route-level code splitting with `React.lazy`
- Shared vault context provider

### 5. Dead route: `/vaults/new` (LOW)

Line 39 in `router.tsx` just redirects to `/vaults`. Vault creation happens via a dialog on `/vaults`.

### 6. Route matching order readability (LOW)

`documents/:vaultId/:documentId` (line 42) appears before `documents/trash` (line 43). React Router v6+ ranks by specificity so this works, but the ordering is confusing to read.

---

## Complete Route Table

### Public-Only Routes

| Path | Component |
|---|---|
| `/login` | `LoginPage` |
| `/register` | `RegisterPage` |
| `/request-password-reset` | `RequestPasswordResetPage` |
| `/reset-password` | `ResetPasswordPage` |
| `/two-factor/verify` | `TwoFactorVerifyPage` |

### Protected Routes

| Path | Component |
|---|---|
| `/` | Redirect to `/vaults` |
| `/two-factor/setup` | `TwoFactorSetupPage` |
| `/vaults` | `VaultsPage` |
| `/chat` | `ChatPage` |
| `/vaults/new` | Redirect to `/vaults` (dead) |
| `/vaults/:vaultId/settings` | `VaultSettingsPage` |
| `/documents` | `AllDocumentsPage` |
| `/documents/:vaultId/:documentId` | `DocumentDetailPage` |
| `/documents/trash` | `DocumentTrashPage` |
| `/transfers` | `TransfersPage` |
| `/vaults/:vaultId/documents` | `DocumentsPage` |
| `/vaults/:vaultId/chat` | `ChatPage` |
| `/vaults/:vaultId/documents/trash` | `DocumentTrashPage` |
| `/vaults/:vaultId/documents/:documentId` | `DocumentDetailPage` |
| `/vaults/:vaultId/documents/:documentId/chat` | `DocumentDetailPage` |
| `/tags` | `TagsPage` |
| `/vaults/:vaultId/tags` | `TagsPage` |
| `/search` | `SearchPage` |
| `/settings` | `SettingsPage` |
| `/admin` | `AdminPage` |
| `/about` | `AboutPage` |
| `*` | Redirect to `/vaults` |

### Dynamic Segments

| Segment | Used in routes |
|---|---|
| `:vaultId` | 7 routes |
| `:documentId` | 3 routes |

---

## Refactoring Plan

### Phase 1 — Immediate fixes (low risk, high impact)

#### Task 1.1: Fix hard `<a>` tags → `<Link>` in document-library-list.tsx
- Import `Link` from `react-router-dom`
- Replace all 4 `<a href={detailLink}>` instances with `<Link to={detailLink}>`
- Keep existing inline styles but migrate to component props where possible

#### Task 1.2: Create shared route path constants
**New file:** `src/app/routes.ts`

Export a single source of truth for all route paths:
```ts
export const ROUTES = {
  login: '/login',
  register: '/register',
  vaults: '/vaults',
  vaultSettings: (vaultId: string) => `/vaults/${vaultId}/settings`,
  vaultDocuments: (vaultId: string) => `/vaults/${vaultId}/documents`,
  vaultDocument: (vaultId: string, documentId: string) =>
    `/vaults/${vaultId}/documents/${documentId}`,
  vaultDocumentChat: (vaultId: string, documentId: string) =>
    `/vaults/${vaultId}/documents/${documentId}/chat`,
  vaultTags: (vaultId: string) => `/vaults/${vaultId}/tags`,
  vaultChat: (vaultId: string) => `/vaults/${vaultId}/chat`,
  vaultTrash: (vaultId: string) => `/vaults/${vaultId}/documents/trash`,
  // ... etc
} as const;
```

- Update `router.tsx` to use constants for route paths
- Update all navigation call sites (`<Link>`, `navigate()`, `<Navigate>`, breadcrumbs) to use constants
- This gives compile-time safety against typos

#### Task 1.3: Fix route ordering readability in router.tsx
- Group related routes together (all `/documents/*` together, all `/vaults/*` together)
- Move static routes before dynamic routes within each group
- Add clear section comments

---

### Phase 2 — Structural refactor (higher effort)

#### Decision point: Eliminate dual URL trees

Choose ONE canonical URL structure and remove the other:

**Option A: Vault-scoped canonical** (recommended)
- Keep all paths under `/vaults/:vaultId/...`
- Replace global paths with a special "All Vaults" view:
  - `/documents` → `/vaults` (already the home page) + filters
  - `/documents/trash` → new aggregate route or remove
  - `/tags` → `/vaults/:vaultId/tags` only, add "All Vaults" tags search
  - `/chat` → `/vaults/:vaultId/chat` only

**Option B: Global canonical with query params**
- Remove vault-scoped paths
- Use `?vaultId=` query param for vault context
- Simpler URL structure but less RESTful

#### Task 2.1: Add nested vault layout route (if Option A chosen)
```tsx
<Route path="vaults/:vaultId" element={<VaultLayout />}>
  <Route index element={<Navigate to="documents" replace />} />
  <Route path="documents" element={<DocumentsPage />} />
  <Route path="documents/:documentId" element={<DocumentDetailPage />} />
  <Route path="tags" element={<TagsPage />} />
  <Route path="chat" element={<ChatPage />} />
  <Route path="settings" element={<VaultSettingsPage />} />
  <Route path="documents/trash" element={<DocumentTrashPage />} />
</Route>
```
- `VaultLayout` provides shared vault header, tabs, and context
- Removes `useParams` boilerplate from every vault-scoped page

#### Task 2.2: Add route-level code splitting
- Use `React.lazy` for page components in `router.tsx`
- Wrap lazy routes in `<Suspense>`

#### Task 2.3: Remove dead routes
- Remove `/vaults/new` redirect route

#### Task 2.4: Add missing vault-scoped transfers
- Add `/vaults/:vaultId/transfers` if Option A is chosen
- Or keep `/transfers?vaultId=` only if Option B

---

## Files Involved

```
apps/web/src/app/router.tsx                         — Route definitions
apps/web/src/app/routes.ts                          — [NEW] Path constants
apps/web/src/components/layout/app-shell.tsx        — Breadcrumbs, quick-search, sidebar links
apps/web/src/components/layout/app-sidebar.tsx      — Sidebar navigation
apps/web/src/features/auth/auth-guards.tsx           — ProtectedRoute, PublicOnlyRoute
apps/web/src/features/auth/auth-layout.tsx           — AuthLayout
apps/web/src/features/auth/pages/login-page.tsx
apps/web/src/features/auth/pages/register-page.tsx
apps/web/src/features/auth/pages/request-password-reset-page.tsx
apps/web/src/features/auth/pages/reset-password-page.tsx
apps/web/src/features/auth/pages/two-factor-verify-page.tsx
apps/web/src/features/auth/pages/two-factor-setup-page.tsx
apps/web/src/features/vaults/pages/vaults-page.tsx
apps/web/src/features/vaults/pages/vault-settings-page.tsx
apps/web/src/features/documents/pages/all-documents-page.tsx
apps/web/src/features/documents/pages/documents-page.tsx
apps/web/src/features/documents/pages/document-detail-page.tsx
apps/web/src/features/documents/pages/document-trash-page.tsx
apps/web/src/features/documents/components/document-library-list.tsx  — BUG: <a> vs <Link>
apps/web/src/features/chat/pages/chat-page.tsx
apps/web/src/features/tags/pages/tags-page.tsx
apps/web/src/features/search/pages/search-page.tsx
apps/web/src/features/uploads/pages/transfers-page.tsx
apps/web/src/features/admin/pages/admin-page.tsx
apps/web/src/features/settings/pages/settings-page.tsx
apps/web/src/features/about/pages/about-page.tsx
```
