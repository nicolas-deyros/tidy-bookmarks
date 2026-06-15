import { countContents } from '../src/tree.js';

function directBookmarkCount(folder) {
  return (folder.children ?? []).filter(c => c.url).length;
}

export function renderRail(container, ctx) {
  container.replaceChildren();
  const roots = ctx.tree[0].children ?? [];
  const rootIds = new Set(roots.map(r => r.id));

  const bar = document.createElement('div');
  bar.className = 'rail-toolbar';
  const newBtn = document.createElement('button');
  newBtn.className = 'rail-new'; newBtn.textContent = '+ New folder';
  newBtn.addEventListener('click', () => startNewFolder(bar, newBtn, ctx));
  bar.appendChild(newBtn);
  container.appendChild(bar);

  const ul = document.createElement('ul');
  ul.className = 'folder-children';
  for (const root of roots) ul.appendChild(folderNode(root, ctx, rootIds));
  container.appendChild(ul);
}

function folderNode(folder, ctx, rootIds) {
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

  // Permanent roots (Bookmarks bar, Other bookmarks, …) can't be renamed/deleted.
  if (!rootIds.has(folder.id)) {
    const actions = document.createElement('span');
    actions.className = 'folder-actions';
    const ren = document.createElement('button');
    ren.className = 'folder-act'; ren.textContent = '✎'; ren.title = 'Rename folder';
    ren.addEventListener('click', e => { e.stopPropagation(); startRename(name, folder, ctx); });
    const del = document.createElement('button');
    del.className = 'folder-act'; del.textContent = '🗑'; del.title = 'Delete folder';
    del.addEventListener('click', e => { e.stopPropagation(); deleteFolder(folder, ctx); });
    actions.append(ren, del);
    row.appendChild(actions);
  }

  row.addEventListener('click', () => ctx.selectFolder(folder.id));

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
      if (!child.url) childUl.appendChild(folderNode(child, ctx, rootIds));
    }
    li.appendChild(childUl);
  }
  return li;
}

// Replace a node with an inline text input; commit on Enter, cancel on Esc/blur.
function inlineEdit(target, { value = '', placeholder = '', onCommit }) {
  const input = document.createElement('input');
  input.className = 'rail-input';
  input.value = value;
  input.placeholder = placeholder;
  target.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = async commit => {
    if (done) return;
    done = true;
    if (commit) await onCommit(input.value.trim());
    else await onCommit(null);
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(false));
  input.addEventListener('click', e => e.stopPropagation());
}

function startNewFolder(bar, newBtn, ctx) {
  const parentId = ctx.uiState.selected || ctx.tree[0].children?.[0]?.id;
  if (!parentId) return;
  inlineEdit(newBtn, {
    placeholder: 'Folder name…',
    onCommit: async title => {
      if (title) await chrome.bookmarks.create({ parentId, title });
      await ctx.refresh();
    }
  });
}

function startRename(nameSpan, folder, ctx) {
  inlineEdit(nameSpan, {
    value: folder.title || '',
    onCommit: async title => {
      if (title && title !== folder.title) await chrome.bookmarks.update(folder.id, { title });
      await ctx.refresh();
    }
  });
}

async function deleteFolder(folder, ctx) {
  const { bookmarks, folders } = countContents(folder);
  const detail = bookmarks || folders
    ? `Deletes "${folder.title}" and everything inside: ${bookmarks} bookmark(s), ${folders} subfolder(s). This can't be undone.`
    : `Deletes the empty folder "${folder.title}".`;
  if (!await ctx.confirm('Delete folder?', detail)) return;
  await chrome.bookmarks.removeTree(folder.id); // removeTree handles non-empty folders
  if (ctx.uiState.selected === folder.id) ctx.uiState.selected = '';
  await ctx.refresh();
}
