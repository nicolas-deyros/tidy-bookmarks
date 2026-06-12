import { describe, it, expect } from 'vitest';
import { isSafeUrl, normalizeUrl, domainOf } from '../src/url-utils.js';

describe('isSafeUrl', () => {
  it('accepts http and https', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('http://example.com/a?b=1')).toBe(true);
  });
  it('rejects javascript:, data:, chrome:, and garbage', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>x</script>')).toBe(false);
    expect(isSafeUrl('chrome://settings')).toBe(false);
    expect(isSafeUrl('not a url')).toBe(false);
    expect(isSafeUrl(undefined)).toBe(false);
  });
});

describe('normalizeUrl', () => {
  it('strips hash and trailing slash, lowercases host', () => {
    expect(normalizeUrl('https://Example.com/Path/#section')).toBe('https://example.com/Path');
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
  });
  it('returns the input string when unparseable', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
  });
});

describe('domainOf', () => {
  it('extracts hostname without www', () => {
    expect(domainOf('https://www.github.com/x')).toBe('github.com');
    expect(domainOf('https://news.ycombinator.com')).toBe('news.ycombinator.com');
  });
  it('returns empty string for invalid input', () => {
    expect(domainOf('nope')).toBe('');
    expect(domainOf(undefined)).toBe('');
  });
});
