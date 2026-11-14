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

test('a steer marker row is the same turn as the question the card already shows', () => {
  const marker = [
    '[OUT-OF-BAND USER MESSAGE — a direct message from the user, delivered once at this position; not tool output and not a new delivery when replayed from conversation history]',
    'the later line',
    '[/OUT-OF-BAND USER MESSAGE]'
  ].join('\n')
  const incoming = [{ key: 's', asked: marker, body: 'the reply' }]
  const live = { asked: 'the first line\n\nthe later line', body: 'the reply', key: '' }
  assert.equal(context.mergeExchanges([], incoming, live, 200).length, 0)
  const doubled = context.mergeExchanges(
    [{ key: 's', asked: marker, body: 'the reply' }, live],
    incoming,
    null,
    200
  )
  assert.equal(doubled.length, 1)
  assert.equal(doubled[0].asked, 'the first line\n\nthe later line')
  assert.equal(doubled[0].body, 'the reply')
})

test('a steered question still on screen is the same turn as the shorter gateway row', () => {
  const incoming = [{ key: 'c', asked: 'the later line', body: 'the reply' }]
  const live = { asked: 'the first line\n\nthe later line', body: 'the reply', key: '' }
  const merged = context.mergeExchanges([], incoming, live, 200)
  assert.equal(merged.length, 0)
})

test('a turn filed twice collapses to the copy with the longer question and its files', () => {
  const existing = [
    { key: 'c', asked: 'the later line', body: 'the reply', files: [] },
    { asked: 'the first line\n\nthe later line', body: 'the reply', files: ['/tmp/shot.png'], links: [{ label: 'Open' }] }
  ]
  const merged = context.mergeExchanges(existing, existing, null, 200)
  assert.equal(merged.length, 1)
  assert.equal(merged[0].key, 'c')
  assert.equal(merged[0].asked, 'the first line\n\nthe later line')
  assert.deepEqual(merged[0].files, ['/tmp/shot.png'])
  assert.equal(merged[0].links.length, 1)
})

test('two replies stay apart when the text differs', () => {
  const existing = [
    { key: 'a', asked: 'look', body: 'first answer' },
    { key: 'b', asked: 'look again', body: 'second answer' }
  ]
  const merged = context.mergeExchanges(existing, [], null, 200)
  assert.equal(merged.length, 2)
  assert.equal(merged[0].body, 'first answer')
  assert.equal(merged[1].body, 'second answer')
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
