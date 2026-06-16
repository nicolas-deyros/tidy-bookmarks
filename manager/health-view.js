import { flattenBookmarks, listFolders, findEmptyFolders, findSingleItemFolders, countContents, folderChoices } from '../src/tree.js';
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

  // Scope picker: "Everything" + an indented tree of every folder (roots included),
  // each labelled by its own name so siblings are distinct.
  const prev = scopeSelect.value;
  scopeSelect.replaceChildren();
  scopeSelect.append(el('option', { value: '', textContent: 'Everything' }));
  for (const f of folderChoices(tree)) {
    const indent = '   '.repeat(Math.max(0, f.depth - 1));
    scopeSelect.append(el('option', { value: f.id, textContent: indent + f.title }));
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
function drill(container, title, rerun, subtitle) {
  container.replaceChildren();
  const head = el('div', { className: 'hb-drill-head' });
  const back = el('button', { className: 'hb-back', textContent: '← Health' });
  back.addEventListener('click', rerun);
  head.append(back, el('span', { className: 'hb-drill-title', textContent: title }));
  container.append(head);
  if (subtitle) container.append(el('p', { className: 'hb-drill-sub', textContent: subtitle }));
  const body = el('div', { className: 'hb-drill-body' });
  container.append(body);
  return body;
}

// One-line guidance under each AI drill-in title.
const AI_SUBTITLES = {
  fileLoose: 'For each loose bookmark, apply the suggested folder — tick the ones you want.',
  tags: 'Choose which suggested tags to add, or type your own. Nothing is saved until you apply.',
  tidy: 'Review the proposed subfolders and create the ones you want.',
  similar: 'Merge folders that mean the same thing into one.'
};

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
  const body = drill(container, card.title, rerun, card.description);

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
      sel.setAttribute('aria-label', `Move "${b.title || b.url}" to folder`);
      sel.append(el('option', { value: '', textContent: 'Move to…' }));
      for (const f of folders) sel.append(el('option', { value: f.id, textContent: f.path ? `${f.path} / ${f.title}` : f.title }));
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
  const body = drill(container, card.title, rerun, AI_SUBTITLES[card.id]);
  const status = el('span', { className: 'hb-status' });
  status.setAttribute('aria-live', 'polite');
  const loading = el('div', { className: 'hb-loading' });
  loading.append(el('span', { className: 'hb-spinner' }), status);
  body.append(loading);
  const setStatus = t => { status.textContent = t; };
  setStatus('Preparing on-device model… first run may download it.');

  let baseSession = null;
  try {
    const tree = await chrome.bookmarks.getTree();
    const scope = scopeId ? [findNode(tree, scopeId)].filter(Boolean) : tree;
    const flat = flattenBookmarks(scope);
    const rootIds = new Set((tree[0]?.children ?? []).map(n => n.id));
    const folders = listFolders(tree).filter(f => !rootIds.has(f.id));

    // Create ONE on-device session for the whole scan (model init is the expensive
    // part) and surface the first-run download as a percentage.
    try {
      baseSession = await defaultSessionFactory({
        onDownloadProgress: e => setStatus(`Downloading on-device model… ${Math.round((e.loaded ?? 0) * 100)}%`)
      });
    } catch { baseSession = null; }
    const aiReady = !!baseSession;

    // Tags / tidy / similar have no rule-based fallback — they need the model.
    if (!aiReady && card.id !== 'fileLoose') {
      body.replaceChildren(aiUnavailableNote());
      return;
    }

    // Per item, hand the AI helpers a fresh-context clone() of the base session
    // (cheap) so prompts don't accumulate context, or reuse the base if clone()
    // isn't available (no destroy(), so it survives the loop). Base dies in finally.
    const opts = {
      createSession: async () => !baseSession ? null
        : (baseSession.clone ? baseSession.clone() : { prompt: (...a) => baseSession.prompt(...a) })
    };

    if (card.id === 'fileLoose') {
      const loose = flat.filter(b => rootIds.has(b.parentId)).slice(0, 25);
      const items = [];
      for (let i = 0; i < loose.length; i++) {
        setStatus(progressText(i, loose.length));
        const b = loose[i];
        const { folder, newFolderName } = await suggestFolder(b, folders, opts);
        if (folder) items.push({ node: b, target: folder, label: `Move "${b.title}" → "${folder.title}"` });
        else if (newFolderName) items.push({ node: b, newFolderName, label: `Create "${newFolderName}" for "${b.title}"` });
      }
      body.replaceChildren();
      if (!aiReady) body.append(el('p', { className: 'hb-status', textContent: 'On-device AI unavailable — showing rule-based suggestions.' }));
      checklist(body, items, {
        actionLabel: 'Apply selected',
        emptyText: 'No filing suggestions found.',
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
      const tagMap0 = ctx.getTagMap();
      const untagged = flat.filter(b => tagsFor(tagMap0, b.id).length === 0).slice(0, 25);
      const existing = allTags(tagMap0).map(t => t.tag);
      const items = [];
      for (let i = 0; i < untagged.length; i++) {
        setStatus(progressText(i, untagged.length));
        const tags = await suggestTags(untagged[i], existing, opts);
        if (tags.length) items.push({ node: untagged[i], tags });
      }
      body.replaceChildren();
      if (items.length === 0) { body.append(el('p', { className: 'hb-empty', textContent: 'No tag suggestions.' })); return; }

      // One row per bookmark; each suggested tag is a toggle chip (on by default),
      // plus an input to add your own. Only chosen chips get saved.
      const state = [];
      for (const it of items) {
        const chosen = new Set(it.tags);
        const row = el('div', { className: 'hb-tagrow' });
        row.append(el('span', { className: 'hb-title', textContent: it.node.title || it.node.url }));
        const chips = el('span', { className: 'hb-tagchips' });
        const makeChip = t => {
          const chip = el('button', { className: 'hb-tagchip on', textContent: t });
          chip.setAttribute('aria-pressed', 'true');
          chip.addEventListener('click', () => {
            const on = !chosen.has(t);
            if (on) { chosen.add(t); chip.classList.add('on'); } else { chosen.delete(t); chip.classList.remove('on'); }
            chip.setAttribute('aria-pressed', String(on));
          });
          return chip;
        };
        for (const t of it.tags) chips.append(makeChip(t));
        const input = el('input', { className: 'tag-input', type: 'text', placeholder: '+ tag', autocomplete: 'off', spellcheck: false });
        input.setAttribute('aria-label', 'Add your own tag');
        input.addEventListener('keydown', e => {
          if (e.key !== 'Enter' || !input.value.trim()) return;
          const t = input.value.trim();
          if (!chosen.has(t)) { chosen.add(t); chips.insertBefore(makeChip(t), input); }
          input.value = '';
        });
        chips.append(input);
        row.append(chips);
        body.append(row);
        state.push({ id: it.node.id, chosen });
      }
      const footer = el('div', { className: 'hb-actions' });
      const apply = el('button', { className: 'hb-apply', textContent: 'Apply chosen tags' });
      apply.addEventListener('click', async () => {
        apply.disabled = true;
        let map = ctx.getTagMap();
        for (const s of state) for (const t of s.chosen) map = addTag(map, s.id, t);
        ctx.setTagMap(map);
        await ctx.saveTags();
        rerun();
      });
      footer.append(el('span', { className: 'hb-status', textContent: `${items.length} bookmark(s) with suggestions` }), apply);
      body.append(footer);
      return;
    }

    if (card.id === 'tidy') {
      const crowded = folders
        .filter(f => (f.children ?? []).filter(c => c.url).length >= 8)
        .sort((a, b) => (b.children?.length ?? 0) - (a.children?.length ?? 0))[0];
      if (!crowded) { body.replaceChildren(el('p', { className: 'hb-empty', textContent: 'No crowded folder to tidy (need 8+ bookmarks).' })); return; }
      const contents = (crowded.children ?? []).filter(c => c.url);
      setStatus(`Analyzing "${crowded.title}" (${contents.length} bookmarks)…`);
      const groups = await suggestReorg(crowded.title, contents, opts);
      body.replaceChildren();
      body.append(el('p', { className: 'hb-status', textContent: `Tidying "${crowded.title}" (${contents.length} bookmarks)` }));
      checklist(body, groups.map(g => ({ group: g })), {
        actionLabel: 'Create selected subfolders',
        emptyText: 'The model returned no subfolder split.',
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
      const titles = [...byTitle.keys()].slice(0, 50); // cap for model context
      setStatus(`Comparing ${titles.length} folder names…`);
      const groups = await suggestSimilarFolders(titles, opts);
      const items = groups
        .map(names => names.map(n => byTitle.get(n)).filter(Boolean))
        .filter(nodes => nodes.length >= 2)
        .map(nodes => ({ nodes, label: `Merge: ${nodes.map(n => n.title).join(', ')}` }));
      body.replaceChildren();
      checklist(body, items, {
        actionLabel: 'Merge selected',
        emptyText: 'No similar folders found.',
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
  } catch (err) {
    const msg = err.message?.includes('timed out')
      ? "The AI model took too long. Try again with a smaller folder, or use the Cleanup checks which don't need AI."
      : `Scan failed: ${err.message}`;
    body.replaceChildren(el('p', { className: 'hb-empty', textContent: msg }));
  } finally {
    try { baseSession?.destroy?.(); } catch { /* ignore */ }
  }
}

function progressText(i, total) {
  if (total === 0) return 'Nothing to scan here.';
  return `Scanning ${i + 1} of ${total}… (${Math.round((i / total) * 100)}%)`;
}

function aiUnavailableNote() {
  return el('p', { className: 'hb-empty',
    textContent: "On-device AI isn't available in this browser, so this check can't run. It needs a recent desktop Chrome with Built-in AI (Gemini Nano) enabled. The instant Cleanup checks work without it." });
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
