import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { spawn, spawnSync } from 'node:child_process'
import http from 'node:http'
import { root, readJSON } from '../scripts/template.mjs'

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

function loadLibrary(file) {
  const source = read(file).replace(/^\.pragma library\s*/, '')
  const context = {}
  vm.createContext(context)
  vm.runInContext(source, context)
  return context
}

const shapes = loadLibrary('qml/shapes.js')
const palette = loadLibrary('qml/palette.js')
const face = loadLibrary('qml/face.js')
const bots = readJSON(path.join(root, 'data/bots.json')).bots
const main = read('Main.qml')
const manifest = readJSON(path.join(root, 'manifest.json'))

const EXPECTED = {
  'e0195a7d-f804-4688-9191-e2cf3574a6d1': ['Bob', 'teardrop', 'orange', true],
  'd0357ba3-1642-47bd-9b0c-95000cb33992': ['OmaBot', 'blob', 'green', false],
  '282eb8af-bad6-469a-9b02-1642fec94473': ['Poteto', 'blob', 'brown', false],
  '656295d3-33f7-49bb-a46b-ac9c8e27b7c9': ['Omarchy Bot', 'hex', 'green', false],
  'bed72fb0-0323-4349-81df-dfd08c1f25f6': ['Inbox Admin', 'tablet', 'cyan', false],
  '23c1f61a-4475-40dc-9735-3f6c2356ad08': ['dr eggbot', 'teardrop', 'red', false],
  'e3d5b428-7673-4527-b902-376eb1f43f14': ['Shop With Grok', 'wedge', 'yellow', false],
  'da22c7f3-7897-49b2-b4c8-ccc89107dcbf': ['.promo', 'blob', 'blue', false],
  '73a546c8-243a-456b-bc2d-71dd785c1b57': ['Afterglow', 'blob', 'black', false],
  '378abf9d-c832-46e7-b086-de521ff3d6eb': ['Family Finances', 'squircle', 'magenta', false],
  '8715dbc6-d584-417a-a892-368a16baa8dc': ['Middle Farm Admin', 'pebble', 'yellow', false],
  '64726ca8-0f59-4d71-9e17-1de60123e3db': ['Side Hustle CEO', 'cloud', 'brown', false],
  'bd5f2d80-b7ac-48ea-97c4-5f3b16207182': ['X Desk', 'blob', 'blue', false],
  '129f9b89-bb06-43ce-867e-401aebd9ac77': ['Writer', 'blob', 'blue', false],
  '0f73dfb4-2538-4a3b-b043-5e1e0196ea7f': ['Omarchy Changelog', 'blob', 'blue', false]
}

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((part) => {
    const value = parseInt(part, 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function contrast(a, b) {
  const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y)
  return (light + 0.05) / (dark + 0.05)
}

function runPython(script, args, options = {}) {
  return spawnSync(process.execPath ? 'python3' : 'python3', [path.join(root, script), ...args], {
    encoding: 'utf8',
    input: options.input,
    env: options.env,
    timeout: options.timeout || 15000
  })
}

test('service manifest replaces the bar-widget starter', () => {
  assert.equal(manifest.id, 'io.github.tcballard.grokbot-desktop')
  assert.deepEqual(manifest.kinds, ['service'])
  assert.equal(manifest.entryPoints.service, 'Main.qml')
  assert.equal(fs.existsSync(path.join(root, 'StarterWidget.qml')), false)
  assert.equal(fs.existsSync(path.join(root, 'Main.qml')), true)
  assert.doesNotMatch(main, /BarWidget/)
})

test('every official shape morphs through the same contour length', () => {
  assert.deepEqual([...shapes.NAMES], [
    'circle', 'square', 'triangle', 'diamond', 'pentagon',
    'hexagon', 'octagon', 'heptagon', 'pill', 'cloud',
    'heart', 'crescent', 'star', 'spark', 'burst',
    'flower', 'clover', 'sprout', 'drop', 'bean',
    'peanut', 'pebble', 'shield', 'ghost', 'bolt'
  ])
  assert.equal(shapes.resolve('teardrop'), 'drop')
  assert.equal(shapes.resolve('blob'), 'bean')
  assert.equal(shapes.resolve('hex'), 'hexagon')
  assert.equal(shapes.resolve('tablet'), 'pill')
  assert.equal(shapes.resolve('wedge'), 'bolt')
  assert.equal(shapes.resolve('squircle'), 'square')
  assert.equal(shapes.resolve('sparkle'), 'spark')
  assert.equal(shapes.resolve('leaf'), 'sprout')
  assert.equal(shapes.known('teardrop'), true)
  assert.notDeepEqual([...shapes.SHAPES.square.points[0]], [...shapes.SHAPES.diamond.points[0]])
  for (const name of shapes.NAMES) {
    const shape = shapes.SHAPES[name]
    assert.equal(shape.points.length, shapes.POINT_COUNT, name)
    for (const point of shape.points) {
      assert.ok(Math.abs(point[0]) <= 1 && Math.abs(point[1]) <= 1, name)
    }
    assert.ok(shape.points[0][1] <= shape.points[10][1] + 0.2, `${name} starts near the top`)
  }
  const mixed = shapes.blend('teardrop', 'hex', 0)
  const ended = shapes.blend('teardrop', 'hex', 1)
  assert.deepEqual(mixed.points[0], shapes.SHAPES.teardrop.points[0])
  const offset = shapes.bestOffset(shapes.SHAPES.teardrop.points, shapes.SHAPES.hex.points)
  assert.deepEqual(ended.points[40], shapes.SHAPES.hex.points[(40 + offset) % shapes.POINT_COUNT])
  const mid = shapes.blend('star', 'blob', 0.5)
  assert.equal(mid.points.length, shapes.POINT_COUNT)
  assert.ok(mid.eyeY > Math.min(shapes.SHAPES.star.eyeY, shapes.SHAPES.blob.eyeY) - 0.001)
})

test('palette eyes stay readable on each fill', () => {
  assert.deepEqual([...palette.NAMES], [
    'black', 'brown', 'red', 'orange', 'yellow', 'green',
    'cyan', 'blue', 'violet', 'magenta', 'gray'
  ])
  assert.equal(palette.OMARCHY, 'omarchy')
  assert.equal(palette.accepts('omarchy'), true)
  assert.equal(palette.accepts('pink'), false)
  for (const name of palette.NAMES) {
    const tone = palette.COLORS[name]
    assert.ok(contrast(tone.eye, tone.fill) >= 3, `${name} eye/fill contrast`)
    assert.notEqual(tone.pupil.toLowerCase(), tone.eye.toLowerCase())
    if (name === 'black') assert.equal(tone.eye.toLowerCase(), '#f4f4f5')
    else assert.equal(tone.eye.toLowerCase(), '#141416')
  }
  assert.equal(palette.COLORS.green.fill.toLowerCase(), '#5bc67a')
  assert.equal(palette.COLORS.orange.fill.toLowerCase(), '#f28b30')
})

test('bundled roster is the fifteen live bots, with Bob first', () => {
  assert.equal(bots.length, 15)
  assert.equal(bots[0].id, 'e0195a7d-f804-4688-9191-e2cf3574a6d1')
  assert.equal(bots.filter((bot) => bot.isPrimary).length, 1)
  const seen = new Set()
  for (const bot of bots) {
    assert.equal(seen.has(bot.id), false)
    seen.add(bot.id)
    const expected = EXPECTED[bot.id]
    assert.ok(expected, bot.id)
    const label = bot.shortName || bot.name
    assert.equal(label, expected[0])
    assert.equal(bot.avatarShape, expected[1])
    assert.equal(bot.avatarColor, expected[2])
    assert.equal(bot.isPrimary, expected[3])
    assert.equal(shapes.known(bot.avatarShape), true)
    assert.equal(palette.NAMES.includes(bot.avatarColor), true)
    assert.doesNotMatch(bot.description, /@|googlemail|\/home\/|\/Users\//)
  }
})

test('QML exposes the speech-bubble IPC and keeps outside text plain', () => {
  for (const name of ['summon', 'show', 'hide', 'toggle', 'settings', 'ask', 'dictate', 'bot', 'appearance', 'animate', 'say', 'sayLink', 'sayLinks', 'dismiss']) {
    assert.match(main, new RegExp(`function ${name}\\(`))
  }
  assert.match(main, /target:\s*"io\.github\.tcballard\.grokbot-desktop"/)
  assert.match(main, /WlrLayershell/)
  assert.match(main, /clearEnvironment:\s*true/)
  assert.match(main, /\/usr\/bin\/setpriv/)
  assert.match(main, /python3", "-I"/)
  assert.match(main, /Text\.PlainText/)
  assert.doesNotMatch(main, /Text\.(RichText|MarkdownText|AutoText)/)
  assert.doesNotMatch(main, /GROKBOT_WEBHOOK_KEY/)
  assert.match(read('BubblePanel.qml'), /Text\.PlainText/)
  assert.match(read('SettingsPanel.qml'), /Text\.PlainText/)
})

test('cursor helper refuses an unsanitized Hyprland socket path', () => {
  const result = runPython('bin/grokbot-cursor', [], {
    env: { ...process.env, HYPRLAND_INSTANCE_SIGNATURE: '$(bad)', XDG_RUNTIME_DIR: '/tmp' }
  })
  assert.equal(result.status, 2)
})

test('sync redacts private profile text and keeps the mark', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-sync-'))
  const agent = path.join(dir, 'agents', 'bob')
  fs.mkdirSync(agent, { recursive: true })
  fs.writeFileSync(path.join(agent, 'profile.json'), JSON.stringify({
    id: 'e0195a7d-f804-4688-9191-e2cf3574a6d1',
    name: 'Bob',
    description: 'Mail tom.ballard08@googlemail.com and read /home/box/agent-data/secret. Then stop.',
    avatarShape: 'teardrop',
    avatarColor: 'orange',
    isPrimary: true
  }))
  const output = path.join(dir, 'grokbot-bots.json')
  const result = runPython('bin/grokbot-sync', ['--from', path.join(dir, 'agents'), '--output', output], {
    env: { ...process.env, HOME: dir }
  })
  assert.equal(result.status, 0, result.stderr)
  const roster = readJSON(output).bots
  assert.equal(roster.length, 1)
  assert.equal(roster[0].avatarShape, 'teardrop')
  assert.equal(roster[0].avatarColor, 'orange')
  assert.match(roster[0].description, /\[redacted\]/)
  assert.match(roster[0].description, /\[path\]/)
  assert.doesNotMatch(roster[0].description, /googlemail|\/home\/box/)
})

test('agent mode keeps the prompt on stdin and caps a flood', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-ask-'))
  const config = path.join(home, '.config', 'omarchy')
  fs.mkdirSync(config, { recursive: true })
  const token = 'prompt-token-not-on-argv'
  fs.writeFileSync(path.join(config, 'grokbot-desktop.json'), JSON.stringify({
    dispatch: 'agent',
    command: ['/usr/bin/python3', '-c', 'import json,os,sys; open(os.environ["HOME"]+"/argv.json","w").write(json.dumps(sys.argv)); sys.stdout.write(sys.stdin.read())']
  }))
  const ok = runPython('bin/grokbot-ask', [], {
    input: JSON.stringify({ botId: 'e0195a7d-f804-4688-9191-e2cf3574a6d1', botName: 'Bob', prompt: token }),
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') }
  })
  assert.equal(ok.status, 0, ok.stderr)
  assert.match(ok.stdout, new RegExp(token))
  const argv = JSON.parse(fs.readFileSync(path.join(home, 'argv.json'), 'utf8'))
  assert.equal(argv.some((part) => String(part).includes(token)), false)

  fs.writeFileSync(path.join(config, 'grokbot-desktop.json'), JSON.stringify({
    dispatch: 'agent',
    command: ['/usr/bin/python3', '-c', 'print("x"*200000)']
  }))
  const flood = runPython('bin/grokbot-ask', [], {
    input: JSON.stringify({ botId: 'e0195a7d-f804-4688-9191-e2cf3574a6d1', botName: 'Bob', prompt: 'flood' }),
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') }
  })
  assert.equal(flood.status, 125, flood.stderr)
  assert.ok(flood.stdout.length <= 65536)
})

function spawnCollected(args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(args[0], args.slice(1), { env: options.env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (status) => resolve({ status, stdout, stderr, pid: child.pid }))
    if (options.input !== undefined) {
      child.stdin.write(options.input)
      child.stdin.end()
    }
    options.onPid?.(child.pid)
  })
}

test('webhook mode posts the four fields and keeps the key off argv', async () => {
  const key = `wk_${Math.random().toString(16).slice(2)}`
  let seen = null
  let cmdline = ''
  let pid = 0
  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      seen = { headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }
      try { cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8') } catch { cmdline = '' }
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ reply: 'pong: a < b\n\nthen x => y' }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-hook-'))
  const config = path.join(home, '.config', 'omarchy')
  fs.mkdirSync(config, { recursive: true })
  fs.writeFileSync(path.join(config, 'grokbot-desktop.json'), JSON.stringify({
    dispatch: 'webhook',
    webhookUrl: `http://127.0.0.1:${port}/hook`
  }))
  fs.writeFileSync(path.join(config, 'grokbot-webhook.key'), `${key}\n`, { mode: 0o600 })
  const child = await spawnCollected(['python3', path.join(root, 'bin/grokbot-ask')], {
    input: JSON.stringify({
      botId: 'e0195a7d-f804-4688-9191-e2cf3574a6d1',
      botName: 'Bob',
      prompt: "What's on my calendar?"
    }),
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), GROKBOT_WEBHOOK_KEY: '' },
    onPid: (value) => { pid = value }
  })
  server.close()
  assert.equal(child.status, 0, child.stderr)
  assert.match(child.stdout, /pong/)
  assert.equal(child.stdout, 'pong: a < b\n\nthen x => y\n')
  assert.doesNotMatch(qmlFunction(main, 'cleanText'), /\[<>\]/)
  assert.equal(child.stdout.includes(key), false)
  assert.equal(child.stderr.includes(key), false)
  assert.equal(cmdline.includes(key), false)
  assert.deepEqual(Object.keys(seen.body).sort(), ['botId', 'botName', 'host', 'prompt'])
  assert.equal(seen.body.botName, 'Bob')
  assert.equal(seen.body.prompt, "What's on my calendar?")
  assert.equal(seen.headers.authorization, `Bearer ${key}`)

  fs.writeFileSync(path.join(config, 'grokbot-desktop.json'), JSON.stringify({
    dispatch: 'webhook',
    webhookUrl: 'http://user:pass@example.com/hook'
  }))
  const rejected = runPython('bin/grokbot-ask', [], {
    input: JSON.stringify({ botId: 'e0195a7d-f804-4688-9191-e2cf3574a6d1', botName: 'Bob', prompt: 'no' }),
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') }
  })
  assert.notEqual(rejected.status, 0)
  assert.doesNotMatch(rejected.stderr, new RegExp(key))
})

const BOB = 'e0195a7d-f804-4688-9191-e2cf3574a6d1'
const OMA = 'd0357ba3-1642-47bd-9b0c-95000cb33992'
const INBOX = 'bed72fb0-0323-4349-81df-dfd08c1f25f6'
const EGG = '23c1f61a-4475-40dc-9735-3f6c2356ad08'
const SHOP = 'e3d5b428-7673-4527-b902-376eb1f43f14'
const OMARCHY_BOT = '656295d3-33f7-49bb-a46b-ac9c8e27b7c9'
const WRITER = '129f9b89-bb06-43ce-867e-401aebd9ac77'

function loadRouteModule() {
  const file = path.join(root, 'bin/grokbot-dictation-route')
  const probe = spawnSync('/usr/bin/python3', ['-c', `
import importlib.util, importlib.machinery, json
loader = importlib.machinery.SourceFileLoader("route", ${JSON.stringify(file)})
spec = importlib.util.spec_from_loader("route", loader)
mod = importlib.util.module_from_spec(spec)
loader.exec_module(mod)
print(json.dumps({
  "recordingIdle": mod.recording_finished("recording", "idle"),
  "transcribingIdle": mod.recording_finished("transcribing", "idle"),
  "idleIdle": mod.recording_finished("idle", "idle"),
  "idleRecording": mod.recording_finished("", "recording")
}))
`], { encoding: 'utf8' })
  assert.equal(probe.status, 0, probe.stderr)
  return JSON.parse(probe.stdout)
}

test('wake phrases agree for Superwhisper and Voxtype', () => {
  const dictation = loadLibrary('qml/dictation.js')
  const phrases = [
    ['Hey Bot, what\'s on my calendar?', true, BOB, "what's on my calendar?"],
    ['hey bob check the weather', true, BOB, 'check the weather'],
    ['Hey grok bot: status', true, BOB, 'status'],
    ['HEY GROK hello', true, BOB, 'hello'],
    ['Hey OmaBot: check the VM', true, OMA, 'check the VM'],
    ['Hey OmaBot check the VM', true, OMA, 'check the VM'],
    ['Hey Inbox Admin, triage', true, INBOX, 'triage'],
    ['Hey Writer draft a note', true, WRITER, 'draft a note'],
    ['Hey dr eggbot, sketch a mark', true, EGG, 'sketch a mark'],
    ['Hey Shop With Grok, find a mug', true, SHOP, 'find a mug'],
    ['Hey Omarchy Bot publish the notes', true, OMARCHY_BOT, 'publish the notes'],
    ['Hey Bot', true, BOB, ''],
    ['check the VM', false, '', 'check the VM'],
    ['Hey there friend', false, '', 'Hey there friend'],
    ['HeyBob', false, '', 'HeyBob'],
    ['please Hey Bot, hi', false, '', 'please Hey Bot, hi']
  ]
  for (const [text, matched, botId, prompt] of phrases) {
    const js = dictation.route(text, bots, BOB)
    assert.equal(js.matched, matched, text)
    assert.equal(js.botId, botId, text)
    assert.equal(js.prompt, prompt, text)
    const py = spawnSync('/usr/bin/python3', [path.join(root, 'bin/grokbot-dictation-route')], {
      input: text,
      encoding: 'utf8'
    })
    assert.equal(py.status, matched ? 0 : 1, py.stderr || text)
    const parsed = JSON.parse(py.stdout)
    assert.equal(parsed.matched, js.matched, text)
    assert.equal(parsed.botId, js.botId, text)
    assert.equal(parsed.prompt, js.prompt, text)
  }
  const flags = loadRouteModule()
  assert.equal(flags.recordingIdle, true)
  assert.equal(flags.transcribingIdle, true)
  assert.equal(flags.idleIdle, false)
  assert.equal(flags.idleRecording, false)
})

test('dictation toggle follows the Omarchy backend, with direct fallbacks', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-dictate-'))
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(bin)
  const log = path.join(dir, 'log')
  const write = (name, body) => {
    const file = path.join(bin, name)
    fs.writeFileSync(file, body)
    fs.chmodSync(file, 0o755)
  }
  write('omarchy', '#!/bin/sh\nprintf "%s\\n" "$*" > "$DICTATION_LOG"\n')
  write('superwhisper', '#!/bin/sh\nprintf "%s\\n" "superwhisper $*" > "$DICTATION_LOG"\n')
  write('voxtype', '#!/bin/sh\nprintf "%s\\n" "voxtype $*" > "$DICTATION_LOG"\n')
  write('wtype', '#!/bin/sh\nprintf "%s\\n" "$*" > "$WTYPE_LOG"\n')
  const config = path.join(dir, 'config')
  const runDictate = (pathDir, backend) => {
    fs.rmSync(log, { force: true })
    if (backend) fs.mkdirSync(path.join(config, 'omarchy', 'defaults'), { recursive: true })
    if (backend) fs.writeFileSync(path.join(config, 'omarchy', 'defaults', 'dictation'), `${backend}\n`)
    else fs.rmSync(path.join(config, 'omarchy', 'defaults', 'dictation'), { force: true })
    return spawnSync('/usr/bin/python3', [path.join(root, 'bin/grokbot-dictate')], {
      encoding: 'utf8',
      env: { PATH: pathDir, XDG_CONFIG_HOME: config, DICTATION_LOG: log, HOME: dir }
    })
  }
  let result = runDictate(bin, 'voxtype')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.readFileSync(log, 'utf8').trim(), 'dictation toggle')

  const noOmarchy = bin + '-no'
  fs.mkdirSync(noOmarchy)
  fs.copyFileSync(path.join(bin, 'superwhisper'), path.join(noOmarchy, 'superwhisper'))
  fs.copyFileSync(path.join(bin, 'voxtype'), path.join(noOmarchy, 'voxtype'))
  fs.chmodSync(path.join(noOmarchy, 'superwhisper'), 0o755)
  fs.chmodSync(path.join(noOmarchy, 'voxtype'), 0o755)
  result = runDictate(noOmarchy, 'voxtype')
  assert.equal(fs.readFileSync(log, 'utf8').trim(), 'voxtype record toggle')
  result = runDictate(noOmarchy, 'superwhisper')
  assert.equal(fs.readFileSync(log, 'utf8').trim(), 'superwhisper record')
  result = runDictate(noOmarchy, '')
  assert.equal(fs.readFileSync(log, 'utf8').trim(), 'superwhisper record')
  fs.writeFileSync(path.join(config, 'omarchy', 'defaults', 'dictation'), '../not-a-command\n')
  result = runDictate(path.join(noOmarchy), 'keep')
  // runDictate('keep') overwrites the file. Write the bad name after a dedicated call.
  fs.writeFileSync(path.join(config, 'omarchy', 'defaults', 'dictation'), '../not-a-command\n')
  result = spawnSync('/usr/bin/python3', [path.join(root, 'bin/grokbot-dictate')], {
    encoding: 'utf8',
    env: { PATH: noOmarchy, XDG_CONFIG_HOME: config, DICTATION_LOG: log, HOME: dir }
  })
  assert.equal(fs.readFileSync(log, 'utf8').trim(), 'superwhisper record')

  const onlyVox = path.join(dir, 'vox-only')
  fs.mkdirSync(onlyVox)
  fs.copyFileSync(path.join(bin, 'voxtype'), path.join(onlyVox, 'voxtype'))
  fs.chmodSync(path.join(onlyVox, 'voxtype'), 0o755)
  fs.rmSync(log, { force: true })
  fs.rmSync(path.join(config, 'omarchy', 'defaults', 'dictation'), { force: true })
  result = spawnSync('/usr/bin/python3', [path.join(root, 'bin/grokbot-dictate')], {
    encoding: 'utf8',
    env: { PATH: onlyVox, XDG_CONFIG_HOME: config, DICTATION_LOG: log, HOME: dir }
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.readFileSync(log, 'utf8').trim(), 'voxtype record toggle')
})

test('Superwhisper and Voxtype wake lines route instead of being typed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-voice-'))
  const sink = path.join(dir, 'sink')
  const wtypeLog = path.join(dir, 'wtype')
  const wtype = path.join(dir, 'wtype')
  fs.writeFileSync(wtype, '#!/bin/sh\nprintf "%s\\n" "$*" > "$WTYPE_LOG"\n')
  fs.chmodSync(wtype, 0o755)
  const filter = (backend, text) => spawnSync('/usr/bin/python3', [
    path.join(root, 'bin/grokbot-dictation-route'), '--filter', '--backend', backend
  ], {
    input: text,
    encoding: 'utf8',
    env: { ...process.env, GROKBOT_DICTATE_SINK: sink, PATH: dir }
  })
  for (const backend of ['superwhisper', 'voxtype']) {
    fs.rmSync(sink, { force: true })
    const wake = filter(backend, 'Hey OmaBot, check the VM')
    assert.equal(wake.status, 0, wake.stderr)
    assert.equal(wake.stdout, '')
    assert.equal(JSON.parse(fs.readFileSync(sink, 'utf8')).text, 'Hey OmaBot, check the VM')
    assert.equal(JSON.parse(fs.readFileSync(sink, 'utf8')).backend, backend)
    fs.rmSync(sink, { force: true })
    const plain = filter(backend, 'check the VM')
    assert.equal(plain.stdout, 'check the VM')
    assert.equal(fs.existsSync(sink), false)
  }

  const typed = spawnSync('/usr/bin/python3', [path.join(root, 'bin/grokbot-dictation-route'), '--wtype'], {
    input: 'check the VM',
    encoding: 'utf8',
    env: { ...process.env, GROKBOT_WTYPE: wtype, WTYPE_LOG: wtypeLog, GROKBOT_DICTATE_SINK: sink, PATH: dir }
  })
  assert.equal(typed.status, 0, typed.stderr)
  assert.match(fs.readFileSync(wtypeLog, 'utf8'), /check the VM/)
  fs.rmSync(sink, { force: true })
  fs.rmSync(wtypeLog, { force: true })
  const routed = spawnSync('/usr/bin/python3', [path.join(root, 'bin/grokbot-dictation-route'), '--wtype', '--backend', 'voxtype'], {
    input: 'Hey Bot, status',
    encoding: 'utf8',
    env: { ...process.env, GROKBOT_WTYPE: wtype, WTYPE_LOG: wtypeLog, GROKBOT_DICTATE_SINK: sink, PATH: dir }
  })
  assert.equal(routed.status, 0, routed.stderr)
  assert.equal(routed.stdout, '')
  assert.equal(fs.existsSync(wtypeLog), false)
  assert.equal(JSON.parse(fs.readFileSync(sink, 'utf8')).backend, 'voxtype')

  const watch = path.join(root, 'bin/grokbot-voice-watch')
  const off = spawnSync('/usr/bin/python3', [watch], { encoding: 'utf8' })
  assert.equal(off.status, 2)
  const batch = spawnSync('/usr/bin/python3', [watch, '--enable', '--decide-batch'], {
    input: JSON.stringify([
      { text: 'Hey Bot, hi', source: 'clipboard', backend: 'superwhisper', recordingAge: 1, now: 100 },
      { text: 'Hey Bot, hi', source: 'clipboard', backend: 'voxtype', recordingAge: 1, now: 101 },
      { text: 'Hey Writer, draft', source: 'clipboard', backend: 'voxtype', recordingAge: 30, now: 200 },
      { text: 'copy this note', source: 'clipboard', backend: 'superwhisper', recordingAge: 0.2, now: 201 },
      { text: 'Hey OmaBot, check the VM', source: 'transcript', backend: 'voxtype', recordingAge: null, now: 300 },
      { text: 'Hey Inbox Admin, triage', source: 'transcript', backend: 'superwhisper', recordingAge: null, now: 301 }
    ]),
    encoding: 'utf8'
  })
  assert.equal(batch.status, 0, batch.stderr)
  const decisions = JSON.parse(batch.stdout)
  assert.deepEqual(decisions.map((item) => item.deliver), [true, false, false, false, true, true])
  assert.equal(decisions[4].botId, OMA)
  assert.equal(decisions[4].prompt, 'check the VM')
  assert.equal(decisions[5].backend, 'superwhisper')

  for (const backend of ['superwhisper', 'voxtype']) {
    const note = path.join(dir, `${backend}.txt`)
    fs.writeFileSync(note, 'Hey Writer draft a note')
    fs.rmSync(sink, { force: true })
    const checked = spawnSync('/usr/bin/python3', [watch, '--enable', '--check-file', note, '--backend', backend], {
      encoding: 'utf8',
      env: { ...process.env, GROKBOT_DICTATE_SINK: sink }
    })
    assert.equal(checked.status, 0, checked.stderr)
    const row = JSON.parse(fs.readFileSync(sink, 'utf8'))
    assert.equal(row.backend, backend)
    assert.equal(row.text, 'Hey Writer draft a note')
  }

  const home = path.join(dir, 'home')
  const bare = spawnSync('/usr/bin/python3', [watch, '--install-voxtype-hook'], {
    encoding: 'utf8',
    env: { ...process.env, XDG_CONFIG_HOME: home }
  })
  assert.equal(bare.status, 2)
  assert.equal(fs.existsSync(path.join(home, 'voxtype', 'config.toml')), false)
  const installed = spawnSync('/usr/bin/python3', [watch, '--enable', '--install-voxtype-hook'], {
    encoding: 'utf8',
    env: { ...process.env, XDG_CONFIG_HOME: home }
  })
  assert.equal(installed.status, 0, installed.stderr)
  const toml = fs.readFileSync(path.join(home, 'voxtype', 'config.toml'), 'utf8')
  assert.match(toml, /\[output\.post_process\]/)
  assert.match(toml, /grokbot-dictation-route --filter/)
  assert.match(toml, /fallback_on_empty = false/)
  const again = spawnSync('/usr/bin/python3', [watch, '--enable', '--install-voxtype-hook'], {
    encoding: 'utf8',
    env: { ...process.env, XDG_CONFIG_HOME: home }
  })
  assert.equal(again.status, 0, again.stderr)
  const busyHome = path.join(dir, 'busy')
  fs.mkdirSync(path.join(busyHome, 'voxtype'), { recursive: true })
  const busyFile = path.join(busyHome, 'voxtype', 'config.toml')
  fs.writeFileSync(busyFile, '[output.post_process]\ncommand = "sed \'s/uh //g\'"\n')
  const busy = spawnSync('/usr/bin/python3', [watch, '--enable', '--install-voxtype-hook'], {
    encoding: 'utf8',
    env: { ...process.env, XDG_CONFIG_HOME: busyHome }
  })
  assert.equal(busy.status, 2)
  assert.equal(fs.readFileSync(busyFile, 'utf8'), '[output.post_process]\ncommand = "sed \'s/uh //g\'"\n')

  const readme = read('README.md')
  const bubble = read('BubblePanel.qml')
  const source = read('Main.qml')
  assert.match(readme, /omarchy dictation toggle/)
  assert.match(readme, /superwhisper record/)
  assert.match(readme, /voxtype record toggle/)
  assert.match(readme, /fallback_on_empty/)
  assert.match(readme, /grokbot-voice-watch/)
  assert.match(source, /function dictate\(text: string\)/)
  assert.match(source, /function dictateText\(/)
  assert.match(source, /function toggleDictation\(/)
  assert.match(source, /Dictation\.route/)
  const click = bubble.slice(bubble.indexOf('id: voiceButton'))
  const submitAt = click.indexOf('app.submitPrompt(promptField.text)')
  const focusAt = click.indexOf('promptField.forceActiveFocus()')
  const toggleAt = click.indexOf('app.dictating = !app.dictating')
  const commandAt = click.indexOf('app.toggleDictation()')
  assert.match(click, /promptField\.text\.trim\(\) !== ""/)
  assert.ok(submitAt > 0 && submitAt < focusAt && focusAt < toggleAt && toggleAt < commandAt)
  assert.match(qmlFunction(source, 'closeBubble'), /dictating = false/)
  assert.match(qmlFunction(source, 'dictateText'), /dictating = false/)
  assert.match(source, /id: dictationWatchdog/)
})

test('readme credits both companions and records the live Try Omarchy capture', () => {
  const readme = read('README.md')
  assert.match(readme, /<h1 align="center">Grok Bot Desktop Companion<\/h1>/)
  assert.equal((readme.match(/omarchy-plugin\.svg/g) || []).length, 1)
  assert.match(readme, /jankeesvw\/omarchy-clippy/)
  assert.match(readme, /rdoupe\/omarchy-clanky/)
  assert.match(readme, /tcballard\/build-omarchy-plugins/)
  assert.match(readme, /assets\/grokbot-companion-demo\.mp4/)
  assert.match(readme, /Try Omarchy/)
  assert.match(readme, /Virtual-1/)
  assert.doesNotMatch(readme, /architectural preview/i)
  assert.doesNotMatch(readme, /\]\(preview\.png\)/)
  assert.equal(fs.existsSync(path.join(root, 'preview.png')), true)
  const bytes = fs.readFileSync(path.join(root, 'preview.png'))
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  const video = fs.readFileSync(path.join(root, 'assets/grokbot-companion-demo.mp4'))
  assert.equal(video.subarray(4, 8).toString(), 'ftyp')
  assert.ok(video.length > 1000000)
  const acceptance = readJSON(path.join(root, 'docs/ACCEPTANCE.json'))
  assert.equal(acceptance.status, 'passed')
  assert.equal(acceptance.live.status, 'passed')
  assert.equal(acceptance.date, '2026-10-27')
  assert.equal(acceptance.platform, 'Try Omarchy (Arch Linux / Hyprland / Quickshell, Virtual-1 1280x800)')
  assert.equal(acceptance.input_commit, 'a8a5d0b8e2da35853a2edfc2a6135296f01e21e7')
  assert.equal(acceptance.live.recording, 'assets/grokbot-companion-demo.mp4')
  assert.match(acceptance.limitations.join('\n'), /0\.28/)
  assert.match(acceptance.limitations.join('\n'), /grokbot-desktop-ctl/)
})

function qmlFunction(source, name) {
  const start = source.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `missing function ${name}`)
  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1)
  }
  return source.slice(start)
}

test('closing the bubble keeps an ask running and a busy prompt is kept', () => {
  assert.doesNotMatch(qmlFunction(main, 'dismissSurfaces'), /cancelAsk/)
  assert.doesNotMatch(qmlFunction(main, 'closeBubble'), /cancelAsk/)
  assert.match(qmlFunction(main, 'stopAsk'), /cancelAsk\(\)/)
  assert.match(qmlFunction(main, 'replyLanded'), /replyUnread = true/)
  assert.match(qmlFunction(main, 'openBubble'), /replyUnread = false/)
  const submit = qmlFunction(main, 'submitPrompt')
  assert.ok(submit.indexOf('root.asking') < submit.indexOf('promptDraft = ""'))
  const dictate = qmlFunction(main, 'dictateText')
  assert.ok(dictate.indexOf('"busy"') < dictate.indexOf('promptDraft = ""'))
})

test('morphs pair contour points at the least travel', () => {
  for (const a of shapes.NAMES) {
    for (const b of shapes.NAMES) {
      if (a === b) continue
      const A = shapes.SHAPES[a].points
      const B = shapes.SHAPES[b].points
      let best = Infinity
      for (let o = 0; o < B.length; o++) best = Math.min(best, shapes.travel(A, B, o))
      const mid = shapes.blend(a, b, 1).points
      let used = 0
      for (let k = 0; k < A.length; k++) used += Math.hypot(mid[k][0] - A[k][0], mid[k][1] - A[k][1])
      assert.ok(used / A.length <= best + 1e-9, `${a} -> ${b} travels ${used / A.length} > ${best}`)
    }
  }
})

test('a new appearance picked mid-morph starts from the contour on screen', () => {
  const start = qmlFunction(main, 'startMorph')
  assert.match(start, /mark\.blended\.points/)
  assert.match(start, /mark\.fillColor/)
  assert.match(start, /Shapes\.align\(face/)
  assert.ok(start.indexOf('morphToPoints =') < start.indexOf('morphFromPoints ='))
  const a = shapes.SHAPES.cloud.points
  const b = shapes.align(a, shapes.SHAPES.star.points)
  assert.equal(b.length, a.length)
  assert.equal(JSON.stringify(shapes.mix(a, b, 0)), JSON.stringify(a))
})

test('the reply pulse and idle breathing animate separate properties', () => {
  const pulse = main.slice(main.indexOf('id: syllableAnim'), main.indexOf('id: syllableAnim') + 400)
  assert.match(pulse, /property: "talkScale"/)
  assert.doesNotMatch(pulse, /property: "breathe"/)
  assert.match(main, /scale: root\.breathe \* root\.talkScale/)
})

test('a closing eye flattens into a lid instead of shrinking to a dot', () => {
  const rad = 128 * 0.46
  const open = face.eye(rad, 1, 1)
  const blink = face.eye(rad, 0.08, 1)
  const shut = face.eye(rad, 0, 1)
  assert.ok(open.h > open.w * 2, 'open eye is a tall capsule')
  assert.ok(blink.h < 3.5, `blink is a line, got ${blink.h}px`)
  assert.ok(shut.w > open.w, 'a shut lid reads wider than the open slit')
  assert.ok(shut.h <= shut.w / 4)
  assert.equal(shut.r, shut.h / 2)
  assert.doesNotMatch(read('CompanionMark.qml'), /paintCapsule/)
})

test('expressions ease between eye poses', () => {
  const mark = read('CompanionMark.qml')
  for (const name of ['poseTilt', 'poseHeight', 'poseOpen']) assert.match(mark, new RegExp(`Behavior on ${name}`))
  assert.equal(face.pose('nope').tilt, face.pose('idle').tilt)
  assert.ok(face.pose('sleep').open < 0.1)
  assert.ok(face.pose('think').height < face.pose('idle').height)
})

test('continuous motion and drag run at the display and input rate', () => {
  const bubble = read('BubblePanel.qml')
  assert.match(main, /id: gazeFrames/)
  assert.match(main, /1 - Math\.exp\(-frameTime/)
  assert.doesNotMatch(main, /interval: 32\b/)
  assert.doesNotMatch(main, /thinkAngle \+= 0\.18/)
  assert.doesNotMatch(bubble, /id: waveTimer/)
  assert.match(qmlFunction(main, 'dragMove'), /function dragMove\(px, py\)/)
  assert.doesNotMatch(qmlFunction(main, 'cursorLine'), /dragMove/)
})

test('each blink draws a new gap', () => {
  const blink = main.slice(main.indexOf('id: blinkTimer'), main.indexOf('id: blinkTimer') + 500)
  assert.match(blink, /onTriggered:[\s\S]*blinkTimer\.interval = 2800 \+ Math\.random\(\) \* 2400/)
})

test('the mark is grounded by a shadow that answers its height', () => {
  const shadow = main.slice(main.indexOf('id: floorShadow'), main.indexOf('id: floorShadow') + 1600)
  assert.match(shadow, /readonly property real lift:/)
  assert.match(shadow, /scale: Math\.max\(0\.55, 1 - lift/)
  assert.match(shadow, /RadialGradient/)
  const mark = main.slice(main.indexOf('id: mark'), main.indexOf('id: mark') + 2000)
  assert.match(mark, /transformOrigin: Item\.Bottom/)
})

test('hops squash and stretch about the base', () => {
  const hop = main.slice(main.indexOf('id: hopAnim'), main.indexOf('id: hopAnim') + 1400)
  assert.match(hop, /property: "squash"; to: 0\.88/)
  assert.match(hop, /property: "squash"; to: 1\.07/)
  assert.match(hop, /property: "squash"; to: 0\.9;/)
  assert.doesNotMatch(hop, /OutBounce/)
  assert.match(main, /yScale: root\.stretchY/)
})

test('morph colours keep their saturation through the blend', () => {
  const hex = (h) => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 })
  const orange = hex(palette.COLORS.orange.fill)
  const blue = hex(palette.COLORS.blue.fill)
  const ends = Math.min(palette.oklch(orange).c, palette.oklch(blue).c)
  const mid = palette.mix(orange, blue, 0.5)
  assert.ok(palette.oklch(mid).c > ends * 0.85, 'OKLCH midpoint stays saturated')
  const flat = { r: (orange.r + blue.r) / 2, g: (orange.g + blue.g) / 2, b: (orange.b + blue.b) / 2 }
  assert.ok(palette.oklch(flat).c < ends * 0.5, 'an sRGB midpoint would go grey')
  for (const name of palette.NAMES) {
    const c = hex(palette.COLORS[name].fill)
    const back = palette.mix(c, c, 0.5)
    assert.ok(Math.abs(back.r - c.r) < 0.002 && Math.abs(back.g - c.g) < 0.002 && Math.abs(back.b - c.b) < 0.002, name)
  }
  assert.match(main, /morphPopAnim\.restart\(\)/)
})

test('thinking and sleeping read at a glance', () => {
  assert.match(main, /property real thinkLook: root\.expression === "think" \? 1 : 0/)
  assert.match(main, /Math\.sin\(root\.thinkAngle \* 0\.5\) \* 3 \* root\.thinkLook/)
  assert.match(main, /running: root\.present && !root\.dragging && !root\.reduceMotion && root\.expression === "sleep"/)
  assert.match(read('BubblePanel.qml'), /visible: app\.asking && app\.bubbleBody === ""/)
})

test('the mark answers hover and lifts while dragged', () => {
  assert.match(main, /cursorShape: root\.dragging \? Qt\.ClosedHandCursor : Qt\.PointingHandCursor/)
  assert.match(main, /property real hoverScale: root\.hovering && !root\.dragging \? 1\.04 : 1/)
  assert.match(main, /root\.dragLift \* 14/)
  assert.match(qmlFunction(main, 'endDrag'), /landAnim\.restart\(\)/)
  assert.match(qmlFunction(main, 'dragMove'), /dragTiltTarget =/)
})

test('dodge fades with distance and visibly fades back during the dwell', () => {
  const dodge = qmlFunction(main, 'updateDodge')
  assert.match(dodge, /pointerGap\(\) \/ 36/)
  assert.match(dodge, /held = \(Date\.now\(\) - root\.dwellSince\) \/ root\.dwellMs/)
  assert.match(main, /opacity: root\.dodgeOpacity/)
})

test('reduced motion stops loops and zeroes one-shot timing', () => {
  assert.match(main, /Commons\.Style\.reduceMotion === true/)
  assert.match(main, /readonly property string liveMotion: root\.reduceMotion \? "calm" : root\.motionName/)
  for (const loop of main.matchAll(/loops: Animation\.Infinite/g)) {
    const head = main.slice(Math.max(0, loop.index - 200), loop.index)
    assert.match(head, /reduceMotion|liveMotion/, 'every endless loop stops under reduced motion')
  }
  assert.match(main, /id: morphAnim[\s\S]{0,200}duration: root\.ms\(560\)/)
  assert.doesNotMatch(read('BubblePanel.qml'), /duration: \d/)
})

test('the card, menu, and roster animate in and out', () => {
  const card = main.slice(main.indexOf('id: bubblePanel'), main.indexOf('id: bubblePanel') + 1400)
  assert.match(card, /visible: opacity > 0\.01/)
  assert.match(card, /transformOrigin:/)
  const menu = main.slice(main.indexOf('id: menuCard'), main.indexOf('id: menuCard') + 600)
  assert.match(menu, /visible: opacity > 0\.01/)
  const bubble = read('BubblePanel.qml')
  assert.match(bubble, /Behavior on shownHeight/)
  assert.match(bubble, /Behavior on expand/)
})

test('size eases and corner changes pop out and back in', () => {
  assert.match(main, /Behavior on shownSize/)
  assert.match(main, /width: root\.shownSize \+ 24/)
  const corner = qmlFunction(main, 'setAnchor')
  assert.match(corner, /cornerAnim\.restart\(\)/)
  assert.doesNotMatch(corner, /root\.anchorName = name/)
})

test('the appearance page fits without scrolling on a 800px screen', () => {
  const page = read('SettingsPanel.qml')
  assert.doesNotMatch(page, /font\.pixelSize: 8\b/, 'no unreadable 8px labels')
  assert.match(page, /"MARK SILHOUETTE  ·  " \+ drawer\.title/)
  assert.match(page, /"PLACEMENT  ·  "/)
  assert.match(page, /id: cornerPicker/)
  assert.match(page, /ScrollBar\.vertical/)
})

test('selection rings stay visible on every colour', () => {
  const hex = (h) => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 })
  assert.equal(palette.ringReadable(hex(palette.COLORS.black.fill)), false)
  assert.equal(palette.ringReadable(hex(palette.COLORS.orange.fill)), true)
  for (const name of palette.NAMES) {
    const c = hex(palette.COLORS[name].fill)
    const ring = palette.ringReadable(c) ? c : hex('#F4F4F5')
    assert.ok(palette.contrast(ring, palette.CHROME) >= 3, name)
  }
  assert.match(read('BubblePanel.qml'), /app\.ringColor\(app\.paletteFill\(modelData\.color\)\)/)
  assert.match(read('SettingsPanel.qml'), /tone: app\.ringColor\(/)
})

test('the header names every bot by role and elides instead of cutting words', () => {
  const tag = qmlFunction(main, 'botTag')
  assert.doesNotMatch(tag, /, 22\)/)
  assert.doesNotMatch(tag, /isPrimary\) return "Main"/)
  const bubble = read('BubblePanel.qml')
  assert.match(bubble, /elide: Text\.ElideRight/)
  assert.match(bubble, /rotation: app\.rosterExpanded \? 180 : 0/)
  assert.match(bubble, /app\.rosterExpanded \? "Less" : "\+" \+ bubble\.extraBots\.length/)
})
