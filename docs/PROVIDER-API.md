# Agent Desktop Provider API v1

This is the first implemented slice of the v0.2.0 multi-provider feature: a local,
versioned endpoint, a reference adapter, a hook client, and a Hermes gateway adapter.
The existing desktop still uses its Grok/local paths. Mixed-provider QML routing,
provider configuration, migration, and the product/repository rename are subsequent
work on the feature branch. This is not a v0.2.0 release or live Hermes acceptance.

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
`protocol:{major:1,minor:0}`, `provider`, `adapterVersion`, `maxFrameBytes`, and
`capabilities`. Major changes are breaking; v1 field meanings remain fixed.
Minor versions may add optional fields/events/capabilities. A missing capability
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
the roster. The mixed-provider registry/desktop controller is not implemented yet.

| Capability | Meaning |
| --- | --- |
| `streaming` | Emits cumulative response snapshots before completion |
| `cancellation` | `request`, `session`, or `none`; session scope can affect other viewers |
| `attachments` | Supports attachment payloads; both supplied adapters currently return false |
| `history` | Supports `history.list` |
| `prompts` | Emits actionable approval/clarification prompts when supported |
| `multiSelect` | Supports multiple-choice selection arrays; currently false |
| `compaction` | Supports `session.compact` when the upstream version exposes it |

Clients must check capabilities. Do not silently drop attachments, change
providers, or turn an unsupported operation into a different action.

## Methods

| Method | Parameters | Result |
| --- | --- | --- |
| `hello` | None | Protocol version and capabilities above |
| `agents.list` | None | Complete roster snapshot |
| `message.send` | `agentId`, unique `requestId`, `text` (1–4000 characters), optional `timeoutSeconds` | `{requestId,sessionId,accepted:true}` means upstream admission, not completion |
| `request.cancel` | `requestId` | `{requestId,status:"confirmed"}`, plus `scope:"session"` for Hermes |
| `history.list` | `agentId`, optional `sessionId`, optional `cursor` | `{sessionId,items,nextCursor,historyBoundary:"last_compaction",snapshot:true}` |
| `prompt.answer` | `agentId`, required `sessionId`, `promptId`, string `answer` | `{promptId,accepted:true}` only after acknowledgement |
| `session.compact` | `agentId`, required `sessionId` | `{sessionId,status}` from upstream |
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
`stale_session`, `stale_prompt`, `deadline_exceeded`, `delivery_unknown`, and
`internal_error`. Messages are bounded diagnostics, not raw upstream errors.
`retryable` is a hint for reconnect/discovery, never permission to replay a
side-effecting call. A `delivery_unknown` result requires inspecting the upstream
session before deciding whether to submit new work.

The output queue holds at most 32 frames; a stalled consumer causes disconnection
instead of unbounded memory or silent loss of terminal events. Writes have a
5-second drain timeout. The host owns the adapter child and must reap it on exit.
Hermes owns its gateway and conversation: adapter shutdown detaches without
stopping that shared service or deleting any user data.

## Hermes setup and compatibility

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

Run `python3 tests/provider-api.py` for contract/lifecycle tests. They include a
real child-process pipe exchange plus mocked Hermes gateway cases, not a real
Hermes server. Run `./tests/run` for the wider repository suite. A desktop release
still requires mixed-provider, native QML, and live Omarchy acceptance.
