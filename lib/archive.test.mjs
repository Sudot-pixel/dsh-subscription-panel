/**
 * Archive state-machine tests against the real host routes.
 *
 * Reproduces the user-reported stuck state (same platform ID present in both
 * .dsh-subs.json and .dsh-subs-archive.json) and asserts self-healing plus
 * idempotent archive/restore transitions. Runs in a throwaway DSH_HOME.
 *
 * Run: node lib/archive.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'dsh-archive-test-'))
process.env.DSH_HOME = home
const { apply } = await import('./host2.js')

const routes = new Map()
const ctx = {
  inject(_deps, fn) { fn({ webServer: { register: (o) => { routes.set(o.path, o.handler); return () => {} } } }) },
  effect() {},
  get() { return undefined },
}
apply(ctx)

const registryPath = join(home, '.dsh-subs.json')
const archivePath = join(home, '.dsh-subs-archive.json')
const platform = (id) => ({ id, name: id.toUpperCase(), short: 'T1', logoKey: null, currency: 'USD', mode: 'manual', renewUrl: null, renewHosts: [], autoRenew: false, price: null, expireAt: null, budget: null, monthUsed: null, balance: 5, windows: [] })
const writeRegistry = (ids) => writeFileSync(registryPath, JSON.stringify({ version: 1, platforms: ids.map(platform) }))
const writeArchive = (ids) => writeFileSync(archivePath, JSON.stringify({ version: 1, platforms: ids.map((id) => ({ platform: platform(id), archivedAt: new Date().toISOString() })) }))
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

const req = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json', host: '127.0.0.1:1', origin: 'http://127.0.0.1:1' }, on(event, cb) { if (event === 'data') cb(Buffer.from(JSON.stringify(body))); if (event === 'end') cb() } })
const call = async (path, body) => {
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v }, end(data) { this.body = data } }
  if (body === undefined) await routes.get(path)({ method: 'GET', url: path }, res)
  else await routes.get(path)(req(body), res)
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null }
}

// 1. The user's exact stuck state: deepseek in BOTH files.
writeRegistry(['deepseek', 'commandcode'])
writeArchive(['deepseek'])
let list = await call('/dsh-subs/list.json')
assert.equal(list.status, 200, 'conflict must not brick the panel: ' + JSON.stringify(list.body))
assert.ok(list.body.platforms.some((p) => p.id === 'deepseek'), 'live copy stays visible')
assert.ok(!list.body.archived.some((p) => p.id === 'deepseek'), 'conflicting tombstone is dropped from the view')
assert.ok(!readJson(archivePath).platforms.some((p) => p.platform.id === 'deepseek'), 'archive file self-healed')
assert.ok(list.body.platforms.some((p) => p.id === 'commandcode'), 'other platforms unaffected')

// 2. Restore during a conflict converges (idempotent), never deadlocks.
writeRegistry(['deepseek'])
writeArchive(['deepseek'])
let restore = await call('/dsh-subs/platforms/restore', { id: 'deepseek' })
assert.equal(restore.status, 200)
assert.equal(readJson(archivePath).platforms.length, 0, 'tombstone cleared')
assert.equal(readJson(registryPath).platforms.length, 1, 'live copy kept')

// 3. Archive during a conflict converges to ARCHIVED with a single entry.
writeRegistry(['deepseek'])
writeArchive(['deepseek'])
let archive = await call('/dsh-subs/platforms/archive', { id: 'deepseek' })
assert.equal(archive.status, 200)
assert.equal(readJson(registryPath).platforms.length, 0)
assert.equal(readJson(archivePath).platforms.length, 1, 'exactly one tombstone, no duplicates')

// 4. Full cycle: LIVE → ARCHIVED → LIVE → ARCHIVED → LIVE.
writeRegistry(['demo'])
for (const [action, path] of [['archive', '/dsh-subs/platforms/archive'], ['restore', '/dsh-subs/platforms/restore'], ['archive', '/dsh-subs/platforms/archive'], ['restore', '/dsh-subs/platforms/restore']]) {
  const result = await call(path, { id: 'demo' })
  assert.equal(result.status, 200, action + ' failed: ' + JSON.stringify(result.body))
  const live = readJson(registryPath).platforms.some((p) => p.id === 'demo')
  const tomb = readJson(archivePath).platforms.some((p) => p.platform.id === 'demo')
  assert.notEqual(live && tomb, true, action + ' left a conflicted state')
  assert.equal(live, action === 'restore')
  assert.equal(tomb, action === 'archive')
}

// 5. Double archive is already-archived, not a crash.
writeRegistry(['demo'])
await call('/dsh-subs/platforms/archive', { id: 'demo' })
const second = await call('/dsh-subs/platforms/archive', { id: 'demo' })
assert.equal(second.status, 409)
assert.equal(second.body.code, 'already-archived')

// 6. Restore of an unknown ID stays 404.
const missing = await call('/dsh-subs/platforms/restore', { id: 'nope' })
assert.equal(missing.status, 404)

// 7. Archived ID is suppressed from discovery output shape (list stays clean).
writeRegistry([])
writeArchive(['deepseek'])
list = await call('/dsh-subs/list.json')
assert.equal(list.status, 200)
assert.equal(list.body.platforms.length, 0)
assert.ok(list.body.archived.some((p) => p.id === 'deepseek'), 'archived platform stays listed for restore')

rmSync(home, { recursive: true, force: true })
console.log('ARCHIVE_TEST=PASS')
