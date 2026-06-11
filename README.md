# Bookmark Organizer

Chrome extension to search, sort, and reorganize your bookmarks, with private
on-device AI folder suggestions (Chrome Built-in AI / Gemini Nano).

## Install (development)
1. `npm install && npm test`
2. Open `chrome://extensions`, enable Developer mode.
3. Click "Load unpacked" and select this folder.

## Privacy
- Only permission used: `bookmarks`.
- No data ever leaves your machine. AI suggestions run on-device via Chrome's
  built-in model; if unavailable, a local rule-based fallback is used.
- No analytics, no tracking.
