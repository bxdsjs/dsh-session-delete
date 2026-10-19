/**
 * dsh-session-delete host half: permanently erase one「未分组」Session, and
 * bulk-clear every archived Session that belongs to no workspace.
 *
 * Why the plugin owns the deletion: the Host exposes no Session delete/evict
 * API at all. `sessions` is an in-memory store whose `enter()` disposer only
 * tears down a live entry, `sessionPersistence` exposes create/open/flush/
 * stat/list but no remove, and `workspaceRegistry` only detaches or archives a
 * Session. So a real permanent delete = filesystem removal of the Session's
 * durable log directory + its projection-cache row + the full-text index rows
 * that mention it + the registry bookkeeping that still mentions the id,
 * followed by the shipped removal wire event so the sidebar drops the row.
 *
 * Plane discipline:
 * - Static imports are node builtins only; `node:sqlite` is imported lazily so
 *   a runtime without it degrades to "index not purged" instead of failing to
 *   load the whole plugin.
 * - Services are read through `ctx.get` and every call is best-effort: the
 *   durable filesystem work is what makes the deletion permanent, and it must
 *   not be undone by a missing optional service.
 *
 * @module dsh-session-delete
 */

import { readdir, readFile, rm, stat, writeFile, open } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve, extname } from 'node:path'

/** Cordis plugin name used by Loader diagnostics. */
export const name = 'dsh-session-delete'

/** No service is mandatory; `connection` is picked up opportunistically for RPC. */
export const inject = []

/** Private RPC channel shared with the client half. */
const RPC_CHANNEL = '/dsh-session-delete'

/** One Session id as the Host spells it: `session-<uuid>`. */
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/** Environment variable that overrides the default DeepSeek Harness home. */
const DSH_HOME_ENV = 'DSH_HOME'

/** Filesystem entries the search-index probe never descends into. */
const PROBE_SKIP = new Set([
  'attachments', 'cache', 'dsh-runtimes', 'node_modules', 'plugins',
  'profiles', 'sessions', 'tools',
])

/** Directories whose direct children the search-index probe inspects. */
const PROBE_DIRS = ['', 'storages', 'cache', 'storages/session_projcache']

/** The two tables `@deepseek-ai/dsh-session-query-sqlite` owns for durable rows. */
const INDEX_SESSIONS_TABLE = 'persisted_sessions'
const INDEX_DOCS_TABLE = 'persisted_docs'

/** SQLite file magic, so a probe never opens an unrelated file. */
const SQLITE_MAGIC = 'SQLite format 3\u0000'

/** RpcResult success branch. */
function ok(value) {
  return { ok: true, value }
}

/**
 * RpcResult failure branch.
 * @param code - stable machine code, e.g. `session/not-ungrouped`.
 * @param message - user-facing sentence.
 * @param details - extra context for the caller's log.
 */
function fail(code, message, details = {}) {
  return { ok: false, error: { code, message, details } }
}

/** Human-readable error text. */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Resolve the single-root Harness home the same way `@deepseek-ai/dsh-home-paths`
 * does: `$DSH_HOME` when set and non-blank, else `~/.dsh`. Reimplemented on
 * builtins so this module imports nothing outside `node:*`.
 * @returns the normalized absolute home path.
 */
function dshHome() {
  const configured = process.env[DSH_HOME_ENV]
  const raw = configured !== undefined && configured.trim().length > 0 ? configured : join(homedir(), '.dsh')
  if (raw === '~') return homedir()
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return resolve(join(homedir(), raw.slice(2)))
  return resolve(raw)
}

/** True when `path` names an existing directory. */
async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/** True when `path` exists at all. */
async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Delete every `sessions/<encoded-cwd>/<sessionId>` directory. The encoded-cwd
 * segment is derived from the Session's own working directory, so it is not
 * known from the id alone: scan one level of the sessions root instead.
 * @param sessionId - Session to erase.
 * @param removed - accumulator for the paths actually deleted.
 */
async function removeSessionLogs(sessionId, removed) {
  const root = join(dshHome(), 'sessions')
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return // a profile that never wrote a session log simply has nothing to do
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidate = join(root, entry.name, sessionId)
    if (!(await isDirectory(candidate))) continue
    await rm(candidate, { recursive: true, force: true })
    removed.push(candidate)
  }
}

/**
 * Delete the Session's projection-cache row. Filenames in this directory are
 * not uniform: some rows are stored as `session-<uuid>.json` and others as the
 * bare `<uuid>.json`, so both spellings are erased.
 * @param sessionId - Session to erase.
 * @param removed - accumulator for the paths actually deleted.
 */
async function removeProjectionCache(sessionId, removed) {
  const dir = join(dshHome(), 'storages', 'session_projcache', 'sessions')
  const bare = sessionId.replace(/^session-/, '')
  const wanted = new Set([`${sessionId}.json`, `${bare}.json`])
  let entries
  try {
    entries = await readdir(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const stem = entry.replace(/\.json(?:\.tmp)?$/, '')
    if (!wanted.has(entry) && stem !== sessionId && stem !== bare) continue
    const target = join(dir, entry)
    await rm(target, { force: true })
    removed.push(target)
  }
}

/**
 * Read a Session's display facts from its projection cache, which is the only
 * cheap source that does not replay the log. Both filename spellings are tried;
 * a missing or unparsable row is not an error.
 * @param sessionId - Session to describe.
 * @returns `{ title, cwd, createdAt }` with blanks when nothing is cached.
 */
async function readCachedMeta(sessionId) {
  const dir = join(dshHome(), 'storages', 'session_projcache', 'sessions')
  const bare = sessionId.replace(/^session-/, '')
  for (const name of [`${sessionId}.json`, `${bare}.json`]) {
    let raw
    try {
      raw = await readFile(join(dir, name), 'utf8')
    } catch {
      continue
    }
    try {
      const doc = JSON.parse(raw)
      const record = doc?.record
      const title = record?.rows?.title?.val
      const cwd = record?.identity?.cwd
      const createdAt = record?.identity?.createdAt
      return {
        title: typeof title === 'string' ? title : '',
        cwd: typeof cwd === 'string' ? cwd : '',
        createdAt: typeof createdAt === 'number' ? createdAt : 0,
      }
    } catch {
      // a half-written cache row still means the session exists
      return { title: '', cwd: '', createdAt: 0 }
    }
  }
  return { title: '', cwd: '', createdAt: 0 }
}

/**
 * Strip every mention of the Session from the durable workspace registry file:
 * `global.archivedSessionIds`, `global.pinnedSessionIds`, and each workspace
 * record's `sessionIds`. The registry's own write path is used first (see
 * {@link scrubRegistry}); this direct pass only catches residue it left behind,
 * and preserves the file's 2-space pretty-printed shape.
 * @param sessionId - Session to erase.
 * @param removed - accumulator for the paths actually written.
 * @returns the number of references that were still present.
 */
async function scrubRegistryFile(sessionId, removed) {
  const file = join(dshHome(), 'storages', 'workspace.json')
  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return 0
  }
  let doc
  try {
    doc = JSON.parse(raw)
  } catch {
    return 0
  }
  let dropped = 0
  const scrub = (value) => {
    if (!Array.isArray(value)) return value
    const next = value.filter((id) => id !== sessionId)
    dropped += value.length - next.length
    return next
  }
  const global = doc?.global
  if (global !== null && typeof global === 'object') {
    if ('archivedSessionIds' in global) global.archivedSessionIds = scrub(global.archivedSessionIds)
    if ('pinnedSessionIds' in global) global.pinnedSessionIds = scrub(global.pinnedSessionIds)
  }
  const workspaces = doc?.tables?.workspaces
  if (workspaces !== null && typeof workspaces === 'object') {
    for (const record of Object.values(workspaces)) {
      if (record === null || typeof record !== 'object') continue
      if ('sessionIds' in record) record.sessionIds = scrub(record.sessionIds)
    }
  }
  if (dropped === 0) return 0
  await writeFile(file, `${JSON.stringify(doc, null, 2)}${raw.endsWith('\n') ? '\n' : ''}`, 'utf8')
  removed.push(file)
  return dropped
}

/**
 * Detach the id from the live registry through its public write path
 * (`detachSession` / `unarchiveSession` / `unpinSession`) so in-memory
 * snapshots and follow frames stay consistent with the files.
 * @param ctx - plugin context, used only to look the service up.
 * @param sessionId - Session to erase.
 * @returns the identifiers of the calls that succeeded.
 */
async function scrubRegistry(ctx, sessionId) {
  const done = []
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) return done
  try {
    for (const workspace of registry.list()) {
      if (!workspace.sessionIds.includes(sessionId)) continue
      await workspace.detachSession(sessionId)
      done.push(`detach:${workspace.id}`)
    }
  } catch {
    // a concurrent registry write is retried by the file pass below
  }
  for (const [label, run] of [
    ['unarchive', () => registry.unarchiveSession(sessionId)],
    ['unpin', () => registry.unpinSession(sessionId)],
  ]) {
    try {
      await run()
      done.push(label)
    } catch {
      // already absent from that set, or the id is unknown to the live registry
    }
  }
  return done
}

/**
 * The ids any workspace still claims. This is the Host's definition of
 * 「已分组」, and the only grouping fact a permanent delete needs.
 * @param ctx - plugin context.
 * @returns `{ grouped: Set<string>, inWorkspace: Map<string, { id, title }> }`.
 */
function groupingIndex(ctx) {
  const grouped = new Set()
  const inWorkspace = new Map()
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) return { grouped, inWorkspace }
  try {
    for (const workspace of registry.list()) {
      for (const id of workspace.sessionIds) {
        grouped.add(id)
        inWorkspace.set(id, { id: workspace.id, title: workspace.title })
      }
    }
  } catch {
    // an unreadable registry must not block a file-level deletion
  }
  return { grouped, inWorkspace }
}

/**
 * Report whether any workspace still claims the Session.
 * @param ctx - plugin context.
 * @param sessionId - Session to classify.
 * @returns `{ grouped, workspaceId?, workspaceTitle? }`.
 */
function groupingOf(ctx, sessionId) {
  const claim = groupingIndex(ctx).inWorkspace.get(sessionId)
  if (claim === undefined) return { grouped: false }
  return { grouped: true, workspaceId: claim.id, workspaceTitle: claim.title }
}

/**
 * The registry-global archive set, read from the live service when it exposes
 * the projection and from the durable file otherwise. `workspaceRegistry`'s
 * published interface only promises the mutators, but the shipped Remote
 * handler reads the property, so it is present at runtime.
 * @param ctx - plugin context.
 * @returns the archived ids, newest-irrelevant order.
 */
async function archivedIds(ctx) {
  const registry = ctx.get('workspaceRegistry')
  const live = registry?.archivedSessionIds
  if (Array.isArray(live)) return [...live]
  try {
    const doc = JSON.parse(await readFile(join(dshHome(), 'storages', 'workspace.json'), 'utf8'))
    const ids = doc?.global?.archivedSessionIds
    if (Array.isArray(ids)) return [...ids]
  } catch {
    // no registry file yet
  }
  return []
}

/**
 * Ask the search-index backend where its database lives. The shipped sqlite
 * backend keeps the resolved config on the service face, but that is not a
 * published interface, so every lookup is guarded.
 * @param ctx - plugin context.
 * @returns the configured path, or undefined.
 */
function configuredIndexPath(ctx) {
  const backend = ctx.get('sessionQuery')
  if (backend === undefined) return undefined
  const seen = new Set()
  const queue = [backend]
  for (let depth = 0; depth < 3 && queue.length > 0; depth += 1) {
    const next = []
    for (const holder of queue) {
      if (holder === null || typeof holder !== 'object' || seen.has(holder)) continue
      seen.add(holder)
      for (const key of ['path', 'dbPath', 'file', 'filename']) {
        const value = holder[key]
        if (typeof value === 'string' && value.trim().length > 0) return value
      }
      for (const key of ['config', 'options', '_config', '_options', 'db', '_db']) {
        const value = holder[key]
        if (value !== null && typeof value === 'object') next.push(value)
      }
    }
    queue.splice(0, queue.length, ...next)
  }
  return undefined
}

/**
 * Read the first bytes of a file and report whether they are the SQLite magic.
 * @param path - candidate database path.
 */
async function isSqliteFile(path) {
  let handle
  try {
    handle = await open(path, 'r')
    const buffer = Buffer.alloc(SQLITE_MAGIC.length)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return bytesRead === buffer.length && buffer.toString('latin1') === SQLITE_MAGIC
  } catch {
    return false
  } finally {
    await handle?.close().catch(() => {})
  }
}

/**
 * Candidate database paths: the resolved backend config first, then a bounded
 * scan of the harness home for SQLite files. Nothing is opened yet.
 * @param ctx - plugin context.
 * @returns ordered unique candidate paths.
 */
async function indexCandidates(ctx) {
  const out = []
  const add = (value) => {
    if (typeof value !== 'string') return
    const trimmed = value.trim()
    if (trimmed.length === 0 || trimmed === ':memory:') return
    const absolute = resolve(trimmed)
    if (!out.includes(absolute)) out.push(absolute)
  }
  add(configuredIndexPath(ctx))
  const home = dshHome()
  for (const relative of PROBE_DIRS) {
    const dir = relative === '' ? home : join(home, ...relative.split('/'))
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (PROBE_SKIP.has(entry.name)) continue
      const kind = extname(entry.name).toLowerCase()
      if (kind !== '.sqlite' && kind !== '.sqlite3' && kind !== '.db' && kind !== '.db3') continue
      add(join(dir, entry.name))
    }
  }
  return out
}

/**
 * Open one candidate and decide whether it is the session search index. The
 * schema check is what makes the probe safe: an unrelated SQLite file is never
 * touched.
 * @param DatabaseSync - the driver constructor from `node:sqlite`.
 * @param path - candidate path.
 * @returns the open handle when the schema matches, else undefined.
 */
function openIndexIfMatches(DatabaseSync, path) {
  let db
  try {
    db = new DatabaseSync(path)
    db.exec('PRAGMA busy_timeout = 2000')
    const rows = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?)",
    ).all(INDEX_SESSIONS_TABLE, INDEX_DOCS_TABLE)
    const names = new Set(rows.map((row) => row.name))
    if (!names.has(INDEX_SESSIONS_TABLE) || !names.has(INDEX_DOCS_TABLE)) {
      db.close()
      return undefined
    }
    return db
  } catch {
    try {
      db?.close()
    } catch {
      // already closed
    }
    return undefined
  }
}

/**
 * Drop one Session from the full-text search index.
 *
 * The backend (`@deepseek-ai/dsh-session-query-sqlite`) publishes no removal
 * API, so this writes the two durable tables it owns and bumps its generation
 * counter, which is the backend's own invalidation signal. The DB is opened
 * read-write on a second connection; its WAL journal mode tolerates that, and a
 * `busy_timeout` covers a concurrent writer. A `:memory:` index needs nothing:
 * it dies with the process.
 * @param ctx - plugin context.
 * @param sessionId - Session to drop.
 * @returns `{ state, path?, reason?, docs?, sessions? }`.
 */
async function purgeSearchIndex(ctx, sessionId) {
  let sqlite
  try {
    sqlite = await import('node:sqlite')
  } catch (error) {
    return { state: 'unavailable', reason: `node:sqlite is unavailable: ${messageOf(error)}` }
  }
  const DatabaseSync = sqlite.DatabaseSync
  if (typeof DatabaseSync !== 'function') {
    return { state: 'unavailable', reason: 'node:sqlite exposes no DatabaseSync' }
  }
  const candidates = await indexCandidates(ctx)
  if (candidates.length === 0) {
    return { state: 'absent', reason: 'no session search index database on disk' }
  }
  let lastReason = 'no candidate carried the session search schema'
  for (const candidate of candidates) {
    if (!(await isSqliteFile(candidate))) continue
    const db = openIndexIfMatches(DatabaseSync, candidate)
    if (db === undefined) continue
    try {
      const docs = db.prepare(`DELETE FROM ${INDEX_DOCS_TABLE} WHERE session_id = ?`).run(sessionId)
      const sessions = db.prepare(`DELETE FROM ${INDEX_SESSIONS_TABLE} WHERE id = ?`).run(sessionId)
      // The backend compares this counter to invalidate client cursors and its
      // own cached generations; bumping it is the documented-by-behavior way to
      // announce that the corpus changed underneath.
      try {
        db.exec('UPDATE search_state SET global_generation = global_generation + 1 WHERE singleton = 1')
      } catch {
        // older schema revision without search_state
      }
      return {
        state: 'purged',
        path: candidate,
        docs: Number(docs?.changes ?? 0),
        sessions: Number(sessions?.changes ?? 0),
      }
    } catch (error) {
      lastReason = `purge failed on ${candidate}: ${messageOf(error)}`
    } finally {
      try {
        db.close()
      } catch {
        // already closed
      }
    }
  }
  return { state: 'skipped', reason: lastReason }
}

/**
 * Report the search-index situation without mutating anything.
 * @param ctx - plugin context.
 */
async function describeSearchIndex(ctx) {
  const configured = configuredIndexPath(ctx)
  const candidates = await indexCandidates(ctx)
  let matched
  let driver = 'unknown'
  try {
    const sqlite = await import('node:sqlite')
    driver = typeof sqlite.DatabaseSync === 'function' ? 'node:sqlite' : 'node:sqlite (no DatabaseSync)'
    for (const candidate of candidates) {
      if (!(await isSqliteFile(candidate))) continue
      const db = openIndexIfMatches(sqlite.DatabaseSync, candidate)
      if (db === undefined) continue
      db.close()
      matched = candidate
      break
    }
  } catch (error) {
    driver = `unavailable: ${messageOf(error)}`
  }
  return {
    configured: configured ?? null,
    inMemory: configured === ':memory:',
    driver,
    candidates,
    database: matched ?? null,
  }
}

/**
 * The durable, per-session half of a permanent delete: files, index row, and
 * registry bookkeeping. Callers are responsible for authorization.
 * @param ctx - plugin context.
 * @param sessionId - Session to erase.
 */
async function purgeOne(ctx, sessionId) {
  const removed = []
  const result = {
    sessionId,
    removed,
    index: await purgeSearchIndex(ctx, sessionId),
    registryCalls: [],
    registryRefs: 0,
    deletedPaths: 0,
  }
  // Stop a running turn the way the Stop button would, so the log cannot gain
  // another frame between the last flush and the unlink.
  try {
    ctx.emit('workspace/session-stop', { sessionId })
  } catch {
    // nothing was running, or no listener is installed in this composition
  }
  result.registryCalls = await scrubRegistry(ctx, sessionId)
  await removeSessionLogs(sessionId, removed)
  await removeProjectionCache(sessionId, removed)
  result.registryRefs = await scrubRegistryFile(sessionId, removed)
  result.deletedPaths = removed.length
  // Tell the client the Session left the live registry: the sidebar drops the
  // row, the transcript closes, and no stale frame survives the reload.
  try {
    ctx.emit('api-session/removed', sessionId)
  } catch {
    // a headless composition without the api-session forwarder
  }
  return result
}

/**
 * Permanently erase one ungrouped Session.
 * @param ctx - plugin context.
 * @param sessionId - Session to erase.
 * @returns the RpcResult envelope with the paths that were touched.
 */
async function deleteSession(ctx, sessionId) {
  if (typeof sessionId !== 'string' || SESSION_ID.test(sessionId) === false) {
    return fail('session/invalid-id', `dsh-session-delete: invalid Session id ${JSON.stringify(sessionId)}`, { sessionId })
  }
  const grouping = groupingOf(ctx, sessionId)
  if (grouping.grouped) {
    return fail(
      'session/not-ungrouped',
      `Session ${sessionId} still belongs to workspace ${JSON.stringify(grouping.workspaceTitle ?? grouping.workspaceId)}; only 未分组 Sessions can be permanently deleted.`,
      { sessionId, workspaceId: grouping.workspaceId },
    )
  }
  return ok(await purgeOne(ctx, sessionId))
}

/**
 * Every archived Session that belongs to no workspace, newest first. This is
 * the exact set the bulk action is allowed to erase.
 * @param ctx - plugin context.
 */
async function listArchivedUngrouped(ctx) {
  const { grouped } = groupingIndex(ctx)
  const archived = await archivedIds(ctx)
  const items = []
  for (const sessionId of archived) {
    if (grouped.has(sessionId)) continue
    if (SESSION_ID.test(sessionId) === false) continue
    const meta = await readCachedMeta(sessionId)
    const present = await hasSessionLog(sessionId)
    items.push({ sessionId, title: meta.title, cwd: meta.cwd, createdAt: meta.createdAt, present })
  }
  items.sort((a, b) => b.createdAt - a.createdAt || a.sessionId.localeCompare(b.sessionId))
  return { items, total: items.length }
}

/**
 * Whether a log directory still exists for this Session.
 * @param sessionId - Session to look for.
 */
async function hasSessionLog(sessionId) {
  const root = join(dshHome(), 'sessions')
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return false
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (await isDirectory(join(root, entry.name, sessionId))) return true
  }
  return false
}

/**
 * Bulk-clear archived ungrouped Sessions.
 *
 * Authorization is computed here, not trusted from the caller: the request can
 * only narrow the set to `archived ∩ ¬grouped`, so a compromised or buggy
 * client cannot reach a grouped Session or an unarchived one through this
 * endpoint.
 * @param ctx - plugin context.
 * @param requested - optional explicit subset.
 */
async function purgeArchivedUngrouped(ctx, requested) {
  const listed = await listArchivedUngrouped(ctx)
  const allowed = new Set(listed.items.map((item) => item.sessionId))
  let targets = listed.items.map((item) => item.sessionId)
  if (Array.isArray(requested)) {
    const wanted = new Set(requested.filter((id) => typeof id === 'string'))
    targets = targets.filter((id) => wanted.has(id))
  }
  const deleted = []
  const index = []
  const failed = []
  for (const sessionId of targets) {
    try {
      const result = await purgeOne(ctx, sessionId)
      deleted.push({ sessionId, title: listed.items.find((item) => item.sessionId === sessionId)?.title ?? '' })
      index.push({ sessionId, ...result.index })
    } catch (error) {
      failed.push({ sessionId, message: messageOf(error) })
    }
  }
  return {
    requested: Array.isArray(requested) ? targets.length : allowed.size,
    deleted,
    failed,
    index,
  }
}

/**
 * Read-only diagnostics used to verify the plugin end to end from the GUI.
 * @param ctx - plugin context.
 * @param sessionId - optional Session to describe.
 */
async function inspectSession(ctx, sessionId) {
  const home = dshHome()
  const root = join(home, 'sessions')
  const logDirs = []
  if (sessionId !== undefined) {
    try {
      for (const entry of await readdir(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const candidate = join(root, entry.name, sessionId)
        if (await isDirectory(candidate)) logDirs.push(candidate)
      }
    } catch {
      // no sessions root yet
    }
  }
  const projcacheDir = join(home, 'storages', 'session_projcache', 'sessions')
  const projcacheHas = []
  if (sessionId !== undefined) {
    const bare = sessionId.replace(/^session-/, '')
    for (const name of [`${sessionId}.json`, `${bare}.json`]) {
      if (await exists(join(projcacheDir, name))) projcacheHas.push(name)
    }
  }
  const live = ctx.get('sessions')
  let resident = false
  if (live !== undefined && sessionId !== undefined) {
    try {
      resident = live.get(sessionId) !== undefined
    } catch {
      resident = false
    }
  }
  return ok({
    home,
    sessionsRoot: root,
    sessionsRootExists: await isDirectory(root),
    projectionCacheDir: projcacheDir,
    projectionCacheExists: await isDirectory(projcacheDir),
    grouping: sessionId === undefined ? undefined : groupingOf(ctx, sessionId),
    resident,
    logDirs,
    projcacheHas,
    searchIndex: await describeSearchIndex(ctx),
    archivedUngrouped: (await listArchivedUngrouped(ctx)).total,
  })
}

/**
 * RPC endpoint handler for the client half.
 * @param endpoint - private endpoint name.
 * @param payload - caller payload; the `{ args }` gateway envelope is accepted too.
 */
async function handleRpc(ctx, endpoint, payload) {
  const args = payload?.args ?? payload
  const sessionId = args?.sessionId
  try {
    switch (endpoint) {
      case 'delete':
        return await deleteSession(ctx, sessionId)
      case 'list-archived-ungrouped':
        return ok(await listArchivedUngrouped(ctx))
      case 'purge-archived-ungrouped':
        return ok(await purgeArchivedUngrouped(ctx, args?.sessionIds))
      case 'inspect':
        return await inspectSession(ctx, sessionId)
      default:
        return fail('internal', `dsh-session-delete: unknown endpoint ${JSON.stringify(endpoint)}`, {})
    }
  } catch (error) {
    return fail('internal', `dsh-session-delete: ${endpoint} failed: ${messageOf(error)}`, {})
  }
}

/**
 * Read one request body as UTF-8 text.
 * @param {import('node:http').IncomingMessage} req - the request.
 * @returns {Promise<string>} the body.
 */
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/**
 * Mount the RPC channel.
 *
 * `connection.rpc.handle()` cannot be used on this DSH build: it registers its
 * route through `owner.webServer.register(...)`, where `owner` is the
 * Connection plugin's own fiber, and that fiber never injects `webServer`
 * (it only uses it inside a nested `ctx.inject(['webServer'], ...)`), so the
 * call always throws `cannot get property "webServer" without inject` and
 * aborts this whole host half. Registering the route on our own context and
 * speaking the documented wire envelope directly avoids that defect.
 *
 * Wire contract (mirrors `@deepseek-ai/dsh-client-connection`):
 *   request  POST <RPC_CHANNEL>/<endpoint>
 *            { type: 'client-request', rpcId, method, payload }
 *   response { type: 'server-response', rpcId, result: { ok, value | error } }
 *
 * @param ctx - plugin context.
 */
export function apply(ctx) {
  ctx.inject(['webServer'], (webCtx) => {
    const route = {
      kind: 'prefix',
      path: RPC_CHANNEL,
      handler: async (req, res) => {
        // Keep the Host/Origin fence and browser authentication that
        // `connection.rpc.handle()` would have applied for us.
        const rejection = ctx.get('connection')?.requestRejection(req)
        if (rejection !== undefined) {
          res.writeHead(rejection)
          res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
          return
        }
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end('method not allowed')
          return
        }
        const contentType = req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
        if (contentType !== 'application/json') {
          res.writeHead(415)
          res.end('content type must be application/json')
          return
        }
        let message
        try {
          message = JSON.parse(await readRequestBody(req))
        } catch {
          res.writeHead(400)
          res.end('body is not JSON')
          return
        }
        const rpcId = message?.rpcId
        if (typeof rpcId !== 'string') {
          res.writeHead(400)
          res.end('missing rpcId')
          return
        }
        const endpoint = typeof message?.method === 'string' ? message.method : ''
        const result = await handleRpc(ctx, endpoint, message?.payload)
        const body = JSON.stringify({ type: 'server-response', rpcId, result })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(body)
      },
    }
    return webCtx.effect(() => webCtx.webServer.register(route), 'dsh-session-delete: rpc channel')
  })
}
