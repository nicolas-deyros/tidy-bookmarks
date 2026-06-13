export function searchBookmarks(flat, query) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return flat.filter(b => {
    const haystack = `${b.title} ${b.url} ${b.path}`.toLowerCase();
    return words.every(w => haystack.includes(w));
  });
}
