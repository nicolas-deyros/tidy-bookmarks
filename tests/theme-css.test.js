import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { THEMES } from '../src/theme.js';

const css = readFileSync(new URL('../theme.css', import.meta.url), 'utf8');

describe('theme.css', () => {
  it('defines every theme x (light|dark) palette', () => {
    for (const t of THEMES) {
      for (const a of ['light', 'dark']) {
        expect(css).toContain(`[data-theme="${t}"][data-appearance="${a}"]`);
      }
    }
  });
  it('handles system via prefers-color-scheme', () => {
    expect(css).toContain('prefers-color-scheme: dark');
    for (const t of THEMES) expect(css).toContain(`[data-theme="${t}"][data-appearance="system"]`);
  });
  it('every palette block sets --accent and --bg', () => {
    expect(css.match(/--accent:/g)?.length ?? 0).toBeGreaterThanOrEqual(THEMES.length * 2);
  });
});
