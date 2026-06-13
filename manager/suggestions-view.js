import { flattenBookmarks, listFolders, findEmptyFolders, countContents } from '../src/tree.js';
import { findDuplicates, findMergeableFolders } from '../src/suggestions.js';
import { suggestFolder, suggestTags, suggestReorg, defaultSessionFactory } from '../src/ai.js';
import { addTag, tagsFor, allTags } from '../src/tags.js';

export async function renderSuggestions(container, ctx) {
  container.replaceChildren();
  const output = document.createElement('div');
  output.id = 'suggestions-output';
  container.appendChild(output);

  function addSuggestion(text, actionLabel, action) {
    const div = document.createElement('div');
    div.className = 'suggestion';
    const p = document.createElement('p');
    p.textContent = text;
    div.appendChild(p);
    if (action) {
      const btn = document.createElement('button');
      btn.textContent = actionLabel;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const applied = await action();
        if (applied === false) { btn.disabled = false; return; }
        div.remove();
        // Do NOT re-run analyze here — just drop the applied card. The Browse
        // view refreshes from storage when the user switches back to it.
      });
      div.appendChild(btn);
    }
    output.appendChild(div);
  }

  const tree = await chrome.bookmarks.getTree();
  const flat = flattenBookmarks(tree);
  const folders = listFolders(tree);
  let tagMap = ctx.getTagMap();

  for (const group of findDuplicates(flat)) {
    const extras = group.slice(1);
    addSuggestion(
      `Duplicate: "${group[0].title}" appears ${group.length} times (keeps 1, removes ${extras.length}).`,
      `Remove ${extras.length} duplicate(s)`,
      async () => {
        const ok = await ctx.confirm('Remove duplicates?',
          `Permanently removes ${extras.length} duplicate bookmark(s), keeping one copy. This can't be undone.`);
        if (!ok) return false;
        for (const b of extras) await chrome.bookmarks.remove(b.id);
      }
    );
  }

  for (const folder of findEmptyFolders(tree)) {
    addSuggestion(
      `Empty folder: "${folder.title}" (0 bookmarks).`,
      'Delete folder',
      async () => {
        const ok = await ctx.confirm('Delete empty folder?',
          `Deletes the empty folder "${folder.title}". This can't be undone.`);
        if (!ok) return false;
        await chrome.bookmarks.remove(folder.id);
      }
    );
  }

  const rootIds = new Set((tree[0].children ?? []).map(n => n.id));
  for (const group of findMergeableFolders(folders)) {
    const mergeable = group.filter(f => !rootIds.has(f.id));
    if (mergeable.length < 2) continue;
    const [target, ...rest] = mergeable;
    const movedCount = rest.reduce((n, f) => n + countContents(f).bookmarks, 0);
    addSuggestion(
      `Merge ${mergeable.length} folders named "${target.title}" — moves ${movedCount} bookmark(s), deletes ${rest.length} folder(s).`,
      'Merge folders',
      async () => {
        const ok = await ctx.confirm('Merge folders?',
          `Moves ${movedCount} bookmark(s) into "${target.title}" and deletes ${rest.length} now-empty folder(s). This can't be undone.`);
        if (!ok) return false;
        for (const folder of rest) {
          const [sub] = await chrome.bookmarks.getSubTree(folder.id);
          for (const child of sub.children ?? []) {
            await chrome.bookmarks.move(child.id, { parentId: target.id });
          }
          await chrome.bookmarks.remove(folder.id);
        }
      }
    );
  }

  const uncategorized = flat.filter(b => rootIds.has(b.parentId)).slice(0, 10);
  for (const b of uncategorized) {
    const { folder, newFolderName, source } =
      await suggestFolder(b, folders, { createSession: defaultSessionFactory });
    if (folder) {
      addSuggestion(
        `Move "${b.title}" into "${folder.title}"? (${source === 'ai' ? 'AI suggestion' : 'rule-based'})`,
        'Move it',
        async () => { await chrome.bookmarks.move(b.id, { parentId: folder.id }); }
      );
    } else if (newFolderName) {
      addSuggestion(
        `Create a new folder "${newFolderName}" for "${b.title}"? (AI suggestion)`,
        'Create folder & move',
        async () => {
          const created = await chrome.bookmarks.create({ parentId: b.parentId, title: newFolderName });
          await chrome.bookmarks.move(b.id, { parentId: created.id });
        }
      );
    }
  }

  const untagged = flat.filter(b => tagsFor(tagMap, b.id).length === 0).slice(0, 10);
  const existingTagNames = allTags(tagMap).map(t => t.tag);
  for (const b of untagged) {
    const tags = await suggestTags(b, existingTagNames, { createSession: defaultSessionFactory });
    if (tags.length) {
      addSuggestion(
        `Tag "${b.title}" with: ${tags.join(', ')}? (AI suggestion)`,
        'Apply tags',
        async () => {
          for (const t of tags) tagMap = addTag(tagMap, b.id, t);
          ctx.setTagMap(tagMap);
          await ctx.saveTags();
        }
      );
    }
  }

  const crowded = folders
    .filter(f => (f.children ?? []).filter(c => c.url).length >= 8)
    .sort((a, b) => (b.children?.length ?? 0) - (a.children?.length ?? 0))[0];
  if (crowded) {
    const items = (crowded.children ?? []).filter(c => c.url);
    const groups = await suggestReorg(crowded.title, items, { createSession: defaultSessionFactory });
    for (const group of groups) {
      addSuggestion(
        `In "${crowded.title}", create subfolder "${group.name}" for ${group.bookmarkIds.length} bookmark(s)? (AI suggestion)`,
        'Create subfolder & move',
        async () => {
          const created = await chrome.bookmarks.create({ parentId: crowded.id, title: group.name });
          for (const id of group.bookmarkIds) await chrome.bookmarks.move(id, { parentId: created.id });
        }
      );
    }
  }

  if (output.childElementCount === 0) {
    addSuggestion('No suggestions — your bookmarks look tidy!', null, null);
  }
}
