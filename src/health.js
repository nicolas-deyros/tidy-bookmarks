import { flattenBookmarks, listFolders, findEmptyFolders, findSingleItemFolders } from './tree.js';
import { findDuplicates, findNearDuplicates, findMergeableFolders, findStaleBookmarks } from './suggestions.js';

// Optionally scope to one folder subtree; default = whole tree.
function scopedTree(tree, scopeId) {
  if (!scopeId) return tree;
  const find = nodes => {
    for (const n of nodes) {
      if (n.id === scopeId) return [n];
      if (n.children) { const r = find(n.children); if (r) return r; }
    }
    return null;
  };
  return find(tree) ?? tree;
}

export function buildHealthReport({ tree, now = Date.now(), scopeId = '' } = {}) {
  const scope = scopedTree(tree, scopeId);
  const flat = flattenBookmarks(scope);
  const folders = listFolders(scope);
  const rootIds = new Set((tree[0]?.children ?? []).map(n => n.id));

  const dupExtras = findDuplicates(flat).reduce((n, g) => n + g.length - 1, 0);
  const nearGroups = findNearDuplicates(flat).length;
  const empty = findEmptyFolders(scope).length;
  const single = findSingleItemFolders(scope).length;
  const mergeGroups = findMergeableFolders(folders.filter(f => !rootIds.has(f.id))).length;
  const stale = findStaleBookmarks(flat, { now }).length;
  const loose = flat.filter(b => rootIds.has(b.parentId)).length;

  const cleanup = [
    { id: 'duplicates', title: 'Duplicates', description: 'Exact same URL saved more than once.', count: dupExtras, priority: 'high' },
    { id: 'nearDuplicates', title: 'Near-duplicates', description: 'Same page, URLs differ only by tracking / slash / www.', count: nearGroups, priority: 'med' },
    { id: 'empty', title: 'Empty folders', description: 'Folders with nothing inside.', count: empty, priority: 'med' },
    { id: 'single', title: 'Single-item folders', description: 'A folder holding just one bookmark.', count: single, priority: 'low' },
    { id: 'merge', title: 'Same-name folders', description: 'Folders with identical names to merge.', count: mergeGroups, priority: 'low' },
    { id: 'stale', title: 'Stale bookmarks', description: 'Added 4+ years ago. Review and prune.', count: stale, priority: 'low' },
    { id: 'loose', title: 'Loose items', description: 'Bookmarks sitting at the top level.', count: loose, priority: 'med' }
  ].map(c => ({ ...c, group: 'cleanup', kind: 'instant' }));

  const ai = [
    { id: 'fileLoose', title: 'File loose items', description: 'Bookmarks sitting loose at the top level — AI suggests a folder for each.', action: 'Scan' },
    { id: 'tags', title: 'Suggest tags', description: 'Untagged bookmarks — AI proposes a few topic tags you can pick from.', action: 'Scan' },
    { id: 'tidy', title: 'Tidy a folder', description: 'Pick your most crowded folder; AI splits it into topic subfolders.', action: 'Scan' },
    { id: 'similar', title: 'Similar-topic folders', description: 'Folders that mean the same thing (e.g. Dev + Coding) — AI suggests merging them.', action: 'Scan' }
  ].map(c => ({ ...c, group: 'ai', kind: 'ai', count: null, priority: 'med' }));

  const rank = { high: 0, med: 1, low: 2 };
  cleanup.sort((a, b) => rank[a.priority] - rank[b.priority]);
  return [...cleanup, ...ai];
}
