import { recommendMethodology, planFlat, planByRecency, snapshotSubtree, planUndo } from '../src/reorg.js';
import { suggestMethodologyPlan, defaultSessionFactory } from '../src/ai.js';

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
  cancel.addEventListener('click', () => close());
  const apply = document.createElement('button');
  apply.textContent = 'Apply selected';
  apply.className = 'danger';
  actions.append(cancel, apply);

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
    if (groups.length === 0) { close(); return; }
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
    if (groups.some(g => g.name === '(root)')) {
      const [sub] = await chrome.bookmarks.getSubTree(folder.id);
      for (const child of sub.children ?? []) {
        if (!child.url && (child.children ?? []).length === 0) await chrome.bookmarks.remove(child.id);
      }
    }
    await chrome.storage.local.set({ lastReorg: { folderId: folder.id, snapshot, createdIds } });
    close();
    await ctx.refresh();
  });

  function onKey(e) { if (e.key === 'Escape') close(); }
  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  document.addEventListener('keydown', onKey);

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
