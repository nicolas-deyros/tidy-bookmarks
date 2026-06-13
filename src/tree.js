function walk(nodes, path, visit, depth = 0) {
  for (const node of nodes) {
    visit(node, path, depth);
    if (node.children) {
      const next = node.title ? [...path, node.title] : path;
      walk(node.children, next, visit, depth + 1);
    }
  }
}

export function flattenBookmarks(tree) {
  const out = [];
  walk(tree, [], (node, path) => {
    if (node.url) out.push({ ...node, path: path.join(' / ') });
  });
  return out;
}

export function listFolders(tree) {
  const out = [];
  walk(tree, [], (node, path) => {
    if (!node.url && node.title) out.push({ ...node, path: path.join(' / ') });
  });
  return out;
}

export function findEmptyFolders(tree) {
  const out = [];
  // depth 0 = the absolute root; depth 1 = Chrome's permanent root folders
  // (Bookmarks bar, Other bookmarks, …) which cannot be deleted. Only deeper
  // user-created folders are eligible for an "empty folder" suggestion.
  walk(tree, [], (node, _path, depth) => {
    if (depth > 1 && !node.url && node.title && node.children && node.children.length === 0) out.push(node);
  });
  return out;
}

export function countContents(folder) {
  let bookmarks = 0;
  let folders = 0;
  for (const child of folder.children ?? []) {
    if (child.url) {
      bookmarks++;
    } else {
      folders++;
      const sub = countContents(child);
      bookmarks += sub.bookmarks;
      folders += sub.folders;
    }
  }
  return { bookmarks, folders };
}

function findNode(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function subtreeHas(node, id) {
  if (node.id === id) return true;
  for (const c of node.children ?? []) {
    if (subtreeHas(c, id)) return true;
  }
  return false;
}

export function isDescendant(tree, ancestorId, nodeId) {
  if (ancestorId === nodeId) return true;
  const ancestor = findNode(tree, ancestorId);
  return ancestor ? subtreeHas(ancestor, nodeId) : false;
}

export function dropIndex(orderedIds, draggedId, beforeId) {
  const without = orderedIds.filter(id => id !== draggedId);
  if (beforeId == null) return without.length;
  const idx = without.indexOf(beforeId);
  return idx === -1 ? without.length : idx;
}
