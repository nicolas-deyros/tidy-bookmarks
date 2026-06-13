# Bookmark Organizer v0.2.1 — Safety & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a confirm-before-delete safety modal with blast-radius detail, richer suggestion text, viewport-based heights, a real extension icon, and an inline tag editor with existing-tag autocomplete plus on-device AI tag suggestions.

**Architecture:** Unchanged from v0.1/v0.2 — pure logic in `src/` (unit-tested, no chrome/DOM), thin glue in `popup/` and `manager/`. New pure helper: `countContents` in `src/tree.js`. New glue: a confirm modal and an inline tag editor in `manager/manager.js`. A build-time-only Node script generates icon PNGs (run once, output committed). Still fully on-device: no network, no host permissions.

**Tech Stack:** Vanilla JS (ES modules), Manifest V3, Vitest, ESLint. Icon generation uses Node's built-in `zlib` only (no new dependencies).

**Security/contract (unchanged):** permissions stay `["bookmarks","storage","favicon","sidePanel"]`. No network, no host permissions, no `innerHTML`/`eval`. `isSafeUrl` still gates every link/favicon. AI output still sanitized + applied only on explicit click.

**Prerequisite / branching:** Assumes v0.2 is merged to `main`. Task 1 creates `feat/v0.2.1-safety-polish` off `main`. Run `npm test` and `npm run lint` before every commit. End each commit message with a blank line then `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

**Existing code this builds on:**
- `src/tree.js` — `flattenBookmarks`, `listFolders`, `findEmptyFolders` (folders carry `children`)
- `src/tags.js` — `sanitizeTag`, `addTag`, `removeTag`, `tagsFor`, `allTags`, `pruneTags`
- `src/ai.js` — `suggestTags(bookmark, existingTags, { createSession })`, `defaultSessionFactory`
- `manager/manager.js` — `refresh`, `renderBookmark`, the `addSuggestion` helper, and the analyze handler with duplicate / empty-folder / merge / AI-move / AI-tag / reorg cards. The tag editor currently uses `window.prompt`.

**File structure (new and modified):**

| Path | Responsibility |
|---|---|
| `scripts/make-icons.mjs` | NEW. Build-time PNG icon generator (zlib only) |
| `icons/icon-16.png`, `icon-48.png`, `icon-128.png` | NEW. Generated icon files (committed) |
| `manifest.json` | MODIFY. Reference icons; bump to 0.2.1 |
| `src/tree.js` | MODIFY. Add `countContents` |
| `manager/manager.js` | MODIFY. Confirm modal, cancel-aware `addSuggestion`, richer detail, inline tag editor |
| `manager/manager.css` | MODIFY. Modal + tag-editor + viewport-height styles |
| `popup/popup.css` | MODIFY. Viewport-based results height |
| `package.json` | MODIFY. Add `make-icons` script |
| `tests/tree.test.js` | MODIFY. Tests for `countContents` |
| `README.md`, `CHROMEWEBSTORE.md` | MODIFY. Version + feature notes |

---

### Task 1: Branch + real extension icons

**Files:**
- Create: `scripts/make-icons.mjs`, `icons/icon-16.png`, `icons/icon-48.png`, `icons/icon-128.png`
- Modify: `manifest.json`, `package.json`

- [ ] **Step 1: Create the branch from main**

```bash
git switch -c feat/v0.2.1-safety-polish
```

- [ ] **Step 2: Create `scripts/make-icons.mjs`** (generates a flat indigo rounded-square with a white bookmark ribbon, at 16/48/128px, using only Node built-ins)

```js
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function drawIcon(size) {
  const px = new Uint8Array(size * size * 4);
  const r = size * 0.18;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = Math.min(Math.max(x, r), size - 1 - r);
      const cy = Math.min(Math.max(y, r), size - 1 - r);
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r * r) { px[i + 3] = 0; continue; }
      const u = x / size, v = y / size;
      let ribbon = u >= 0.34 && u <= 0.66 && v >= 0.22 && v <= 0.80;
      if (ribbon && v >= 0.62) {
        const cut = ((0.80 - v) / (0.80 - 0.62)) * 0.16;
        if (Math.abs(u - 0.5) < cut) ribbon = false;
      }
      if (ribbon) { px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = 255; }
      else { px[i] = 51; px[i + 1] = 73; px[i + 2] = 168; px[i + 3] = 255; }
    }
  }
  return px;
}

function makePng(size) {
  const px = drawIcon(size);
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(px.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const idat = deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

mkdirSync('icons', { recursive: true });
for (const size of [16, 48, 128]) {
  writeFileSync(`icons/icon-${size}.png`, makePng(size));
  console.log(`wrote icons/icon-${size}.png`);
}
```

- [ ] **Step 3: Add the build script to `package.json`** — add to the `scripts` block:

```json
    "make-icons": "node scripts/make-icons.mjs",
```
(Place it after the existing `lint` script line; remember the trailing comma on the previous line if needed so the JSON stays valid.)

- [ ] **Step 4: Generate the icons**

Run: `npm run make-icons`
Expected output:
```
wrote icons/icon-16.png
wrote icons/icon-48.png
wrote icons/icon-128.png
```
Verify they are valid PNGs (non-empty, PNG signature):
```bash
node -e "const fs=require('fs');for(const s of[16,48,128]){const b=fs.readFileSync('icons/icon-'+s+'.png');if(b.length<8||b[0]!==137||b[1]!==80)throw new Error('bad png '+s);console.log('icon-'+s+'.png ok',b.length,'bytes');}"
```
Expected: three `ok` lines.

- [ ] **Step 5: Reference icons in `manifest.json`** — replace the whole file with:

```json
{
  "manifest_version": 3,
  "name": "Bookmark Organizer",
  "version": "0.2.1",
  "description": "Search, sort, tag, and reorganize your bookmarks with private on-device AI suggestions.",
  "permissions": ["bookmarks", "storage", "favicon", "sidePanel"],
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "side_panel": {
    "default_path": "popup/popup.html"
  }
}
```

- [ ] **Step 6: Verify and commit**

Run: `npm run lint && npm test` (expect clean / 60 pass) and `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'));console.log('manifest ok')"`.

```bash
git add scripts/make-icons.mjs icons/icon-16.png icons/icon-48.png icons/icon-128.png manifest.json package.json
git commit -m "feat: generated extension icons (zlib-only build script)"
```

---

### Task 2: `countContents` — deletion blast radius (`src/tree.js`)

**Files:**
- Modify: `src/tree.js`
- Test: `tests/tree.test.js`

- [ ] **Step 1: Add failing tests** — append to `tests/tree.test.js`:

```js
import { countContents } from '../src/tree.js';

describe('countContents', () => {
  it('counts descendant bookmarks and folders recursively', () => {
    const folder = { id: 'f', title: 'Dev', children: [
      { id: 'b1', title: 'A', url: 'https://a.com' },
      { id: 'sub', title: 'Sub', children: [
        { id: 'b2', title: 'B', url: 'https://b.com' },
        { id: 'b3', title: 'C', url: 'https://c.com' }
      ] }
    ] };
    expect(countContents(folder)).toEqual({ bookmarks: 3, folders: 1 });
  });
  it('returns zeros for an empty folder', () => {
    expect(countContents({ id: 'e', title: 'Empty', children: [] })).toEqual({ bookmarks: 0, folders: 0 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`countContents is not a function`)

Run: `npx vitest run tests/tree.test.js`

- [ ] **Step 3: Append `countContents` to `src/tree.js`**

```js
export function countContents(folder) {
  let bookmarks = 0;
  let folders = 0;
  for (const child of folder.children ?? []) {
    if (child.url) {
      bookmarks++;
    } else {
      folders++;
      const sub = countContents(child);
      bookmarks += sub.bookmarks;
      folders += sub.folders;
    }
  }
  return { bookmarks, folders };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run tests/tree.test.js`, then `npm test` and `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/tree.js tests/tree.test.js
git commit -m "feat: countContents helper for deletion impact text"
```

---

### Task 3: Confirm-delete modal + cancel-aware suggestions + richer detail

**Files:**
- Modify: `manager/manager.js`, `manager/manager.css`

Glue only (no unit tests; verified manually). Adds a reusable confirm modal, makes `addSuggestion` respect a cancelled action, and wires every destructive action through the modal with blast-radius text.

- [ ] **Step 1: Add `countContents` to the tree import in `manager/manager.js`** — change:
```js
import { flattenBookmarks, listFolders, findEmptyFolders } from '../src/tree.js';
```
to:
```js
import { flattenBookmarks, listFolders, findEmptyFolders, countContents } from '../src/tree.js';
```

- [ ] **Step 2: Add the modal helper** — insert immediately above the `function addSuggestion(` line:

```js
function confirmModal(title, body) {
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

- [ ] **Step 3: Make `addSuggestion` honor a cancelled action** — replace the existing click handler inside `addSuggestion`:
```js
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await action();
      div.remove();
      await refresh();
    });
```
with:
```js
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const applied = await action();
      if (applied === false) { btn.disabled = false; return; }
      div.remove();
      await refresh();
    });
```
(Non-destructive actions return `undefined` → treated as applied. Destructive actions below return `false` when the user cancels the modal.)

- [ ] **Step 4: Wire the duplicate-removal action through the modal** — replace:
```js
    for (const group of findDuplicates(flat)) {
      const extras = group.slice(1);
      addSuggestion(
        `Duplicate: "${group[0].title}" appears ${group.length} times.`,
        `Remove ${extras.length} duplicate(s)`,
        async () => { for (const b of extras) await chrome.bookmarks.remove(b.id); }
      );
    }
```
with:
```js
    for (const group of findDuplicates(flat)) {
      const extras = group.slice(1);
      addSuggestion(
        `Duplicate: "${group[0].title}" appears ${group.length} times (keeps 1, removes ${extras.length}).`,
        `Remove ${extras.length} duplicate(s)`,
        async () => {
          const ok = await confirmModal(
            'Remove duplicates?',
            `Permanently removes ${extras.length} duplicate bookmark(s), keeping one copy. This can't be undone.`
          );
          if (!ok) return false;
          for (const b of extras) await chrome.bookmarks.remove(b.id);
        }
      );
    }
```

- [ ] **Step 5: Wire the empty-folder deletion through the modal** — replace:
```js
    for (const folder of findEmptyFolders(tree)) {
      addSuggestion(
        `Empty folder: "${folder.title}".`,
        'Delete folder',
        async () => { await chrome.bookmarks.remove(folder.id); }
      );
    }
```
with:
```js
    for (const folder of findEmptyFolders(tree)) {
      addSuggestion(
        `Empty folder: "${folder.title}" (0 bookmarks).`,
        'Delete folder',
        async () => {
          const ok = await confirmModal(
            'Delete empty folder?',
            `Deletes the empty folder "${folder.title}". This can't be undone.`
          );
          if (!ok) return false;
          await chrome.bookmarks.remove(folder.id);
        }
      );
    }
```

- [ ] **Step 6: Wire the folder-merge action through the modal with blast-radius detail** — replace:
```js
      const [target, ...rest] = mergeable;
      addSuggestion(
        `Merge ${mergeable.length} folders named "${target.title}" into one.`,
        'Merge folders',
        async () => {
          for (const folder of rest) {
            const [sub] = await chrome.bookmarks.getSubTree(folder.id);
            for (const child of sub.children ?? []) {
              await chrome.bookmarks.move(child.id, { parentId: target.id });
            }
            await chrome.bookmarks.remove(folder.id);
          }
        }
      );
```
with:
```js
      const [target, ...rest] = mergeable;
      const movedCount = rest.reduce((n, f) => n + countContents(f).bookmarks, 0);
      addSuggestion(
        `Merge ${mergeable.length} folders named "${target.title}" — moves ${movedCount} bookmark(s), deletes ${rest.length} folder(s).`,
        'Merge folders',
        async () => {
          const ok = await confirmModal(
            'Merge folders?',
            `Moves ${movedCount} bookmark(s) into "${target.title}" and deletes ${rest.length} now-empty folder(s). This can't be undone.`
          );
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
```

- [ ] **Step 7: Add modal styles to `manager/manager.css`** — append:

```css
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-box { background: var(--bg, #fff); color: inherit; border-radius: 8px; padding: 18px 20px; max-width: 380px; box-shadow: 0 8px 30px rgba(0,0,0,0.3); }
.modal-box h3 { margin: 0 0 8px; font-size: 15px; }
.modal-box p { margin: 0 0 16px; font-size: 13px; line-height: 1.4; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
.modal-actions button { padding: 6px 14px; cursor: pointer; }
.modal-actions .danger { background: #c0392b; color: #fff; border: none; border-radius: 4px; }
```

- [ ] **Step 8: Verify and commit**

Run: `npm run lint && npm test` (clean / 60 pass).
Manual (after reload): clicking any "Remove/Delete/Merge" action opens a modal stating the exact impact; Cancel/Escape/backdrop-click leaves the bookmarks untouched and re-enables the card; Delete performs the action and refreshes.

```bash
git add manager/manager.js manager/manager.css
git commit -m "feat: confirm-before-delete modal with blast-radius detail"
```

---

### Task 4: Viewport-based heights

**Files:**
- Modify: `popup/popup.css`, `manager/manager.css`

- [ ] **Step 1: Popup results height** — in `popup/popup.css`, replace:
```css
#results { list-style: none; margin: 0 0 6px; padding: 0; max-height: 320px; overflow-y: auto; }
```
with:
```css
#results { list-style: none; margin: 0 0 6px; padding: 0; max-height: min(70vh, 480px); overflow-y: auto; }
```

- [ ] **Step 2: Manager panels scroll within the viewport** — in `manager/manager.css`, replace:
```css
main { display: grid; grid-template-columns: 320px 1fr; gap: 20px; padding: 20px; }
```
with:
```css
main { display: grid; grid-template-columns: 320px 1fr; gap: 20px; padding: 20px; align-items: start; }
#tree, #suggestions-output { max-height: calc(100vh - 160px); overflow-y: auto; }
```

- [ ] **Step 3: Verify and commit**

Run: `npm run lint && npm test`.
Manual (after reload): popup results area grows with window height (capped); the manager tree and suggestions list each scroll independently instead of forcing one giant page.

```bash
git add popup/popup.css manager/manager.css
git commit -m "feat: viewport-based heights for popup results and manager panels"
```

---

### Task 5: Inline tag editor — autocomplete + AI suggest

**Files:**
- Modify: `manager/manager.js`, `manager/manager.css`

Replaces the `window.prompt` tag flow with an inline editor: a text input with a `<datalist>` of your existing tags (native autocomplete), an Add-on-Enter, and a "✨ Suggest" button that calls the on-device AI and renders clickable suggestion chips.

- [ ] **Step 1: Ensure the needed imports exist in `manager/manager.js`** — the tags import must include `addTag`, `tagsFor`, `allTags`, and the ai import must include `suggestTags`, `defaultSessionFactory`. These were added in v0.2; confirm the two import lines read:
```js
import { suggestFolder, suggestTags, suggestReorg, defaultSessionFactory } from '../src/ai.js';
import { addTag, removeTag, tagsFor, pruneTags, allTags } from '../src/tags.js';
```
If `suggestTags`/`allTags` are missing, add them. (No new modules are imported in this task.)

- [ ] **Step 2: Replace the `addTagBtn` block in `renderBookmark`** — find this block (added in v0.2):
```js
  const addTagBtn = document.createElement('button');
  addTagBtn.className = 'tag-add';
  addTagBtn.textContent = '+ tag';
  addTagBtn.addEventListener('click', async () => {
    const value = window.prompt('Add a tag:');
    if (!value) return;
    tagMap = addTag(tagMap, node.id, value);
    await saveTags();
    await refresh();
  });
  tagBar.appendChild(addTagBtn);
```
and replace it with:
```js
  const addTagBtn = document.createElement('button');
  addTagBtn.className = 'tag-add';
  addTagBtn.textContent = '+ tag';
  addTagBtn.addEventListener('click', () => openTagEditor(node, tagBar, addTagBtn));
  tagBar.appendChild(addTagBtn);
```

- [ ] **Step 3: Add the `openTagEditor` function** — insert it immediately after the `renderBookmark` function (before `async function applySort`):

```js
async function commitTag(node, value) {
  tagMap = addTag(tagMap, node.id, value);
  await saveTags();
  await refresh();
}

function openTagEditor(node, tagBar, addTagBtn) {
  addTagBtn.remove();

  const editor = document.createElement('span');
  editor.className = 'tag-editor';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tag-input';
  input.placeholder = 'tag…';
  const listId = `tags-${node.id}`;
  input.setAttribute('list', listId);

  const datalist = document.createElement('datalist');
  datalist.id = listId;
  for (const { tag } of allTags(tagMap)) {
    if (tagsFor(tagMap, node.id).includes(tag)) continue;
    const opt = document.createElement('option');
    opt.value = tag;
    datalist.appendChild(opt);
  }

  input.addEventListener('keydown', async e => {
    if (e.key === 'Enter' && input.value.trim()) {
      await commitTag(node, input.value);
    } else if (e.key === 'Escape') {
      await refresh();
    }
  });

  const suggestBtn = document.createElement('button');
  suggestBtn.className = 'tag-suggest';
  suggestBtn.textContent = '✨ Suggest';
  suggestBtn.addEventListener('click', async () => {
    suggestBtn.disabled = true;
    suggestBtn.textContent = '…';
    const existing = allTags(tagMap).map(t => t.tag);
    const tags = await suggestTags(node, existing, { createSession: defaultSessionFactory });
    suggestBtn.remove();
    if (tags.length === 0) {
      const none = document.createElement('span');
      none.className = 'tag-none';
      none.textContent = '(no AI suggestions)';
      editor.appendChild(none);
      return;
    }
    for (const tag of tags) {
      if (tagsFor(tagMap, node.id).includes(tag)) continue;
      const chip = document.createElement('button');
      chip.className = 'tag-suggestion';
      chip.textContent = `+ ${tag}`;
      chip.addEventListener('click', async () => { await commitTag(node, tag); });
      editor.appendChild(chip);
    }
  });

  editor.append(input, datalist, suggestBtn);
  tagBar.appendChild(editor);
  input.focus();
}
```

- [ ] **Step 4: Add tag-editor styles to `manager/manager.css`** — append:

```css
.tag-editor { display: inline-flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.tag-input { font-size: 11px; padding: 1px 4px; width: 90px; }
.tag-suggest, .tag-suggestion { border: 1px solid #aab; background: none; color: #3349a8; border-radius: 10px; padding: 1px 6px; font-size: 11px; cursor: pointer; }
.tag-none { color: #888; font-size: 11px; }
```

- [ ] **Step 5: Verify and commit**

Run: `npm run lint && npm test`.
Manual (after reload): clicking "+ tag" shows an inline input; typing shows your existing tags as native autocomplete; Enter adds the typed tag; Escape closes; "✨ Suggest" shows AI tag chips (on machines with Gemini Nano) that add on click, or "(no AI suggestions)" when the model is unavailable.

```bash
git add manager/manager.js manager/manager.css
git commit -m "feat: inline tag editor with existing-tag autocomplete and AI suggestions"
```

---

### Task 6: Docs, final review, merge

**Files:**
- Modify: `README.md`, `CHROMEWEBSTORE.md`

- [ ] **Step 1: Update `CHROMEWEBSTORE.md`** — change the version header and version history. Set:
```
**Version:** 0.2.1
```
and add to the top of the Version History list:
```
- 0.2.1 — Confirm-before-delete modal with impact detail, richer suggestion text, viewport-based heights, generated extension icon, inline tag editor with autocomplete and AI tag suggestions.
```

- [ ] **Step 2: Update `README.md` Features list** — add these bullets to the existing `## Features` section:
```
- Confirm-before-delete modal showing exactly what each deletion affects.
- Inline tag editor with autocomplete from your existing tags and on-device AI tag suggestions.
- Generated extension icon; viewport-aware layout.
```

- [ ] **Step 3: Full verification**

Run: `npm run lint && npm test`
Expected: 0 lint errors; all suites pass (tree tests now include `countContents`).

- [ ] **Step 4: Full manual pass** (after reload):
1. Extension shows the new icon in the toolbar and `chrome://extensions`.
2. Every destructive suggestion opens a confirm modal with accurate counts; Cancel/Escape aborts.
3. Suggestion cards state the blast radius (e.g., "moves 8 bookmark(s), deletes 2 folder(s)").
4. Popup results and manager panels scroll within the viewport.
5. Inline tag editor: autocomplete from existing tags; Enter adds; "✨ Suggest" adds AI chips.
6. Security spot-check still holds: a `javascript:` bookmark renders as inert text with "(blocked: unsafe URL)", no favicon, no link, no alert.

- [ ] **Step 5: Commit docs**

```bash
git add README.md CHROMEWEBSTORE.md
git commit -m "docs: v0.2.1 features and store version bump"
```

- [ ] **Step 6: Request code review**

Use superpowers:requesting-code-review on the `feat/v0.2.1-safety-polish` diff against `main`. Address findings before merging.

- [ ] **Step 7: Merge and tag**

```bash
git switch main
git merge --no-ff feat/v0.2.1-safety-polish -m "feat: bookmark organizer v0.2.1 — delete confirmation, richer suggestions, icons, inline tag editor"
git tag v0.2.1
```
