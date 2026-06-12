import { describe, it, expect } from 'vitest';
import { flattenBookmarks, listFolders, findEmptyFolders } from '../src/tree.js';

const tree = [{
  id: '0', title: '',
  children: [{
    id: '1', title: 'Bookmarks bar',
    children: [
      { id: '10', title: 'Dev', parentId: '1', children: [
        { id: '100', title: 'GitHub', url: 'https://github.com', parentId: '10', dateAdded: 2 },
        { id: '101', title: 'Empty sub', parentId: '10', children: [] }
      ]},
      { id: '11', title: 'News HN', url: 'https://news.ycombinator.com', parentId: '1', dateAdded: 1 }
    ]
  }]
}];

describe('flattenBookmarks', () => {
  it('returns only url nodes, with folder path attached', () => {
    const flat = flattenBookmarks(tree);
    expect(flat).toHaveLength(2);
    expect(flat[0]).toMatchObject({ id: '100', path: 'Bookmarks bar / Dev' });
    expect(flat[1]).toMatchObject({ id: '11', path: 'Bookmarks bar' });
  });
});

describe('listFolders', () => {
  it('returns all folders except roots, with path', () => {
    const folders = listFolders(tree);
    expect(folders.map(f => f.title)).toEqual(['Bookmarks bar', 'Dev', 'Empty sub']);
  });
});

describe('findEmptyFolders', () => {
  it('finds folders with no children', () => {
    expect(findEmptyFolders(tree).map(f => f.id)).toEqual(['101']);
  });
});
