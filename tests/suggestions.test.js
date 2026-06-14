import { describe, it, expect } from 'vitest';
import { findDuplicates, suggestFolderByRules, findMergeableFolders, findNearDuplicates, findStaleBookmarks } from '../src/suggestions.js';

describe('findDuplicates', () => {
  it('groups bookmarks whose normalized URLs match', () => {
    const flat = [
      { id: '1', title: 'A', url: 'https://example.com/page' },
      { id: '2', title: 'B', url: 'https://example.com/page/#top' },
      { id: '3', title: 'C', url: 'https://other.com' }
    ];
    const groups = findDuplicates(flat);
    expect(groups).toHaveLength(1);
    expect(groups[0].map(b => b.id)).toEqual(['1', '2']);
  });
  it('returns empty array when no duplicates', () => {
    expect(findDuplicates([{ id: '1', url: 'https://a.com' }])).toEqual([]);
  });
});

describe('findNearDuplicates', () => {
  it('groups same page with differing tracking/slash, excluding exact dups', () => {
    const flat = [
      { id: '1', url: 'https://x.com/p?utm_source=a' },
      { id: '2', url: 'https://www.x.com/p/' },
      { id: '3', url: 'https://x.com/other' },
      { id: '4', url: 'https://x.com/p' },
      { id: '5', url: 'https://x.com/p' } // exact dup of 4 -> not a NEAR dup
    ];
    const groups = findNearDuplicates(flat);
    expect(groups.length).toBe(1);
    const ids = groups[0].map(b => b.id).sort();
    expect(ids).toEqual(['1', '2', '4', '5']);
  });
  it('returns nothing when only exact duplicates exist', () => {
    const flat = [
      { id: '1', url: 'https://x.com/p' },
      { id: '2', url: 'https://x.com/p' }
    ];
    expect(findNearDuplicates(flat)).toEqual([]);
  });
});

describe('findStaleBookmarks', () => {
  const now = Date.UTC(2026, 0, 1);
  const yr = 365 * 24 * 60 * 60 * 1000;
  const flat = [
    { id: 'old', dateAdded: now - 5 * yr, url: 'https://a' },
    { id: 'recent', dateAdded: now - 1 * yr, url: 'https://b' },
    { id: 'older', dateAdded: now - 8 * yr, url: 'https://c' }
  ];
  it('returns bookmarks older than threshold, oldest first', () => {
    const r = findStaleBookmarks(flat, { now, thresholdMs: 4 * yr });
    expect(r.map(b => b.id)).toEqual(['older', 'old']);
  });
  it('ignores entries without dateAdded', () => {
    expect(findStaleBookmarks([{ id: 'x', url: 'https://x' }], { now, thresholdMs: yr })).toEqual([]);
  });
});

describe('suggestFolderByRules', () => {
  const folders = [
    { id: 'f1', title: 'Dev', children: [{ url: 'https://github.com/x' }, { url: 'https://stackoverflow.com/q' }] },
    { id: 'f2', title: 'Recipes', children: [{ url: 'https://recipes.example.com/1' }] }
  ];
  it('suggests the folder already containing the same domain', () => {
    const s = suggestFolderByRules({ title: 'Repo', url: 'https://github.com/y' }, folders);
    expect(s.id).toBe('f1');
  });
  it('suggests a folder whose title appears in the bookmark title', () => {
    const s = suggestFolderByRules({ title: 'Best recipes for pasta', url: 'https://pasta.io' }, folders);
    expect(s.id).toBe('f2');
  });
  it('returns null when nothing matches', () => {
    expect(suggestFolderByRules({ title: 'Weather', url: 'https://weather.io' }, folders)).toBeNull();
  });
});

describe('findMergeableFolders', () => {
  it('groups folders that share a case-insensitive title', () => {
    const folders = [
      { id: 'a', title: 'Dev' },
      { id: 'b', title: 'dev' },
      { id: 'c', title: 'Recipes' }
    ];
    const groups = findMergeableFolders(folders);
    expect(groups).toHaveLength(1);
    expect(groups[0].map(f => f.id)).toEqual(['a', 'b']);
  });
  it('ignores untitled folders and returns [] when nothing matches', () => {
    expect(findMergeableFolders([{ id: 'a', title: 'Dev' }, { id: 'b', title: '' }])).toEqual([]);
  });
});
