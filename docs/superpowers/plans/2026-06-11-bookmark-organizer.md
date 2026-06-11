# Bookmark Organizer Chrome Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Manifest V3 Chrome extension that lets the user search, sort, reorganize, and clean up their bookmark tree, with on-device AI folder suggestions (Chrome Prompt API / Gemini Nano) and a rule-based fallback.

**Architecture:** No service worker. Two extension pages — a popup (quick search) and a full-tab manager page (tree view, sorting, move-to-folder, suggestions). All business logic lives in pure ES modules under `src/` that operate on plain bookmark-node objects, so they are unit-testable without Chrome. Thin glue code in `popup/` and `manager/` calls `chrome.bookmarks` and renders via safe DOM APIs only (`textContent`, `createElement` — never `innerHTML`).

**Tech Stack:** Vanilla JavaScript (ES modules), Manifest V3, Vitest for unit tests, ESLint flat config. No bundler, no framework. AI via the built-in `LanguageModel` (Prompt API) when available — all processing on-device, no network calls, no PII leaves the machine.

**Security requirements (apply to every task):**
- Permissions: `["bookmarks"]` only. No host permissions, no `tabs`.
- Never use `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, or `new Function`.
- Bookmark titles/URLs are untrusted input: render with `textContent`; only assign `href` when the URL scheme is `http:` or `https:`.
- AI model output is untrusted: existing-folder picks are validated against an allowlist of real folder titles; proposed new folder names are sanitized (control characters stripped, length-capped) and only created after explicit user approval.
- No analytics, no remote requests, no remote code.

**Git workflow:** Task 1 initializes the repo on `main`, then creates branch `feat/initial-build`. Tasks 2–9 commit to that branch. Task 10 merges to `main`. Future work uses feature branches per the CLAUDE.md workflow.

**File structure:**

| Path | Responsibility |
|---|---|
| `manifest.json` | MV3 manifest, `bookmarks` permission only |
| `popup/popup.html` / `popup.js` / `popup.css` | Quick search UI + "Open Manager" button |
| `manager/manager.html` / `manager.js` / `manager.css` | Full-tab manager: tree render, sort controls, move, suggestions |
| `src/url-utils.js` | URL safety check + normalization + domain extraction |
| `src/sorting.js` | Pure comparators + folder-aware sort |
| `src/search.js` | Pure search/filter over flattened nodes |
| `src/tree.js` | Flatten tree, list folders, find empty folders |
| `src/suggestions.js` | Duplicate detection + rule-based folder suggestion |
| `src/ai.js` | Prompt building, AI output validation, `suggestFolder` glue with fallback |
| `tests/*.test.js` | Vitest unit tests for each `src/` module |
| `CLAUDE.md`, `README.md`, `.gitignore`, `package.json`, `eslint.config.js` | Dev environment |

---

### Task 1: Dev environment — git, package.json, Vitest, ESLint, CLAUDE.md

**Files:**
- Create: `.gitignore`, `package.json`, `eslint.config.js`, `CLAUDE.md`, `README.md`

- [ ] **Step 1: Initialize git repo**

Run in `C:\Users\ndeyros\dev\bookmark-organizer`:
```bash
git init -b main
```
Expected: `Initialized empty Git repository`

- [ ] **Step 2: Create `.gitignore`**

```gitignore
node_modules/
dist/
*.zip
.env
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "bookmark-organizer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src popup manager tests"
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "eslint": "^9.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: exits 0, `node_modules/` created.

- [ ] **Step 5: Create `eslint.config.js`**

```js
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { chrome: 'readonly', LanguageModel: 'readonly', document: 'readonly', window: 'readonly', URL: 'readonly', console: 'readonly' }
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Use textContent/createElement — bookmark data is untrusted.' },
        { property: 'outerHTML', message: 'Use textContent/createElement — bookmark data is untrusted.' },
        { property: 'insertAdjacentHTML', message: 'Use textContent/createElement — bookmark data is untrusted.' }
      ]
    }
  }
];
```

- [ ] **Step 6: Create `CLAUDE.md`**

```markdown
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
```

- [ ] **Step 7: Create `README.md`**

```markdown
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
```

- [ ] **Step 8: Commit and create feature branch**

```bash
git add .gitignore package.json package-lock.json eslint.config.js CLAUDE.md README.md docs
git commit -m "chore: dev environment — vitest, eslint, CLAUDE.md, plan"
git switch -c feat/initial-build
```

---

### Task 2: Manifest and page skeletons

**Files:**
- Create: `manifest.json`, `popup/popup.html`, `popup/popup.css`, `popup/popup.js`, `manager/manager.html`, `manager/manager.css`, `manager/manager.js`

- [ ] **Step 1: Create `manifest.json`** (no icons — Chrome supplies a default; never reference image files that don't exist)

```json
{
  "manifest_version": 3,
  "name": "Bookmark Organizer",
  "version": "0.1.0",
  "description": "Search, sort, and reorganize your bookmarks with private on-device AI suggestions.",
  "permissions": ["bookmarks"],
  "action": {
    "default_popup": "popup/popup.html"
  }
}
```

- [ ] **Step 2: Create `popup/popup.html`** (no inline scripts/handlers — MV3 CSP forbids them)

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <input id="search" type="search" placeholder="Search bookmarks…" autofocus>
  <ul id="results"></ul>
  <button id="open-manager">Open Manager</button>
  <script type="module" src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create `popup/popup.css`**

```css
body { width: 320px; margin: 0; padding: 8px; font: 13px system-ui, sans-serif; }
#search { width: 100%; box-sizing: border-box; padding: 6px; margin-bottom: 6px; }
#results { list-style: none; margin: 0 0 6px; padding: 0; max-height: 320px; overflow-y: auto; }
#results li { padding: 4px 2px; border-bottom: 1px solid #eee; }
#results a { color: #1a56b0; text-decoration: none; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#results .path { color: #888; font-size: 11px; }
#open-manager { width: 100%; padding: 6px; cursor: pointer; }
```

- [ ] **Step 4: Create placeholder `popup/popup.js`** (search wired in Task 6)

```js
document.getElementById('open-manager').addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('manager/manager.html') });
  window.close();
});
```

Note: `chrome.tabs.create` with a URL does NOT require the `tabs` permission (only reading `tab.url`/`tab.title` does).

- [ ] **Step 5: Create `manager/manager.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Bookmark Organizer</title>
  <link rel="stylesheet" href="manager.css">
</head>
<body>
  <header>
    <h1>Bookmark Organizer</h1>
    <input id="search" type="search" placeholder="Search by topic, title, or URL…">
  </header>
  <main>
    <section id="suggestions-panel">
      <h2>Suggestions</h2>
      <button id="run-suggestions">Analyze bookmarks</button>
      <div id="suggestions-output"></div>
    </section>
    <section id="tree-panel">
      <h2>Bookmarks</h2>
      <div id="tree"></div>
    </section>
  </main>
  <script type="module" src="manager.js"></script>
</body>
</html>
```

- [ ] **Step 6: Create `manager/manager.css`**

```css
body { margin: 0; font: 14px system-ui, sans-serif; color: #222; }
header { display: flex; gap: 16px; align-items: center; padding: 12px 20px; border-bottom: 1px solid #ddd; }
header h1 { font-size: 18px; margin: 0; }
#search { flex: 1; max-width: 480px; padding: 6px 10px; }
main { display: grid; grid-template-columns: 320px 1fr; gap: 20px; padding: 20px; }
#suggestions-panel { border-right: 1px solid #eee; padding-right: 20px; }
ul.children { list-style: none; padding-left: 20px; margin: 0; }
li.folder > .folder-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-weight: 600; }
li.bookmark { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
li.bookmark a { color: #1a56b0; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 480px; }
.sort-select, .move-select { font-size: 12px; }
.suggestion { border: 1px solid #ddd; border-radius: 6px; padding: 8px; margin: 8px 0; }
.suggestion button { margin-top: 4px; }
```

- [ ] **Step 7: Create placeholder `manager/manager.js`**

```js
console.log('manager loaded'); // replaced in Task 5
```

- [ ] **Step 8: Manual smoke test**

Load unpacked at `chrome://extensions`. Click the extension icon: popup opens; "Open Manager" opens the manager tab with header and two panels. No console errors.

- [ ] **Step 9: Commit**

```bash
git add manifest.json popup manager
git commit -m "feat: MV3 manifest, popup and manager page skeletons"
```

---

### Task 3: URL utilities (`src/url-utils.js`)

**Files:**
- Create: `src/url-utils.js`
- Test: `tests/url-utils.test.js`

- [ ] **Step 1: Write the failing tests**

`tests/url-utils.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { isSafeUrl, normalizeUrl, domainOf } from '../src/url-utils.js';

describe('isSafeUrl', () => {
  it('accepts http and https', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('http://example.com/a?b=1')).toBe(true);
  });
  it('rejects javascript:, data:, chrome:, and garbage', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>x</script>')).toBe(false);
    expect(isSafeUrl('chrome://settings')).toBe(false);
    expect(isSafeUrl('not a url')).toBe(false);
    expect(isSafeUrl(undefined)).toBe(false);
  });
});

describe('normalizeUrl', () => {
  it('strips hash and trailing slash, lowercases host', () => {
    expect(normalizeUrl('https://Example.com/Path/#section')).toBe('https://example.com/Path');
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
  });
  it('returns the input string when unparseable', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
  });
});

describe('domainOf', () => {
  it('extracts hostname without www', () => {
    expect(domainOf('https://www.github.com/x')).toBe('github.com');
    expect(domainOf('https://news.ycombinator.com')).toBe('news.ycombinator.com');
  });
  it('returns empty string for invalid input', () => {
    expect(domainOf('nope')).toBe('');
    expect(domainOf(undefined)).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/url-utils.test.js`
Expected: FAIL — `Cannot find module '../src/url-utils.js'`

- [ ] **Step 3: Implement `src/url-utils.js`**

```js
export function isSafeUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    let s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return url;
  }
}

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/url-utils.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/url-utils.js tests/url-utils.test.js
git commit -m "feat: url safety, normalization, and domain helpers"
```

---

### Task 4: Tree helpers and sorting (`src/tree.js`, `src/sorting.js`)

**Files:**
- Create: `src/tree.js`, `src/sorting.js`
- Test: `tests/tree.test.js`, `tests/sorting.test.js`

Bookmark nodes are plain objects shaped like `chrome.bookmarks` results: folders have `children` and no `url`; bookmarks have `url`.

- [ ] **Step 1: Write the failing tree tests**

`tests/tree.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { flattenBookmarks, listFolders, findEmptyFolders } from '../src/tree.js';

const tree = [{
  id: '0', title: '',
  children: [{
    id: '1', title: 'Bookmarks bar',
    children: [
      { id: '10', title: 'Dev', parentId: '1', children: [
        { id: '100', title: 'GitHub', url: 'https://github.com', parentId: '10', dateAdded: 2 },
        { id: '101', title: 'Empty sub', parentId: '10', children: [] }
      ]},
      { id: '11', title: 'News HN', url: 'https://news.ycombinator.com', parentId: '1', dateAdded: 1 }
    ]
  }]
}];

describe('flattenBookmarks', () => {
  it('returns only url nodes, with folder path attached', () => {
    const flat = flattenBookmarks(tree);
    expect(flat).toHaveLength(2);
    expect(flat[0]).toMatchObject({ id: '100', path: 'Bookmarks bar / Dev' });
    expect(flat[1]).toMatchObject({ id: '11', path: 'Bookmarks bar' });
  });
});

describe('listFolders', () => {
  it('returns all folders except roots, with path', () => {
    const folders = listFolders(tree);
    expect(folders.map(f => f.title)).toEqual(['Bookmarks bar', 'Dev', 'Empty sub']);
  });
});

describe('findEmptyFolders', () => {
  it('finds folders with no children', () => {
    expect(findEmptyFolders(tree).map(f => f.id)).toEqual(['101']);
  });
});
```

- [ ] **Step 2: Run tree tests — expect FAIL** (`Cannot find module '../src/tree.js'`)

Run: `npx vitest run tests/tree.test.js`

- [ ] **Step 3: Implement `src/tree.js`**

```js
function walk(nodes, path, visit) {
  for (const node of nodes) {
    visit(node, path);
    if (node.children) {
      const next = node.title ? [...path, node.title] : path;
      walk(node.children, next, visit);
    }
  }
}

export function flattenBookmarks(tree) {
  const out = [];
  walk(tree, [], (node, path) => {
    if (node.url) out.push({ ...node, path: path.join(' / ') });
  });
  return out;
}

export function listFolders(tree) {
  const out = [];
  walk(tree, [], (node, path) => {
    if (!node.url && node.title) out.push({ ...node, path: path.join(' / ') });
  });
  return out;
}

export function findEmptyFolders(tree) {
  const out = [];
  walk(tree, [], (node) => {
    if (!node.url && node.title && node.children && node.children.length === 0) out.push(node);
  });
  return out;
}
```

- [ ] **Step 4: Run tree tests — expect PASS**

Run: `npx vitest run tests/tree.test.js`

- [ ] **Step 5: Write the failing sorting tests**

`tests/sorting.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { sortChildren, SORT_MODES } from '../src/sorting.js';

const children = [
  { id: 'b', title: 'zeta', url: 'https://zeta.org', dateAdded: 3 },
  { id: 'f1', title: 'Work', children: [] },
  { id: 'a', title: 'Alpha', url: 'https://www.alpha.com', dateAdded: 1 },
  { id: 'f2', title: 'archive', children: [] },
  { id: 'c', title: 'beta', url: 'https://beta.com/x', dateAdded: 2 }
];

describe('sortChildren', () => {
  it('puts folders first (alphabetical, case-insensitive), then links', () => {
    const ids = sortChildren(children, 'alphabetical').map(n => n.id);
    expect(ids).toEqual(['f2', 'f1', 'a', 'c', 'b']);
  });
  it('sorts links newest-first by dateAdded', () => {
    const ids = sortChildren(children, 'dateAdded').map(n => n.id);
    expect(ids).toEqual(['f2', 'f1', 'b', 'c', 'a']);
  });
  it('sorts links by domain', () => {
    const ids = sortChildren(children, 'domain').map(n => n.id);
    expect(ids).toEqual(['f2', 'f1', 'a', 'c', 'b']);
  });
  it('does not mutate the input array', () => {
    const copy = [...children];
    sortChildren(children, 'alphabetical');
    expect(children).toEqual(copy);
  });
  it('exposes the available modes', () => {
    expect(SORT_MODES).toEqual(['alphabetical', 'dateAdded', 'domain']);
  });
});
```

- [ ] **Step 6: Run sorting tests — expect FAIL** (`Cannot find module '../src/sorting.js'`)

Run: `npx vitest run tests/sorting.test.js`

- [ ] **Step 7: Implement `src/sorting.js`**

```js
import { domainOf } from './url-utils.js';

const byTitle = (a, b) =>
  (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });

const COMPARATORS = {
  alphabetical: byTitle,
  dateAdded: (a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0),
  domain: (a, b) => domainOf(a.url).localeCompare(domainOf(b.url)) || byTitle(a, b)
};

export const SORT_MODES = Object.keys(COMPARATORS);

export function sortChildren(children, mode) {
  const folders = children.filter(n => !n.url).sort(byTitle);
  const links = children.filter(n => n.url).sort(COMPARATORS[mode]);
  return [...folders, ...links];
}
```

- [ ] **Step 8: Run all tests — expect PASS**

Run: `npm test`

- [ ] **Step 9: Commit**

```bash
git add src/tree.js src/sorting.js tests/tree.test.js tests/sorting.test.js
git commit -m "feat: tree helpers and folder-aware sorting"
```

---

### Task 5: Manager page — render tree, apply sort, move bookmarks

**Files:**
- Modify: `manager/manager.js` (replace placeholder entirely)

Glue code: calls `chrome.bookmarks`, renders with safe DOM APIs, delegates logic to `src/`. No unit tests (no logic); verified manually in Step 2.

- [ ] **Step 1: Replace `manager/manager.js`**

```js
import { sortChildren, SORT_MODES } from '../src/sorting.js';
import { isSafeUrl } from '../src/url-utils.js';
import { listFolders } from '../src/tree.js';

const treeEl = document.getElementById('tree');

const SORT_LABELS = { alphabetical: 'A–Z', dateAdded: 'Newest first', domain: 'By domain' };

async function refresh() {
  const tree = await chrome.bookmarks.getTree();
  const folders = listFolders(tree);
  treeEl.replaceChildren();
  const roots = tree[0].children ?? [];
  for (const root of roots) treeEl.appendChild(renderFolder(root, folders));
}

function renderFolder(folder, allFolders) {
  const li = document.createElement('li');
  li.className = 'folder';

  const row = document.createElement('div');
  row.className = 'folder-row';

  const name = document.createElement('span');
  name.textContent = `📁 ${folder.title}`;
  row.appendChild(name);

  const sortSelect = document.createElement('select');
  sortSelect.className = 'sort-select';
  const placeholder = document.createElement('option');
  placeholder.textContent = 'Sort…';
  placeholder.value = '';
  sortSelect.appendChild(placeholder);
  for (const mode of SORT_MODES) {
    const opt = document.createElement('option');
    opt.value = mode;
    opt.textContent = SORT_LABELS[mode];
    sortSelect.appendChild(opt);
  }
  sortSelect.addEventListener('change', async () => {
    if (!sortSelect.value) return;
    await applySort(folder.id, sortSelect.value);
    await refresh();
  });
  row.appendChild(sortSelect);
  li.appendChild(row);

  const ul = document.createElement('ul');
  ul.className = 'children';
  for (const child of folder.children ?? []) {
    ul.appendChild(child.url ? renderBookmark(child, allFolders) : renderFolder(child, allFolders));
  }
  li.appendChild(ul);

  const wrapper = document.createElement('ul');
  wrapper.className = 'children';
  wrapper.appendChild(li);
  return wrapper;
}

function renderBookmark(node, allFolders) {
  const li = document.createElement('li');
  li.className = 'bookmark';

  if (isSafeUrl(node.url)) {
    const a = document.createElement('a');
    a.textContent = node.title || node.url;
    a.href = node.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    li.appendChild(a);
  } else {
    const span = document.createElement('span');
    span.textContent = `${node.title || node.url} (blocked: unsafe URL)`;
    li.appendChild(span);
  }

  const move = document.createElement('select');
  move.className = 'move-select';
  const placeholder = document.createElement('option');
  placeholder.textContent = 'Move to…';
  placeholder.value = '';
  move.appendChild(placeholder);
  for (const folder of allFolders) {
    if (folder.id === node.parentId) continue;
    const opt = document.createElement('option');
    opt.value = folder.id;
    opt.textContent = folder.path ? `${folder.path} / ${folder.title}` : folder.title;
    move.appendChild(opt);
  }
  move.addEventListener('change', async () => {
    if (!move.value) return;
    await chrome.bookmarks.move(node.id, { parentId: move.value });
    await refresh();
  });
  li.appendChild(move);

  return li;
}

async function applySort(folderId, mode) {
  const [subtree] = await chrome.bookmarks.getSubTree(folderId);
  const sorted = sortChildren(subtree.children ?? [], mode);
  for (let i = 0; i < sorted.length; i++) {
    await chrome.bookmarks.move(sorted[i].id, { parentId: folderId, index: i });
  }
}

refresh().catch(err => {
  treeEl.textContent = `Failed to load bookmarks: ${err.message}`;
});
```

- [ ] **Step 2: Manual verification**

Reload the extension at `chrome://extensions`, open the manager page:
1. Full bookmark tree renders with folders and links.
2. Pick "A–Z" on a folder → its links reorder alphabetically with subfolders on top (check in Chrome's native bookmark manager too).
3. Use "Move to…" on a bookmark → it appears under the chosen folder after refresh.
4. No console errors; links open in a new tab.

- [ ] **Step 3: Run lint and tests**

Run: `npm run lint && npm test`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add manager/manager.js
git commit -m "feat: manager page tree rendering, per-folder sort, move-to-folder"
```

---

### Task 6: Search (`src/search.js` + popup and manager wiring)

**Files:**
- Create: `src/search.js`
- Modify: `popup/popup.js`, `manager/manager.js`
- Test: `tests/search.test.js`

- [ ] **Step 1: Write the failing tests**

`tests/search.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { searchBookmarks } from '../src/search.js';

const flat = [
  { id: '1', title: 'React docs', url: 'https://react.dev', path: 'Dev / Frontend' },
  { id: '2', title: 'Cooking pasta', url: 'https://recipes.example.com/pasta', path: 'Recipes' },
  { id: '3', title: 'Vue guide', url: 'https://vuejs.org/guide', path: 'Dev / Frontend' }
];

describe('searchBookmarks', () => {
  it('matches title case-insensitively', () => {
    expect(searchBookmarks(flat, 'react').map(b => b.id)).toEqual(['1']);
  });
  it('matches url and folder path', () => {
    expect(searchBookmarks(flat, 'recipes').map(b => b.id)).toEqual(['2']);
    expect(searchBookmarks(flat, 'frontend').map(b => b.id)).toEqual(['1', '3']);
  });
  it('requires all words to match (topic search)', () => {
    expect(searchBookmarks(flat, 'dev guide').map(b => b.id)).toEqual(['3']);
  });
  it('returns empty array for blank query', () => {
    expect(searchBookmarks(flat, '   ')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module '../src/search.js'`)

Run: `npx vitest run tests/search.test.js`

- [ ] **Step 3: Implement `src/search.js`**

```js
export function searchBookmarks(flat, query) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return flat.filter(b => {
    const haystack = `${b.title} ${b.url} ${b.path}`.toLowerCase();
    return words.every(w => haystack.includes(w));
  });
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run tests/search.test.js`

- [ ] **Step 5: Wire search into the popup — replace `popup/popup.js`**

```js
import { flattenBookmarks } from '../src/tree.js';
import { searchBookmarks } from '../src/search.js';
import { isSafeUrl } from '../src/url-utils.js';

const input = document.getElementById('search');
const results = document.getElementById('results');
let flat = [];

async function init() {
  const tree = await chrome.bookmarks.getTree();
  flat = flattenBookmarks(tree);
}

function render(matches) {
  results.replaceChildren();
  for (const b of matches.slice(0, 50)) {
    const li = document.createElement('li');
    if (isSafeUrl(b.url)) {
      const a = document.createElement('a');
      a.textContent = b.title || b.url;
      a.href = b.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      li.appendChild(a);
    } else {
      const span = document.createElement('span');
      span.textContent = b.title || b.url;
      li.appendChild(span);
    }
    const path = document.createElement('div');
    path.className = 'path';
    path.textContent = b.path;
    li.appendChild(path);
    results.appendChild(li);
  }
}

input.addEventListener('input', () => render(searchBookmarks(flat, input.value)));

document.getElementById('open-manager').addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('manager/manager.html') });
  window.close();
});

init().catch(err => { results.textContent = `Error: ${err.message}`; });
```

- [ ] **Step 6: Wire search into the manager — modify `manager/manager.js`**

Add these imports at the top:
```js
import { flattenBookmarks } from '../src/tree.js';
import { searchBookmarks } from '../src/search.js';
```
(`flattenBookmarks` joins the existing `listFolders` import from `../src/tree.js` — combine into one import statement.)

Add after the `treeEl` declaration:
```js
const searchEl = document.getElementById('search');

searchEl.addEventListener('input', async () => {
  const query = searchEl.value;
  if (!query.trim()) { await refresh(); return; }
  const tree = await chrome.bookmarks.getTree();
  const matches = searchBookmarks(flattenBookmarks(tree), query);
  const folders = listFolders(tree);
  treeEl.replaceChildren();
  const ul = document.createElement('ul');
  ul.className = 'children';
  for (const b of matches) ul.appendChild(renderBookmark(b, folders));
  treeEl.appendChild(ul);
});
```

- [ ] **Step 7: Manual verification**

Reload extension. Popup: typing filters live, results show folder path, links open. Manager: typing shows a flat filtered list; clearing the box restores the tree.

- [ ] **Step 8: Run all checks and commit**

Run: `npm run lint && npm test` — expect PASS.

```bash
git add src/search.js tests/search.test.js popup/popup.js manager/manager.js
git commit -m "feat: topic search in popup and manager"
```

---

### Task 7: Cleanup suggestions — duplicates and empty folders (`src/suggestions.js`)

**Files:**
- Create: `src/suggestions.js`
- Test: `tests/suggestions.test.js`

- [ ] **Step 1: Write the failing tests**

`tests/suggestions.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { findDuplicates, suggestFolderByRules } from '../src/suggestions.js';

describe('findDuplicates', () => {
  it('groups bookmarks whose normalized URLs match', () => {
    const flat = [
      { id: '1', title: 'A', url: 'https://example.com/page' },
      { id: '2', title: 'B', url: 'https://example.com/page/#top' },
      { id: '3', title: 'C', url: 'https://other.com' }
    ];
    const groups = findDuplicates(flat);
    expect(groups).toHaveLength(1);
    expect(groups[0].map(b => b.id)).toEqual(['1', '2']);
  });
  it('returns empty array when no duplicates', () => {
    expect(findDuplicates([{ id: '1', url: 'https://a.com' }])).toEqual([]);
  });
});

describe('suggestFolderByRules', () => {
  const folders = [
    { id: 'f1', title: 'Dev', children: [{ url: 'https://github.com/x' }, { url: 'https://stackoverflow.com/q' }] },
    { id: 'f2', title: 'Recipes', children: [{ url: 'https://recipes.example.com/1' }] }
  ];
  it('suggests the folder already containing the same domain', () => {
    const s = suggestFolderByRules({ title: 'Repo', url: 'https://github.com/y' }, folders);
    expect(s.id).toBe('f1');
  });
  it('suggests a folder whose title appears in the bookmark title', () => {
    const s = suggestFolderByRules({ title: 'Best recipes for pasta', url: 'https://pasta.io' }, folders);
    expect(s.id).toBe('f2');
  });
  it('returns null when nothing matches', () => {
    expect(suggestFolderByRules({ title: 'Weather', url: 'https://weather.io' }, folders)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module '../src/suggestions.js'`)

Run: `npx vitest run tests/suggestions.test.js`

- [ ] **Step 3: Implement `src/suggestions.js`**

```js
import { normalizeUrl, domainOf } from './url-utils.js';

export function findDuplicates(flat) {
  const byUrl = new Map();
  for (const b of flat) {
    const key = normalizeUrl(b.url);
    if (!byUrl.has(key)) byUrl.set(key, []);
    byUrl.get(key).push(b);
  }
  return [...byUrl.values()].filter(group => group.length > 1);
}

export function suggestFolderByRules(bookmark, folders) {
  const domain = domainOf(bookmark.url);
  for (const folder of folders) {
    const domains = (folder.children ?? []).filter(c => c.url).map(c => domainOf(c.url));
    if (domain && domains.includes(domain)) return folder;
  }
  const title = (bookmark.title || '').toLowerCase();
  for (const folder of folders) {
    if (folder.title && title.includes(folder.title.toLowerCase())) return folder;
  }
  return null;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run tests/suggestions.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/suggestions.js tests/suggestions.test.js
git commit -m "feat: duplicate detection and rule-based folder suggestion"
```

---

### Task 8: AI folder suggestions (`src/ai.js`)

**Files:**
- Create: `src/ai.js`
- Test: `tests/ai.test.js`

Uses Chrome's built-in `LanguageModel` (Prompt API / Gemini Nano) when available — fully on-device, no network. The model can either pick an existing folder (validated against the allowlist) or propose a NEW folder name (sanitized, created only on explicit user approval in Task 9). The pure functions (`buildPrompt`, `sanitizeFolderName`, `parseSuggestion`) are unit-tested; the `LanguageModel` glue is tested by injecting a fake session factory.

- [ ] **Step 1: Write the failing tests**

`tests/ai.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { buildPrompt, sanitizeFolderName, parseSuggestion, suggestFolder } from '../src/ai.js';

const folders = [{ id: 'f1', title: 'Dev' }, { id: 'f2', title: 'Recipes' }];

describe('buildPrompt', () => {
  it('includes title, domain, the folder allowlist, and the NEW option', () => {
    const p = buildPrompt({ title: 'GitHub', url: 'https://github.com' }, folders);
    expect(p).toContain('GitHub');
    expect(p).toContain('github.com');
    expect(p).toContain('Dev');
    expect(p).toContain('Recipes');
    expect(p).toContain('NEW:');
  });
});

describe('sanitizeFolderName', () => {
  it('trims, strips quotes and control characters, caps length at 40', () => {
    expect(sanitizeFolderName(' "Machine Learning" ')).toBe('Machine Learning');
    expect(sanitizeFolderName('a'.repeat(100))).toHaveLength(40);
    expect(sanitizeFolderName('Bad\u0000\u0007Name')).toBe('BadName');
  });
  it('returns null for empty or non-string input', () => {
    expect(sanitizeFolderName('  ')).toBeNull();
    expect(sanitizeFolderName(undefined)).toBeNull();
  });
});

describe('parseSuggestion', () => {
  it('matches an existing folder case-insensitively, ignoring quotes/whitespace', () => {
    expect(parseSuggestion(' "dev" \n', folders).folder.id).toBe('f1');
  });
  it('parses NEW: into a sanitized new folder name', () => {
    const s = parseSuggestion('NEW: Machine Learning', folders);
    expect(s.folder).toBeNull();
    expect(s.newFolderName).toBe('Machine Learning');
  });
  it('maps NEW: matching an existing folder back to that folder', () => {
    const s = parseSuggestion('NEW: recipes', folders);
    expect(s.folder.id).toBe('f2');
    expect(s.newFolderName).toBeNull();
  });
  it('rejects anything else (untrusted model output)', () => {
    expect(parseSuggestion('Delete all bookmarks', folders)).toBeNull();
    expect(parseSuggestion('', folders)).toBeNull();
  });
});

describe('suggestFolder', () => {
  it('returns an existing folder picked by the model', async () => {
    const fakeSession = { prompt: async () => 'Recipes', destroy: () => {} };
    const result = await suggestFolder(
      { title: 'Pasta', url: 'https://pasta.io' }, folders,
      { createSession: async () => fakeSession }
    );
    expect(result.folder.id).toBe('f2');
    expect(result.source).toBe('ai');
  });
  it('returns a new folder name proposed by the model', async () => {
    const fakeSession = { prompt: async () => 'NEW: Finance', destroy: () => {} };
    const result = await suggestFolder(
      { title: 'My bank', url: 'https://bank.example.com' }, folders,
      { createSession: async () => fakeSession }
    );
    expect(result.folder).toBeNull();
    expect(result.newFolderName).toBe('Finance');
    expect(result.source).toBe('ai');
  });
  it('falls back to rules when no session factory is available', async () => {
    const foldersWithChildren = [
      { id: 'f1', title: 'Dev', children: [{ url: 'https://github.com/x' }] }
    ];
    const result = await suggestFolder(
      { title: 'Repo', url: 'https://github.com/y' }, foldersWithChildren,
      { createSession: null }
    );
    expect(result.folder.id).toBe('f1');
    expect(result.source).toBe('rules');
  });
  it('returns null folder when neither AI nor rules produce a match', async () => {
    const result = await suggestFolder(
      { title: 'X', url: 'https://x.io' }, folders, { createSession: null }
    );
    expect(result.folder).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module '../src/ai.js'`)

Run: `npx vitest run tests/ai.test.js`

- [ ] **Step 3: Implement `src/ai.js`**

```js
import { domainOf } from './url-utils.js';
import { suggestFolderByRules } from './suggestions.js';

export function buildPrompt(bookmark, folders) {
  const names = folders.map(f => f.title).join(', ');
  return [
    'You organize browser bookmarks. Pick the single best folder for this bookmark.',
    `Bookmark title: ${bookmark.title}`,
    `Bookmark domain: ${domainOf(bookmark.url)}`,
    `Folders: ${names}`,
    'Reply with exactly one folder name from the list, and nothing else.',
    'If no folder fits, reply with NEW: followed by a short new folder name (1-3 words).'
  ].join('\n');
}

// Model output is untrusted: strip control characters, surrounding quotes, cap length.
export function sanitizeFolderName(name) {
  if (typeof name !== 'string') return null;
  const cleaned = [...name]
    .filter(ch => { const c = ch.codePointAt(0); return c >= 0x20 && c !== 0x7f; })
    .join('')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim()
    .slice(0, 40);
  return cleaned || null;
}

// Returns { folder, newFolderName } or null if the output is unusable.
export function parseSuggestion(response, folders) {
  if (typeof response !== 'string') return null;
  const newMatch = response.trim().match(/^NEW:\s*(.+)$/is);
  if (newMatch) {
    const name = sanitizeFolderName(newMatch[1]);
    if (!name) return null;
    const existing = folders.find(f => f.title.toLowerCase() === name.toLowerCase());
    return existing
      ? { folder: existing, newFolderName: null }
      : { folder: null, newFolderName: name };
  }
  const cleaned = sanitizeFolderName(response);
  const folder = cleaned
    ? folders.find(f => f.title.toLowerCase() === cleaned.toLowerCase())
    : null;
  return folder ? { folder, newFolderName: null } : null;
}

// Default factory: Chrome built-in Prompt API (on-device Gemini Nano).
// Returns null when unavailable so callers fall back to rules.
export async function defaultSessionFactory() {
  if (typeof LanguageModel === 'undefined') return null;
  const availability = await LanguageModel.availability();
  if (availability === 'unavailable') return null;
  return LanguageModel.create();
}

export async function suggestFolder(bookmark, folders, { createSession } = {}) {
  if (createSession) {
    let session = null;
    try {
      session = await createSession();
      if (session) {
        const response = await session.prompt(buildPrompt(bookmark, folders));
        const parsed = parseSuggestion(response, folders);
        if (parsed) return { ...parsed, source: 'ai' };
      }
    } catch (err) {
      console.warn('AI suggestion failed, falling back to rules:', err);
    } finally {
      session?.destroy?.();
    }
  }
  return { folder: suggestFolderByRules(bookmark, folders), newFolderName: null, source: 'rules' };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test` (all suites)

- [ ] **Step 5: Commit**

```bash
git add src/ai.js tests/ai.test.js
git commit -m "feat: on-device AI suggestions — existing-folder picks and sanitized new-folder proposals"
```

---

### Task 9: Suggestions panel in the manager page

**Files:**
- Modify: `manager/manager.js`

Wires Tasks 7–8 into the UI: "Analyze bookmarks" reports duplicates, empty folders, and folder suggestions for bookmarks sitting in root folders, with one-click Apply buttons.

- [ ] **Step 1: Add imports to `manager/manager.js`**

```js
import { findEmptyFolders } from '../src/tree.js';   // merge into existing tree.js import
import { findDuplicates } from '../src/suggestions.js';
import { suggestFolder, defaultSessionFactory } from '../src/ai.js';
```

- [ ] **Step 2: Add the analyze handler at the bottom of `manager/manager.js` (above the final `refresh()` call)**

```js
const suggestionsOutput = document.getElementById('suggestions-output');
const analyzeBtn = document.getElementById('run-suggestions');

function addSuggestion(text, actionLabel, action) {
  const div = document.createElement('div');
  div.className = 'suggestion';
  const p = document.createElement('p');
  p.textContent = text;
  div.appendChild(p);
  if (action) {
    const btn = document.createElement('button');
    btn.textContent = actionLabel;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await action();
      div.remove();
      await refresh();
    });
    div.appendChild(btn);
  }
  suggestionsOutput.appendChild(div);
}

analyzeBtn.addEventListener('click', async () => {
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = 'Analyzing…';
  suggestionsOutput.replaceChildren();
  try {
    const tree = await chrome.bookmarks.getTree();
    const flat = flattenBookmarks(tree);
    const folders = listFolders(tree);

    for (const group of findDuplicates(flat)) {
      const extras = group.slice(1);
      addSuggestion(
        `Duplicate: "${group[0].title}" appears ${group.length} times.`,
        `Remove ${extras.length} duplicate(s)`,
        async () => { for (const b of extras) await chrome.bookmarks.remove(b.id); }
      );
    }

    for (const folder of findEmptyFolders(tree)) {
      addSuggestion(
        `Empty folder: "${folder.title}".`,
        'Delete folder',
        async () => { await chrome.bookmarks.remove(folder.id); }
      );
    }

    // Suggest folders for bookmarks sitting directly in root folders (uncategorized).
    const rootIds = new Set((tree[0].children ?? []).map(n => n.id));
    const uncategorized = flat.filter(b => rootIds.has(b.parentId)).slice(0, 10);
    for (const b of uncategorized) {
      const { folder, newFolderName, source } =
        await suggestFolder(b, folders, { createSession: defaultSessionFactory });
      if (folder) {
        addSuggestion(
          `Move "${b.title}" into "${folder.title}"? (${source === 'ai' ? 'AI suggestion' : 'rule-based'})`,
          'Move it',
          async () => { await chrome.bookmarks.move(b.id, { parentId: folder.id }); }
        );
      } else if (newFolderName) {
        addSuggestion(
          `Create a new folder "${newFolderName}" for "${b.title}"? (AI suggestion)`,
          'Create folder & move',
          async () => {
            const created = await chrome.bookmarks.create({ parentId: b.parentId, title: newFolderName });
            await chrome.bookmarks.move(b.id, { parentId: created.id });
          }
        );
      }
    }

    if (suggestionsOutput.childElementCount === 0) {
      addSuggestion('No suggestions — your bookmarks look tidy!', null, null);
    }
  } catch (err) {
    addSuggestion(`Analysis failed: ${err.message}`, null, null);
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Analyze bookmarks';
  }
});
```

- [ ] **Step 3: Manual verification**

Reload extension, open manager, click "Analyze bookmarks":
1. Create a duplicate bookmark and an empty folder first; both are reported with working Apply buttons.
2. A bookmark sitting directly in the Bookmarks bar gets a folder suggestion ("AI suggestion" on machines with Gemini Nano, "rule-based" otherwise) and "Move it" works.
3. On a machine with Gemini Nano: a bookmark matching no existing folder produces a "Create a new folder …" suggestion; "Create folder & move" creates the folder next to the bookmark and moves it in. Nothing is created until the button is clicked.
4. Note: deletions here are real bookmark deletions — verify against Chrome's native manager.

- [ ] **Step 4: Run all checks and commit**

Run: `npm run lint && npm test` — expect PASS.

```bash
git add manager/manager.js
git commit -m "feat: suggestions panel — duplicates, empty folders, AI folder suggestions"
```

---

### Task 10: Final verification and merge to main

**Files:** none new.

- [ ] **Step 1: Full check**

Run: `npm run lint && npm test`
Expected: 0 lint errors, all test suites pass.

- [ ] **Step 2: Full manual pass**

Reload unpacked extension and verify the checklist:
1. Popup search works and "Open Manager" opens the manager tab.
2. Manager renders the full tree; per-folder sort (A–Z, newest, domain) works.
3. Move-to-folder works; manager search filters and clears correctly.
4. Analyze produces duplicate/empty-folder/move suggestions; Apply buttons work.
5. Security spot-check: add a bookmark titled `<img src=x onerror=alert(1)>` with URL `javascript:alert(1)` (via Chrome's native manager). The manager page must show it as plain text with "(blocked: unsafe URL)" and no alert fires anywhere.

- [ ] **Step 3: Request code review**

Use the superpowers:requesting-code-review skill on the `feat/initial-build` branch diff against `main`. Address findings before merging.

- [ ] **Step 4: Merge**

```bash
git switch main
git merge --no-ff feat/initial-build -m "feat: bookmark organizer v0.1 — search, sort, move, suggestions"
```

- [ ] **Step 5: Tag**

```bash
git tag v0.1.0
```
