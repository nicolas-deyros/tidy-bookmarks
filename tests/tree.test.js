import { describe, it, expect } from 'vitest';
import { flattenBookmarks, listFolders, findEmptyFolders, countContents } from '../src/tree.js';

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
  it('never returns Chrome\'s permanent root folders (they cannot be deleted)', () => {
    const withEmptyRoot = [{
      id: '0', title: '',
      children: [
        { id: '1', title: 'Bookmarks bar', parentId: '0', children: [] },
        { id: '2', title: 'Other bookmarks', parentId: '0', children: [] }
      ]
    }];
    expect(findEmptyFolders(withEmptyRoot)).toEqual([]);
  });
});

describe('countContents', () => {
  it('counts descendant bookmarks and folders recursively', () => {
    const folder = { id: 'f', title: 'Dev', children: [
      { id: 'b1', title: 'A', url: 'https://a.com' },
      { id: 'sub', title: 'Sub', children: [
        { id: 'b2', title: 'B', url: 'https://b.com' },
        { id: 'b3', title: 'C', url: 'https://c.com' }
      ] }
    ] };
    expect(countContents(folder)).toEqual({ bookmarks: 3, folders: 1 });
  });
  it('returns zeros for an empty folder', () => {
    expect(countContents({ id: 'e', title: 'Empty', children: [] })).toEqual({ bookmarks: 0, folders: 0 });
  });
});
