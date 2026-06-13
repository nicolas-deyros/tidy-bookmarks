import { normalizeUrl, domainOf } from './url-utils.js';

export function findDuplicates(flat) {
  const byUrl = new Map();
  for (const b of flat) {
    const key = normalizeUrl(b.url);
    if (!byUrl.has(key)) byUrl.set(key, []);
    byUrl.get(key).push(b);
  }
  return [...byUrl.values()].filter(group => group.length > 1);
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
