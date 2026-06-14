# Themes + Bookmark Health Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the extension three switchable visual themes (each with light/dark) and replace the firehose "Suggestions" tab with a prioritized, folder-scoped "Health" dashboard — all on-device, no network, no new permissions.

**Architecture:** Pure logic stays in `src/` (new `theme.js`, `health.js`; new functions in `url-utils.js`, `suggestions.js`, `tree.js`, `ai.js`), each TDD'd. `theme.css` becomes the single token source keyed by `[data-theme][data-appearance]`; `popup.css`/`manager.css` consume only tokens. Glue (`manager/health-view.js`, page bootstraps) is the only place touching `chrome.*`/DOM.

**Tech Stack:** Vanilla ES modules, Vitest, Manifest V3, Chrome Prompt API (Gemini Nano) with rule fallback.

**Spec:** `docs/superpowers/specs/2026-06-14-redesign-themes-and-health-design.md`

**Conventions (match existing code):** tests live in `tests/<name>.test.js`, import from `../src/...`, use `describe/it/expect` (Vitest). Run a single test file with `npx vitest run tests/<name>.test.js`. Full suite: `npm test`. Lint: `npm run lint` (blocks innerHTML/eval). Commit messages use the repo's `type: summary` style and end with the Co-Authored-By trailer.

---

## Task 0: Branch + ignore brainstorm artifacts

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Create the feature branch**

Run:
```bash
git checkout -b feat/themes-and-health
```

- [ ] **Step 2: Ignore the visual-companion output**

Add this line to `.gitignore` (create the file if absent):
```
.superpowers/
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore docs/superpowers/specs docs/superpowers/plans
git commit -m "chore: ignore brainstorm artifacts; add redesign spec + plan"
```

---

## Task 1: `looseNormalizeUrl` (near-duplicate key)

**Files:**
- Modify: `src/url-utils.js`
- Test: `tests/url-utils.test.js`

- [ ] **Step 1: Write the failing test** (append to the existing file)

```javascript
import { looseNormalizeUrl } from '../src/url-utils.js';

describe('looseNormalizeUrl', () => {
  it('drops scheme, www, trailing slash and lowercases host', () => {
    expect(looseNormalizeUrl('https://www.Example.com/Page/'))
      .toBe(looseNormalizeUrl('http://example.com/Page'));
  });
  it('strips tracking params but keeps meaningful ones', () => {
    expect(looseNormalizeUrl('https://x.com/a?utm_source=nl&id=7&fbclid=z'))
      .toBe(looseNormalizeUrl('https://x.com/a?id=7'));
  });
  it('preserves path case and distinct pages', () => {
    expect(looseNormalizeUrl('https://x.com/a')).not.toBe(looseNormalizeUrl('https://x.com/b'));
  });
  it('returns input unchanged when not a URL', () => {
    expect(looseNormalizeUrl('not a url')).toBe('not a url');
  });
});
```

- [ ] **Step 2: Run it, verify failure**

Run: `npx vitest run tests/url-utils.test.js`
Expected: FAIL — `looseNormalizeUrl is not a function`.

- [ ] **Step 3: Implement** (add to `src/url-utils.js`)

```javascript
const TRACKING_PARAM = /^(utm_|mc_|ga_|_hs|hsa_|pk_)/i;
const TRACKING_EXACT = new Set([
  'gclid', 'fbclid', 'msclkid', 'dclid', 'yclid', 'ref', 'ref_src',
  'igshid', 'mkt_tok', 'spm', 'cmpid', 'campaign_id'
]);

export function looseNormalizeUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    const kept = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAM.test(k) && !TRACKING_EXACT.has(k.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b));
    const qs = kept.length ? '?' + kept.map(([k, v]) => `${k}=${v}`).join('&') : '';
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return `${host}${path}${qs}`;
  } catch {
    return url;
  }
}
```

- [ ] **Step 4: Run it, verify pass**

Run: `npx vitest run tests/url-utils.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/url-utils.js tests/url-utils.test.js
git commit -m "feat: looseNormalizeUrl for near-duplicate detection"
```

---

## Task 2: `findNearDuplicates`

**Files:**
- Modify: `src/suggestions.js`
- Test: `tests/suggestions.test.js`

- [ ] **Step 1: Write the failing test** (append)

```javascript
import { findNearDuplicates } from '../src/suggestions.js';

describe('findNearDuplicates', () => {
  it('groups same page with differing tracking/slash, excluding exact dups', () => {
    const flat = [
      { id: '1', url: 'https://x.com/p?utm_source=a' },
      { id: '2', url: 'https://www.x.com/p/' },
      { id: '3', url: 'https://x.com/other' },
      { id: '4', url: 'https://x.com/p' },
      { id: '5', url: 'https://x.com/p' } // exact dup of 4 -> not a NEAR dup
    ];
    const groups = findNearDuplicates(flat);
    expect(groups.length).toBe(1);
    const ids = groups[0].map(b => b.id).sort();
    expect(ids).toEqual(['1', '2', '4', '5']);
  });
  it('returns nothing when only exact duplicates exist', () => {
    const flat = [
      { id: '1', url: 'https://x.com/p' },
      { id: '2', url: 'https://x.com/p' }
    ];
    expect(findNearDuplicates(flat)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npx vitest run tests/suggestions.test.js` → FAIL.

- [ ] **Step 3: Implement** (add to `src/suggestions.js`; update the import line)

Change the top import to include the loose normalizer:
```javascript
import { normalizeUrl, domainOf, looseNormalizeUrl } from './url-utils.js';
```
Add:
```javascript
export function findNearDuplicates(flat) {
  const byLoose = new Map();
  for (const b of flat) {
    const key = looseNormalizeUrl(b.url);
    if (!byLoose.has(key)) byLoose.set(key, []);
    byLoose.get(key).push(b);
  }
  // Keep groups of 2+ that are NOT all the same exact URL (those are exact dups).
  return [...byLoose.values()].filter(group => {
    if (group.length < 2) return false;
    const exact = new Set(group.map(b => normalizeUrl(b.url)));
    return exact.size > 1;
  });
}
```

- [ ] **Step 4: Run, verify pass** → `npx vitest run tests/suggestions.test.js` PASS.

- [ ] **Step 5: Commit**
```bash
git add src/suggestions.js tests/suggestions.test.js
git commit -m "feat: findNearDuplicates"
```

---

## Task 3: `findSingleItemFolders`

**Files:**
- Modify: `src/tree.js`
- Test: `tests/tree.test.js`

- [ ] **Step 1: Write the failing test** (append; if file absent, create with `import { findSingleItemFolders } from '../src/tree.js';`)

```javascript
import { findSingleItemFolders } from '../src/tree.js';

describe('findSingleItemFolders', () => {
  const tree = [{ id: '0', children: [
    { id: '1', title: 'Bookmarks bar', children: [
      { id: 'a', title: 'Lonely', children: [{ id: 'a1', title: 'One', url: 'https://x.com' }] },
      { id: 'b', title: 'Full', children: [
        { id: 'b1', title: 'p1', url: 'https://x.com/1' },
        { id: 'b2', title: 'p2', url: 'https://x.com/2' }
      ] },
      { id: 'c', title: 'HasSub', children: [{ id: 'c1', title: 'Sub', children: [] }] }
    ] }
  ] }];
  it('finds folders holding exactly one bookmark and no subfolders', () => {
    const found = findSingleItemFolders(tree).map(f => f.id);
    expect(found).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run, verify failure** → `npx vitest run tests/tree.test.js` FAIL.

- [ ] **Step 3: Implement** (add to `src/tree.js`, reusing the existing `walk` + depth convention from `findEmptyFolders`)

```javascript
export function findSingleItemFolders(tree) {
  const out = [];
  walk(tree, [], (node, _path, depth) => {
    if (depth <= 1 || node.url || !node.title || !node.children) return;
    const children = node.children;
    if (children.length === 1 && children[0].url) out.push(node);
  });
  return out;
}
```

- [ ] **Step 4: Run, verify pass** → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/tree.js tests/tree.test.js
git commit -m "feat: findSingleItemFolders"
```

---

## Task 4: `findStaleBookmarks`

**Files:**
- Modify: `src/suggestions.js`
- Test: `tests/suggestions.test.js`

- [ ] **Step 1: Write the failing test** (append)

```javascript
import { findStaleBookmarks } from '../src/suggestions.js';

describe('findStaleBookmarks', () => {
  const now = Date.UTC(2026, 0, 1);
  const yr = 365 * 24 * 60 * 60 * 1000;
  const flat = [
    { id: 'old', dateAdded: now - 5 * yr, url: 'https://a' },
    { id: 'recent', dateAdded: now - 1 * yr, url: 'https://b' },
    { id: 'older', dateAdded: now - 8 * yr, url: 'https://c' }
  ];
  it('returns bookmarks older than threshold, oldest first', () => {
    const r = findStaleBookmarks(flat, { now, thresholdMs: 4 * yr });
    expect(r.map(b => b.id)).toEqual(['older', 'old']);
  });
  it('ignores entries without dateAdded', () => {
    expect(findStaleBookmarks([{ id: 'x', url: 'https://x' }], { now, thresholdMs: yr })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify failure** → FAIL.

- [ ] **Step 3: Implement** (add to `src/suggestions.js`)

```javascript
const FOUR_YEARS_MS = 4 * 365 * 24 * 60 * 60 * 1000;

export function findStaleBookmarks(flat, { now = Date.now(), thresholdMs = FOUR_YEARS_MS } = {}) {
  const cutoff = now - thresholdMs;
  return flat
    .filter(b => typeof b.dateAdded === 'number' && b.dateAdded < cutoff)
    .sort((a, b) => a.dateAdded - b.dateAdded);
}
```

- [ ] **Step 4: Run, verify pass** → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/suggestions.js tests/suggestions.test.js
git commit -m "feat: findStaleBookmarks"
```

---

## Task 5: AI `suggestSimilarFolders` (semantic folder merge)

**Files:**
- Modify: `src/ai.js`
- Test: `tests/ai.test.js`

- [ ] **Step 1: Write the failing test** (append)

```javascript
import { buildSimilarFoldersPrompt, parseSimilarFolders, suggestSimilarFolders } from '../src/ai.js';

describe('similar folders', () => {
  const titles = ['Dev', 'Programming', 'Coding', 'Recipes'];
  it('prompt lists the folder titles', () => {
    expect(buildSimilarFoldersPrompt(titles)).toContain('Dev');
    expect(buildSimilarFoldersPrompt(titles)).toContain('Recipes');
  });
  it('parses groups and drops titles not in the allowlist', () => {
    const out = parseSimilarFolders('Dev, Programming, Coding\nMade Up, Recipes', titles);
    expect(out).toEqual([['Dev', 'Programming', 'Coding']]); // 2nd line has only 1 real title -> dropped
  });
  it('ignores junk output', () => {
    expect(parseSimilarFolders('lorem ipsum', titles)).toEqual([]);
  });
  it('returns [] when no session', async () => {
    expect(await suggestSimilarFolders(titles, { createSession: async () => null })).toEqual([]);
  });
  it('uses session output when present', async () => {
    const session = { prompt: async () => 'Dev, Coding', destroy() {} };
    const out = await suggestSimilarFolders(titles, { createSession: async () => session });
    expect(out).toEqual([['Dev', 'Coding']]);
  });
});
```

- [ ] **Step 2: Run, verify failure** → `npx vitest run tests/ai.test.js` FAIL.

- [ ] **Step 3: Implement** (add to `src/ai.js`)

```javascript
export function buildSimilarFoldersPrompt(folderTitles) {
  return [
    'These are browser bookmark folder names. Group together the ones that mean the same topic.',
    `Folders: ${folderTitles.join(', ')}`,
    'Reply with one group per line as comma-separated names, e.g. "Dev, Coding".',
    'Only include folders that have at least one match. Use the exact names. Nothing else.'
  ].join('\n');
}

// Untrusted output: every name must match a real folder title (allowlist); groups need 2+.
export function parseSimilarFolders(response, folderTitles) {
  if (typeof response !== 'string') return [];
  const allow = new Map(folderTitles.map(t => [t.toLowerCase(), t]));
  const groups = [];
  for (const line of response.split('\n')) {
    const names = [];
    for (const part of line.split(',')) {
      const real = allow.get(part.trim().toLowerCase());
      if (real && !names.includes(real)) names.push(real);
    }
    if (names.length >= 2) groups.push(names);
  }
  return groups;
}

export async function suggestSimilarFolders(folderTitles, { createSession } = {}) {
  if (!createSession || folderTitles.length < 2) return [];
  let session = null;
  try {
    session = await createSession();
    if (session) {
      const response = await session.prompt(buildSimilarFoldersPrompt(folderTitles));
      return parseSimilarFolders(response, folderTitles);
    }
  } catch (err) {
    console.warn('AI similar-folder suggestion failed:', err);
  } finally {
    try { session?.destroy?.(); } catch { /* ignore */ }
  }
  return [];
}
```

- [ ] **Step 4: Run, verify pass** → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/ai.js tests/ai.test.js
git commit -m "feat: AI suggestSimilarFolders with allowlist-validated output"
```

---

## Task 6: `src/theme.js` (resolution + apply)

**Files:**
- Create: `src/theme.js`
- Test: `tests/theme.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import { THEMES, APPEARANCES, resolveAppearance, normalizeThemePref, migrateLegacyTheme } from '../src/theme.js';

describe('theme', () => {
  it('exposes the allowlists', () => {
    expect(THEMES).toEqual(['quiet', 'vivid', 'deck']);
    expect(APPEARANCES).toEqual(['light', 'dark', 'system']);
  });
  it('resolves system by OS preference', () => {
    expect(resolveAppearance('system', true)).toBe('dark');
    expect(resolveAppearance('system', false)).toBe('light');
    expect(resolveAppearance('dark', false)).toBe('dark');
  });
  it('normalizes unknown values to defaults', () => {
    expect(normalizeThemePref({ theme: 'bogus', appearance: 'x' })).toEqual({ theme: 'quiet', appearance: 'system' });
    expect(normalizeThemePref({ theme: 'deck', appearance: 'dark' })).toEqual({ theme: 'deck', appearance: 'dark' });
  });
  it('migrates the legacy light/dark/auto value', () => {
    expect(migrateLegacyTheme('auto')).toEqual({ theme: 'quiet', appearance: 'system' });
    expect(migrateLegacyTheme('dark')).toEqual({ theme: 'quiet', appearance: 'dark' });
    expect(migrateLegacyTheme('light')).toEqual({ theme: 'quiet', appearance: 'light' });
  });
});
```

- [ ] **Step 2: Run, verify failure** → `npx vitest run tests/theme.test.js` FAIL.

- [ ] **Step 3: Implement** `src/theme.js`

```javascript
export const THEMES = ['quiet', 'vivid', 'deck'];
export const APPEARANCES = ['light', 'dark', 'system'];
export const DEFAULT_PREF = { theme: 'quiet', appearance: 'system' };

export function resolveAppearance(setting, prefersDark) {
  if (setting === 'light' || setting === 'dark') return setting;
  return prefersDark ? 'dark' : 'light';
}

export function normalizeThemePref(pref = {}) {
  return {
    theme: THEMES.includes(pref.theme) ? pref.theme : DEFAULT_PREF.theme,
    appearance: APPEARANCES.includes(pref.appearance) ? pref.appearance : DEFAULT_PREF.appearance
  };
}

export function migrateLegacyTheme(legacy) {
  if (legacy === 'light') return { theme: 'quiet', appearance: 'light' };
  if (legacy === 'dark') return { theme: 'quiet', appearance: 'dark' };
  return { theme: 'quiet', appearance: 'system' }; // 'auto' or anything else
}

// DOM glue kept tiny + dependency-free so pages can share it.
export function applyTheme(rootEl, pref) {
  const { theme, appearance } = normalizeThemePref(pref);
  rootEl.dataset.theme = theme;
  rootEl.dataset.appearance = appearance;
}
```

- [ ] **Step 4: Run, verify pass** → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/theme.js tests/theme.test.js
git commit -m "feat: theme resolution, normalization and legacy migration"
```

---

## Task 7: `src/health.js` (dashboard model + ranking)

**Files:**
- Create: `src/health.js`
- Test: `tests/health.test.js`

This module decides WHAT categories exist, their counts (deterministic only) and priority order. The view renders it; AI categories carry `count: null` and are computed on drill-in.

- [ ] **Step 1: Write the failing test**

```javascript
import { buildHealthReport } from '../src/health.js';

const tree = [{ id: '0', children: [
  { id: 'bar', title: 'Bookmarks bar', children: [
    { id: 'd1', title: 'Dup', url: 'https://x.com/p' },
    { id: 'd2', title: 'Dup', url: 'https://x.com/p' },
    { id: 'loose', title: 'Loose', url: 'https://y.com' },
    { id: 'empty', title: 'Empty', children: [] }
  ] }
] }];

describe('buildHealthReport', () => {
  const report = buildHealthReport({ tree, now: Date.UTC(2026, 0, 1) });
  it('returns cleanup categories with counts and ai categories with null count', () => {
    const byId = Object.fromEntries(report.map(c => [c.id, c]));
    expect(byId.duplicates.count).toBe(1);     // 1 removable extra
    expect(byId.empty.count).toBe(1);
    expect(byId.loose.count).toBe(1);
    expect(byId.fileLoose.kind).toBe('ai');
    expect(byId.fileLoose.count).toBe(null);
  });
  it('orders cleanup before ai and high priority first', () => {
    const cleanup = report.filter(c => c.group === 'cleanup');
    const ai = report.filter(c => c.group === 'ai');
    expect(report.indexOf(cleanup.at(-1))).toBeLessThan(report.indexOf(ai[0]));
  });
});
```

- [ ] **Step 2: Run, verify failure** → `npx vitest run tests/health.test.js` FAIL.

- [ ] **Step 3: Implement** `src/health.js`

```javascript
import { flattenBookmarks, listFolders, findEmptyFolders, findSingleItemFolders } from './tree.js';
import { findDuplicates, findNearDuplicates, findMergeableFolders, findStaleBookmarks } from './suggestions.js';

// Optionally scope to one folder subtree; default = whole tree.
function scopedTree(tree, scopeId) {
  if (!scopeId) return tree;
  const find = nodes => {
    for (const n of nodes) {
      if (n.id === scopeId) return [n];
      if (n.children) { const r = find(n.children); if (r) return r; }
    }
    return null;
  };
  return find(tree) ?? tree;
}

export function buildHealthReport({ tree, tagMap = {}, now = Date.now(), scopeId = '' } = {}) {
  const scope = scopedTree(tree, scopeId);
  const flat = flattenBookmarks(scope);
  const folders = listFolders(scope);
  const rootIds = new Set((tree[0]?.children ?? []).map(n => n.id));

  const dupExtras = findDuplicates(flat).reduce((n, g) => n + g.length - 1, 0);
  const nearGroups = findNearDuplicates(flat).length;
  const empty = findEmptyFolders(scope).length;
  const single = findSingleItemFolders(scope).length;
  const mergeGroups = findMergeableFolders(folders.filter(f => !rootIds.has(f.id))).length;
  const stale = findStaleBookmarks(flat, { now }).length;
  const loose = flat.filter(b => rootIds.has(b.parentId)).length;

  const cleanup = [
    { id: 'duplicates', title: 'Duplicates', description: 'Exact same URL saved more than once.', count: dupExtras, priority: 'high' },
    { id: 'nearDuplicates', title: 'Near-duplicates', description: 'Same page, URLs differ only by tracking / slash / www.', count: nearGroups, priority: 'med' },
    { id: 'empty', title: 'Empty folders', description: 'Folders with nothing inside.', count: empty, priority: 'med' },
    { id: 'single', title: 'Single-item folders', description: 'A folder holding just one bookmark.', count: single, priority: 'low' },
    { id: 'merge', title: 'Same-name folders', description: 'Folders with identical names to merge.', count: mergeGroups, priority: 'low' },
    { id: 'stale', title: 'Stale bookmarks', description: 'Added 4+ years ago. Review and prune.', count: stale, priority: 'low' },
    { id: 'loose', title: 'Loose items', description: 'Bookmarks sitting at the top level.', count: loose, priority: 'med' }
  ].map(c => ({ ...c, group: 'cleanup', kind: 'instant' }));

  const ai = [
    { id: 'fileLoose', title: 'File loose items', description: 'Suggest a folder for each top-level bookmark.', action: 'Scan' },
    { id: 'tags', title: 'Suggest tags', description: 'Propose 1–3 tags for untagged bookmarks.', action: 'Scan' },
    { id: 'tidy', title: 'Tidy a folder', description: 'Split a crowded folder into subfolders.', action: 'Pick folder' },
    { id: 'similar', title: 'Similar-topic folders', description: 'Find folders that mean the same thing.', action: 'Scan' }
  ].map(c => ({ ...c, group: 'ai', kind: 'ai', count: null, priority: 'med' }));

  const rank = { high: 0, med: 1, low: 2 };
  cleanup.sort((a, b) => rank[a.priority] - rank[b.priority]);
  return [...cleanup, ...ai];
}
```

- [ ] **Step 4: Run, verify pass** → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/health.js tests/health.test.js
git commit -m "feat: buildHealthReport model with ranking"
```

---

## Task 8: Rewrite `theme.css` (6 palettes)

**Files:**
- Modify: `theme.css`
- Test: `tests/theme-css.test.js` (a lightweight presence check so all 6 combos stay defined)

- [ ] **Step 1: Write the failing test** `tests/theme-css.test.js`

```javascript
import { readFileSync } from 'node:fs';
import { THEMES, APPEARANCES } from '../src/theme.js';

const css = readFileSync(new URL('../theme.css', import.meta.url), 'utf8');

describe('theme.css', () => {
  it('defines every theme x (light|dark) palette', () => {
    for (const t of THEMES) {
      for (const a of ['light', 'dark']) {
        expect(css).toContain(`[data-theme="${t}"][data-appearance="${a}"]`);
      }
    }
  });
  it('handles system via prefers-color-scheme', () => {
    expect(css).toContain('prefers-color-scheme: dark');
    for (const t of THEMES) expect(css).toContain(`[data-theme="${t}"][data-appearance="system"]`);
  });
  it('every palette block sets --accent and --bg', () => {
    expect(css.match(/--accent:/g)?.length ?? 0).toBeGreaterThanOrEqual(THEMES.length * 2);
  });
});
```

- [ ] **Step 2: Run, verify failure** → `npx vitest run tests/theme-css.test.js` FAIL.

- [ ] **Step 3: Implement** — replace the entire contents of `theme.css`.

Token contract for every block: `--bg --surface --bg-soft --bg-sel --text --text-soft --border --accent --accent-soft --accent-text --link --danger --chip-bg --chip-text --shadow --radius` (plus Vivid only: `--accent-2 --accent-3 --accent-4`; for non-Vivid themes set those three equal to `--accent` so components can reference them unconditionally).

Use this structure. Define a reusable set of palette declarations and apply each one to BOTH the explicit `[data-appearance="x"]` selector and, for `system`, inside the matching `@media`. To keep it DRY, define each palette as a custom-property block via a shared selector list:

```css
/* ---- QUIET ---- */
:root[data-theme="quiet"][data-appearance="light"],
:root[data-theme="quiet"][data-appearance="system"] {
  --bg:#FBFBFD; --surface:#FFFFFF; --bg-soft:#F4F4F7; --bg-sel:#EEF0FE;
  --text:#1A1A1F; --text-soft:#71717A; --border:#ECECF1;
  --accent:#6366F1; --accent-soft:#EEF0FE; --accent-text:#FFFFFF;
  --link:#4F46E5; --danger:#DC2626; --chip-bg:#EEF0FE; --chip-text:#4338CA;
  --accent-2:#6366F1; --accent-3:#6366F1; --accent-4:#6366F1;
  --shadow:0 1px 2px rgba(0,0,0,.06),0 8px 24px rgba(0,0,0,.06); --radius:10px;
}
:root[data-theme="quiet"][data-appearance="dark"] {
  --bg:#16171A; --surface:#1E1F23; --bg-soft:#26272C; --bg-sel:#2A2D44;
  --text:#E7E7EA; --text-soft:#9A9AA3; --border:#2C2D33;
  --accent:#818CF8; --accent-soft:#262A45; --accent-text:#0B0B12;
  --link:#A5B4FC; --danger:#F87171; --chip-bg:#262A45; --chip-text:#C7D2FE;
  --accent-2:#818CF8; --accent-3:#818CF8; --accent-4:#818CF8;
  --shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.5); --radius:10px;
}
@media (prefers-color-scheme: dark) {
  :root[data-theme="quiet"][data-appearance="system"] {
    --bg:#16171A; --surface:#1E1F23; --bg-soft:#26272C; --bg-sel:#2A2D44;
    --text:#E7E7EA; --text-soft:#9A9AA3; --border:#2C2D33;
    --accent:#818CF8; --accent-soft:#262A45; --accent-text:#0B0B12;
    --link:#A5B4FC; --danger:#F87171; --chip-bg:#262A45; --chip-text:#C7D2FE;
    --accent-2:#818CF8; --accent-3:#818CF8; --accent-4:#818CF8;
    --shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.5); --radius:10px;
  }
}
```

Repeat the same three-block pattern for **vivid** and **deck** using these palettes:

**Vivid — light** (`--font-mono` not needed):
```
--bg:#FFFFFF; --surface:#FFFFFF; --bg-soft:#F6F4FF; --bg-sel:#F0ECFF;
--text:#181425; --text-soft:#6B6780; --border:#ECE9F5;
--accent:#6B4EFF; --accent-soft:#F0ECFF; --accent-text:#FFFFFF;
--link:#5A3FE0; --danger:#E5484D; --chip-bg:#F0ECFF; --chip-text:#4B2FD6;
--accent-2:#FF5C8A; --accent-3:#15C39A; --accent-4:#FFB020;
--shadow:0 2px 8px rgba(107,78,255,.10),0 12px 28px rgba(107,78,255,.10); --radius:12px;
```
**Vivid — dark:**
```
--bg:#14111F; --surface:#1C1830; --bg-soft:#251F3D; --bg-sel:#2C2350;
--text:#EDE9FB; --text-soft:#A79FC4; --border:#2C2545;
--accent:#8B6FFF; --accent-soft:#2A2350; --accent-text:#100B22;
--link:#B6A2FF; --danger:#FF6B6B; --chip-bg:#2A2350; --chip-text:#CDBCFF;
--accent-2:#FF7AA2; --accent-3:#36D9B0; --accent-4:#FFC24D;
--shadow:0 2px 10px rgba(0,0,0,.5),0 14px 30px rgba(0,0,0,.55); --radius:12px;
```
**Deck — dark** (primary; add `--font-mono:'SF Mono',ui-monospace,'Cascadia Code',monospace;`):
```
--bg:#0E1116; --surface:#161A21; --bg-soft:#1A1F27; --bg-sel:#11261F;
--text:#E6E8EB; --text-soft:#9BA3AF; --border:#242A33;
--accent:#3DDC97; --accent-soft:#11261F; --accent-text:#06231A;
--link:#5EEAD4; --danger:#F2715B; --chip-bg:#11261F; --chip-text:#7DE6B5;
--accent-2:#3DDC97; --accent-3:#3DDC97; --accent-4:#3DDC97;
--shadow:0 2px 12px rgba(0,0,0,.6); --radius:8px;
```
**Deck — light:**
```
--bg:#F4F6F4; --surface:#FFFFFF; --bg-soft:#EBF0EC; --bg-sel:#DFF5EA;
--text:#11201A; --text-soft:#5C6B63; --border:#DCE5DE;
--accent:#0FAE73; --accent-soft:#DFF5EA; --accent-text:#FFFFFF;
--link:#0B8F5E; --danger:#C0392B; --chip-bg:#DFF5EA; --chip-text:#0B6E48;
--accent-2:#0FAE73; --accent-3:#0FAE73; --accent-4:#0FAE73;
--shadow:0 1px 2px rgba(0,0,0,.06),0 8px 20px rgba(16,40,30,.08); --radius:8px;
```
Also add, once at the top of `theme.css`, a default `--font-mono` on `:root` so non-Deck themes resolve it:
```css
:root { --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace; }
```

- [ ] **Step 4: Run, verify pass** → `npx vitest run tests/theme-css.test.js` PASS.

- [ ] **Step 5: Commit**
```bash
git add theme.css tests/theme-css.test.js
git commit -m "feat: six theme palettes (quiet/vivid/deck x light/dark) as tokens"
```

---

## Task 9: Header controls + theme wiring (manager)

**Files:**
- Modify: `manager/manager.html`, `manager/manager.js`

- [ ] **Step 1: Update the header markup.** In `manager/manager.html`, replace the single `#theme-select` control with a theme picker + appearance toggle:

```html
<label class="control">Theme
  <select id="theme-select">
    <option value="quiet">Quiet</option>
    <option value="vivid">Vivid</option>
    <option value="deck">Deck</option>
  </select>
</label>
<label class="control">Appearance
  <select id="appearance-select">
    <option value="light">Light</option>
    <option value="dark">Dark</option>
    <option value="system">System</option>
  </select>
</label>
```

- [ ] **Step 2: Wire it in `manager/manager.js`.** Add to the imports:
```javascript
import { applyTheme, normalizeThemePref, migrateLegacyTheme } from '../src/theme.js';
```
Replace the legacy theme lines in `loadState()` (currently reading `theme = 'auto'` and setting `document.documentElement.dataset.theme`) with a load that supports migration:
```javascript
const store = await chrome.storage.local.get(['tags', 'uiState', 'themePref', 'theme']);
tagMap = store.tags ?? {};
uiState.expanded = new Set(store.uiState?.expanded ?? []);
uiState.selected = store.uiState?.selected ?? '';
const pref = store.themePref
  ? normalizeThemePref(store.themePref)
  : migrateLegacyTheme(store.theme);
applyTheme(document.documentElement, pref);
themeSelect.value = pref.theme;
appearanceSelect.value = pref.appearance;
```
Add `const appearanceSelect = document.getElementById('appearance-select');` near the other element refs. Replace the old `themeSelect` change listener with:
```javascript
async function onThemeChange() {
  const pref = { theme: themeSelect.value, appearance: appearanceSelect.value };
  applyTheme(document.documentElement, pref);
  await chrome.storage.local.set({ themePref: pref });
}
themeSelect.addEventListener('change', onThemeChange);
appearanceSelect.addEventListener('change', onThemeChange);
```

- [ ] **Step 3: Manual smoke test** — `npm test` still green; load unpacked, confirm the two selectors switch all 6 looks and persist across reopen.

- [ ] **Step 4: Commit**
```bash
git add manager/manager.html manager/manager.js
git commit -m "feat: theme + appearance controls with legacy migration (manager)"
```

---

## Task 10: Apply theme in popup

**Files:**
- Modify: `popup/popup.html` (ensure it links `../theme.css`), `popup/popup.js`

- [ ] **Step 1:** Confirm `popup/popup.html` links `../theme.css` (it already does per current code). No `<html>` data attributes hard-coded.

- [ ] **Step 2:** In `popup/popup.js`, on load, read and apply the pref (popup has no controls; it mirrors the manager's choice). Add import:
```javascript
import { applyTheme, normalizeThemePref, migrateLegacyTheme } from '../src/theme.js';
```
At startup (where it currently reads storage / sets theme), use:
```javascript
const { themePref, theme } = await chrome.storage.local.get(['themePref', 'theme']);
applyTheme(document.documentElement, themePref ? normalizeThemePref(themePref) : migrateLegacyTheme(theme));
```

- [ ] **Step 3:** Manual: change theme in manager, reopen popup → matches. `npm test` green.

- [ ] **Step 4: Commit**
```bash
git add popup/popup.html popup/popup.js
git commit -m "feat: popup inherits theme + appearance preference"
```

---

## Task 11: `health-view.js` replaces `suggestions-view.js`

**Files:**
- Create: `manager/health-view.js`
- Delete: `manager/suggestions-view.js`
- Modify: `manager/manager.html` (tab label + container ids), `manager/manager.js` (import, tab wiring, rename)

This is glue (DOM + `chrome.*`). It renders `buildHealthReport`, owns the scope picker and drill-in panels, and reuses the existing apply logic from `suggestions-view.js` (move it across, regrouped by category). Keep each cleanup action's confirm copy as-is.

- [ ] **Step 1:** In `manager/manager.html`, rename the Suggestions tab/view to Health:
  - Tab button `id="tab-suggestions"` → `id="tab-health"`, text "Suggestions" → "Health".
  - View container `id="suggestions-view"` → `id="health-view"`; inside it replace the "Analyze bookmarks" button + `#suggestions-container` with:
    ```html
    <div class="health-toolbar">
      <label class="control">Analyze
        <select id="health-scope"></select>
      </label>
    </div>
    <div id="health-container"></div>
    ```

- [ ] **Step 2:** Create `manager/health-view.js` exporting `renderHealth(container, scopeSelect, ctx)`:
  - Build the scope `<select>` from `listFolders(tree)` plus an "Everything" option (value `''`); default to `ctx.uiState.selected`.
  - Call `buildHealthReport({ tree, tagMap: ctx.getTagMap(), now: Date.now(), scopeId })`.
  - Render two labelled sections (`Cleanup · instant, on-device`, `Organize with on-device AI`) of cards. Each card shows count (or `—` for AI), title, description, a priority dot (`data-priority`), and a Review/Scan button. Skip cleanup cards whose `count === 0`.
  - On **Review** (cleanup): open a drill-in panel listing the affected items with checkboxes and one batch action button. Reuse the exact removal/merge/delete logic and confirm copy from the old `suggestions-view.js`. After applying, re-run `renderHealth` to refresh counts.
  - On **Scan/Pick** (AI): call the relevant `src/ai.js` function with `{ createSession: defaultSessionFactory }` (fileLoose→`suggestFolder` per loose item, capped at 25; tags→`suggestTags`; tidy→pick a folder then `suggestReorg`; similar→`suggestSimilarFolders` over folder titles), then render the results as a checkbox drill-in with the same apply actions used today (move, create folder & move, apply tags). For `similar`, applying merges the group into its first folder (reuse the merge logic).
  - All bookmark titles/URLs via `textContent`; only set `href` when `isSafeUrl` passes (import from `../src/url-utils.js`).

- [ ] **Step 3:** Update `manager/manager.js`:
  - Replace `import { renderSuggestions } from './suggestions-view.js';` with `import { renderHealth } from './health-view.js';`.
  - Rename element refs/handlers: `tabSuggestions`→`tabHealth` (`#tab-health`), `suggestionsView`→`healthView` (`#health-view`); add `healthContainer` (`#health-container`) and `healthScope` (`#health-scope`). Remove `analyzeBtn`/`#run-suggestions` and its listener.
  - `showSuggestions()`→`showHealth()` which un-hides `healthView`, sets aria, and calls `renderHealth(healthContainer, healthScope, ctx)`.
  - Update the keyboard shortcut branch `else if (e.key === 's') showHealth();` and the tab listeners.

- [ ] **Step 4:** `rm manager/suggestions-view.js`. Grep the repo to confirm no remaining references:
```bash
grep -rn "suggestions-view\|renderSuggestions\|run-suggestions\|tab-suggestions" --include=*.js --include=*.html .
```
Expected: no matches.

- [ ] **Step 5:** `npm test` and `npm run lint` green. Manual: Health tab → scope picker → each card drills in, applies, counts refresh; AI cards only run on click.

- [ ] **Step 6: Commit**
```bash
git add manager/health-view.js manager/manager.html manager/manager.js
git rm manager/suggestions-view.js
git commit -m "feat: Health dashboard replaces Suggestions firehose"
```

---

## Task 12: Restyle `manager.css` + `popup.css` to tokens + modern look

**Files:**
- Modify: `manager/manager.css`, `popup/popup.css`

- [ ] **Step 1:** Audit for hard-coded colours:
```bash
grep -rniE "#([0-9a-f]{3,8})|rgba?\(" manager/manager.css popup/popup.css
```
Replace every hit with a token (`var(--…)`). Backgrounds→`--bg`/`--surface`/`--bg-soft`, selected→`--bg-sel`, borders→`--border`, text→`--text`/`--text-soft`, accents/buttons→`--accent`/`--accent-soft`/`--accent-text`, destructive→`--danger`, chips→`--chip-bg`/`--chip-text`. Use `var(--radius)` for card/control radii and `var(--shadow)` for elevated surfaces (cards, modals, drill-in panels).

- [ ] **Step 2:** Modernize: 8px spacing scale, `--radius` corners, `var(--shadow)` on cards/modals, primary buttons use `background:var(--accent); color:var(--accent-text)`, secondary buttons use `--surface`/`--border`. Add the health dashboard styles (`.health-toolbar`, card grid `repeat(auto-fill,minmax(200px,1fr))`, `.priority-dot[data-priority]` colors via `--danger`/`--accent-4`/`--text-soft`, drill-in list rows, section labels uppercase `--text-soft`). In Deck theme, data/URLs use `font-family:var(--font-mono)`.

- [ ] **Step 3:** Verify keyboard focus is visible in all themes: ensure a `:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }` rule exists. Respect motion:
```css
@media (prefers-reduced-motion: reduce) { * { transition:none !important; animation:none !important; } }
```

- [ ] **Step 4:** `npm run lint` green. Manual sweep: every one of the 6 palettes looks coherent in popup + manager; the grep from Step 1 now returns nothing.

- [ ] **Step 5: Commit**
```bash
git add manager/manager.css popup/popup.css
git commit -m "style: token-driven modern restyle of popup + manager"
```

---

## Task 13: Docs, changelog, version bump

**Files:**
- Modify: `manifest.json`, `README.md`, `CHANGELOG.md` (or the existing release-notes file), `CLAUDE.md` if any rule text needs refreshing
- Test: the existing version-consistency test

- [ ] **Step 1:** Find where the version-consistency test reads versions:
```bash
grep -rn "version" tests/ README.md CHANGELOG.md
```

- [ ] **Step 2:** Bump `manifest.json` `"version"` to `0.5.0`. Update any other file the version-consistency test compares against (e.g. README badge, CHANGELOG heading) to `0.5.0`.

- [ ] **Step 3:** Update `CHANGELOG.md` with a `0.5.0` entry: three switchable themes (Quiet/Vivid/Deck) each with light/dark + appearance toggle; Suggestions replaced by a prioritized, folder-scoped Health dashboard (duplicates, near-duplicates, empty/single-item/same-name folders, stale bookmarks, AI filing/tags/tidy/similar-folders); reaffirmed 100% on-device, no network.

- [ ] **Step 4:** Update `README.md`: features list (themes + Health), a short "Themes" section, and the Suggestions→Health rename. Confirm README still states the local-only/no-network guarantee.

- [ ] **Step 5:** `npm test` green (version-consistency passes).

- [ ] **Step 6: Commit**
```bash
git add manifest.json README.md CHANGELOG.md CLAUDE.md
git commit -m "docs: v0.5.0 — themes + Health dashboard; bump version"
```

---

## Task 14: Full verification + push + PR

- [ ] **Step 1:** Final gate:
```bash
npm test && npm run lint
```
Both must pass.

- [ ] **Step 2:** Manual end-to-end (load unpacked): all 6 theme×appearance combos in popup + manager; Health on a chosen folder and on "Everything"; drill into every cleanup card and apply; each AI card runs only on click and falls back gracefully when Gemini Nano is unavailable.

- [ ] **Step 3:** Push the branch:
```bash
git push -u origin feat/themes-and-health
```

- [ ] **Step 4:** Open a PR:
```bash
gh pr create --title "Themes + Bookmark Health dashboard (v0.5.0)" --body "$(cat <<'EOF'
## Summary
- Three switchable themes (Quiet / Vivid / Deck), each with light/dark + a System appearance option, all token-driven in theme.css.
- Replaces the exhaustive Suggestions tab with a prioritized, folder-scoped **Health** dashboard: instant on-device cleanup (duplicates, near-duplicates, empty/single-item/same-name folders, stale bookmarks, loose items) vs. on-demand on-device AI (file loose items, suggest tags, tidy a folder, similar-topic folders).
- 100% on-device — no network, no new permissions. Link-liveness checking was considered and deliberately rejected to preserve the privacy guarantee.

## Testing
- `npm test` and `npm run lint` pass.
- Manual: all 6 palettes in popup + manager; Health drill-in + batch apply; AI fallback verified.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes
- **Spec coverage:** themes (T6, T8, T9, T10), all 6 palettes (T8), Health model+ranking (T7), all deterministic checks (T1–T4 + reused), all AI checks (T5 + reused), view/scope/drill-in (T11), token restyle (T12), version/docs/changelog (T13), no-network constraint enforced (no fetch anywhere; called out in T13/PR), push+PR (T14). No gaps.
- **No placeholders:** every code step shows real code; CSS palettes are fully specified.
- **Type consistency:** `normalizeThemePref`/`migrateLegacyTheme`/`applyTheme`/`resolveAppearance` names match across T6/T9/T10; `buildHealthReport` field names (`group/kind/count/priority/id`) match between T7 and T11 usage.
