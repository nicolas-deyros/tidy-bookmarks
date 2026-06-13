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

export function recommendMethodology(bookmarks) {
  const n = bookmarks.length;
  if (n === 0) return 'flat';
  if (n <= 5) return 'recency';
  const domains = new Set(bookmarks.filter(b => b.url).map(b => domainOf(b.url)));
  const variety = domains.size / n;
  return variety >= 0.8 ? 'topic' : 'para';
}
