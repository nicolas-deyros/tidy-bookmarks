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
- Cleanup: duplicate detection, empty-folder removal, same-name folder merge.
- AI folder suggestions and per-folder reorganization into subfolders.
- Confirm-before-delete modal showing exactly what each deletion affects.
- Inline tag editor with autocomplete from your existing tags and on-device AI tag suggestions.
- Generated extension icon; viewport-aware layout.
- Two-pane manager with a collapsible folder rail, bookmark counts, and drag-and-drop.
- Automatic dark mode that follows your system setting.
