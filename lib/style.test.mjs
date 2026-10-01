/**
 * Design-contract tests for the renew button (P-UI-10 / P-UI-11).
 *
 * The client half is a single browser bundle, so this test extracts the CSS
 * array from the shipped `lib/ui2.js` and asserts against that real source:
 * no duplicated copy that could drift away from what ships.
 *
 * Run: node lib/style.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'ui2.js'), 'utf8')

// The stylesheet is a JS array of literal strings; evaluate it to get the CSS text.
const start = source.indexOf('var CSS = [')
assert.ok(start > 0, 'lib/ui2.js must declare the CSS array as `var CSS = [`')
const end = source.indexOf('].join', start)
assert.ok(end > start, 'CSS array must end with a `.join(...)`')
const arrayLiteral = source.slice(start + 'var CSS = '.length, end + 1)
const css = new Function(`return ${arrayLiteral}.join('')`)()

// ---------------------------------------------------------------- structure
assert.ok(css.includes('.dsubs-renew{'), 'renew base rule must exist')
for (const cls of ['Calm', 'Warn', 'Danger']) {
  assert.ok(css.includes(`.dsubs-renew${cls}{`), `tier rule .dsubs-renew${cls} must exist`)
}
assert.ok(css.includes('scale(.95)'), 'press must compress to .95 (P-UI-10 floor)')
assert.ok(!/scale\(\.9[0-4]\)/.test(css), 'press must not compress past the .95 floor')
assert.ok(css.includes('cubic-bezier(.18,1.62,.32,1)'), 'release must use the bounce curve')
assert.ok(css.includes('height:34px'), 'renew pill visual height must stay 34px (tuned down from the oversized 40px)')
assert.ok(/\.dsubs-renew::after\{[^}]*inset:-3px/.test(css), 'hit area must be widened to 40x40 by a transparent pseudo-element')
assert.ok(!css.includes('height:40px'), 'the pill itself must not grow back to 40px')
assert.ok(css.includes('font-variant-numeric:tabular-nums'), 'dynamic numbers must be tabular (P-UI-11)')
assert.ok(css.includes('.dsubs-renewLabel{'), 'label wrapper must exist (z-index above the gloss)')
assert.ok(css.includes(':focus-visible'), 'keyboard focus ring must exist')
assert.ok(css.includes('prefers-reduced-motion'), 'reduced-motion fallback must exist')
assert.ok(css.includes('prefers-reduced-transparency'), 'reduced-transparency fallback must exist')
assert.ok(css.includes('prefers-contrast'), 'prefers-contrast fallback must exist')

// The rim must be built from the border-box gradient technique, never a mask ring.
assert.ok(!css.includes('mask-composite'), 'rim must not use the mask technique (P-UI-10)')
assert.ok(css.includes('background-clip:border-box,padding-box'), 'rim must use border-box background clipping')

// The three chosen colors must be present (P-UI-10 palette).
for (const hex of ['#2E8B57', '#D4AF37', '#9B111E']) {
  assert.ok(css.toUpperCase().includes(hex.toUpperCase()), `palette color ${hex} must be used`)
}

// ---------------------------------------------------------------- readability
const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
const lum = (r) => 0.2126 * lin(r[0]) + 0.7152 * lin(r[1]) + 0.0722 * lin(r[2])
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
const hex = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) }
const gloss = (r, a) => r.map(c => Math.round(255 * a + c * (1 - a))) // worst-case white sheen over the surface

const expected = { Calm: '#2E8B57', Warn: '#D4AF37', Danger: '#9B111E' }
for (const tier of ['Calm', 'Warn', 'Danger']) {
  const rule = new RegExp(`\\.dsubs-renew${tier}\\{([\\s\\S]*?)\\}`).exec(css)
  assert.ok(rule, `tier rule .dsubs-renew${tier} must parse`)
  const face = /--renew-face:linear-gradient\([^)]*\)/.exec(rule[1])
  assert.ok(face, `${tier} must declare --renew-face`)
  const stops = [...face[0].matchAll(/#[0-9A-Fa-f]{3,6}\s+(\d+)%/g)].map(m => ({ pct: Number(m[1]), rgb: hex(m[0].trim().split(/\s+/)[0]) }))
  const text = /color:\s*(#[0-9A-Fa-f]{3,6})/.exec(rule[1])
  assert.ok(text, `${tier} must declare an explicit text color`)
  const textRgb = hex(text[1])
  const band = stops.filter(s => s.pct >= 26)
  assert.ok(band.length >= 2, `${tier} needs at least two text-band stops`)
  for (const stop of band) {
    const bare = contrast(stop.rgb, textRgb)
    const withSheen = contrast(gloss(stop.rgb, 0.12), textRgb)
    assert.ok(withSheen >= 4.5,
      `${tier} @ ${stop.pct}% must keep AA body-text contrast with sheen: got ${withSheen.toFixed(2)} (bare ${bare.toFixed(2)})`)
  }
  assert.ok(face[0].toUpperCase().includes(expected[tier].toUpperCase()),
    `${tier} must use the chosen palette color ${expected[tier]} (it belongs in the metal light band)`)
}

// ---------------------------------------------------------------- hygiene
assert.ok(!/font-weight:\s*[6-9]00/.test(css), 'font weight must stay <= 500 (P-UI-02)')
const astral = [...source].filter(ch => ch.codePointAt(0) > 0xffff)
assert.equal(astral.length, 0, 'no emoji/astral glyphs in the client bundle (P-UI-04)')

console.log('STYLE_TEST=PASS')
