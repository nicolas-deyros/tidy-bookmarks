import { describe, it, expect } from 'vitest';
import { planFlat, planByRecency, recommendMethodology, parseMethodologyPlan, snapshotSubtree, planUndo } from '../src/reorg.js';

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

describe('recommendMethodology', () => {
  it('recommends topic when domains are highly varied', () => {
    const varied = Array.from({ length: 10 }, (_, i) => ({ id: String(i), url: `https://site${i}.com` }));
    expect(recommendMethodology(varied)).toBe('topic');
  });
  it('recommends recency for a small set', () => {
    const few = [{ id: '1', url: 'https://a.com' }, { id: '2', url: 'https://a.com' }];
    expect(recommendMethodology(few)).toBe('recency');
  });
  it('recommends para for a larger mixed set with repeated domains', () => {
    const mixed = Array.from({ length: 12 }, (_, i) => ({ id: String(i), url: `https://site${i % 3}.com` }));
    expect(recommendMethodology(mixed)).toBe('para');
  });
  it('defaults to flat for an empty folder', () => {
    expect(recommendMethodology([])).toBe('flat');
  });
});

const planBks = [
  { id: 'b1', title: 'A', url: 'https://a.com' },
  { id: 'b2', title: 'B', url: 'https://b.com' },
  { id: 'b3', title: 'C', url: 'https://c.com' }
];

describe('parseMethodologyPlan', () => {
  it('maps numbers to ids and sanitizes names', () => {
    expect(parseMethodologyPlan('Projects: 1, 3\nAreas: 2', planBks, 'para')).toEqual([
      { name: 'Projects', bookmarkIds: ['b1', 'b3'] },
      { name: 'Areas', bookmarkIds: ['b2'] }
    ]);
  });
  it('drops out-of-range numbers and unparseable lines', () => {
    expect(parseMethodologyPlan('junk\nGood: 2, 99', planBks, 'topic')).toEqual([
      { name: 'Good', bookmarkIds: ['b2'] }
    ]);
  });
  it('de-duplicates an id across groups (first group wins)', () => {
    expect(parseMethodologyPlan('One: 1, 2\nTwo: 2, 3', planBks, 'topic')).toEqual([
      { name: 'One', bookmarkIds: ['b1', 'b2'] },
      { name: 'Two', bookmarkIds: ['b3'] }
    ]);
  });
  it('returns [] for non-string input', () => {
    expect(parseMethodologyPlan(undefined, planBks, 'topic')).toEqual([]);
  });
});

const undoFolder = { id: 'F', title: 'Dev', children: [
  { id: 'b1', title: 'A', url: 'https://a.com' },
  { id: 'b2', title: 'B', url: 'https://b.com' },
  { id: 'sub', title: 'Old', children: [
    { id: 'b3', title: 'C', url: 'https://c.com' }
  ] }
] };

describe('snapshotSubtree', () => {
  it('records id, parentId, index, title for every descendant', () => {
    expect(snapshotSubtree(undoFolder)).toEqual([
      { id: 'b1', parentId: 'F', index: 0, title: 'A' },
      { id: 'b2', parentId: 'F', index: 1, title: 'B' },
      { id: 'sub', parentId: 'F', index: 2, title: 'Old' },
      { id: 'b3', parentId: 'sub', index: 0, title: 'C' }
    ]);
  });
});

describe('planUndo', () => {
  it('returns moves restoring each snapshot entry to its recorded parent/index', () => {
    const snapshot = [
      { id: 'b1', parentId: 'F', index: 0, title: 'A' },
      { id: 'b3', parentId: 'sub', index: 0, title: 'C' }
    ];
    const currentTree = [{ id: '0', children: [
      { id: 'F', children: [
        { id: 'New', children: [{ id: 'b1', url: 'https://a.com' }] }
      ] },
      { id: 'sub', children: [{ id: 'b3', url: 'https://c.com' }] }
    ] }];
    expect(planUndo(snapshot, currentTree)).toEqual([
      { id: 'b1', parentId: 'F', index: 0 },
      { id: 'b3', parentId: 'sub', index: 0 }
    ]);
  });
  it('skips entries whose id no longer exists', () => {
    const snapshot = [{ id: 'gone', parentId: 'F', index: 0, title: 'X' }];
    const currentTree = [{ id: '0', children: [{ id: 'F', children: [] }] }];
    expect(planUndo(snapshot, currentTree)).toEqual([]);
  });
  it('skips entries whose recorded parent no longer exists (e.g. a folder Flat deleted)', () => {
    const snapshot = [{ id: 'b3', parentId: 'sub', index: 0, title: 'C' }];
    const currentTree = [{ id: '0', children: [{ id: 'F', children: [{ id: 'b3', url: 'https://c.com' }] }] }];
    expect(planUndo(snapshot, currentTree)).toEqual([]);
  });
});
