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
