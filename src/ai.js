import { domainOf } from './url-utils.js';
import { suggestFolderByRules } from './suggestions.js';

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
export async function defaultSessionFactory() {
  if (typeof LanguageModel === 'undefined') return null;
  // Declaring expected input/output language lets Chrome attest output safety
  // and silences the "No output language was specified" warning.
  const options = {
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }]
  };
  const availability = await LanguageModel.availability(options);
  if (availability === 'unavailable') return null;
  return LanguageModel.create(options);
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
