import { flattenBookmarks } from '../src/tree.js';
import { searchBookmarks } from '../src/search.js';
import { isSafeUrl, faviconParams } from '../src/url-utils.js';

const input = document.getElementById('search');
const results = document.getElementById('results');
let flat = [];
let tagMap = {};

async function init() {
  const tree = await chrome.bookmarks.getTree();
  flat = flattenBookmarks(tree);
  const { tags = {} } = await chrome.storage.local.get('tags');
  tagMap = tags;
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
