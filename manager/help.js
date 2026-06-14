const FEATURES = [
  'Browse: folders on the left, contents on the right. Click a folder to view it.',
  'Drag bookmarks onto folders to move them; drag bookmarks to reorder; drag folders to restructure.',
  'Tags: add with "+ tag", autocomplete from existing tags, or "✨ Suggest" for AI tags.',
  'Sort a folder with the Sort control; Reorganize a folder by methodology with preview + undo.',
  'Health tab: a prioritized, folder-scoped dashboard — instant cleanup (duplicates, near-duplicates, empty/single-item/same-name folders, stale & loose items) and on-demand on-device AI (file, tag, tidy, merge similar).',
  'Theme: pick Quiet / Vivid / Deck, plus Light / Dark / System appearance, in the header.'
];
const SHORTCUTS = [
  ['/', 'Focus search'],
  ['b', 'Browse view'],
  ['s', 'Health view'],
  ['Esc', 'Close panel / dialog'],
  ['Ctrl/Cmd+Shift+B', 'Open the extension popup (editable in chrome://extensions/shortcuts)']
];

export function openHelp() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const box = document.createElement('div');
  box.className = 'modal-box help-box';

  const h = document.createElement('h3');
  h.textContent = 'Bookmark Organizer — help';
  box.appendChild(h);

  const fTitle = document.createElement('p');
  fTitle.className = 'help-section';
  fTitle.textContent = 'Features';
  box.appendChild(fTitle);
  const fList = document.createElement('ul');
  for (const f of FEATURES) { const li = document.createElement('li'); li.textContent = f; fList.appendChild(li); }
  box.appendChild(fList);

  const sTitle = document.createElement('p');
  sTitle.className = 'help-section';
  sTitle.textContent = 'Keyboard shortcuts';
  box.appendChild(sTitle);
  const sList = document.createElement('ul');
  for (const [key, desc] of SHORTCUTS) {
    const li = document.createElement('li');
    const k = document.createElement('kbd'); k.textContent = key;
    li.append(k, document.createTextNode(` — ${desc}`));
    sList.appendChild(li);
  }
  box.appendChild(sList);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const close = document.createElement('button');
  close.textContent = 'Close';
  function onKey(e) { if (e.key === 'Escape') done(); }
  function done() { overlay.remove(); document.removeEventListener('keydown', onKey); }
  close.addEventListener('click', done);
  overlay.addEventListener('click', e => { if (e.target === overlay) done(); });
  document.addEventListener('keydown', onKey);
  actions.appendChild(close);
  box.appendChild(actions);

  overlay.appendChild(box);
  document.body.appendChild(overlay);
  close.focus();
}
