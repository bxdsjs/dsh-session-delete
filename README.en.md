# dsh-session-delete

[![CI](https://github.com/bxdsjs/dsh-session-delete/actions/workflows/ci.yml/badge.svg)](https://github.com/bxdsjs/dsh-session-delete/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Permanently delete Sessions in **DeepSeek Harness** — for real, not archive.

[中文说明](./README.md)

DeepSeek Harness ships no Session delete API. Archiving only records the id in
`archivedSessionIds`: the log stays, search still hits it, and another filter
brings it back. This plugin does the `unlink`.

Two entry points:

| Where | What |
| --- | --- |
| A Session's `⋯` menu → **Delete permanently** | erases that one Session. Shown only for Sessions that belong to no workspace (Ungrouped). |
| The「Ungrouped」group header → a trash button left of `⊕` | opens a list of **every archived Session in Ungrouped**, all selected by default; one confirmation clears the set. |

## What it deletes

For one Session id `session-<uuid>`:

| Target | Action |
| --- | --- |
| `$DSH_HOME/sessions/<encoded-cwd>/session-<uuid>/` | recursive delete (the `session.v4.jsonl.zstd` log lives here) |
| `$DSH_HOME/storages/session_projcache/sessions/session-<uuid>.json` | delete |
| `$DSH_HOME/storages/session_projcache/sessions/<bare-uuid>.json` | delete — both spellings exist in the same directory |
| Full-text index `persisted_docs` / `persisted_sessions` | delete the Session's rows, then bump `search_state.global_generation` |
| `$DSH_HOME/storages/workspace.json` | drop the id from `global.archivedSessionIds`, `global.pinnedSessionIds` and each `tables.workspaces[*].sessionIds`, preserving the 2-space format |
| Sidebar | emit `api-session/removed` so the row disappears immediately |

`$DSH_HOME` is `$DSH_HOME` when set and non-blank, else `~/.dsh`.

**Left alone:** `attachments/` (content-addressed, shared between Sessions),
`llm-deepseek/files-v3.json` (scope-keyed), and every other Session's files.

Before unlinking, the host emits `workspace/session-stop` — the same signal the
sidebar's stop button uses (`agent.cancel({ kind: 'user' })` plus killing that
Session's jobs) — so an in-flight turn cannot flush the log back into place.

## The search index

`@deepseek-ai/dsh-session-query-sqlite` is opt-in in the base bundle
(`path: ':memory:'`, `openAt: never`), so most installs have no index on disk at
all and this step is a no-op reported as `absent`.

When a durable `path` is configured, the plugin:

1. asks `ctx.sessionQuery` for its path (`path` / `dbPath` / `config.path`, three
   levels deep, every lookup guarded);
2. otherwise scans `storages`, `cache` and the home root for
   `.sqlite/.sqlite3/.db/.db3` files and checks the `SQLite format 3\0` magic;
3. **verifies the schema before writing** — only a database carrying both
   `persisted_sessions` and `persisted_docs` is touched, so an unrelated SQLite
   file is never opened for writing;
4. runs the two `DELETE`s and bumps the generation counter.

The driver is `node:sqlite`, imported lazily: a runtime without it degrades to
"index not purged" instead of failing to load the plugin. WAL tolerates the
second connection; `PRAGMA busy_timeout = 2000` covers a concurrent writer.

## Authorization

The allowed set is computed in the host, never trusted from the caller:

```
single delete : the id must be in no workspace.sessionIds   → else session/not-ungrouped
bulk cleanup  : archivedSessionIds − 已分组, optionally narrowed by the caller's id list
```

A buggy or hostile client can therefore never reach a grouped or an unarchived
Session through either endpoint. Stale ids (archived in the registry, log
already gone) are listed with `present: false` and are intentionally deletable —
they are exactly the residue worth clearing, and purging them costs nothing.

## Install

The plugin is a standard DSH bundle (`dsh.bundle.patch` + `dsh.client`). Any of
these work:

```powershell
# 1) clone next to your other local plugins, then link it into the profile
git clone https://github.com/bxdsjs/dsh-session-delete.git `
  "$HOME\.dsh\plugins\dsh-session-delete"
```

Then, in `$DSH_HOME/profiles/<profile>/package.json`:

```jsonc
{
  "dependencies": {
    "dsh-session-delete": "link:C:/Users/<you>/.dsh/plugins/dsh-session-delete"
  },
  "dsh": { "profile": { "bundles": [ /* …, */ "dsh-session-delete" ] } }
}
```

and let the package manager create `node_modules/dsh-session-delete`. The bundle's
own [`cordis.patch.yml`](./cordis.patch.yml) inserts the `id: session-delete` row
into the loader tree.

Alternatively, if your DSH build exposes a plugin installer, install the bundle
from the repository path directly:

```
install_bundle link:C:/Users/<you>/.dsh/plugins/dsh-session-delete
```

The host half goes live as soon as the loader picks it up; the client half ships
with the page bundle, so **refresh the Web UI once** afterwards.

## Verify

```powershell
# 50+ assertions against a throwaway $DSH_HOME; never touches your Sessions
node tools/smoke-host.mjs      # or: npm test

# read-only: what the cleanup button would see right now
node tools/live-inventory.mjs
```

Runtime self-check through DSH's own inspector:

```
cordis_inspect_query  platform=client provider=Slots method=listSubTree
  input {"root":"sidebar.workspaces.session.menu.item"}   → { "id": "session-delete", "order": 500 }
  input {"root":"shell.overlay"}                          → session-delete.confirm, session-delete.bulk
```

The header button is not a slot occupant — the shipped sidebar publishes no seat
for a group header — so verify it in the DOM: the
`[data-row-key^="workspace:"][role="treeitem"]` row whose text carries the
Ungrouped label should contain a `<span data-dsh-session-delete-header>` before
its native `⊕` button. It does not render when the archive set is empty.

## Uninstall

Disable the bundle, then remove the plugin directory and the two lines from the
profile (`dependencies` + `dsh.profile.bundles`). Sessions you already deleted do
not come back.

## Compatibility and risk

Built against DeepSeek Harness **0.2.1-rc.2** (Cordis loader, web profile). The
host half depends on nothing but `node:*` builtins and three optional service
lookups (`connection`, `workspaceRegistry`, `sessionQuery`); every call is
best-effort so a missing service degrades one feature instead of the plugin.

The client half relies on a few **shipped-but-unpublished** facts, listed here so
a future DSH change is easy to diagnose:

- the slot keys `sidebar.workspaces.session.menu.item`, `shell.overlay` and their
  registration contract (`id`, `order`, `locale`, `inject`, `hooks`);
- `MenuItemButton`, `Modal`, `Button`, `Tooltip` and the icons from
  `@deepseek-ai/dsh-client-ui-primitives` (a loader seed word);
- the workspace row markup: `[data-row-key^="workspace:"][role="treeitem"]` and
  its trailing action buttons (that is what anchors the group-header button);
- the projection-cache filename spellings and the `workspace.json` unit shape;
- the `persisted_sessions` / `persisted_docs` / `search_state` schema.

## Known trade-offs

- A resident in-memory `Session` object is not evicted — DSH exposes no such API.
  Deleting the files plus emitting `api-session/removed` already makes the row
  and every later listing agree; nothing is left on disk.
- **Do not delete the conversation you are currently chatting in.** With no evict
  API, an open write handle could in theory recreate
  `session.v4.jsonl.zstd` on a later flush. Switch to another Session first.
- Content-addressed attachment blobs used only by a deleted Session become
  orphans: no leak, but disk space is not reclaimed.
- Telemetry already emitted (`otel`, `sessionTelemetry`) is not recalled.
- Deleting the same id twice concurrently resolves the second call
  successfully with `deletedPaths: 0` (idempotent, not an error).

## License

[MIT](./LICENSE)
