import { describe, it, expect } from 'vitest';
import { findDuplicates, suggestFolderByRules } from '../src/suggestions.js';

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
