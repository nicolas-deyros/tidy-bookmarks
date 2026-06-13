export function searchBookmarks(flat, query, tagMap = {}) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return flat.filter(b => {
    const tags = (tagMap[b.id] ?? []).join(' ');
    const haystack = `${b.title} ${b.url} ${b.path} ${tags}`.toLowerCase();
    return words.every(w => haystack.includes(w));
  });
}
