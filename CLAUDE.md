# Bookmark Organizer — Chrome Extension

Manifest V3 extension that organizes the user's bookmarks: search, sort, move, duplicate/empty-folder cleanup, and on-device AI folder suggestions.

## Commands
- `npm test` — run Vitest unit tests (must pass before every commit)
- `npm run lint` — ESLint (blocks innerHTML/eval)
- Load unpacked: chrome://extensions → Developer mode → "Load unpacked" → this folder

## Architecture
- No service worker. Two pages: `popup/` (quick search) and `manager/` (full-tab organizer).
- All logic lives in pure ES modules in `src/` operating on plain bookmark-node objects
  (`{id, title, url?, parentId, dateAdded, children?}`). Glue code in `popup/`/`manager/`
  is the only place allowed to call `chrome.*` or touch the DOM.
- AI: built-in `LanguageModel` (Prompt API, Gemini Nano) when available; rule-based
  fallback in `src/suggestions.js` otherwise. Never a network call.

## Security rules (non-negotiable)
- Permissions stay `["bookmarks"]`. Never add host permissions or remote requests.
- Bookmark titles/URLs are UNTRUSTED. Render with `textContent`; never innerHTML/eval.
- Only assign `href` if `isSafeUrl(url)` (http/https) passes — see `src/url-utils.js`.
- AI output is UNTRUSTED: existing-folder picks must match the allowlist of real
  folder titles; new folder names must pass `sanitizeFolderName` (see `parseSuggestion`
  in `src/ai.js`) and require explicit user approval before creation.
- No analytics, no tracking, no PII collection of any kind.

## Workflow
- TDD: write the failing test first for any `src/` change.
- Feature branches off `main`; run `npm test` and `npm run lint` before commit.
- Request code review (superpowers:requesting-code-review) before merging to main.
- Avoid duplication: shared logic goes in `src/`, never copy-pasted into pages.
