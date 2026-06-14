import { isSafeUrl, faviconParams } from '../src/url-utils.js';
import { sortChildren, SORT_MODES } from '../src/sorting.js';
import { searchBookmarks } from '../src/search.js';
import { flattenBookmarks, listFolders } from '../src/tree.js';
import { addTag, removeTag, tagsFor, allTags } from '../src/tags.js';
import { suggestTags, defaultSessionFactory } from '../src/ai.js';
import { openReorg, renderUndoBar } from './reorg-view.js';

const SORT_LABELS = {
  alphabetical: 'A–Z',
  alphabeticalDesc: 'Z–A',
  dateAdded: 'Newest first',
  dateAddedAsc: 'Oldest first',
  domain: 'By domain',
  url: 'By URL'
};

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

  renderUndoBar(container, ctx);

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

  const reorgBtn = document.createElement('button');
  reorgBtn.textContent = 'Reorganize';
  reorgBtn.addEventListener('click', () => openReorg(folder, ctx));
  toolbar.appendChild(reorgBtn);

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
  const tagMap = ctx.getTagMap();
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
    suggestBtn.disabled = true; suggestBtn.textContent = 'thinking…';
    const note = msg => {
      suggestBtn.remove();
      const none = document.createElement('span'); none.className = 'tag-none'; none.textContent = msg;
      editor.appendChild(none);
    };
    const existing = allTags(ctx.getTagMap()).map(t => t.tag);
    let tags = [];
    try {
      // Warm up the model first so a first-run download shows progress on the button.
      const session = await defaultSessionFactory({
        onDownloadProgress: e => { suggestBtn.textContent = `model ${Math.round((e.loaded ?? 0) * 100)}%`; }
      });
      if (!session) { note('(on-device AI unavailable)'); return; }
      try { session.destroy?.(); } catch { /* ignore */ }
      suggestBtn.textContent = 'thinking…';
      tags = await suggestTags(node, existing, { createSession: defaultSessionFactory });
    } catch (err) {
      note(`(AI error: ${err.message})`); return;
    }
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
