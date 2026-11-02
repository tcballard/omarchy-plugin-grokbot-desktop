import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { root } from '../scripts/template.mjs'

// Agent mode with a stand-in command; HOME is a throwaway directory.
function agentHome(command, extra = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-stop-'))
  const config = path.join(home, '.config', 'omarchy')
  fs.mkdirSync(config, { recursive: true })
  fs.writeFileSync(path.join(config, 'grokbot-desktop.json'), JSON.stringify({ dispatch: 'agent', command, ...extra }))
  return home
}
const envFor = (home) => ({ PATH: '/usr/bin:/bin', HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') })
const PAYLOAD = JSON.stringify({ botId: 'e0195a7d-f804-4688-9191-e2cf3574a6d1', botName: 'Bob', prompt: 'hi' })

test('stopping an ask ends the agent instead of orphaning it', async () => {
  const script = 'import os,sys,time; sys.stdin.read(); open(os.environ["HOME"]+"/agent.pid","w").write(str(os.getpid())); time.sleep(60)'
  const home = agentHome(['/usr/bin/python3', '-c', script])
  const child = spawn('python3', [path.join(root, 'bin/grokbot-ask')], { env: envFor(home) })
  child.stdin.end(PAYLOAD)
  const pidFile = path.join(home, 'agent.pid')
  for (let i = 0; i < 100 && !fs.existsSync(pidFile); i++) await new Promise((r) => setTimeout(r, 50))
  const pid = Number(fs.readFileSync(pidFile, 'utf8'))
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)))
  child.kill('SIGTERM')
  assert.equal(await exited, 143)
  await new Promise((r) => setTimeout(r, 300))
  assert.throws(() => process.kill(pid, 0), /ESRCH/, 'the agent process must be gone')
})

test('askTimeoutSeconds sets how long an agent may take, clamped to 30-1800 s', () => {
  const home = agentHome(['/usr/bin/python3', '-c', 'import sys,time; sys.stdin.read(); time.sleep(60)'], { askTimeoutSeconds: 1 })
  const started = Date.now()
  const result = spawnSync('python3', [path.join(root, 'bin/grokbot-ask')], { input: PAYLOAD, env: envFor(home), encoding: 'utf8', timeout: 45000 })
  assert.equal(result.status, 124)
  assert.match(result.stderr, /timed out/)
  const took = Date.now() - started
  assert.ok(took >= 29000 && took < 40000, `took ${took} ms: 1 s is clamped to the 30 s floor`)
})

test('the shell only backstops the helper\'s own limit', () => {
  const main = fs.readFileSync(path.join(root, 'Main.qml'), 'utf8')
  assert.match(main, /id: askTimeout\n(\s*\/\/[^\n]*\n)*\s*interval: 1830000/)
})
