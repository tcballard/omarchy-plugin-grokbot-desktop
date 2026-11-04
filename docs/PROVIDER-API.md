# Agent Desktop Provider API v1

This is the v0.2.0 provider boundary: a local, versioned endpoint, reference
adapter, shared client, and GrokBot and experimental Hermes adapters. Desktop asks
go through the shared API client using GrokBot's existing configuration. Settings
includes provider selection and Hermes connection paths. Product branding is
Agent Desktop; the GitHub repository rename remains pending. The candidate is
prepared for review, not tagged or published. Live Hermes validation is pending.

The public integration boundary is **Agent Desktop Protocol v1**, not Hermes's
Python or gateway internals. Third-party hooks can invoke the endpoint below;
third-party providers can implement the same stdin/stdout protocol in any language.
No HTTP server, open port, shared token broker, or provider installation is added.

## Try the endpoint

Requires Python 3.11+. From the repository checkout:

```bash
printf 'Hello from my hook' | python3 -I examples/provider-client.py --provider example
```

The hook client sends its input over a pipe, prints correlated JSON events, and
exits after the terminal event. It never puts the prompt in process arguments or
replays failed work. It is an example foreground client, not an approval UI.

To interact directly, launch:

```bash
python3 -I bin/agent-desktop-provider --provider example
```

Write one JSON object per line to stdin. Keep stdin open while receiving events.
These three requests negotiate, discover, and submit:

```json
{"v":1,"id":"hello-1","method":"hello"}
{"v":1,"id":"list-1","method":"agents.list"}
{"v":1,"id":"send-1","method":"message.send","params":{"agentId":"echo","requestId":"turn-1","text":"Hello"}}
```

After `message.finished`, stop with:

```json
{"v":1,"id":"stop-1","method":"shutdown"}
```

EOF also detaches the adapter. Shutdown is **not** a promise to cancel remote
work. Cancel explicitly and inspect its acknowledgement before detaching.

## Wire contract

UTF-8 JSON Lines over private child-process stdin/stdout. Each frame includes its
newline and is at most 1 MiB. Reject duplicate JSON keys, non-finite numbers,
non-object frames, invalid UTF-8, and unterminated lines. stdout carries protocol
only. stderr must never contain credentials, prompts, chat text, or raw upstream
exceptions. Do not log protocol frames by default; they contain private content.

[The JSON Schema](../schemas/agent-desktop-v1.schema.json) defines envelopes. The
method and event requirements below define their payloads. This is a versioned
application protocol, not JSON-RPC 2.0.

| Frame | Required fields |
| --- | --- |
| Request | `v:1`, unique `id`, `method`; optional object `params` defaults to `{}` |
| Response | `v:1`, `epoch`, matching `id`, exactly one of object `result` or `error` |
| Event | `v:1`, `epoch`, monotonic `seq`, `event`, object `params` with `agentId` |

An uncorrelatable parse error uses response `id:null`. IDs use
`[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`. This applies to operation IDs, request IDs,
and native agent IDs. Session and prompt IDs are opaque upstream strings; never
parse or invent them. Unknown additional fields are reserved for additive changes.
Ignore unknown events after validating epoch/sequence; unsupported methods return
`unsupported`. Never send events to an adapter's input stream.

`hello` must be the first successful operation. Its result contains
`protocol:{major:1,minor:1}`, `provider`, `adapterVersion`, `maxFrameBytes`, and
`capabilities`. Major changes are breaking; v1 field meanings remain fixed.
Minor versions may add optional fields/events/capabilities. Version 1.1 adds deferred replies and `message.reply`; existing v1 clients can continue to await terminal events. A missing capability
means unsupported. A second handshake on the same connection is rejected.

Each adapter process has a fresh random `epoch`. Event sequence starts at 1 and
increments for every event, including background events. Clients must reject a
changed epoch, duplicate sequence, or gap on an open connection. Reconnect with a
fresh handshake; do not replay accepted or uncertain work. Operation IDs cannot
be reused, and this implementation requires a fresh connection after 4096
operations. Wait for active work before rotating a connection.

Reference adapters dispatch operations serially; their event stream runs while an
operation awaits its upstream receipt. Responses and events can interleave, and a
terminal event can precede the submission response. Clients must correlate both.
An operation ID identifies the RPC; `requestId` identifies the whole agent turn.

## Identity and capabilities

`agents.list` returns `{complete:true,agents:[...]}`. Each agent has `id`, `name`,
`availability` (`unknown`, `ready`, or `offline`), and `capabilities`. Optional
`avatarShape`/`avatarColor` are presentation hints, never executable configuration.
A discovery failure is an error, not an authoritative empty roster. Preserve the
previous roster on failure. A hidden Hermes profile is deliberately omitted.

Native IDs are scoped to a configured **provider instance**. A host must identify
an agent by `(providerInstanceId, nativeAgentId)`, not its display name, and scope
requests/events to that process connection and epoch. Two Hermes installations
can both advertise `default`. Their names and native IDs must not merge them.
Provider commands come only from explicit trusted user configuration, never from
the roster. The mixed-provider registry/picker is not implemented yet; the current desktop has a one-shot compatibility client.

| Capability | Meaning |
| --- | --- |
| `streaming` | Emits cumulative response snapshots before completion |
| `cancellation` | `request`, `session`, or `none`; session scope can affect other viewers |
| `attachments` | Supports attachment payloads; GrokBot local-agent mode accepts private staged file paths; Hermes/example return false |
| `history` | Supports `history.list` |
| `prompts` | Emits actionable approval/clarification prompts when supported |
| `multiSelect` | Supports multiple-choice selection arrays; currently false |
| `deferredReplies` | Emits `message.deferred` for an acknowledged request whose reply arrives later |
| `compaction` | Supports `session.compact` when the upstream version exposes it |

Clients must check capabilities. Do not silently drop attachments, change
providers, or turn an unsupported operation into a different action.

## Methods

| Method | Parameters | Result |
| --- | --- | --- |
| `hello` | None | Protocol version and capabilities above |
| `agents.list` | None | Complete roster snapshot |
| `message.send` | `agentId`, unique `requestId`, `text` (1–4000 characters), optional `timeoutSeconds` | `{requestId,sessionId,accepted:true}` means the adapter owns the request, not completion; GrokBot returns `delivery:"pending"` until its worker reports an outcome |
| `request.cancel` | `requestId` | `{requestId,status:"confirmed"}`, plus `scope:"session"` for Hermes |
| `history.list` | `agentId`, optional `sessionId`, optional `cursor` | `{sessionId,items,nextCursor,historyBoundary:"last_compaction",snapshot:true}` |
| `prompt.answer` | `agentId`, required `sessionId`, `promptId`, string `answer` | `{promptId,accepted:true}` only after acknowledgement |
| `session.compact` | `agentId`, required `sessionId` | `{sessionId,status}` from upstream |
| `message.reply` | `requestId`, `deliveryId`, `text` | Correlated callback acknowledgement; only adapters advertising `deferredReplies` |
| `shutdown` | None | `{stopped:true}` then adapter exits |

Hermes accepts `timeoutSeconds` between 1 and 1800, default 600. It starts the turn
budget after receiving admission; connection and submission have separate bounded
waits (10 and 30 seconds). Cancellation acknowledgement has a 5-second budget,
prompt answers 10 seconds, and compaction 180 seconds. The example always finishes
within 0.1 seconds and accepts no attachments. A deadline attempts interruption
before emitting failure, with `remoteMayContinue:true` unless confirmed. Each
supplied adapter admits at most one foreground turn per agent.

History is a snapshot captured at gateway attach, not a continuously refreshed
transcript. `items` are oldest first, each `{key,asked,body}`. Pages contain at most
20 exchanges, each displayed text capped at 4000 characters. `nextCursor:null`
means no earlier page in this snapshot; an unknown cursor returns an empty page.
Tool scaffolding and silent replies are excluded. Compaction history outside the
upstream's current snapshot is not available through this method.

## Events

All event params contain `agentId` and `sessionId`. Foreground events also contain
`requestId`; background events must never finish an unrelated foreground turn.

| Event | Additional parameters and semantics |
| --- | --- |
| `message.deferred` | `deliveryId`, `remoteMayContinue:true`: upstream acknowledged, final answer still pending |
| `agent.status` | `availability` |
| `message.delta` | `text`: cumulative snapshot, **replace** displayed text; do not concatenate |
| `message.progress` | `text`: separate temporary status |
| `message.finished` | `status`: `completed`, `cancelled`, or `failed`; final `text`; optional `error`, `background`, `remoteMayContinue` |
| `prompt.required` | `promptId`, `kind` (`approval`/`clarify`), `text`, `command`, `choices`, `multiSelect`, `answerable` |
| `prompt.settled` | `promptId`: no longer pending |

For a foreground request, consume one terminal event. Reject late foreground
events once terminal; do not reinterpret them as another request. Disconnection
before a terminal event means outcome unknown, even after an acceptance response.
Event replay across reconnect is not guaranteed in v1.

Approval is an explicit user action. Show the complete advertised command and
choices. Never approve automatically, infer a choice, or truncate a command and
present it as complete. `answerable:false` means review in Hermes; do not expose a
working approval button. The adapter refuses oversized commands, unsupported
multi-select prompts, missing approval choices, stale session/generation, and
answers outside advertised choices. It keeps an unacknowledged prompt pending;
a timeout is not evidence that Hermes rejected the answer.

## Errors and lifecycle

Errors have `{code,message,retryable}`. Codes include `invalid_request`,
`handshake_required`, `incompatible_version`, `unsupported`, `duplicate_id`,
`limit_exceeded`, `unavailable`, `offline`, `invalid_config`, `busy`,
`stale_session`, `stale_prompt`, `stale_request`, `deadline_exceeded`, `delivery_unknown`, and
`internal_error`. Messages are bounded diagnostics, not raw upstream errors.
`retryable` is a hint for reconnect/discovery, never permission to replay a
side-effecting call. A `delivery_unknown` result requires inspecting the upstream
session before deciding whether to submit new work.

The output queue holds at most 32 frames; a stalled consumer causes disconnection
instead of unbounded memory or silent loss of terminal events. Writes have a
5-second drain timeout. The host owns the adapter child and must reap it on exit.
Hermes owns its gateway and conversation: adapter shutdown detaches without
stopping that shared service or deleting any user data.

## GrokBot setup and desktop compatibility

```bash
printf 'Hello from my hook' | python3 -I examples/provider-client.py --provider grokbot
```

The shared client selects the first advertised bot unless `--agent ID` is given.
GrokBot reads the same `~/.config/omarchy/grokbot-bots.json` roster as the desktop,
using the bundled roster only when the file is absent. Invalid or duplicate
identities fail discovery. Dispatch settings, config precedence, key files,
webhook headers, trusted local-agent selection, and private staged attachments
are still handled by the existing `bin/grokbot-ask` worker. The adapter never
selects a transport from a roster field or silently substitutes Hermes.

A GrokBot `message.send` response with `delivery:"pending"` acknowledges adapter
ownership, not remote webhook acceptance. Wait for `message.finished` or
`message.deferred`; never treat this response as a completed answer. Worker errors
become bounded protocol errors without forwarding raw stderr. This makes the
admission stage explicit for a transport that has no native asynchronous receipt.

A webhook acknowledgement becomes `message.deferred`, not a successful terminal
event. A long-lived host forwards the authenticated/local callback using
`message.reply` with the original `requestId` and returned `deliveryId`. Unknown,
late, duplicate and mismatched callbacks are rejected. Callback identity can be
known before the HTTP acknowledgement; an early matching callback is accepted.
This method exists only on the private provider connection; it is not an
unauthenticated HTTP callback server. A host adding network ingress must secure
it before forwarding a callback.

The existing desktop still receives webhook callbacks through its established
`reply` IPC method. Its compatibility client maps `message.deferred` to the
existing exit-10 waiting state and detaches, leaving that generic waiting-exchange
logic responsible for the final reply. Existing hexadecimal ask IDs are preserved
as delivery IDs, so current webhook routines need no changes. Other API request
IDs receive a generated delivery ID. The sample hook exits 10 on deferral; it does
not claim completion or wait for callbacks it cannot receive.

GrokBot cancellation returns `scope:"local"`: the local worker is terminated and
reaped. For webhooks, `remoteMayContinue:true` means the remote routine cannot be
retracted. Local-agent descendants in the worker's process group are stopped too.
GrokBot turn deadlines are 180 seconds in local-agent mode and 600 seconds in
webhook mode by default (configurable 1–1800); the worker retains its existing
network/agent limits. The desktop compatibility client retains its 180-second
foreground deadline and existing ten-minute deferred-reply waiting behaviour.

Attachments are an optional array of up to four absolute paths to files already
staged by the desktop's attachment helper. The existing ownership, runtime-directory
and size checks apply. Webhook mode refuses attachments. No prompt, reply or key
is added to command arguments. The plugin ID, saved settings and webhook reply
command remain unchanged. The `agent_desktop` package must be included with the
runtime files when installing this branch.

## Hermes setup and compatibility (experimental)

Use the Python environment belonging to your existing Hermes install (with its
PyYAML and websockets dependencies). Configure both the profile root and source
checkout explicitly when they differ from the defaults:

```bash
printf 'Hello from my hook' | python3 -I examples/provider-client.py \
  --provider hermes --agent default \
  --python "$HOME/.hermes/hermes-agent/venv/bin/python" \
  --root "$HOME/.hermes" --agent-dir "$HOME/.hermes/hermes-agent"
```

The example paths are configurable, not an installer guarantee. Open the profile's
**Bot Chat** in Hermes first. The adapter uses the newest unarchived session with
that exact title. It can ask Hermes to start its own gateway if needed; it does not
install Hermes, create a conversation, copy credentials, or fall back to a CLI.
Profile discovery reads `profile.yaml` metadata and checks for `config.yaml`; it
does not extract credentials from configuration. Invalid metadata fails discovery
rather than revealing a profile that might have been marked hidden.

Gateway integration was source-reviewed against NousResearch/hermes-agent commit
[`4d26e0c`](https://github.com/NousResearch/hermes-agent/blob/4d26e0cceaed0a08ede833caec0ec6d6ca77a4b8/hermes_cli/gateway_client.py),
and adapted from Yani's bridge at
[`3cc16490`](https://github.com/Yani3rt/omarchy-plugin-hermes-blob/blob/3cc1649084efb98989a7cd335c009f30c44e426f/bin/hermes-blob-bridge).
These are source references, not a tested runtime version range. Feature probes
reject missing gateway dependencies; private upstream API changes may require an
adapter update without changing the public v1 contract. Full live compatibility
is pending. See [credits](../CREDITS.md).

## Implement another provider

Implement `hello` and `agents.list`, then `message.send` with one terminal event
per admitted request. Advertise unsupported features as false/none. Keep your
native API translation behind this boundary. Use the [example adapter](../agent_desktop/example.py)
and [server](../agent_desktop/protocol.py) as a Python reference, or implement the
same frames independently. No OpenClaw, Dots, or Muse API assumptions are baked in.

Run `python3 tests/provider-api.py` and `python3 tests/grokbot-api.py` for contract/lifecycle tests. They include a
real child-process pipe exchange plus real GrokBot local-worker and mocked Hermes gateway cases, not a real
Hermes server. Run `./tests/run` for the wider repository suite. A desktop release
still requires mixed-provider, native QML, and live Omarchy acceptance.

## v0.2.0 desktop binding

The Providers settings page refreshes Hermes profiles and optional example agents through `bin/agent-desktop-roster`. Grok identities retain their legacy IDs for settings compatibility; Hermes and example identities use `<provider>:<native-id>`. A roster row carries `provider` and `agentId` separately, and the shared one-shot client sends only the native identity to its adapter. Exact ambiguous display names are rejected by reply routing.

Provider runtime paths are configured in `~/.config/omarchy/agent-desktop.json`; see [candidate testing](TESTING-v0.2.0.md). Existing Grok credentials and dispatch configuration are preserved. The desktop currently consumes completed replies; the richer Hermes API methods remain available to protocol clients. Open Bot Avatar definitions belong to the desktop appearance settings and are never included in model prompts. Dots is out of scope.
