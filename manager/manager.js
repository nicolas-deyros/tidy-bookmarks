import { sortChildren, SORT_MODES } from '../src/sorting.js';
import { isSafeUrl } from '../src/url-utils.js';
import { flattenBookmarks, listFolders, findEmptyFolders } from '../src/tree.js';
import { searchBookmarks } from '../src/search.js';
import { findDuplicates } from '../src/suggestions.js';
import { suggestFolder, defaultSessionFactory } from '../src/ai.js';

const treeEl = document.getElementById('tree');
const searchEl = document.getElementById('search');

const SORT_LABELS = { alphabetical: 'A–Z', dateAdded: 'Newest first', domain: 'By domain' };

async function refresh() {
  const tree = await chrome.bookmarks.getTree();
  const folders = listFolders(tree);
  treeEl.replaceChildren();
  const roots = tree[0].children ?? [];
  for (const root of roots) treeEl.appendChild(renderFolder(root, folders));
}

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

refresh().catch(err => {
  treeEl.textContent = `Failed to load bookmarks: ${err.message}`;
});
