import { describe, it, expect } from 'vitest';
import { THEMES, APPEARANCES, resolveAppearance, normalizeThemePref, migrateLegacyTheme } from '../src/theme.js';

describe('theme', () => {
  it('exposes the allowlists', () => {
    expect(THEMES).toEqual(['quiet', 'vivid', 'deck']);
    expect(APPEARANCES).toEqual(['light', 'dark', 'system']);
  });
  it('resolves system by OS preference', () => {
    expect(resolveAppearance('system', true)).toBe('dark');
    expect(resolveAppearance('system', false)).toBe('light');
    expect(resolveAppearance('dark', false)).toBe('dark');
  });
  it('normalizes unknown values to defaults', () => {
    expect(normalizeThemePref({ theme: 'bogus', appearance: 'x' })).toEqual({ theme: 'quiet', appearance: 'system' });
    expect(normalizeThemePref({ theme: 'deck', appearance: 'dark' })).toEqual({ theme: 'deck', appearance: 'dark' });
  });
  it('migrates the legacy light/dark/auto value', () => {
    expect(migrateLegacyTheme('auto')).toEqual({ theme: 'quiet', appearance: 'system' });
    expect(migrateLegacyTheme('dark')).toEqual({ theme: 'quiet', appearance: 'dark' });
    expect(migrateLegacyTheme('light')).toEqual({ theme: 'quiet', appearance: 'light' });
  });
});
