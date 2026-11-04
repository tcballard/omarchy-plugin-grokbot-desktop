# OpenBot provider

Status: experimental Local scripts adapter. The provider id is `openbot`; it is
selectable in Settings next to GrokBot and Hermes once the provider entry exists
in `~/.config/omarchy/agent-desktop.json`. Live validation against the self-hosted
host is still a manual step.

## What it does

The adapter turns OpenBot's documented [Local scripts API](https://github.com/nightly-labs/openbot/blob/main/docs/automation.md)
into the same [Provider API v1](PROVIDER-API.md) used by the other providers:

| Provider API v1 | OpenBot Local scripts API |
| --- | --- |
| `agents.list` | `GET /v1/agents` |
| `message.send` | `POST /v1/agents/:id/messages` with `{"text","clientMessageId"}` |
| completion | `GET /v1/agents/:id/deliveries/:deliveryId` until the delivery ends |

`agents.list` returns the agents that currently allow **Local scripts**. Agents
with that setting off do not appear at all, which is why the Preferences help text
says only Local scripts agents are listed. `availability` is `ready` for an
advertised agent.

`message.send` accepts the turn, then polls the returned delivery. Queued,
starting and running deliveries produce `message.progress`; the terminal delivery
produces one `message.finished` with the OpenBot `answer`. The poll deadline is
180 seconds by default.

Capabilities are deliberately honest: `streaming:false`, `cancellation:"none"`,
`attachments:false`, `history:false`, `prompts:false` and
`deferredReplies:false`. The Local scripts API documents no cancellation route,
so `request.cancel` returns `status:"unsupported"` with
`remoteMayContinue:true`; the remote turn is not claimed to have stopped.

## Transport hop

The plugin host reaches the Local scripts listener through a configurable shell
hop. The default is:

```text
ssh -o BatchMode=yes -o ConnectTimeout=8 ovhlab pct exec 149 -- docker exec -i openbot bash -lc
```

The helper appends its remote script to that command. On the far side it reads
`/data/.config/OpenBot/automation/{url,headers}`. The bearer token is used only by
`curl`'s `-H @headers` form: this project never reads the token, prints it, or puts
it in a command line. Prompts are written to helper stdin, never argv.

Override the hop with `OPENBOT_LOCAL_SCRIPTS_HOP` or the provider config:

```json
{
  "providers": {
    "openbot": {
      "hop": "ssh -o BatchMode=yes ovhlab pct exec 149 -- docker exec -i openbot bash -lc",
      "timeoutSeconds": 180
    }
  }
}
```

`timeoutSeconds` is the delivery polling deadline, between 1 and 1800. The hop and
timeout are optional; the defaults above apply when the provider entry exists.
The provider is discovered when `providers.openbot` is present, or when
`OPENBOT_LOCAL_SCRIPTS_HOP` is set.

The helper can also be used directly:

```bash
./bin/openbot-local-scripts agents
printf 'Summarise the build failure' | ./bin/openbot-local-scripts send <agentId>
./bin/openbot-local-scripts delivery <agentId> <deliveryId>
```

All three print the upstream JSON, or exit non-zero with a short generic stderr
message on HTTP or transport failure.

## Avatars

The Local scripts avatar route returns 404, so this adapter does not sync OpenBot
photos. Agents use `avatarShape:"blob"` and a stable `avatarColor` chosen from the
existing palette by hashing the agent id and name. Full OpenBot photos need the
Team API later; until then, do not expect the picture from the OpenBot app.

## Open Bot Avatar is not OpenBot

`OpenBotAvatar.qml` and the "Open Bot Avatar" system are Dominik Scholz's
MIT-licensed vector character format, used for appearance in this project. They
are unrelated to the OpenBot product. The provider id is `openbot` to keep the two
names separate.
