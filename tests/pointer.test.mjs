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

const panel = read('BubblePanel.qml');
function panelMethod(name) {
  const start = panel.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, `missing function ${name}`);
  let depth = 1, end = panel.indexOf('{', start) + 1;
  for (; depth && end < panel.length; end++) {
    if (panel[end] === '{') depth++;
    else if (panel[end] === '}') depth--;
  }
  return panel.slice(start, end);
}
// Runs BubblePanel.qml functions against stub fields. The chord helpers call
// through `bubble`, so the context keeps a handle on its own functions.
function panelHarness(names, ids = {}) {
  const context = vm.createContext({...ids, bubble: {}});
  vm.runInContext(names.map(panelMethod).join('\n'), context);
  for (const n of names) if (typeof context[n] === 'function') context.bubble[n] = context[n];
  return context;
}

test('window addresses match whether or not they carry 0x', () => {
  assert.equal(Pointer.windowAddress('0x55D1C0A2B3F0'), '55d1c0a2b3f0');
  assert.equal(Pointer.windowAddress('55d1c0a2b3f0'), '55d1c0a2b3f0');
  assert.equal(Pointer.windowAddress(' 0xabc '), 'abc');
  for (const bad of ['', '0x', 'zz', null, undefined, '0x12,3']) assert.equal(Pointer.windowAddress(bad), '');
});

test('a window listed by the Hyprland client snapshot closes at once from a socket event', () => {
  const root = harness(['hyprWindowEvent', 'applyGrokAppClients'], {
    screensaverName: 'org.omarchy.screensaver', grokAppClass: 'grok-bot',
    screensaverWindows: [], screensaverLayers: 0, grokAppWindows: []
  });
  root.applyGrokAppClients(JSON.stringify([
    {address: '0x5a1', class: 'grok-bot'}, {address: '0x5a2', class: 'kitty'}, {address: '0x5A1', class: 'grok-bot'}
  ]));
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

test('the ask field pastes on the chord and on the standard paste key', () => {
  const Qt = {Key_C: 67, Key_V: 86, Key_Insert: 0x2000006, AltModifier: 0x08000000, ControlModifier: 0x04000000, MetaModifier: 0x01000000, ShiftModifier: 0x02000000};
  const marker = panel.indexOf('if (promptField.selectedText !== "") promptField.copy()');
  assert.ok(marker >= 0, 'the ask field lost its copy line');
  const start = panel.lastIndexOf('Keys.onPressed: function (event) {', marker);
  assert.ok(start >= 0, 'the ask field lost its key handler');
  let depth = 1, end = panel.indexOf('{', panel.indexOf('function (event)', start)) + 1;
  for (; depth && end < panel.length; end++) {
    if (panel[end] === '{') depth++;
    else if (panel[end] === '}') depth--;
  }
  const body = panel.slice(panel.indexOf('{', panel.indexOf('function (event)', start)), end);
  assert.match(body, /bubble\.pasteIntoPrompt\(\)/, 'that handler is not the ask field one');
  const context = vm.createContext({Qt, StandardKey: {Paste: 'paste'}, bubble: {}});
  vm.runInContext('var pasteInto = 0, copied = 0;\n' +
    'bubble.isCopyChord = function (e) { return e.key === Qt.Key_C && !!(e.modifiers & (Qt.ControlModifier | Qt.MetaModifier)) && !(e.modifiers & Qt.AltModifier); };\n' +
    'bubble.isPasteChord = function (e) { return e.key === Qt.Key_V && !!(e.modifiers & (Qt.ControlModifier | Qt.MetaModifier)) && !(e.modifiers & Qt.AltModifier); };\n' +
    'bubble.pasteIntoPrompt = function () { pasteInto++; };\n' +
    'var promptField = {selectedText: "", copy: function () { copied++; }};\n' +
    'function handler(event) {' + body.replace(/^\{/, '').replace(/\}$/, '') + '}', context);
  // Qt matches StandardKey.Paste for Ctrl+V and for Shift+Insert.
  const fire = (key, modifiers, matchesPaste) => {
    const event = {key, modifiers, accepted: false, matches: () => matchesPaste};
    context.handler(event);
    return event;
  };
  let event = fire(Qt.Key_V, Qt.MetaModifier, false);
  assert.equal(event.accepted, true, 'Super+V pastes');
  assert.equal(context.pasteInto, 1);
  event = fire(Qt.Key_V, Qt.ControlModifier, true);
  assert.equal(event.accepted, true, 'Ctrl+V still pastes');
  assert.equal(context.pasteInto, 2);
  event = fire(Qt.Key_Insert, Qt.ShiftModifier, true);
  assert.equal(event.accepted, true, 'Shift+Insert still pastes');
  assert.equal(context.pasteInto, 3);
  event = fire(Qt.Key_C, Qt.ControlModifier, false);
  assert.equal(event.accepted, true, 'Ctrl+C copies a selection');
  assert.equal(context.pasteInto, 3, 'copy does not paste');
});

test('a history refresh re-reads the gateway only when the card can show it', () => {
  const started = [];
  const historyProc = {running: false};
  let startResult = true;
  const root = harness(['refreshHistory'], {
    daemonMode: false, present: true, asking: false, threadBotId: 'mr-x', historyRefresh: false,
    findBot: id => (id === 'mr-x' ? {id, provider: 'hermes'} : null),
    runHistory(botId, cursor) { started.push([botId, cursor]); return startResult; }
  }, {historyProc});
  root.refreshHistory();
  assert.deepEqual(started, [['mr-x', '']]);
  assert.equal(root.historyRefresh, true, 'the read is flagged so its finish folds instead of first-filling');

  // A read that never started must leave nothing flagged for the next finish.
  root.historyRefresh = false; startResult = false;
  root.refreshHistory();
  assert.equal(root.historyRefresh, false);

  // Daemon mode, an absent mark, an ask in flight, a reader already running and
  // a Grok bot with no gateway are each left alone.
  startResult = true;
  for (const off of [{daemonMode: true}, {present: false}, {asking: true}]) {
    Object.assign(root, {historyRefresh: false}, off);
    root.refreshHistory();
    assert.equal(root.historyRefresh, false, JSON.stringify(off));
    Object.assign(root, {daemonMode: false, present: true, asking: false});
  }
  historyProc.running = true;
  root.refreshHistory();
  assert.equal(root.historyRefresh, false);
  historyProc.running = false;
  root.threadBotId = 'plain';
  root.refreshHistory();
  assert.equal(root.historyRefresh, false, 'a bot with no provider has no gateway to read');
  assert.equal(started.length, 2, 'only the two good calls started a reader');
});

test('switching to another bot re-reads that bot from the gateway', () => {
  const deferred = [];
  let refreshed = 0;
  const root = harness(['selectBot'], {
    threadBotId: 'one', chosenBotId: 'one', clearedThread: {stale: true}, expression: 'idle', busyHere: false,
    recentBots: ['one'], switcherOpen: true, rosterExpanded: true,
    findBot: id => ({id}), stashThread() {}, loadThread() {}, retargetAppearance() {},
    scheduleSave() {}, hop() {}, botLabel: () => 'label', refreshHistory() { refreshed++; }
  }, {Qt: {callLater: fn => deferred.push(fn)}});
  assert.equal(root.selectBot('two'), 'label');
  assert.equal(deferred.length, 1, 'the refresh is deferred out of the switch');
  deferred[0]();
  assert.equal(refreshed, 1);

  // Staying on the same bot has nothing new to read. threadBotId is a binding
  // on chosenBotId in QML, so the harness moves it by hand.
  root.threadBotId = root.chosenBotId;
  deferred.length = 0; refreshed = 0;
  root.selectBot('two');
  assert.deepEqual(deferred, []);
  assert.equal(refreshed, 0);
});

test('a refresh page folds new gateway rows in without doubling the thread', () => {
  const Thread = library('qml/thread.js');
  const shown = [{key: 'a', asked: 'one', body: 'first'}];
  const fill = extra => harness(['applyRefresh'], Object.assign({
    threadBotId: 'mr-x', history: shown.slice(), askedText: '', askedFiles: [],
    bubbleBody: '', noticeLinks: [], asking: false, awaitingId: '', historyLimit: 200,
    threads: {}, historyEntries: items => items, rememberTail() {}
  }, extra), {Thread});

  // A row the Hermes app wrote shows up under what this card already had.
  const added = fill({});
  added.applyRefresh('mr-x', [{key: 'a', asked: 'one', body: 'first'}, {key: 'c', asked: 'three', body: 'from the app'}]);
  assert.deepEqual(added.history.map(row => row.key), ['a', 'c']);

  // The same page again is not news, and the thread keeps one row per turn.
  const same = fill({});
  same.applyRefresh('mr-x', [{key: 'a', asked: 'one', body: 'first'}, {key: 'c', asked: 'three', body: 'from the app'}]);
  same.applyRefresh('mr-x', [{key: 'a', asked: 'one', body: 'first'}, {key: 'c', asked: 'three', body: 'from the app'}]);
  assert.deepEqual(same.history.map(row => row.key), ['a', 'c']);

  // The reply this card is still showing on its own stays out of the list, so
  // the turn appears once.
  const live = fill({askedText: 'two', bubbleBody: 'second'});
  live.applyRefresh('mr-x', [{key: 'a', asked: 'one', body: 'first'}, {key: 'b', asked: 'two', body: 'second'}]);
  assert.deepEqual(live.history.map(row => row.key), ['a']);
  assert.equal(live.askedText, 'two');

  // A refresh for another bot lands in that bot's stashed thread, not this one.
  const away = fill({});
  away.applyRefresh('other-bot', [{key: 'z', asked: 'elsewhere', body: 'kept apart'}]);
  assert.deepEqual(away.history.map(row => row.key), ['a']);
  // Rows built inside the vm realm are compared by content, not by prototype.
  assert.equal((away.threads['other-bot'] || {}).history.map(row => row.key).join(','), 'z');
});

test('the card takes Ctrl or Super chords for copy and paste, and refuses Alt', () => {
  const Qt = {Key_C: 67, Key_V: 86, AltModifier: 0x08000000, ControlModifier: 0x04000000, MetaModifier: 0x01000000};
  const context = panelHarness(['chord', 'isCopyChord', 'isPasteChord'], {Qt});
  const mods = [Qt.ControlModifier, Qt.MetaModifier, Qt.ControlModifier | Qt.ShiftModifier];
  assert.equal(context.isCopyChord({key: Qt.Key_C, modifiers: Qt.ControlModifier}), true);
  assert.equal(context.isCopyChord({key: Qt.Key_C, modifiers: Qt.MetaModifier}), true);
  assert.equal(context.isCopyChord({key: Qt.Key_V, modifiers: Qt.ControlModifier}), false);
  assert.equal(context.isPasteChord({key: Qt.Key_V, modifiers: Qt.ControlModifier}), true);
  assert.equal(context.isPasteChord({key: Qt.Key_V, modifiers: Qt.MetaModifier}), true);
  for (const m of mods) assert.equal(context.isPasteChord({key: Qt.Key_V, modifiers: m}), true);
  // Alt+Ctrl+V and a bare letter stay with the window behind the card.
  assert.equal(context.isPasteChord({key: Qt.Key_V, modifiers: Qt.AltModifier | Qt.ControlModifier}), false);
  assert.equal(context.isPasteChord({key: Qt.Key_V, modifiers: 0}), false);
  assert.equal(context.isCopyChord({key: Qt.Key_C, modifiers: Qt.AltModifier}), false);
  assert.equal(context.chord(null, Qt.Key_C), false);
});

test('paste goes to the attachment path first and the plain-text read second', () => {
  const Qt = {Key_C: 67, Key_V: 86, AltModifier: 0, ControlModifier: 0, MetaModifier: 0};
  const run = attachResult => {
    const log = [];
    const context = panelHarness(['pasteIntoPrompt'], {
      Qt,
      promptField: {forceActiveFocus() { log.push('focus'); }, safePaste() { log.push('safePaste'); }},
      app: {attach() { log.push('attach'); return attachResult; }}
    });
    context.pasteIntoPrompt();
    return log;
  };
  assert.deepEqual(run('ok'), ['focus', 'attach'], 'an image on the clipboard becomes an attachment');
  assert.deepEqual(run('nothing'), ['focus', 'attach', 'safePaste'], 'plain text falls back to the safe read');
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

test('"load earlier" waits for a refresh in flight instead of misfiling its page', () => {
  const runs = [];
  const historyProc = {running: true};
  const info = {};
  const root = harness(['loadOlder', 'setOlder'], {
    threadBotId: 'h', history: [], olderCap: 100, historyRefresh: true, olderWanted: false,
    olderInfo: {h: {more: true, loading: false, key: 'cur1'}},
    runHistory(bot, cursor) { if (historyProc.running) return false; runs.push(cursor); historyProc.running = true; return true; }
  }, {historyProc, info});
  assert.equal(root.loadOlder(), 'ok');
  assert.equal(root.historyRefresh, true, 'the refresh in flight keeps its flag');
  assert.equal(root.olderWanted, true);
  assert.equal(root.olderInfo.h.loading, true);
  assert.deepEqual(runs, []);
  root.olderWanted = false;
  root.historyRefresh = false;
  root.olderInfo = {h: {more: true, loading: false, key: 'cur1'}};
  assert.equal(root.loadOlder(), 'busy');
  historyProc.running = false;
  assert.equal(root.loadOlder(), 'ok');
  assert.deepEqual(runs, ['cur1']);
});

test('the history poll leaves an ask in flight alone and slows while the card is closed', () => {
  assert.match(method('refreshHistory'), /root\.daemonMode \|\| !root\.present \|\| root\.asking \|\| historyProc\.running/);
  assert.match(main, /id: historyRefreshTimer\n(\s*\/\/.*\n)*\s*interval: root\.bubbleOpen \? 2000 : 30000/);
});
