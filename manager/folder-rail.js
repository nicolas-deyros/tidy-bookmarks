function directBookmarkCount(folder) {
  return (folder.children ?? []).filter(c => c.url).length;
}

export function renderRail(container, ctx) {
  container.replaceChildren();
  const roots = ctx.tree[0].children ?? [];
  const ul = document.createElement('ul');
  ul.className = 'folder-children';
  for (const root of roots) ul.appendChild(folderNode(root, ctx));
  container.appendChild(ul);
}

function folderNode(folder, ctx) {
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
      if (!child.url) childUl.appendChild(folderNode(child, ctx));
    }
    li.appendChild(childUl);
  }
  return li;
}
