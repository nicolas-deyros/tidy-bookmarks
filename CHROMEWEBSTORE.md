# Chrome Web Store Listing — Bookmark Organizer

**Last Updated:** 2026-06-13
**Version:** 0.2.0

## Short description
Search, sort, tag, and reorganize your bookmarks with private on-device AI suggestions.

## Permissions Justification
- **bookmarks** — Read and reorganize the user's bookmark tree (the core function: search, sort, move, deduplicate, merge folders).
- **storage** — Store user-created tags locally (`chrome.storage.local`). Tags are never sent anywhere.
- **favicon** — Display each bookmark's site icon from Chrome's local favicon cache. Makes no network requests.
- **sidePanel** — Offer the search UI as a persistent side panel for quick access.

## Privacy & Data Use
- No host permissions. No remote requests. No analytics. No tracking.
- All data — bookmarks, tags, AI processing — stays on the device.
- AI folder/tag suggestions run on-device via Chrome's built-in model (Gemini Nano); if unavailable, a local rule-based fallback is used.

## Version History
- 0.2.0 — Local tags, tag-aware search, AI tag suggestions, favicons, folder-merge, per-folder AI reorganization, side panel.
- 0.1.0 — Search, sort, move, duplicate/empty-folder cleanup, AI folder suggestions.
