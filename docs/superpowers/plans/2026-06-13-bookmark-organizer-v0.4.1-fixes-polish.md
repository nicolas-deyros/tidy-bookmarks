# Bookmark Organizer v0.4.1 — Fixes & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix four browser-found bugs and add three polish features: shared theme with an Auto/Light/Dark toggle (fixes sidebar dark mode), popup flex layout, working Suggestions tab, auto-selected first folder, keyboard shortcuts, and a help panel.

**Tech Stack:** Vanilla JS ES modules, MV3, Vitest, ESLint. No bundler. No service worker (global hotkey uses `_execute_action`).

**Security:** permissions stay `["bookmarks","storage","favicon","sidePanel"]` (no new ones — `commands` is not a permission). No `innerHTML`/`eval`; `createElement`/`textContent` only.

**Branching:** off `main` (v0.4.0). Branch `feat/v0.4.1-fixes`. Run `npm test` + `npm run lint` before each commit; end commits with a blank line then `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

**Browser-found bugs addressed:** (1) popup/sidebar ignored dark mode; (2) popup `#results` fixed height crowds the buttons; (4) Suggestions tab does nothing — `#browse-view{display:grid}` overrides `[hidden]`; (5) sort not visible because no folder is selected on load.

---

### Task 1: Shared theme + Auto/Light/Dark toggle (fixes bug 1)

**Files:** Create `theme.css`; Modify `manager/manager.html`, `popup/popup.html`, `manager/manager.css`, `popup/popup.css`, `manager/manager.js`, `popup/popup.js`

- [ ] **Step 1: Branch.** `git switch -c feat/v0.4.1-fixes`

- [ ] **Step 2: Create `theme.css`** (single source of color variables; `data-theme` on `<html>` selects the mode)
```css
:root {
  --bg: #ffffff; --bg-soft: #f5f6f8; --bg-sel: #e8eefc;
  --text: #222222; --text-soft: #888888; --border: #dddddd;
  --link: #1a56b0; --danger: #c0392b; --chip-bg: #eef2ff; --chip-text: #3349a8;
}
:root[data-theme="dark"] {
  --bg: #1e1f22; --bg-soft: #2a2c30; --bg-sel: #2f3a52;
  --text: #e6e6e6; --text-soft: #9aa0a6; --border: #3a3d42;
  --link: #6ea8fe; --danger: #e06b5e; --chip-bg: #2f3a52; --chip-text: #aac4ff;
}
@media (prefers-color-scheme: dark) {
  :root[data-theme="auto"] {
    --bg: #1e1f22; --bg-soft: #2a2c30; --bg-sel: #2f3a52;
    --text: #e6e6e6; --text-soft: #9aa0a6; --border: #3a3d42;
    --link: #6ea8fe; --danger: #e06b5e; --chip-bg: #2f3a52; --chip-text: #aac4ff;
  }
}
```

- [ ] **Step 3: Remove the `:root`/`@media` color blocks from `manager/manager.css`** (the top block defining `--bg`…and the dark `@media` block) — they now live in `theme.css`. Leave the rest of `manager.css` unchanged (it already consumes the vars).

- [ ] **Step 4: Link `theme.css` first in both pages.** In `manager/manager.html` and `popup/popup.html`, add **before** the existing page stylesheet link:
```html
  <link rel="stylesheet" href="../theme.css">
```
(manager.html: `href="../theme.css"`; popup.html: `href="../theme.css"`.)

- [ ] **Step 5: Convert `popup/popup.css` to the shared variables** — replace its hard-coded colors:
```css
body { width: 320px; margin: 0; padding: 8px; font: 13px system-ui, sans-serif; color: var(--text); background: var(--bg); }
#search { width: 100%; box-sizing: border-box; padding: 6px; margin-bottom: 6px; background: var(--bg); color: var(--text); border: 1px solid var(--border); }
#results { list-style: none; margin: 0 0 6px; padding: 0; max-height: min(70vh, 480px); overflow-y: auto; }
#results li { padding: 4px 2px; border-bottom: 1px solid var(--border); }
#results a { color: var(--link); text-decoration: none; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#results .path { color: var(--text-soft); font-size: 11px; }
#open-manager, #open-sidebar { width: 100%; padding: 6px; cursor: pointer; margin-top: 4px; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; }
```
(The `#results` height is finalized in Task 3.)

- [ ] **Step 6: Apply the saved theme on load in `popup/popup.js`** — inside `init()`, after the existing storage read, add (or extend the `chrome.storage.local.get` call to include `theme`):
```js
  const { theme = 'auto' } = await chrome.storage.local.get('theme');
  document.documentElement.dataset.theme = theme;
```

- [ ] **Step 7: Add the theme selector to the manager.** In `manager/manager.html`, inside `<header>` after the `#view-toggle` div:
```html
    <select id="theme-select" aria-label="Theme">
      <option value="auto">Auto</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
```
In `manager/manager.js`, near the other `document.getElementById` lines add `const themeSelect = document.getElementById('theme-select');`, and at the end of `loadState()` apply + sync the control:
```js
  const { theme = 'auto' } = await chrome.storage.local.get('theme');
  document.documentElement.dataset.theme = theme;
  themeSelect.value = theme;
```
and wire the change handler (near the other listeners):
```js
themeSelect.addEventListener('change', async () => {
  document.documentElement.dataset.theme = themeSelect.value;
  await chrome.storage.local.set({ theme: themeSelect.value });
});
```

- [ ] **Step 8: Verify** `npm run lint && npm test`. Manual: manager header has Auto/Light/Dark; switching recolors instantly; reopening keeps the choice; popup/sidebar now follow the same theme (Auto matches OS, Light/Dark forced).

- [ ] **Step 9: Commit**
```bash
git add theme.css manager/manager.html manager/manager.css popup/popup.html popup/popup.css manager/manager.js popup/popup.js
git commit -m "feat: shared theme.css with Auto/Light/Dark toggle; popup/sidebar honor dark mode"
```

---

### Task 2: Fix Suggestions tab + auto-select first folder (bugs 4 & 5)

**Files:** Modify `manager/manager.css`, `manager/manager.js`

- [ ] **Step 1: Fix the `[hidden]` override in `manager/manager.css`** — change:
```css
#browse-view { display: grid; grid-template-columns: 260px 1fr; gap: 0; height: calc(100vh - 58px); }
```
to:
```css
#browse-view { display: grid; grid-template-columns: 260px 1fr; gap: 0; height: calc(100vh - 58px); }
#browse-view[hidden], #suggestions-view[hidden] { display: none; }
```
(The attribute selector has higher specificity than the bare id rule, so `hidden` now actually hides the grid.)

- [ ] **Step 2: Auto-select the first folder in `manager/manager.js` `refresh()`** — after the prune lines (`uiState.expanded = new Set(...)`), add:
```js
  if (!uiState.selected) {
    const firstRoot = (tree[0].children ?? [])[0];
    if (firstRoot) uiState.selected = firstRoot.id;
  }
```

- [ ] **Step 3: Verify** `npm run lint && npm test`. Manual: on load a folder is preselected and its contents + the **Sort…** control show immediately; clicking **Suggestions** now hides Browse and shows the Analyze button + results; clicking **Browse** returns.

- [ ] **Step 4: Commit**
```bash
git add manager/manager.css manager/manager.js
git commit -m "fix: Suggestions tab visibility ([hidden] vs display:grid) and auto-select first folder"
```

---

### Task 3: Popup fills height without crowding the buttons (bug 2)

**Files:** Modify `popup/popup.css`

- [ ] **Step 1: Make the popup a flex column** — replace the `body` and `#results` rules in `popup/popup.css`:
```css
body { width: 320px; height: 100vh; max-height: 580px; box-sizing: border-box; margin: 0; padding: 8px; display: flex; flex-direction: column; font: 13px system-ui, sans-serif; color: var(--text); background: var(--bg); }
#results { list-style: none; margin: 0 0 6px; padding: 0; flex: 1 1 auto; min-height: 0; overflow-y: auto; }
```
(Side panel: `100vh` fills the panel. Popup: capped at 580px. `#results` flexes to fill; `#search` and the two buttons keep their natural height above/below.)

- [ ] **Step 2: Verify** `npm run lint && npm test`. Manual: in the side panel the results list grows to fill the panel height; "Pin to sidebar" and "Open Manager" stay visible at the bottom and never get pushed off.

- [ ] **Step 3: Commit**
```bash
git add popup/popup.css
git commit -m "fix: popup/sidebar results flex to fill height, buttons stay anchored"
```

---

### Task 4: Keyboard shortcuts (feature 3a)

**Files:** Modify `manager/manager.js`, `manager/reorg-view.js`, `manifest.json`

- [ ] **Step 1: Global open command in `manifest.json`** — add a top-level `"commands"` key:
```json
  "commands": {
    "_execute_action": {
      "suggested_key": { "default": "Ctrl+Shift+B" }
    }
  }
```
(`_execute_action` opens the popup with no service worker. Mac users get `Command+Shift+B` automatically.)

- [ ] **Step 2: In-page shortcuts in `manager/manager.js`** — add near the other listeners:
```js
document.addEventListener('keydown', e => {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.key === '/') { e.preventDefault(); searchEl.focus(); }
  else if (e.key === 'b') showBrowse();
  else if (e.key === 's') showSuggestions();
});
```

- [ ] **Step 3: Escape closes the reorg overlay** — in `manager/reorg-view.js` `openReorg`, after `document.body.appendChild(overlay);` add a self-managed Escape handler:
```js
  function onKey(e) { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); } }
  document.addEventListener('keydown', onKey);
```
and in the `cancel` click and `apply` success paths, also `document.removeEventListener('keydown', onKey)` before/after `overlay.remove()` (add the removeEventListener call right where `overlay.remove()` is called). (`confirmModal` already handles its own Escape.)

- [ ] **Step 4: Verify** `npm run lint && npm test`. Manual: in the manager, `/` focuses search, `b`/`s` switch views (not while typing in a field), `Esc` closes the reorg panel; the toolbar hotkey (Ctrl/Cmd+Shift+B) opens the popup. (Note: the configured key is editable at `chrome://extensions/shortcuts`.)

- [ ] **Step 5: Commit**
```bash
git add manager/manager.js manager/reorg-view.js manifest.json
git commit -m "feat: in-page keyboard shortcuts and global open-popup command"
```

---

### Task 5: Help panel (feature 3b)

**Files:** Modify `manager/manager.html`, `manager/manager.js`; Create `manager/help.js`

- [ ] **Step 1: Add a help button** to `manager/manager.html` header, after `#theme-select`:
```html
    <button id="help-btn" aria-label="Help">?</button>
```

- [ ] **Step 2: Create `manager/help.js`**
```js
const FEATURES = [
  'Browse: folders on the left, contents on the right. Click a folder to view it.',
  'Drag bookmarks onto folders to move them; drag bookmarks to reorder; drag folders to restructure.',
  'Tags: add with “+ tag”, autocomplete from existing tags, or “✨ Suggest” for AI tags.',
  'Sort a folder with the Sort control; Reorganize a folder by methodology with preview + undo.',
  'Suggestions tab: duplicates, empty folders, merges, and AI move/tag/reorg.',
  'Theme: Auto / Light / Dark in the header.'
];
const SHORTCUTS = [
  ['/', 'Focus search'],
  ['b', 'Browse view'],
  ['s', 'Suggestions view'],
  ['Esc', 'Close panel / dialog'],
  ['Ctrl/Cmd+Shift+B', 'Open the extension popup (editable in chrome://extensions/shortcuts)']
];

export function openHelp() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const box = document.createElement('div');
  box.className = 'modal-box help-box';

  const h = document.createElement('h3');
  h.textContent = 'Bookmark Organizer — help';
  box.appendChild(h);

  const fTitle = document.createElement('p');
  fTitle.className = 'help-section';
  fTitle.textContent = 'Features';
  box.appendChild(fTitle);
  const fList = document.createElement('ul');
  for (const f of FEATURES) { const li = document.createElement('li'); li.textContent = f; fList.appendChild(li); }
  box.appendChild(fList);

  const sTitle = document.createElement('p');
  sTitle.className = 'help-section';
  sTitle.textContent = 'Keyboard shortcuts';
  box.appendChild(sTitle);
  const sList = document.createElement('ul');
  for (const [key, desc] of SHORTCUTS) {
    const li = document.createElement('li');
    const k = document.createElement('kbd'); k.textContent = key;
    li.append(k, document.createTextNode(` — ${desc}`));
    sList.appendChild(li);
  }
  box.appendChild(sList);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const close = document.createElement('button');
  close.textContent = 'Close';
  function onKey(e) { if (e.key === 'Escape') done(); }
  function done() { overlay.remove(); document.removeEventListener('keydown', onKey); }
  close.addEventListener('click', done);
  overlay.addEventListener('click', e => { if (e.target === overlay) done(); });
  document.addEventListener('keydown', onKey);
  actions.appendChild(close);
  box.appendChild(actions);

  overlay.appendChild(box);
  document.body.appendChild(overlay);
  close.focus();
}
```

- [ ] **Step 3: Wire it in `manager/manager.js`** — add the import at the top:
```js
import { openHelp } from './help.js';
```
and near the other listeners:
```js
document.getElementById('help-btn').addEventListener('click', openHelp);
```

- [ ] **Step 4: Style** — append to `manager/manager.css`:
```css
#help-btn { width: 28px; height: 28px; border: 1px solid var(--border); background: var(--bg); color: var(--text); border-radius: 50%; cursor: pointer; }
.help-box { max-width: 460px; }
.help-section { font-weight: 500; margin: 12px 0 4px; }
.help-box ul { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.6; }
.help-box kbd { background: var(--bg-soft); border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; font-size: 12px; }
```

- [ ] **Step 5: Verify** `npm run lint && npm test`. Manual: `?` opens the help panel; Close/Esc/backdrop dismiss it; readable in light and dark.

- [ ] **Step 6: Commit**
```bash
git add manager/manager.html manager/manager.js manager/help.js manager/manager.css
git commit -m "feat: help panel listing features and keyboard shortcuts"
```

---

### Task 6: Version bump + consistency test + docs + merge

**Files:** Modify `manifest.json`, `CHANGELOG.md`, `CHROMEWEBSTORE.md`, `README.md`; Create `tests/version.test.js`

- [ ] **Step 1: Bump `manifest.json`** `"version": "0.4.1"`.

- [ ] **Step 2: Add a version-consistency test** — create `tests/version.test.js` (prevents the 0.2.1 drift from recurring):
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('version consistency', () => {
  const manifest = JSON.parse(readFileSync('manifest.json', 'utf8')).version;
  it('CHROMEWEBSTORE.md documents the manifest version', () => {
    expect(readFileSync('CHROMEWEBSTORE.md', 'utf8')).toContain(`**Version:** ${manifest}`);
  });
  it('CHANGELOG.md has an entry for the manifest version', () => {
    expect(readFileSync('CHANGELOG.md', 'utf8')).toContain(`## [${manifest}]`);
  });
});
```

- [ ] **Step 3: Update `CHROMEWEBSTORE.md`** — set `**Version:** 0.4.1` and add to Version History top:
```
- 0.4.1 — Auto/Light/Dark theme toggle (sidebar now respects dark mode), popup fills height, fixed Suggestions tab, auto-selected first folder, keyboard shortcuts, and an in-app help panel.
```

- [ ] **Step 4: Update `CHANGELOG.md`** — add a new top section:
```
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
```

- [ ] **Step 5: Update `README.md`** Features — add:
```
- Auto/Light/Dark theme, keyboard shortcuts, and an in-app help panel.
```

- [ ] **Step 6: Full verification** `npm run lint && npm test` (version test passes).

- [ ] **Step 7: Full manual pass** — all four bugs fixed; theme toggle; shortcuts; help; no new permissions beyond `commands`; XSS spot-check still holds.

- [ ] **Step 8: Commit**
```bash
git add manifest.json tests/version.test.js CHANGELOG.md CHROMEWEBSTORE.md README.md
git commit -m "docs: v0.4.1 release notes; add version-consistency test"
```

- [ ] **Step 9: Review, merge, tag**
```bash
git switch main
git merge --no-ff feat/v0.4.1-fixes -m "fix+feat: bookmark organizer v0.4.1 — dark-mode toggle, popup layout, Suggestions tab, shortcuts, help"
git tag v0.4.1
```
