import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { root } from '../scripts/template.mjs'

test('dictation falls through to Hex, and Hex hands the transcript back for the field', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blob-dictate-'))
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(bin)
  const log = path.join(dir, 'log')
  const write = (name, body) => fs.writeFileSync(path.join(bin, name), body, { mode: 0o755 })
  // Stable Omarchy has no `omarchy dictation`; Voxtype's daemon is not running.
  write('omarchy', '#!/bin/sh\necho "Unknown Omarchy command: omarchy $*" >&2\nexit 127\n')
  write('voxtype', '#!/bin/sh\necho "voxtype $*" >> "$DICTATION_LOG"\nexit 1\n')
  write('hex', [
    '#!/bin/sh',
    'echo "hex $*" >> "$DICTATION_LOG"',
    'case "$*" in',
    '  start) touch "$D/up"; exit 0 ;;',
    '  "status --json") [ -e "$D/up" ] || exit 3; s=idle; [ -e "$D/rec" ] && s=recording; printf \'{"capture":{"state":"%s"}}\' "$s"; exit 0 ;;',
    '  "dictation start") touch "$D/rec"; exit 0 ;;',
    '  "dictation stop --print") rm -f "$D/rec"; [ -e "$D/silent" ] && exit 4; printf "hello from hex\\n"; exit 0 ;;',
    'esac',
    'exit 2'
  ].join('\n') + '\n')
  const env = { PATH: bin + ':/usr/bin:/bin', HOME: dir, XDG_CONFIG_HOME: path.join(dir, 'config'), DICTATION_LOG: log, D: dir }
  const dictate = () => spawnSync('/usr/bin/python3', [path.join(root, 'bin/grokbot-dictate')], { encoding: 'utf8', env })
  const calls = () => fs.readFileSync(log, 'utf8').trim().split('\n').filter((l) => l.startsWith('hex'))

  // First press: Hex is closed, so it is opened, then a locked recording starts. Nothing printed.
  let result = dictate()
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, '')
  assert.deepEqual(calls(), ['hex status --json', 'hex start', 'hex dictation start'])

  // Second press: the recording is finished and its transcript comes back on stdout only.
  fs.rmSync(log)
  result = dictate()
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'hello from hex')
  assert.deepEqual(calls(), ['hex status --json', 'hex dictation stop --print'])

  // No speech heard: a quiet success with nothing to insert.
  fs.writeFileSync(path.join(dir, 'silent'), '')
  dictate()
  result = dictate()
  assert.equal(result.status, 0)
  assert.equal(result.stdout, '')

  // Nothing takes it: a plain failure, not a crash.
  fs.rmSync(path.join(bin, 'hex'))
  result = dictate()
  assert.equal(result.status, 1)
  assert.match(result.stderr, /No dictation backend took the toggle/)
})

test('a transcript handed back by the helper goes in at the field\'s cursor', () => {
  const main = fs.readFileSync(path.join(root, 'Main.qml'), 'utf8')
  const panel = fs.readFileSync(path.join(root, 'BubblePanel.qml'), 'utf8')
  assert.match(main, /id: dictateProc\n\s*command: \["\/usr\/bin\/python3", "-I", root\.dictateHelper\]\n\s*stdout: StdioCollector/)
  assert.match(main, /if \(bubblePanel\) bubblePanel\.insertText\(text\)/)
  assert.match(panel, /function insertText\(value\) \{[\s\S]*?promptField\.insert\(at, text\)/)
})
