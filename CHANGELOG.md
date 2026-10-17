# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-10-17

### Added

- **Permanent per-session delete.** A `永久删除会话 / Delete permanently` row in
  one Session's `⋯` menu, visible only for Sessions that belong to no workspace
  (未分组). Confirming stops the Session's running work, then unlinks its durable
  log directory, both projection-cache filename spellings, its full-text index
  rows, and every registry reference to the id, and finally emits
  `api-session/removed` so the sidebar drops the row immediately.
- **One-click cleanup of archived Sessions.** A button in the「未分组」group
  header, placed in front of the native `⊕` (new session) button and reusing that
  button's own `className` so geometry, hover, focus ring and the row's
  hover-only reveal match the shipped UI. It opens a list of every archived
  Session in Ungrouped, selected by default, so clearing the whole set is one
  confirmation away.
- **Search-index purge.** `@deepseek-ai/dsh-session-query-sqlite` publishes no
  removal API, so the plugin opens its database on a second `node:sqlite`
  connection, verifies the `persisted_sessions` + `persisted_docs` schema before
  touching anything, deletes the two row sets and bumps
  `search_state.global_generation`. The shipped default is `path: ':memory:'`
  with `openAt: never`, in which case the step is skipped and reported as
  `absent`.
- **Host-computed authorization.** Both actions compute their allowed set in the
  host (`archivedSessionIds − 已分组`, or the single id's grouping), so a caller
  can only narrow it. Grouped Sessions are refused with
  `session/not-ungrouped`; the bulk endpoint silently ignores ids outside the
  set.
- **`inspect` RPC endpoint** and `tools/live-inventory.mjs` for read-only
  diagnosis: resolved `$DSH_HOME`, whether the projection cache and index exist,
  which `node:sqlite` driver the runtime carries, per-workspace session counts,
  and the exact list the cleanup button would operate on.
- **Offline smoke test** (`tools/smoke-host.mjs`, `npm test`) with 50+ assertions
  against a throwaway `$DSH_HOME` that reproduces the real on-disk shapes.

[1.0.0]: https://github.com/bxdsjs/dsh-session-delete/releases/tag/v1.0.0
