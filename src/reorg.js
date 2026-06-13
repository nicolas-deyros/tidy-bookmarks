import { domainOf } from './url-utils.js';

const DAY = 86400000;

export function planFlat(bookmarks) {
  if (bookmarks.length === 0) return [];
  return [{ name: '(root)', bookmarkIds: bookmarks.map(b => b.id) }];
}

export function planByRecency(bookmarks, now) {
  const buckets = { Recent: [], Older: [], Archive: [] };
  for (const b of bookmarks) {
    const age = now - (b.dateAdded ?? 0);
    if (age <= 30 * DAY) buckets.Recent.push(b.id);
    else if (age <= 365 * DAY) buckets.Older.push(b.id);
    else buckets.Archive.push(b.id);
  }
  return ['Recent', 'Older', 'Archive']
    .filter(name => buckets[name].length > 0)
    .map(name => ({ name, bookmarkIds: buckets[name] }));
}

function sanitizeName(name) {
  if (typeof name !== 'string') return null;
  const cleaned = [...name]
    .filter(ch => { const c = ch.codePointAt(0); return c >= 0x20 && c !== 0x7f; })
    .join('')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim()
    .slice(0, 40);
  return cleaned || null;
}

export function parseMethodologyPlan(response, bookmarks) {
  if (typeof response !== 'string') return [];
  const used = new Set();
  const groups = [];
  for (const line of response.split('\n')) {
    const m = line.match(/^\s*(.+?):\s*([\d,\s]+)$/);
    if (!m) continue;
    const name = sanitizeName(m[1]);
    if (!name) continue;
    const ids = [];
    for (const part of m[2].split(',')) {
      const num = Number.parseInt(part.trim(), 10);
      if (!Number.isInteger(num) || num < 1 || num > bookmarks.length) continue;
      const id = bookmarks[num - 1].id;
      if (used.has(id)) continue;
      used.add(id);
      ids.push(id);
    }
    if (ids.length) groups.push({ name, bookmarkIds: ids });
  }
  return groups;
}

export function recommendMethodology(bookmarks) {
  const n = bookmarks.length;
  if (n === 0) return 'flat';
  if (n <= 5) return 'recency';
  const domains = new Set(bookmarks.filter(b => b.url).map(b => domainOf(b.url)));
  const variety = domains.size / n;
  return variety >= 0.8 ? 'topic' : 'para';
}

export function snapshotSubtree(folder) {
  const out = [];
  function walk(parent) {
    (parent.children ?? []).forEach((node, index) => {
      out.push({ id: node.id, parentId: parent.id, index, title: node.title });
      if (node.children) walk(node);
    });
  }
  walk(folder);
  return out;
}

export function planUndo(snapshot, currentTree) {
  const existing = new Set();
  (function collect(nodes) {
    for (const n of nodes) {
      existing.add(n.id);
      if (n.children) collect(n.children);
    }
  })(currentTree);
  return snapshot
    .filter(entry => existing.has(entry.id) && existing.has(entry.parentId))
    .map(entry => ({ id: entry.id, parentId: entry.parentId, index: entry.index }));
}
