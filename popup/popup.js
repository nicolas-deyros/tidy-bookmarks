import { flattenBookmarks } from '../src/tree.js';
import { searchBookmarks } from '../src/search.js';
import { isSafeUrl } from '../src/url-utils.js';

const input = document.getElementById('search');
const results = document.getElementById('results');
let flat = [];

async function init() {
  const tree = await chrome.bookmarks.getTree();
  flat = flattenBookmarks(tree);
}

function render(matches) {
  results.replaceChildren();
  for (const b of matches.slice(0, 50)) {
    const li = document.createElement('li');
    if (isSafeUrl(b.url)) {
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

input.addEventListener('input', () => render(searchBookmarks(flat, input.value)));

document.getElementById('open-manager').addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('manager/manager.html') });
  window.close();
});

init().catch(err => { results.textContent = `Error: ${err.message}`; });
