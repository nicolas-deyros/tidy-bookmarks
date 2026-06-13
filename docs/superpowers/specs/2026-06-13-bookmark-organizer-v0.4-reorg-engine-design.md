# Bookmark Organizer v0.4 — Methodology Reorganization Engine Design

**Status:** Approved (design phase)
**Date:** 2026-06-13

## Goal

Let the user reorganize one folder's contents by a chosen organization **methodology** (PARA, Johnny.Decimal, Topic, By-recency, Flat). The engine proposes a new subfolder structure, shown as a preview where each proposed group is individually approvable; applying creates the subfolders and moves bookmarks in, atomically, with one-click **undo**. Fully on-device; **no new permissions** (`history` was considered and rejected — see Decisions).

## Decisions (resolved during brainstorming)

- **Scope:** one folder subtree per run (not the whole tree). Safer, fits the on-device model, simpler undo.
- **No `history` permission.** Visit-frequency bucketing would require it; instead we use **by-recency** from `dateAdded`, which needs no permission. Keeps the local-minimal privacy story clean. Can be revisited as opt-in later.
- **Undo is single-level** — reverts the most recent apply only (YAGNI; no deep undo stack).
- **Entry point:** a "Reorganize" button on the contents-pane toolbar of the currently selected folder.

## Methodologies

| Id | How it groups | Driven by |
|---|---|---|
| `flat` | All bookmarks to the folder root; emptied subfolders removed | Deterministic |
| `recency` | Buckets by `dateAdded`: **Recent** (≤30d), **Older** (≤1y), **Archive** (>1y) | Deterministic |
| `topic` | AI clusters into 2–5 named topical groups | AI (Gemini Nano) |
| `para` | AI classifies each bookmark into Projects / Areas / Resources / Archive | AI |
| `johnny-decimal` | AI proposes 2–5 numbered categories (e.g. `10 Finance`, `20 Dev`) | AI |

`recommendMethodology(bookmarks)` picks a default heuristically (e.g. many distinct domains → topic; few, recent → recency; mixed → para). The user can override.

## Architecture

`src/reorg.js` (new, pure, TDD) — no `chrome`/DOM:
```
recommendMethodology(bookmarks) -> methodologyId
planFlat(bookmarks) -> [{ name, bookmarkIds }]          // single "(root)" sentinel group, see below
planByRecency(bookmarks, now) -> [{ name, bookmarkIds }] // Recent/Older/Archive, empty buckets omitted
parseMethodologyPlan(aiResponse, bookmarks, methodology) -> [{ name, bookmarkIds }]
  // validates AI output: names via sanitizeFolderName; ids must belong to `bookmarks`;
  // a bookmark appears in at most one group; empty groups dropped. Generalizes parseReorg.
snapshotSubtree(folder) -> [{ id, parentId, index, title }]   // for undo
planUndo(snapshot, currentTree) -> [{ id, parentId, index }]  // moves to restore prior positions
```
`flat` is special: it has no subfolders to create — the group name `"(root)"` signals "move these bookmarks to the folder root and delete emptied subfolders". Glue interprets the sentinel.

`manager/reorg-view.js` (new, glue) — builds AI prompts, calls `chrome.bookmarks`/the Prompt API, renders the preview, wires Apply/Undo. `manager/contents.js` gains a "Reorganize" toolbar button that opens this view for the selected folder. `manager/ai-prompts.js` is *not* introduced; AI prompt builders for the methodologies live in `src/ai.js` (pure, testable) alongside the existing `buildReorgPrompt`.

New pure AI helpers in `src/ai.js`:
```
buildMethodologyPrompt(methodology, folderTitle, bookmarks) -> string
  // methodology-specific instructions (PARA buckets, JD numbering, topic clusters).
suggestMethodologyPlan(methodology, folderTitle, bookmarks, { createSession }) -> [{name,bookmarkIds}]
  // calls the model, runs parseMethodologyPlan; [] when no model (caller falls back / shows notice).
```

## Data flow

1. User selects a folder → clicks **Reorganize**.
2. `reorg-view` reads the folder, calls `recommendMethodology`, renders the picker with the recommendation.
3. On methodology choice: deterministic ones (`flat`, `recency`) compute the plan locally; AI ones call `suggestMethodologyPlan`. Result = list of `{name, bookmarkIds}` groups.
4. Preview renders one approvable card per group (checkbox, name, count, sample titles). Nothing has changed yet.
5. **Apply selected:** `snapshotSubtree(folder)` → save to `chrome.storage.local.lastReorg` → for each checked group: `chrome.bookmarks.create` the subfolder (skip for the `flat` `(root)` sentinel) and `chrome.bookmarks.move` its bookmarks → for `flat`, remove emptied non-root subfolders → `ctx.refresh()`.
6. **Undo:** if `lastReorg` exists, `planUndo` → move bookmarks back to recorded `{parentId, index}`, delete folders the apply created, clear `lastReorg`, `ctx.refresh()`.

## Error handling
- AI unavailable → AI methodologies show "AI model unavailable — try By-recency, Flat, or pick groups yourself"; deterministic methodologies always work.
- AI output that fails validation → those bookmarks are simply left out of groups (never lost); a group with zero valid ids is dropped.
- Apply failures surface inline; the snapshot is written *before* moves so undo is always possible.
- Undo when folders were manually changed after apply: `planUndo` moves by recorded parent/index best-effort; missing targets are skipped without throwing.

## Security / privacy
- Permissions unchanged: `["bookmarks","storage","favicon","sidePanel"]`. No `history`, no network, no host perms.
- AI output untrusted: sanitized names, allowlisted ids, no duplicates. No `innerHTML`/`eval`; render via `createElement`/`textContent`.
- Nothing mutates before **Apply**; every apply is undoable; folder deletes never touch Chrome roots.

## Testing
- **Pure (Vitest):** `recommendMethodology` (domain-heavy/recent/mixed inputs); `planFlat`; `planByRecency` (boundary dates around 30d/1y, empty buckets omitted, `now` injected); `parseMethodologyPlan` (valid, out-of-folder id rejected, duplicate id deduped, junk line skipped, bad name dropped); `snapshotSubtree`; `planUndo` (round-trip: snapshot → simulated moves → planUndo restores original parent/index).
- **Glue (manual, in plan):** Reorganize button; methodology recommendation + override; preview cards; partial apply (some groups unchecked); undo restores exactly; AI-unavailable fallback; XSS spot-check unaffected.

## Out of scope / deferred
- Whole-tree (multi-folder) reorganization in one run.
- Multi-level/redo undo history.
- `history`-based visit frequency (kept out by decision).
- The separately-tracked v0.4 niceties (manual dark-mode toggle, multi-select/keyboard drag) ship as their own small plan, not part of this engine.
