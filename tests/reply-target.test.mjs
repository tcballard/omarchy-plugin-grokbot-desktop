import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const main = fs.readFileSync(new URL('../Main.qml', import.meta.url), 'utf8');
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

function shell() {
  const landed = [];
  const root = {
    daemonMode: false, awaiting: {}, threadBotId: 'bob', awaitingId: '', bubbleBody: '', history: [], threads: {},
    cleanText: (value, max) => String(value || '').trim().slice(0, max),
    matchBot: name => (name === 'Bob' ? {id: 'bob'} : null),
    oldestWaiting: () => '',
    appendReply: (bot, text) => { root.bubbleBody = text; return true; },
    announceReply: () => {},
    landReply: here => landed.push(here),
  };
  const context = vm.createContext({root});
  vm.runInContext(['receiveReply', 'answerWaiting'].map(method).join('\n'), context);
  root.receiveReply = context.receiveReply;
  root.answerWaiting = context.answerWaiting;
  return {root, landed};
}

test('a reply addressed to an inherited object key is an unknown target', () => {
  for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
    const {root, landed} = shell();
    assert.equal(root.receiveReply(key, 'hello'), 'unknown ask or bot', key);
    assert.deepEqual(Object.keys(root.awaiting), [], key);
    assert.equal(root.bubbleBody, '', key);
    assert.deepEqual(landed, [], key);
    assert.equal(root.answerWaiting(key, 'hello'), false, key);
  }
});

test('a reply to a waiting ask id still fills its question', () => {
  const {root, landed} = shell();
  root.awaiting = {abcdef012345: {botId: 'bob', since: 1}};
  root.awaitingId = 'abcdef012345';
  assert.equal(root.receiveReply('abcdef012345', 'the answer'), 'ok');
  assert.equal(root.bubbleBody, 'the answer');
  assert.equal(root.awaitingId, '');
  assert.deepEqual(Object.keys(root.awaiting), []);
  assert.deepEqual(landed, [true]);
});
