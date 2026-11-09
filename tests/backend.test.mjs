// The daemon backend's QML side, driven against the real bin/agent-desktopd.
//
// qml/backend.js is loaded as a library. The daemon functions of Main.qml and
// the process logic of qml/Backend.qml are cut out of their files and run
// against plain objects that stand in for QML: a fake Process that really
// spawns the daemon with the command line and environment Backend.qml sets,
// accessors that run Main.qml's own change handlers, and stubs that record
// view calls (openBubble, cues, expressions). Quickshell itself is not here,
// so property bindings, the Loader and the IPC bridges are not exercised.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import readline from 'node:readline';
import {spawn} from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function library(file) {
  const context = vm.createContext({});
  vm.runInContext(read(file).replace(/^\.pragma library\s*/, ''), context);
  return context;
}
const Wire = library('qml/backend.js');
const Dictation = library('qml/dictation.js');
const main = read('Main.qml');
const backendQml = read('qml/Backend.qml');

// The text between the brace at `open` and its partner.
function braces(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error('unbalanced');
}
function method(source, name) {
  const start = source.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, `missing function ${name}`);
  const open = source.indexOf('{', start);
  return source.slice(start + 2, open) + '{' + braces(source, open) + '}';
}
// A one-line `onX: statement` handler of Main.qml.
function handler(source, name) {
  const match = new RegExp('^  ' + name + ': (.*)$', 'm').exec(source);
  assert.ok(match, `missing handler ${name}`);
  return match[1];
}
// A readonly binding: an expression on one line, or a { } block.
function binding(source, name) {
  const match = new RegExp('property \\w+ ' + name + ': (.*)$', 'm').exec(source);
  assert.ok(match, `missing binding ${name}`);
  if (match[1].trim() === '{') {
    const open = source.indexOf('{', match.index + match[0].length - 1);
    return braces(source, open);
  }
  return 'return ' + match[1];
}

const daemonNames = [...main.matchAll(/^  function (daemon\w+)\(/gm)].map(m => m[1]);
const legacyNames = ['submitPrompt', 'launchAsk', 'stopAsk', 'cancelAsk', 'clearConversation', 'undoClear',
  'sayNotice', 'receiveReply', 'dictateText', 'stashThread', 'loadThread', 'selectBot', 'archiveExchange',
  'plainLine', 'plainPrompt', 'cleanText', 'safeUrl', 'linkButton', 'matchBot', 'findBot', 'primaryBot',
  'currentBot', 'labelOf', 'botLabel', 'canShowReplyCue', 'failAsk', 'askEnvironment', 'replyLanded',
  'deliver', 'markUnread', 'announceReply', 'previewSnippet', 'appendReply', 'oldestWaiting', 'landReply',
  'answerWaiting', 'indexWaiting', 'saveSettings', 'ownEntry', 'pluginsConfig', 'setting', 'loadSettings',
  'settingInt'];

const ECHO = {id: 'example:echo', agentId: 'echo', provider: 'example', name: 'Example Agent', shortName: 'Echo',
  description: '', avatarShape: 'blob', avatarColor: 'blue', avatarImage: '', isPrimary: false};
const TWO = {...ECHO, id: 'example:two', name: 'Second Echo', shortName: 'Two'};

// A Main.qml root with the daemon section and the functions it branches from.
function makeRoot(env, log) {
  const root = {
    log, defaultBotId: 'e0195a7d-f804-4688-9191-e2cf3574a6d1', pluginId: 'io.github.tcballard.grokbot-desktop',
    configLimit: 256 * 1024, historyLimit: 40, fileLimit: 4,
    backendSetting: 'daemon', daemonLive: false, daemonView: null, daemonShownBotId: '', daemonApplying: false,
    daemonDrafts: {}, daemonAskIds: [], daemonNote: '', daemonTellLater: '', daemonBackend: null,
    history: [], askedText: '', askedFiles: [], noticeLinks: [], awaitingId: '',
    unreadBots: [], asking: false, askBotId: '', clearedThread: null, threads: {}, awaiting: {},
    promptDraft: '', attachNote: '', hostBubble: {attachMenuOpen: true}, recentBots: [], switcherOpen: false,
    rosterExpanded: false, queuedPrompt: null, replyUnread: false, dictating: false, expression: 'idle',
    present: true, bubbleOpen: false, grokAppOpen: false, screensaverUp: false, ready: true, rosterRead: true,
    pendingAskId: '',
    openBubble() { root.bubbleOpen = true; log.push('openBubble'); },
    summon() { log.push('summon'); root.openBubble(); },
    flashExpression(name) { root.expression = name; log.push('flash:' + name); },
    hop() { log.push('hop'); },
    showActiveCue(text) { log.push('activeCue:' + text); },
    showPeekCue(botId, text) { log.push('peekCue:' + botId + ':' + text); },
    retargetAppearance() {}, scheduleSave() {}, settleChosenBot() {}, applyBots() {},
  };
  let chosen = root.defaultBotId, pending = [], bots = [], body = '';
  root.bodies = [];
  Object.defineProperty(root, 'bubbleBody', {get: () => body, set: value => { body = value; root.bodies.push(value); }});
  const ids = {
    root, Wire, Dictation, console: {warn: m => log.push('warn:' + m), info: m => log.push('info:' + m)},
    Quickshell: {env: key => env[key]}, askProc: {running: false},
    undoTimer: {stop() {}, restart() {}}, daemonLiveTimer: {restart() { log.push('liveTimer'); }},
    syllableAnim: {restart() { log.push('syllables'); }},
    Avatar: {validateAvatar: value => ({ok: true, value})},
    userConfig: {text: () => root.configText || '', reload() {}},
  };
  const context = vm.createContext(ids);
  vm.runInContext(legacyNames.concat(daemonNames).map(n => method(main, n)).join('\n'), context);
  for (const n of legacyNames.concat(daemonNames)) root[n] = context[n];
  const getter = name => vm.runInContext('(function () {' + binding(main, name) + '})', context);
  for (const name of ['threadBotId', 'askingHere', 'waitingHere', 'busyHere', 'undoShown', 'canClear', 'daemonMode'])
    Object.defineProperty(root, name, {get: getter(name), enumerable: true});
  const run = code => vm.runInContext('(function () {' + code + '})', context);
  const onThread = run(handler(main, 'onThreadBotIdChanged'));
  const onPending = run(handler(main, 'onPendingFilesChanged'));
  const onBots = run(handler(main, 'onBotsChanged'));
  // Property change handlers, as QML would run them.
  Object.defineProperty(root, 'chosenBotId', {get: () => chosen, set: value => {
    const before = root.threadBotId; chosen = value; if (root.threadBotId !== before) onThread();
  }});
  Object.defineProperty(root, 'bots', {get: () => bots, set: value => {
    const before = root.threadBotId; bots = value; onBots(); if (root.threadBotId !== before) onThread();
  }});
  Object.defineProperty(root, 'pendingFiles', {get: () => pending, set: value => { pending = value; onPending(); }});
  root.__context = context;
  return {root, context};
}

class FakeTimer {
  constructor() { this.interval = 0; this.running = false; this.restarts = []; }
  restart() { this.running = true; this.restarts.push(this.interval); }
  stop() { this.running = false; }
}

// qml/Backend.qml with a Process that really runs its command.
function makeBackend(root, log) {
  // Backend.qml's own properties, with their initial values.
  const backend = {};
  const defaults = vm.createContext({Wire});
  for (const m of backendQml.matchAll(/^  property \w+ (\w+): (.*)$/gm))
    backend[m[1]] = vm.runInContext('(' + m[2] + ')', defaults);
  const helloTimer = new FakeTimer(), restartTimer = new FakeTimer();
  const proc = {
    command: [], environment: {}, child: null, live: false, exits: [], stderr: [],
    get running() { return this.live; },
    set running(value) {
      if (value && !this.live) this.spawn();
      else if (!value && this.live) this.child.kill('SIGTERM');
    },
    spawn() {
      const child = spawn(this.command[0], this.command.slice(1), {env: this.environment, stdio: ['pipe', 'pipe', 'pipe']});
      this.child = child;
      this.live = true;
      readline.createInterface({input: child.stdout}).on('line', line => backend.receive(line));
      readline.createInterface({input: child.stderr}).on('line', line => this.stderr.push(line));
      child.on('spawn', () => onStarted());
      child.on('exit', code => { this.live = false; this.exits.push(code); onExited(code === null ? -1 : code); });
    },
    write(line) { this.child.stdin.write(line); },
  };
  const context = vm.createContext({backend, proc, helloTimer, restartTimer, Wire,
    console: {warn: m => log.push('warn:' + m), info: m => log.push('info:' + m)}, Date});
  const names = ['helperOk', 'start', 'stop', 'call', 'pending', 'receive', 'broken', 'giveUp', 'exitedUnexpectedly'];
  vm.runInContext(names.map(n => method(backendQml, n)).join('\n'), context);
  for (const n of names) backend[n] = context[n];
  const started = backendQml.indexOf('    onStarted: {');
  const onStarted = vm.runInContext('(function () {' + braces(backendQml, backendQml.indexOf('{', started)) + '})', context);
  const exited = /    onExited: (function \(code\) \{[^}]*\})/.exec(backendQml);
  const onExited = vm.runInContext('(' + exited[1] + ')', context);
  // Main.qml's Connections block: each signal runs its handler there.
  const connections = main.slice(main.indexOf('    target: daemonLoader.item'));
  const mainContext = root.__context;
  for (const m of connections.slice(0, connections.indexOf('\n  }')).matchAll(/function on(\w)(\w*)\((\w*)\) \{ (.*) \}/g)) {
    const signal = m[1].toLowerCase() + m[2];
    backend[signal] = vm.runInContext('(function (' + m[3] + ') {' + m[4] + '})', mainContext);
  }
  for (const s of ['connected', 'lost', 'gaveUpForSession', 'stateEvent', 'deltaEvent', 'effectEvent'])
    assert.equal(typeof backend[s], 'function', `Main.qml handles ${s}`);
  return {backend, proc, helloTimer, restartTimer};
}

async function until(test, what, ms = 8000) {
  const end = Date.now() + ms;
  while (!test()) {
    if (Date.now() > end) throw new Error('timed out waiting for ' + what);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

function home() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-desktop-backend-'));
  fs.mkdirSync(path.join(dir, 'home/.config/omarchy'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'home/.config/omarchy/agent-desktop.json'), JSON.stringify({providers: {example: {}}}));
  fs.mkdirSync(path.join(dir, 'run'), {mode: 0o700});
  return {dir, env: {HOME: path.join(dir, 'home'), XDG_CONFIG_HOME: path.join(dir, 'home/.config'),
    XDG_RUNTIME_DIR: path.join(dir, 'run'), LANG: 'C.UTF-8'}};
}

// Everything Main.qml would hold, wired to a real daemon.
function desktop(helper = path.join(ROOT, 'bin/agent-desktopd')) {
  const box = home();
  const log = [];
  const {root} = makeRoot(box.env, log);
  const parts = makeBackend(root, log);
  root.daemonBackend = parts.backend;
  parts.backend.helper = helper;
  parts.backend.environment = root.askEnvironment();
  return {root, log, box, ...parts, warnings: () => log.filter(l => l.startsWith('warn:'))};
}

function since(log, mark) { return log.slice(mark); }

test('frames: requests, responses, events, and what ends a daemon', () => {
  const s = Wire.newSession();
  const seen = [];
  const line = Wire.request(s, 'hello', {}, (result, error) => seen.push([result, error]));
  assert.ok(line.endsWith('\n'));
  assert.deepEqual(plain(JSON.parse(line)), {v: 1, id: 'ui1', method: 'hello', params: {}});
  assert.equal(JSON.parse(Wire.request(s, 'state.get', null)).id, 'ui2');
  assert.equal(Wire.pendingCount(s), 2);
  assert.equal(Wire.pendingCount(s, 'hello'), 1);
  const epoch = 'a'.repeat(32);
  const r = Wire.receive(s, JSON.stringify({v: 1, epoch, id: 'ui1', result: {ok: 1}}));
  assert.equal(r.type, 'response');
  assert.equal(r.method, 'hello');
  r.callback(r.result, r.error);
  assert.deepEqual(plain(seen), [[{ok: 1}, null]]);
  assert.equal(Wire.receive(s, '').type, 'ignore');
  assert.equal(Wire.receive(s, JSON.stringify({v: 1, epoch, seq: 1, event: 'state', params: {}})).type, 'event');
  assert.equal(Wire.receive(s, JSON.stringify({v: 1, epoch, seq: 3, event: 'state', params: {}})).reason, 'event out of sequence');
  const t = Wire.newSession();
  Wire.receive(t, JSON.stringify({v: 1, epoch, seq: 1, event: 'x', params: {}}));
  assert.equal(Wire.receive(t, JSON.stringify({v: 1, epoch: 'b'.repeat(32), seq: 2, event: 'x', params: {}})).reason, 'epoch changed');
  for (const [frame, reason] of [
    ['{', 'unreadable frame'], ['[]', 'frame is not an object'],
    [JSON.stringify({v: 2, epoch, id: 'ui2', result: 1}), 'wrong protocol version'],
    [JSON.stringify({v: 1, id: 'ui2', result: 1}), 'missing epoch'],
    [JSON.stringify({v: 1, epoch, id: 'nope', result: 1}), 'response to an unknown request'],
    [JSON.stringify({v: 1, epoch, id: null, error: {code: 'invalid_request'}}), 'daemon refused a frame'],
    [JSON.stringify({v: 1, epoch, id: 'ui2', result: 1, error: {}}), 'response needs one of result or error'],
  ]) {
    const fresh = Wire.newSession();
    Wire.request(fresh, 'a', {}, null);
    Wire.request(fresh, 'b', {}, null);
    assert.equal(Wire.receive(fresh, frame).reason, reason, frame);
  }
  // A pending request is answered with an error.
  const u = Wire.newSession();
  Wire.request(u, 'ask.send', {}, null);
  const e = Wire.receive(u, JSON.stringify({v: 1, epoch, id: 'ui1', error: {code: 'invalid_request', message: 'm'}}));
  assert.deepEqual(plain(e.error), {code: 'invalid_request', message: 'm', retryable: false});
  const dropped = Wire.newSession();
  Wire.request(dropped, 'a', {}, () => {});
  Wire.request(dropped, 'b', {}, null);
  assert.equal(Wire.dropPending(dropped).length, 1);
  assert.equal(Wire.pendingCount(dropped), 0);
});

test('a request over the 1 MiB frame cap is refused before it is written', () => {
  const s = Wire.newSession();
  let error = null;
  assert.equal(Wire.request(s, 'notice.say', {text: 'é'.repeat(600000)}, (r, e) => { error = e; }), '');
  assert.equal(error.code, 'limit_exceeded');
  assert.equal(Wire.pendingCount(s), 0);
  assert.equal(Wire.utf8Length('aé€😀'), 1 + 2 + 3 + 4);
  assert.equal(Wire.clipText('x'.repeat(70000)).length, 65536);
  assert.equal(Wire.clipText(undefined), '');
});

test('restarts back off, and three failures in a minute end the daemon for the session', () => {
  let failures = Wire.recordFailure([], 0);
  assert.equal(Wire.restartDelay(failures.length), 1000);
  assert.equal(Wire.shouldGiveUp(failures), false);
  failures = Wire.recordFailure(failures, 30000);
  assert.equal(Wire.restartDelay(failures.length), 4000);
  // The first failure has left the window.
  failures = Wire.recordFailure(failures, 61000);
  assert.deepEqual(plain(failures), [30000, 61000]);
  assert.equal(Wire.shouldGiveUp(failures), false);
  failures = Wire.recordFailure(failures, 62000);
  assert.equal(Wire.shouldGiveUp(failures), true);
  assert.equal(Wire.restartDelay(9), 10000);
});

test('snapshots map onto the Main.qml properties, the streamed text first', () => {
  const snap = {botId: 'b', history: [{asked: 'q', files: ['/f'], body: 'a', links: [{label: 'L', url: 'https://x'}], wait: ''}, 'junk'],
    asked: 'now', files: ['/g'], pending: ['/p', 7], body: 'final', partial: '', links: [], wait: 'w1', asking: true,
    askBotId: 'b', askId: 'abc', unreadBots: ['c'], awaitingBots: ['b'], undo: true, historyOmitted: 0, extra: 1};
  const props = plain(Wire.snapshotProps(snap));
  assert.deepEqual(props, {botId: 'b', history: [{asked: 'q', files: ['/f'], body: 'a', links: [{label: 'L', url: 'https://x'}], wait: ''},
    {asked: '', files: [], body: '', links: [], wait: ''}], askedText: 'now', askedFiles: ['/g'], pendingFiles: ['/p'],
  bubbleBody: 'final', noticeLinks: [], awaitingId: 'w1', asking: true, askBotId: 'b', askId: 'abc', unreadBots: ['c'],
  awaitingBots: ['b'], undo: true});
  assert.equal(Wire.snapshotProps({...snap, partial: 'so far'}).bubbleBody, 'so far');
  assert.equal(Wire.snapshotProps(null).asking, false);
  assert.equal(Wire.deltaBody(props, {botId: 'b', askId: 'abc', text: 'grow'}, 'b'), 'grow');
  assert.equal(Wire.deltaBody(props, {botId: 'b', askId: 'old', text: 'grow'}, 'b'), null);
  assert.equal(Wire.deltaBody(props, {botId: 'b', askId: 'abc', text: 'grow'}, 'c'), null);
});

test('every effect in the protocol document has its Main.qml action, and only those', () => {
  const doc = read('docs/DESKTOP-PROTOCOL.md');
  const table = doc.slice(doc.indexOf('## Effects'), doc.indexOf('## Asks'));
  const kinds = [...table.matchAll(/^\| `([a-z-]+)` \|/gm)].map(m => m[1]).filter(kind => kind !== 'kind');
  assert.equal(kinds.length, 13);
  assert.deepEqual(Object.keys(Wire.EFFECT_STEPS).sort(), kinds.sort());
  assert.deepEqual(plain(Wire.effectSteps('landed')), ['flashHappy', 'syllables', 'replyLanded']);
  assert.deepEqual(plain(Wire.effectSteps('nonsense')), []);
  // Run each through Main.qml's daemonEffect and check what it did.
  const expect = {
    open: ['openBubble'], select: ['hop'], 'draft-clear': [], 'dictation-ended': [], 'ask-started': [], idle: [], rest: [],
    landed: ['flash:happy', 'syllables', 'hop'], failed: ['hop'], unread: ['hop'],
    'cue-active': ['activeCue:hi'], 'cue-peek': ['peekCue:example:two:hi'],
    alert: ['summon', 'openBubble', 'flash:alert', 'syllables'],
  };
  for (const kind of kinds) {
    const log = [];
    const {root} = makeRoot({}, log);
    root.daemonLive = true;
    root.bots = [ECHO, TWO];
    root.chosenBotId = ECHO.id;
    root.promptDraft = 'draft';
    root.dictating = true;
    root.expression = 'work';
    log.length = 0;
    root.daemonEffect({kind, botId: kind === 'cue-peek' ? TWO.id : ECHO.id, text: 'hi'});
    assert.deepEqual(log, expect[kind], kind);
    assert.equal(root.promptDraft, kind === 'draft-clear' ? '' : 'draft', kind);
    assert.equal(root.dictating, kind !== 'dictation-ended', kind);
    const expression = {idle: 'idle', failed: 'idle', rest: 'idle', landed: 'happy', alert: 'alert'}[kind] || 'work';
    assert.equal(root.expression, expression, kind);
    assert.equal(root.replyUnread, ['landed', 'failed', 'unread'].includes(kind), kind);
  }
  // select runs the view side of selectBot: the drafts move, the daemon is told.
  const log = [];
  const {root} = makeRoot({}, log);
  root.daemonLive = true;
  const calls = [];
  root.daemonBackend = {call: (method, params) => { calls.push([method, plain(params)]); return true; }, pending: () => 0};
  root.bots = [ECHO, TWO];
  root.chosenBotId = ECHO.id;
  root.promptDraft = 'for echo';
  calls.length = 0;
  root.daemonEffect({kind: 'select', botId: TWO.id, text: ''});
  assert.equal(root.chosenBotId, TWO.id);
  assert.equal(root.promptDraft, '');
  assert.deepEqual(calls, [['view.set', {botId: TWO.id, bubbleOpen: false}]]);
  root.daemonEffect({kind: 'select', botId: ECHO.id, text: ''});
  assert.equal(root.promptDraft, 'for echo');
  // Cues follow canShowReplyCue.
  root.bubbleOpen = true;
  log.length = 0;
  root.daemonEffect({kind: 'cue-active', botId: ECHO.id, text: 'hi'});
  assert.deepEqual(log, []);
});

test('roster rows the daemon would refuse are left out instead of failing the roster', () => {
  const rows = plain(Wire.rosterParams([ECHO, {...ECHO}, {id: '', name: 'x'}, {id: 'n', name: ''}, {id: 'x'.repeat(257), name: 'y'},
    {id: 'long', name: 'n', agentId: 'a'.repeat(513)}, null, {id: 'g', name: 'G', provider: 'other'}]));
  assert.deepEqual(rows, [{id: 'example:echo', name: 'Example Agent', agentId: 'echo', shortName: 'Echo', provider: 'example'},
    {id: 'g', name: 'G', agentId: '', shortName: '', provider: 'grokbot'}]);
  assert.deepEqual(plain(Wire.fileList(['/a', '', 3, '/b\u0000', '/c', '/d', '/e', '/f'])), ['/a', '/c', '/d', '/e']);
});

test('the backend setting is read as daemon or legacy and kept when settings are saved', () => {
  for (const [value, expected] of [['daemon', 'daemon'], ['legacy', 'legacy'], ['Daemon', 'legacy'], [true, 'legacy'], [undefined, 'legacy']]) {
    const {root} = makeRoot({}, []);
    root.bots = [ECHO];
    root.backendSetting = 'unset';
    root.configText = JSON.stringify({plugins: [{id: root.pluginId, backend: value}]});
    root.loadSettings();
    assert.equal(root.backendSetting, expected, String(value));
  }
  const {root} = makeRoot({}, []);
  root.configText = JSON.stringify({plugins: [{id: root.pluginId, backend: 'daemon', marginX: 3}]});
  let saved = null;
  root.shell = {updateEntryInline: (id, settings) => { saved = plain(settings); }};
  root.saveSettings();
  assert.equal(saved.backend, 'daemon');
});

test('legacy mode never reaches the daemon functions', () => {
  const log = [];
  const {root} = makeRoot({}, log);
  root.backendSetting = 'legacy';
  root.daemonLive = true; // even so: daemonMode needs the setting
  assert.equal(root.daemonMode, false);
  for (const name of daemonNames) root[name] = () => { throw new Error('daemon path taken: ' + name); };
  root.bots = [ECHO];
  root.chosenBotId = ECHO.id;
  root.pendingFiles = ['/x'];
  root.askedText = 'q';
  root.bubbleBody = 'a';
  assert.equal(root.clearConversation(), 'ok');
  assert.equal(root.undoShown, true);
  root.undoClear();
  assert.equal(root.bubbleBody, 'a');
  assert.equal(root.receiveReply('nobody', 'x'), 'unknown ask or bot');
  assert.equal(root.sayNotice('', 'note', []), 'ok');
  assert.equal(root.bubbleBody, 'note');
  assert.equal(root.dictateText('no wake phrase'), 'ignored');
  root.stashThread(ECHO.id);
  assert.equal(root.threads[ECHO.id].body, 'note');
});

test('daemon mode against the real bin/agent-desktopd: ask, stream, stop, clear, undo, switch, say, reply, dictate', async t => {
  const d = desktop();
  const {root, log, backend, proc} = d;
  t.after(() => { if (proc.live) proc.child.kill('SIGKILL'); fs.rmSync(d.box.dir, {recursive: true, force: true}); });
  root.bots = [ECHO, TWO];
  root.chosenBotId = ECHO.id;
  assert.equal(root.daemonMode, false);

  // The command line and environment Backend.qml uses.
  backend.start();
  assert.deepEqual(plain(proc.command), ['/usr/bin/setpriv', '--pdeathsig', 'TERM', '/usr/bin/python3', '-I', path.join(ROOT, 'bin/agent-desktopd')]);
  assert.equal(proc.environment.HOME, d.box.env.HOME);
  assert.equal(proc.environment.PATH, '/usr/bin:/bin');
  assert.equal(proc.environment.PYTHONSAFEPATH, '1');
  await until(() => root.daemonMode, 'hello and go-live');
  assert.equal(backend.hello.server, 'agent-desktopd');
  assert.equal(backend.hello.protocol.major, 1);
  assert.ok(log.some(l => l.startsWith('info:Grok Bot desktop: agent daemon') && l.includes('connected')));
  await until(() => backend.pending() === 0 && root.daemonView && root.daemonView.botId === ECHO.id, 'initial snapshot');
  assert.deepEqual(plain(root.history), []);
  assert.equal(root.bubbleBody, '');

  // Submit from the composer: draft cleared, bubble opened, work, streamed text, landed.
  root.promptDraft = 'Hello';
  root.hostBubble.attachMenuOpen = true;
  root.attachNote = 'old note';
  root.bodies.length = 0;
  let mark = log.length;
  assert.equal(root.submitPrompt('Hello'), undefined);
  await until(() => log.includes('syllables') && !root.asking, 'first reply');
  assert.equal(root.bubbleBody, 'Example: Hello');
  const streamed = root.bodies.indexOf('Example:');
  assert.ok(streamed >= 0 && streamed < root.bodies.indexOf('Example: Hello'),
    'the streamed delta was shown before the final reply: ' + JSON.stringify(root.bodies));
  assert.equal(root.askedText, 'Hello');
  assert.equal(root.promptDraft, '');
  assert.equal(root.attachNote, '');
  assert.equal(root.hostBubble.attachMenuOpen, false);
  assert.equal(root.askBotId, ECHO.id);
  assert.deepEqual(since(log, mark).filter(l => !l.startsWith('warn')), ['openBubble', 'flash:happy', 'syllables']);
  assert.equal(root.expression, 'happy');

  // A cancel straight after an ask.
  mark = log.length;
  root.submitPrompt('Second');
  root.stopAsk();
  await until(() => backend.pending() === 0 && !root.asking, 'stop');
  assert.equal(root.bubbleBody, 'Stopped waiting. Remote work may continue; check the provider.');
  assert.equal(root.askedText, 'Second');
  assert.deepEqual(plain(root.history), [{asked: 'Hello', files: [], body: 'Example: Hello', links: [], wait: ''}]);
  assert.equal(root.expression, 'idle');
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(root.bubbleBody, 'Stopped waiting. Remote work may continue; check the provider.', 'later output is discarded');

  // IPC ask: the answer returned now is the daemon's.
  assert.equal(root.launchAsk('Third'), 'ok');
  assert.equal(root.asking, false, 'nothing is assumed before the daemon says so');
  await until(() => root.asking, 'asking');
  assert.equal(root.launchAsk('Fourth'), 'busy');
  assert.equal(root.dictateText('Hey Two again'), 'busy');
  await until(() => !root.asking && root.bubbleBody === 'Example: Third', 'third reply');

  // Clear and undo.
  assert.equal(root.clearConversation(), 'ok');
  await until(() => root.undoShown && root.history.length === 0, 'cleared');
  assert.equal(root.askedText, '');
  assert.equal(root.clearConversation(), 'nothing to clear');
  root.undoClear();
  await until(() => !root.undoShown && root.history.length === 2, 'undone');
  assert.equal(root.bubbleBody, 'Example: Third');

  // Switching bots: the daemon holds each conversation, QML the drafts.
  root.promptDraft = 'half typed';
  root.selectBot(TWO.id);
  assert.equal(root.promptDraft, '');
  await until(() => root.daemonView.botId === TWO.id, 'switched');
  assert.deepEqual(plain(root.history), []);
  assert.equal(root.bubbleBody, '');
  root.selectBot(ECHO.id);
  assert.equal(root.promptDraft, 'half typed');
  await until(() => root.daemonView.botId === ECHO.id && root.history.length === 2, 'switched back');
  assert.equal(root.bubbleBody, 'Example: Third');

  // A reply for a bot not on screen: unread dot, peek cue, kept with it.
  root.bubbleOpen = false;
  root.replyUnread = false;
  mark = log.length;
  assert.equal(root.receiveReply('Two', 'Hi from two'), 'ok');
  await until(() => root.unreadBots.includes(TWO.id), 'unread');
  await until(() => log.slice(mark).includes('hop'), 'unread effect');
  assert.equal(root.replyUnread, true);
  assert.ok(log.slice(mark).includes('peekCue:example:two:Hi from two'));
  assert.equal(root.receiveReply('nobody', 'x'), 'unknown ask or bot');
  assert.equal(root.receiveReply('Two', '   '), 'empty text');
  root.selectBot(TWO.id);
  await until(() => root.daemonView.botId === TWO.id && root.bubbleBody === 'Hi from two', 'reply kept with its bot');
  assert.deepEqual(plain(root.unreadBots), []);

  // Notices.
  mark = log.length;
  assert.equal(root.sayNotice('Build', 'Finished', [{label: 'Open', url: 'https://example.com/run'}]), 'ok');
  await until(() => root.bubbleBody === 'Build\nFinished', 'notice');
  assert.deepEqual(plain(root.noticeLinks), [{label: 'Open', url: 'https://example.com/run'}]);
  assert.ok(log.slice(mark).includes('summon') && log.slice(mark).includes('flash:alert'));
  assert.equal(root.sayNotice('Build', '  ', []), 'empty text');

  // Dictation: wake phrases route and ask; anything else is typed by the caller.
  assert.equal(root.dictateText('no wake phrase here'), 'ignored');
  assert.equal(root.dictateText(''), 'empty');
  root.dictating = true;
  root.selectBot(ECHO.id);
  await until(() => root.daemonView.botId === ECHO.id, 'back on echo');
  assert.equal(root.dictateText('Hey Two how are you'), 'ok');
  assert.equal(root.dictating, false);
  await until(() => root.chosenBotId === TWO.id, 'dictation selected the bot');
  await until(() => !root.asking && root.bubbleBody === 'Example: how are you', 'dictated ask');
  assert.equal(root.dictateText('Hey Two'), 'opened');

  // Wake phrase in the composer.
  root.selectBot(ECHO.id);
  root.promptDraft = 'Hey Two and you';
  root.submitPrompt('Hey Two and you');
  await until(() => root.chosenBotId === TWO.id && !root.asking && root.bubbleBody === 'Example: and you', 'composer wake phrase');
  assert.equal(root.promptDraft, '');
  assert.equal(root.daemonDrafts[ECHO.id], 'Hey Two and you');

  // Attachments go with the bot and the ask; the example refuses them.
  root.pendingFiles = ['/run/user/1000/grokbot-desktop/attachments/a.png'];
  await until(() => backend.pending('attachments.set') === 0, 'attachments sent');
  root.submitPrompt('');
  await until(() => !root.asking && root.askedText === 'Have a look at this.', 'attachment ask');
  assert.deepEqual(plain(root.askedFiles), ['/run/user/1000/grokbot-desktop/attachments/a.png']);
  assert.deepEqual(plain(root.pendingFiles), []);
  assert.match(root.bubbleBody, /attachments/);

  // An ask for a bot that left the roster.
  root.bots = [ECHO];
  root.chosenBotId = 'example:gone';
  assert.equal(root.threadBotId, 'example:gone');
  await until(() => root.daemonView.botId === 'example:gone', 'placeholder view');
  assert.equal(root.launchAsk('x'), 'error');
  await until(() => root.bubbleBody === 'Selected agent is unavailable. Refresh providers or select another agent.', 'unavailable');
  root.bots = [ECHO, TWO];
  root.chosenBotId = ECHO.id;

  await until(() => backend.pending() === 0, 'quiet');
  assert.deepEqual(d.warnings(), [], 'every answer returned at once matched the daemon');
  // Diagnostics never carry prompts or replies.
  assert.ok(proc.stderr.every(line => !/Hello|Third|Example:|from two|how are you/.test(line)), proc.stderr.join('\n'));

  // Shutdown: stop() ends the process without a restart.
  backend.stop();
  await until(() => !proc.live, 'exit');
  assert.deepEqual(proc.exits, [0]);
  assert.deepEqual(d.restartTimer.restarts, []);
});

test('a daemon that dies mid-ask: the ask ends plainly, the shell falls back, a restarted daemon says what was lost', async t => {
  const d = desktop();
  const {root, log, backend, proc, restartTimer} = d;
  t.after(() => { if (proc.live) proc.child.kill('SIGKILL'); fs.rmSync(d.box.dir, {recursive: true, force: true}); });
  root.bots = [ECHO, TWO];
  root.chosenBotId = ECHO.id;
  backend.start();
  await until(() => root.daemonMode && backend.pending() === 0, 'live');
  root.receiveReply('Two', 'for later');
  await until(() => root.unreadBots.includes(TWO.id), 'unread');
  // Kill it while the example is still answering (it takes 100 ms).
  root.launchAsk('Hello');
  await until(() => root.asking, 'asking');
  proc.child.kill('SIGKILL');
  await until(() => !root.daemonMode, 'lost');
  assert.equal(root.asking, false);
  assert.equal(root.bubbleBody, 'The agent daemon stopped, so this ask ended.');
  assert.equal(root.expression, 'idle');
  assert.deepEqual(plain(root.unreadBots), []);
  assert.deepEqual(restartTimer.restarts, [1000]);
  assert.ok(log.some(l => /agent daemon exited with code -1; restarting in 1000 ms/.test(l)), log.join('\n'));
  // Meanwhile the legacy path answers.
  assert.equal(root.clearConversation(), 'ok');
  assert.equal(root.undoShown, true);
  // The restart.
  backend.start();
  await until(() => root.daemonMode && backend.pending() === 0, 'live again');
  await until(() => root.bubbleBody === 'The agent daemon stopped and was restarted. Conversations it held were lost.', 'told once');
  assert.equal(root.daemonNote, '');
  assert.equal(root.undoShown, false);
  assert.ok(log.includes('summon'));
  backend.stop();
  await until(() => !proc.live, 'exit');
});

test('a daemon that keeps failing is given up for the session with one plain line', async t => {
  const box = home();
  const fake = path.join(box.dir, 'bin/agent-desktopd');
  fs.mkdirSync(path.dirname(fake));
  fs.writeFileSync(fake, 'import sys\nsys.exit(3)\n');
  const d = desktop(fake);
  const {root, log, backend, proc, restartTimer} = d;
  t.after(() => { fs.rmSync(box.dir, {recursive: true, force: true}); fs.rmSync(d.box.dir, {recursive: true, force: true}); });
  root.bots = [ECHO];
  root.chosenBotId = ECHO.id;
  root.bubbleBody = 'earlier';
  for (let attempt = 1; attempt <= 3; attempt++) {
    backend.start();
    await until(() => proc.exits.length === attempt, 'exit ' + attempt + ': ' + log.join(' | '));
  }
  assert.deepEqual(restartTimer.restarts, [1000, 4000]);
  assert.equal(backend.gaveUp, true);
  assert.equal(root.daemonMode, false);
  assert.ok(log.some(l => l.includes('failed 3 times in a minute') && l.includes('standard ask path for this session')));
  root.daemonTell();
  assert.equal(root.bubbleBody, 'The agent daemon could not be started, so this session uses the standard asks.');
  assert.equal(root.history[root.history.length - 1].body, 'earlier');
  assert.equal(root.replyUnread, true);
  backend.start();
  assert.equal(proc.exits.length, 3, 'no further starts');
});

test('the helper must be the bundled script, and a silent daemon is a failure', () => {
  const log = [];
  const {root} = makeRoot({}, log);
  const {backend, proc, helloTimer} = makeBackend(root, log);
  backend.helper = '/tmp/../bin/agent-desktopd';
  backend.start();
  assert.equal(backend.gaveUp, true);
  assert.equal(proc.live, false);
  assert.ok(log.some(l => l.includes('not the bundled script')));
  // No hello answer: counted, and restarted.
  const second = makeBackend(root, log);
  second.backend.down = false;
  second.backend.broken('no hello answer');
  second.backend.exitedUnexpectedly(-1);
  assert.deepEqual(second.restartTimer.restarts, [1000]);
  assert.equal(helloTimer.running, false);
});
