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

import { buildTagPrompt, parseTags, suggestTags } from '../src/ai.js';

describe('buildTagPrompt', () => {
  it('includes title, domain, and existing tags', () => {
    const p = buildTagPrompt({ title: 'React docs', url: 'https://react.dev' }, ['frontend']);
    expect(p).toContain('React docs');
    expect(p).toContain('react.dev');
    expect(p).toContain('frontend');
  });
});

describe('parseTags', () => {
  it('splits, sanitizes, and caps at 3 by default', () => {
    expect(parseTags('Frontend, React, JavaScript, Web, Docs')).toEqual(['frontend', 'react', 'javascript']);
  });
  it('returns [] for junk or non-string', () => {
    expect(parseTags('   ')).toEqual([]);
    expect(parseTags(undefined)).toEqual([]);
  });
});

describe('suggestTags', () => {
  it('returns sanitized tags from the model', async () => {
    const fakeSession = { prompt: async () => 'Frontend, React', destroy: () => {} };
    const tags = await suggestTags(
      { title: 'React', url: 'https://react.dev' }, [],
      { createSession: async () => fakeSession }
    );
    expect(tags).toEqual(['frontend', 'react']);
  });
  it('returns [] when no session factory is available', async () => {
    expect(await suggestTags({ title: 'X', url: 'https://x.io' }, [], { createSession: null })).toEqual([]);
  });
});

import { buildReorgPrompt, parseReorg, suggestReorg } from '../src/ai.js';

const reorgBookmarks = [
  { id: 'b1', title: 'React docs', url: 'https://react.dev' },
  { id: 'b2', title: 'Pasta recipe', url: 'https://food.com/pasta' },
  { id: 'b3', title: 'Vue guide', url: 'https://vuejs.org' }
];

describe('buildReorgPrompt', () => {
  it('numbers the bookmarks and names the folder', () => {
    const p = buildReorgPrompt('Misc', reorgBookmarks);
    expect(p).toContain('Misc');
    expect(p).toContain('1. React docs');
    expect(p).toContain('3. Vue guide');
  });
});

describe('parseReorg', () => {
  it('maps line numbers to bookmark ids and sanitizes group names', () => {
    const groups = parseReorg('Frontend: 1, 3\nFood: 2', reorgBookmarks);
    expect(groups).toEqual([
      { name: 'Frontend', bookmarkIds: ['b1', 'b3'] },
      { name: 'Food', bookmarkIds: ['b2'] }
    ]);
  });
  it('drops out-of-range numbers and unparseable lines', () => {
    const groups = parseReorg('Junk\nGood: 2, 99', reorgBookmarks);
    expect(groups).toEqual([{ name: 'Good', bookmarkIds: ['b2'] }]);
  });
});

describe('suggestReorg', () => {
  it('returns parsed groups from the model', async () => {
    const fakeSession = { prompt: async () => 'Frontend: 1, 3', destroy: () => {} };
    const groups = await suggestReorg('Misc', reorgBookmarks, { createSession: async () => fakeSession });
    expect(groups).toEqual([{ name: 'Frontend', bookmarkIds: ['b1', 'b3'] }]);
  });
  it('returns [] when no session factory is available', async () => {
    expect(await suggestReorg('Misc', reorgBookmarks, { createSession: null })).toEqual([]);
  });
});

import { buildMethodologyPrompt, suggestMethodologyPlan } from '../src/ai.js';

const methBks = [
  { id: 'b1', title: 'GitHub repo', url: 'https://github.com/x' },
  { id: 'b2', title: 'Pasta recipe', url: 'https://food.com/p' }
];

describe('buildMethodologyPrompt', () => {
  it('names the methodology, lists numbered bookmarks, and asks for grouped lines', () => {
    const p = buildMethodologyPrompt('para', 'Misc', methBks);
    expect(p).toContain('Projects');
    expect(p).toContain('1. GitHub repo');
    expect(p).toContain('2. Pasta recipe');
  });
  it('uses numbered-category guidance for johnny-decimal', () => {
    expect(buildMethodologyPrompt('johnny-decimal', 'Misc', methBks)).toContain('number');
  });
});

describe('suggestMethodologyPlan', () => {
  it('returns validated groups from the model', async () => {
    const fakeSession = { prompt: async () => 'Projects: 1\nResources: 2', destroy: () => {} };
    const groups = await suggestMethodologyPlan('para', 'Misc', methBks, { createSession: async () => fakeSession });
    expect(groups).toEqual([
      { name: 'Projects', bookmarkIds: ['b1'] },
      { name: 'Resources', bookmarkIds: ['b2'] }
    ]);
  });
  it('returns [] when no session factory is available', async () => {
    expect(await suggestMethodologyPlan('topic', 'Misc', methBks, { createSession: null })).toEqual([]);
  });
});
