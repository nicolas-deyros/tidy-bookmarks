import { describe, it, expect } from 'vitest';
import { planFlat, planByRecency } from '../src/reorg.js';

const now = Date.UTC(2026, 0, 31); // 2026-01-31
const day = 86400000;
const bookmarks = [
  { id: 'a', title: 'fresh', url: 'https://a.com', dateAdded: now - 5 * day },
  { id: 'b', title: 'mid', url: 'https://b.com', dateAdded: now - 90 * day },
  { id: 'c', title: 'old', url: 'https://c.com', dateAdded: now - 800 * day }
];

describe('planFlat', () => {
  it('returns one (root) group with every bookmark id', () => {
    expect(planFlat(bookmarks)).toEqual([{ name: '(root)', bookmarkIds: ['a', 'b', 'c'] }]);
  });
  it('returns [] for an empty folder', () => {
    expect(planFlat([])).toEqual([]);
  });
});

describe('planByRecency', () => {
  it('buckets by dateAdded into Recent/Older/Archive', () => {
    expect(planByRecency(bookmarks, now)).toEqual([
      { name: 'Recent', bookmarkIds: ['a'] },
      { name: 'Older', bookmarkIds: ['b'] },
      { name: 'Archive', bookmarkIds: ['c'] }
    ]);
  });
  it('omits empty buckets', () => {
    const onlyFresh = [{ id: 'a', url: 'https://a.com', dateAdded: now }];
    expect(planByRecency(onlyFresh, now)).toEqual([{ name: 'Recent', bookmarkIds: ['a'] }]);
  });
});
