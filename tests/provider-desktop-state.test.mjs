import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const main = fs.readFileSync(new URL('../Main.qml', import.meta.url), 'utf8')
function method(name) {
  const start = main.indexOf(`  function ${name}(`)
  assert.ok(start >= 0, name)
  return main.slice(start, main.indexOf('\n  }', start) + 4)
}
function harness(names, root, extra = {}) {
  const context = vm.createContext({ root, ...extra })
  vm.runInContext(names.map(method).join('\n'), context)
  for (const name of names) root[name] = context[name]
  return root
}
const plain = (value, limit) => String(value || '').slice(0, limit)

test('streaming updates either bot silently and announces only the completed reply', () => {
  const notices = [], unread = []
  const root = harness(['askLine', 'deliver'], {
    askStreaming: true, asking: true, askBotId: 'hermes:a', threadBotId: 'hermes:a',
    threads: {}, cleanText: plain, plainLine: plain,
    announceReply: (...args) => notices.push(args), markUnread: (id) => unread.push(id),
  })
  root.askLine(JSON.stringify({ ev: 'delta', text: 'First' }))
  assert.equal(root.bubbleBody, 'First')
  root.threadBotId = 'hermes:b'
  root.askLine(JSON.stringify({ ev: 'delta', text: 'First second' }))
  assert.equal(root.threads['hermes:a'].body, 'First second')
  assert.equal(notices.length, 0)
  assert.equal(unread.length, 0)
  root.askLine(JSON.stringify({ ev: 'final', text: '' }))
  assert.equal(root.askFinalReceived, true)
  root.deliver(root.askBotId, 'Complete')
  assert.equal(notices.length, 1)
  assert.equal(unread.length, 1)
})

function promptHarness() {
  const writes = []
  const askProc = { running: true, write: (line) => writes.push(JSON.parse(line)) }
  const root = harness(['showPrompt', 'sendAnswer', 'answerResult', 'dropPromptLinks',
    'linkAction', 'answerPrompt', 'answerFromComposer', 'retirePrompts', 'cancelAsk', 'askLine'], {
    threadBotId: 'hermes:a', askBotId: 'hermes:a', asking: true, askStreaming: true,
    history: [], threads: {}, noticeLinks: [], clarifyWaiting: {}, activePrompts: {}, pendingAnswers: {},
    pendingFiles: [], promptDraft: '', approvalLabels: { once: 'Allow once', deny: 'Deny' },
    findBot: (id) => ({ id }), cleanText: plain, plainLine: plain, flashExpression() {},
    appendReply() { throw new Error('Answer failure must retain the prompt') },
  }, { askProc, askTimeout: { stop() {} } })
  Object.defineProperty(root, 'clarifyHere', { get: () => root.clarifyWaiting[root.threadBotId] !== undefined })
  return { root, writes, askProc }
}
const approval = { bot: 'hermes:a', promptId: 'p1', kind: 'approval', text: 'Run command',
  command: 'echo hello', choices: ['once', 'deny'], answerable: true }

test('a rejected approval keeps its controls and can be retried after acknowledgement', () => {
  const { root, writes } = promptHarness()
  root.showPrompt(approval, true)
  root.linkAction(root.noticeLinks[0])
  root.linkAction(root.noticeLinks[0])
  assert.equal(writes.length, 1)
  assert.equal(root.noticeLinks.length, 2)
  root.answerResult({ promptId: 'p1', ok: false, text: 'Try again' })
  assert.equal(root.noticeLinks.length, 2)
  assert.equal(root.progressText, 'Try again')
  root.linkAction(root.noticeLinks[1])
  assert.equal(writes.length, 2)
  root.answerResult({ promptId: 'p1', ok: true })
  assert.equal(root.noticeLinks.length, 0)
  assert.equal(root.activePrompts.p1, undefined)
  assert.equal(root.sendAnswer('p1', 'once'), false)
})

test('free-text answers survive rejection and clear only on settlement', () => {
  const { root } = promptHarness()
  root.showPrompt({ ...approval, kind: 'clarify', command: '', choices: [] }, true)
  root.promptDraft = 'Blue'
  assert.equal(root.answerFromComposer('Blue'), true)
  assert.equal(root.promptDraft, 'Blue')
  root.answerResult({ promptId: 'p1', ok: false, text: 'Retry' })
  assert.equal(root.clarifyHere, true)
  assert.equal(root.promptDraft, 'Blue')
  root.answerFromComposer('Blue')
  root.askLine(JSON.stringify({ ev: 'settled', promptId: 'p1' }))
  assert.equal(root.clarifyHere, false)
  assert.equal(root.promptDraft, '')
})

test('cancellation retires both free-text questions and approval buttons across bot switches', () => {
  const { root, askProc } = promptHarness()
  root.showPrompt({ ...approval, kind: 'clarify', choices: [] }, true)
  root.showPrompt({ ...approval, promptId: 'p2' }, true)
  root.threads['hermes:a'] = { body: root.bubbleBody, links: root.noticeLinks, history: [] }
  root.noticeLinks = []
  root.threadBotId = 'hermes:b'
  root.cancelAsk()
  assert.equal(root.asking, false)
  assert.equal(askProc.running, false)
  assert.equal(Object.keys(root.clarifyWaiting).length, 0)
  assert.equal(Object.keys(root.activePrompts).length, 0)
  assert.equal(root.threads['hermes:a'].links.length, 0)
  assert.equal(root.sendAnswer('p2', 'once'), false)
})

test('approval commands containing both fence styles remain one literal code block', () => {
  const { root } = promptHarness()
  const command = 'echo start\n```\n~~~~\n**literal**\necho end'
  root.showPrompt({ ...approval, command }, true)
  const context = vm.createContext({})
  vm.runInContext(fs.readFileSync(new URL('../qml/markdown.js', import.meta.url), 'utf8').replace(/^\.pragma library\s*/, ''), context)
  const html = context.toHtml(root.bubbleBody)
  assert.equal((html.match(/<pre /g) || []).length, 1)
  assert.match(html, /\*\*literal\*\*/)
  assert.doesNotMatch(html, /<b>literal/)
})

test('failed history requests can retry without losing an older-page cursor', () => {
  let runs = 0
  const root = harness(['finishHistory', 'maybeLoadHistory', 'setOlder'], {
    historyBot: 'hermes:a', threadBotId: 'hermes:a', historyOlder: false,
    historyTried: { 'hermes:a': true }, history: [], askedText: '', bubbleBody: '', asking: false,
    olderInfo: { 'hermes:a': { key: 'page2', more: true, loading: true } },
    findBot: (id) => ({ id, provider: 'hermes' }), runHistory() { runs++; return true },
  }, { Qt: { callLater() { throw new Error('No immediate retry loop') } } })
  root.finishHistory(1, '')
  assert.equal(root.historyTried['hermes:a'], undefined)
  assert.equal(root.olderInfo['hermes:a'].key, 'page2')
  assert.equal(root.olderInfo['hermes:a'].more, true)
  assert.equal(root.olderInfo['hermes:a'].loading, false)
  root.maybeLoadHistory()
  assert.equal(runs, 1)
})

test('finishing a background history fetch starts the newly selected bot', () => {
  const queued = [], runs = []
  const root = harness(['finishHistory', 'maybeLoadHistory'], {
    historyBot: 'hermes:a', threadBotId: 'hermes:b', historyOlder: false,
    historyTried: { 'hermes:a': true }, history: [], askedText: '', bubbleBody: '', asking: false,
    findBot: (id) => ({ id, provider: 'hermes' }), runHistory(id) { runs.push(id); return true },
    applyHistory() {},
  }, { Qt: { callLater: (fn) => queued.push(fn) } })
  root.finishHistory(0, '{"items":[],"nextCursor":null}')
  queued.forEach((fn) => fn())
  assert.deepEqual(runs, ['hermes:b'])
})
