# Bookmark Organizer v0.3 — Manager UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the manager as a two-pane file manager — collapsible folder rail with counts (left), selected folder's contents (right) — with a Browse/Suggestions toggle, full drag-and-drop, and automatic dark mode.

**Architecture:** Glue split across focused `manager/` files; all reusable/risky logic stays pure in `src/`. A shared `ctx` object (built in `manager/manager.js`) carries the current tree, tag map, UI state, and action callbacks into the rail/contents/suggestions modules so they stay decoupled. On-device only; permissions unchanged.

**Tech Stack:** Vanilla JS ES modules, MV3, Vitest, ESLint. No bundler. Native HTML5 drag-and-drop.

**Spec:** `docs/superpowers/specs/2026-06-13-bookmark-organizer-v0.3-ui-overhaul-design.md`.

**Security (every task):** permissions stay `["bookmarks","storage","favicon","sidePanel"]`; no network/host perms; no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`eval`; render via `createElement`/`textContent`; `href`/favicon only when `isSafeUrl`; AI output sanitized + click-gated; drag id kept in module state, never `dataTransfer` text.

**Prerequisite/branching:** v0.2.1 is on `main`. Task 1 creates `feat/v0.3-ui-overhaul` off `main`. Run `npm test` + `npm run lint` before each commit; end commit messages with a blank line then `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

**File structure:**

| Path | Change | Responsibility |
|---|---|---|
| `src/tree.js` | MODIFY | + `isDescendant`, `dropIndex` (pure, TDD) |
| `manager/modal.js` | CREATE | `confirmModal(title, body) → Promise<boolean>` |
| `manager/suggestions-view.js` | CREATE | `renderSuggestions(container, ctx)` — the Analyze feature |
| `manager/folder-rail.js` | CREATE | `renderRail(container, ctx)` — rail, collapse, counts, selection, folder DnD |
| `manager/contents.js` | CREATE | `renderContents(container, ctx)` — bookmarks, sort, tags, bookmark DnD/reorder |
| `manager/manager.js` | REWRITE | bootstrap, view toggle, search, `ctx`, `refresh()` |
| `manager/manager.html` | REWRITE | two-pane shell + toggle + search |
| `manager/manager.css` | REWRITE | shell styles + dark mode via `prefers-color-scheme` |
| `tests/tree.test.js` | MODIFY | tests for `isDescendant`, `dropIndex` |

---

### Task 1: Pure helpers — `isDescendant`, `dropIndex`

**Files:** Modify `src/tree.js`; Test `tests/tree.test.js`

- [ ] **Step 1: Branch**

```bash
git switch -c feat/v0.3-ui-overhaul
```

- [ ] **Step 2: Add failing tests** — append to `tests/tree.test.js`:

```js
import { isDescendant, dropIndex } from '../src/tree.js';

const descTree = [{ id: '0', title: '', children: [
  { id: '1', title: 'Bar', children: [
    { id: '10', title: 'Dev', children: [
      { id: '100', title: 'JS', children: [] }
    ] },
    { id: '11', title: 'News', children: [] }
  ] }
] }];

describe('isDescendant', () => {
  it('is true for the same id', () => {
    expect(isDescendant(descTree, '10', '10')).toBe(true);
  });
  it('is true for a direct or deep descendant', () => {
    expect(isDescendant(descTree, '1', '10')).toBe(true);
    expect(isDescendant(descTree, '1', '100')).toBe(true);
  });
  it('is false for non-descendants', () => {
    expect(isDescendant(descTree, '10', '11')).toBe(false);
    expect(isDescendant(descTree, '100', '1')).toBe(false);
  });
  it('is false when the ancestor id is unknown', () => {
    expect(isDescendant(descTree, 'nope', '10')).toBe(false);
  });
});

describe('dropIndex', () => {
  const order = ['a', 'b', 'c', 'd'];
  it('drops before a middle item', () => {
    expect(dropIndex(order, 'a', 'c')).toBe(1);
  });
  it('drops before the first item', () => {
    expect(dropIndex(order, 'c', 'a')).toBe(0);
  });
  it('drops at the end when beforeId is null', () => {
    expect(dropIndex(order, 'a', null)).toBe(3);
  });
  it('drops at the end when beforeId is unknown', () => {
    expect(dropIndex(order, 'a', 'zzz')).toBe(3);
  });
});
```

- [ ] **Step 3: Run — expect FAIL** (`isDescendant is not a function`)

Run: `npx vitest run tests/tree.test.js`

- [ ] **Step 4: Append to `src/tree.js`**

```js
function findNode(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function subtreeHas(node, id) {
  if (node.id === id) return true;
  for (const c of node.children ?? []) {
    if (subtreeHas(c, id)) return true;
  }
  return false;
}

export function isDescendant(tree, ancestorId, nodeId) {
  if (ancestorId === nodeId) return true;
  const ancestor = findNode(tree, ancestorId);
  return ancestor ? subtreeHas(ancestor, nodeId) : false;
}

export function dropIndex(orderedIds, draggedId, beforeId) {
  const without = orderedIds.filter(id => id !== draggedId);
  if (beforeId == null) return without.length;
  const idx = without.indexOf(beforeId);
  return idx === -1 ? without.length : idx;
}
```

- [ ] **Step 5: Run — expect PASS**, then `npm test` and `npm run lint`.

- [ ] **Step 6: Commit**

```bash
git add src/tree.js tests/tree.test.js
git commit -m "feat: isDescendant and dropIndex helpers for drag-and-drop"
```

---

### Task 2: Extract `manager/modal.js`

**Files:** Create `manager/modal.js`; Modify `manager/manager.js`

The current `confirmModal` lives inline in `manager/manager.js`. Move it verbatim into its own module so the new modules can share it. No behavior change.

- [ ] **Step 1: Create `manager/modal.js`** — copy the existing `confirmModal` function body and export it:

```js
export function confirmModal(title, body) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const box = document.createElement('div');
    box.className = 'modal-box';
    const h = document.createElement('h3');
    h.textContent = title;
    const p = document.createElement('p');
    p.textContent = body;
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    const confirm = document.createElement('button');
    confirm.textContent = 'Delete';
    confirm.className = 'danger';

    function onKey(e) { if (e.key === 'Escape') close(false); }
    function close(result) {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }
    cancel.addEventListener('click', () => close(false));
    confirm.addEventListener('click', () => close(true));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', onKey);

    actions.append(cancel, confirm);
    box.append(h, p, actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    confirm.focus();
  });
}
```

- [ ] **Step 2: In `manager/manager.js`** delete the inline `function confirmModal(...) { ... }` definition and add at the top (with the other imports):

```js
import { confirmModal } from './modal.js';
```

- [ ] **Step 3: Verify** `npm run lint && npm test` (clean / 62 pass — pure tests unaffected). Manual: Analyze → a delete suggestion still opens the modal.

- [ ] **Step 4: Commit**

```bash
git add manager/modal.js manager/manager.js
git commit -m "refactor: extract confirmModal into manager/modal.js"
```

---

### Task 3: Extract `manager/suggestions-view.js`

**Files:** Create `manager/suggestions-view.js`; Modify `manager/manager.js`

Move the entire analyze handler into a module exposing `renderSuggestions(container, ctx)`, where `ctx` provides `{ refresh, confirm, getTagMap, setTagMap, saveTags }`. This isolates the Analyze feature ahead of the shell rewrite. Logic is unchanged from v0.2.1.

- [ ] **Step 1: Create `manager/suggestions-view.js`**

```js
import { flattenBookmarks, listFolders, findEmptyFolders, countContents } from '../src/tree.js';
import { findDuplicates, findMergeableFolders } from '../src/suggestions.js';
import { suggestFolder, suggestTags, suggestReorg, defaultSessionFactory } from '../src/ai.js';
import { addTag, tagsFor, allTags } from '../src/tags.js';

export async function renderSuggestions(container, ctx) {
  container.replaceChildren();
  const output = document.createElement('div');
  output.id = 'suggestions-output';
  container.appendChild(output);

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
        const applied = await action();
        if (applied === false) { btn.disabled = false; return; }
        div.remove();
        // Do NOT re-run analyze here — just drop the applied card. The Browse
        // view refreshes from storage when the user switches back to it.
      });
      div.appendChild(btn);
    }
    output.appendChild(div);
  }

  const tree = await chrome.bookmarks.getTree();
  const flat = flattenBookmarks(tree);
  const folders = listFolders(tree);
  let tagMap = ctx.getTagMap();

  for (const group of findDuplicates(flat)) {
    const extras = group.slice(1);
    addSuggestion(
      `Duplicate: "${group[0].title}" appears ${group.length} times (keeps 1, removes ${extras.length}).`,
      `Remove ${extras.length} duplicate(s)`,
      async () => {
        const ok = await ctx.confirm('Remove duplicates?',
          `Permanently removes ${extras.length} duplicate bookmark(s), keeping one copy. This can't be undone.`);
        if (!ok) return false;
        for (const b of extras) await chrome.bookmarks.remove(b.id);
      }
    );
  }

  for (const folder of findEmptyFolders(tree)) {
    addSuggestion(
      `Empty folder: "${folder.title}" (0 bookmarks).`,
      'Delete folder',
      async () => {
        const ok = await ctx.confirm('Delete empty folder?',
          `Deletes the empty folder "${folder.title}". This can't be undone.`);
        if (!ok) return false;
        await chrome.bookmarks.remove(folder.id);
      }
    );
  }

  const rootIds = new Set((tree[0].children ?? []).map(n => n.id));
  for (const group of findMergeableFolders(folders)) {
    const mergeable = group.filter(f => !rootIds.has(f.id));
    if (mergeable.length < 2) continue;
    const [target, ...rest] = mergeable;
    const movedCount = rest.reduce((n, f) => n + countContents(f).bookmarks, 0);
    addSuggestion(
      `Merge ${mergeable.length} folders named "${target.title}" — moves ${movedCount} bookmark(s), deletes ${rest.length} folder(s).`,
      'Merge folders',
      async () => {
        const ok = await ctx.confirm('Merge folders?',
          `Moves ${movedCount} bookmark(s) into "${target.title}" and deletes ${rest.length} now-empty folder(s). This can't be undone.`);
        if (!ok) return false;
        for (const folder of rest) {
          const [sub] = await chrome.bookmarks.getSubTree(folder.id);
          for (const child of sub.children ?? []) {
            await chrome.bookmarks.move(child.id, { parentId: target.id });
          }
          await chrome.bookmarks.remove(folder.id);
        }
      }
    );
  }

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

  const untagged = flat.filter(b => tagsFor(tagMap, b.id).length === 0).slice(0, 10);
  const existingTagNames = allTags(tagMap).map(t => t.tag);
  for (const b of untagged) {
    const tags = await suggestTags(b, existingTagNames, { createSession: defaultSessionFactory });
    if (tags.length) {
      addSuggestion(
        `Tag "${b.title}" with: ${tags.join(', ')}? (AI suggestion)`,
        'Apply tags',
        async () => {
          for (const t of tags) tagMap = addTag(tagMap, b.id, t);
          ctx.setTagMap(tagMap);
          await ctx.saveTags();
        }
      );
    }
  }

  const crowded = folders
    .filter(f => (f.children ?? []).filter(c => c.url).length >= 8)
    .sort((a, b) => (b.children?.length ?? 0) - (a.children?.length ?? 0))[0];
  if (crowded) {
    const items = (crowded.children ?? []).filter(c => c.url);
    const groups = await suggestReorg(crowded.title, items, { createSession: defaultSessionFactory });
    for (const group of groups) {
      addSuggestion(
        `In "${crowded.title}", create subfolder "${group.name}" for ${group.bookmarkIds.length} bookmark(s)? (AI suggestion)`,
        'Create subfolder & move',
        async () => {
          const created = await chrome.bookmarks.create({ parentId: crowded.id, title: group.name });
          for (const id of group.bookmarkIds) await chrome.bookmarks.move(id, { parentId: created.id });
        }
      );
    }
  }

  if (output.childElementCount === 0) {
    addSuggestion('No suggestions — your bookmarks look tidy!', null, null);
  }
}
```

- [ ] **Step 2: Verify** `npm run lint && npm test`. (Wiring happens in Task 7; this step only checks the module parses and lints. The old inline analyze handler in `manager.js` still runs until the rewrite.)

- [ ] **Step 3: Commit**

```bash
git add manager/suggestions-view.js
git commit -m "refactor: move Analyze logic into manager/suggestions-view.js"
```

---

### Task 4: New shell — `manager.html` + `manager.css` (with dark mode)

**Files:** Rewrite `manager/manager.html`, `manager/manager.css`

- [ ] **Step 1: Replace `manager/manager.html`**

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
    <input id="search" type="search" placeholder="Search by topic, title, URL, or tag…">
    <div id="view-toggle" role="tablist">
      <button id="tab-browse" role="tab" aria-selected="true">Browse</button>
      <button id="tab-suggestions" role="tab" aria-selected="false">Suggestions</button>
    </div>
  </header>
  <main>
    <section id="browse-view">
      <aside id="folder-rail" aria-label="Folders"></aside>
      <section id="contents" aria-label="Bookmarks"></section>
    </section>
    <section id="suggestions-view" hidden>
      <button id="run-suggestions">Analyze bookmarks</button>
      <div id="suggestions-container"></div>
    </section>
  </main>
  <script type="module" src="manager.js"></script>
</body>
</html>
```

- [ ] **Step 2: Replace `manager/manager.css`** (CSS variables + `prefers-color-scheme` for dark mode)

```css
:root {
  --bg: #ffffff;
  --bg-soft: #f5f6f8;
  --bg-sel: #e8eefc;
  --text: #222222;
  --text-soft: #888888;
  --border: #dddddd;
  --link: #1a56b0;
  --danger: #c0392b;
  --chip-bg: #eef2ff;
  --chip-text: #3349a8;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1e1f22;
    --bg-soft: #2a2c30;
    --bg-sel: #2f3a52;
    --text: #e6e6e6;
    --text-soft: #9aa0a6;
    --border: #3a3d42;
    --link: #6ea8fe;
    --danger: #e06b5e;
    --chip-bg: #2f3a52;
    --chip-text: #aac4ff;
  }
}

body { margin: 0; font: 14px system-ui, sans-serif; color: var(--text); background: var(--bg); }
header { display: flex; gap: 16px; align-items: center; padding: 12px 20px; border-bottom: 1px solid var(--border); }
header h1 { font-size: 18px; margin: 0; }
#search { flex: 1; max-width: 480px; padding: 6px 10px; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; }
#view-toggle { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
#view-toggle button { border: none; background: var(--bg); color: var(--text); padding: 6px 12px; cursor: pointer; }
#view-toggle button[aria-selected="true"] { background: var(--bg-sel); }

#browse-view { display: grid; grid-template-columns: 260px 1fr; gap: 0; height: calc(100vh - 58px); }
#folder-rail { border-right: 1px solid var(--border); overflow-y: auto; padding: 10px; }
#contents { overflow-y: auto; padding: 14px 20px; }
#suggestions-view { padding: 20px; max-width: 720px; }
#suggestions-container, #suggestions-output { max-height: calc(100vh - 130px); overflow-y: auto; }

.folder-row { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 6px; cursor: pointer; user-select: none; }
.folder-row:hover { background: var(--bg-soft); }
.folder-row.selected { background: var(--bg-sel); }
.folder-row.drop-target { outline: 2px solid var(--link); }
.folder-row.drop-invalid { outline: 2px solid var(--danger); }
.folder-chevron { width: 14px; text-align: center; color: var(--text-soft); }
.folder-count { margin-left: auto; color: var(--text-soft); font-size: 12px; }
.folder-children { margin: 0; padding-left: 16px; list-style: none; }

.content-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.bookmark { display: flex; align-items: center; gap: 8px; padding: 4px 2px; border-bottom: 1px solid var(--border); }
.bookmark.drag-over-top { box-shadow: inset 0 2px 0 var(--link); }
.bookmark a { color: var(--link); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 420px; }
.favicon { vertical-align: middle; }
.drag-handle { cursor: grab; color: var(--text-soft); }

.tag-bar { display: inline-flex; gap: 4px; align-items: center; flex-wrap: wrap; margin-left: 8px; }
.tag-chip { background: var(--chip-bg); color: var(--chip-text); border-radius: 10px; padding: 1px 6px; font-size: 11px; display: inline-flex; align-items: center; gap: 3px; }
.tag-x { border: none; background: none; color: var(--chip-text); cursor: pointer; font-size: 12px; line-height: 1; padding: 0; }
.tag-add, .tag-suggest, .tag-suggestion { border: 1px dashed var(--border); background: none; color: var(--chip-text); border-radius: 10px; padding: 1px 6px; font-size: 11px; cursor: pointer; }
.tag-input { font-size: 11px; padding: 1px 4px; width: 90px; background: var(--bg); color: var(--text); border: 1px solid var(--border); }
.tag-none { color: var(--text-soft); font-size: 11px; }

.suggestion { border: 1px solid var(--border); border-radius: 6px; padding: 8px; margin: 8px 0; }
.suggestion button { margin-top: 4px; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-box { background: var(--bg); color: var(--text); border-radius: 8px; padding: 18px 20px; max-width: 380px; box-shadow: 0 8px 30px rgba(0,0,0,0.3); }
.modal-box h3 { margin: 0 0 8px; font-size: 15px; }
.modal-box p { margin: 0 0 16px; font-size: 13px; line-height: 1.4; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
.modal-actions button { padding: 6px 14px; cursor: pointer; }
.modal-actions .danger { background: var(--danger); color: #fff; border: none; border-radius: 4px; }
```

- [ ] **Step 3: Verify** `npm run lint && npm test` (CSS/HTML don't affect tests; lint covers JS only — still clean).

- [ ] **Step 4: Commit**

```bash
git add manager/manager.html manager/manager.css
git commit -m "feat: two-pane manager shell with view toggle and dark mode"
```

---

### Task 5: Folder rail — `manager/folder-rail.js`

**Files:** Create `manager/folder-rail.js`

`renderRail(container, ctx)` renders the collapsible folder tree. `ctx` provides: `tree`, `uiState` (`{ expanded:Set, selected:string }`), `selectFolder(id)`, `toggleFolder(id)`, and the drag hooks added in Task 8 (`beginFolderDrag`, `folderDrop` — defined here, wired in Task 8). For this task, drag attributes are present but the drop handler is a stub that Task 8 fills; to keep commits self-contained, include the full drag code now.

- [ ] **Step 1: Create `manager/folder-rail.js`**

```js
import { isDescendant } from '../src/tree.js';

function directBookmarkCount(folder) {
  return (folder.children ?? []).filter(c => c.url).length;
}

export function renderRail(container, ctx) {
  container.replaceChildren();
  const roots = ctx.tree[0].children ?? [];
  const ul = document.createElement('ul');
  ul.className = 'folder-children';
  for (const root of roots) ul.appendChild(folderNode(root, ctx));
  container.appendChild(ul);
}

function folderNode(folder, ctx) {
  const li = document.createElement('li');

  const row = document.createElement('div');
  row.className = 'folder-row';
  if (ctx.uiState.selected === folder.id) row.classList.add('selected');

  const hasSubfolders = (folder.children ?? []).some(c => !c.url);
  const expanded = ctx.uiState.expanded.has(folder.id);

  const chevron = document.createElement('span');
  chevron.className = 'folder-chevron';
  chevron.textContent = hasSubfolders ? (expanded ? '▾' : '▸') : '';
  chevron.addEventListener('click', e => { e.stopPropagation(); ctx.toggleFolder(folder.id); });
  row.appendChild(chevron);

  const name = document.createElement('span');
  name.className = 'folder-name';
  name.textContent = folder.title || '(unnamed)';
  row.appendChild(name);

  const count = document.createElement('span');
  count.className = 'folder-count';
  count.textContent = String(directBookmarkCount(folder));
  row.appendChild(count);

  row.addEventListener('click', () => ctx.selectFolder(folder.id));

  // Drag-and-drop (folder as draggable + drop target). Logic in ctx (Task 8).
  row.draggable = true;
  row.addEventListener('dragstart', e => { e.stopPropagation(); ctx.beginDrag(folder.id, 'folder'); });
  row.addEventListener('dragover', e => {
    if (!ctx.canDropOnFolder(folder.id)) { row.classList.add('drop-invalid'); e.preventDefault(); return; }
    row.classList.add('drop-target');
    e.preventDefault();
  });
  row.addEventListener('dragleave', () => { row.classList.remove('drop-target', 'drop-invalid'); });
  row.addEventListener('drop', async e => {
    e.preventDefault();
    row.classList.remove('drop-target', 'drop-invalid');
    await ctx.dropOnFolder(folder.id);
  });

  li.appendChild(row);

  if (hasSubfolders && expanded) {
    const childUl = document.createElement('ul');
    childUl.className = 'folder-children';
    for (const child of folder.children) {
      if (!child.url) childUl.appendChild(folderNode(child, ctx));
    }
    li.appendChild(childUl);
  }
  return li;
}
```

- [ ] **Step 2: Verify** `npm run lint && npm test` (module parses/lints; wired in Task 7).

- [ ] **Step 3: Commit**

```bash
git add manager/folder-rail.js
git commit -m "feat: collapsible folder rail with counts and selection"
```

---

### Task 6: Contents pane — `manager/contents.js`

**Files:** Create `manager/contents.js`

`renderContents(container, ctx)` renders either the selected folder's bookmarks or, when `ctx.search` is set, a flat result list. Carries over favicons, the tag chips + inline tag editor, the move-to fallback, and per-folder sort. Bookmark drag attributes included now; drop math wired in Task 8 via `ctx`.

- [ ] **Step 1: Create `manager/contents.js`**

```js
import { isSafeUrl, faviconParams } from '../src/url-utils.js';
import { sortChildren, SORT_MODES } from '../src/sorting.js';
import { searchBookmarks } from '../src/search.js';
import { flattenBookmarks, listFolders } from '../src/tree.js';
import { addTag, removeTag, tagsFor, allTags } from '../src/tags.js';
import { suggestTags, defaultSessionFactory } from '../src/ai.js';

const SORT_LABELS = { alphabetical: 'A–Z', dateAdded: 'Newest first', domain: 'By domain' };

export function renderContents(container, ctx) {
  container.replaceChildren();

  if (ctx.search && ctx.search.trim()) {
    const flat = flattenBookmarks(ctx.tree);
    const matches = searchBookmarks(flat, ctx.search, ctx.getTagMap());
    const folders = listFolders(ctx.tree);
    if (matches.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No matches.';
      container.appendChild(empty);
      return;
    }
    for (const b of matches) container.appendChild(bookmarkRow(b, folders, ctx, { withPath: true, draggable: false }));
    return;
  }

  const folder = findFolder(ctx.tree, ctx.uiState.selected);
  if (!folder) {
    const hint = document.createElement('p');
    hint.textContent = 'Select a folder.';
    container.appendChild(hint);
    return;
  }

  const toolbar = document.createElement('div');
  toolbar.className = 'content-toolbar';
  const title = document.createElement('strong');
  title.textContent = folder.title || '(unnamed)';
  toolbar.appendChild(title);
  const sortSel = document.createElement('select');
  const ph = document.createElement('option'); ph.value = ''; ph.textContent = 'Sort…'; sortSel.appendChild(ph);
  for (const mode of SORT_MODES) {
    const opt = document.createElement('option'); opt.value = mode; opt.textContent = SORT_LABELS[mode]; sortSel.appendChild(opt);
  }
  sortSel.addEventListener('change', async () => {
    if (!sortSel.value) return;
    const sorted = sortChildren(folder.children ?? [], sortSel.value);
    for (let i = 0; i < sorted.length; i++) {
      await chrome.bookmarks.move(sorted[i].id, { parentId: folder.id, index: i });
    }
    await ctx.refresh();
  });
  toolbar.appendChild(sortSel);
  container.appendChild(toolbar);

  const folders = listFolders(ctx.tree);
  for (const child of folder.children ?? []) {
    if (child.url) container.appendChild(bookmarkRow(child, folders, ctx, { withPath: false, draggable: true }));
  }
}

function findFolder(tree, id) {
  let found = null;
  const stack = [...tree];
  while (stack.length) {
    const n = stack.pop();
    if (!n.url && n.id === id) { found = n; break; }
    if (n.children) stack.push(...n.children);
  }
  return found;
}

function bookmarkRow(node, allFolders, ctx, { withPath, draggable }) {
  const li = document.createElement('div');
  li.className = 'bookmark';

  if (draggable) {
    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⋮⋮';
    li.appendChild(handle);
    li.draggable = true;
    li.addEventListener('dragstart', () => ctx.beginDrag(node.id, 'bookmark'));
    li.addEventListener('dragover', e => { e.preventDefault(); li.classList.add('drag-over-top'); });
    li.addEventListener('dragleave', () => li.classList.remove('drag-over-top'));
    li.addEventListener('drop', async e => {
      e.preventDefault();
      li.classList.remove('drag-over-top');
      await ctx.dropBeforeBookmark(node.id);
    });
  }

  if (isSafeUrl(node.url)) {
    const icon = document.createElement('img');
    icon.className = 'favicon'; icon.width = 16; icon.height = 16; icon.alt = '';
    icon.src = chrome.runtime.getURL(faviconParams(node.url, 16));
    li.appendChild(icon);
    const a = document.createElement('a');
    a.textContent = node.title || node.url;
    a.href = node.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    li.appendChild(a);
  } else {
    const span = document.createElement('span');
    span.textContent = `${node.title || node.url} (blocked: unsafe URL)`;
    li.appendChild(span);
  }

  if (withPath && node.path) {
    const path = document.createElement('span');
    path.className = 'folder-count';
    path.textContent = node.path;
    li.appendChild(path);
  }

  const move = document.createElement('select');
  move.className = 'move-select';
  const mph = document.createElement('option'); mph.value = ''; mph.textContent = 'Move to…'; move.appendChild(mph);
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
    await ctx.refresh();
  });
  li.appendChild(move);

  li.appendChild(tagBar(node, ctx));
  return li;
}

function tagBar(node, ctx) {
  const bar = document.createElement('span');
  bar.className = 'tag-bar';
  let tagMap = ctx.getTagMap();
  for (const tag of tagsFor(tagMap, node.id)) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = tag;
    const x = document.createElement('button');
    x.className = 'tag-x'; x.textContent = '×'; x.title = `Remove tag "${tag}"`;
    x.addEventListener('click', async () => {
      ctx.setTagMap(removeTag(ctx.getTagMap(), node.id, tag));
      await ctx.saveTags();
      await ctx.refresh();
    });
    chip.appendChild(x);
    bar.appendChild(chip);
  }
  const addBtn = document.createElement('button');
  addBtn.className = 'tag-add'; addBtn.textContent = '+ tag';
  addBtn.addEventListener('click', () => openTagEditor(node, bar, addBtn, ctx));
  bar.appendChild(addBtn);
  return bar;
}

async function commitTag(node, value, ctx) {
  ctx.setTagMap(addTag(ctx.getTagMap(), node.id, value));
  await ctx.saveTags();
  await ctx.refresh();
}

function openTagEditor(node, bar, addBtn, ctx) {
  addBtn.remove();
  const editor = document.createElement('span');
  editor.className = 'tag-editor';
  const input = document.createElement('input');
  input.type = 'text'; input.className = 'tag-input'; input.placeholder = 'tag…';
  const listId = `tags-${node.id}`;
  input.setAttribute('list', listId);
  const datalist = document.createElement('datalist');
  datalist.id = listId;
  for (const { tag } of allTags(ctx.getTagMap())) {
    if (tagsFor(ctx.getTagMap(), node.id).includes(tag)) continue;
    const opt = document.createElement('option'); opt.value = tag; datalist.appendChild(opt);
  }
  input.addEventListener('keydown', async e => {
    if (e.key === 'Enter' && input.value.trim()) await commitTag(node, input.value, ctx);
    else if (e.key === 'Escape') await ctx.refresh();
  });
  const suggestBtn = document.createElement('button');
  suggestBtn.className = 'tag-suggest'; suggestBtn.textContent = '✨ Suggest';
  suggestBtn.addEventListener('click', async () => {
    suggestBtn.disabled = true; suggestBtn.textContent = '…';
    const existing = allTags(ctx.getTagMap()).map(t => t.tag);
    const tags = await suggestTags(node, existing, { createSession: defaultSessionFactory });
    suggestBtn.remove();
    if (tags.length === 0) {
      const none = document.createElement('span'); none.className = 'tag-none'; none.textContent = '(no AI suggestions)';
      editor.appendChild(none); return;
    }
    for (const tag of tags) {
      if (tagsFor(ctx.getTagMap(), node.id).includes(tag)) continue;
      const chip = document.createElement('button');
      chip.className = 'tag-suggestion'; chip.textContent = `+ ${tag}`;
      chip.addEventListener('click', async () => { await commitTag(node, tag, ctx); });
      editor.appendChild(chip);
    }
  });
  editor.append(input, datalist, suggestBtn);
  bar.appendChild(editor);
  input.focus();
}
```

- [ ] **Step 2: Verify** `npm run lint && npm test`.

- [ ] **Step 3: Commit**

```bash
git add manager/contents.js
git commit -m "feat: contents pane with favicons, tags, sort, move fallback"
```

---

### Task 7: Wire it together — rewrite `manager/manager.js`

**Files:** Rewrite `manager/manager.js`

Builds `ctx`, owns `refresh()`, the tag map, UI state persistence, view toggle, and search. Drag callbacks (`beginDrag`, `canDropOnFolder`, `dropOnFolder`, `dropBeforeBookmark`) are stubbed minimally here and completed in Task 8 — to keep this task's commit working, include their full implementations now.

- [ ] **Step 1: Replace `manager/manager.js` entirely**

```js
import { renderRail } from './folder-rail.js';
import { renderContents } from './contents.js';
import { renderSuggestions } from './suggestions-view.js';
import { confirmModal } from './modal.js';
import { isDescendant, dropIndex, listFolders } from '../src/tree.js';

const railEl = document.getElementById('folder-rail');
const contentsEl = document.getElementById('contents');
const browseView = document.getElementById('browse-view');
const suggestionsView = document.getElementById('suggestions-view');
const suggestionsContainer = document.getElementById('suggestions-container');
const searchEl = document.getElementById('search');
const tabBrowse = document.getElementById('tab-browse');
const tabSuggestions = document.getElementById('tab-suggestions');
const analyzeBtn = document.getElementById('run-suggestions');

let tagMap = {};
let uiState = { expanded: new Set(), selected: '' };
let tree = [];
let search = '';
let drag = null; // { id, kind }

async function loadState() {
  const { tags = {}, uiState: saved = {} } = await chrome.storage.local.get(['tags', 'uiState']);
  tagMap = tags;
  uiState.expanded = new Set(saved.expanded ?? []);
  uiState.selected = saved.selected ?? '';
}

async function saveTags() { await chrome.storage.local.set({ tags: tagMap }); }
async function saveUiState() {
  await chrome.storage.local.set({ uiState: { expanded: [...uiState.expanded], selected: uiState.selected } });
}

const ctx = {
  get tree() { return tree; },
  get uiState() { return uiState; },
  get search() { return search; },
  getTagMap: () => tagMap,
  setTagMap: m => { tagMap = m; },
  saveTags,
  refresh,
  confirm: confirmModal,
  async selectFolder(id) { uiState.selected = id; await saveUiState(); renderContents(contentsEl, ctx); renderRail(railEl, ctx); },
  async toggleFolder(id) {
    if (uiState.expanded.has(id)) uiState.expanded.delete(id); else uiState.expanded.add(id);
    await saveUiState(); renderRail(railEl, ctx);
  },
  beginDrag(id, kind) { drag = { id, kind }; },
  canDropOnFolder(targetId) {
    if (!drag) return false;
    if (drag.kind === 'folder') return !isDescendant(tree, drag.id, targetId);
    return true;
  },
  async dropOnFolder(targetId) {
    if (!drag || !ctx.canDropOnFolder(targetId)) { drag = null; return; }
    await chrome.bookmarks.move(drag.id, { parentId: targetId });
    drag = null;
    await refresh();
  },
  async dropBeforeBookmark(beforeId) {
    if (!drag || drag.kind !== 'bookmark' || drag.id === beforeId) { drag = null; return; }
    const folder = listFolders(tree).find(f => f.id === uiState.selected);
    const orderedIds = (folder?.children ?? []).filter(c => c.url).map(c => c.id);
    const index = dropIndex(orderedIds, drag.id, beforeId);
    await chrome.bookmarks.move(drag.id, { parentId: uiState.selected, index });
    drag = null;
    await refresh();
  }
};

async function refresh() {
  tree = await chrome.bookmarks.getTree();
  await loadState();
  // prune selected/expanded against existing folders
  const ids = new Set(listFolders(tree).map(f => f.id));
  if (uiState.selected && !ids.has(uiState.selected)) uiState.selected = '';
  uiState.expanded = new Set([...uiState.expanded].filter(id => ids.has(id)));
  renderRail(railEl, ctx);
  renderContents(contentsEl, ctx);
}

async function showBrowse() {
  browseView.hidden = false; suggestionsView.hidden = true;
  tabBrowse.setAttribute('aria-selected', 'true'); tabSuggestions.setAttribute('aria-selected', 'false');
  await refresh();
}
function showSuggestions() {
  browseView.hidden = true; suggestionsView.hidden = false;
  tabBrowse.setAttribute('aria-selected', 'false'); tabSuggestions.setAttribute('aria-selected', 'true');
}

tabBrowse.addEventListener('click', showBrowse);
tabSuggestions.addEventListener('click', showSuggestions);
analyzeBtn.addEventListener('click', () => {
  analyzeBtn.disabled = true; analyzeBtn.textContent = 'Analyzing…';
  renderSuggestions(suggestionsContainer, ctx)
    .catch(err => { suggestionsContainer.textContent = `Analysis failed: ${err.message}`; })
    .finally(() => { analyzeBtn.disabled = false; analyzeBtn.textContent = 'Analyze bookmarks'; });
});
searchEl.addEventListener('input', () => { search = searchEl.value; renderContents(contentsEl, ctx); });

refresh().catch(err => { contentsEl.textContent = `Failed to load bookmarks: ${err.message}`; });
```

- [ ] **Step 2: Verify** `npm run lint && npm test` (62 pass, lint clean).

- [ ] **Step 3: Manual smoke test** — reload extension, open manager:
  1. Folder rail lists folders with counts; chevrons expand/collapse; selection highlights and loads contents; reopening the manager restores expansion + selection.
  2. Contents shows favicons, links, tags, sort, move-to.
  3. Search filters to a flat list with paths; clearing restores the folder.
  4. Browse/Suggestions toggle works; Analyze renders suggestions; apply + confirm modal work.

- [ ] **Step 4: Commit**

```bash
git add manager/manager.js
git commit -m "feat: wire two-pane manager — rail, contents, suggestions, search, toggle, DnD"
```

---

### Task 8: Verify drag-and-drop end to end

**Files:** none new — Tasks 5–7 already include the DnD code. This task is dedicated verification + any fixes.

- [ ] **Step 1: Manual DnD verification** (reload extension):
  1. **Bookmark → folder:** drag a bookmark row onto a different rail folder → it moves; contents + counts update.
  2. **Reorder:** drag a bookmark onto another bookmark in the same folder → it lands before that bookmark (verify order in Chrome's native manager).
  3. **Folder → folder:** drag a rail folder onto another folder → it nests inside.
  4. **Cycle rejected:** drag a parent folder onto its own child → the row shows the red `drop-invalid` outline and nothing moves.
  5. **Drop on self:** dragging a bookmark onto itself does nothing.

- [ ] **Step 2: If any DnD step misbehaves**, use superpowers:systematic-debugging. Common checks: `drag` state cleared after each drop; `canDropOnFolder` consulted in both `dragover` and `dropOnFolder`; `dropIndex` fed the *current* ordered ids of the selected folder.

- [ ] **Step 3: Re-run** `npm run lint && npm test` and commit any fixes.

```bash
git add -A
git commit -m "fix: drag-and-drop edge cases from manual verification"
```
(Skip the commit if no fixes were needed.)

---

### Task 9: Docs, final review, merge

**Files:** Modify `README.md`, `CHROMEWEBSTORE.md`

- [ ] **Step 1: `CHROMEWEBSTORE.md`** — set `**Version:** 0.3.0` and add to Version History top:
```
- 0.3.0 — Two-pane manager: collapsible folder rail with counts, drag-and-drop (bookmarks and folders), Browse/Suggestions toggle, automatic dark mode.
```

- [ ] **Step 2: `README.md`** — add to Features:
```
- Two-pane manager with a collapsible folder rail, bookmark counts, and drag-and-drop.
- Automatic dark mode that follows your system setting.
```

- [ ] **Step 3: Full verification** — `npm run lint && npm test` (all pure suites pass, incl. `isDescendant`/`dropIndex`).

- [ ] **Step 4: Full manual pass** — rail/counts/persistence; contents/sort/tags; search; all three drag types incl. rejected cycle; Browse/Suggestions; dark mode (toggle OS theme); XSS spot-check (a `javascript:` bookmark stays inert, no favicon, no link).

- [ ] **Step 5: Commit docs**

```bash
git add README.md CHROMEWEBSTORE.md
git commit -m "docs: v0.3 two-pane manager and dark mode"
```

- [ ] **Step 6: Code review** — superpowers:requesting-code-review on the `feat/v0.3-ui-overhaul` diff vs `main`. Address findings.

- [ ] **Step 7: Merge and tag**

```bash
git switch main
git merge --no-ff feat/v0.3-ui-overhaul -m "feat: bookmark organizer v0.3 — two-pane manager, drag-and-drop, dark mode"
git tag v0.3.0
```
