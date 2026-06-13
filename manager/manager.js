import { sortChildren, SORT_MODES } from '../src/sorting.js';
import { isSafeUrl, faviconParams } from '../src/url-utils.js';
import { flattenBookmarks, listFolders, findEmptyFolders, countContents } from '../src/tree.js';
import { searchBookmarks } from '../src/search.js';
import { findDuplicates, findMergeableFolders } from '../src/suggestions.js';
import { suggestFolder, suggestTags, suggestReorg, defaultSessionFactory } from '../src/ai.js';
import { addTag, removeTag, tagsFor, pruneTags, allTags } from '../src/tags.js';

const treeEl = document.getElementById('tree');
const searchEl = document.getElementById('search');

let tagMap = {};

async function loadTags() {
  const { tags = {} } = await chrome.storage.local.get('tags');
  tagMap = tags;
}

async function saveTags() {
  await chrome.storage.local.set({ tags: tagMap });
}

const SORT_LABELS = { alphabetical: 'A–Z', dateAdded: 'Newest first', domain: 'By domain' };

async function refresh() {
  const tree = await chrome.bookmarks.getTree();
  await loadTags();
  const flat = flattenBookmarks(tree);
  const pruned = pruneTags(tagMap, flat.map(b => b.id));
  if (Object.keys(pruned).length !== Object.keys(tagMap).length) {
    tagMap = pruned;
    await saveTags();
  }
  const folders = listFolders(tree);
  treeEl.replaceChildren();
  const roots = tree[0].children ?? [];
  for (const root of roots) treeEl.appendChild(renderFolder(root, folders));
}

searchEl.addEventListener('input', async () => {
  const query = searchEl.value;
  if (!query.trim()) { await refresh(); return; }
  const tree = await chrome.bookmarks.getTree();
  const matches = searchBookmarks(flattenBookmarks(tree), query, tagMap);
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
    const icon = document.createElement('img');
    icon.className = 'favicon';
    icon.width = 16;
    icon.height = 16;
    icon.src = chrome.runtime.getURL(faviconParams(node.url, 16));
    icon.alt = '';
    li.appendChild(icon);
  }

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

  const tagBar = document.createElement('span');
  tagBar.className = 'tag-bar';
  for (const tag of tagsFor(tagMap, node.id)) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = tag;
    const x = document.createElement('button');
    x.className = 'tag-x';
    x.textContent = '×';
    x.title = `Remove tag "${tag}"`;
    x.addEventListener('click', async () => {
      tagMap = removeTag(tagMap, node.id, tag);
      await saveTags();
      await refresh();
    });
    chip.appendChild(x);
    tagBar.appendChild(chip);
  }
  const addTagBtn = document.createElement('button');
  addTagBtn.className = 'tag-add';
  addTagBtn.textContent = '+ tag';
  addTagBtn.addEventListener('click', () => openTagEditor(node, tagBar, addTagBtn));
  tagBar.appendChild(addTagBtn);
  li.appendChild(tagBar);

  return li;
}

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

async function applySort(folderId, mode) {
  const [subtree] = await chrome.bookmarks.getSubTree(folderId);
  const sorted = sortChildren(subtree.children ?? [], mode);
  for (let i = 0; i < sorted.length; i++) {
    await chrome.bookmarks.move(sorted[i].id, { parentId: folderId, index: i });
  }
}

const suggestionsOutput = document.getElementById('suggestions-output');
const analyzeBtn = document.getElementById('run-suggestions');

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

    const rootIdsForMerge = new Set((tree[0].children ?? []).map(n => n.id));
    for (const group of findMergeableFolders(folders)) {
      const mergeable = group.filter(f => !rootIdsForMerge.has(f.id));
      if (mergeable.length < 2) continue;
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
    }

    // Suggest folders for bookmarks sitting directly in root folders (uncategorized).
    const rootIds = new Set((tree[0].children ?? []).map(n => n.id));
    // Cap at 10 so a slow on-device model can't stall the analyze pass.
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

    // Suggest tags for up to 10 untagged bookmarks (on-device model).
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
            await saveTags();
          }
        );
      }
    }

    // Offer to split the most crowded user folder into AI-proposed subfolders.
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
            for (const id of group.bookmarkIds) {
              await chrome.bookmarks.move(id, { parentId: created.id });
            }
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
