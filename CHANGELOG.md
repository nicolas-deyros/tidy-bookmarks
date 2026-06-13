# Changelog

All notable changes to Bookmark Organizer. Format based on [Keep a Changelog](https://keepachangelog.com/); this project uses semantic-ish versioning. Everything runs on-device — no network, no tracking.

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
