# Chakra UI Migration — Remaining Tasks

> Branch: `chakra-migration` | Typecheck: ✅ | Lint: ✅ | Build: ✅

## Completed

- [x] **Phase 1 — Foundation**: Chakra deps installed, theme system (`system.ts`, `semantic-tokens.ts`, `layer-styles.ts`, `text-styles.ts`), `ChakraProvider` wrapping app, `globals.css` updated.
- [x] **Phase 2 — Primitives**: All `components/ui/*` wrappers converted to Chakra-backed implementations (Button, Badge, Input, Textarea, Field, Alert, Separator, Tooltip, Label, Card, Breadcrumb, RadioGroup, Switch, Checkbox, ScrollArea, Accordion, Collapsible).
- [x] **Phase 3 — Overlays**: Dialog, DropdownMenu, Select, Tabs converted to Chakra.
- [x] **Phase 4 — Layout Primitives**: `vault-ui.tsx` fully rebuilt with Chakra semantic primitives (`PageIntro`, `SectionHeader`, `SurfacePanel`, `StatCard`, `EmptyState`, `Toolbar`, `MetadataGrid`, `DocumentList`, `ChatShell`).
- [x] **Phase 4 — App Shell**: `app-shell.tsx`, `app-sidebar.tsx`, and `sidebar.tsx` ui primitive fully converted to Chakra. Removed all `cn()` usage and Tailwind utility classes from sidebar system. Replaced all structural elements in app-shell (header, breadcrumbs, search inputs, mobile nav, upload banner, quick search dialog) with Chakra components.
- [x] **Phase 5 — Document Workflows**: `all-documents-page.tsx`, `documents-page.tsx`, `document-search-controls.tsx`, `document-library-list.tsx`, and `date-preset-selector.tsx` fully converted to Chakra. Replaced all Tailwind color/type tokens with Chakra semantic tokens (`document.*`, `status.*`, `accent.*`, `surface.*`). Converted document type badges, tag pills, grid listings, search/filter/sort controls, date presets, vault/tag filter dropdowns, pagination, and vault-grouped document lists.
- [x] **Phase 5-6 — Document Detail & Trash**: `document-detail-page.tsx` and `document-trash-page.tsx` fully converted to Chakra. Converted tag picker dropdown, action menus, tab navigation (preview/content/metadata/chat), PDF/image/text iframe previews, extracted text status badges, metadata form with inline editing, delete dialog, unsupported preview states.

---

## Remaining Tasks

### ~~1. Complete App Shell Migration (Phase 4)~~ ✅ DONE
### ~~2. Document Workflows (Phase 5)~~ ✅ DONE
### ~~3. Document Detail & Tags (Phase 5-6)~~ ✅ DONE

- [x] **3a. `document-detail-page.tsx`** — Full Chakra conversion.
- [x] **3b. `document-trash-page.tsx`** — Full Chakra conversion.

### 4. Chat Workspace (Phase 6) — HIGHEST RISK ✅ DONE

- [x] **4a. Split `chat-workspace.tsx`** — 2000 lines, ~184 Tailwind classNames. Extracted into 9 focused files:
  - `chat-utils.tsx` — Shared types, constants, helper functions, markdown parsing
  - `markdown-message.tsx` — Markdown rendering (headings, lists, code fences, blockquotes)
  - `citation-preview-modal.tsx` — Document page preview with bounding box overlays
  - `sources-accordion.tsx` — Expandable source citations list
  - `message-bubble.tsx` — Individual user/assistant message with markdown and citations
  - `chat-input-panel.tsx` — Message input, model picker, send button
  - `chat-context-header.tsx` — Vault/document context indicator bar
  - `chat-empty-state.tsx` — Initial state with guided prompts and suggestion chips
  - `chat-conversation-rail.tsx` — Sidebar with conversation list, new chat + delete buttons

- [x] **4b. Convert split components** to Chakra: replaced all Tailwind classNames with `Box`, `Flex`, `Text`, `chakra.button`, `chakra.img` primitives and semantic tokens.

- [x] **4c. Preserve critical behaviors**: streaming state, scroll-to-bottom auto-scroll, citation preview modal overlays, bounding-box coordinates, iframe resize, mobile/desktop conversation rail toggle, source interactions.

### 5. Admin, Settings, Vault Settings (Phase 7) ✅ DONE

- [x] **5a. `admin-page.tsx`** — 674 lines, ~60 Tailwind classNames. Full Chakra conversion. Added `Box`, `Flex`, `Grid`, `Stack`, `Text`, `chakra` primitives. Converted `SettingField` helper and `AiStatusBlock` to Chakra props. Replaced `className` with semantic tokens.
- [x] **5b. `settings-page.tsx`** — 312 lines, ~14 Tailwind classNames. Finished partial conversion. Converted `SecurityStatusBadge`, Links, forms, Alert, CardTitle, Buttons to Chakra props. Replaced `securityActionLinkClassName` and `outlineActionLinkClassName` with styled `Link` elements.
- [x] **5c. `vault-settings-page.tsx`** — 492 lines, ~46 Tailwind classNames. Full Chakra conversion. Converted name/description editing, member permission grids, member roster, transfer ownership, delete vault flow. Switched forms to `chakra.form`. Updated `PermissionCheckboxGrid` prop from `cardClassName` to `cardBg`.
- [x] **5d. `permission-checkbox-grid.tsx`** — 72 lines, ~1 Tailwind className. Converted grid and label to Chakra. Replaced `cn()` pattern with `display`, `rounded`, `gap`, `bg` props. Changed `cardClassName` prop to `cardBg` for Chakra token usage.

### 6. Uploads (Phase 7) ✅ DONE

- [x] **6a. `transfers-page.tsx`** — 544 lines, ~11 Tailwind classNames. Finished residual Tailwind removal. Converted SelectTrigger, DropdownMenuContent, DropdownMenuItem, Separator, Collapsible, Collapsible trigger icon, DialogContent, dialog inner layout, and destructive Button. Replaced lucide icon `className` with Chakra-compatible `size`/`color` props. Removed `cn()` import. Verified drag/drop, progress display, completed queue, clear/cancel dialogs work with Chakra.

### 7. Search Page (Phase 5-7) ✅ DONE

- [x] **7a. `search-page.tsx`** — 372 lines, ~43 Tailwind classNames. Full Chakra conversion. Replaced all raw HTML elements and Tailwind with `Stack`, `Grid`, `Flex`, `Box`, `Text`. Converted stat card icons, search input with icon overlay, filter grid (vault/tag/date), result cards with highlighted snippets, vault-chip badges, pagination controls, and details/summary collapsible.

### 8. Tags (Phase 5-7) ✅ DONE

- [x] **8a. `tags-page.tsx`** — 530 lines, ~8 Tailwind classNames. Finished cleanup. Converted DeleteTagDialog content layout, DropdownMenuContent/Ttem styling, FilterFieldLabel `srOnly`, grid header `text-right`, TagActionsMenu destructive item, icon classNames, SelectTrigger styles, and Field gap props.
- [x] **8b. `tag-dialog.tsx`** — 207 lines, ~22 Tailwind classNames. Full Chakra conversion. Replaced dialog layout, close button, form, color picker grid with swatches, custom color and reset buttons, Textarea, Badge preview, and action buttons. Used `chakra.button` and `chakra.form` for proper Chakra typing.

### 9. Auth Pages (Phase 7) ✅ DONE

- [x] **9a. `auth-layout.tsx`** — 51 lines, ~9 Tailwind classNames. Converted layout wrapper (header with logo, theme toggle, centered content). Replaced `min-h-screen`, flex layout, Card, CardHeader, CardContent with Chakra `Box`, `Flex`, `Stack`.
- [x] **9b. `login-page.tsx`** — 105 lines, ~6 Tailwind classNames. Converted sign-in form, OAuth grid, forgot password / create account links. Replaced Button `w-full`, form spacing, Link styling with Chakra props and inline styles.
- [x] **9c. `register-page.tsx`** — 96 lines, ~4 Tailwind classNames. Converted registration form with name/email/password fields and sign-in redirect link.
- [x] **9d. `two-factor-setup-page.tsx`** — 147 lines, ~11 Tailwind classNames. Converted enable form, backup codes grid with Badge, authenticator key display, verification form.
- [x] **9e. `two-factor-verify-page.tsx`** — 103 lines, ~4 Tailwind classNames. Converted mode toggle (totp/backup), verification form, action links.
- [x] **9f. `request-password-reset-page.tsx`** — 74 lines, ~3 Tailwind classNames. Converted email form and sign-in action link.
- [x] **9g. `reset-password-page.tsx`** — 84 lines, ~3 Tailwind classNames. Converted new password form and sign-in action link.

### 10. Misc Components (Phase 7) ✅ DONE

- [x] **10a. `theme-toggle.tsx`** — 20 lines, ~1 Tailwind className. Replaced `className="size-4"` on icons with lucide `size={16}` prop.
- [x] **10b. `auth-guards.tsx`** — 39 lines, ~1 Tailwind className. Converted `AuthLoadingState` div to Chakra `Flex` with semantic tokens.

### 11. Tailwind Cleanup (Phase 8) ✅ DONE

- [x] **11a. Verify all Radix imports removed** — Zero files import from `@radix-ui/*`. Removed all 12 radix packages from `package.json`.
- [x] **11b. Remove `class-variance-authority`** — No imports remain. Removed from `package.json`.
- [x] **11c. Remove `tailwind-merge`** — Simplified `cn()` in `utils.ts` to use only `clsx` (no `twMerge`). Removed `tailwind-merge` from `package.json`.
- [x] **11d. Clean up `globals.css`** — Removed `@import 'tailwindcss'`, `@custom-variant dark`, `@theme inline` block, `@layer base` (with `@apply` directives), and `@layer components`. Kept fonts, html/body/#root defaults, `button/input/select/textarea` reset, plus essential legacy classes: `.font-display`, `.vault-input`.
- [x] **11e. Remove `tailwindcss` Vite plugin** — Removed `@tailwindcss/vite` import and `tailwindcss()` from plugins in `vite.config.ts`.
- [x] **11f. Remove Tailwind and Radix packages** — Removed `tailwindcss`, `@tailwindcss/vite`, all 12 `@radix-ui/*` packages, `class-variance-authority`, `tailwind-merge`, and `cmdk` from `package.json`. CSS bundle reduced from 42.87 kB to 0.84 kB.

### 12. Verification ✅ RUN

```
pnpm --filter @arkivra/web typecheck  ✅
pnpm --filter @arkivra/web lint       ✅ (0 errors, 4 pre-existing warnings)
pnpm --filter @arkivra/web test       ✅ 47 passed, 0 failed (11 files)
pnpm --filter @arkivra/web build      ✅ (CSS: 0.84 kB, JS: 1,151 kB)
```

---

## Suggested Work Order

1. Complete App Shell (Tasks 1a–1c) — unlocks Chakra context throughout
2. Document Workflows (Tasks 2a–2e) — large surface area, lower risk
3. Document Detail & Search (Tasks 3a–3b, 7a) — medium risk
4. Tags & Dialogs (Tasks 8a–8b) — standalone, quick wins
5. Chat Workspace (Tasks 4a–4c) — highest risk, do when other patterns are proven
6. Admin, Settings, Vault Settings (Tasks 5a–5d) — polish existing partial conversions
7. Uploads (Task 6a) — polish partial conversion
8. Auth Pages (Tasks 9a–9g) — small pages, good for closing out
9. Tailwind Cleanup (Tasks 11a–11f) — final sweep
