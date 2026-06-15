import { renderRail } from './folder-rail.js';
import { renderContents } from './contents.js';
import { renderHealth } from './health-view.js';
import { confirmModal } from './modal.js';
import { openHelp } from './help.js';
import { isDescendant, dropIndex, listFolders } from '../src/tree.js';
import { applyTheme, normalizeThemePref, migrateLegacyTheme } from '../src/theme.js';

const railEl = document.getElementById('folder-rail');
const contentsEl = document.getElementById('contents');
const browseView = document.getElementById('browse-view');
const healthView = document.getElementById('health-view');
const healthContainer = document.getElementById('health-container');
const healthScope = document.getElementById('health-scope');
const searchEl = document.getElementById('search');
const tabBrowse = document.getElementById('tab-browse');
const tabHealth = document.getElementById('tab-health');
const themeSelect = document.getElementById('theme-select');
const appearanceSelect = document.getElementById('appearance-select');

let tagMap = {};
let uiState = { expanded: new Set(), selected: '', checked: new Set() };
let tree = [];
let search = '';
let drag = null; // { id, kind }

async function loadState() {
  const store = await chrome.storage.local.get(['tags', 'uiState', 'themePref', 'theme']);
  tagMap = store.tags ?? {};
  uiState.expanded = new Set(store.uiState?.expanded ?? []);
  uiState.selected = store.uiState?.selected ?? '';
  const pref = store.themePref
    ? normalizeThemePref(store.themePref)
    : migrateLegacyTheme(store.theme); // one-time upgrade from the old light/dark/auto value
  applyTheme(document.documentElement, pref);
  themeSelect.value = pref.theme;
  appearanceSelect.value = pref.appearance;
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
  async selectFolder(id) { uiState.selected = id; uiState.checked.clear(); await saveUiState(); renderContents(contentsEl, ctx); renderRail(railEl, ctx); },
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
  if (!uiState.selected) {
    const firstRoot = (tree[0].children ?? [])[0];
    if (firstRoot) uiState.selected = firstRoot.id;
  }
  renderRail(railEl, ctx);
  renderContents(contentsEl, ctx);
}

async function showBrowse() {
  browseView.hidden = false; healthView.hidden = true;
  tabBrowse.setAttribute('aria-selected', 'true'); tabHealth.setAttribute('aria-selected', 'false');
  await refresh();
}
function showHealth() {
  browseView.hidden = true; healthView.hidden = false;
  tabBrowse.setAttribute('aria-selected', 'false'); tabHealth.setAttribute('aria-selected', 'true');
  renderHealth(healthContainer, healthScope, ctx)
    .catch(err => { healthContainer.textContent = `Analysis failed: ${err.message}`; });
}

tabBrowse.addEventListener('click', showBrowse);
tabHealth.addEventListener('click', showHealth);
searchEl.addEventListener('input', () => {
  search = searchEl.value;
  // Searching always shows results in Browse — jump there if we're in Health.
  if (!healthView.hidden) showBrowse();
  else renderContents(contentsEl, ctx);
});

async function onThemeChange() {
  const pref = { theme: themeSelect.value, appearance: appearanceSelect.value };
  applyTheme(document.documentElement, pref);
  await chrome.storage.local.set({ themePref: pref });
}
themeSelect.addEventListener('change', onThemeChange);
appearanceSelect.addEventListener('change', onThemeChange);

document.getElementById('help-btn').addEventListener('click', openHelp);

document.addEventListener('keydown', e => {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.key === '/') { e.preventDefault(); searchEl.focus(); }
  else if (e.key === 'b') showBrowse();
  else if (e.key === 's') showHealth();
});

refresh().catch(err => { contentsEl.textContent = `Failed to load bookmarks: ${err.message}`; });
