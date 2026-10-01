/**
 * Unit tests for the registry path reader.
 *
 * Run: node lib/path.test.mjs
 *
 * The DeepSeek official balance endpoint returns its number inside an array
 * (`balance_infos[0].total_balance`), which the previous dot-only reader could
 * not reach; these cases pin that behaviour.
 */
import assert from 'node:assert/strict'
import { pickPath } from './path.js'

// Plain key paths still work (Command Code shape).
assert.equal(pickPath({ credits: { monthlyCredits: 52.3 } }, 'credits.monthlyCredits'), 52.3)
assert.equal(pickPath({ windowLimits: { fiveHour: { cap: 14 } } }, 'windowLimits.fiveHour.cap'), 14)

// Array index (DeepSeek official balance shape).
const deepseek = { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '52.30', granted_balance: '2.30', topped_up_balance: '50.00' }] }
assert.equal(pickPath(deepseek, 'balance_infos[0].total_balance'), '52.30')
assert.equal(pickPath(deepseek, 'balance_infos[0].currency'), 'CNY')
assert.equal(pickPath(deepseek, 'is_available'), true)

// Nested arrays and a bare index.
assert.equal(pickPath({ a: [[1, 2], [3]] }, 'a[0][1]'), 2)
assert.equal(pickPath({ a: [[1, 2]] }, 'a[1]'), undefined)
assert.equal(pickPath([{ v: 7 }], '[0].v'), 7)

// Missing links and empty containers resolve to undefined, never throw.
assert.equal(pickPath(deepseek, 'balance_infos[3].total_balance'), undefined)
assert.equal(pickPath({ balance_infos: [] }, 'balance_infos[0].total_balance'), undefined)
assert.equal(pickPath({}, 'a.b.c'), undefined)
assert.equal(pickPath(null, 'a'), undefined)
assert.equal(pickPath(undefined, 'a[0]'), undefined)
assert.equal(pickPath({ a: 1 }, ''), undefined)

// Malformed declarations are treated as "no value" so the platform can report
// `unparsed` instead of failing the entire request.
assert.equal(pickPath({ a: 1 }, 'a['), undefined)
assert.equal(pickPath({ a: 1 }, 'a[x]'), undefined)
assert.equal(pickPath({ a: 1 }, 'a[-1]'), undefined)

// Falsy-but-real values are preserved.
assert.equal(pickPath({ a: [{ b: 0 }] }, 'a[0].b'), 0)
assert.equal(pickPath({ a: false }, 'a'), false)

console.log('PATH_TEST=PASS')
