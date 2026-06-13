import { describe, it, expect } from 'vitest';
import { buildPrompt, sanitizeFolderName, parseSuggestion, suggestFolder } from '../src/ai.js';

const folders = [{ id: 'f1', title: 'Dev' }, { id: 'f2', title: 'Recipes' }];

describe('buildPrompt', () => {
  it('includes title, domain, the folder allowlist, and the NEW option', () => {
    const p = buildPrompt({ title: 'GitHub', url: 'https://github.com' }, folders);
    expect(p).toContain('GitHub');
    expect(p).toContain('github.com');
    expect(p).toContain('Dev');
    expect(p).toContain('Recipes');
    expect(p).toContain('NEW:');
  });
});

describe('sanitizeFolderName', () => {
  it('trims, strips quotes and control characters, caps length at 40', () => {
    expect(sanitizeFolderName(' "Machine Learning" ')).toBe('Machine Learning');
    expect(sanitizeFolderName('a'.repeat(100))).toHaveLength(40);
    expect(sanitizeFolderName('Bad\u0000\u0007Name')).toBe('BadName');
  });
  it('returns null for empty or non-string input', () => {
    expect(sanitizeFolderName('  ')).toBeNull();
    expect(sanitizeFolderName(undefined)).toBeNull();
  });
});

describe('parseSuggestion', () => {
  it('matches an existing folder case-insensitively, ignoring quotes/whitespace', () => {
    expect(parseSuggestion(' "dev" \n', folders).folder.id).toBe('f1');
  });
  it('parses NEW: into a sanitized new folder name', () => {
    const s = parseSuggestion('NEW: Machine Learning', folders);
    expect(s.folder).toBeNull();
    expect(s.newFolderName).toBe('Machine Learning');
  });
  it('maps NEW: matching an existing folder back to that folder', () => {
    const s = parseSuggestion('NEW: recipes', folders);
    expect(s.folder.id).toBe('f2');
    expect(s.newFolderName).toBeNull();
  });
  it('rejects anything else (untrusted model output)', () => {
    expect(parseSuggestion('Delete all bookmarks', folders)).toBeNull();
    expect(parseSuggestion('', folders)).toBeNull();
  });
});

describe('suggestFolder', () => {
  it('returns an existing folder picked by the model', async () => {
    const fakeSession = { prompt: async () => 'Recipes', destroy: () => {} };
    const result = await suggestFolder(
      { title: 'Pasta', url: 'https://pasta.io' }, folders,
      { createSession: async () => fakeSession }
    );
    expect(result.folder.id).toBe('f2');
    expect(result.source).toBe('ai');
  });
  it('returns a new folder name proposed by the model', async () => {
    const fakeSession = { prompt: async () => 'NEW: Finance', destroy: () => {} };
    const result = await suggestFolder(
      { title: 'My bank', url: 'https://bank.example.com' }, folders,
      { createSession: async () => fakeSession }
    );
    expect(result.folder).toBeNull();
    expect(result.newFolderName).toBe('Finance');
    expect(result.source).toBe('ai');
  });
  it('falls back to rules when no session factory is available', async () => {
    const foldersWithChildren = [
      { id: 'f1', title: 'Dev', children: [{ url: 'https://github.com/x' }] }
    ];
    const result = await suggestFolder(
      { title: 'Repo', url: 'https://github.com/y' }, foldersWithChildren,
      { createSession: null }
    );
    expect(result.folder.id).toBe('f1');
    expect(result.source).toBe('rules');
  });
  it('returns null folder when neither AI nor rules produce a match', async () => {
    const result = await suggestFolder(
      { title: 'X', url: 'https://x.io' }, folders, { createSession: null }
    );
    expect(result.folder).toBeNull();
  });
});
