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
  // Only the fakes and the two tools they use: a real omarchy, voxtype or hex on this machine
  // must not answer for them.
  const tools = path.join(dir, 'tools')
  fs.mkdirSync(tools)
  for (const name of ['touch', 'rm']) fs.symlinkSync(`/usr/bin/${name}`, path.join(tools, name))
  const env = { PATH: bin + ':' + tools, HOME: dir, XDG_CONFIG_HOME: path.join(dir, 'config'), DICTATION_LOG: log, D: dir }
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
  // The card lives in each output's window: the transcript goes to the one on screen.
  assert.match(main, /if \(root\.hostBubble\) root\.hostBubble\.insertText\(text\)/)
  assert.doesNotMatch(main, /bubblePanel\.insertText/)
  assert.match(panel, /function insertText\(value\) \{[\s\S]*?promptField\.insert\(at, text\)/)
})

test('Omarchy forwarding to a stopped Voxtype does not keep Hex from taking the toggle', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blob-dictate-omarchy-'))
  const bin = path.join(dir, 'bin')
  const tools = path.join(dir, 'tools')
  fs.mkdirSync(bin)
  fs.mkdirSync(tools)
  for (const name of ['touch', 'rm']) fs.symlinkSync(`/usr/bin/${name}`, path.join(tools, name))
  const log = path.join(dir, 'log')
  const write = (name, body) => fs.writeFileSync(path.join(bin, name), body, { mode: 0o755 })
  // Omarchy 4.5 has `omarchy dictation`, and its default backend is Voxtype, whose daemon is stopped.
  write('omarchy', '#!/bin/sh\necho "omarchy $*" >> "$DICTATION_LOG"\necho "Error: Voxtype daemon is not running." >&2\necho "Start it with: voxtype daemon" >&2\nexit 1\n')
  write('voxtype', '#!/bin/sh\necho "voxtype $*" >> "$DICTATION_LOG"\necho "Error: Voxtype daemon is not running" >&2\nexit 1\n')
  write('hex', '#!/bin/sh\necho "hex $*" >> "$DICTATION_LOG"\ncase "$*" in\n  "status --json") printf \'{"capture":{"state":"idle"}}\'; exit 0 ;;\n  "dictation start") exit 0 ;;\nesac\nexit 2\n')
  const env = { PATH: bin + ':' + tools, HOME: dir, XDG_CONFIG_HOME: path.join(dir, 'config'), DICTATION_LOG: log }
  const result = spawnSync('/usr/bin/python3', [path.join(root, 'bin/grokbot-dictate')], { encoding: 'utf8', env })
  assert.equal(result.status, 0, result.stderr)
  const calls = fs.readFileSync(log, 'utf8').trim().split('\n')
  assert.equal(calls[0], 'omarchy dictation toggle')
  assert.equal(calls[calls.length - 1], 'hex dictation start')

  // Any other Omarchy failure still stops there, so two recordings never start.
  write('omarchy', '#!/bin/sh\necho "omarchy $*" >> "$DICTATION_LOG"\necho "Superwhisper failed to start recording" >&2\nexit 1\n')
  fs.rmSync(log)
  const stopped = spawnSync('/usr/bin/python3', [path.join(root, 'bin/grokbot-dictate')], { encoding: 'utf8', env })
  assert.equal(stopped.status, 1)
  assert.deepEqual(fs.readFileSync(log, 'utf8').trim().split('\n'), ['omarchy dictation toggle'])
})
