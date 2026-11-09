import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { root } from '../scripts/template.mjs'

// The same fixture runs against agent_desktop/wake.py in tests/test_wake.py.
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/wake-phrases.json'), 'utf8'))

function dictation() {
  const source = fs.readFileSync(path.join(root, 'qml/dictation.js'), 'utf8').replace(/^\.pragma library\s*/, '')
  const context = {}
  vm.createContext(context)
  vm.runInContext(source, context)
  return context
}

test('qml/dictation.js routes every shared wake-phrase case', () => {
  const lib = dictation()
  assert.ok(fixture.cases.length >= 20)
  for (const { text, expected } of fixture.cases) {
    const got = lib.route(text, fixture.roster, fixture.primaryId)
    assert.deepEqual(
      { matched: got.matched, botId: got.botId, prompt: got.prompt },
      expected,
      JSON.stringify(text)
    )
  }
})
