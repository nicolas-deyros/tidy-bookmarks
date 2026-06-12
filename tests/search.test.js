import { describe, it, expect } from 'vitest';
import { searchBookmarks } from '../src/search.js';

const flat = [
  { id: '1', title: 'React docs', url: 'https://react.dev', path: 'Dev / Frontend' },
  { id: '2', title: 'Cooking pasta', url: 'https://recipes.example.com/pasta', path: 'Recipes' },
  { id: '3', title: 'Vue guide', url: 'https://vuejs.org/guide', path: 'Dev / Frontend' }
];

describe('searchBookmarks', () => {
  it('matches title case-insensitively', () => {
    expect(searchBookmarks(flat, 'react').map(b => b.id)).toEqual(['1']);
  });
  it('matches url and folder path', () => {
    expect(searchBookmarks(flat, 'recipes').map(b => b.id)).toEqual(['2']);
    expect(searchBookmarks(flat, 'frontend').map(b => b.id)).toEqual(['1', '3']);
  });
  it('requires all words to match (topic search)', () => {
    expect(searchBookmarks(flat, 'dev guide').map(b => b.id)).toEqual(['3']);
  });
  it('returns empty array for blank query', () => {
    expect(searchBookmarks(flat, '   ')).toEqual([]);
  });
});
