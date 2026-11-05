# OpenBot provider

Status: experimental and opt-in. The provider id is `openbot`. It appears in
Settings next to GrokBot and Hermes only after `providers.openbot` exists in
`~/.config/omarchy/agent-desktop.json`, or `OPENBOT_LOCAL_SCRIPTS_HOP` is set.
This page describes the Local scripts adapter in this tree. It is not a live
acceptance record.

## Access model

Local scripts needs a shell on the computer that runs OpenBot, as an OS user who
can read that host's automation files. Those files hold the listener URL and the
bearer token. Turning Local scripts on lets that user message the enabled agents.
The token is sent only by `curl -H @headers` on the OpenBot host. This project
never reads the token, prints it, or places it in a command line.

This is not the Team API. A Team API credential cannot replace the hop or the
host token. Team API messaging for a remote, self-hosted OpenBot is a separate
unresolved investigation: the OpenBot
[Team API](https://github.com/nightly-labs/openbot/blob/main/docs/architecture/team-api.md)
and the proposal in
[pull request 36](https://github.com/tcballard/omarchy-plugin-grokbot-desktop/pull/36).
This adapter does not implement that path.

Official Local scripts reference:
[automation.md](https://github.com/nightly-labs/openbot/blob/main/docs/automation.md).

## What it does

The adapter maps a narrow part of Local scripts onto [Provider API v1](PROVIDER-API.md):

| Provider API v1 | OpenBot Local scripts API |
| --- | --- |
| `agents.list` | `GET /v1/agents` |
| `message.send` | `POST /v1/agents/:id/messages` with `{"text","clientMessageId"}` |
| completion | `GET /v1/agents/:id/deliveries/:deliveryId` until the delivery ends |
| someone must answer | `GET /v1/agents/:id/pending` |

`GET /v1/agents` lists only agents that currently allow Local scripts. Agents with
that setting off are absent. This adapter does not add a second filter and does
not invent agents the API did not return. `availability` is `ready` for an
advertised agent.

`message.send` accepts the turn only when the receipt contains one delivery whose
`recipientAgentId` is the requested agent. Later polls must return that same
delivery `id`. A missing or different identity is rejected. Queued, starting and
running deliveries produce `message.progress`. The terminal delivery produces one
`message.finished`. An invalid payload, or three transport failures, also produces
one `message.finished` failure while the connection is still alive. The desktop
does not automatically send the prompt again.

While a delivery is still running, the adapter polls `pending`. A question, an
approval, a secret question or a browser takeover becomes one unanswerable
`prompt.required` that tells you to continue in OpenBot. The adapter does not
call the prompt-answer or approval-response routes. Secret questions and browser
takeovers stay in OpenBot. Inline answering is later work.

The v0.2.2 desktop shows that handoff on the streaming ask path used for every
provider other than GrokBot. The card is not an answer form. Stopping the bubble
stops the wait. The bubble says remote work may continue.

## Capabilities

Advertised on purpose:

| Capability | Value | What that means here |
| --- | --- | --- |
| `streaming` | `false` | Progress text only. No `message.delta` and no partial answer. |
| `cancellation` | `"none"` | `request.cancel` returns `unsupported` and `remoteMayContinue: true`. |
| `attachments` | `false` | Messages are text. Attachments are rejected. |
| `history` | `false` | The history helper returns an empty page. |
| `prompts` | `false` | Pending work is a handoff. `prompt.answer` is rejected. |
| `compaction` | `false` | Not implemented. |
| `deferredReplies` | `false` | Not implemented. |

There is no cancel endpoint. Closing the ask, or killing the local SSH process,
does not confirm that OpenBot stopped the turn. Native avatar photos are not
read. Agents use `avatarShape: "blob"` and a stable `avatarColor` from the
existing palette. The Local scripts avatar route is not used.

## Required hop

There is no built-in host, container or lab default. Set a command that works in
your deployment:

```text
ssh -o BatchMode=yes -o ConnectTimeout=8 user@openbot-host docker exec -i openbot bash -lc
```

Replace the user, host and container command. A Proxmox host might use
`pct exec <vmid> -- docker exec -i openbot bash -lc`. That shape is an example,
not a default.

The helper appends one remote bash script. When the hop starts with `ssh`, or
with `sudo` or `command` in front of an `ssh` binary of any path, that script is
a single quoted remote argument. A hop that is not SSH receives the script as its
own argument, which is what `bash -lc` expects.

```json
{
  "providers": {
    "openbot": {
      "hop": "ssh -o BatchMode=yes -o ConnectTimeout=8 user@openbot-host docker exec -i openbot bash -lc",
      "automationDir": "/data/.config/OpenBot/automation",
      "timeoutSeconds": 180
    }
  }
}
```

`OPENBOT_LOCAL_SCRIPTS_HOP` overrides `providers.openbot.hop`. A missing hop is an
error that names both places. Prompts are written to the helper's stdin, never
to argv.

## Automation directory

`/data/.config/OpenBot/automation` is the path inside the container used by the
example `docker exec` hop. It is not the path on a normal Linux desktop.

OpenBot's own files, on the OS user that runs OpenBot, are:

- Linux: `~/.config/OpenBot/automation`
- macOS: `~/Library/Application Support/OpenBot/automation`
- Windows: `%APPDATA%\OpenBot\automation`

The `url` file must be exactly `http://127.0.0.1:<port>`. Other hosts, `https`,
userinfo and extra path segments are rejected before `curl` runs.

Set the host directory with `providers.openbot.automationDir` or
`OPENBOT_REMOTE_AUTOMATION_DIR`. The value is quoted into the remote script, so
it is part of the SSH command and does not depend on SSH environment forwarding.
`OPENBOT_REMOTE_AUTOMATION_DIR` overrides the config value. When neither is set,
the script uses the container path above.

`OPENBOT_AUTOMATION_DIR` is not forwarded by SSH and this helper ignores it.
Setting it on the desktop does not change the directory read on the OpenBot host.

For a native OpenBot on the SSH account, the config looks like this:

```json
{
  "providers": {
    "openbot": {
      "hop": "ssh -o BatchMode=yes -o ConnectTimeout=8 user@openbot-host bash -lc",
      "automationDir": "/home/user/.config/OpenBot/automation",
      "timeoutSeconds": 180
    }
  }
}
```

Use the remote account's home, not the desktop's home.

## Timeouts

The delivery wait is chosen in this order:

1. `timeoutSeconds` on that `message.send`, when the caller set it.
2. `providers.openbot.timeoutSeconds`, from 1 to 1800 seconds.
3. The desktop's shared ask timeout, the same value other providers use.

The ask helper does not copy the shared timeout into an OpenBot request when
step 2 is set. Each HTTP call still uses a short transport timeout of 30
seconds. The bubble also gives up at about 30.5 minutes; that stops the wait
only.

## Diagnostics and bounds

Hop, SSH and curl stderr are discarded. Failures are a fixed category such as
`hop_timeout`, `unreachable`, `invalid_url` or `http_404`. Callers see a short
message for that category, not the upstream text. A delivery's own `error`
string, when OpenBot reports the turn failed, is kept and truncated.

Reads stop when stdout passes 64 KiB or stderr passes 4 KiB. The remote response
file is capped as bytes arrive. The helper and its hop run in their own process
groups. Stopping the helper also stops the hop and the hop's local children.
That is local cleanup, not remote cancellation.

## Helper CLI

```bash
./bin/openbot-local-scripts agents
printf 'Summarise the build failure' | ./bin/openbot-local-scripts send <agentId>
./bin/openbot-local-scripts delivery <agentId> <deliveryId>
./bin/openbot-local-scripts pending <agentId>
```

Success prints the upstream JSON. Failure prints one category token on stderr
and exits non-zero.

## Known limits

- Local scripts only. Agents without that setting are not listed.
- Text messages from 1 to 4,000 characters. No attachments.
- No remote cancel. Stop means stop waiting.
- No streaming deltas, history, compaction, deferred replies or native photos.
- Questions, approvals, secret questions and browser takeovers are answered in
  OpenBot. This desktop detects them and does not answer them.
- No live acceptance in this repository. Portable tests do not discover a real
  roster, send a live message, show a pending handoff on a desktop, restart a
  host, or prove that disabled agents stay hidden.

## Open Bot Avatar is not OpenBot

`OpenBotAvatar.qml` and the "Open Bot Avatar" system are Dominik Scholz's
MIT-licensed vector character format, used for appearance in this project. They
are unrelated to the OpenBot product. The provider id is `openbot` to keep the
two names separate.
