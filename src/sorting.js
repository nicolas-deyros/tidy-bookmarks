import { domainOf } from './url-utils.js';

const byTitle = (a, b) =>
  (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });

const COMPARATORS = {
  alphabetical: byTitle,
  alphabeticalDesc: (a, b) => byTitle(b, a),
  dateAdded: (a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0),
  dateAddedAsc: (a, b) => (a.dateAdded ?? 0) - (b.dateAdded ?? 0),
  domain: (a, b) => domainOf(a.url).localeCompare(domainOf(b.url)) || byTitle(a, b),
  url: (a, b) => (a.url || '').localeCompare(b.url || '') || byTitle(a, b)
};

export const SORT_MODES = Object.keys(COMPARATORS);

export function sortChildren(children, mode) {
  const folders = children.filter(n => !n.url).sort(byTitle);
  const links = children.filter(n => n.url).sort(COMPARATORS[mode]);
  return [...folders, ...links];
}
