import { renderRail } from './folder-rail.js';
import { renderContents } from './contents.js';
import { renderSuggestions } from './suggestions-view.js';
import { confirmModal } from './modal.js';
import { isDescendant, dropIndex, listFolders } from '../src/tree.js';

const railEl = document.getElementById('folder-rail');
const contentsEl = document.getElementById('contents');
const browseView = document.getElementById('browse-view');
const suggestionsView = document.getElementById('suggestions-view');
const suggestionsContainer = document.getElementById('suggestions-container');
const searchEl = document.getElementById('search');
const tabBrowse = document.getElementById('tab-browse');
const tabSuggestions = document.getElementById('tab-suggestions');
const analyzeBtn = document.getElementById('run-suggestions');

let tagMap = {};
let uiState = { expanded: new Set(), selected: '' };
let tree = [];
let search = '';
let drag = null; // { id, kind }

async function loadState() {
  const { tags = {}, uiState: saved = {} } = await chrome.storage.local.get(['tags', 'uiState']);
  tagMap = tags;
  uiState.expanded = new Set(saved.expanded ?? []);
  uiState.selected = saved.selected ?? '';
}

async function saveTags() { await chrome.storage.local.set({ tags: tagMap }); }
async function saveUiState() {
  await chrome.storage.local.set({ uiState: { expanded: [...uiState.expanded], selected: uiState.selected } });
}

const ctx = {
  get tree() { return tree; },
  get uiState() { return uiState; },
  get search() { return search; },
  getTagMap: () => tagMap,
  setTagMap: m => { tagMap = m; },
  saveTags,
  refresh,
  confirm: confirmModal,
  async selectFolder(id) { uiState.selected = id; await saveUiState(); renderContents(contentsEl, ctx); renderRail(railEl, ctx); },
  async toggleFolder(id) {
    if (uiState.expanded.has(id)) uiState.expanded.delete(id); else uiState.expanded.add(id);
    await saveUiState(); renderRail(railEl, ctx);
  },
  beginDrag(id, kind) { drag = { id, kind }; },
  canDropOnFolder(targetId) {
    if (!drag) return false;
    if (drag.kind === 'folder') return !isDescendant(tree, drag.id, targetId);
    return true;
  },
  async dropOnFolder(targetId) {
    if (!drag || !ctx.canDropOnFolder(targetId)) { drag = null; return; }
    await chrome.bookmarks.move(drag.id, { parentId: targetId });
    drag = null;
    await refresh();
  },
  async dropBeforeBookmark(beforeId) {
    if (!drag || drag.kind !== 'bookmark' || drag.id === beforeId) { drag = null; return; }
    const folder = listFolders(tree).find(f => f.id === uiState.selected);
    const orderedIds = (folder?.children ?? []).filter(c => c.url).map(c => c.id);
    const index = dropIndex(orderedIds, drag.id, beforeId);
    await chrome.bookmarks.move(drag.id, { parentId: uiState.selected, index });
    drag = null;
    await refresh();
  }
};

async function refresh() {
  tree = await chrome.bookmarks.getTree();
  await loadState();
  const ids = new Set(listFolders(tree).map(f => f.id));
  if (uiState.selected && !ids.has(uiState.selected)) uiState.selected = '';
  uiState.expanded = new Set([...uiState.expanded].filter(id => ids.has(id)));
  renderRail(railEl, ctx);
  renderContents(contentsEl, ctx);
}

async function showBrowse() {
  browseView.hidden = false; suggestionsView.hidden = true;
  tabBrowse.setAttribute('aria-selected', 'true'); tabSuggestions.setAttribute('aria-selected', 'false');
  await refresh();
}
function showSuggestions() {
  browseView.hidden = true; suggestionsView.hidden = false;
  tabBrowse.setAttribute('aria-selected', 'false'); tabSuggestions.setAttribute('aria-selected', 'true');
}

tabBrowse.addEventListener('click', showBrowse);
tabSuggestions.addEventListener('click', showSuggestions);
analyzeBtn.addEventListener('click', () => {
  analyzeBtn.disabled = true; analyzeBtn.textContent = 'Analyzing…';
  renderSuggestions(suggestionsContainer, ctx)
    .catch(err => { suggestionsContainer.textContent = `Analysis failed: ${err.message}`; })
    .finally(() => { analyzeBtn.disabled = false; analyzeBtn.textContent = 'Analyze bookmarks'; });
});
searchEl.addEventListener('input', () => { search = searchEl.value; renderContents(contentsEl, ctx); });

refresh().catch(err => { contentsEl.textContent = `Failed to load bookmarks: ${err.message}`; });
