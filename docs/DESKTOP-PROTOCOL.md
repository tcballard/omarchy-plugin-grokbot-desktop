# Agent Desktop daemon protocol v1 (experimental)

`bin/agent-desktopd` is an optional backend for the desktop companion. It is
one long-lived process per shell session that owns every bot's conversation
and all ask I/O, so replies can stream and the conversation logic can be
tested outside QML. It is opt-in (plugin setting `backend: "daemon"`; the
default `"legacy"` path is unchanged) and has not been live-tested on an
Omarchy desktop.

This document is the whole contract between the shell (the client) and the
daemon (the server). The provider boundary behind the daemon is the separate
[Provider API](PROVIDER-API.md).

- [Process](#process)
- [Framing and envelopes](#framing-and-envelopes)
- [Ordering](#ordering)
- [Methods](#methods)
- [Events](#events)
- [The `state` snapshot](#the-state-snapshot)
- [Effects](#effects)
- [Asks](#asks)
- [Control socket](#control-socket)
- [Errors, limits and shutdown](#errors-limits-and-shutdown)
- [What stays in QML](#what-stays-in-qml)
- [Transcripts](#transcripts)

## Process

Launch:

```
/usr/bin/setpriv --pdeathsig TERM /usr/bin/python3 -I <plugin>/bin/agent-desktopd
```

with the same cleared environment the shell gives `bin/agent-desktop-ask`
(`askEnvironment()` in Main.qml). The daemon passes that environment to the
provider adapters and their workers. It takes no arguments (`--help` prints
usage; any other argument exits 2). stdin and stdout must be pipes or sockets
(exit 2 otherwise). Diagnostics go to stderr as single lines that never
contain prompts, replies or keys.

At start the daemon moves the protocol to private duplicates of fds 0 and 1
and points fd 0 at `/dev/null` and fd 1 at stderr, so neither adapter code
nor a child process can write into the protocol stream or read from it.

Nothing is written to disk. Conversations, unread marks and waiting asks are
lost when the process exits; a restarted daemon starts empty.

## Framing and envelopes

One UTF-8 JSON object per line (`\n`-terminated), at most 1 MiB
(1,048,576 bytes) per line including the newline, in both directions. JSON
with duplicate keys, `NaN`/`Infinity`, or a top-level value that is not an
object is rejected. The envelope is the Provider API's:

| Frame | Fields |
| --- | --- |
| Request (client to daemon) | `v:1`, `id`, `method`, optional `params` object (default `{}`) |
| Response (daemon to client) | `v:1`, `epoch`, `id` (the request's), and exactly one of `result` or `error` |
| Event (daemon to client) | `v:1`, `epoch`, `seq`, `event`, `params` object |

- `id` matches `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`. Each id must be unique on
  the connection. The daemon remembers the most recent 4096 ids and answers a
  repeat of one of them with `duplicate_id`. There is no limit on the total
  number of requests (the provider-facing server's 4096-operation cap does
  not apply here).
- `epoch` is 32 lowercase hex characters, fixed for the life of the process.
  A different epoch means a different daemon: discard all state and start
  again with `hello`.
- `seq` starts at 1 and increases by exactly 1 for every event. A gap or
  repeat is a client bug or a lost frame; restart the daemon.
- `error` is `{code, message, retryable}`; `message` is a short fixed
  English sentence, never private text. A frame that cannot be parsed is
  answered with `id: null`.
- Results of the intent methods are plain JSON strings, chosen to match what
  the existing IPC handlers return.

## Ordering

The daemon reads requests one at a time, in order, and handles each to
completion before reading the next. For every request that changes state
(all methods except `hello`, `roster.set`, `state.get` and `shutdown`):

1. the daemon emits exactly one `state` event (always, even when the result
   is a refusal such as `"busy"`),
2. then the `effect` events that request produced, in order,
3. then the response.

So when a response arrives, the snapshot before it is already current.

Work that finishes later (an ask's reply, a stream chunk, a reply or
dictation from the control socket, the reply-wait expiry, the undo timeout)
produces its own `state` event followed by its effects, between responses.
`ask.delta` events arrive on their own, without a `state` event.

`ask.send` and `dictate` wait, before they are handled, until a previously
cancelled ask has stopped its adapter and reaped its children (bounded at
15 s), so a new ask never overlaps an old worker.

## Methods

`hello` must be the first request; any other method before it is
`handshake_required`, and a second `hello` is `invalid_request`. Unless noted,
a string parameter that is absent counts as `""`, and a parameter of the
wrong JSON type is `invalid_request`. Strings may be up to the frame size;
the daemon trims and limits them as the QML functions named below do.

| Method | Params | Result | Port of |
| --- | --- | --- | --- |
| `hello` | none | object, below | |
| `roster.set` | `bots`: array (at most 1024) of bot objects, below | `"ok"` | `bots` assignment |
| `view.set` | `botId`: non-empty string, at most 256 characters (required); `bubbleOpen`: boolean (optional) | `"ok"` | `selectBot` stash/load |
| `attachments.set` | `files`: array of at most 4 non-empty path strings, each at most 4096 characters, no NUL (default `[]`) | `"ok"` | `pendingFiles` assignment |
| `ask.send` | `text`: string; `mode`: `"prompt"` (default) or `"line"`; `attachments`: as `files` above (optional) | `"ok"`, `"busy"`, `"empty"`, `"opened"`, `"error"` | `submitPrompt` (prompt) / IPC `ask` (line) |
| `ask.cancel` | `quiet`: boolean (default `false`) | `"ok"`, `"nothing"` | `stopAsk` / `cancelAsk` (quiet) |
| `thread.clear` | none | `"ok"`, `"nothing to clear"` | `clearConversation` |
| `thread.undo` | none | `"ok"`, `"nothing"` | `undoClear` |
| `notice.say` | `title`: string; `text`: string; `links`: array of at most 2 `{label, url}` objects (default `[]`) | `"ok"`, `"empty text"`, `"invalid link"` | IPC `say` / `sayLink` / `sayLinks` |
| `reply.deliver` | `target`: ask id, bot id or bot name; `text`: string | `"ok"`, `"empty text"`, `"unknown ask or bot"` | IPC `reply` (`receiveReply`) |
| `dictate` | `text`: string | `"ok"`, `"busy"`, `"empty"`, `"ignored"`, `"opened"`, `"error"` | IPC `dictate` (`dictateText`) |
| `state.get` | none | a snapshot object (no event) | |
| `shutdown` | none | `"ok"`, then the daemon exits | |

### `hello`

```json
{"protocol":{"major":1,"minor":0},"server":"agent-desktopd","version":"0.2.0",
 "maxFrameBytes":1048576,"ctlSocket":true,"historyLimit":40,"replyWaitMs":600000,"undoMs":8000}
```

`version` is the plugin's `VERSION` file. `ctlSocket` says whether the
control socket is being served; when it is `false`, `reply` and `dictate`
from `bin/grokbot-desktop-ctl` reach the shell's own IPC handlers instead
(see [Control socket](#control-socket)), and the client must forward those to
`reply.deliver` and `dictate`.

### `roster.set`

Each bot is `{id, name, agentId?, shortName?, provider?}`: `id` a unique
non-empty string of at most 256 characters, `name` a non-empty string,
`agentId` and `shortName` strings of at most 512 characters (default `""`;
an empty `agentId` means `id`), and `provider` one of `"grokbot"` (default),
`"hermes"`, `"example"`. Any other field is ignored. One invalid row makes
the whole call `invalid_request` and leaves the previous roster in place.
Send the same list as Main.qml's `bots` (after `parseBots` and the provider
merge), and again whenever it changes. The roster is used for: whether the
bot on screen can be asked, its `agentId` and `provider`, reply targets by
name (`matchBot`), wake phrases, and the name in the expiry message
(`labelOf`). It does not emit `state`.

The wake-phrase primary bot is the fixed id
`e0195a7d-f804-4688-9191-e2cf3574a6d1` (`defaultBotId`), as in
`qml/dictation.js`.

### `view.set`

Send the bot on screen (`threadBotId`) whenever it changes, and once after
`hello` (until then the daemon assumes `defaultBotId`). If `botId` differs
from the daemon's current one, the daemon does what `selectBot` does to the
conversation: drops the pending undo, stores the current conversation under
the old bot, loads the new bot's conversation (empty if it has none), and
removes the new bot from `unreadBots`. The same `botId` is a no-op apart from
the `state` event. Any string is accepted (the "Unavailable agent"
placeholder id included); whether it can be asked is checked by `ask.send`.
`bubbleOpen` is recorded but currently changes nothing; reply cues are gated
by the client (see `cue-active`).

### `attachments.set`

Replaces the pending files of the bot on screen. Pending files are part of a
bot's conversation, as `pendingFiles` is in `stashThread`/`loadThread`: they
move with `view.set` and come back in the snapshot's `pending`. Send it after
every change to the composer's attachment list. The daemon does not check
the paths; the GrokBot adapter accepts only files staged by
`bin/grokbot-attach` and refuses attachments in webhook mode, and the other
providers refuse attachments; a refusal is delivered as the ask's reply text.

### `ask.send`

If `attachments` is present it first replaces the pending files, exactly as
`attachments.set` would.

`mode: "prompt"` is the composer's `submitPrompt`:

1. `text` is cleaned with `plainPrompt` (line breaks kept, 4000 UTF-16 units).
2. Empty with pending files: the prompt becomes `Have a look at this.`
3. Still empty: `"empty"`. An ask already running: `"busy"`. In both cases
   nothing changes.
4. A wake phrase (`Hey <name> ...`, the rules of `qml/dictation.js`) selects
   that bot when it is in the roster (effect `select`, and the view switches
   as `view.set` would), takes the rest as the prompt, and emits
   `draft-clear`. If the rest is empty: effect `open`, result `"opened"`.
5. Without a wake phrase: effect `draft-clear`.
6. Then `launchAsk`, below.

`mode: "line"` is the IPC `ask`: `text` is cleaned with `plainLine` (control
characters become spaces, 4000 units); empty is `"empty"`; otherwise
`launchAsk` with no wake routing and no `draft-clear`.

`launchAsk`: `"busy"` while an ask runs. If the bot on screen is not in the
roster: its latest reply text becomes `Selected agent is unavailable. Refresh
providers or select another agent.` (without moving the latest exchange into
history), effects `idle`, `open`, result `"error"`. Otherwise: effect `open`;
the latest exchange moves into history; `asked` becomes the prompt, `files`
the pending files, `pending` empties; the ask starts for that bot; effect
`ask-started`; result `"ok"`. See [Asks](#asks).

On `"ok"` the client should do what `launchAsk` does to view state: clear the
attachment note and close the attachment menu. The draft is cleared only by
the `draft-clear` effect.

### `ask.cancel`

Default (`stopAsk`, the Stop button): with no ask running, `"nothing"`.
Otherwise the ask stops, the asking bot's latest reply becomes `Stopped
waiting. Remote work may continue; check the provider.` (on screen, or kept
with that bot and marked unread), effect `idle`, result `"ok"`. Any later
output of that ask is discarded.

`quiet: true` (`cancelAsk`, used when the companion is hidden): the ask stops
with no text and no effects; `"ok"`, or `"nothing"` when no ask was running.

Stopping returns at once; the adapter and its children are stopped in the
background (local workers are terminated, then killed after 2 s). A remote
webhook or Hermes turn may continue.

### `thread.clear` and `thread.undo`

`thread.clear`: `"nothing to clear"` while the bot on screen is the one
asking, or when its conversation (history, asked text, reply text and links)
is empty. Otherwise the conversation is kept for undo, emptied (pending files
stay), effect `open`, `"ok"`. The undo is offered (`undo: true` in the
snapshot) for 8 s; after that the daemon emits a `state` event with
`undo: false`. A new exchange on screen (an ask, a notice, a reply that lands
on screen) or switching bots also drops it.

`thread.undo`: if the undo is still offered for the bot on screen, restores
history, asked text, files, reply, links and the waiting ask id, and returns
`"ok"`; otherwise `"nothing"`.

### `notice.say`

Each link goes through `linkButton` (label `plainLine` to 24 units; URL must
be `https`, or `http` to `localhost`, `127.0.0.1` or `::1`, without
credentials, whitespace, quotes or angle brackets, at most 2048 units). Any
link that fails makes the result `"invalid link"` with nothing changed.

Then `sayNotice`: `"empty text"` when `plainLine(text, 300)` is empty. If
`plainLine(title, 80)` names a bot (`matchBot`), the message is that bot's,
kept with its line breaks (`cleanText`, 4000 units):

- with no links and a question of that bot still waiting, it answers the
  oldest such question (as `reply.deliver` does);
- for a bot not on screen it becomes a new exchange in that bot's
  conversation (effects `unread`, `cue-peek`);
- for the bot on screen: effect `alert`, the latest exchange moves into
  history, and the message becomes the new latest reply with the links.

Any other title: effect `alert`, the latest exchange moves into history, and
the reply becomes `title + "\n" + text` (just `text` without a title) on
one line limited to 300 units, with the links.

### `reply.deliver`

`receiveReply`. `text` is cleaned with `cleanText` (4000 units; empty is
`"empty text"`). `target` (trimmed) is first looked up as a waiting ask id;
then as a bot id, or a bot name or short name matched case-insensitively
(ambiguous names match nothing), and that bot's oldest waiting question is
answered; with none waiting, the reply starts a new exchange in that bot's
conversation. No match: `"unknown ask or bot"`.

A waiting question's answer fills its own exchange wherever it now is: the
latest exchange on screen, an earlier one in history, or another bot's
conversation (marked unread). If that exchange was cleared, the answer starts
a new exchange instead. When the answer is on screen: effects `cue-active`
then `landed`.

### `dictate`

`dictateText`: effect `dictation-ended` first, always. `plainLine(text, 4000)`
empty: `"empty"`. No wake phrase: `"ignored"` (the caller types the text
instead). An ask running: `"busy"`. Otherwise the named bot is selected
(effect `select`, when it is in the roster), effects `draft-clear` and
`open`, then `"opened"` if nothing follows the wake phrase, else `launchAsk`
with the rest (`"ok"`, `"busy"` or `"error"`).

## Events

| Event | Params |
| --- | --- |
| `state` | the snapshot, below |
| `ask.delta` | `botId` (the asking bot), `askId`, `text`: the whole reply so far, cleaned with `cleanText` (4000 units). It replaces the previous delta; do not concatenate. |
| `effect` | `kind`, `botId` (string, may be `""`), `text` (string, may be `""`) |

Unknown events and unknown fields must be ignored.

## The `state` snapshot

Always for the bot on screen (`botId`):

| Field | Type | QML property |
| --- | --- | --- |
| `botId` | string | the daemon's view of `threadBotId` |
| `history` | array of `{asked, files, body, links, wait}`, oldest first, at most 40 | `history` |
| `asked` | string | `askedText` |
| `files` | array of strings | `askedFiles` |
| `pending` | array of strings | `pendingFiles` |
| `body` | string | `bubbleBody` |
| `partial` | string | latest `ask.delta` text while the bot on screen is asking, else `""` |
| `links` | array of `{label, url}` | `noticeLinks` |
| `wait` | string | `awaitingId` |
| `asking` | boolean | `asking` |
| `askBotId` | string | `askBotId` (keeps the last asking bot after the ask ends, as QML does) |
| `askId` | string | the running ask's id, `""` when none |
| `unreadBots` | array of strings | `unreadBots` |
| `awaitingBots` | array of strings | bots with at least one waiting question (no QML equivalent) |
| `undo` | boolean | `undoShown` |
| `historyOmitted` | integer | how many of the oldest history entries were left out of this snapshot to keep the frame under 1 MiB; normally 0 |

Assign every field onto its property on each `state` event. Show
`partial !== "" ? partial : body` as the latest reply text, so a streamed
reply grows in place and the final `state` replaces it. `askingHere`,
`waitingHere`, `busyHere` and `canClear` follow from these fields as before.
If `historyOmitted` is non-zero the omitted entries still exist in the
daemon; only the snapshot is short.

## Effects

Effects are one-shot instructions for view state the daemon does not own.
Apply them in order, after the `state` event before them.

| `kind` | Fields | Client action (Main.qml) |
| --- | --- | --- |
| `open` | `botId` | `openBubble()` |
| `select` | `botId` | run the view side of `selectBot(botId)` (chosen bot, recent bots, appearance, hop, save, draft stash/restore, expression). The daemon has already switched; the resulting `view.set` with the same id is a no-op. |
| `draft-clear` | `botId` | `promptDraft = ""` (of the bot now on screen) |
| `dictation-ended` | | `dictating = false` |
| `ask-started` | `botId` | `expression = "work"` |
| `idle` | `botId` | `expression = "idle"` |
| `rest` | | `if (!busyHere && expression === "work") expression = "idle"` (sent every 30 s while questions wait) |
| `landed` | `botId`, `text` | `flashExpression("happy", 1600); syllableAnim.restart(); replyLanded()` |
| `failed` | `botId`, `text` | `expression = "idle"; replyLanded()`: an ask ended on screen without a reply (error, timeout) |
| `unread` | `botId` | `if (!bubbleOpen) replyUnread = true; hop()` (the dot itself is `unreadBots`) |
| `cue-active` | `botId`, `text` | `if (canShowReplyCue(botId)) showActiveCue(text)` |
| `cue-peek` | `botId`, `text` | `if (canShowReplyCue(botId)) showPeekCue(botId, text)` |
| `alert` | `botId` | `summon(); flashExpression("alert", 1200); syllableAnim.restart()` |

For cues `text` is already `previewSnippet` (`plainLine`, 160 units) and
never empty; the daemon sends a cue for every reply, and the client applies
`canShowReplyCue` (present, bubble closed, Grok Bot app, screensaver). An ask
that ends for a bot that is not on screen sends `idle`, as QML does.

## Asks

One ask runs at a time. Its id is 12 lowercase hex characters, used as the
provider `requestId` and as the webhook ask id (`replyWith` and `reply
<askId>` keep working).

Each ask gets a fresh adapter instance for the bot's `provider`, closed when
the ask ends, exactly as each one-shot `bin/agent-desktop-ask` run starts a
fresh `bin/agent-desktop-provider`:

- `grokbot` and `example` run in the daemon process (`agent_desktop.grokbot.GrokBot`,
  `agent_desktop.example.Example`). GrokBot still runs `bin/grokbot-ask` as
  its per-ask worker.
- `hermes` runs `bin/agent-desktop-provider --provider hermes` with the
  Python and paths configured in `~/.config/omarchy/agent-desktop.json`
  (`agent_desktop.config.client_for`), because Hermes needs the Python
  environment of its own install. It is driven through the same interface.

`agent-desktop.json` is validated for every provider, as the one-shot path
does, so an unreadable file fails the ask with its message.

The adapter receives `message.send` with `agentId` (the bot's `agentId`),
`requestId`, `text` (the prompt, at most 4000 characters), `attachments` and
`timeoutSeconds` (from `agent_desktop.config.timeout_seconds()`, normally the
`askTimeoutSeconds` setting, 30 to 1800, default 180; 180 if it cannot be read). The whole
exchange is limited to `timeoutSeconds + 15` s, and the daemon itself stops
waiting after 1830 s (`askTimeout` in Main.qml).

Outcomes, matching the one-shot client's stdout/stderr/exit-code mapping:

| Provider outcome | Snapshot and effects |
| --- | --- |
| `message.delta` | `ask.delta`; `partial` |
| `message.finished` `completed` with valid text | reply `cleanText(text, 4000)`; on screen `cue-active`, `landed`; else `unread`, `cue-peek`, `idle`. Text that cleans to empty: `The ask didn't return a reply.` |
| `message.finished` other status | reply is the adapter's error message (400 units) or `The request stopped.`; on screen `cue-active`, `failed` |
| `message.deferred` with `deliveryId` equal to the ask id | the exchange waits (`wait`, `awaitingBots`); no effect |
| `message.deferred` with another `deliveryId` | reply `Reply identity changed; cannot route a deferred reply.` |
| `prompt.required` | the ask stops; reply `Hermes asked for approval, which the desktop cannot show yet. The request was stopped; run it in Hermes.` |
| refused `message.send` | the adapter's message |
| deadline, I/O failure | `Provider connection failed; inspect the agent before retrying.` |
| adapter crash | `Adapter operation failed; inspect local prerequisites.` |
| 1830 s | `That took too long, so I stopped waiting.`; on screen `failed` |

A waiting question that gets no answer for 10 minutes is answered with `No
answer yet. <label>'s reply will be in Grok Bot.` (`labelOf` the bot, `Bob`
when it is not in the roster), checked every 30 s while any question waits,
followed by `rest`.

## Control socket

While serving (`ctlSocket: true`), the daemon listens on
`$XDG_RUNTIME_DIR/agent-desktop/ctl.sock`
(`/run/user/<uid>` when `XDG_RUNTIME_DIR` is unset). It starts serving after
`hello`.

- `XDG_RUNTIME_DIR` must be a directory owned by the user with no group or
  other permissions. The `agent-desktop` directory is created 0700, or must
  already be a real directory (not a symlink) owned by the user with no group
  or other permissions. The socket is created 0600.
- An existing socket owned by the user that refuses connections is replaced.
  If another daemon is accepting on it, this daemon does not serve
  (`ctlSocket: false`). Any other existing file there, or an unsafe
  directory, also disables the socket, with one line on stderr.
- Every connection's peer must have the daemon's uid (`SO_PEERCRED`), or it is
  closed without a reply.
- On exit the daemon removes the socket only if it is still the inode it
  created.

One request per connection, read within 2 s, at most 64 KiB, UTF-8 fields
separated by `\x1f` and ended by `\x1e`:

```
agent-desktop/1 \x1f dictate \x1f <text> \x1e
agent-desktop/1 \x1f reply \x1f <target> \x1f <text> \x1e
```

(spaces added for reading). A field containing NUL is refused. The reply is
`OK\x1f<result>\x1e`, with the same result string as the `dictate` or
`reply.deliver` method, or `ERR\x1f<code>\x1e` for a malformed request.
These requests produce the same `state` and `effect` events as the methods.

`bin/grokbot-desktop-ctl reply <askId|bot>` and `dictate` read the text from
stdin only (at most 4000 characters) and try the daemon socket first, with
the same private-directory, owner and `SO_PEERCRED` checks. They fall back to
Omarchy's shell socket only when the `agent-desktop` directory or `ctl.sock`
does not exist or nothing is accepting on it (connection refused), since then
nothing can have been delivered. An unsafe directory or socket, or any
failure after connecting, ends with an error and no retry. Exit 0 means the
result was `ok` or `opened`.

## Errors, limits and shutdown

Error codes: `invalid_request` (bad envelope, params or JSON),
`handshake_required`, `incompatible_version` (`v` is not 1),
`duplicate_id`, `unsupported` (unknown method), `limit_exceeded`,
`internal_error`. A request that fails changes nothing and emits no events.

The daemon exits:

| Cause | Exit |
| --- | --- |
| stdin EOF, `shutdown`, SIGTERM, SIGINT | 0 |
| a line over 1 MiB | 1, after an `id:null` `limit_exceeded` error |
| a final line without `\n` | 0, after an `id:null` `invalid_request` error |
| stdout not drained for 5 s, or more than 1024 frames queued | 1 |

On exit it stops serving the control socket and removes it, cancels any ask
(no text, no events), closes every adapter, waits up to 15 s for workers to
be reaped, and flushes queued frames for up to 2 s. Remote webhook or Hermes
work that was already accepted may continue.

The client should restart a daemon that exits unexpectedly. Session state is
lost on restart; send `hello`, `roster.set`, `view.set` and
`attachments.set` again.

## What stays in QML

Drafts and their per-bot stash, attachment staging (`bin/grokbot-attach`),
the attachment note and menu, `replyUnread`, expressions and animations,
reply cues and their gating, the bubble, settings, roster loading,
appearance and every other view property. The daemon never sees appearance,
settings or keys.

## Transcripts

Real output of the daemon (`epoch` shortened to `E`). `>>` is sent to the
daemon, `<<` received. The deferred ask uses an adapter that acknowledges
like a webhook routine.

Handshake and setup:

```
>> {"v":1,"id":"1","method":"hello"}
<< {"v":1,"epoch":"E","id":"1","result":{"protocol":{"major":1,"minor":0},"server":"agent-desktopd","version":"0.2.0","maxFrameBytes":1048576,"ctlSocket":true,"historyLimit":40,"replyWaitMs":600000,"undoMs":8000}}
>> {"v":1,"id":"2","method":"roster.set","params":{"bots":[{"id":"example:echo","agentId":"echo","provider":"example","name":"Example Agent","shortName":"Echo"}]}}
<< {"v":1,"epoch":"E","id":"2","result":"ok"}
>> {"v":1,"id":"3","method":"view.set","params":{"botId":"example:echo","bubbleOpen":true}}
<< {"v":1,"epoch":"E","seq":1,"event":"state","params":{"botId":"example:echo","history":[],"asked":"","files":[],"pending":[],"body":"","partial":"","links":[],"wait":"","asking":false,"askBotId":"","askId":"","unreadBots":[],"awaitingBots":[],"undo":false,"historyOmitted":0}}
<< {"v":1,"epoch":"E","id":"3","result":"ok"}
```

An ask, streamed (the example adapter sends one delta before finishing):

```
>> {"v":1,"id":"4","method":"ask.send","params":{"text":"Hello"}}
<< {"v":1,"epoch":"E","seq":2,"event":"state","params":{"botId":"example:echo","history":[],"asked":"Hello","files":[],"pending":[],"body":"","partial":"","links":[],"wait":"","asking":true,"askBotId":"example:echo","askId":"3f9a0c1d2e4b","unreadBots":[],"awaitingBots":[],"undo":false,"historyOmitted":0}}
<< {"v":1,"epoch":"E","seq":3,"event":"effect","params":{"kind":"draft-clear","botId":"example:echo","text":""}}
<< {"v":1,"epoch":"E","seq":4,"event":"effect","params":{"kind":"open","botId":"example:echo","text":""}}
<< {"v":1,"epoch":"E","seq":5,"event":"effect","params":{"kind":"ask-started","botId":"example:echo","text":""}}
<< {"v":1,"epoch":"E","id":"4","result":"ok"}
<< {"v":1,"epoch":"E","seq":6,"event":"ask.delta","params":{"botId":"example:echo","askId":"3f9a0c1d2e4b","text":"Example:"}}
<< {"v":1,"epoch":"E","seq":7,"event":"state","params":{"botId":"example:echo","history":[],"asked":"Hello","files":[],"pending":[],"body":"Example: Hello","partial":"","links":[],"wait":"","asking":false,"askBotId":"example:echo","askId":"","unreadBots":[],"awaitingBots":[],"undo":false,"historyOmitted":0}}
<< {"v":1,"epoch":"E","seq":8,"event":"effect","params":{"kind":"cue-active","botId":"example:echo","text":"Example: Hello"}}
<< {"v":1,"epoch":"E","seq":9,"event":"effect","params":{"kind":"landed","botId":"example:echo","text":"Example: Hello"}}
```

A cancel, sent straight after the ask:

```
>> {"v":1,"id":"5","method":"ask.send","params":{"text":"Second"}}
>> {"v":1,"id":"6","method":"ask.cancel"}
<< {"v":1,"epoch":"E","seq":10,"event":"state","params":{"botId":"example:echo","history":[{"asked":"Hello","files":[],"body":"Example: Hello","links":[],"wait":""}],"asked":"Second","files":[],"pending":[],"body":"","partial":"","links":[],"wait":"","asking":true,"askBotId":"example:echo","askId":"7b1e5d9c0a3f","unreadBots":[],"awaitingBots":[],"undo":false,"historyOmitted":0}}
<< {"v":1,"epoch":"E","seq":11,"event":"effect","params":{"kind":"draft-clear","botId":"example:echo","text":""}}
<< {"v":1,"epoch":"E","seq":12,"event":"effect","params":{"kind":"open","botId":"example:echo","text":""}}
<< {"v":1,"epoch":"E","seq":13,"event":"effect","params":{"kind":"ask-started","botId":"example:echo","text":""}}
<< {"v":1,"epoch":"E","id":"5","result":"ok"}
<< {"v":1,"epoch":"E","seq":14,"event":"state","params":{"botId":"example:echo","history":[{"asked":"Hello","files":[],"body":"Example: Hello","links":[],"wait":""}],"asked":"Second","files":[],"pending":[],"body":"Stopped waiting. Remote work may continue; check the provider.","partial":"","links":[],"wait":"","asking":false,"askBotId":"example:echo","askId":"","unreadBots":[],"awaitingBots":[],"undo":false,"historyOmitted":0}}
<< {"v":1,"epoch":"E","seq":15,"event":"effect","params":{"kind":"cue-active","botId":"example:echo","text":"Stopped waiting. Remote work may continue; check the provider."}}
<< {"v":1,"epoch":"E","seq":16,"event":"effect","params":{"kind":"idle","botId":"example:echo","text":""}}
<< {"v":1,"epoch":"E","id":"6","result":"ok"}
```

A deferred (webhook) ask, then `printf 'Deployed.\n' | bin/grokbot-desktop-ctl reply c4d2e8f1a9b0`
(exit 0), then shutdown:

```
>> {"v":1,"id":"7","method":"ask.send","params":{"text":"Deploy it"}}
<< {"v":1,"epoch":"E","seq":17,"event":"state","params":{"botId":"example:echo","history":[{"asked":"Hello","files":[],"body":"Example: Hello","links":[],"wait":""},{"asked":"Second","files":[],"body":"Stopped waiting. Remote work may continue; check the provider.","links":[],"wait":""}],"asked":"Deploy it","files":[],"pending":[],"body":"","partial":"","links":[],"wait":"","asking":true,"askBotId":"example:echo","askId":"c4d2e8f1a9b0","unreadBots":[],"awaitingBots":[],"undo":false,"historyOmitted":0}}
<< {"v":1,"epoch":"E","seq":18,"event":"effect","params":{"kind":"draft-clear","botId":"example:echo","text":""}}
<< {"v":1,"epoch":"E","seq":19,"event":"effect","params":{"kind":"open","botId":"example:echo","text":""}}
<< {"v":1,"epoch":"E","seq":20,"event":"effect","params":{"kind":"ask-started","botId":"example:echo","text":""}}
<< {"v":1,"epoch":"E","id":"7","result":"ok"}
<< {"v":1,"epoch":"E","seq":21,"event":"state","params":{"botId":"example:echo","history":[{"asked":"Hello","files":[],"body":"Example: Hello","links":[],"wait":""},{"asked":"Second","files":[],"body":"Stopped waiting. Remote work may continue; check the provider.","links":[],"wait":""}],"asked":"Deploy it","files":[],"pending":[],"body":"","partial":"","links":[],"wait":"c4d2e8f1a9b0","asking":false,"askBotId":"example:echo","askId":"","unreadBots":[],"awaitingBots":["example:echo"],"undo":false,"historyOmitted":0}}
   (control socket: agent-desktop/1\x1freply\x1fc4d2e8f1a9b0\x1fDeployed.\n\x1e  ->  OK\x1fok\x1e)
<< {"v":1,"epoch":"E","seq":22,"event":"state","params":{"botId":"example:echo","history":[{"asked":"Hello","files":[],"body":"Example: Hello","links":[],"wait":""},{"asked":"Second","files":[],"body":"Stopped waiting. Remote work may continue; check the provider.","links":[],"wait":""}],"asked":"Deploy it","files":[],"pending":[],"body":"Deployed.","partial":"","links":[],"wait":"","asking":false,"askBotId":"example:echo","askId":"","unreadBots":[],"awaitingBots":[],"undo":false,"historyOmitted":0}}
<< {"v":1,"epoch":"E","seq":23,"event":"effect","params":{"kind":"cue-active","botId":"example:echo","text":"Deployed."}}
<< {"v":1,"epoch":"E","seq":24,"event":"effect","params":{"kind":"landed","botId":"example:echo","text":"Deployed."}}
>> {"v":1,"id":"8","method":"shutdown"}
<< {"v":1,"epoch":"E","id":"8","result":"ok"}
```

The daemon then exits 0 and removes `ctl.sock`.

Tests: `python3 tests/test_daemon_state.py` (conversation logic) and
`python3 tests/test_daemon.py` (the process, the control socket and
`bin/grokbot-desktop-ctl`). The socket tests skip, saying so, where Unix
sockets cannot be listened on.
