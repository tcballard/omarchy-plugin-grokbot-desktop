import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
function library(file) {
  const context = vm.createContext({});
  vm.runInContext(read(file).replace(/^\.pragma library\s*/, ''), context);
  return context;
}
const Pointer = library('qml/pointer.js');
const Dictation = library('qml/dictation.js');
const main = read('Main.qml');

function method(name) {
  const start = main.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, `missing function ${name}`);
  let depth = 1, end = main.indexOf('{', start) + 1;
  for (; depth && end < main.length; end++) {
    if (main[end] === '{') depth++;
    else if (main[end] === '}') depth--;
  }
  return main.slice(start, end);
}
// Runs Main.qml functions against a plain root object and the given ids.
function harness(names, root, ids = {}) {
  const context = vm.createContext({root, Pointer, Dictation, ...ids});
  vm.runInContext(names.map(method).join('\n'), context);
  for (const n of names) root[n] = context[n];
  return root;
}

test('window addresses match whether or not they carry 0x', () => {
  assert.equal(Pointer.windowAddress('0x55D1C0A2B3F0'), '55d1c0a2b3f0');
  assert.equal(Pointer.windowAddress('55d1c0a2b3f0'), '55d1c0a2b3f0');
  assert.equal(Pointer.windowAddress(' 0xabc '), 'abc');
  for (const bad of ['', '0x', 'zz', null, undefined, '0x12,3']) assert.equal(Pointer.windowAddress(bad), '');
});

test('a window listed by hyprctl closes at once from a socket event', () => {
  const root = harness(['hyprWindowEvent', 'applyGrokAppClients'], {
    screensaverName: 'org.omarchy.screensaver', grokAppClass: 'grok-bot',
    screensaverWindows: [], screensaverLayers: 0, grokAppWindows: []
  });
  root.applyGrokAppClients(JSON.stringify([
    {address: '0x5a1', class: 'grok-bot'}, {address: '0x5a2', class: 'kitty'}, {address: '0x5A1', class: 'grok-bot'}
  ]) + '\n\n[]');
  assert.deepEqual([...root.grokAppWindows], ['5a1']);
  root.hyprWindowEvent('openwindow', '5a1,1,grok-bot,Grok');
  assert.deepEqual([...root.grokAppWindows], ['5a1']);
  root.hyprWindowEvent('closewindow', '5a1');
  assert.deepEqual([...root.grokAppWindows], []);
  root.hyprWindowEvent('openwindow', '7b2,1,org.omarchy.screensaver,saver');
  assert.deepEqual([...root.screensaverWindows], ['7b2']);
  root.hyprWindowEvent('closewindow', '0x7b2');
  assert.deepEqual([...root.screensaverWindows], []);
  root.hyprWindowEvent('openwindow', 'not-an-address,1,grok-bot,Grok');
  assert.deepEqual([...root.grokAppWindows], []);
});

test('touchpad deltas add up to one bot per notch', () => {
  let state = Pointer.wheelStart(), steps = 0, t = 1000;
  for (let i = 0; i < 12; i++) {
    const r = Pointer.wheelStep(state, 10, t += 8);
    state = r.state; steps += r.steps;
  }
  assert.equal(steps, -1, '120 units up steps back once');
  // A mouse notch is one step, down moves forward.
  assert.equal(Pointer.wheelStep(Pointer.wheelStart(), -120, 5000).steps, 1);
  assert.equal(Pointer.wheelStep(Pointer.wheelStart(), 240, 5000).steps, -2);
  // A partial swipe, then a change of direction, starts again.
  let r = Pointer.wheelStep(Pointer.wheelStart(), 100, 0);
  r = Pointer.wheelStep(r.state, -30, 10);
  assert.equal(r.steps, 0);
  assert.equal(r.state.acc, -30);
  // A pause forgets what was left over.
  r = Pointer.wheelStep(Pointer.wheelStart(), 100, 0);
  r = Pointer.wheelStep(r.state, 30, 1000);
  assert.equal(r.steps, 0);
  assert.equal(r.state.acc, 30);
  assert.equal(Pointer.wheelStep(r.state, 0, 1001).steps, 0);
});

test('a cancelled press ends the drag unless the helper can see the button held', () => {
  assert.equal(Pointer.cancelEndsDrag(true, true), false);
  assert.equal(Pointer.cancelEndsDrag(false, true), true);
  assert.equal(Pointer.cancelEndsDrag(true, false), true);
  assert.equal(Pointer.cancelEndsDrag(true, undefined), true);
  assert.equal(Pointer.buttonsReport('buttons 1'), true);
  assert.equal(Pointer.buttonsReport('buttons 0\n'), false);
  assert.equal(Pointer.buttonsReport('down'), true);
  assert.equal(Pointer.buttonsReport('12 34'), null);
});

test('cursorLine records whether the helper sees buttons', () => {
  let ended = 0;
  const root = harness(['cursorLine'], {
    cursorSeesButtons: false, pointerHeld: false, dragging: true, dragDetached: true,
    endDrag() { ended++; }
  });
  root.cursorLine('buttons 1');
  assert.equal(root.cursorSeesButtons, true);
  root.cursorLine('buttons 0');
  assert.equal(root.cursorSeesButtons, false);
  assert.equal(root.pointerHeld, false);
  root.cursorLine('down');
  assert.equal(root.cursorSeesButtons, true);
  assert.equal(root.pointerHeld, true);
  root.cursorLine('up');
  assert.equal(root.pointerHeld, false);
  assert.equal(ended, 1);
});

function submitHarness() {
  const launched = [];
  const askProc = {running: false};
  const timer = {restarts: 0, restart() { this.restarts++; }};
  const root = harness(['submitPrompt', 'retryQueuedPrompt', 'answerFromComposer'], {
    asking: false, pendingFiles: [], promptDraft: '', threadBotId: 'grok', queuedPrompt: null,
    bots: [], defaultBotId: 'grok',
    plainPrompt: (v, n) => String(v || '').trim().slice(0, n),
    selectBot() {}, openBubble() {},
    launchAsk(p) { launched.push(p); return 'ok'; }
  }, {askProc, queuedPromptTimer: timer});
  return {root, askProc, timer, launched};
}

test('a prompt sent while the stopped ask is still exiting is kept and sent after', () => {
  const {root, askProc, timer, launched} = submitHarness();
  askProc.running = true;
  root.promptDraft = 'second question';
  root.submitPrompt('second question');
  assert.equal(root.promptDraft, 'second question', 'draft is not cleared');
  assert.deepEqual(launched, []);
  assert.equal(timer.restarts, 1);
  assert.equal(root.retryQueuedPrompt(), 'waiting');
  askProc.running = false;
  assert.equal(root.retryQueuedPrompt(), 'sent');
  assert.deepEqual(launched, ['second question']);
  assert.equal(root.promptDraft, '');
  assert.equal(root.queuedPrompt, null);
  assert.equal(root.retryQueuedPrompt(), 'none');
});

test('a queued prompt is dropped if the draft or bot changed, and gives up eventually', () => {
  let h = submitHarness();
  h.askProc.running = true;
  h.root.promptDraft = 'one';
  h.root.submitPrompt('one');
  h.root.threadBotId = 'other';
  h.askProc.running = false;
  assert.equal(h.root.retryQueuedPrompt(), 'dropped');
  assert.deepEqual(h.launched, []);

  h = submitHarness();
  h.askProc.running = true;
  h.root.promptDraft = 'one';
  h.root.submitPrompt('one');
  h.root.promptDraft = 'one more';
  h.askProc.running = false;
  assert.equal(h.root.retryQueuedPrompt(), 'dropped');
  assert.equal(h.root.promptDraft, 'one more');

  h = submitHarness();
  h.askProc.running = true;
  h.root.promptDraft = 'one';
  h.root.submitPrompt('one');
  h.root.queuedPrompt.since -= 6000;
  assert.equal(h.root.retryQueuedPrompt(), 'gave up');
  assert.equal(h.root.promptDraft, 'one', 'the draft stays for a manual resend');
});

test('the appearance IPC picks like the appearance page does', () => {
  const calls = [];
  const root = harness(['setAppearance'], {
    selectShape(n) { calls.push(['shape', n]); return 'ok'; },
    selectColor(n) { calls.push(['color', n]); return 'ok'; }
  }, {
    Shapes: {known: n => n === 'circle'},
    Palette: {accepts: n => n === 'blue'}
  });
  assert.equal(root.setAppearance('square', 'blue'), 'unknown shape');
  assert.equal(root.setAppearance('circle', 'mauve'), 'unknown color');
  assert.deepEqual(calls, [], 'nothing changes unless both are valid');
  assert.equal(root.setAppearance('circle', 'blue'), 'ok');
  assert.deepEqual(calls, [['color', 'blue'], ['shape', 'circle']]);
  for (const file of ['qml/CompanionShellIpc.qml', 'qml/CompanionIpcHandler.qml'])
    assert.match(read(file), /function appearance\(shape: string, color: string\): string \{\s*return host\.setAppearance\(shape, color\)/);
});
