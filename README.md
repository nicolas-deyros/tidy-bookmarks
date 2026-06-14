# Bookmark Organizer

Chrome extension to search, sort, and reorganize your bookmarks, with private
on-device AI folder suggestions (Chrome Built-in AI / Gemini Nano).

## Install (development)
1. `npm install && npm test`
2. Open `chrome://extensions`, enable Developer mode.
3. Click "Load unpacked" and select this folder.

## Privacy
- Permissions are local-only: `bookmarks`, `storage` (tags), `favicon` (local icon cache), `sidePanel`.
- No data ever leaves your machine. AI suggestions run on-device via Chrome's
  built-in model; if unavailable, a local rule-based fallback is used.
- No analytics, no tracking, no remote requests.

## Features
- Search bookmarks by topic, title, URL, or tag (popup, side panel, and manager).
- Per-folder sorting (A–Z, newest, by domain), move-to-folder, favicons.
- Local tags with one-click AI tag suggestions.
- **Health dashboard** — a prioritized, folder-scoped view of what needs tidying, split into instant on-device cleanup and on-demand on-device AI:
  - Cleanup: duplicates, near-duplicates, empty folders, single-item folders, same-name-folder merges, stale bookmarks, and loose top-level items.
  - AI: file loose items, suggest tags, tidy a crowded folder into subfolders, and merge similar-topic folders. Drill in, batch-select, apply — destructive actions always confirm.
- Reorganize a folder by methodology (PARA, Johnny.Decimal, topic, by-recency, flat) with a preview and one-click undo.
- Two-pane manager with a collapsible folder rail, bookmark counts, and drag-and-drop.
- Confirm-before-delete modal showing exactly what each deletion affects.
- Inline tag editor with autocomplete from your existing tags and on-device AI tag suggestions.
- Generated extension icon; viewport-aware layout.

## Themes
- Three identities — **Quiet** (calm, neutral), **Vivid** (colourful), and **Deck** (dark, keyboard-first) — each with a **Light / Dark / System** appearance toggle in the manager header. Your choice is saved and applies to the popup and side panel too.
