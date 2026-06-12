import { describe, it, expect } from 'vitest';
import { sortChildren, SORT_MODES } from '../src/sorting.js';

const children = [
  { id: 'b', title: 'zeta', url: 'https://zeta.org', dateAdded: 3 },
  { id: 'f1', title: 'Work', children: [] },
  { id: 'a', title: 'Alpha', url: 'https://www.alpha.com', dateAdded: 1 },
  { id: 'f2', title: 'archive', children: [] },
  { id: 'c', title: 'beta', url: 'https://beta.com/x', dateAdded: 2 }
];

describe('sortChildren', () => {
  it('puts folders first (alphabetical, case-insensitive), then links', () => {
    const ids = sortChildren(children, 'alphabetical').map(n => n.id);
    expect(ids).toEqual(['f2', 'f1', 'a', 'c', 'b']);
  });
  it('sorts links newest-first by dateAdded', () => {
    const ids = sortChildren(children, 'dateAdded').map(n => n.id);
    expect(ids).toEqual(['f2', 'f1', 'b', 'c', 'a']);
  });
  it('sorts links by domain', () => {
    const ids = sortChildren(children, 'domain').map(n => n.id);
    expect(ids).toEqual(['f2', 'f1', 'a', 'c', 'b']);
  });
  it('does not mutate the input array', () => {
    const copy = [...children];
    sortChildren(children, 'alphabetical');
    expect(children).toEqual(copy);
  });
  it('exposes the available modes', () => {
    expect(SORT_MODES).toEqual(['alphabetical', 'dateAdded', 'domain']);
  });
});
