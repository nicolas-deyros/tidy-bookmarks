import { flattenBookmarks, listFolders, findEmptyFolders, findSingleItemFolders, countContents } from '../src/tree.js';
import { findDuplicates, findNearDuplicates, findMergeableFolders, findStaleBookmarks } from '../src/suggestions.js';
import { suggestFolder, suggestTags, suggestReorg, suggestSimilarFolders, defaultSessionFactory } from '../src/ai.js';
import { buildHealthReport } from '../src/health.js';
import { addTag, tagsFor, allTags } from '../src/tags.js';
import { isSafeUrl, faviconParams } from '../src/url-utils.js';

const PRIORITY_LABEL = { high: 'High impact', med: 'Medium impact', low: 'Low impact' };

function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const k of kids) node.append(k);
  return node;
}

function favicon(url) {
  const img = el('img', { className: 'favicon', width: 16, height: 16, alt: '' });
  img.src = chrome.runtime.getURL(faviconParams(url, 16));
  return img;
}

// A bookmark row: favicon + (safe) link/title + optional muted url.
function bookmarkRow(b, { showUrl = true } = {}) {
  const row = el('div', { className: 'hb-item' });
  row.append(favicon(b.url));
  if (isSafeUrl(b.url)) {
    row.append(el('a', { className: 'hb-title', href: b.url, target: '_blank', rel: 'noopener noreferrer', textContent: b.title || b.url }));
  } else {
    row.append(el('span', { className: 'hb-title', textContent: b.title || b.url }));
  }
  if (showUrl) row.append(el('span', { className: 'hb-url', textContent: b.url }));
  return row;
}

export async function renderHealth(container, scopeSelect, ctx) {
  const tree = await chrome.bookmarks.getTree();
  const rootIds = new Set((tree[0]?.children ?? []).map(n => n.id));
  const allFolders = listFolders(tree).filter(f => !rootIds.has(f.id));

  // Scope picker: rebuild options, preserve current choice.
  const prev = scopeSelect.value;
  scopeSelect.replaceChildren();
  scopeSelect.append(el('option', { value: '', textContent: 'Everything' }));
  for (const f of allFolders) {
    scopeSelect.append(el('option', { value: f.id, textContent: f.path || f.title }));
  }
  scopeSelect.value = [...scopeSelect.options].some(o => o.value === prev) ? prev : '';
  scopeSelect.onchange = () => { renderHealth(container, scopeSelect, ctx); };

  const scopeId = scopeSelect.value;
  const report = buildHealthReport({ tree, tagMap: ctx.getTagMap(), now: Date.now(), scopeId });
  const rerun = () => renderHealth(container, scopeSelect, ctx);

  container.replaceChildren();

  const cleanup = report.filter(c => c.group === 'cleanup' && c.count > 0);
  const ai = report.filter(c => c.group === 'ai');

  if (cleanup.length === 0) {
    container.append(el('p', { className: 'hb-empty', textContent: 'Nothing to clean up here — these bookmarks look tidy.' }));
  } else {
    container.append(sectionLabel('Cleanup · instant, on-device'));
    container.append(cardGrid(cleanup, c => openCleanup(c, { container, scopeSelect, ctx, scopeId, rerun })));
  }

  container.append(sectionLabel('Organize with on-device AI · runs when you ask'));
  container.append(cardGrid(ai, c => openAi(c, { container, scopeSelect, ctx, scopeId, rerun })));
}

function sectionLabel(text) {
  return el('div', { className: 'hb-label', textContent: text });
}

function cardGrid(items, onOpen) {
  const grid = el('div', { className: 'hb-grid' });
  for (const c of items) {
    const card = el('div', { className: 'hb-card' });
    const top = el('div', { className: 'hb-card-top' });
    top.append(el('span', { className: 'hb-count', textContent: c.count == null ? '—' : String(c.count) }));
    const dot = el('span', { className: 'hb-dot' });
    dot.dataset.priority = c.priority;
    dot.title = PRIORITY_LABEL[c.priority] ?? '';
    top.append(dot);
    card.append(top);
    card.append(el('span', { className: 'hb-name', textContent: c.title }));
    card.append(el('span', { className: 'hb-desc', textContent: c.description }));
    const btn = el('button', { className: c.kind === 'ai' ? 'hb-btn hb-btn-ai' : 'hb-btn', textContent: c.kind === 'ai' ? (c.action || 'Scan') : 'Review' });
    btn.addEventListener('click', () => onOpen(c));
    card.append(btn);
    grid.append(card);
  }
  return grid;
}

// Generic drill-in shell with a back button.
function drill(container, title, rerun) {
  container.replaceChildren();
  const head = el('div', { className: 'hb-drill-head' });
  const back = el('button', { className: 'hb-back', textContent: '← Health' });
  back.addEventListener('click', rerun);
  head.append(back, el('span', { className: 'hb-drill-title', textContent: title }));
  container.append(head);
  const body = el('div', { className: 'hb-drill-body' });
  container.append(body);
  return body;
}

// Checkbox list + a single batch action. items: [{node, label, checked}], apply(selectedNodes).
function checklist(body, items, { actionLabel, emptyText, makeRow, apply, rerun }) {
  if (items.length === 0) { body.append(el('p', { className: 'hb-empty', textContent: emptyText })); return; }
  const rows = [];
  for (const it of items) {
    const row = el('label', { className: 'hb-check' });
    const cb = el('input', { type: 'checkbox', checked: it.checked !== false });
    row.append(cb, makeRow(it));
    body.append(row);
    rows.push({ cb, it });
  }
  const footer = el('div', { className: 'hb-actions' });
  const status = el('span', { className: 'hb-status' });
  const btn = el('button', { className: 'hb-apply', textContent: actionLabel });
  const refresh = () => { status.textContent = `${rows.filter(r => r.cb.checked).length} of ${rows.length} selected`; };
  rows.forEach(r => r.cb.addEventListener('change', refresh));
  refresh();
  btn.addEventListener('click', async () => {
    const chosen = rows.filter(r => r.cb.checked).map(r => r.it);
    if (chosen.length === 0) return;
    btn.disabled = true;
    const ok = await apply(chosen);
    if (ok === false) { btn.disabled = false; return; }
    rerun();
  });
  footer.append(status, btn);
  body.append(footer);
}

async function openCleanup(card, { container, ctx, scopeId, rerun }) {
  const tree = await chrome.bookmarks.getTree();
  const scope = scopeId ? [findNode(tree, scopeId)].filter(Boolean) : tree;
  const flat = flattenBookmarks(scope);
  const rootIds = new Set((tree[0]?.children ?? []).map(n => n.id));
  const body = drill(container, card.title, rerun);

  if (card.id === 'duplicates' || card.id === 'nearDuplicates') {
    const groups = card.id === 'duplicates' ? findDuplicates(flat) : findNearDuplicates(flat);
    // Keep the newest in each group; the rest are removable.
    const removable = [];
    for (const g of groups) {
      const sorted = [...g].sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0));
      for (const extra of sorted.slice(1)) removable.push(extra);
    }
    checklist(body, removable.map(b => ({ node: b })), {
      actionLabel: 'Remove selected',
      emptyText: 'No duplicates found.',
      makeRow: it => bookmarkRow(it.node),
      rerun,
      apply: async chosen => {
        const ok = await ctx.confirm('Remove duplicates?',
          `Permanently removes ${chosen.length} bookmark(s), keeping one copy of each. This can't be undone.`);
        if (!ok) return false;
        for (const it of chosen) await chrome.bookmarks.remove(it.node.id);
      }
    });
    return;
  }

  if (card.id === 'empty') {
    const folders = findEmptyFolders(scope);
    checklist(body, folders.map(f => ({ node: f })), {
      actionLabel: 'Delete selected',
      emptyText: 'No empty folders.',
      makeRow: it => el('span', { className: 'hb-title', textContent: it.node.title }),
      rerun,
      apply: async chosen => {
        const ok = await ctx.confirm('Delete empty folders?',
          `Deletes ${chosen.length} empty folder(s). This can't be undone.`);
        if (!ok) return false;
        for (const it of chosen) await chrome.bookmarks.remove(it.node.id);
      }
    });
    return;
  }

  if (card.id === 'single') {
    const folders = findSingleItemFolders(scope);
    checklist(body, folders.map(f => ({ node: f })), {
      actionLabel: 'Collapse selected',
      emptyText: 'No single-item folders.',
      makeRow: it => el('span', { className: 'hb-title', textContent: `${it.node.title} → move 1 item up, delete folder` }),
      rerun,
      apply: async chosen => {
        const ok = await ctx.confirm('Collapse single-item folders?',
          `Moves the lone bookmark out of ${chosen.length} folder(s) and deletes the now-empty folder(s). This can't be undone.`);
        if (!ok) return false;
        for (const it of chosen) {
          const child = it.node.children[0];
          await chrome.bookmarks.move(child.id, { parentId: it.node.parentId });
          await chrome.bookmarks.remove(it.node.id);
        }
      }
    });
    return;
  }

  if (card.id === 'merge') {
    const folders = listFolders(scope).filter(f => !rootIds.has(f.id));
    const groups = findMergeableFolders(folders);
    const items = groups.map(g => ({ node: g[0], group: g, moved: g.slice(1).reduce((n, f) => n + countContents(f).bookmarks, 0) }));
    checklist(body, items, {
      actionLabel: 'Merge selected',
      emptyText: 'No same-name folders to merge.',
      makeRow: it => el('span', { className: 'hb-title', textContent: `Merge ${it.group.length} folders named "${it.node.title}" — moves ${it.moved} bookmark(s)` }),
      rerun,
      apply: async chosen => {
        const ok = await ctx.confirm('Merge folders?',
          `Merges ${chosen.length} group(s) of same-name folders, moving their bookmarks together and deleting the extras. This can't be undone.`);
        if (!ok) return false;
        for (const it of chosen) await mergeGroup(it.group);
      }
    });
    return;
  }

  if (card.id === 'stale') {
    const stale = findStaleBookmarks(flat, { now: Date.now() });
    checklist(body, stale.map(b => ({ node: b, checked: false })), {
      actionLabel: 'Remove selected',
      emptyText: 'No stale bookmarks.',
      makeRow: it => bookmarkRow(it.node),
      rerun,
      apply: async chosen => {
        const ok = await ctx.confirm('Remove stale bookmarks?',
          `Permanently removes ${chosen.length} old bookmark(s). This can't be undone.`);
        if (!ok) return false;
        for (const it of chosen) await chrome.bookmarks.remove(it.node.id);
      }
    });
    return;
  }

  if (card.id === 'loose') {
    const loose = flat.filter(b => rootIds.has(b.parentId));
    const folders = listFolders(tree).filter(f => !rootIds.has(f.id));
    if (loose.length === 0) { body.append(el('p', { className: 'hb-empty', textContent: 'No loose items.' })); return; }
    for (const b of loose) {
      const row = el('div', { className: 'hb-item hb-move-row' });
      row.append(favicon(b.url), el('span', { className: 'hb-title', textContent: b.title || b.url }));
      const sel = el('select', { className: 'hb-move-select' });
      sel.append(el('option', { value: '', textContent: 'Move to…' }));
      for (const f of folders) sel.append(el('option', { value: f.id, textContent: f.path || f.title }));
      const go = el('button', { className: 'hb-btn', textContent: 'Move' });
      go.addEventListener('click', async () => {
        if (!sel.value) return;
        await chrome.bookmarks.move(b.id, { parentId: sel.value });
        row.remove();
      });
      row.append(sel, go);
      body.append(row);
    }
    return;
  }
}

async function openAi(card, { container, ctx, scopeId, rerun }) {
  const body = drill(container, card.title, rerun);
  body.append(el('p', { className: 'hb-status', textContent: 'Scanning on-device…' }));
  const tree = await chrome.bookmarks.getTree();
  const scope = scopeId ? [findNode(tree, scopeId)].filter(Boolean) : tree;
  const flat = flattenBookmarks(scope);
  const rootIds = new Set((tree[0]?.children ?? []).map(n => n.id));
  const folders = listFolders(tree).filter(f => !rootIds.has(f.id));
  const opts = { createSession: defaultSessionFactory };
  body.replaceChildren();

  if (card.id === 'fileLoose') {
    const loose = flat.filter(b => rootIds.has(b.parentId)).slice(0, 25);
    const items = [];
    for (const b of loose) {
      const { folder, newFolderName } = await suggestFolder(b, folders, opts);
      if (folder) items.push({ node: b, target: folder, label: `Move "${b.title}" → "${folder.title}"` });
      else if (newFolderName) items.push({ node: b, newFolderName, label: `Create "${newFolderName}" for "${b.title}"` });
    }
    checklist(body, items, {
      actionLabel: 'Apply selected',
      emptyText: 'No filing suggestions (or AI unavailable).',
      makeRow: it => el('span', { className: 'hb-title', textContent: it.label }),
      rerun,
      apply: async chosen => {
        for (const it of chosen) {
          if (it.target) await chrome.bookmarks.move(it.node.id, { parentId: it.target.id });
          else {
            const created = await chrome.bookmarks.create({ parentId: it.node.parentId, title: it.newFolderName });
            await chrome.bookmarks.move(it.node.id, { parentId: created.id });
          }
        }
      }
    });
    return;
  }

  if (card.id === 'tags') {
    let tagMap = ctx.getTagMap();
    const untagged = flat.filter(b => tagsFor(tagMap, b.id).length === 0).slice(0, 25);
    const existing = allTags(tagMap).map(t => t.tag);
    const items = [];
    for (const b of untagged) {
      const tags = await suggestTags(b, existing, opts);
      if (tags.length) items.push({ node: b, tags, label: `Tag "${b.title}" with: ${tags.join(', ')}` });
    }
    checklist(body, items, {
      actionLabel: 'Apply tags',
      emptyText: 'No tag suggestions (or AI unavailable).',
      makeRow: it => el('span', { className: 'hb-title', textContent: it.label }),
      rerun,
      apply: async chosen => {
        for (const it of chosen) for (const t of it.tags) tagMap = addTag(tagMap, it.node.id, t);
        ctx.setTagMap(tagMap);
        await ctx.saveTags();
      }
    });
    return;
  }

  if (card.id === 'tidy') {
    const crowded = folders
      .filter(f => (f.children ?? []).filter(c => c.url).length >= 8)
      .sort((a, b) => (b.children?.length ?? 0) - (a.children?.length ?? 0))[0];
    if (!crowded) { body.append(el('p', { className: 'hb-empty', textContent: 'No crowded folder to tidy (need 8+ bookmarks).' })); return; }
    const contents = (crowded.children ?? []).filter(c => c.url);
    const groups = await suggestReorg(crowded.title, contents, opts);
    body.append(el('p', { className: 'hb-status', textContent: `Tidying "${crowded.title}" (${contents.length} bookmarks)` }));
    checklist(body, groups.map(g => ({ group: g })), {
      actionLabel: 'Create selected subfolders',
      emptyText: 'No reorg suggestions (or AI unavailable).',
      makeRow: it => el('span', { className: 'hb-title', textContent: `Subfolder "${it.group.name}" for ${it.group.bookmarkIds.length} bookmark(s)` }),
      rerun,
      apply: async chosen => {
        for (const it of chosen) {
          const created = await chrome.bookmarks.create({ parentId: crowded.id, title: it.group.name });
          for (const id of it.group.bookmarkIds) await chrome.bookmarks.move(id, { parentId: created.id });
        }
      }
    });
    return;
  }

  if (card.id === 'similar') {
    const byTitle = new Map();
    for (const f of folders) if (!byTitle.has(f.title)) byTitle.set(f.title, f);
    const titles = [...byTitle.keys()];
    const groups = await suggestSimilarFolders(titles, opts);
    const items = groups
      .map(names => names.map(n => byTitle.get(n)).filter(Boolean))
      .filter(nodes => nodes.length >= 2)
      .map(nodes => ({ nodes, label: `Merge: ${nodes.map(n => n.title).join(', ')}` }));
    checklist(body, items, {
      actionLabel: 'Merge selected',
      emptyText: 'No similar folders found (or AI unavailable).',
      makeRow: it => el('span', { className: 'hb-title', textContent: it.label }),
      rerun,
      apply: async chosen => {
        const ok = await ctx.confirm('Merge similar folders?',
          `Merges ${chosen.length} group(s) of related folders into one each, moving bookmarks together and deleting the extras. This can't be undone.`);
        if (!ok) return false;
        for (const it of chosen) await mergeGroup(it.nodes);
      }
    });
    return;
  }
}

// Move every child of the trailing folders into the first, then delete them.
async function mergeGroup(group) {
  const [target, ...rest] = group;
  for (const folder of rest) {
    const [sub] = await chrome.bookmarks.getSubTree(folder.id);
    for (const child of sub.children ?? []) await chrome.bookmarks.move(child.id, { parentId: target.id });
    await chrome.bookmarks.remove(folder.id);
  }
}

function findNode(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) { const f = findNode(n.children, id); if (f) return f; }
  }
  return null;
}
