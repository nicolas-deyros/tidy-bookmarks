# Changelog

All notable changes to Tidy Bookmarks. Format based on [Keep a Changelog](https://keepachangelog.com/); this project uses semantic-ish versioning. Everything runs on-device — no network, no tracking.

## [0.6.1] — 2026-06-16

### Changed
- **Faster AI scans:** a Health scan now creates the on-device model **once** and reuses it across items via cheap `clone()`s (fresh context per item), instead of creating and destroying a separate session per bookmark. The expensive model init happens a single time per scan.

## [0.6.0] — 2026-06-15

### Added
- **Browse is now a management surface:** a delete button on every bookmark, plus a **select-all** checkbox and per-row checkboxes that drive a bulk bar — **delete, move, tag, and remove-tag** across many bookmarks at once.
- **Folder operations** in the rail: **+ New folder**, inline **rename**, and **delete** (with a blast-radius confirm; permanent roots are protected). Moving folders still works via drag-and-drop.
- **View-transition** cross-fade when switching between Browse and Health (skipped under `prefers-reduced-motion`).

### Changed
- **Suggest tags** now lets you **pick which suggested tags to add** (toggle chips, on by default) and **type your own** — no more all-or-nothing.
- Health spans the **full width**; AI cards and drill-ins use clearer, action-first copy with a one-line subtitle.
- Typing in **search while on Health** now jumps to Browse and shows results.
- **Popup vs side panel** are styled independently (the side panel loads with `?context=sidepanel`): the popup is a fixed width, the side panel fills — fixing the layout conflict.
- **Unified CSS:** one shared style for every `<select>` (header, sort, move, reorganize), and the Reorganize modal now matches Browse/Health.

## [0.5.0] — 2026-06-14

### Added
- Three switchable themes — **Quiet**, **Vivid**, **Deck** — each with **Light / Dark / System** appearance (6 token-driven palettes in `theme.css`). New header controls; the popup and side panel inherit the choice.
- **Health** dashboard replaces the old Suggestions tab: a prioritized, folder-scoped view split into **instant on-device cleanup** and **on-demand on-device AI**. Drill into a card, batch-select, and apply; destructive actions still confirm.
- New cleanup checks: **near-duplicates** (same page differing only by tracking params / trailing slash / www / scheme), **single-item folders**, and **stale bookmarks** (by `dateAdded`, no history/network) — alongside the existing duplicate, empty-folder, and same-name-folder checks.
- New AI check: **similar-topic folders** (merges folders that mean the same thing, e.g. Dev/Coding), with output validated against the real-folder allowlist.
- More per-folder **sort options**: A–Z, Z–A, Newest first, Oldest first, By domain, By URL.
- Health **scope picker** is now an indented folder tree (roots included), each folder labelled by its own name — no more repeated entries.
- On-device AI scans now show a **loading spinner, model-download percentage, and per-item progress**, plus a clear message when the built-in model is unavailable. Same feedback added to the inline "✨ Suggest" tag button.
- **Keyboard navigation** in the popup / side panel: ↓/↑ move through results, Enter opens the highlighted (or top) hit, Esc clears the search.

### Changed
- **Renamed** to *Tidy Bookmarks — Private AI Organizer* (npm package `tidy-bookmarks`).
- New pure modules `src/theme.js` and `src/health.js`; new functions `looseNormalizeUrl`, `findNearDuplicates`, `findStaleBookmarks`, `findSingleItemFolders`, and AI `suggestSimilarFolders` — all unit-tested.
- `manager/suggestions-view.js` replaced by `manager/health-view.js`.
- Existing `light/dark/auto` theme preference is migrated automatically on first load.

### Security
- Upgraded the dev toolchain (vitest 4) to clear all `npm audit` advisories — **0 vulnerabilities**. The extension still ships **zero runtime dependencies**.
- Reaffirmed 100% on-device: no network, no host permissions, no new permissions. Live-link/404 checking was considered and deliberately rejected to preserve the privacy guarantee.

## [0.4.1] — 2026-06-13

### Fixed
- Popup/side panel now follow dark mode (shared `theme.css`).
- Popup results list flexes to fill height; action buttons stay anchored.
- Suggestions tab now switches views (`[hidden]` no longer overridden by `display: grid`).
- A folder is auto-selected on load, so the Sort control is visible immediately.

### Added
- Auto / Light / Dark theme selector (persisted; applies to manager, popup, side panel).
- Keyboard shortcuts: `/` search, `b`/`s` switch views, `Esc` close; global Ctrl/Cmd+Shift+B opens the popup.
- Help panel (`?`) listing features and shortcuts.

## [0.4.0] — 2026-06-13

### Added
- Methodology reorganization engine: reorganize one folder by **PARA**, **Johnny.Decimal**, **Topic**, **By-recency**, or **Flat**.
- AI recommends a best-fit methodology; you can override it.
- Approvable preview — each proposed group is a checkbox; apply only the ones you want.
- One-click **undo** of the most recent reorganization, via a stored snapshot.
- Pure, tested engine in `src/reorg.js` (`recommendMethodology`, `planFlat`, `planByRecency`, `parseMethodologyPlan`, `snapshotSubtree`, `planUndo`) and AI helpers in `src/ai.js` (`buildMethodologyPrompt`, `suggestMethodologyPlan`).

### Notes
- No new permissions. The `history` permission was deliberately rejected; **By-recency** uses `dateAdded` instead, preserving the local-only privacy promise.

## [0.3.0] — 2026-06-13

### Added
- Two-pane manager (file-manager layout): collapsible folder rail with bookmark counts on the left, selected folder's contents on the right.
- Full drag-and-drop: bookmark→folder, reorder within a folder, and folder→folder, with cycle prevention (`isDescendant`) so a folder can't be dropped into its own descendant.
- Browse / Suggestions view toggle.
- Automatic dark mode via `prefers-color-scheme`.
- Expand/selection state persisted in `chrome.storage.local`.

### Changed
- `manager.js` split into focused modules: `folder-rail.js`, `contents.js`, `suggestions-view.js`, `modal.js`.

## [0.2.1] — 2026-06-13

### Added
- Confirm-before-delete modal showing each deletion's blast radius (`countContents`).
- Richer suggestion text (e.g. "moves N bookmarks, deletes M folders").
- Inline tag editor with autocomplete from existing tags plus AI "✨ Suggest".
- Generated extension icon (16/48/128) via a zlib-only build script.
- Viewport-based heights for popup results and manager panels.

## [0.2.0] — 2026-06-13

### Added
- Local **tags** stored in `chrome.storage.local`; tag chips with add/remove.
- Tag-aware search across popup, side panel, and manager.
- On-device **AI tag suggestions**.
- **Favicons** from Chrome's local favicon cache (no network).
- Same-name **folder merge** suggestions.
- Per-folder **AI reorganization** suggestion.
- **Side panel** reusing the popup UI.

### Changed
- Permissions expanded to local-only set: `bookmarks`, `storage`, `favicon`, `sidePanel`.

## [0.1.0] — 2026-06-13

### Added
- Popup live search by title, URL, and folder path.
- Full-tab manager: bookmark tree, per-folder sort (A–Z / newest / by domain), move-to-folder.
- Cleanup suggestions: duplicate detection, empty-folder removal.
- On-device AI folder suggestions (Chrome Prompt API / Gemini Nano) with a rule-based fallback.
- Security foundation: `bookmarks`-only permission, `isSafeUrl` gating, no `innerHTML`/`eval`, no network.
