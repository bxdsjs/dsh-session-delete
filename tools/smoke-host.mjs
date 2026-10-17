/**
 * Offline smoke test for the dsh-session-delete HOST half.
 *
 * It exercises the real `src/node.js` against a throwaway `$DSH_HOME`, so the
 * user's own sessions are never touched. The fixture reproduces the shipped
 * on-disk shapes: per-encoded-cwd log directories, both projection-cache
 * filename spellings, the `workspace.json` registry unit, and a session search
 * index with the schema `@deepseek-ai/dsh-session-query-sqlite` really creates.
 *
 * Run: node tools/smoke-host.mjs
 */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const TARGET = 'session-11111111-2222-3333-4444-555555555555'
const TARGET_BARE = '11111111-2222-3333-4444-555555555555'
const BULK_A = 'session-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const BULK_B = 'session-bbbbbbbb-cccc-dddd-eeee-ffffffffffff'
const GROUPED = 'session-99999999-8888-7777-6666-555555555555'
const OPEN_SESSION = 'session-77777777-6666-5555-4444-333333333333'

const home = await mkdtemp(join(tmpdir(), 'dsh-session-delete-'))
process.env.DSH_HOME = home

// ---- fixture: session log dirs under one encoded-cwd root -----------------
const sessionsRoot = join(home, 'sessions')
const cwdRoot = join(sessionsRoot, '--C-Users-1-Desktop-demo--')
for (const id of [TARGET, BULK_A, BULK_B, GROUPED, OPEN_SESSION]) {
  await mkdir(join(cwdRoot, id), { recursive: true })
  await writeFile(join(cwdRoot, id, 'session.v4.jsonl.zstd'), 'payload')
}

// ---- fixture: projection cache in BOTH filename spellings -----------------
const projDir = join(home, 'storages', 'session_projcache', 'sessions')
await mkdir(projDir, { recursive: true })
const cacheRow = (title, cwd, createdAt) => JSON.stringify({
  version: 7,
  record: { identity: { cwd, createdAt }, rows: { title: { ver: 1, seq: 3, val: title } } },
})
await writeFile(join(projDir, `${TARGET}.json`), cacheRow('目标会话', 'C:\\Users\\1\\Desktop\\demo', 3000))
await writeFile(join(projDir, `${TARGET_BARE}.json`), cacheRow('目标会话(裸名)', 'C:\\Users\\1\\Desktop\\demo', 3000))
await writeFile(join(projDir, `${BULK_A}.json`), cacheRow('批量甲', 'C:\\Users\\1\\Desktop\\demo', 2000))
await writeFile(join(projDir, `${BULK_B}.json`), cacheRow('批量乙', 'C:\\Users\\1\\Desktop\\video', 1000))
await writeFile(join(projDir, `${GROUPED}.json`), cacheRow('分组会话', 'C:\\Users\\1\\Desktop\\demo', 2500))
await writeFile(join(projDir, 'session-other.json'), '{"version":7}')

// ---- fixture: registry bookkeeping ---------------------------------------
// archived: TARGET, BULK_A, BULK_B, GROUPED. GROUPED is also claimed by ws-1,
// so it must never be listed or deleted by the bulk action.
const registryFile = join(home, 'storages', 'workspace.json')
await writeFile(registryFile, `${JSON.stringify({
  unit: { name: 'workspace', version: 2 },
  global: {
    initialized: true,
    workspaceIds: ['ws-1'],
    archivedSessionIds: [TARGET, BULK_A, BULK_B, GROUPED, 'session-other'],
    pinnedSessionIds: [TARGET],
  },
  tables: {
    workspaces: {
      'ws-1': {
        id: 'ws-1',
        path: 'C:\\Users\\1\\Desktop\\demo',
        title: 'demo',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        sessionIds: [GROUPED, TARGET],
      },
    },
  },
}, null, 2)}\n`, 'utf8')

// ---- fixture: session search index (real schema) --------------------------
const indexFile = join(home, 'storages', 'session-index.sqlite')
const index = new DatabaseSync(indexFile)
index.exec('PRAGMA application_id = 1515083349')
index.exec('CREATE TABLE search_state (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), global_generation INTEGER NOT NULL) STRICT')
index.exec('INSERT INTO search_state (singleton, global_generation) VALUES (1, 7)')
index.exec(`CREATE TABLE persisted_sessions (
  id TEXT PRIMARY KEY, version INTEGER NOT NULL, created_at INTEGER NOT NULL, cwd TEXT,
  parent_session TEXT, seed_length INTEGER, delegation_depth INTEGER, agent_preset TEXT,
  revision TEXT NOT NULL, generation INTEGER NOT NULL
) STRICT`)
index.exec(`CREATE VIRTUAL TABLE persisted_docs USING fts5(
  text, session_id UNINDEXED, seq UNINDEXED, type UNINDEXED, time UNINDEXED,
  surface UNINDEXED, codepoint_length UNINDEXED, tokenize = 'unicode61'
)`)
const insertSession = index.prepare(
  'INSERT INTO persisted_sessions (id, version, created_at, cwd, parent_session, seed_length, delegation_depth, agent_preset, revision, generation) VALUES (?, 4, 0, ?, NULL, NULL, NULL, NULL, ?, 1)',
)
const insertDoc = index.prepare(
  'INSERT INTO persisted_docs (text, session_id, seq, type, time, surface, codepoint_length) VALUES (?, ?, ?, ?, 0, ?, 1)',
)
for (const [id, text] of [[TARGET, '目标会话的秘密内容'], [BULK_A, '批量甲的正文'], [BULK_B, '批量乙的正文'], [GROUPED, '分组会话的正文']]) {
  insertSession.run(id, 'C:\\Users\\1\\Desktop\\demo', `rev-${id}`)
  insertDoc.run(text, id, 1, 'user/message', 'current')
}
index.close()

// ---- harness context ------------------------------------------------------
// The archive set is stateful so `unarchiveSession` behaves like the real
// registry: a purged id really disappears from the projection.
let archived = [TARGET, BULK_A, BULK_B, GROUPED, 'session-other']
let handler
const emitted = []
const ctx = {
  inject(_deps, callback) {
    callback({
      connection: {
        rpc: {
          handle(channel, fn) {
            handler = fn
            return async () => {}
          },
        },
      },
    })
  },
  emit(event, ...args) {
    emitted.push([event, ...args])
  },
  get(name) {
    if (name === 'workspaceRegistry') {
      return {
        get archivedSessionIds() {
          return [...archived]
        },
        list: () => [
          { id: 'ws-1', title: 'demo', sessionIds: [GROUPED], detachSession: async () => {} },
        ],
        unarchiveSession: async (id) => {
          archived = archived.filter((value) => value !== id)
        },
        unpinSession: async () => {},
      }
    }
    return undefined
  },
}

const mod = await import('../src/node.js')
if (mod.name !== 'dsh-session-delete') throw new Error('name export missing')
console.log('name =', mod.name, '| inject =', JSON.stringify(mod.inject))
mod.apply(ctx)
if (typeof handler !== 'function') throw new Error('RPC handler was not registered')

// ---- assertion helpers ----------------------------------------------------
let failures = 0
function check(label, condition) {
  if (condition) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label}`)
  }
}
async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}
function readIndex() {
  const db = new DatabaseSync(indexFile, { readOnly: true })
  try {
    const sessions = db.prepare('SELECT id FROM persisted_sessions ORDER BY id').all().map((row) => row.id)
    const docs = db.prepare('SELECT session_id FROM persisted_docs ORDER BY session_id').all().map((row) => row.session_id)
    const generation = db.prepare('SELECT global_generation FROM search_state WHERE singleton = 1').get().global_generation
    return { sessions, docs, generation }
  } finally {
    db.close()
  }
}

console.log('\n1) invalid id / grouping refusal')
const bad = await handler('delete', { args: { sessionId: '../escape' } })
check('path traversal rejected', bad.ok === false && bad.error.code === 'session/invalid-id')
const grouped = await handler('delete', { sessionId: GROUPED })
check('grouped session refused', grouped.ok === false && grouped.error.code === 'session/not-ungrouped')
check('grouped log dir untouched', await exists(join(cwdRoot, GROUPED)))
check('grouped index rows untouched', readIndex().sessions.includes(GROUPED))

console.log('\n2) inspect')
const before = await handler('inspect', { sessionId: TARGET })
check('inspect ok', before.ok === true)
check('inspect finds log dir', before.value.logDirs.length === 1)
check('inspect sees both projcache spellings', before.value.projcacheHas.length === 2)
check('inspect reports ungrouped', before.value.grouping.grouped === false)
check('inspect locates the search index', before.value.searchIndex.database === indexFile)
check('inspect names the node:sqlite driver', before.value.searchIndex.driver === 'node:sqlite')
check('inspect counts archived-ungrouped (4, GROUPED excluded)', before.value.archivedUngrouped === 4)

console.log('\n3) list archived ungrouped')
const genBefore = readIndex().generation
const listed = await handler('list-archived-ungrouped', {})
check('list ok', listed.ok === true)
const ids = listed.value.items.map((item) => item.sessionId)
check('excludes the grouped archived session', ids.includes(GROUPED) === false)
check('excludes the unarchived session', ids.includes(OPEN_SESSION) === false)
check(
  'lists every archived ungrouped id (stale ids included)',
  ids.length === 4 && [TARGET, BULK_A, BULK_B, 'session-other'].every((id) => ids.includes(id)),
)
check('newest first', ids[0] === TARGET)
const bulkARow = listed.value.items.find((item) => item.sessionId === BULK_A)
check('carries the cached title', bulkARow.title === '批量甲')
check('carries the working directory', bulkARow.cwd === 'C:\\Users\\1\\Desktop\\demo')
check('reports the log as present', bulkARow.present === true)
check('flags a stale id as absent', listed.value.items.find((item) => item.sessionId === 'session-other').present === false)

console.log('\n4) bulk purge: explicit subset, plus an unauthorized id')
const partial = await handler('purge-archived-ungrouped', {
  args: { sessionIds: [BULK_A, GROUPED, OPEN_SESSION] },
})
check('bulk ok', partial.ok === true)
check('only the allowed id was deleted', partial.value.deleted.length === 1 && partial.value.deleted[0].sessionId === BULK_A)
check('no failures', partial.value.failed.length === 0)
check('BULK_A log dir removed', (await exists(join(cwdRoot, BULK_A))) === false)
check('BULK_A projcache removed', (await exists(join(projDir, `${BULK_A}.json`))) === false)
check('BULK_A index rows removed', readIndex().sessions.includes(BULK_A) === false && readIndex().docs.includes(BULK_A) === false)
check('unauthorized grouped id survived', await exists(join(cwdRoot, GROUPED)))
check('unarchived id survived', await exists(join(cwdRoot, OPEN_SESSION)))
check('api-session/removed emitted for the deleted id', emitted.some(([e, id]) => e === 'api-session/removed' && id === BULK_A))

console.log('\n5) single delete: payload arrives in the { args } envelope')
const result = await handler('delete', { args: { sessionId: TARGET } })
check('delete ok', result.ok === true)
check('log dir removed', (await exists(join(cwdRoot, TARGET))) === false)
check('projcache session-<id>.json removed', (await exists(join(projDir, `${TARGET}.json`))) === false)
check('projcache <bare>.json removed', (await exists(join(projDir, `${TARGET_BARE}.json`))) === false)
check('unrelated projcache row kept', await exists(join(projDir, 'session-other.json')))
check('index rows removed', readIndex().sessions.includes(TARGET) === false && readIndex().docs.includes(TARGET) === false)
check('index generation bumped by exactly one', readIndex().generation === genBefore + 2)
check('other index rows kept', readIndex().sessions.includes(GROUPED) && readIndex().sessions.includes(BULK_B))
check('index purge reported', result.value.index.state === 'purged')

const registry = JSON.parse(await readFile(registryFile, 'utf8'))
check('archived set scrubbed', registry.global.archivedSessionIds.includes(TARGET) === false)
check('unrelated archived id kept', registry.global.archivedSessionIds.includes('session-other'))
check('pinned set scrubbed', registry.global.pinnedSessionIds.length === 0)
check('workspace sessionIds scrubbed', registry.tables.workspaces['ws-1'].sessionIds.join() === GROUPED)
check('registry shape preserved', registry.unit.name === 'workspace' && registry.unit.version === 2)
check('api-session/removed emitted', emitted.some(([e, id]) => e === 'api-session/removed' && id === TARGET))
check('workspace/session-stop emitted', emitted.some(([e]) => e === 'workspace/session-stop'))

console.log('\n6) bulk purge: everything left')
const remaining = await handler('purge-archived-ungrouped', {})
check('bulk ok', remaining.ok === true)
check(
  'clears the log-owning and the stale archived id',
  remaining.value.deleted.length === 2
    && remaining.value.deleted.map((row) => row.sessionId).sort().join() === [BULK_B, 'session-other'].sort().join(),
)
check('no failures', remaining.value.failed.length === 0)
check('BULK_B log dir removed', (await exists(join(cwdRoot, BULK_B))) === false)
check('BULK_B index rows removed', readIndex().sessions.includes(BULK_B) === false)
check('stale projcache row gone', (await exists(join(projDir, 'session-other.json'))) === false)
const afterList = await handler('list-archived-ungrouped', {})
check('nothing archived-ungrouped remains', afterList.value.total === 0)
check('grouped session still on disk', await exists(join(cwdRoot, GROUPED)))

console.log('\n7) idempotence and unknown endpoint')
const again = await handler('delete', { sessionId: TARGET })
check('second delete still ok', again.ok === true)
check('nothing left to unlink', again.value.deletedPaths === 0)
const unknown = await handler('nope', {})
check('unknown endpoint reported', unknown.ok === false && unknown.error.code === 'internal')

await rm(home, { recursive: true, force: true })
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exitCode = failures === 0 ? 0 : 1
