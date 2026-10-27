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
  assert.deepEqual(ended.points[40], shapes.SHAPES.hex.points[40])
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
  for (const name of ['summon', 'show', 'hide', 'toggle', 'settings', 'ask', 'bot', 'appearance', 'animate', 'say', 'sayLink', 'sayLinks', 'dismiss']) {
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
      res.end(JSON.stringify({ reply: 'pong' }))
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

test('readme credits both companions and does not claim a live capture', () => {
  const readme = read('README.md')
  assert.match(readme, /<h1 align="center">Grok Bot Desktop Companion<\/h1>/)
  assert.equal((readme.match(/omarchy-plugin\.svg/g) || []).length, 1)
  assert.match(readme, /jankeesvw\/omarchy-clippy/)
  assert.match(readme, /rdoupe\/omarchy-clanky/)
  assert.match(readme, /tcballard\/build-omarchy-plugins/)
  assert.match(readme, /architectural preview/i)
  assert.doesNotMatch(readme, /\]\(preview\.png\)/)
  assert.equal(fs.existsSync(path.join(root, 'preview.png')), true)
  const bytes = fs.readFileSync(path.join(root, 'preview.png'))
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  const acceptance = readJSON(path.join(root, 'docs/ACCEPTANCE.json'))
  assert.notEqual(acceptance.status, 'passed')
  assert.match(JSON.stringify(acceptance), /architectural preview|not an on-device|No live Omarchy/i)
})
