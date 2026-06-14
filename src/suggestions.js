import { normalizeUrl, domainOf, looseNormalizeUrl } from './url-utils.js';

export function findDuplicates(flat) {
  const byUrl = new Map();
  for (const b of flat) {
    const key = normalizeUrl(b.url);
    if (!byUrl.has(key)) byUrl.set(key, []);
    byUrl.get(key).push(b);
  }
  return [...byUrl.values()].filter(group => group.length > 1);
}

// Same page saved more than once where the exact URLs differ only by tracking
// params, trailing slash, www, or scheme. Exact dups belong to findDuplicates.
export function findNearDuplicates(flat) {
  const byLoose = new Map();
  for (const b of flat) {
    const key = looseNormalizeUrl(b.url);
    if (!byLoose.has(key)) byLoose.set(key, []);
    byLoose.get(key).push(b);
  }
  return [...byLoose.values()].filter(group => {
    if (group.length < 2) return false;
    const exact = new Set(group.map(b => normalizeUrl(b.url)));
    return exact.size > 1;
  });
}

const FOUR_YEARS_MS = 4 * 365 * 24 * 60 * 60 * 1000;

// Bookmarks added long ago (by dateAdded only — no history, no network), oldest first.
export function findStaleBookmarks(flat, { now = Date.now(), thresholdMs = FOUR_YEARS_MS } = {}) {
  const cutoff = now - thresholdMs;
  return flat
    .filter(b => typeof b.dateAdded === 'number' && b.dateAdded < cutoff)
    .sort((a, b) => a.dateAdded - b.dateAdded);
}

export function suggestFolderByRules(bookmark, folders) {
  const domain = domainOf(bookmark.url);
  for (const folder of folders) {
    const domains = (folder.children ?? []).filter(c => c.url).map(c => domainOf(c.url));
    if (domain && domains.includes(domain)) return folder;
  }
  const title = (bookmark.title || '').toLowerCase();
  for (const folder of folders) {
    if (folder.title && title.includes(folder.title.toLowerCase())) return folder;
  }
  return null;
}

export function findMergeableFolders(folders) {
  const byName = new Map();
  for (const f of folders) {
    const key = (f.title || '').trim().toLowerCase();
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(f);
  }
  return [...byName.values()].filter(group => group.length > 1);
}
