/**
 * Read-only check against the REAL harness home: what would the bulk action
 * see and refuse right now? Calls only the read-only endpoints
 * (`list-archived-ungrouped`, `inspect`), so nothing is deleted.
 *
 * Run: node tools/live-inventory.mjs
 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
const registryFile = join(home, 'storages', 'workspace.json')

// Rebuild the registry snapshot the plugin would get from the live service,
// straight from the durable file: workspaces with their sessionIds, plus the
// global archive set.
const doc = JSON.parse(await readFile(registryFile, 'utf8'))
const workspaces = Object.values(doc?.tables?.workspaces ?? {}).map((record) => ({
  id: record.id,
  title: record.title,
  sessionIds: [...(record.sessionIds ?? [])],
  detachSession: async () => {},
}))
const archived = [...(doc?.global?.archivedSessionIds ?? [])]

let handler
const ctx = {
  inject(_deps, callback) {
    callback({ connection: { rpc: { handle(_channel, fn) { handler = fn; return async () => {} } } } })
  },
  emit() {},
  get(name) {
    if (name === 'workspaceRegistry') {
      return { get archivedSessionIds() { return [...archived] }, list: () => workspaces }
    }
    return undefined
  },
}

const mod = await import('../src/node.js')
mod.apply(ctx)

const inspect = await handler('inspect', {})
const listed = await handler('list-archived-ungrouped', {})

console.log('home                        :', inspect.value.home)
console.log('sessions root exists        :', inspect.value.sessionsRootExists)
console.log('projection cache exists     :', inspect.value.projectionCacheExists)
console.log('search index configured     :', inspect.value.searchIndex.configured)
console.log('search index in memory      :', inspect.value.searchIndex.inMemory)
console.log('search index driver         :', inspect.value.searchIndex.driver)
console.log('search index database       :', inspect.value.searchIndex.database)
console.log('workspaces                  :', workspaces.length,
  workspaces.map((w) => `${w.title}(${w.sessionIds.length})`).join(' '))
console.log('archived ids (global)       :', archived.length)
console.log('archived AND grouped        :', archived.filter((id) => workspaces.some((w) => w.sessionIds.includes(id))).length)
console.log('archived ungrouped (bulk set):', listed.value.total)
console.log('')
for (const item of listed.value.items) {
  console.log(`  ${item.present ? 'log' : 'stale'}  ${item.sessionId}  ${JSON.stringify(item.title)}  ${item.cwd}`)
}
