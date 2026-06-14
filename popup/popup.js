import { flattenBookmarks } from '../src/tree.js';
import { searchBookmarks } from '../src/search.js';
import { isSafeUrl, faviconParams } from '../src/url-utils.js';
import { applyTheme, normalizeThemePref, migrateLegacyTheme } from '../src/theme.js';

const input = document.getElementById('search');
const results = document.getElementById('results');
let flat = [];
let tagMap = {};

async function init() {
  // Apply theme first (before the slower bookmark fetch) to avoid any flash.
  const { tags = {}, themePref, theme } = await chrome.storage.local.get(['tags', 'themePref', 'theme']);
  tagMap = tags;
  applyTheme(document.documentElement, themePref ? normalizeThemePref(themePref) : migrateLegacyTheme(theme));
  const tree = await chrome.bookmarks.getTree();
  flat = flattenBookmarks(tree);
}

function render(matches) {
  results.replaceChildren();
  for (const b of matches.slice(0, 50)) {
    const li = document.createElement('li');
    if (isSafeUrl(b.url)) {
      const icon = document.createElement('img');
      icon.width = 16;
      icon.height = 16;
      icon.src = chrome.runtime.getURL(faviconParams(b.url, 16));
      icon.alt = '';
      icon.style.marginRight = '6px';
      icon.style.verticalAlign = 'middle';
      li.appendChild(icon);
      const a = document.createElement('a');
      a.textContent = b.title || b.url;
      a.href = b.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      li.appendChild(a);
    } else {
      const span = document.createElement('span');
      span.textContent = b.title || b.url;
      li.appendChild(span);
    }
    const path = document.createElement('div');
    path.className = 'path';
    path.textContent = b.path;
    li.appendChild(path);
    results.appendChild(li);
  }
}

input.addEventListener('input', () => render(searchBookmarks(flat, input.value, tagMap)));

const resultLinks = () => [...results.querySelectorAll('a')];

// From the search box: ↓ steps into results, Enter opens the top hit, Esc clears.
input.addEventListener('keydown', e => {
  const links = resultLinks();
  if (e.key === 'ArrowDown') { e.preventDefault(); links[0]?.focus(); }
  else if (e.key === 'Enter') { e.preventDefault(); links[0]?.click(); }
  else if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; render(searchBookmarks(flat, '', tagMap)); }
});

// Within results: ↑/↓ move between hits (↑ at the top returns to search), Esc returns.
results.addEventListener('keydown', e => {
  if (!['ArrowDown', 'ArrowUp', 'Escape'].includes(e.key)) return;
  const links = resultLinks();
  const idx = links.indexOf(document.activeElement);
  if (idx === -1) return;
  e.preventDefault();
  if (e.key === 'Escape') input.focus();
  else if (e.key === 'ArrowDown') links[Math.min(idx + 1, links.length - 1)].focus();
  else if (idx === 0) input.focus();
  else links[idx - 1].focus();
});

document.getElementById('open-manager').addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('manager/manager.html') });
  window.close();
});

document.getElementById('open-sidebar').addEventListener('click', async () => {
  const win = await chrome.windows.getCurrent();
  await chrome.sidePanel.open({ windowId: win.id });
  window.close();
});

init().catch(err => { results.textContent = `Error: ${err.message}`; });
