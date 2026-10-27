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

test('the fourteen Grok Bot shapes morph through the same contour length', () => {
  assert.deepEqual([...shapes.NAMES], [
    'blob', 'cloud', 'squircle', 'sparkle',
    'clover', 'heart', 'flower', 'teardrop', 'tablet',
    'wedge', 'gem', 'burst', 'hex', 'pebble'
  ])
  assert.deepEqual([...shapes.ROWS], [4, 5, 5])
  // Names the bundled roster uses are the app's own.
  for (const name of ['teardrop', 'blob', 'hex', 'tablet', 'wedge', 'squircle', 'pebble', 'cloud']) {
    assert.equal(shapes.resolve(name), name)
  }
  // Older names from this plugin and from Grok Bot still land on a shape.
  assert.equal(shapes.resolve('drop'), 'teardrop')
  assert.equal(shapes.resolve('pill'), 'tablet')
  assert.equal(shapes.resolve('hexagon'), 'hex')
  assert.equal(shapes.resolve('triangle'), 'wedge')
  assert.equal(shapes.resolve('spark'), 'sparkle')
  assert.equal(shapes.resolve('capsule'), 'tablet')
  // Grok Bot's roster shows blob as the round shape and pebble as the lumpy one.
  assert.equal(shapes.resolve('circle'), 'blob')
  assert.equal(shapes.resolve('pumpkin'), 'pebble')
  assert.equal(shapes.known('nonsense'), false)
  for (const name of shapes.NAMES) {
    const shape = shapes.SHAPES[name]
    assert.equal(shape.points.length, shapes.POINT_COUNT, name)
    for (const point of shape.points) {
      assert.ok(Math.abs(point[0]) <= 1.12 && Math.abs(point[1]) <= 1.12, name)
    }
    assert.ok(shape.points[0][1] <= shape.points[10][1] + 0.2, `${name} starts near the top`)
    assert.equal(shape.eyes.length, 2, name)
    assert.ok(shape.eyes[0].x < shape.eyes[1].x, `${name} eyes run left to right`)
    for (const eye of shape.eyes) {
      assert.ok(eye.length > eye.width, `${name} eyes are upright capsules`)
      assert.ok(eye.angle > 25 && eye.angle < 80, `${name} eyes lean with the top to the left`)
    }
  }
  // The circle is the unit: its outline sits on radius 1 about its box centre.
  for (const point of shapes.SHAPES.blob.points) assert.ok(Math.abs(Math.hypot(point[0], point[1]) - 1) < 0.03)
  assert.ok(shapes.SHAPES.pebble.stem.length > 8)
  assert.equal(shapes.SHAPES.teardrop.stem, null)
  const mixed = shapes.blend('teardrop', 'hex', 0)
  const ended = shapes.blend('teardrop', 'hex', 1)
  assert.deepEqual(mixed.points[0], shapes.SHAPES.teardrop.points[0])
  const offset = shapes.bestOffset(shapes.SHAPES.teardrop.points, shapes.SHAPES.hex.points)
  assert.deepEqual(ended.points[40], shapes.SHAPES.hex.points[(40 + offset) % shapes.POINT_COUNT])
  const mid = shapes.blend('burst', 'blob', 0.5)
  assert.equal(mid.points.length, shapes.POINT_COUNT)
  const ex = (shapes.SHAPES.burst.eyes[0].x + shapes.SHAPES.blob.eyes[0].x) / 2
  assert.ok(Math.abs(mid.eyes[0].x - ex) < 1e-9)
})

test('palette eyes stay readable on each fill', () => {
  assert.deepEqual([...palette.NAMES], [
    'black', 'brown', 'red', 'orange', 'yellow', 'green',
    'cyan', 'blue', 'violet', 'magenta', 'gray'
  ])
  assert.equal(palette.OMARCHY, 'omarchy')
  assert.equal(palette.accepts('omarchy'), true)
  assert.equal(palette.accepts('pink'), true)
  assert.equal(palette.accepts('chartreuse'), false)
  // The app's own values, as Grok Bot stores them and its picker shows them.
  const app = {
    black: '#000000', brown: '#936439', red: '#ff263c', orange: '#ff6700', yellow: '#ff9800', green: '#00c972',
    cyan: '#00bca6', blue: '#1084fe', violet: '#9159fe', magenta: '#ff309b', gray: '#777777'
  }
  for (const name of palette.NAMES) {
    const tone = palette.COLORS[name]
    assert.equal(tone.fill.toLowerCase(), app[name], name)
    // Eyes show the dark chrome behind them; the fill there must stand off it.
    assert.equal(tone.eye.toLowerCase(), '#141416')
    assert.ok(contrast(tone.eye, palette.fillFor(name, true)) >= 3, `${name} on the dark chrome`)
  }
  // Grok Bot draws black as white on dark surfaces.
  assert.equal(palette.fillFor('black', true), '#FFFFFF')
  assert.equal(palette.fillFor('black', false), '#000000')
  assert.equal(palette.fillFor('orange', true), palette.fillFor('orange', false))
  assert.match(main, /darkSurface: root\.desktopDark/)
  assert.doesNotMatch(read('BubblePanel.qml'), /=== "black"/)
  assert.equal(palette.canonical('purple'), 'violet')
  assert.equal(palette.canonical('grey'), 'gray')
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

function agentHome(agent, files) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-agent-'))
  const config = path.join(home, '.config', 'omarchy')
  const bin = path.join(home, '.local', 'bin')
  fs.mkdirSync(path.join(config, 'defaults'), { recursive: true })
  fs.mkdirSync(bin, { recursive: true, mode: 0o755 })
  fs.writeFileSync(path.join(config, 'defaults', 'agent'), `${agent}\n`)
  fs.writeFileSync(path.join(config, 'grokbot-desktop.json'), JSON.stringify({ dispatch: 'agent' }))
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(bin, name), body, { mode: 0o755 })
  }
  return home
}

function askAgent(home, prompt = 'hello there') {
  return runPython('bin/grokbot-ask', [], {
    input: JSON.stringify({ botId: 'e0195a7d-f804-4688-9191-e2cf3574a6d1', botName: 'Bob', prompt }),
    env: { PATH: '/usr/bin:/bin', HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local', 'share') }
  })
}

test('grok is asked headless with the prompt after -p', () => {
  const home = agentHome('grok', {
    grok: '#!/usr/bin/python3\nimport json,os,sys\nopen(os.environ["HOME"]+"/argv.json","w").write(json.dumps({"argv":sys.argv[1:],"stdin":sys.stdin.read()}))\nprint("hi from grok")\n'
  })
  const result = askAgent(home, 'what time is it')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /hi from grok/)
  const seen = JSON.parse(fs.readFileSync(path.join(home, 'argv.json'), 'utf8'))
  assert.deepEqual(seen.argv.slice(0, 2), ['--no-auto-update', '-p'])
  assert.match(seen.argv[2], /as the Grok Bot Bob[\s\S]*what time is it$/)
  assert.equal(seen.stdin, '')
})

test('a failing agent names itself and passes on what it printed', () => {
  const home = agentHome('grok', {
    grok: '#!/bin/sh\necho "Not signed in. Run grok login."\nexit 1\n'
  })
  const result = askAgent(home)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /^grok: Not signed in\. Run grok login\./)

  fs.writeFileSync(path.join(home, '.local', 'bin', 'grok'), '#!/bin/sh\nexit 3\n', { mode: 0o755 })
  const silent = askAgent(home)
  assert.equal(silent.status, 3)
  assert.match(silent.stderr, /^grok: exited 3 with no output/)
})

test('an ask never runs Omarchy\'s install-on-first-run agent wrapper', () => {
  const home = agentHome('grok', {
    grok: '#!/bin/bash\ntouch "$HOME/installed"\nmise use -g --quiet "grok" || exit 1\nexec mise x "grok" -- "grok" "$@"\n'
  })
  const result = askAgent(home)
  assert.equal(result.status, 127)
  assert.match(result.stderr, /grok isn't installed\. Install it with: omarchy default agent grok/)
  assert.equal(fs.existsSync(path.join(home, 'installed')), false)
})

test('an unsupported default agent is reported instead of swapped for another', () => {
  const home = agentHome('cursor-agent', {})
  const result = askAgent(home)
  assert.equal(result.status, 127)
  assert.match(result.stderr, /can't ask cursor-agent yet/)
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
  const rad = 128 * 0.43
  const spec = shapes.SHAPES.teardrop.eyes[0]
  const open = face.eye(spec, rad, 1, 1)
  const blink = face.eye(spec, rad, 0.08, 1)
  const shut = face.eye(spec, rad, 0, 1)
  assert.ok(Math.abs(open.h - spec.length * rad) < 1e-9, 'open eye is the measured capsule')
  assert.ok(open.h > open.w * 2, 'open eye is a tall capsule')
  assert.ok(blink.h < 3.5, `blink is a line, got ${blink.h}px`)
  assert.ok(shut.w > open.w, 'a shut lid reads wider than the open slit')
  assert.ok(shut.h <= shut.w / 4)
  assert.equal(shut.r, shut.h / 2)
  // Grok Bot's eyes lean with the top to the left: rotate an upright
  // rectangle anticlockwise.
  assert.ok(face.rotation(spec, 0) < 0)
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
  assert.match(main, /running: root\.present && !root\.dragging && root\.liveMotion !== "calm" && root\.expression === "sleep"/)
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
  assert.match(main, /readonly property real stageW: root\.shownSize \+ 24/)
  const corner = qmlFunction(main, 'setAnchor')
  assert.match(corner, /cornerAnim\.restart\(\)/)
  assert.doesNotMatch(corner, /root\.anchorName = name/)
})

test('the appearance page is laid out like Grok Bot\'s picker', () => {
  const page = read('SettingsPanel.qml')
  assert.doesNotMatch(page, /font\.pixelSize: 8\b/, 'no unreadable 8px labels')
  assert.match(page, /readonly property var shapeRows: Shapes\.ROWS/)
  assert.match(page, /colorName: app\.shownColor/, 'every shape wears the chosen colour')
  assert.doesNotMatch(page, /fillHex: active \? "" : /, 'no muted inactive shapes')
  assert.match(page, /joinStyle: ShapePath\.RoundJoin/, 'the ring follows the outline')
  assert.match(page, /text: "Reset to default"/)
  assert.match(page, /onActivated: app\.setSync\(true\)/)
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

test('pins follow use and a closed-bubble switch names the bot', () => {
  const bubble = read('BubblePanel.qml')
  assert.doesNotMatch(bubble, /key: "X Desk"/)
  assert.match(bubble, /app\.recentBots/)
  const select = qmlFunction(main, 'selectBot')
  assert.match(select, /recentBots = \[id\]/)
  assert.match(select, /showSwitchTag\(\)/)
  assert.match(qmlFunction(main, 'saveSettings'), /settings\.recentBots = root\.recentBots/)
})

test('the right-click menu opens toward the screen from any corner', () => {
  const menu = main.slice(main.indexOf('id: menuCard'), main.indexOf('id: menuCard') + 1600)
  assert.match(menu, /root\.anchorFromRight \? stage\.x - width - 8 : stage\.x \+ stage\.width \+ 8/)
  assert.doesNotMatch(menu, /x: Math\.max\(8, stage\.x - width - 8\)/)
})

test('the prompt bubble fits short prompts', () => {
  assert.match(read('BubblePanel.qml'), /width: Math\.min\(implicitWidth, bubble\.width - 120\)/)
})

test('chrome colours come from one token file and text follows the shell font', () => {
  for (const file of ['BubblePanel.qml', 'SettingsPanel.qml']) {
    const source = read(file)
    assert.doesNotMatch(source, /"#[0-9A-Fa-f]{6,8}"/, `${file} uses qml/theme.js`)
    for (const element of source.matchAll(/textFormat: (Text|TextEdit)\.PlainText/g)) {
      const before = source.slice(Math.max(0, element.index - 600), element.index)
      const start = Math.max(before.lastIndexOf('Text {'), before.lastIndexOf('TextEdit {'))
      assert.match(before.slice(start), /font\.family:/, `${file} text without a family`)
    }
  }
  assert.match(main, /Commons\.Style\.font\.family/)
  const theme = loadLibrary('qml/theme.js')
  assert.equal(theme.surface, '#141416')
  // Measured from Grok Bot's dark-mode picker.
  assert.equal(theme.ring, '#656569')
  assert.equal(theme.link, '#0E6DD2')
})

test('every control gives hover, cursor, keyboard, and accessible feedback', () => {
  const area = read('HoverArea.qml')
  assert.match(area, /cursorShape: enabled \? Qt\.PointingHandCursor/)
  assert.match(area, /activeFocusOnTab: enabled/)
  assert.match(area, /Keys\.onSpacePressed: area\.activated\(\)/)
  assert.match(area, /Accessible\.name: area\.label/)
  for (const file of ['BubblePanel.qml', 'SettingsPanel.qml']) {
    assert.doesNotMatch(read(file), /MouseArea \{/, `${file} uses HoverArea`)
  }
  assert.match(qmlFunction(main, 'stepBack'), /menuOpen = false[\s\S]*closeSettings\(\)[\s\S]*closeBubble\(\)/)
  assert.match(main, /sequence: "Escape"/)
})

test('the idle window is a compact box around the mark', () => {
  assert.match(main, /readonly property bool expanded: root\.bubbleOpen \|\| root\.menuOpen/)
  assert.match(main, /top: root\.expanded \|\| !root\.anchorFromBottom/)
  assert.match(main, /implicitWidth: Math\.max\(1, root\.compactX1 - root\.compactX0\)/)
  assert.match(main, /readonly property bool fullWindow: win\.width >= root\.screenW/)
  assert.match(qmlFunction(main, 'stageRect'), /root\.originX/)
  assert.match(qmlFunction(main, 'updateGazeTarget'), /root\.originX/)
  assert.doesNotMatch(main, /anchors \{ top: true; bottom: true; left: true; right: true \}/)
})

test('Hyprland does not animate the window growing to the output and back', () => {
  // The same rule Omarchy gives its own shell surfaces, scoped to this namespace.
  assert.match(main, /WlrLayershell\.namespace: root\.layerNamespace/)
  assert.match(main, /readonly property string layerNamespace: "grokbot-desktop"/)
  assert.match(main, /"\/usr\/bin\/hyprctl", "eval"/)
  assert.match(main, /hl\.layer_rule\(\{ match = \{ namespace = \\"\^" \+ root\.layerNamespace \+ "\$\\" \}, no_anim = true, animation = \\"none\\" \}\)/)
  // Added before the window first maps, never left hiding it, and again after a reload.
  assert.match(main, /visible: root\.present && root\.targetScreen !== null && root\.layerRuleTried/)
  assert.match(main, /running: !root\.layerRuleTried\s*\n\s*onTriggered: root\.layerRuleTried = true/)
  assert.match(main, /String\(event\.name\) === "configreloaded"[^\n]*layerRuleProc\.running = true/)
})

test('the mark is a GPU path with rectangle eyes', () => {
  const mark = read('CompanionMark.qml')
  assert.match(mark, /import QtQuick\.Shapes/)
  assert.match(mark, /PathSvg \{ path: mark\.outline \}/)
  assert.match(mark, /active: mark\.showImage/, 'the canvas only loads for a photo')
  assert.equal((mark.match(/delegate: MarkEye/g) || []).length, 2)
  assert.match(read('MarkEye.qml'), /radius: eye\.geo\.r/)
  const path = shapes.svgPath(shapes.SHAPES.circle.points, 50, 64, 64)
  assert.match(path, /^M [\d.]+ [\d.]+ Q /)
  assert.match(path, / Z$/)
  assert.equal((path.match(/ Q /g) || []).length, shapes.POINT_COUNT)
  assert.equal(shapes.svgPath([], 50, 0, 0), '')
})

test('the desktop mark cuts its eyes through the shape, as Grok Bot does', () => {
  const mark = read('CompanionMark.qml')
  assert.match(mark, /maskInverted: true/)
  assert.match(mark, /source: art/)
  assert.match(mark, /layer\.mipmap: true/)
  const corner = main.slice(main.indexOf('id: mark'), main.indexOf('id: mark') + 900)
  assert.match(corner, /cutout: true/)
  assert.match(corner, /eyeSet: root\.shownEyes/)
  const start = qmlFunction(main, 'startMorph')
  assert.ok(start.indexOf('var eyesNow = mark.restEyes') < start.indexOf('morphToEyes ='))
})

test('the pumpkin wears its stem and the stem fades through a morph', () => {
  assert.equal(shapes.stemLevel('pumpkin', 'pumpkin', 0.3), 1)
  assert.equal(shapes.stemLevel('circle', 'pumpkin', 0.25), 0.25)
  assert.equal(shapes.stemLevel('pumpkin', 'hex', 0.25), 0.75)
  assert.equal(shapes.stemLevel('circle', 'hex', 0.5), 0)
  assert.match(read('CompanionMark.qml'), /fillColor: Shapes\.STEM_COLOR/)
  assert.match(qmlFunction(main, 'startMorph'), /root\.stemFrom = mark\.stemLevel/)
})

test('the stem stays in the cut-out layer and fades by opacity', () => {
  const mark = read('CompanionMark.qml')
  const stem = mark.slice(mark.indexOf('id: stem'), mark.indexOf('id: stem') + 500)
  assert.match(stem, /visible: !mark\.showImage/)
  assert.match(stem, /opacity: mark\.showStem \? mark\.stemLevel : 0/)
  assert.match(read('SettingsPanel.qml'), /showStem: true/)
  const corner = main.slice(main.indexOf('id: mark'), main.indexOf('id: mark') + 900)
  assert.doesNotMatch(corner, /showStem: true/, 'the desktop avatar wears no stem')
  const st = shapes.SHAPES.pebble.stem
  assert.ok(Math.min(...st.map((p) => p[1])) < -1, 'the stem rises above the body')
})

test('picking a shape or colour swaps at once, as Grok Bot\'s picker does', () => {
  for (const name of ['selectShape', 'selectColor', 'setSync']) {
    assert.match(qmlFunction(main, name), /retargetAppearance\(false\)/, name)
  }
  assert.doesNotMatch(qmlFunction(main, 'selectBot'), /retargetAppearance\(false\)/, 'a bot switch still morphs')
  const page = read('SettingsPanel.qml')
  assert.match(page, /opacity: shapeArea\.pressed \? 0\.55 : 1/)
  assert.match(page, /opacity: swatchArea\.pressed \? 0\.55 : 1/)
  assert.match(page, /visible: cell\.active/)
})

test('at rest the avatar holds still and does not blink, as in Grok Bot', () => {
  assert.match(main, /property string motionName: "calm"/)
  const blink = main.slice(main.indexOf('id: blinkTimer'), main.indexOf('id: blinkTimer') + 300)
  assert.match(blink, /root\.liveMotion !== "calm"/)
  for (const m of main.matchAll(/property: "breathe"; to: 1\.0?35/g)) assert.ok(m)
  const breath = main.slice(main.indexOf('property: "breathe"; to: 1.035') - 300, main.indexOf('property: "breathe"; to: 1.035'))
  assert.match(breath, /root\.liveMotion !== "calm"/)
  assert.doesNotMatch(qmlFunction(main, 'cursorLine'), /root\.gazeX = root\.gazeTargetX/, 'the eyes always ease to the pointer')
})

test('the eyes follow the pointer across the screen and stay inside the shape', async () => {
  const face = loadLibrary('qml/face.js')
  // Full deflection a short way from the mark, not only when the pointer is close.
  assert.match(qmlFunction(main, 'updateGazeTarget'), /var reach = 1 - Math\.exp\(-dist \/ 220\)/)
  assert.ok(1 - Math.exp(-600 / 220) > 0.9)
  const mark = read('CompanionMark.qml')
  assert.match(mark, /Face\.gazeShift\(mark\.gazeRoom, mark\.gazeX, mark\.gazeY\)/)
  assert.match(mark, /gazeDx: mark\.gazeShift\.x \* mark\.rad/)
  // Wide travel where the shape has room for it.
  const open = face.gazeShift(shapes.GAZE_ROOM.squircle, -1, 0)
  assert.equal(open.x, -face.GAZE_X)
  assert.ok(face.GAZE_X >= 0.24 && face.GAZE_Y >= 0.18)
  // Every shape, every direction: the eyes never leave the outline.
  for (const name of shapes.NAMES) {
    const shape = shapes.get(name)
    const need = Math.min(face.GAZE_MARGIN, face.clearance(shape.points, shape.eyes, 0, 0))
    for (let a = 0; a < 360; a += 5) {
      const shift = face.gazeShift(shapes.GAZE_ROOM[name], Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180))
      const room = face.clearance(shape.points, shape.eyes, shift.x, shift.y)
      assert.ok(room > 0 && room > need - 0.02, `${name} at ${a} degrees`)
    }
  }
  // Blocked head-on, the eyes slide along the edge toward the pointer.
  const slide = face.gazeShift(shapes.GAZE_ROOM.wedge, -0.71, -0.71)
  assert.ok(slide.x < -0.1)
  // The table in shapes.js is what tools/gaze-room.mjs computes.
  const { tables } = await import('../tools/gaze-room.mjs')
  assert.deepEqual(JSON.parse(JSON.stringify(shapes.GAZE_ROOM)), tables())
})
