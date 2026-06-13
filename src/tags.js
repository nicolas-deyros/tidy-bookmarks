export function sanitizeTag(tag) {
  if (typeof tag !== 'string') return null;
  const cleaned = [...tag]
    .filter(ch => { const c = ch.codePointAt(0); return c >= 0x20 && c !== 0x7f; })
    .join('')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .slice(0, 30);
  return cleaned || null;
}

export function addTag(tagMap, id, tag) {
  const t = sanitizeTag(tag);
  if (!t) return tagMap;
  const current = tagMap[id] ?? [];
  if (current.includes(t)) return tagMap;
  return { ...tagMap, [id]: [...current, t] };
}

export function removeTag(tagMap, id, tag) {
  const t = sanitizeTag(tag);
  const current = tagMap[id] ?? [];
  const next = current.filter(x => x !== t);
  const copy = { ...tagMap };
  if (next.length) copy[id] = next; else delete copy[id];
  return copy;
}

export function tagsFor(tagMap, id) {
  return tagMap[id] ?? [];
}

export function allTags(tagMap) {
  const counts = new Map();
  for (const tags of Object.values(tagMap)) {
    for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));
}

export function pruneTags(tagMap, validIds) {
  const valid = new Set(validIds);
  const out = {};
  for (const [id, tags] of Object.entries(tagMap)) {
    if (valid.has(id)) out[id] = tags;
  }
  return out;
}
