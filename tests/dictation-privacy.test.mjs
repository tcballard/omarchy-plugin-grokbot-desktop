import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { root } from '../scripts/template.mjs'

const target = 'io.github.tcballard.grokbot-desktop'
const sentinel = 'PRIVATE-DICTATION-83bb09'
const transcript = `Hey OmaBot, ${sentinel} café 日本語 🦉\nsecond line`
const normalized = transcript.replace(/\s+/g, ' ')

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-ipc-'))
  const runtime = path.join(dir, 'run')
  const omarchy = path.join(dir, 'omarchy')
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(runtime, { mode: 0o700 })
  fs.mkdirSync(path.join(omarchy, 'shell'), { recursive: true })
  fs.writeFileSync(path.join(omarchy, 'shell/shell.qml'), '// test config')
  fs.mkdirSync(bin)
  const log = path.join(dir, 'processes.jsonl')
  // If an unsafe fallback runs, record its real argv/env as well as stdin.
  const spy = `#!/usr/bin/python3
import json, os, sys
from pathlib import Path
record = {"argv": sys.argv, "cmdline": Path("/proc/self/cmdline").read_bytes().decode(),
          "environ": Path("/proc/self/environ").read_bytes().decode(), "stdin": sys.stdin.read()}
with open(os.environ["PROCESS_LOG"], "a") as out:
    out.write(json.dumps(record) + "\\n")
`
  for (const name of ['omarchy-shell', 'qs', 'wtype']) {
    fs.writeFileSync(path.join(bin, name), spy, { mode: 0o755 })
  }
  const env = {
    ...process.env, PATH: bin, XDG_RUNTIME_DIR: runtime, OMARCHY_PATH: omarchy,
    WAYLAND_DISPLAY: 'wayland-1', PROCESS_LOG: log,
    GROKBOT_WTYPE: path.join(bin, 'wtype'), GROKBOT_DICTATE_SINK: '',
    GROKBOT_BOTS: path.join(root, 'data/bots.json')
  }
  const servers = []
  const connections = new Set()
  async function listen(file, handler = () => {}) {
    const server = net.createServer(socket => {
      connections.add(socket)
      socket.on('error', () => {})
      socket.on('close', () => connections.delete(socket))
      handler(socket)
    })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(file, resolve)
    })
    servers.push(server)
    return server
  }
  await listen(path.join(runtime, env.WAYLAND_DISPLAY))
  t.after(async () => {
    for (const socket of connections) socket.destroy()
    await Promise.all(servers.filter(s => s.listening).map(s => new Promise(resolve => s.close(resolve))))
    fs.rmSync(dir, { recursive: true, force: true })
  })
  function socketPath(display = env.WAYLAND_DISPLAY) {
    const id = crypto.createHash('md5').update(`${omarchy}/shell\n${display}`).digest('hex').slice(0, 16)
    return path.join(runtime, `omarchy-shell-${id}.sock`)
  }
  let child
  const requests = []
  const observed = []
  // Hold the reply until /proc has captured both the router and its ctl child.
  async function serve(reply = Buffer.from('OK\x1fok\x1e'), display) {
    return listen(socketPath(display), socket => {
      let request = Buffer.alloc(0)
      socket.on('data', chunk => {
        request = Buffer.concat([request, chunk])
        if (!request.includes(0x1e)) return
        requests.push(request.toString('utf8'))
        const inspect = pid => {
          const base = `/proc/${pid}`
          observed.push({
            cmdline: fs.readFileSync(`${base}/cmdline`, 'utf8'),
            environ: fs.readFileSync(`${base}/environ`, 'utf8')
          })
          const children = fs.readFileSync(`${base}/task/${pid}/children`, 'utf8').trim()
          for (const id of children.split(/\s+/).filter(Boolean)) inspect(id)
        }
        inspect(child.pid)
        if (typeof reply === 'function') reply(socket)
        else socket.end(reply)
      })
    })
  }
  async function run(script, args = [], input = transcript, extraEnv = {}) {
    child = spawn('/usr/bin/python3', [path.join(root, 'bin', script), ...args], {
      env: { ...env, ...extraEnv }, stdio: ['pipe', 'pipe', 'pipe']
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), 8000)
    let stdout = '', stderr = ''
    child.stdout.on('data', b => { stdout += b })
    child.stderr.on('data', b => { stderr += b })
    child.stdin.on('error', () => {})
    child.stdin.end(input)
    const status = await new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('close', resolve)
    })
    clearTimeout(timer)
    return { status, stdout, stderr }
  }
  const calls = () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : []
  return { dir, runtime, env, requests, observed, socketPath, listen, serve, run, calls }
}

function privateProcesses(observed) {
  assert.ok(observed.length > 0, 'inspect real running processes')
  for (const p of observed) {
    assert.ok(!p.cmdline.includes(sentinel), 'private text leaked in /proc cmdline')
    assert.ok(!p.environ.includes(sentinel), 'private text leaked in /proc environ')
  }
}

test('wake filters, wtype routing and transcript watchers use private stdin/socket transport', async t => {
  const f = await fixture(t)
  await f.serve()
  const file = path.join(f.dir, 'transcript.txt')
  fs.writeFileSync(file, transcript, { mode: 0o600 })
  for (const backend of ['superwhisper', 'voxtype']) {
    for (const mode of ['--filter', '--wtype', '--check-file']) {
      const watcher = mode === '--check-file'
      const script = watcher ? 'grokbot-voice-watch' : 'grokbot-dictation-route'
      const args = watcher ? ['--enable', mode, file, '--backend', backend] : [mode, '--backend', backend]
      const result = await f.run(script, args)
      assert.equal(result.status, 0, result.stderr)
      // The diagnostic watcher prints its decision; output filters must print nothing.
      if (!watcher) assert.equal(result.stdout, '')
      assert.equal(f.requests.at(-1), `${target}\x1fdictate\x1f${normalized}\x1e`)
    }
  }
  assert.equal(f.requests.length, 6)
  assert.equal(f.observed.length, 12, 'inspect each parent and ctl child while both are running')
  assert.ok(f.observed.some(p => p.cmdline.endsWith('grokbot-desktop-ctl\0dictate\0')))
  privateProcesses(f.observed)
  assert.deepEqual(f.calls(), [], 'no omarchy-shell, qs, or wtype process for matched dictation')
})

test('stdin ctl preserves Unicode, line breaks and its 4000-character limit', async t => {
  const f = await fixture(t)
  await f.serve(socket => {
    socket.write('OK\x1f')
    setImmediate(() => socket.end('opened\x1e'))
  })
  for (const input of [transcript, `${transcript}${'é'.repeat(4000)}`]) {
    const result = await f.run('grokbot-desktop-ctl', ['dictate'], input)
    assert.equal(result.status, 0, result.stderr)
    // Python slices Unicode code points, not UTF-8 bytes or JS UTF-16 units.
    assert.equal(f.requests.at(-1), `${target}\x1fdictate\x1f${[...input].slice(0, 4000).join('')}\x1e`)
    assert.equal(result.stdout, '')
  }
  privateProcesses(f.observed)
  assert.deepEqual(f.calls(), [])
})

test('ctl rejects argument text and protocol delimiters without echoing or forwarding them', async t => {
  const f = await fixture(t)
  await f.serve()
  for (const [args, input] of [
    [['dictate', sentinel], ''],
    ...['\x00', '\x1e', '\x1f'].map(c => [['dictate'], transcript + c + 'injected'])
  ]) {
    const result = await f.run('grokbot-desktop-ctl', args, input)
    assert.equal(result.status, 2, result.stderr)
    assert.ok(!(result.stdout + result.stderr).includes(sentinel))
  }
  assert.deepEqual(f.requests, [])
  assert.deepEqual(f.calls(), [])
})

test('missing and stale sockets, unsafe runtime directories and missing config fail closed', async t => {
  const f = await fixture(t)
  const cases = [{}, { XDG_RUNTIME_DIR: path.join(f.dir, 'missing') }, { OMARCHY_PATH: '' }]
  for (const env of cases) {
    const result = await f.run('grokbot-desktop-ctl', ['dictate'], transcript, env)
    assert.equal(result.status, 1, result.stderr)
    assert.ok(!(result.stdout + result.stderr).includes(sentinel))
  }
  // A filesystem socket inode without a listener is a stale session socket.
  const stale = await f.listen(f.socketPath())
  fs.renameSync(f.socketPath(), f.socketPath() + '.stale')
  await new Promise(resolve => stale.close(resolve))
  fs.renameSync(f.socketPath() + '.stale', f.socketPath())
  assert.equal((await f.run('grokbot-desktop-ctl', ['dictate'])).status, 1)
  fs.unlinkSync(f.socketPath())
  await f.serve()
  fs.chmodSync(f.runtime, 0o755)
  assert.equal((await f.run('grokbot-desktop-ctl', ['dictate'])).status, 1)
  fs.chmodSync(f.runtime, 0o700)
  assert.deepEqual(f.requests, [], 'do not send into a directory other accounts can access')
  assert.deepEqual(f.calls(), [], 'never fall back to a command-line IPC client')
})

test('SKIP, refused, truncated, oversized and timed-out replies never retry or echo private data', async t => {
  for (const reply of [
    'SKIP\x1e', 'OK\x1fbusy\x1e', 'OK\x1fignored\x1e', 'OK\x1f', '',
    `BAD${sentinel}\x1e`, 'x'.repeat(5000), () => {}
  ]) {
    await t.test(typeof reply === 'function' ? 'timeout' : JSON.stringify(reply.slice(0, 30)), async t => {
      const f = await fixture(t)
      await f.serve(typeof reply === 'function' ? reply : Buffer.from(reply))
      const started = Date.now()
      const result = await f.run('grokbot-desktop-ctl', ['dictate'])
      assert.equal(result.status, 1, result.stderr)
      assert.ok(Date.now() - started < 5000, 'finish inside the Voxtype hook timeout')
      assert.equal(f.requests.length, 1, 'no retry after sending a request')
      assert.ok(!(result.stdout + result.stderr).includes(sentinel))
      privateProcesses(f.observed)
      assert.deepEqual(f.calls(), [])
    })
  }
})

test('display selection matches Omarchy for missing, stale and absolute WAYLAND_DISPLAY', async t => {
  const f = await fixture(t)
  await f.serve()
  // A newer lock file must not be selected instead of the compositor socket.
  fs.writeFileSync(path.join(f.runtime, 'wayland-99.lock'), '')
  for (const display of ['', 'wayland-absent']) {
    assert.equal((await f.run('grokbot-desktop-ctl', ['dictate'], transcript, { WAYLAND_DISPLAY: display })).status, 0)
  }
  const absolute = path.join(f.runtime, 'wayland-1')
  await f.serve(Buffer.from('OK\x1fok\x1e'), absolute)
  assert.equal((await f.run('grokbot-desktop-ctl', ['dictate'], transcript, { WAYLAND_DISPLAY: absolute })).status, 0)
  assert.equal(f.requests.length, 3)
  privateProcesses(f.observed)
  assert.deepEqual(f.calls(), [])
})

test('unmatched text and failed routes retain their text; wtype only receives stdin', async t => {
  const f = await fixture(t)
  const plain = `-M ctrl ${sentinel}\nUnicode café 日本語 🦉`
  for (const input of [plain, transcript]) {
    const filtered = await f.run('grokbot-dictation-route', ['--filter'], input)
    assert.equal(filtered.status, 0, filtered.stderr)
    assert.equal(filtered.stdout, input)
    const typed = await f.run('grokbot-dictation-route', ['--wtype'], input)
    assert.equal(typed.status, 0, typed.stderr)
    const call = f.calls().at(-1)
    assert.equal(path.basename(call.argv[0]), 'wtype')
    assert.deepEqual(call.argv.slice(1), ['-'])
    assert.equal(call.stdin, input)
    privateProcesses([call])
  }
  assert.equal(f.calls().length, 2, 'no unsafe omarchy-shell or qs fallback')
})

test('non-dictation control commands keep their existing interface', async t => {
  const f = await fixture(t)
  const result = await f.run('grokbot-desktop-ctl', ['summon'], '')
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(f.calls()[0].argv.slice(1), [target, 'summon'])
})

test('the plugin registers its IPC handler with Omarchy socket dispatch', () => {
  const main = fs.readFileSync(path.join(root, 'Main.qml'), 'utf8')
  const shellIpc = fs.readFileSync(path.join(root, 'qml/CompanionShellIpc.qml'), 'utf8')
  const ipcHandler = fs.readFileSync(path.join(root, 'qml/CompanionIpcHandler.qml'), 'utf8')
  assert.match(main, /qml\/CompanionShellIpc\.qml/)
  assert.match(main, /qml\/CompanionIpcHandler\.qml/)
  assert.match(main, /loadIpcBridge\(/)
  assert.match(shellIpc, /ShellIpc\s*\{/)
  assert.match(shellIpc, /target:\s*"io\.github\.tcballard\.grokbot-desktop"/)
  assert.match(shellIpc, /function dictate\(text: string\): string \{ return host\.dictateText\(text\) \}/)
  assert.match(ipcHandler, /IpcHandler\s*\{/)
  assert.match(ipcHandler, /target:\s*"io\.github\.tcballard\.grokbot-desktop"/)
  assert.match(ipcHandler, /function dictate\(text: string\): string \{ return host\.dictateText\(text\) \}/)
})

test('asynchronous replies preserve private Unicode answers on the socket only', async t => {
  const f = await fixture(t)
  await f.serve()
  const result = await f.run('grokbot-desktop-ctl', ['reply', '0a1b2c3d4e5f'], transcript)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(f.requests[0], `${target}\x1freply\x1f0a1b2c3d4e5f\x1f${transcript}\x1e`)
  privateProcesses(f.observed)
  assert.deepEqual(f.calls(), [])
})

test('reply failures never fall back to arguments or echo the answer', async t => {
  const f = await fixture(t)
  for (const input of [transcript, `${sentinel}\x1e`, sentinel.repeat(500)]) {
    const result = await f.run('grokbot-desktop-ctl', ['reply', 'abc123'], input)
    assert.notEqual(result.status, 0)
    assert.ok(!`${result.stdout}${result.stderr}`.includes(sentinel))
  }
  const args = await f.run('grokbot-desktop-ctl', ['reply', 'abc123', sentinel])
  assert.equal(args.status, 2)
  assert.deepEqual(f.calls(), [])
})
