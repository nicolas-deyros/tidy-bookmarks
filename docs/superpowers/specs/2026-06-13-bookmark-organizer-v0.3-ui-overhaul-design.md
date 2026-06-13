# Bookmark Organizer v0.3 — Manager UI Overhaul Design

**Status:** Approved (design phase)
**Date:** 2026-06-13
**Supersedes manager UI from:** v0.2.1

## Goal

Replace the single-pane, fully-expanded manager tree with a two-pane file-manager layout: a collapsible folder rail with bookmark counts on the left, the selected folder's contents on the right. Add full drag-and-drop, a Browse/Suggestions view toggle, and automatic dark mode. Stay fully on-device (MV3, permissions unchanged: `bookmarks`, `storage`, `favicon`, `sidePanel`), no `innerHTML`/`eval`, with all risky logic in pure, unit-tested `src/` helpers.

## Scope

**In scope:** the manager page (`manager/`) only.

**Explicitly NOT changing:** the popup and side panel (`popup/`) remain the quick-search surface, untouched. `src/` pure modules keep their existing public APIs; v0.3 only *adds* `isDescendant` and `dropIndex` to `src/tree.js`.

## Architecture

The manager glue is split by responsibility (today's `manager/manager.js` is ~280 lines and this roughly doubles it). `chrome.*` and DOM access remain confined to these `manager/` files; all reusable logic stays pure in `src/`.

| File | Responsibility | Depends on |
|---|---|---|
| `manager/manager.js` | Bootstrap, Browse/Suggestions view toggle, top-bar search wiring, shared `refresh()` and module state (the tag map) | folder-rail, contents, suggestions-view |
| `manager/folder-rail.js` | Left rail: render folder tree, expand/collapse, counts, selection, folder→folder drag-and-drop | `src/tree.js`, `src/sorting.js` |
| `manager/contents.js` | Right pane: render bookmarks (favicon, tags, inline tag editor, move-to fallback), per-folder sort, bookmark drag/reorder | `src/url-utils.js`, `src/sorting.js`, `src/tags.js`, `src/ai.js` |
| `manager/suggestions-view.js` | The Analyze feature (duplicates, empty folders, merges, AI move/tag/reorg) rendered full-width behind the Suggestions tab | `src/suggestions.js`, `src/ai.js`, `src/tree.js`, modal |
| `manager/modal.js` | `confirmModal(title, body) → Promise<boolean>` (extracted verbatim from v0.2.1) | — |
| `src/tree.js` | Existing helpers **plus** `isDescendant` and `dropIndex` (pure, TDD) | — |

`manager/manager.html` and `manager/manager.css` are rewritten for the new shell. The pages still load ES modules with `type="module"`; no bundler.

## Components and behavior

### Shell (`manager.js` + `manager.html`)
- Top bar: title, search input, and a **Browse / Suggestions** segmented toggle (two buttons; the active one is visually marked, `aria-pressed`).
- Browse view = two-pane grid (folder rail | contents). Suggestions view = full-width suggestions list. Only one view is visible at a time (toggled by a class, not by removing nodes during streaming concerns — this is a static extension page, so simple show/hide is fine).
- `refresh()` re-reads `chrome.bookmarks.getTree()`, loads the tag map and the persisted UI state, and re-renders whichever view is active.

### Folder rail (`folder-rail.js`)
- Renders all folders (not bookmarks) as an indented, collapsible tree. Chrome's permanent roots are shown but never deletable (consistent with `findEmptyFolders` rules).
- Each folder row: chevron (expanded/collapsed), folder name, and a **count badge** = number of bookmarks directly inside (via the folder's own `children`, not recursive — direct count is the file-manager convention; recursive `countContents` already exists if we later want totals).
- Clicking a folder selects it (highlight) and tells the contents pane to render it. Clicking the chevron toggles expansion without changing selection.
- **Persistence:** the set of expanded folder ids and the selected folder id are stored in `chrome.storage.local` under a `uiState` key (`{ expanded: string[], selected: string }`). Restored on load; pruned against existing folder ids so deleted folders don't linger.

### Contents pane (`contents.js`)
- Renders the selected folder's bookmarks: favicon (gated by `isSafeUrl`), title as a safe link (or inert "(blocked: unsafe URL)" text), tag chips with remove, the inline tag editor (autocomplete from existing tags + AI "✨ Suggest"), and the existing move-to dropdown as a no-drag fallback.
- A small **sort** control (A–Z / newest / domain) at the top of the pane applies `sortChildren` + `chrome.bookmarks.move` to the selected folder.
- When search is active, this pane instead shows a flat result list (`searchBookmarks(flat, query, tagMap)`), each row with its folder path; the rail stays visible. Clearing search restores the selected folder.

### Drag-and-drop (across `folder-rail.js` and `contents.js`)
- **Bookmark → folder:** drag a bookmark row onto a rail folder → `chrome.bookmarks.move(id, { parentId })`.
- **Reorder within a folder:** drag a bookmark within the contents pane → compute target index with the pure `dropIndex` helper → `chrome.bookmarks.move(id, { parentId, index })`.
- **Folder → folder:** drag a rail folder onto another → `chrome.bookmarks.move`, but only if the drop is valid.
- **Cycle prevention (critical):** before any folder move, `isDescendant(tree, draggedFolderId, targetFolderId)` must be false (a folder cannot move into itself or any of its descendants). Invalid drops are rejected with no mutation and a brief visual "not allowed" cue.
- Uses native HTML5 drag-and-drop (`draggable`, `dragstart`/`dragover`/`drop`); the dragged node id travels in module state (not `dataTransfer` text, to keep bookmark data out of any serialization). Every `chrome.*` call is awaited; `refresh()` follows a successful drop.

### Suggestions view (`suggestions-view.js`)
- The v0.2.1 Analyze logic moved verbatim into its own module and rendered full-width: duplicates, empty folders, same-name merges, AI folder-move, AI tag, per-folder reorg — each as a card with blast-radius text and the `confirmModal` gate on destructive actions. No behavior change; relocation + file extraction only.

### New pure helpers (`src/tree.js`, TDD)
```
isDescendant(tree, ancestorId, nodeId) → boolean
  // true if nodeId is ancestorId itself or anywhere in its subtree.
  // Used to forbid moving a folder into its own descendant.

dropIndex(orderedIds, draggedId, beforeId) → number
  // Given the current ordered ids of a folder's children, the dragged id,
  // and the id it was dropped before (or null = drop at end), return the
  // destination index to pass to chrome.bookmarks.move.
```

## Data flow

1. `refresh()` → `chrome.bookmarks.getTree()` + `chrome.storage.local.get(['tags','uiState'])`.
2. Folder rail renders from the tree + `uiState.expanded`/`selected`.
3. Contents pane renders the selected folder (or search results).
4. User action (click / drag / sort / tag / suggestion-apply) → pure logic computes the change → `chrome.bookmarks.*` or `chrome.storage.local.set` → `refresh()`.

## Error handling
- All `chrome.*` calls awaited; failures surface as inline text (existing pattern), never silent.
- Invalid drags (cycle, drop on self) are no-ops with a visual cue.
- AI suggestions remain best-effort: unavailable model → no AI cards (graceful), never an error.
- Destructive actions remain behind `confirmModal`.

## Testing
- **Pure (Vitest):** `isDescendant` (self, direct child, deep descendant, unrelated, root), `dropIndex` (drop before first / middle / end / onto self → no-op index). Existing `src/` tests stay green.
- **Glue (manual, documented in the plan):** rail collapse/counts/selection persistence; two-pane render; all three drag types incl. rejected cycle; search flat-list; Browse/Suggestions toggle; dark mode via OS setting; XSS spot-check (javascript: bookmark stays inert, no favicon, no link).

## Security / privacy (unchanged contract)
- Permissions stay `["bookmarks","storage","favicon","sidePanel"]`. No host permissions, no network, no analytics.
- No `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`eval`. All rendering via `createElement`/`textContent`.
- `href`/favicon only for `isSafeUrl` URLs. AI output still sanitized and applied only on explicit click.
- Drag payload kept in module state, not serialized into `dataTransfer`.

## Out of scope / deferred
- Methodology-based whole-tree reorganization with preview+undo → v0.4.
- Manual dark-mode toggle, multi-select drag, keyboard DnD → future if needed.
- Link health checking → dropped (breaks no-network contract).
