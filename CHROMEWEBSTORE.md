# Chrome Web Store Listing — Tidy Bookmarks

**Last Updated:** 2026-06-15
**Version:** 0.6.0

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
- 0.6.0 — Browse becomes a manager: per-bookmark delete, bulk select → delete/move/tag/remove-tag, and folder create/rename/delete. Suggest-tags lets you pick individual tags; Health is full-width with clearer copy; popup and side panel are styled independently; view-transition polish; unified select/modal CSS.
- 0.5.0 — Three switchable themes (Quiet/Vivid/Deck) each with Light/Dark/System appearance; the Suggestions tab becomes a prioritized, folder-scoped Health dashboard (duplicates, near-duplicates, empty/single-item/same-name folders, stale & loose items, plus on-device AI filing, tagging, tidying, and similar-folder merges). No new permissions; still 100% on-device.
- 0.4.1 — Auto/Light/Dark theme toggle (sidebar now respects dark mode), popup fills height, fixed Suggestions tab, auto-selected first folder, keyboard shortcuts, and an in-app help panel.
- 0.4.0 — Methodology reorganization: reorganize a folder by PARA, Johnny.Decimal, Topic, By-recency, or Flat, with an approvable preview and one-click undo. No new permissions.
- 0.3.0 — Two-pane manager: collapsible folder rail with counts, drag-and-drop (bookmarks and folders), Browse/Suggestions toggle, automatic dark mode.
- 0.2.1 — Confirm-before-delete modal with impact detail, richer suggestion text, viewport-based heights, generated extension icon, inline tag editor with autocomplete and AI tag suggestions.
- 0.2.0 — Local tags, tag-aware search, AI tag suggestions, favicons, folder-merge, per-folder AI reorganization, side panel.
- 0.1.0 — Search, sort, move, duplicate/empty-folder cleanup, AI folder suggestions.
