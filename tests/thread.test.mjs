import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { root } from '../scripts/template.mjs'

const context = {}
vm.createContext(context)
vm.runInContext(fs.readFileSync(path.join(root, 'qml/thread.js'), 'utf8').replace(/^\.pragma library\s*/, ''), context)

test('a refresh appends rows the Hermes app added and keeps the ones already shown', () => {
  const existing = [
    { key: 'a', asked: 'one', body: 'first' },
    { asked: 'two', body: 'local' }
  ]
  const incoming = [
    { key: 'a', asked: 'one', body: 'first' },
    { key: 'b', asked: 'two', body: 'local' },
    { key: 'c', asked: 'three', body: 'from the app' }
  ]
  const merged = context.mergeExchanges(existing, incoming, null, 200)
  assert.equal(merged.length, 3)
  assert.equal(merged[0].key, 'a')
  assert.equal(merged[1].key, 'b')
  assert.equal(merged[1].body, 'local')
  assert.equal(merged[2].key, 'c')
  assert.equal(merged[2].body, 'from the app')
})

test('the exchange still on screen is not copied in again', () => {
  const incoming = [{ key: 'c', asked: 'three', body: 'still typing' }]
  const merged = context.mergeExchanges([], incoming, { asked: 'three', body: 'still typing', key: '' }, 200)
  assert.equal(merged.length, 0)
})

test('only a later row or a changed last reply counts as news', () => {
  const shown = [{ key: 'a', asked: 'one', body: 'first' }]
  assert.equal(context.hasNews([], [{ key: 'a', asked: 'one', body: 'first' }]), false)
  assert.equal(context.hasNews(shown, shown), false)
  assert.equal(context.hasNews(shown, shown.concat([{ key: 'b', asked: 'two', body: 'next' }])), true)
  assert.equal(context.hasNews(shown, [{ key: 'a', asked: 'one', body: 'first, and more' }]), true)
})

test('an unchanged page does not look like a new thread', () => {
  const rows = [{ key: 'a', asked: 'one', body: 'first' }]
  assert.equal(context.sameThread(rows, context.mergeExchanges(rows, rows, null, 200)), true)
})
