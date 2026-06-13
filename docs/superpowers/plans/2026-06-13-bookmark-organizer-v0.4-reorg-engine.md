# Bookmark Organizer v0.4 — Methodology Reorganization Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize one folder's contents by a chosen methodology (Flat, By-recency, Topic, PARA, Johnny.Decimal) with an approvable preview, atomic apply, and single-level undo. On-device; no new permissions.

**Architecture:** Pure engine in `src/reorg.js` + pure AI prompt/parse helpers in `src/ai.js` (both TDD). Glue in a new `manager/reorg-view.js`, opened by a Reorganize button added to `manager/contents.js`. Snapshot for undo stored in `chrome.storage.local.lastReorg`.

**Tech Stack:** Vanilla JS ES modules, MV3, Vitest, ESLint. No bundler.

**Spec:** `docs/superpowers/specs/2026-06-13-bookmark-organizer-v0.4-reorg-engine-design.md`.

**Security (every task):** permissions stay `["bookmarks","storage","favicon","sidePanel"]` — no `history`/network/host. AI output sanitized + id-allowlisted + de-duplicated; nothing mutates before Apply; every apply is undoable; folder deletes never touch Chrome roots; render via `createElement`/`textContent`, no `innerHTML`/`eval`.

**Prerequisite/branching:** v0.3 is on `main`. Task 1 creates `feat/v0.4-reorg-engine` off `main`. Run `npm test` + `npm run lint` before each commit; end commit messages with a blank line then `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

**Bookmark node shape:** `{ id, title, url?, parentId, dateAdded, children? }`. A "group" throughout = `{ name: string, bookmarkIds: string[] }`.

**File structure:**

| Path | Change | Responsibility |
|---|---|---|
| `src/reorg.js` | CREATE | `recommendMethodology`, `planFlat`, `planByRecency`, `parseMethodologyPlan`, `snapshotSubtree`, `planUndo` (pure) |
| `src/ai.js` | MODIFY | `buildMethodologyPrompt`, `suggestMethodologyPlan` |
| `manager/reorg-view.js` | CREATE | preview panel, apply, undo (glue) |
| `manager/contents.js` | MODIFY | "Reorganize" toolbar button → opens reorg-view |
| `manager/manager.css` | MODIFY | reorg panel + undo-bar styles |
| `tests/reorg.test.js` | CREATE | unit tests for `src/reorg.js` |
| `tests/ai.test.js` | MODIFY | tests for the new AI helpers |

---

### Task 1: Branch + `planFlat` and `planByRecency` (deterministic)

**Files:** Create `src/reorg.js`; Test `tests/reorg.test.js`

- [ ] **Step 1: Branch**
```bash
git switch -c feat/v0.4-reorg-engine
```

- [ ] **Step 2: Write failing tests** — create `tests/reorg.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { planFlat, planByRecency } from '../src/reorg.js';

const now = Date.UTC(2026, 0, 31); // 2026-01-31
const day = 86400000;
const bookmarks = [
  { id: 'a', title: 'fresh', url: 'https://a.com', dateAdded: now - 5 * day },
  { id: 'b', title: 'mid', url: 'https://b.com', dateAdded: now - 90 * day },
  { id: 'c', title: 'old', url: 'https://c.com', dateAdded: now - 800 * day }
];

describe('planFlat', () => {
  it('returns one (root) group with every bookmark id', () => {
    expect(planFlat(bookmarks)).toEqual([{ name: '(root)', bookmarkIds: ['a', 'b', 'c'] }]);
  });
  it('returns [] for an empty folder', () => {
    expect(planFlat([])).toEqual([]);
  });
});

describe('planByRecency', () => {
  it('buckets by dateAdded into Recent/Older/Archive', () => {
    expect(planByRecency(bookmarks, now)).toEqual([
      { name: 'Recent', bookmarkIds: ['a'] },
      { name: 'Older', bookmarkIds: ['b'] },
      { name: 'Archive', bookmarkIds: ['c'] }
    ]);
  });
  it('omits empty buckets', () => {
    const onlyFresh = [{ id: 'a', url: 'https://a.com', dateAdded: now }];
    expect(planByRecency(onlyFresh, now)).toEqual([{ name: 'Recent', bookmarkIds: ['a'] }]);
  });
});
```

- [ ] **Step 3: Run — expect FAIL** (`Cannot find module '../src/reorg.js'`)
Run: `npx vitest run tests/reorg.test.js`

- [ ] **Step 4: Create `src/reorg.js`**
```js
const DAY = 86400000;

export function planFlat(bookmarks) {
  if (bookmarks.length === 0) return [];
  return [{ name: '(root)', bookmarkIds: bookmarks.map(b => b.id) }];
}

export function planByRecency(bookmarks, now) {
  const buckets = { Recent: [], Older: [], Archive: [] };
  for (const b of bookmarks) {
    const age = now - (b.dateAdded ?? 0);
    if (age <= 30 * DAY) buckets.Recent.push(b.id);
    else if (age <= 365 * DAY) buckets.Older.push(b.id);
    else buckets.Archive.push(b.id);
  }
  return ['Recent', 'Older', 'Archive']
    .filter(name => buckets[name].length > 0)
    .map(name => ({ name, bookmarkIds: buckets[name] }));
}
```

- [ ] **Step 5: Run — expect PASS**, then `npm test` and `npm run lint`.

- [ ] **Step 6: Commit**
```bash
git add src/reorg.js tests/reorg.test.js
git commit -m "feat: deterministic reorg plans — flat and by-recency"
```

---

### Task 2: `recommendMethodology`

**Files:** Modify `src/reorg.js`, `tests/reorg.test.js`

Heuristic: many distinct domains relative to count → `topic`; small & mostly recent → `recency`; otherwise → `para`.

- [ ] **Step 1: Add failing tests** — append to `tests/reorg.test.js`:
```js
import { recommendMethodology } from '../src/reorg.js';

describe('recommendMethodology', () => {
  it('recommends topic when domains are highly varied', () => {
    const varied = Array.from({ length: 10 }, (_, i) => ({ id: String(i), url: `https://site${i}.com` }));
    expect(recommendMethodology(varied)).toBe('topic');
  });
  it('recommends recency for a small set', () => {
    const few = [{ id: '1', url: 'https://a.com' }, { id: '2', url: 'https://a.com' }];
    expect(recommendMethodology(few)).toBe('recency');
  });
  it('recommends para for a larger mixed set with repeated domains', () => {
    const mixed = Array.from({ length: 12 }, (_, i) => ({ id: String(i), url: `https://site${i % 3}.com` }));
    expect(recommendMethodology(mixed)).toBe('para');
  });
  it('defaults to flat for an empty folder', () => {
    expect(recommendMethodology([])).toBe('flat');
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npx vitest run tests/reorg.test.js`

- [ ] **Step 3: Append to `src/reorg.js`**
```js
import { domainOf } from './url-utils.js';

export function recommendMethodology(bookmarks) {
  const n = bookmarks.length;
  if (n === 0) return 'flat';
  if (n <= 5) return 'recency';
  const domains = new Set(bookmarks.filter(b => b.url).map(b => domainOf(b.url)));
  const variety = domains.size / n;
  return variety >= 0.8 ? 'topic' : 'para';
}
```

- [ ] **Step 4: Run — expect PASS**, then `npm test` and `npm run lint`.

- [ ] **Step 5: Commit**
```bash
git add src/reorg.js tests/reorg.test.js
git commit -m "feat: recommendMethodology heuristic"
```

---

### Task 3: `parseMethodologyPlan` (validate AI output)

**Files:** Modify `src/reorg.js`, `tests/reorg.test.js`

Generalizes `parseReorg`: parses `"Group name: 1, 3"` lines, maps numbers to bookmark ids, sanitizes names, drops out-of-range numbers, de-duplicates ids across groups (first wins), drops empty groups.

- [ ] **Step 1: Add failing tests** — append to `tests/reorg.test.js`:
```js
import { parseMethodologyPlan } from '../src/reorg.js';

const planBks = [
  { id: 'b1', title: 'A', url: 'https://a.com' },
  { id: 'b2', title: 'B', url: 'https://b.com' },
  { id: 'b3', title: 'C', url: 'https://c.com' }
];

describe('parseMethodologyPlan', () => {
  it('maps numbers to ids and sanitizes names', () => {
    expect(parseMethodologyPlan('Projects: 1, 3\nAreas: 2', planBks, 'para')).toEqual([
      { name: 'Projects', bookmarkIds: ['b1', 'b3'] },
      { name: 'Areas', bookmarkIds: ['b2'] }
    ]);
  });
  it('drops out-of-range numbers and unparseable lines', () => {
    expect(parseMethodologyPlan('junk\nGood: 2, 99', planBks, 'topic')).toEqual([
      { name: 'Good', bookmarkIds: ['b2'] }
    ]);
  });
  it('de-duplicates an id across groups (first group wins)', () => {
    expect(parseMethodologyPlan('One: 1, 2\nTwo: 2, 3', planBks, 'topic')).toEqual([
      { name: 'One', bookmarkIds: ['b1', 'b2'] },
      { name: 'Two', bookmarkIds: ['b3'] }
    ]);
  });
  it('returns [] for non-string input', () => {
    expect(parseMethodologyPlan(undefined, planBks, 'topic')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npx vitest run tests/reorg.test.js`

- [ ] **Step 3: Append to `src/reorg.js`** (add `sanitizeFolderName` to the existing import line from `./ai.js`? No — to avoid a circular import (`ai.js` will import from `reorg.js`), inline a local sanitizer here)
```js
function sanitizeName(name) {
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

export function parseMethodologyPlan(response, bookmarks) {
  if (typeof response !== 'string') return [];
  const used = new Set();
  const groups = [];
  for (const line of response.split('\n')) {
    const m = line.match(/^\s*(.+?):\s*([\d,\s]+)$/);
    if (!m) continue;
    const name = sanitizeName(m[1]);
    if (!name) continue;
    const ids = [];
    for (const part of m[2].split(',')) {
      const num = Number.parseInt(part.trim(), 10);
      if (!Number.isInteger(num) || num < 1 || num > bookmarks.length) continue;
      const id = bookmarks[num - 1].id;
      if (used.has(id)) continue;
      used.add(id);
      ids.push(id);
    }
    if (ids.length) groups.push({ name, bookmarkIds: ids });
  }
  return groups;
}
```
Note: the `methodology` argument is accepted by callers for symmetry but not needed by the parser (the format is uniform); the tests pass it and it is simply ignored. Define the export as `parseMethodologyPlan(response, bookmarks)` — JS ignores the extra arg.

- [ ] **Step 4: Run — expect PASS**, then `npm test` and `npm run lint`.

- [ ] **Step 5: Commit**
```bash
git add src/reorg.js tests/reorg.test.js
git commit -m "feat: parseMethodologyPlan validates and de-duplicates AI groups"
```

---

### Task 4: `snapshotSubtree` and `planUndo`

**Files:** Modify `src/reorg.js`, `tests/reorg.test.js`

- [ ] **Step 1: Add failing tests** — append to `tests/reorg.test.js`:
```js
import { snapshotSubtree, planUndo } from '../src/reorg.js';

const folder = { id: 'F', title: 'Dev', children: [
  { id: 'b1', title: 'A', url: 'https://a.com' },
  { id: 'b2', title: 'B', url: 'https://b.com' },
  { id: 'sub', title: 'Old', children: [
    { id: 'b3', title: 'C', url: 'https://c.com' }
  ] }
] };

describe('snapshotSubtree', () => {
  it('records id, parentId, index, title for every descendant', () => {
    expect(snapshotSubtree(folder)).toEqual([
      { id: 'b1', parentId: 'F', index: 0, title: 'A' },
      { id: 'b2', parentId: 'F', index: 1, title: 'B' },
      { id: 'sub', parentId: 'F', index: 2, title: 'Old' },
      { id: 'b3', parentId: 'sub', index: 0, title: 'C' }
    ]);
  });
});

describe('planUndo', () => {
  it('returns moves restoring each snapshot entry to its recorded parent/index', () => {
    const snapshot = [
      { id: 'b1', parentId: 'F', index: 0, title: 'A' },
      { id: 'b3', parentId: 'sub', index: 0, title: 'C' }
    ];
    const currentTree = [{ id: '0', children: [
      { id: 'F', children: [
        { id: 'New', children: [{ id: 'b1', url: 'https://a.com' }] }
      ] },
      { id: 'sub', children: [{ id: 'b3', url: 'https://c.com' }] }
    ] }];
    expect(planUndo(snapshot, currentTree)).toEqual([
      { id: 'b1', parentId: 'F', index: 0 },
      { id: 'b3', parentId: 'sub', index: 0 }
    ]);
  });
  it('skips entries whose id no longer exists', () => {
    const snapshot = [{ id: 'gone', parentId: 'F', index: 0, title: 'X' }];
    const currentTree = [{ id: '0', children: [{ id: 'F', children: [] }] }];
    expect(planUndo(snapshot, currentTree)).toEqual([]);
  });
  it('skips entries whose recorded parent no longer exists (e.g. a folder Flat deleted)', () => {
    const snapshot = [{ id: 'b3', parentId: 'sub', index: 0, title: 'C' }];
    const currentTree = [{ id: '0', children: [{ id: 'F', children: [{ id: 'b3', url: 'https://c.com' }] }] }];
    expect(planUndo(snapshot, currentTree)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npx vitest run tests/reorg.test.js`

- [ ] **Step 3: Append to `src/reorg.js`**
```js
export function snapshotSubtree(folder) {
  const out = [];
  function walk(parent) {
    (parent.children ?? []).forEach((node, index) => {
      out.push({ id: node.id, parentId: parent.id, index, title: node.title });
      if (node.children) walk(node);
    });
  }
  walk(folder);
  return out;
}

export function planUndo(snapshot, currentTree) {
  const existing = new Set();
  (function collect(nodes) {
    for (const n of nodes) {
      existing.add(n.id);
      if (n.children) collect(n.children);
    }
  })(currentTree);
  return snapshot
    .filter(entry => existing.has(entry.id) && existing.has(entry.parentId))
    .map(entry => ({ id: entry.id, parentId: entry.parentId, index: entry.index }));
}
```

- [ ] **Step 4: Run — expect PASS**, then `npm test` and `npm run lint`.

- [ ] **Step 5: Commit**
```bash
git add src/reorg.js tests/reorg.test.js
git commit -m "feat: snapshotSubtree and planUndo for single-level undo"
```

---

### Task 5: AI methodology helpers in `src/ai.js`

**Files:** Modify `src/ai.js`, `tests/ai.test.js`

- [ ] **Step 1: Add failing tests** — append to `tests/ai.test.js`:
```js
import { buildMethodologyPrompt, suggestMethodologyPlan } from '../src/ai.js';

const methBks = [
  { id: 'b1', title: 'GitHub repo', url: 'https://github.com/x' },
  { id: 'b2', title: 'Pasta recipe', url: 'https://food.com/p' }
];

describe('buildMethodologyPrompt', () => {
  it('names the methodology, lists numbered bookmarks, and asks for grouped lines', () => {
    const p = buildMethodologyPrompt('para', 'Misc', methBks);
    expect(p).toContain('Projects');
    expect(p).toContain('1. GitHub repo');
    expect(p).toContain('2. Pasta recipe');
  });
  it('uses numbered-category guidance for johnny-decimal', () => {
    expect(buildMethodologyPrompt('johnny-decimal', 'Misc', methBks)).toContain('number');
  });
});

describe('suggestMethodologyPlan', () => {
  it('returns validated groups from the model', async () => {
    const fakeSession = { prompt: async () => 'Projects: 1\nResources: 2', destroy: () => {} };
    const groups = await suggestMethodologyPlan('para', 'Misc', methBks, { createSession: async () => fakeSession });
    expect(groups).toEqual([
      { name: 'Projects', bookmarkIds: ['b1'] },
      { name: 'Resources', bookmarkIds: ['b2'] }
    ]);
  });
  it('returns [] when no session factory is available', async () => {
    expect(await suggestMethodologyPlan('topic', 'Misc', methBks, { createSession: null })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npx vitest run tests/ai.test.js`

- [ ] **Step 3: Modify `src/ai.js`** — add an import for the parser and append the helpers:
```js
import { parseMethodologyPlan } from './reorg.js';

const METHODOLOGY_GUIDANCE = {
  topic: 'Group them into 2-5 topical subfolders with short descriptive names.',
  para: 'Classify each into exactly one of these folders: Projects, Areas, Resources, Archive.',
  'johnny-decimal': 'Propose 2-5 numbered categories like "10 Finance", "20 Dev" (each name starts with a number).'
};

export function buildMethodologyPrompt(methodology, folderTitle, bookmarks) {
  const lines = bookmarks.map((b, i) => `${i + 1}. ${b.title} (${domainOf(b.url)})`).join('\n');
  return [
    `Organize the bookmarks in the folder "${folderTitle}".`,
    METHODOLOGY_GUIDANCE[methodology] ?? METHODOLOGY_GUIDANCE.topic,
    'Bookmarks:',
    lines,
    'Reply with one line per group as "Group name: 1, 3, 5" using the numbers above. Use only those numbers. Nothing else.'
  ].join('\n');
}

export async function suggestMethodologyPlan(methodology, folderTitle, bookmarks, { createSession } = {}) {
  if (!createSession) return [];
  let session = null;
  try {
    session = await createSession();
    if (session) {
      const response = await session.prompt(buildMethodologyPrompt(methodology, folderTitle, bookmarks));
      return parseMethodologyPlan(response, bookmarks);
    }
  } catch (err) {
    console.warn('AI methodology plan failed:', err);
  } finally {
    try { session?.destroy?.(); } catch { /* ignore a misbehaving session */ }
  }
  return [];
}
```
Note on imports: `reorg.js` does NOT import from `ai.js` (it has its own `sanitizeName`), so `ai.js` importing `parseMethodologyPlan` from `reorg.js` creates no cycle.

- [ ] **Step 4: Run — expect PASS** (`npm test`), then `npm run lint`.

- [ ] **Step 5: Commit**
```bash
git add src/ai.js tests/ai.test.js
git commit -m "feat: AI methodology prompt builder and plan suggester"
```

---

### Task 6: Reorg view glue — `manager/reorg-view.js`

**Files:** Create `manager/reorg-view.js`; Modify `manager/manager.css`

`openReorg(folder, ctx)` renders an overlay panel: methodology `<select>` (defaulted via `recommendMethodology`), a Preview area of approvable group cards, and Apply/Cancel. `ctx` provides `{ tree, getTagMap, refresh }` plus `confirm` (unused here) — reuse the existing manager `ctx`. Undo is surfaced by `renderUndoBar(container, ctx)` shown whenever `chrome.storage.local.lastReorg` exists.

- [ ] **Step 1: Create `manager/reorg-view.js`**
```js
import { recommendMethodology, planFlat, planByRecency, snapshotSubtree, planUndo } from '../src/reorg.js';
import { suggestMethodologyPlan } from '../src/ai.js';
import { defaultSessionFactory } from '../src/ai.js';

const METHODOLOGIES = [
  { id: 'flat', label: 'Flat' },
  { id: 'recency', label: 'By recency' },
  { id: 'topic', label: 'Topic' },
  { id: 'para', label: 'PARA' },
  { id: 'johnny-decimal', label: 'Johnny.Decimal' }
];

function bookmarksOf(folder) {
  return (folder.children ?? []).filter(c => c.url);
}

async function computePlan(methodology, folder) {
  const bks = bookmarksOf(folder);
  if (methodology === 'flat') return planFlat(bks);
  if (methodology === 'recency') return planByRecency(bks, Date.now());
  return suggestMethodologyPlan(methodology, folder.title, bks, { createSession: defaultSessionFactory });
}

export function openReorg(folder, ctx) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const box = document.createElement('div');
  box.className = 'modal-box reorg-box';

  const h = document.createElement('h3');
  h.textContent = `Reorganize "${folder.title}"`;
  box.appendChild(h);

  const picker = document.createElement('div');
  picker.className = 'reorg-picker';
  const label = document.createElement('span');
  label.textContent = 'Methodology: ';
  const select = document.createElement('select');
  const recommended = recommendMethodology(bookmarksOf(folder));
  for (const m of METHODOLOGIES) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.id === recommended ? `${m.label} (recommended)` : m.label;
    if (m.id === recommended) opt.selected = true;
    select.appendChild(opt);
  }
  picker.append(label, select);
  box.appendChild(picker);

  const preview = document.createElement('div');
  preview.className = 'reorg-preview';
  box.appendChild(preview);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => overlay.remove());
  const apply = document.createElement('button');
  apply.textContent = 'Apply selected';
  apply.className = 'danger';
  actions.append(cancel, apply);
  box.appendChild(actions);

  let currentGroups = [];

  async function renderPreview() {
    preview.replaceChildren();
    const loading = document.createElement('p');
    loading.textContent = 'Planning…';
    preview.appendChild(loading);
    currentGroups = await computePlan(select.value, folder);
    preview.replaceChildren();
    if (currentGroups.length === 0) {
      const none = document.createElement('p');
      none.textContent = select.value === 'flat' || select.value === 'recency'
        ? 'Nothing to reorganize.'
        : 'AI model unavailable — try By recency or Flat.';
      preview.appendChild(none);
      apply.disabled = true;
      return;
    }
    apply.disabled = false;
    for (const group of currentGroups) {
      const card = document.createElement('label');
      card.className = 'reorg-group';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = true; cb.dataset.group = group.name;
      const title = document.createElement('span');
      title.className = 'reorg-group-title';
      title.textContent = `${group.name} (${group.bookmarkIds.length})`;
      card.append(cb, title);
      preview.appendChild(card);
    }
  }

  select.addEventListener('change', renderPreview);

  apply.addEventListener('click', async () => {
    const checked = new Set([...preview.querySelectorAll('input:checked')].map(i => i.dataset.group));
    const groups = currentGroups.filter(g => checked.has(g.name));
    if (groups.length === 0) { overlay.remove(); return; }
    apply.disabled = true;

    const snapshot = snapshotSubtree(folder);
    await chrome.storage.local.set({ lastReorg: { folderId: folder.id, snapshot, createdIds: [] } });
    const createdIds = [];
    for (const group of groups) {
      if (group.name === '(root)') {
        for (const id of group.bookmarkIds) await chrome.bookmarks.move(id, { parentId: folder.id });
      } else {
        const created = await chrome.bookmarks.create({ parentId: folder.id, title: group.name });
        createdIds.push(created.id);
        for (const id of group.bookmarkIds) await chrome.bookmarks.move(id, { parentId: created.id });
      }
    }
    // Flat: remove now-empty subfolders that existed before.
    if (groups.some(g => g.name === '(root)')) {
      const [sub] = await chrome.bookmarks.getSubTree(folder.id);
      for (const child of sub.children ?? []) {
        if (!child.url && (child.children ?? []).length === 0) await chrome.bookmarks.remove(child.id);
      }
    }
    await chrome.storage.local.set({ lastReorg: { folderId: folder.id, snapshot, createdIds } });
    overlay.remove();
    await ctx.refresh();
  });

  box.appendChild(actions);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  renderPreview();
}

export function renderUndoBar(container, ctx) {
  chrome.storage.local.get('lastReorg').then(({ lastReorg }) => {
    if (!lastReorg) return;
    const bar = document.createElement('div');
    bar.className = 'undo-bar';
    const text = document.createElement('span');
    text.textContent = 'Reorganization applied.';
    const undo = document.createElement('button');
    undo.textContent = 'Undo';
    undo.addEventListener('click', async () => {
      undo.disabled = true;
      const tree = await chrome.bookmarks.getTree();
      for (const move of planUndo(lastReorg.snapshot, tree)) {
        await chrome.bookmarks.move(move.id, { parentId: move.parentId, index: move.index });
      }
      for (const id of lastReorg.createdIds) {
        const [node] = await chrome.bookmarks.getSubTree(id).catch(() => [null]);
        if (node && (node.children ?? []).length === 0) await chrome.bookmarks.remove(id);
      }
      await chrome.storage.local.remove('lastReorg');
      bar.remove();
      await ctx.refresh();
    });
    bar.append(text, undo);
    container.prepend(bar);
  });
}
```

- [ ] **Step 2: Add styles to `manager/manager.css`** — append:
```css
.reorg-box { max-width: 460px; }
.reorg-picker { margin-bottom: 12px; }
.reorg-preview { max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.reorg-group { display: flex; align-items: center; gap: 8px; border: 0.5px solid var(--border); border-radius: var(--border-radius-md, 6px); padding: 6px 8px; }
.reorg-group-title { font-weight: 500; }
.undo-bar { display: flex; align-items: center; gap: 10px; background: var(--bg-sel); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; margin-bottom: 10px; }
.undo-bar button { cursor: pointer; }
```

- [ ] **Step 3: Verify** `npm run lint && npm test`. (Wired in Task 7.)

- [ ] **Step 4: Commit**
```bash
git add manager/reorg-view.js manager/manager.css
git commit -m "feat: reorg preview panel with apply and undo bar"
```

---

### Task 7: Wire the Reorganize button into `manager/contents.js`

**Files:** Modify `manager/contents.js`

- [ ] **Step 1: Add the import** at the top of `manager/contents.js`:
```js
import { openReorg, renderUndoBar } from './reorg-view.js';
```

- [ ] **Step 2: Add the Reorganize button to the toolbar** — in `renderContents`, right after `toolbar.appendChild(sortSel);`, insert:
```js
  const reorgBtn = document.createElement('button');
  reorgBtn.textContent = 'Reorganize';
  reorgBtn.addEventListener('click', () => openReorg(folder, ctx));
  toolbar.appendChild(reorgBtn);
```

- [ ] **Step 3: Show the undo bar** — in `renderContents`, immediately after `container.replaceChildren();` at the top of the non-search branch (just before building `toolbar`), insert:
```js
  renderUndoBar(container, ctx);
```
(Place it inside the folder branch so the undo bar appears above the selected folder's contents. It self-hides when no `lastReorg` snapshot exists.)

- [ ] **Step 4: Verify** `npm run lint && npm test` (62+ tests pass).

- [ ] **Step 5: Manual smoke test** — reload extension, select a folder with several bookmarks:
  1. **Reorganize** opens the panel with a recommended methodology preselected.
  2. **Flat** and **By recency** show group cards instantly; **Topic/PARA/Johnny.Decimal** show cards on machines with Gemini Nano (else the "AI unavailable" notice).
  3. Uncheck a group → **Apply selected** → only checked groups become subfolders; bookmarks move in; tree refreshes.
  4. An **Undo** bar appears; clicking it restores the previous structure and removes the created folders.

- [ ] **Step 6: Commit**
```bash
git add manager/contents.js
git commit -m "feat: Reorganize toolbar button and undo bar wiring"
```

---

### Task 8: Docs, final review, merge

**Files:** Modify `README.md`, `CHROMEWEBSTORE.md`

- [ ] **Step 1: `CHROMEWEBSTORE.md`** — set `**Version:** 0.4.0`; add to Version History top:
```
- 0.4.0 — Methodology reorganization: reorganize a folder by PARA, Johnny.Decimal, Topic, By-recency, or Flat, with an approvable preview and one-click undo. No new permissions.
```

- [ ] **Step 2: `README.md`** — add to Features:
```
- Reorganize a folder by methodology (PARA, Johnny.Decimal, topic, by-recency, flat) with a preview and one-click undo.
```

- [ ] **Step 3: Full verification** — `npm run lint && npm test` (reorg + ai suites pass).

- [ ] **Step 4: Full manual pass** — each methodology; recommendation; partial apply; undo round-trip; AI-unavailable fallback; confirm no new permissions in `manifest.json`; XSS spot-check still holds.

- [ ] **Step 5: Commit docs**
```bash
git add README.md CHROMEWEBSTORE.md
git commit -m "docs: v0.4 methodology reorganization"
```

- [ ] **Step 6: Code review** — superpowers:requesting-code-review on the `feat/v0.4-reorg-engine` diff vs `main`. Address findings.

- [ ] **Step 7: Merge and tag**
```bash
git switch main
git merge --no-ff feat/v0.4-reorg-engine -m "feat: bookmark organizer v0.4 — methodology reorganization engine with preview and undo"
git tag v0.4.0
```
