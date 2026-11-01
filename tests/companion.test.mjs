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
  for (const name of ['summon', 'show', 'hide', 'toggleVisible', 'toggle', 'settings', 'ask', 'dictate', 'bot', 'appearance', 'animate', 'say', 'sayLink', 'sayLinks', 'dismiss']) {
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

test('hiding from the menu says how to bring the companion back, and a shortcut can toggle it', () => {
  const toggle = qmlFunction(main, 'toggleVisible')
  assert.match(toggle, /if \(root\.present\) root\.hideCompanion\(\)\n\s*else root\.showCompanion\(\)/)
  const announce = qmlFunction(main, 'announceHidden')
  // Omarchy's own helper, never notify-send; the click runs the IPC show.
  assert.match(announce, /omarchy-notification-send 'Grok Bot is hidden' 'Click to bring it back\.' --action Show omarchy-shell io\.github\.tcballard\.grokbot-desktop show/)
  assert.match(announce, /command -v omarchy-notification-send >\/dev\/null 2>&1 \|\| exit 0/)
  assert.doesNotMatch(main, /notify-send/)
  // Only the menu announces it; a script or shortcut that hides it already knows.
  assert.match(main, /root\.hideCompanion\(\)\n\s*root\.announceHidden\(\)/)
  assert.doesNotMatch(qmlFunction(main, 'hideCompanion'), /announceHidden/)
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

test('webhook mode posts the routine\'s fields with the key in both headers, never on argv', async () => {
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
  // What Grok Bot's "Omarchy desktop companion" routine takes: prompt,
  // botName, and source, plus botId to route without matching names.
  assert.deepEqual(Object.keys(seen.body).sort(), ['botId', 'botName', 'prompt', 'source'])
  assert.equal(seen.body.botName, 'Bob')
  assert.equal(seen.body.prompt, "What's on my calendar?")
  assert.match(seen.body.source, /^Omarchy desktop companion \([A-Za-z0-9._-]+\)$/)
  assert.equal(seen.headers.authorization, `Bearer ${key}`)
  assert.equal(seen.headers['x-automation-key'], key)

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

test('a webhook error is reported, not shown as the bot\'s reply', async () => {
  const replies = [[200, '{"code":"error","message":"Invalid API key"}'], [401, '{"code":"error","message":"Invalid API key"}']]
  let next = 0
  const server = http.createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      const [status, body] = replies[next++]
      res.statusCode = status
      res.setHeader('content-type', 'application/json')
      res.end(body)
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-err-'))
  const config = path.join(home, '.config', 'omarchy')
  fs.mkdirSync(config, { recursive: true })
  fs.writeFileSync(path.join(config, 'grokbot-desktop.json'), JSON.stringify({
    dispatch: 'webhook',
    webhookUrl: `http://127.0.0.1:${server.address().port}/automations/webhook/routine`
  }))
  fs.writeFileSync(path.join(config, 'grokbot-webhook.key'), 'crsr_wrong\n', { mode: 0o600 })
  const results = []
  for (let i = 0; i < replies.length; i++) {
    results.push(await spawnCollected(['python3', path.join(root, 'bin/grokbot-ask')], {
      input: JSON.stringify({ botId: 'e0195a7d-f804-4688-9191-e2cf3574a6d1', botName: 'Bob', prompt: 'hi' }),
      env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), GROKBOT_WEBHOOK_KEY: '' }
    }))
  }
  server.close()
  assert.equal(results[0].status, 4)
  assert.equal(results[0].stdout, '')
  assert.equal(results[0].stderr.trim(), 'webhook error: Invalid API key')
  assert.equal(results[1].status, 4)
  assert.equal(results[1].stderr.trim(), 'webhook status 401: Invalid API key')
  for (const result of results) assert.equal(result.stderr.includes('crsr_wrong'), false)
})

test('a webhook that only acknowledges the ask says it was sent', async () => {
  const bodies = ['', '{"ok":true,"runId":"run_123","error":null}', '[]', 'Plain answer']
  let next = 0
  const server = http.createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      const body = bodies[next++]
      res.setHeader('content-type', body.startsWith('{') || body.startsWith('[') ? 'application/json' : 'text/plain')
      res.end(body)
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-ack-'))
  const config = path.join(home, '.config', 'omarchy')
  fs.mkdirSync(config, { recursive: true })
  fs.writeFileSync(path.join(config, 'grokbot-desktop.json'), JSON.stringify({
    dispatch: 'webhook',
    webhookUrl: `http://127.0.0.1:${server.address().port}/automations/webhook/routine`
  }))
  fs.writeFileSync(path.join(config, 'grokbot-webhook.key'), 'crsr_test\n', { mode: 0o600 })
  const results = []
  try {
    for (let i = 0; i < bodies.length; i++) {
      results.push(await spawnCollected(['python3', path.join(root, 'bin/grokbot-ask')], {
        input: JSON.stringify({ botId: 'e0195a7d-f804-4688-9191-e2cf3574a6d1', botName: 'Bob', prompt: 'hi' }),
        env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), GROKBOT_WEBHOOK_KEY: '' }
      }))
    }
  } finally {
    server.close()
  }
  // An acknowledgement means the answer follows through the reply command:
  // exit 10, so the shell keeps the question waiting for it.
  for (const result of results.slice(0, 3)) {
    assert.equal(result.status, 10, result.stderr)
    assert.equal(result.stdout, 'Sent to Bob.\n')
  }
  assert.equal(results[3].status, 0, results[3].stderr)
  assert.equal(results[3].stdout, 'Plain answer\n')
})

test('a webhook ask carries its id and the command that answers it', async () => {
  let seen = null
  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      seen = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      res.setHeader('content-type', 'application/json')
      res.end('{"success":true,"runUuid":"ac049e46-d399-485d-8a8e-b6e8954202c8"}')
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-askid-'))
  const config = path.join(home, '.config', 'omarchy')
  fs.mkdirSync(config, { recursive: true })
  fs.writeFileSync(path.join(config, 'grokbot-desktop.json'), JSON.stringify({
    dispatch: 'webhook',
    webhookUrl: `http://127.0.0.1:${server.address().port}/automations/webhook/routine`
  }))
  fs.writeFileSync(path.join(config, 'grokbot-webhook.key'), 'crsr_test\n', { mode: 0o600 })
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), GROKBOT_WEBHOOK_KEY: '' }
  const ask = (askId) => spawnCollected(['python3', path.join(root, 'bin/grokbot-ask')], {
    input: JSON.stringify({ askId, botId: 'e0195a7d-f804-4688-9191-e2cf3574a6d1', botName: 'Bob', prompt: 'hi' }),
    env
  })
  let sent, bad
  try {
    sent = await ask('0a1b2c3d4e5f')
    bad = await ask('0a1b; rm -rf ~')
  } finally {
    server.close()
  }
  assert.equal(sent.status, 10, sent.stderr)
  assert.deepEqual(Object.keys(seen).sort(), ['askId', 'botId', 'botName', 'prompt', 'replyWith', 'source'])
  assert.equal(seen.askId, '0a1b2c3d4e5f')
  assert.equal(seen.replyWith, 'omarchy-shell io.github.tcballard.grokbot-desktop reply 0a1b2c3d4e5f "<answer>"')
  // An id that isn't plain hex never reaches the routine.
  assert.equal(bad.status, 2)
})

test('a webhook that cannot be reached, or does not answer, says why', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-reach-'))
  const config = path.join(home, '.config', 'omarchy')
  fs.mkdirSync(config, { recursive: true })
  fs.writeFileSync(path.join(config, 'grokbot-webhook.key'), 'crsr_test\n', { mode: 0o600 })
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), GROKBOT_WEBHOOK_KEY: '', GROKBOT_WEBHOOK_TIMEOUT: '2' }
  const ask = (url) => {
    fs.writeFileSync(path.join(config, 'grokbot-desktop.json'), JSON.stringify({ dispatch: 'webhook', webhookUrl: url }))
    return spawnCollected(['python3', path.join(root, 'bin/grokbot-ask')], {
      input: JSON.stringify({ botId: 'e0195a7d-f804-4688-9191-e2cf3574a6d1', botName: 'Bob', prompt: 'hi' }),
      env
    })
  }
  // Nothing listening.
  const closed = http.createServer()
  await new Promise((resolve) => closed.listen(0, '127.0.0.1', resolve))
  const port = closed.address().port
  await new Promise((resolve) => closed.close(resolve))
  const refused = await ask(`http://127.0.0.1:${port}/hook`)
  assert.equal(refused.status, 4)
  assert.equal(refused.stderr.trim(), 'webhook unreachable: the connection was refused')
  // Connected, but no answer before the wait runs out.
  const silent = http.createServer(() => {})
  await new Promise((resolve) => silent.listen(0, '127.0.0.1', resolve))
  let slow
  try {
    slow = await ask(`http://127.0.0.1:${silent.address().port}/hook`)
  } finally {
    silent.closeAllConnections()
    silent.close()
  }
  assert.equal(slow.status, 4)
  assert.equal(slow.stderr.trim(), "the webhook didn't answer within 2 seconds")
  // The other reasons, named in a few plain words.
  const script = [
    'import importlib.machinery, importlib.util, socket, ssl, errno',
    `loader = importlib.machinery.SourceFileLoader("ga", ${JSON.stringify(path.join(root, 'bin/grokbot-ask'))})`,
    'm = importlib.util.module_from_spec(importlib.util.spec_from_loader("ga", loader))',
    'loader.exec_module(m)',
    'r = m.unreachable_reason',
    'print(r(TimeoutError(), "h"))',
    'print(r(socket.gaierror(-2, "x"), "api2.cursor.sh"))',
    'print(r(ssl.SSLCertVerificationError("x"), "h"))',
    'print(r(OSError(errno.ENETUNREACH, "x"), "h"))',
    'print(r(OSError("Tunnel connection failed: 502 Bad Gateway"), "api2.cursor.sh"))',
    'print(r("odd", "h"))'
  ].join('\n')
  const reasons = spawnSync('python3', ['-c', script], { encoding: 'utf8' })
  assert.equal(reasons.status, 0, reasons.stderr)
  assert.deepEqual(reasons.stdout.trim().split('\n'), [
    'no connection within 10 seconds',
    "couldn't look up api2.cursor.sh",
    "its certificate couldn't be verified",
    'the network is unreachable',
    "the proxy couldn't connect to api2.cursor.sh",
    'the connection failed'
  ])
})

test('a routine\'s own header carries its value from a private file, beside the key', async () => {
  const value = `hv_${Math.random().toString(16).slice(2)}`
  const seen = []
  let cmdline = ''
  let pid = 0
  const server = http.createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      seen.push(req.headers)
      try { cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8') } catch { cmdline = '' }
      res.end('ok')
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-header-'))
  const config = path.join(home, '.config', 'omarchy')
  fs.mkdirSync(config, { recursive: true })
  const settings = (extra) => fs.writeFileSync(path.join(config, 'grokbot-desktop.json'), JSON.stringify({
    dispatch: 'webhook',
    webhookUrl: `http://127.0.0.1:${server.address().port}/automations/webhook/routine`,
    ...extra
  }))
  fs.writeFileSync(path.join(config, 'grokbot-webhook.key'), 'crsr_test\n', { mode: 0o600 })
  const headerFile = path.join(config, 'grokbot-webhook-header.key')
  const ask = () => spawnCollected(['python3', path.join(root, 'bin/grokbot-ask')], {
    input: JSON.stringify({ botId: 'e0195a7d-f804-4688-9191-e2cf3574a6d1', botName: 'Bob', prompt: 'hi' }),
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), GROKBOT_WEBHOOK_KEY: '' },
    onPid: (p) => { pid = p }
  })

  settings({ webhookHeader: 'X-Routine-Token' })
  fs.writeFileSync(headerFile, `${value}\n`, { mode: 0o600 })
  const sent = await ask()
  assert.equal(sent.status, 0, sent.stderr)
  assert.equal(seen.length, 1)
  assert.equal(seen[0]['x-routine-token'], value)
  // The Sender key still goes in both auth headers.
  assert.equal(seen[0].authorization, 'Bearer crsr_test')
  assert.equal(seen[0]['x-automation-key'], 'crsr_test')
  for (const text of [sent.stdout, sent.stderr, cmdline]) assert.equal(text.includes(value), false)

  // Without a private value nothing is sent: a missing file, a file others
  // can read, or a value that would start another header line.
  fs.rmSync(headerFile)
  const missing = await ask()
  assert.equal(missing.status, 3)
  assert.equal(missing.stderr.trim(), 'the value for the X-Routine-Token header is missing or readable by other users')
  fs.writeFileSync(headerFile, `${value}\n`, { mode: 0o644 })
  fs.chmodSync(headerFile, 0o644)
  const open = await ask()
  assert.equal(open.status, 3)
  assert.equal(open.stderr.includes(value), false)
  fs.writeFileSync(headerFile, `${value}\rX-Injected: 1\n`, { mode: 0o600 })
  fs.chmodSync(headerFile, 0o600)
  assert.equal((await ask()).status, 3)

  // A name must be a plain header name, and cannot replace one the
  // companion sends itself.
  fs.writeFileSync(headerFile, `${value}\n`, { mode: 0o600 })
  for (const name of ['Authorization', 'x-automation-key', 'Host', 'X Bad', 'X-Bad:1', 'X-Bad\r\nX-Injected']) {
    settings({ webhookHeader: name })
    const refused = await ask()
    assert.equal(refused.status, 2, name)
    assert.match(refused.stderr, /webhookHeader must be a plain header name/)
  }
  server.close()
  assert.equal(seen.length, 1)
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

test('readme credits both companions and shows a real preview', () => {
  const readme = read('README.md')
  assert.match(readme, /<h1 align="center">Grok Bot Desktop Companion<\/h1>/)
  assert.equal((readme.match(/omarchy-plugin\.svg/g) || []).length, 1)
  assert.match(readme, /jankeesvw\/omarchy-clippy/)
  assert.match(readme, /rdoupe\/omarchy-clanky/)
  assert.match(readme, /tcballard\/build-omarchy-plugins/)
  assert.doesNotMatch(readme, /architectural preview/i)
  // The preview is a PNG in the tree, shown inline rather than linked.
  const preview = readme.match(/<img src="([^"]+\.png)"/)
  assert.ok(preview, 'README shows a PNG preview')
  const bytes = fs.readFileSync(path.join(root, preview[1]))
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.doesNotMatch(readme, new RegExp(`\\]\\(${preview[1].replace(/[.]/g, '\\.')}\\)`))
})

// Each release records its own live pass, so this checks the record's shape,
// the same fields scripts/archive.mjs requires, not one session's values.
test('acceptance record has what the release archive needs', () => {
  const acceptance = readJSON(path.join(root, 'docs/ACCEPTANCE.json'))
  assert.ok(['passed', 'pending', 'failed'].includes(acceptance.status))
  assert.match(acceptance.input_commit, /^[a-f0-9]{40}$/)
  assert.match(acceptance.date, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(typeof acceptance.platform, 'string')
  assert.ok(acceptance.platform.length > 0)
  for (const key of ['commands', 'results', 'limitations']) {
    assert.ok(Array.isArray(acceptance[key]) && acceptance[key].length > 0, `${key} is a non-empty list`)
  }
  if (acceptance.status === 'passed') assert.equal(acceptance.live.status, 'passed')
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
  assert.match(read('BubblePanel.qml'), /typing: app \? \(app\.askingHere \|\| app\.waitingHere\) && app\.bubbleBody === "" : false/)
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
  // Every part of the chat page eases in and out with its gap, so the card
  // follows its content instead of chasing it with an animation of its own.
  assert.match(bubble, /component Reveal: Item \{[\s\S]*?height: t \* \(gap \+ holder\.height\)/)
  assert.doesNotMatch(bubble, /shownHeight/)
  for (const id of ['dividerReveal', 'threadReveal', 'trayReveal', 'noteReveal', 'menuReveal', 'undoReveal', 'composerReveal'])
    assert.match(bubble, new RegExp(`Reveal \\{\\s*id: ${id}`))
  assert.match(bubble, /Behavior on fit \{\s*enabled: threadReveal\.t >= 0\.999\s*NumberAnimation \{ duration: bubble\.ms\(bubble\.pageMs\)/)
  assert.match(bubble, /Behavior on expand/)
  // The card settles open without overshooting.
  assert.doesNotMatch(card, /OutBack/)
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

test('pins follow use and the persistent badge names the selected bot', () => {
  const bubble = read('BubblePanel.qml')
  assert.doesNotMatch(bubble, /key: "X Desk"/)
  assert.match(bubble, /app\.recentBots/)
  const select = qmlFunction(main, 'selectBot')
  assert.match(select, /recentBots = \[id\]/)
  const badge = main.slice(main.indexOf('id: nameTag'), main.indexOf('id: mark'))
  assert.match(badge, /readonly property string label: root\.botLabel\(\)/)
  assert.match(badge, /text: nameTag\.label/)
  assert.match(badge, /textFormat: Text\.PlainText/)
  assert.match(badge, /elide: Text\.ElideRight/)
  assert.doesNotMatch(badge, /switchTag|onShownChanged/)
  assert.match(select, /root\.chosenBotId = id/)
  assert.match(qmlFunction(main, 'saveSettings'), /settings\.recentBots = root\.recentBots/)
})

test('a bot saved in shell.json is restored, not replaced by the bundled roster', () => {
  // The watched roster loads asynchronously, so startup reads the settings first
  // and then settles on the bundled roster, which knows nothing about the bots
  // synced here. The saved bot must survive that and win when the roster lands.
  const source = ['parseBots', 'applyBots', 'settleChosenBot', 'findBot', 'primaryBot']
    .map((name) => qmlFunction(main, name)).join('\n')
  const bundledBots = { text: () => read('data/bots.json') }
  const roster = JSON.stringify({ bots: [
    { id: 'a-first', name: 'Bookmark Digest', shortName: 'Bookmark Digest' },
    { id: 'z-main', name: 'Max', shortName: 'Max' },
  ] })
  const start = (saved) => {
    const root = {
      bots: [], chosenBotId: saved, rosterRead: false, ready: false,
      defaultBotId: 'e0195a7d-f804-4688-9191-e2cf3574a6d1',
      safeImage: () => '', retargetAppearance() {},
    }
    const context = vm.createContext({ root, bundledBots })
    vm.runInContext(source, context)
    // The QML calls these through `root.`, so lend them back to the object.
    for (const name of ['parseBots', 'applyBots', 'settleChosenBot', 'findBot', 'primaryBot']) {
      root[name] = context[name]
    }
    return { root, applyBots: context.applyBots, settleChosenBot: context.settleChosenBot }
  }

  // Startup: settings read, bundled roster in place, watched roster still loading.
  const late = start('z-main')
  late.applyBots('')
  assert.equal(late.root.chosenBotId, 'z-main', 'the saved bot survives the bundled roster')
  // The watched roster arrives: the saved bot is in it and stays selected.
  late.root.rosterRead = true
  late.applyBots(roster)
  assert.equal(late.root.chosenBotId, 'z-main', 'the saved bot wins over the first alphabetically')

  // The roster loads before the settings do: settling picks the primary then the
  // first bot, and reading the saved bot afterwards restores it.
  const early = start('z-main')
  early.root.chosenBotId = early.root.defaultBotId
  early.root.rosterRead = true
  early.applyBots(roster)
  assert.equal(early.root.chosenBotId, 'a-first')
  early.root.chosenBotId = 'z-main'
  early.settleChosenBot()
  assert.equal(early.root.chosenBotId, 'z-main')

  // A bot that left the roster still falls back the way Grok Bot does.
  const gone = start('gone-id')
  gone.root.rosterRead = true
  gone.applyBots(roster)
  assert.equal(gone.root.chosenBotId, 'a-first')

  // The wiring: settling waits for the watched roster, and loading never resets
  // the chosen bot to the built-in default on its own.
  assert.match(main, /onLoaded: \{\s*root\.rosterRead = true\s*root\.applyBots\(text\(\)\)/)
  assert.match(main, /onLoadFailed: \{\s*root\.rosterRead = true\s*root\.applyBots\(""\)/)
  assert.match(qmlFunction(main, 'applyBots'), /if \(root\.rosterRead\) root\.settleChosenBot\(\)/)
  const load = qmlFunction(main, 'loadSettings')
  assert.match(load, /if \(root\.rosterRead\) root\.settleChosenBot\(\)/)
  assert.doesNotMatch(load, /chosenBotId = root\.defaultBotId/)
})

test('the right-click menu opens toward the screen from any corner', () => {
  const menu = main.slice(main.indexOf('id: menuCard'), main.indexOf('id: menuCard') + 1600)
  assert.match(menu, /root\.anchorFromRight \? stage\.x - width - 8 : stage\.x \+ stage\.width \+ 8/)
  assert.doesNotMatch(menu, /x: Math\.max\(8, stage\.x - width - 8\)/)
})

test('the prompt bubble fits short prompts', () => {
  assert.match(read('BubblePanel.qml'), /width: Math\.min\(implicitWidth, bubble\.width - 120\)/)
})

test('a long prompt wraps and the field grows so all of it shows before sending', () => {
  const panel = read('BubblePanel.qml')
  assert.match(panel, /TextArea\.flickable: TextArea \{\s*id: promptField/)
  assert.match(panel, /wrapMode: TextArea\.Wrap/)
  assert.doesNotMatch(panel, /TextField \{/)
  // Up to six lines, then it scrolls with the caret kept in view.
  assert.match(panel, /promptField\.oneLine \* 6/)
  assert.match(panel, /onCursorRectangleChanged:/)
  // Enter sends; Shift+Enter is a new line.
  assert.match(panel, /if \(event\.modifiers & Qt\.ShiftModifier\) \{\s*event\.accepted = false/)
  assert.match(panel, /Keys\.onReturnPressed: function \(event\) \{ promptField\.returnKey\(event\) \}/)
  // The line breaks survive into the ask.
  const clean = new Function(`${qmlFunction(main, 'plainPrompt').replace('function plainPrompt', 'return function')}`)()
  assert.equal(clean('first line\r\nsecond\u0007line\n\n\n\nend  ', 4000), 'first line\nsecond line\n\nend')
  assert.match(qmlFunction(main, 'submitPrompt'), /root\.plainPrompt\(value, 4000\)/)
})

test('chrome colours come from one token file and text is set like Grok Bot\'s app', () => {
  for (const file of ['BubblePanel.qml', 'SettingsPanel.qml']) {
    const source = read(file)
    assert.doesNotMatch(source, /"#[0-9A-Fa-f]{6,8}"/, `${file} uses qml/theme.js`)
    for (const element of source.matchAll(/textFormat: (Text|TextEdit)\.PlainText/g)) {
      const before = source.slice(Math.max(0, element.index - 900), element.index)
      const start = Math.max(before.lastIndexOf('Text {'), before.lastIndexOf('TextEdit {'), before.lastIndexOf('TextArea {'))
      assert.ok(start >= 0, `${file} plain text belongs to a text element`)
      const absoluteStart = Math.max(0, element.index - 900) + start
      let depth = 0
      let end = source.indexOf('{', absoluteStart)
      for (; end < source.length; end++) {
        if (source[end] === '{') depth++
        else if (source[end] === '}' && --depth === 0) break
      }
      // QML property order is immaterial: check the whole text element.
      assert.match(source.slice(absoluteStart, end), /font\.family:/, `${file} text without a family`)
    }
  }
  // SF Pro where installed, else the bundled Inter, else the shell's font.
  assert.match(main, /readonly property var appleFamilies: \["SF Pro Text", "SF Pro"\]/)
  assert.match(main, /source: Qt\.resolvedUrl\("assets\/fonts\/Inter-Regular\.ttf"\)/)
  assert.match(main, /source: Qt\.resolvedUrl\("assets\/fonts\/Inter-SemiBold\.ttf"\)/)
  assert.match(qmlFunction(main, 'pickFontFamily'), /root\.styleFontFamily\(\)/)
  assert.match(main, /Commons\.Style\.font\.family/)
  for (const font of ['Inter-Regular.ttf', 'Inter-SemiBold.ttf']) {
    const data = fs.readFileSync(path.join(root, 'assets/fonts', font))
    assert.equal(data.readUInt32BE(0), 0x00010000, `${font} is a TrueType font`)
    assert.ok(data.length < 200 * 1024, `${font} stays subset`)
  }
  assert.match(read('assets/fonts/OFL-Inter.txt'), /SIL Open Font License, Version 1\.1/)
  for (const file of ['Main.qml', 'BubblePanel.qml', 'SettingsPanel.qml']) {
    const source = read(file)
    // Bold would make Qt embolden the SemiBold face; the app uses semibold.
    assert.doesNotMatch(source, /font\.bold:/, `${file} asks for a weight`)
    assert.doesNotMatch(source, /font\.family: "monospace"/, `${file} uses the app font`)
  }
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

test('the window covers the output and never resizes, so the mark never moves', () => {
  assert.match(main, /anchors \{\s*top: true\s*bottom: true\s*left: true\s*right: true\s*\}/)
  for (const gone of ['compactX0', 'originX', 'fullWindow', 'readonly property bool expanded', 'margins {', 'implicitWidth: Math.max(1']) {
    assert.equal(main.includes(gone), false, `${gone} would resize or offset the window`)
  }
  // Stage, cursor, and drag all use output coordinates directly.
  assert.match(main, /x: root\.stageScreenX\n\s*y: root\.stageScreenY/)
  assert.match(qmlFunction(main, 'updateGazeTarget'), /root\.cursorX - \(win\.screen\.x \+ local\.x\)/)
  assert.match(qmlFunction(main, 'stageRect'), /x: win\.screen\.x \+ point\.x/)
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
  assert.match(main, /name === "configreloaded" && !layerRuleProc\.running\) layerRuleProc\.running = true/)
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

test('the eyes follow the pointer across the screen and stay inside the shape', () => {
  const face = loadLibrary('qml/face.js')
  // Full deflection a short way from the mark, measured against the larger
  // axis so corner looks turn fully both ways.
  const target = qmlFunction(main, 'updateGazeTarget')
  assert.match(target, /var reach = 1 - Math\.exp\(-dist \/ 220\)/)
  assert.match(target, /var edge = Math\.max\(Math\.abs\(dx\), Math\.abs\(dy\)\)/)
  assert.ok(1 - Math.exp(-600 / 220) > 0.9)
  // Every shape, every look: the eyes never leave the outline it is turned to.
  for (const name of shapes.NAMES) {
    const shape = shapes.get(name)
    const params = shapes.LOOK[name]
    for (let gy = -1; gy <= 1.001; gy += 0.25) {
      for (let gx = -1; gx <= 1.001; gx += 0.25) {
        const turned = face.look(shape.points, params, gx, gy)
        const outline = face.rotatePoints(shape.points, turned.turn, turned.centre)
        assert.ok(face.clearance(outline, turned.eyes, 0, 0) > 0, `${name} looking ${gx},${gy}`)
      }
    }
  }
})

test('a conversation hides the other bots behind the header switch', () => {
  const panel = read('BubblePanel.qml')
  assert.match(panel, /readonly property bool inThread: app \? \(app\.askingHere \|\| bubble\.hasThread\)/)
  assert.match(panel, /readonly property bool rosterShown: !bubble\.inThread \|\| \(app \? app\.rosterExpanded : false\)/)
  // The row folds smoothly rather than vanishing.
  // The row carries its own gap, so folding away never snaps the card.
  assert.match(panel, /height: rosterBlock\.shown \* \(12 \+ pinRow\.height/)
  assert.match(panel, /Column \{\s*id: headerGroup\s*width: parent\.width\s*spacing: 0/)
  assert.match(panel, /Behavior on shown \{ NumberAnimation/)
  // The header pill is the switch button in a thread.
  assert.match(panel, /label: bubble\.inThread \? \(app\.rosterExpanded \? "Hide bots" : "Switch bot"\)/)
  // Picking a bot folds the list away again; every bot is listed, so no "+N".
  assert.match(qmlFunction(panel, 'pickBot'), /if \(bubble\.inThread\) app\.rosterExpanded = false/)
  assert.equal((panel.match(/onActivated: bubble\.pickBot\(modelData\.id\)/g) || []).length, 2)
  assert.match(panel, /visible: bubble\.extraBots\.length > 0 && !bubble\.inThread/)
})

test('the appearance page says what Dodge does', () => {
  const page = read('SettingsPanel.qml')
  assert.match(page, /"Dodge is on: as the pointer comes near, " \+ app\.botLabel\(\) \+ " fades and lets clicks through/)
  assert.match(page, /"Dodge is off: " \+ app\.botLabel\(\) \+ " stays solid and takes clicks/)
  assert.match(page, /label: "Dodge: fade and let clicks through when the pointer comes near"/)
})

test('the desktop mark turns its face as Grok Bot moves Bob', async () => {
  const face = loadLibrary('qml/face.js')
  const mark = read('CompanionMark.qml')
  assert.match(mark, /property bool lively: false/)
  assert.match(mark, /Face\.look\(mark\.blended\.points, mark\.lookParams, mark\.gazeX, mark\.gazeY\)/)
  assert.match(mark, /Face\.rotatePoints\(mark\.blended\.points, mark\.turned\.turn, mark\.turned\.centre\)/)
  assert.match(main, /lively: true/)
  // Bob looking up and to the right is his picker pose.
  const bob = shapes.get('teardrop')
  const picker = face.look(bob.points, shapes.LOOK.teardrop, 1, -1)
  assert.equal(picker.roll, face.PICKER_ROLL)
  const err = Math.max(...picker.eyes.map((e, i) => Math.hypot(e.x - bob.eyes[i].x, e.y - bob.eyes[i].y)))
  assert.ok(err < 0.15, `picker pose off by ${err.toFixed(3)}`)
  // His eyes cross most of his face, and are largest facing you.
  const left = face.look(bob.points, shapes.LOOK.teardrop, -1, 0)
  const right = face.look(bob.points, shapes.LOOK.teardrop, 1, 0)
  const front = face.look(bob.points, shapes.LOOK.teardrop, 0, 0)
  const pairX = (look) => (look.eyes[0].x + look.eyes[1].x) / 2
  assert.ok(pairX(right) - pairX(left) > 0.7, 'eyes travel at least 0.7 of the body radius side to side')
  assert.ok(front.eyes[0].length > right.eyes[0].length * 1.1, 'eyes shrink as the face turns away')
  // Facing you, as when the pointer rests on the mark, the eyes stay close
  // to the picker's size instead of staring.
  const pickerLength = (bob.eyes[0].length + bob.eyes[1].length) / 2
  assert.ok(front.eyes[0].length < pickerLength * 1.25, 'facing eyes stay near the picker size')
  assert.match(main, /attention: 1\n/)
  assert.equal(front.eyes[0].angle, 90)
  // The face rolls with the turn as Bob's does: facing you upright, up and to
  // either side by about 25 degrees.
  assert.equal(front.roll, 0)
  assert.equal(face.look(bob.points, shapes.LOOK.teardrop, -1, -1).roll, -25)
  // The table in shapes.js is what tools/look-table.mjs computes.
  const { tables } = await import('../tools/look-table.mjs')
  const sample = ['teardrop', 'wedge', 'hex']
  assert.deepEqual(Object.fromEntries(sample.map((name) => [name, JSON.parse(JSON.stringify(shapes.LOOK[name]))])), tables(sample))
})

test('while asking, the mark looks around as Bob does while Working', () => {
  assert.match(main, /root\.asking = true\n\s*root\.expression = "work"/)
  assert.match(main, /readonly property var workLooks: \[/)
  assert.match(main, /\[-0\.54, -0\.13, 560, "blink"\]/)
  assert.match(main, /easing\.bezierCurve: \[0\.4, 0, 0\.2, 1, 1, 1\]/)
  // It keeps working while a webhook answer is on the way.
  assert.match(main, /running: root\.present && root\.busyHere && !root\.reduceMotion/)
  assert.match(main, /readonly property bool busyHere: root\.askingHere \|\| root\.waitingHere/)
  assert.match(main, /gazeX: \(root\.gazeX \* \(1 - root\.workBlend\) \+ root\.workX \* root\.workBlend\)/)
  const face = loadLibrary('qml/face.js')
  assert.deepEqual(JSON.parse(JSON.stringify(face.pose('work'))), { tilt: 0, height: 1, open: 1 })
})

test('a bot switch snapshots the picker-pose eyes, not the turned face', () => {
  const morph = qmlFunction(main, 'startMorph')
  assert.match(morph, /var eyesNow = mark\.blended\.eyes/)
  assert.doesNotMatch(morph, /mark\.restEyes/)
  assert.match(morph, /var face = mark\.blended\.points/)
})

test('the header pill names the bot and shows its role only on hover or focus', () => {
  const panel = read('BubblePanel.qml')
  assert.match(panel, /readonly property real shown: pillArea\.containsMouse \|\| pillArea\.activeFocus \? 1 : 0/)
  assert.match(panel, /width: reveal \* Math\.max\(0, Math\.min\(implicitWidth, headerRow\.roleRoom\)\)/)
  assert.match(panel, /visible: reveal > 0\.01/)
  assert.match(panel, /HoverArea \{\s*id: pillArea/)
})

test('each bot keeps its own conversation, and a reply lands with the bot asked', () => {
  // Switching puts the conversation on screen away under its bot and brings
  // the next one's back; nothing is written to disk.
  const select = qmlFunction(main, 'selectBot')
  assert.match(select, /if \(changed\) \{\s*root\.clearedThread = null\s*root\.stashThread\(root\.threadBotId\)/)
  assert.match(select, /root\.loadThread\(id\)/)
  assert.match(qmlFunction(main, 'stashThread'), /\{ history: root\.history, asked: root\.askedText, files: root\.askedFiles, body: root\.bubbleBody, links: root\.noticeLinks, wait: root\.awaitingId, draft: root\.promptDraft, pending: root\.pendingFiles \}/)
  assert.match(qmlFunction(main, 'loadThread'), /root\.awaitingId = thread\.wait \|\| ""/)
  assert.doesNotMatch(qmlFunction(main, 'saveSettings'), /threads/)
  // The ask remembers its bot; its reply is shown there or kept unread.
  assert.match(qmlFunction(main, 'launchAsk'), /root\.askBotId = root\.threadBotId/)
  const deliver = qmlFunction(main, 'deliver')
  assert.match(deliver, /if \(id === "" \|\| id === root\.threadBotId\)/)
  assert.match(deliver, /root\.markUnread\(id\)/)
  // A folded row hides the chips, so the pill's chevron carries their dot.
  const folded = read('BubblePanel.qml')
  assert.match(folded, /readonly property bool unreadHidden: \{\n\s*var unread = app \? app\.unreadBots : \[\]\n\s*if \(unread\.length === 0\) return false\n\s*if \(!bubble\.rosterShown\) return true/)
  assert.match(folded, /\/\/ A reply for a bot whose chip is folded away\.\n\s*Rectangle \{\n\s*visible: bubble\.unreadHidden/)
  assert.match(main, /var here = root\.deliver\(root\.askBotId, ok \? out :/)
  assert.match(qmlFunction(main, 'stopAsk'), /root\.deliver\(root\.askBotId, "Stopped\."\)/)
  // Only the bot asking shows the dots, stop button, and work loop.
  assert.match(main, /readonly property bool askingHere: root\.asking && root\.askBotId === root\.threadBotId/)
  assert.match(main, /property real workBlend: root\.busyHere && !root\.reduceMotion/)
  const panel = read('BubblePanel.qml')
  assert.match(panel, /readonly property bool asking: app \? app\.askingHere : false/)
  assert.match(panel, /"Waiting for " \+ app\.askingLabel\(\) \+ " to answer…"/)
  assert.equal((panel.match(/visible: app\.unreadBots\.indexOf\(modelData\.id\) >= 0/g) || []).length, 2)
  assert.match(panel, /opacity: mode === "send" && app && app\.asking && !app\.askingHere \? 0\.45 : 1/)
})

test('each bot keeps a scrolling history of its conversation', () => {
  // A new ask or notice moves the latest exchange into the history.
  const archive = qmlFunction(main, 'archiveExchange')
  assert.match(archive, /root\.history = root\.history\.concat\(\[\{ asked: root\.askedText, files: root\.askedFiles, body: root\.bubbleBody, links: root\.noticeLinks, wait: root\.awaitingId \}\]\)\.slice\(-root\.historyLimit\)/)
  assert.match(qmlFunction(main, 'launchAsk'), /root\.archiveExchange\(\)\n\s*root\.askedText = String\(prompt \|\| ""\)/)
  assert.match(qmlFunction(main, 'sayNotice'), /root\.archiveExchange\(\)/)
  assert.match(qmlFunction(main, 'loadThread'), /root\.history = thread\.history \|\| \[\]/)
  // One scrolling view: the history, then the latest exchange.
  const panel = read('BubblePanel.qml')
  assert.match(panel, /component Exchange: Column \{/)
  assert.match(panel, /model: app \? app\.history : \[\]\n\s*delegate: Exchange \{/)
  assert.match(panel, /Exchange \{\s*id: latest/)
  assert.match(panel, /var end = Math\.max\(0, contentHeight - Math\.min\(threadBox\.cap, contentHeight\)\)\n\s*var target = Math\.min\(end, Math\.max\(0, latest\.y\)\)/)
  assert.match(panel, /readonly property real cap: Math\.max\(140, bubble\.maxHeight - 28 - headerGroup\.height - dividerReveal\.height/)
})

test('clearing a conversation is in the menu, not the composer, and can be undone', () => {
  const panel = read('BubblePanel.qml')
  assert.doesNotMatch(panel, /plusButton|newConversation/)
  assert.doesNotMatch(main, /function newConversation/)
  // Clearing keeps the conversation behind an Undo chip for a few seconds.
  const clear = qmlFunction(main, 'clearConversation')
  assert.match(clear, /root\.clearedThread = \{ botId: root\.threadBotId, history: root\.history, asked: root\.askedText, files: root\.askedFiles, body: root\.bubbleBody, links: root\.noticeLinks, wait: root\.awaitingId \}/)
  assert.match(qmlFunction(main, 'undoClear'), /root\.awaitingId = cleared\.wait \|\| ""/)
  assert.match(clear, /undoTimer\.restart\(\)/)
  assert.match(qmlFunction(main, 'undoClear'), /root\.history = cleared\.history/)
  assert.match(main, /readonly property bool undoShown: root\.clearedThread !== null && root\.clearedThread\.botId === root\.threadBotId/)
  assert.match(qmlFunction(main, 'archiveExchange'), /root\.clearedThread = null/)
  assert.match(panel, /id: undoReveal\n\s*shown: app \? app\.undoShown : false/)
  assert.match(panel, /onActivated: app\.undoClear\(\)/)
  // It lives in the right-click menu and on IPC, not in the composer.
  assert.match(main, /root\.canClear \? \[\{ "label": "Clear conversation", "action": "clear" \}\]/)
  assert.match(main, /function clear\(\): string \{ return root\.clearConversation\(\) \}/)
})

test('grokbot-connect tests the URL and key before saving them, and keeps other settings', async () => {
  const seen = []
  let answer = { status: 200, body: '{"success":true,"runUuid":"ac049e46-d399-485d-8a8e-b6e8954202c8"}' }
  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      seen.push({ headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) })
      res.statusCode = answer.status
      res.setHeader('content-type', 'application/json')
      res.end(answer.body)
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/automations/webhook/routine`
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-connect-'))
  const config = path.join(home, '.config', 'omarchy')
  fs.mkdirSync(config, { recursive: true })
  const settingsFile = path.join(config, 'grokbot-desktop.json')
  const keyFile = path.join(config, 'grokbot-webhook.key')
  const headerFile = path.join(config, 'grokbot-webhook-header.key')
  fs.writeFileSync(settingsFile, JSON.stringify({ agentsDir: '/srv/agents', webhookHeader: 'X-Old' }))
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), GROKBOT_WEBHOOK_KEY: '' }
  const connect = (args, input) => spawnCollected(['python3', path.join(root, 'bin/grokbot-connect'), ...args], { input, env })
  const key = `crsr_${Math.random().toString(16).slice(2)}`
  const results = {}
  try {
    // A refused key saves nothing.
    answer = { status: 401, body: '{"code":"error","message":"Invalid API key"}' }
    results.refused = await connect([], `${url}\nwrong_key\n`)
    results.refusedSaved = fs.existsSync(keyFile)
    // Neither does an address that isn't https, or a header name the
    // companion sends itself; both are refused before anything is sent.
    results.badUrl = await connect([], 'http://example.com/hook\nkey\n')
    results.badHeader = await connect(['--header', 'Authorization'], `${url}\nkey\nvalue\n`)
    results.sentBeforeGood = seen.length
    answer = { status: 200, body: '{"success":true,"runUuid":"ac049e46-d399-485d-8a8e-b6e8954202c8"}' }
    results.ok = await connect([], `${url}\n${key}\n`)
    results.status = await connect(['--status'], '')
    results.withHeader = await connect(['--header', 'X-Routine-Token'], `${url}\n${key}\nhv_secret\n`)
    results.off = await connect(['--off'], '')
  } finally {
    server.close()
  }
  assert.equal(results.refused.status, 1)
  assert.match(results.refused.stderr, /Not saved\. Grok Bot refused the key\. Use the routine's Sender key/)
  assert.equal(results.refusedSaved, false)
  assert.equal(results.badUrl.status, 2)
  assert.equal(results.badHeader.status, 2)
  assert.equal(results.sentBeforeGood, 1)

  assert.equal(results.ok.status, 0, results.ok.stderr)
  assert.match(results.ok.stdout, /Connected\. Grok Bot took the test ask\./)
  for (const text of [results.ok.stdout, results.ok.stderr]) assert.equal(text.includes(key), false)
  // The test went through the real helper: the test prompt, to Bob, with
  // the key in both auth headers.
  assert.equal(seen.length, 3)
  const test = seen[1]
  assert.equal(test.body.botName, 'Bob')
  assert.match(test.body.prompt, /^Connection test from the Omarchy desktop companion\./)
  assert.equal(test.headers['x-automation-key'], key)
  assert.equal(results.status.status, 0, results.status.stderr)
  assert.match(results.status.stdout, /Asks go to Grok Bot through the webhook at 127\.0\.0\.1\.\nSender key: saved\./)

  // Saved as tested, with the header from --header, and other settings kept.
  assert.equal(results.withHeader.status, 0, results.withHeader.stderr)
  assert.equal(seen[2].headers['x-routine-token'], 'hv_secret')
  assert.equal(fs.readFileSync(keyFile, 'utf8'), `${key}\n`)
  assert.equal(fs.statSync(keyFile).mode & 0o777, 0o600)
  assert.equal(fs.readFileSync(headerFile, 'utf8'), 'hv_secret\n')
  assert.equal(fs.statSync(headerFile).mode & 0o777, 0o600)

  // --off goes back to the agent and keeps the rest.
  assert.equal(results.off.status, 0, results.off.stderr)
  const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
  assert.deepEqual(saved, { agentsDir: '/srv/agents', webhookHeader: 'X-Routine-Token', dispatch: 'agent', webhookUrl: url })
})

test('a bot speaking through say is a message in its own conversation, not a notice', () => {
  const say = qmlFunction(main, 'sayNotice')
  // A bot's name as the title: whole text, line breaks kept, no name line,
  // in that bot's conversation even when another is on screen.
  assert.match(say, /var bot = root\.matchBot\(who\)\n\s*if \(bot\) \{/)
  assert.match(say, /var words = root\.cleanText\(text, 4000\)/)
  assert.match(say, /if \(bot\.id !== root\.threadBotId\) \{\n\s*root\.appendReply\(bot\.id, words, links\)/)
  assert.match(say, /root\.bubbleBody = words\n/)
  // Any other title stays a one-line notice with the title above it.
  assert.match(say, /root\.bubbleBody = \(who !== "" \? who \+ "\\n" : ""\) \+ body/)
})

test('a webhook answer waits under its question and lands there, whichever bot is on screen', () => {
  // Every ask carries an id; a routine that only acknowledges it leaves the
  // question waiting rather than ending the ask with a placeholder.
  assert.match(qmlFunction(main, 'launchAsk'), /root\.pendingAskId = root\.newAskId\(\)\n\s*root\.pendingJson = JSON\.stringify\(\{\n\s*askId: root\.pendingAskId,/)
  assert.match(main, /if \(code === 10\) \{\n\s*root\.startWaiting\(root\.pendingAskId, root\.askBotId\)\n\s*return\n\s*\}/)
  // The answer finds its question by id: the latest on screen, an earlier
  // one in the history, or one put away with another bot, which gets a dot.
  const answer = qmlFunction(main, 'answerWaiting')
  assert.match(answer, /if \(root\.awaitingId === askId\) \{\n\s*root\.bubbleBody = text\n\s*root\.awaitingId = ""/)
  assert.match(answer, /root\.indexWaiting\(root\.history, askId\)/)
  assert.match(answer, /if \(thread\.wait === askId\) \{/)
  assert.match(answer, /root\.markUnread\(botId\)/)
  // With the bubble closed, the mark shows the dot too, not just a hop.
  assert.match(qmlFunction(main, 'markUnread'), /if \(!root\.bubbleOpen\) root\.replyUnread = true/)
  assert.match(qmlFunction(main, 'deliver'), /root\.markUnread\(id\)/)
  // reply takes an ask id or a bot; say from a waiting bot counts too.
  assert.match(main, /function reply\(target: string, text: string\): string \{ return root\.receiveReply\(target, text\) \}/)
  const receive = qmlFunction(main, 'receiveReply')
  assert.match(receive, /if \(root\.awaiting\[key\]\)/)
  assert.match(receive, /root\.oldestWaiting\(bot\.id\)/)
  assert.match(qmlFunction(main, 'sayNotice'), /var waiting = \(links \|\| \[\]\)\.length === 0 \? root\.oldestWaiting\(bot\.id\) : ""/)
  // A question waits ten minutes at most.
  assert.match(main, /readonly property int replyWaitMs: 600000/)
  assert.match(qmlFunction(main, 'expireWaiting'), /"'s reply will be in Grok Bot\."/)
  // Earlier exchanges still waiting show the dots too.
  assert.match(read('BubblePanel.qml'), /typing: \(modelData\.wait \|\| ""\) !== "" && \(modelData\.body \|\| ""\) === ""/)
})

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex')

function runtimeDir() {
  const dir = `/run/user/${process.getuid()}`
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    return dir
  } catch {
    return ''
  }
}

test('grokbot-attach keeps private copies of chosen files and pasted images', (t) => {
  const runtime = runtimeDir()
  if (!runtime) return t.skip('no /run/user directory here')
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-attach-'))
  const env = { PATH: '/usr/bin:/bin', XDG_RUNTIME_DIR: runtime }
  const attach = (...args) => spawnSync('/usr/bin/python3', ['-I', path.join(root, 'bin/grokbot-attach'), ...args], { encoding: 'utf8', env })
  const png = path.join(work, 'shot.png')
  fs.writeFileSync(png, PNG)
  const notes = path.join(work, 'meeting notes (draft).pdf')
  fs.writeFileSync(notes, '%PDF-1.7 not much of a pdf')
  // Several files at once, images or not; each keeps its name after a unique prefix.
  const ok = attach('file', `file://${png}`, notes)
  assert.equal(ok.status, 0, ok.stderr)
  const saved = ok.stdout.trim().split('\n')
  assert.equal(saved.length, 2)
  const base = `${runtime}/grokbot-desktop/attachments/`
  assert.match(saved[0], new RegExp(`^${base}\\d{8}-\\d{6}-[0-9a-f]{8}-shot\\.png$`))
  assert.match(saved[1], new RegExp(`^${base}\\d{8}-\\d{6}-[0-9a-f]{8}-meeting-notes-draft-\\.pdf$`))
  assert.deepEqual(fs.readFileSync(saved[0]), PNG)
  for (const file of saved) assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  assert.equal(fs.statSync(base).mode & 0o777, 0o700)
  // A link, a directory, or anything over 25 MB is refused with its name.
  fs.symlinkSync(png, path.join(work, 'link.png'))
  assert.match(attach('file', path.join(work, 'link.png')).stderr, /link\.png is not a regular file/)
  assert.match(attach('file', work).stderr, /is not a regular file/)
  fs.writeFileSync(path.join(work, 'huge.bin'), Buffer.alloc(26 * 1024 * 1024))
  assert.match(attach('file', path.join(work, 'huge.bin')).stderr, /huge\.bin is larger than 25 MB/)
  // The screenshot command is gone; the chooser and paste remain.
  assert.equal(attach('screenshot').status, 2)
  assert.equal(attach('bogus').status, 2)
  for (const file of saved) fs.unlinkSync(file)
})

test('attachments reach the agent in their own directory, and never the webhook', (t) => {
  const runtime = runtimeDir()
  if (!runtime) return t.skip('no /run/user directory here')
  const dir = path.join(runtime, 'grokbot-desktop', 'attachments')
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const image = path.join(dir, '20261029-101500-abcd0001-shot.png')
  const doc = path.join(dir, '20261029-101500-abcd0002-notes.pdf')
  fs.writeFileSync(image, PNG, { mode: 0o600 })
  fs.writeFileSync(doc, '%PDF-1.7', { mode: 0o600 })
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-img-'))
  const config = path.join(home, '.config', 'omarchy')
  fs.mkdirSync(config, { recursive: true })
  const env = { PATH: '/usr/bin:/bin', HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), XDG_RUNTIME_DIR: runtime }
  const ask = (attachments) => runPython('bin/grokbot-ask', [], {
    input: JSON.stringify({ botId: 'e0195a7d-f804-4688-9191-e2cf3574a6d1', botName: 'Bob', prompt: 'what is this?', attachments }),
    env
  })
  fs.writeFileSync(path.join(config, 'grokbot-desktop.json'), JSON.stringify({
    dispatch: 'agent',
    command: ['/usr/bin/python3', '-c', 'import os,sys; print(os.getcwd()); print(sys.stdin.read())']
  }))
  const seen = ask([image, doc])
  assert.equal(seen.status, 0, seen.stderr)
  assert.equal(seen.stdout.split('\n')[0], dir)
  assert.match(seen.stdout, /The attached files are in the current directory: 20261029-101500-abcd0001-shot\.png, 20261029-101500-abcd0002-notes\.pdf/)
  // Paths outside the attachment directory, or not named as saved, are refused.
  assert.equal(ask(['/etc/passwd']).status, 2)
  assert.equal(ask([path.join(dir, '..', 'attachments', 'x')]).status, 2)
  // Codex gets --image for the image only.
  const bin = path.join(home, '.local', 'bin')
  fs.mkdirSync(bin, { recursive: true, mode: 0o755 })
  fs.writeFileSync(path.join(bin, 'codex'), '#!/usr/bin/python3\nimport json,sys\nprint(json.dumps(sys.argv[1:]))\n', { mode: 0o755 })
  fs.writeFileSync(path.join(config, 'grokbot-desktop.json'), JSON.stringify({ dispatch: 'agent', agent: 'codex' }))
  const codex = ask([image, doc])
  assert.equal(codex.status, 0, codex.stderr)
  assert.deepEqual(JSON.parse(codex.stdout), ['exec', '--skip-git-repo-check', '--image', image])
  // The webhook refuses attachments rather than mangling them into the prompt.
  fs.writeFileSync(path.join(config, 'grokbot-desktop.json'), JSON.stringify({ dispatch: 'webhook', webhookUrl: 'https://example.invalid/hook' }))
  const hook = ask([doc])
  assert.equal(hook.status, 2)
  assert.match(hook.stderr, /attachments can't be sent through the webhook yet/)
  for (const file of [image, doc]) fs.unlinkSync(file)
})

test('the composer attaches pasted images, chosen files, and dropped files', () => {
  const panel = read('BubblePanel.qml')
  assert.match(panel, /id: attachButton/)
  assert.match(panel, /\{ label: "Paste image", mode: "paste" \},\s*\{ label: "Choose a file…", mode: "choose" \}/)
  assert.doesNotMatch(panel + main, /screenshot/i)
  assert.match(panel, /if \(app\.attach\("paste", "quiet"\) !== "ok"\) promptField\.paste\(\)/)
  assert.match(main, /if \(root\.attachQuiet && bubblePanel\) bubblePanel\.pasteText\(\)\n\s*else root\.attachNote = "There's no image on the clipboard\."/)
  // Omarchy's own portal chooser picks the files; the card steps aside meanwhile.
  assert.match(main, /exec omarchy-file-select --title 'Attach to your question' --multiple/)
  assert.match(main, /code === 127\) root\.attachNote = "Choosing files needs omarchy-file-select, from a newer Omarchy\."/)
  assert.match(main, /readonly property bool shown: root\.bubbleOpen && !root\.choosingFiles/)
  // Any dropped file; images as thumbnails, others as named chips.
  assert.match(panel, /if \(url\.indexOf\("file:\/\/\/"\) === 0\) paths\.push/)
  assert.match(panel, /component Attachment: Rectangle/)
  assert.match(panel, /text: app \? app\.fileLabel\(thumb\.source\) : ""/)
  assert.doesNotMatch(panel, /MultiEffect/)
  assert.match(main, /attachments: root\.askedFiles/)
  assert.match(qmlFunction(main, 'submitPrompt'), /if \(prompt === "" && root\.pendingFiles\.length > 0\) prompt = "Have a look at this\."/)
  // The helper's output is trusted only as paths in its own directory.
  assert.match(main, /\\\/run\\\/user\\\/\\d\+\\\/grokbot-desktop\\\/attachments\\\//)
})

test('the companion steps aside while Omarchy\'s screensaver runs', () => {
  assert.match(main, /readonly property string screensaverName: "org\.omarchy\.screensaver"/)
  const handle = qmlFunction(main, 'screensaverEvent')
  // The terminal-window screensaver (class) and the native overlay (namespace).
  assert.match(handle, /name === "openwindow"[\s\S]*parts\[2\] === root\.screensaverName/)
  assert.match(handle, /name === "closewindow"/)
  assert.match(handle, /name === "openlayer" && data === root\.screensaverName/)
  assert.match(handle, /name === "closelayer" && data === root\.screensaverName/)
  assert.match(main, /visible: root\.present && root\.targetScreen !== null && root\.layerRuleTried && !root\.screensaverUp/)
  // A missed close event is caught by a periodic check while hidden.
  assert.match(main, /running: root\.screensaverUp\n\s*onTriggered: if \(!screensaverCheck\.running\) screensaverCheck\.running = true/)
  assert.match(main, /"\/usr\/bin\/hyprctl -j clients; echo; \/usr\/bin\/hyprctl -j layers"/)
})

test('the chat and appearance pages crossfade, pinned to the edge the card grows from', () => {
  const panel = read('BubblePanel.qml')
  // One curve and duration for the page change and the card's height.
  assert.match(panel, /readonly property int pageMs: 260/)
  assert.match(panel, /Behavior on pageT \{ NumberAnimation \{ duration: bubble\.ms\(bubble\.pageMs\); easing\.type: Easing\.BezierSpline; easing\.bezierCurve: bubble\.pageCurve \} \}/)
  assert.match(panel, /implicitHeight: chatHeight \+ \(appearanceHeight - chatHeight\) \* pageT/)
  // The page leaving fades out before the one arriving fades in; a short drift, not a full slide.
  assert.match(panel, /opacity: Math\.max\(0, 1 - bubble\.pageT \/ 0\.65\)/)
  assert.match(panel, /opacity: Math\.max\(0, \(bubble\.pageT - 0\.35\) \/ 0\.65\)/)
  assert.match(panel, /x: 16 - 24 \* bubble\.pageT/)
  assert.match(panel, /x: 16 \+ 24 \* \(1 - bubble\.pageT\)/)
  // Each page is placed by its own height, never by the other page's.
  assert.match(panel, /y: bubble\.pageY\(implicitHeight\)/)
  assert.match(panel, /y: bubble\.pageY\(height\)/)
  assert.doesNotMatch(panel, /growOffset/)
})
