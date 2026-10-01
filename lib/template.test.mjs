/**
 * Public template and logo contract tests.
 *
 * Templates live in the single-file client bundle, so extract the literal array
 * from the real source rather than maintaining a second catalog in Node.
 *
 * Run: node lib/template.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'ui2.js'), 'utf8')
const start = source.indexOf('var PLATFORM_TEMPLATES = [')
assert.ok(start > 0, 'client must declare PLATFORM_TEMPLATES')
const end = source.indexOf('];', start)
assert.ok(end > start, 'template array must close')
const literal = source.slice(source.indexOf('[', start), end + 1)
const templates = new Function(`return ${literal}`)()

assert.ok(Array.isArray(templates) && templates.length >= 8, 'public template catalog must cover mainstream providers')
const ids = new Set()
for (const template of templates) {
  assert.ok(/^[a-z0-9][a-z0-9_-]{0,63}$/.test(template.id), `invalid template id: ${template.id}`)
  assert.ok(!ids.has(template.id), `duplicate template id: ${template.id}`)
  ids.add(template.id)
  assert.ok(template.name && template.label && template.logoKey, `template ${template.id} needs public identity metadata`)
  assert.ok(/^[A-Z][A-Z0-9_-]{2,11}$/.test(template.currency), `template ${template.id} currency must be normalized`)
  assert.ok(['manual', 'auto', 'account'].includes(template.mode), `template ${template.id} mode invalid`)
  for (const privateField of ['balance', 'budget', 'monthUsed', 'renewUrl', 'expireAt']) {
    assert.equal(template[privateField], undefined, `template ${template.id} must not include ${privateField}`)
  }
  if (template.mode === 'auto') {
    assert.ok(/^https:\/\//.test(template.endpoint), `auto template ${template.id} must use HTTPS`)
    assert.ok(template.keyRef && template.balancePath, `auto template ${template.id} needs public schema fields`)
  } else {
    assert.equal(template.endpoint, undefined, `non-auto template ${template.id} must not include endpoint`)
    assert.equal(template.keyRef, undefined, `non-auto template ${template.id} must not include keyRef`)
    assert.equal(template.balancePath, undefined, `non-auto template ${template.id} must not include balancePath`)
  }
}

// The card must render logoKey through the local inline mark component; it must
// not fall back to provider-specific text branches as the primary mechanism.
assert.ok(source.includes('function PlatformLogo(props)'), 'PlatformLogo component must exist')
assert.ok(source.includes('logoKey: String(values.logoKey'), 'form payload must persist logoKey')
assert.ok(source.includes('h(PlatformLogo'), 'cards must render PlatformLogo')
assert.ok(source.includes('模板不会填入余额、预算、续费链接、登录信息或密钥'), 'template privacy notice must be visible')

console.log('TEMPLATE_TEST=PASS')
