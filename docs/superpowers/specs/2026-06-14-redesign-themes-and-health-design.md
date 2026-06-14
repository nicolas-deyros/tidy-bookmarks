# Bookmark Organizer — Themes + Bookmark Health redesign

**Date:** 2026-06-14
**Status:** Approved design, pending spec review
**Target version:** 0.5.0 (minor-feature + visual overhaul)

## Context

The extension works but looks templated (VS Code / DevTools grey, system fonts, ~60 lines of CSS) and its **Suggestions** tab is a firehose: it runs six checks at once over everything and lists every result with no ranking, so it feels like "suggestions of everything" and isn't useful.

Two changes:

1. **A real theming system** — three distinct visual identities the user can switch between, each with light and dark variants.
2. **Replace Suggestions with a prioritized "Health" dashboard** — ranked, grouped (instant local cleanup vs. on-device AI), scoped to a folder the user picks, drill-in + batch-apply.

Hard constraint, reaffirmed by the user during design: **everything stays on-device. No network, no host permissions.** Live-link/404 checking was explicitly requested, discussed, and rejected to preserve this. The `bookmarks / storage / favicon / sidePanel` permission set does not change.

---

## Part 1 — Theming

### Model
- **Two independent controls**, both in the manager header:
  - **Theme** (visual identity): `quiet` · `vivid` · `deck`
  - **Appearance** (brightness): `light` · `dark` · `system`
- 3 themes × 2 brightness = **6 palettes**. `system` resolves to light/dark via `prefers-color-scheme`.
- Persisted in `chrome.storage.local` as `{ theme, appearance }`. Applies to **both** popup and manager; popup inherits (no controls in popup).

### Themes (identity)
- **Quiet Utility** — calm neutral surfaces, single indigo accent (`#6366F1`), soft shadows, Inter. Premium/unobtrusive (Linear/Raycast).
- **Vivid & Friendly** — multi-accent (violet `#6B4EFF`, pink `#FF5C8A`, green `#15C39A`, amber `#FFB020`), colour-coded folders/tags, big rounded favicons. Light/approachable (Notion/Arc).
- **Local-First Deck** — dark-native, dense, monospace data accents, signal-green (`#3DDC97`). Leans into the on-device/private brand.

> Quiet-light, Vivid-light, and Deck-dark are designed (see `.superpowers/brainstorm` mockups). **Quiet-dark, Vivid-dark, and Deck-light must be designed** during implementation, each a coherent member of its family.

### Token contract
`theme.css` is rewritten as the single source of palette tokens. Selector shape:
```css
:root[data-theme="quiet"][data-appearance="light"] { --bg: …; --accent: …; … }
:root[data-theme="quiet"][data-appearance="dark"]  { … }
/* system: same palette vars emitted inside @media (prefers-color-scheme: dark) for [data-appearance="system"] */
```
Token set extends today's vars (`--bg, --bg-soft, --bg-sel, --text, --text-soft, --border, --link, --danger, --chip-bg, --chip-text`) with additions the new look needs, e.g. `--accent`, `--accent-soft`, `--surface`, `--shadow`, `--radius`, and Vivid's category accents. **Every** colour/radius/shadow in `popup.css` and `manager.css` must come from a token — no hard-coded colours in component CSS, so the same components restyle across all 6 palettes.

### New pure module: `src/theme.js`
- `THEMES` / `APPEARANCES` constants (the allowlists).
- `resolveAppearance(setting, prefersDark)` → `'light' | 'dark'`.
- `applyTheme(rootEl, {theme, appearance})` helper that validates against the allowlists and sets `data-theme` / `data-appearance` (used by both pages). Unknown values fall back to defaults.
Tested in `tests/theme.test.js`.

### Glue changes
- `manager.html`: replace the single `#theme-select` with a Theme `<select>` + an Appearance control; restyle header.
- `manager.js` / `popup` bootstrap: read `{theme, appearance}`, call `applyTheme`, persist on change. Migrate the old stored `theme` value (`light/dark/auto`) → `{theme:'quiet', appearance: light|dark|system}` once on load.
- Restyle `popup.css` and `manager.css` to the new token-driven look (modern spacing, radii, soft shadows, refined type scale).

---

## Part 2 — Bookmark Health dashboard (replaces Suggestions)

### UX
- Tab renamed **Suggestions → Health**.
- **Scope picker**: analyze a chosen folder (default) or "Everything".
- **Two ranked sections**:
  - **Cleanup · instant, on-device** — deterministic checks, counts computed immediately, ranked by impact with priority dots (high/med/low).
  - **Organize with on-device AI · runs when you ask** — AI checks do **not** run on load; each card has a Scan/Pick action and computes on demand (no upfront flood, no wasted model calls). Falls back to rules/empty when `LanguageModel` is unavailable, exactly as today.
- Each card → **drill-in** detail panel: list with checkboxes + a single batch action. Destructive actions confirm via existing `confirmModal`. After apply, that category refreshes its count.

### Checks

**Cleanup (deterministic, pure `src/`):**
| Check | Source | Status |
|---|---|---|
| Duplicates (exact URL) | `findDuplicates` (`src/suggestions.js`) | reuse |
| Near-duplicates (tracking params / trailing slash / www / http↔https) | **new** `findNearDuplicates` + `looseNormalizeUrl` | new |
| Empty folders | `findEmptyFolders` (`src/tree.js`) | reuse |
| Single-item folders | **new** `findSingleItemFolders` | new |
| Same-name folders | `findMergeableFolders` (`src/suggestions.js`) | reuse |
| Stale bookmarks (added ≥ N years ago, by `dateAdded`) | **new** `findStaleBookmarks(flat, {now, thresholdMs})` | new |

**Organize (on-device AI, `src/ai.js`):**
| Check | Source | Status |
|---|---|---|
| File loose items (top-level → suggest folder) | `suggestFolder` | reuse |
| Suggest tags (untagged → 1–3 tags) | `suggestTags` | reuse |
| Tidy a folder (split crowded folder into subfolders) | `suggestReorg` | reuse |
| Similar-topic folders (semantic merge, e.g. Dev/Coding) | **new** `suggestSimilarFolders` + `buildSimilarFoldersPrompt` + `parseSimilarFolders` | new |

### New pure helpers — detail
- `looseNormalizeUrl(url)` (in `src/url-utils.js`, beside `normalizeUrl`): lowercase host, strip leading `www.`, unify scheme, drop trailing slash, remove tracking params (`utm_*`, `gclid`, `fbclid`, `mc_*`, `ref`, …). Pure, table-tested.
- `findNearDuplicates(flat)`: group by `looseNormalizeUrl`; return groups of 2+ **where exact URLs differ** (exact dups belong to the Duplicates check).
- `findSingleItemFolders(tree)`: non-root folders with exactly one child that is a bookmark and no subfolders.
- `findStaleBookmarks(flat, {now, thresholdMs})`: bookmarks with `dateAdded < now - thresholdMs` (default 4y), newest-first. `now` injected for testability.
- AI similar-folders: prompt lists folder titles; output validated against the **allowlist of real folder titles** (untrusted-output rule) — any title not in the allowlist is dropped; groups of <2 discarded.

### New model module: `src/health.js` (pure)
`buildHealthReport({ tree, flat, folders, tagMap, now, scopeId })` → ordered array of category descriptors:
```
{ id, group: 'cleanup'|'ai', title, description, count|null, priority: 'high'|'med'|'low', kind: 'instant'|'ai' }
```
Computes deterministic counts; AI categories return `count: null` with `kind:'ai'` (computed later on drill-in). Ranking/priority lives here so it is unit-tested, not buried in the view.

### View module: `manager/health-view.js` (replaces `suggestions-view.js`)
Glue only — renders the dashboard from `buildHealthReport`, owns the scope picker and drill-in panels, performs apply via `chrome.bookmarks.*` / tag writes / `confirmModal`. AI drill-ins call the `src/ai.js` functions with `defaultSessionFactory`.

---

## Testing
- TDD: failing test first for every `src/` addition.
- New: `tests/theme.test.js`, `tests/health.test.js`, plus cases in `tests/suggestions.test.js`, `tests/url-utils.test.js`, `tests/ai.test.js` for the new functions (including untrusted-AI-output cases for `parseSimilarFolders`).
- `npm test` and `npm run lint` green before commit; lint still blocks innerHTML/eval.
- Manual: load unpacked → switch all 6 theme×appearance combos in popup + manager → run Health on a folder and "Everything", drill into each card, apply, confirm counts refresh.

## Housekeeping
- Bump `manifest.json` to `0.5.0`; update release notes (the existing version-consistency test enforces agreement).
- Add `.superpowers/` to `.gitignore`.

## Out of scope (explicit)
- Any network request, host permission, or link-liveness/404/title-refresh/redirect check — rejected to keep the local-only guarantee.
- New permissions of any kind.
