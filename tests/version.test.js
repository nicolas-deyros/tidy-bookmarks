import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('version consistency', () => {
  const manifest = JSON.parse(readFileSync('manifest.json', 'utf8')).version;
  it('CHROMEWEBSTORE.md documents the manifest version', () => {
    expect(readFileSync('CHROMEWEBSTORE.md', 'utf8')).toContain(`**Version:** ${manifest}`);
  });
  it('CHANGELOG.md has an entry for the manifest version', () => {
    expect(readFileSync('CHANGELOG.md', 'utf8')).toContain(`## [${manifest}]`);
  });
});
