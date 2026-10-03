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

assert.ok(Array.isArray(templates) && templates.length >= 10, 'public template catalog must cover mainstream providers')
const expectedPublicIds = ['deepseek', 'commandcode', 'volcengine-ark', 'opencode', 'alaya-code', 'zhipu']
for (const id of expectedPublicIds) assert.ok(templates.some(template => template.id === id), `missing confirmed platform template: ${id}`)
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
assert.ok(source.includes('M440.898 139.167'), 'DeepSeek must use the official whale mark path')
assert.ok(source.includes('viewBox: "0 0 512 509.64"'), 'DeepSeek whale must use the official icon viewBox')
assert.ok(source.includes('模板不会填入余额、预算、续费链接、登录信息或密钥'), 'template privacy notice must be visible')
assert.ok(source.includes('var fractionDigits = currency === "CNY" || currency === "USD" ? 2 : 4;'), 'CNY and USD must use compact two-decimal amounts')
assert.ok(source.includes('function sourceLabel(platform)'), 'platform source labels must be explicit')
assert.ok(source.includes('API 自动检测') && source.includes('账号自动同步') && source.includes('手动维护'), 'source labels must distinguish sync modes')
assert.ok(source.includes('typeof root.getBoundingClientRect === "function" ? root : el'), 'footer placement must fall back to the trigger element outside a sidebar root')
assert.ok(source.includes('disabled: disabled') && source.includes('!props.url'), 'renew action must remain visible but disabled when no official URL exists')
assert.ok(source.includes('p.renewUrl ? h(RenewBtn') === false, 'card must not hide renew action when URL is absent')

console.log('TEMPLATE_TEST=PASS')
