function walk(nodes, path, visit) {
  for (const node of nodes) {
    visit(node, path);
    if (node.children) {
      const next = node.title ? [...path, node.title] : path;
      walk(node.children, next, visit);
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
  walk(tree, [], (node) => {
    if (!node.url && node.title && node.children && node.children.length === 0) out.push(node);
  });
  return out;
}
