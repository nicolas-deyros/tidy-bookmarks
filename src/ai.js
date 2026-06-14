import { domainOf } from './url-utils.js';
import { suggestFolderByRules } from './suggestions.js';
import { sanitizeTag } from './tags.js';
import { parseMethodologyPlan } from './reorg.js';

export function buildPrompt(bookmark, folders) {
  const names = folders.map(f => f.title).join(', ');
  return [
    'You organize browser bookmarks. Pick the single best folder for this bookmark.',
    `Bookmark title: ${bookmark.title}`,
    `Bookmark domain: ${domainOf(bookmark.url)}`,
    `Folders: ${names}`,
    'Reply with exactly one folder name from the list, and nothing else.',
    'If no folder fits, reply with NEW: followed by a short new folder name (1-3 words).'
  ].join('\n');
}

// Model output is untrusted: strip control characters, surrounding quotes, cap length.
export function sanitizeFolderName(name) {
  if (typeof name !== 'string') return null;
  const cleaned = [...name]
    .filter(ch => { const c = ch.codePointAt(0); return c >= 0x20 && c !== 0x7f; })
    .join('')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim()
    .slice(0, 40);
  return cleaned || null;
}

// Returns { folder, newFolderName } or null if the output is unusable.
export function parseSuggestion(response, folders) {
  if (typeof response !== 'string') return null;
  const newMatch = response.trim().match(/^NEW:\s*(.+)$/is);
  if (newMatch) {
    const name = sanitizeFolderName(newMatch[1]);
    if (!name) return null;
    const existing = folders.find(f => f.title.toLowerCase() === name.toLowerCase());
    return existing
      ? { folder: existing, newFolderName: null }
      : { folder: null, newFolderName: name };
  }
  const cleaned = sanitizeFolderName(response);
  const folder = cleaned
    ? folders.find(f => f.title.toLowerCase() === cleaned.toLowerCase())
    : null;
  return folder ? { folder, newFolderName: null } : null;
}

// Default factory: Chrome built-in Prompt API (on-device Gemini Nano).
// Returns null when unavailable so callers fall back to rules.
export async function defaultSessionFactory({ onDownloadProgress } = {}) {
  if (typeof LanguageModel === 'undefined') return null;
  // Declaring expected input/output language lets Chrome attest output safety
  // and silences the "No output language was specified" warning.
  const options = {
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }]
  };
  let availability;
  try {
    availability = await LanguageModel.availability(options);
  } catch {
    return null;
  }
  if (availability === 'unavailable') return null;
  const createOptions = { ...options };
  // First use may download the model (hundreds of MB). Surface progress so the
  // UI doesn't look frozen.
  if (onDownloadProgress) {
    createOptions.monitor = m => m.addEventListener('downloadprogress', e => onDownloadProgress(e));
  }
  return LanguageModel.create(createOptions);
}

export async function suggestFolder(bookmark, folders, { createSession } = {}) {
  if (createSession) {
    let session = null;
    try {
      session = await createSession();
      if (session) {
        const response = await session.prompt(buildPrompt(bookmark, folders));
        const parsed = parseSuggestion(response, folders);
        if (parsed) return { ...parsed, source: 'ai' };
      }
    } catch (err) {
      console.warn('AI suggestion failed, falling back to rules:', err);
    } finally {
      try { session?.destroy?.(); } catch { /* ignore a misbehaving session */ }
    }
  }
  return { folder: suggestFolderByRules(bookmark, folders), newFolderName: null, source: 'rules' };
}

export function buildTagPrompt(bookmark, existingTags) {
  const names = existingTags.join(', ');
  return [
    'You tag browser bookmarks with short topic labels.',
    `Bookmark title: ${bookmark.title}`,
    `Bookmark domain: ${domainOf(bookmark.url)}`,
    `Existing tags you may reuse: ${names || '(none yet)'}`,
    'Reply with 1-3 comma-separated lowercase tags, and nothing else.'
  ].join('\n');
}

export function parseTags(response, { max = 3 } = {}) {
  if (typeof response !== 'string') return [];
  const seen = [];
  for (const part of response.split(',')) {
    const t = sanitizeTag(part);
    if (t && !seen.includes(t)) seen.push(t);
    if (seen.length === max) break;
  }
  return seen;
}

export async function suggestTags(bookmark, existingTags, { createSession } = {}) {
  if (!createSession) return [];
  let session = null;
  try {
    session = await createSession();
    if (session) {
      const response = await session.prompt(buildTagPrompt(bookmark, existingTags));
      return parseTags(response);
    }
  } catch (err) {
    console.warn('AI tag suggestion failed:', err);
  } finally {
    try { session?.destroy?.(); } catch { /* ignore a misbehaving session */ }
  }
  return [];
}

export function buildReorgPrompt(folderTitle, bookmarks) {
  const lines = bookmarks.map((b, i) => `${i + 1}. ${b.title} (${domainOf(b.url)})`).join('\n');
  return [
    `Organize the bookmarks in the folder "${folderTitle}" into 2-5 topical subfolders.`,
    'Bookmarks:',
    lines,
    'Reply with one line per subfolder as "Subfolder name: 1, 3, 5" using the numbers above.',
    'Use only the numbers listed. Nothing else.'
  ].join('\n');
}

export function parseReorg(response, bookmarks) {
  if (typeof response !== 'string') return [];
  const groups = [];
  for (const line of response.split('\n')) {
    const m = line.match(/^\s*(.+?):\s*([\d,\s]+)$/);
    if (!m) continue;
    const name = sanitizeFolderName(m[1]);
    if (!name) continue;
    const ids = [];
    for (const part of m[2].split(',')) {
      const n = Number.parseInt(part.trim(), 10);
      if (Number.isInteger(n) && n >= 1 && n <= bookmarks.length) {
        const id = bookmarks[n - 1].id;
        if (!ids.includes(id)) ids.push(id);
      }
    }
    if (ids.length) groups.push({ name, bookmarkIds: ids });
  }
  return groups;
}

export async function suggestReorg(folderTitle, bookmarks, { createSession } = {}) {
  if (!createSession) return [];
  let session = null;
  try {
    session = await createSession();
    if (session) {
      const response = await session.prompt(buildReorgPrompt(folderTitle, bookmarks));
      return parseReorg(response, bookmarks);
    }
  } catch (err) {
    console.warn('AI reorg suggestion failed:', err);
  } finally {
    try { session?.destroy?.(); } catch { /* ignore a misbehaving session */ }
  }
  return [];
}

export function buildSimilarFoldersPrompt(folderTitles) {
  return [
    'These are browser bookmark folder names. Group together the ones that mean the same topic.',
    `Folders: ${folderTitles.join(', ')}`,
    'Reply with one group per line as comma-separated names, e.g. "Dev, Coding".',
    'Only include folders that have at least one match. Use the exact names. Nothing else.'
  ].join('\n');
}

// Untrusted output: every name must match a real folder title (allowlist); groups need 2+.
export function parseSimilarFolders(response, folderTitles) {
  if (typeof response !== 'string') return [];
  const allow = new Map(folderTitles.map(t => [t.toLowerCase(), t]));
  const groups = [];
  for (const line of response.split('\n')) {
    const names = [];
    for (const part of line.split(',')) {
      const real = allow.get(part.trim().toLowerCase());
      if (real && !names.includes(real)) names.push(real);
    }
    if (names.length >= 2) groups.push(names);
  }
  return groups;
}

export async function suggestSimilarFolders(folderTitles, { createSession } = {}) {
  if (!createSession || folderTitles.length < 2) return [];
  let session = null;
  try {
    session = await createSession();
    if (session) {
      const response = await session.prompt(buildSimilarFoldersPrompt(folderTitles));
      return parseSimilarFolders(response, folderTitles);
    }
  } catch (err) {
    console.warn('AI similar-folder suggestion failed:', err);
  } finally {
    try { session?.destroy?.(); } catch { /* ignore */ }
  }
  return [];
}

const METHODOLOGY_GUIDANCE = {
  topic: 'Group them into 2-5 topical subfolders with short descriptive names.',
  para: 'Classify each into exactly one of these folders: Projects, Areas, Resources, Archive.',
  'johnny-decimal': 'Propose 2-5 numbered categories like "10 Finance", "20 Dev" (each name starts with a number).'
};

export function buildMethodologyPrompt(methodology, folderTitle, bookmarks) {
  const lines = bookmarks.map((b, i) => `${i + 1}. ${b.title} (${domainOf(b.url)})`).join('\n');
  return [
    `Organize the bookmarks in the folder "${folderTitle}".`,
    METHODOLOGY_GUIDANCE[methodology] ?? METHODOLOGY_GUIDANCE.topic,
    'Bookmarks:',
    lines,
    'Reply with one line per group as "Group name: 1, 3, 5" using the numbers above. Use only those numbers. Nothing else.'
  ].join('\n');
}

export async function suggestMethodologyPlan(methodology, folderTitle, bookmarks, { createSession } = {}) {
  if (!createSession) return [];
  let session = null;
  try {
    session = await createSession();
    if (session) {
      const response = await session.prompt(buildMethodologyPrompt(methodology, folderTitle, bookmarks));
      return parseMethodologyPlan(response, bookmarks);
    }
  } catch (err) {
    console.warn('AI methodology plan failed:', err);
  } finally {
    try { session?.destroy?.(); } catch { /* ignore a misbehaving session */ }
  }
  return [];
}
