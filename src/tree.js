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
