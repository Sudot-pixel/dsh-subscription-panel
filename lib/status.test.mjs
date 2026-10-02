/**
 * Unit tests for the client-side status model (方案 A).
 *
 * The client half is a single browser bundle (`lib/ui2.js`) loaded through
 * `window.__ModuleLoader__`, so it cannot be imported by Node. Instead this
 * test extracts the `// <<<pure-status>>>` block from the real shipped file and
 * evaluates it — the assertions therefore run against the exact code that
 * ships, with no duplicated copy to drift.
 *
 * Run: node lib/status.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'ui2.js'), 'utf8')
const open = source.indexOf('// <<<pure-status>>>')
const close = source.indexOf('// <<<end pure-status>>>')
assert.ok(open > 0 && close > open, 'lib/ui2.js must contain the pure-status block markers')
const block = source.slice(open, close)
const pure = new Function(`${block}
return { RENEWAL_PENDING_TTL_MS, RENEWAL_RESULT_TTL_MS, LOW_BALANCE_RATIO, normalizeRenewalRecords, renewalNote, platformHealth };`)()

const NOW = Date.parse('2026-10-01T22:30:00Z')
const minutes = (n) => n * 60 * 1000
const hours = (n) => n * 60 * 60 * 1000

// ---------------------------------------------------------------- 续费核对 TTL
// 仍在核对窗口内的 pending 原样保留
const freshPending = pure.normalizeRenewalRecords({ cc: { startedAt: NOW - minutes(5), status: 'pending', beforeBalance: 10 } }, NOW)
assert.equal(freshPending.cc.status, 'pending')

// 超过 15 分钟的 pending → 落成"未检测到余额变化"（而不是永久 pending）
const stalePending = pure.normalizeRenewalRecords({ cc: { startedAt: NOW - minutes(40), status: 'pending', beforeBalance: 10 } }, NOW)
assert.equal(stalePending.cc.status, 'unchanged')
assert.equal(stalePending.cc.judgedAt, NOW - minutes(40) + pure.RENEWAL_PENDING_TTL_MS)

// 结果在 24 小时内保留，超过则清除（这条正是"永远黄标"的根治）
assert.equal(pure.normalizeRenewalRecords({ cc: { startedAt: NOW - hours(2), status: 'unchanged', judgedAt: NOW - hours(2) } }, NOW).cc.status, 'unchanged')
assert.equal(pure.normalizeRenewalRecords({ cc: { startedAt: NOW - hours(30), status: 'unchanged', judgedAt: NOW - hours(30) } }, NOW).cc, undefined)
assert.equal(pure.normalizeRenewalRecords({ cc: { startedAt: NOW - hours(30), status: 'confirmed', confirmedAt: NOW - hours(30) } }, NOW).cc, undefined)

// 用户实际卡住的那条记录（很久以前点过续费、之后没充值）必须被清掉
const stuck = pure.normalizeRenewalRecords({
  alpha: { startedAt: NOW - hours(26), beforeBalance: 88.8, status: 'unchanged' },
  beta: { startedAt: NOW - hours(26), beforeBalance: 42.5, status: 'unchanged' },
}, NOW)
assert.deepEqual(stuck, {})

// 旧版本无 status 的记录按 startedAt 兜底；坏数据直接丢弃
assert.equal(pure.normalizeRenewalRecords({ cc: { startedAt: NOW - hours(1) } }, NOW).cc !== undefined, true)
assert.deepEqual(pure.normalizeRenewalRecords({ cc: { startedAt: NOW - hours(40) } }, NOW), {})
assert.deepEqual(pure.normalizeRenewalRecords({ cc: null, dd: 'nope', ee: { status: 'pending' } }, NOW), {})
assert.deepEqual(pure.normalizeRenewalRecords(null, NOW), {})
assert.deepEqual(pure.normalizeRenewalRecords(undefined, NOW), {})

// 不修改入参
const input = { cc: { startedAt: NOW - hours(30), status: 'unchanged', judgedAt: NOW - hours(30) } }
pure.normalizeRenewalRecords(input, NOW)
assert.equal(input.cc.status, 'unchanged', 'normalizeRenewalRecords must not mutate its input')

// ---------------------------------------------------------------- 次级文案
assert.equal(pure.renewalNote({ status: 'pending' }), '续费核对中…')
assert.equal(pure.renewalNote({ status: 'confirmed' }), '已检测到余额增加')
assert.equal(pure.renewalNote({ status: 'unchanged' }), '未检测到余额变化')
assert.equal(pure.renewalNote(null), '')
assert.equal(pure.renewalNote({ status: 'weird' }), '')

// ---------------------------------------------------------------- 主状态分档
const health = pure.platformHealth
assert.deepEqual(health({ status: 'ok', mode: 'account', balance: 27.75, budget: 60 }), { tier: 'ok', text: '正常' })
assert.deepEqual(health({ status: 'ok', mode: 'auto', balance: 88.8, budget: 100 }), { tier: 'ok', text: '正常' })
assert.equal(health({ status: 'no-key', mode: 'auto', balance: null, budget: 100 }).tier, 'danger')
assert.equal(health({ status: 'http-401', mode: 'auto', balance: null }).tier, 'danger')
assert.equal(health({ status: 'fetch-error', mode: 'auto', balance: null, error: '请求超时' }).tier, 'danger')
assert.equal(health({ status: 'credential-unavailable', mode: 'auto', balance: null }).tier, 'danger')
assert.equal(health({ status: 'unparsed', mode: 'auto', balance: null }).tier, 'danger')
assert.equal(health({ status: 'stale', mode: 'auto', balance: 4, error: '数据已陈旧' }).tier, 'warn')
assert.deepEqual(health({ status: 'exhausted', mode: 'auto', balance: 0 }), { tier: 'danger', text: '额度耗尽' })
assert.deepEqual(health({ status: 'ok', mode: 'account', balance: 0, budget: 60 }), { tier: 'danger', text: '额度耗尽' })
assert.deepEqual(health({ status: 'ok', mode: 'account', balance: 5, budget: 60 }), { tier: 'warn', text: '余额偏低' })
assert.equal(health({ status: 'ok', mode: 'account', balance: 12.5, budget: 60 }).tier, 'ok') // 20.8% 不算偏低
assert.deepEqual(health({ status: 'no-account', mode: 'account', error: '未登录 DeepSeek 账号' }), { tier: 'warn', text: '未登录 DeepSeek 账号' })
assert.deepEqual(health({ status: 'account-error', mode: 'account', error: 'boom' }), { tier: 'warn', text: 'boom' })
assert.deepEqual(health({ status: 'ok', mode: 'manual', balance: null }), { tier: 'idle', text: '未填数据' })
// 手动模式填了余额就是正常绿，不该因为"没接 API"而报错
assert.equal(health({ status: 'ok', mode: 'manual', balance: 42.5, budget: 60 }).tier, 'ok')
// 未知状态也要有兜底文案，不能显示 undefined
assert.equal(health({ status: 'weird' }).text, 'weird')
// 空对象 = 手动模式且没填余额 → 灰档，而不是假装"正常"
assert.equal(health({}).tier, 'idle')

console.log('STATUS_TEST=PASS')
