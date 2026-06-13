import { describe, it, expect } from 'vitest';
import { sanitizeTag, addTag, removeTag, tagsFor, allTags, pruneTags } from '../src/tags.js';

describe('sanitizeTag', () => {
  it('trims, collapses whitespace, lowercases, strips control chars, caps at 30', () => {
    expect(sanitizeTag('  Web   Dev ')).toBe('web dev');
    expect(sanitizeTag('Bad Tag')).toBe('bad tag');
    expect(sanitizeTag('x'.repeat(50))).toHaveLength(30);
  });
  it('returns null for empty or non-string input', () => {
    expect(sanitizeTag('   ')).toBeNull();
    expect(sanitizeTag(undefined)).toBeNull();
  });
});

describe('addTag / removeTag (immutable)', () => {
  it('adds a sanitized tag without mutating the input', () => {
    const before = {};
    const after = addTag(before, '10', 'Reading');
    expect(after).toEqual({ '10': ['reading'] });
    expect(before).toEqual({});
  });
  it('does not add duplicates', () => {
    const m = addTag(addTag({}, '10', 'reading'), '10', 'READING');
    expect(m['10']).toEqual(['reading']);
  });
  it('ignores unsanitizable tags', () => {
    expect(addTag({}, '10', '   ')).toEqual({});
  });
  it('removes a tag and drops the key when the last tag is gone', () => {
    const m = addTag({}, '10', 'reading');
    expect(removeTag(m, '10', 'reading')).toEqual({});
  });
});

describe('tagsFor', () => {
  it('returns the tag array or empty array', () => {
    expect(tagsFor({ '10': ['a', 'b'] }, '10')).toEqual(['a', 'b']);
    expect(tagsFor({}, '99')).toEqual([]);
  });
});

describe('allTags', () => {
  it('returns unique tags sorted alphabetically with counts', () => {
    const m = { '1': ['dev', 'news'], '2': ['dev'] };
    expect(allTags(m)).toEqual([{ tag: 'dev', count: 2 }, { tag: 'news', count: 1 }]);
  });
});

describe('pruneTags', () => {
  it('drops entries for bookmark ids that no longer exist', () => {
    const m = { '1': ['a'], '2': ['b'] };
    expect(pruneTags(m, ['1'])).toEqual({ '1': ['a'] });
  });
});
