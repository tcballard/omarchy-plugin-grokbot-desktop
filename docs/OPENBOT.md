# OpenBot provider

Status: experimental, opt-in contribution. The provider id is `openbot`; it is
selectable in Settings next to GrokBot and Hermes once the provider entry exists
in `~/.config/omarchy/agent-desktop.json`. This document describes a Local scripts
adapter only. Live validation against a real OpenBot deployment is the
integrator's responsibility; the repository ships portable tests, not a live
acceptance record.

## What it does

The adapter maps OpenBot's documented [Local scripts API](https://github.com/nightly-labs/openbot/blob/main/docs/automation.md)
onto the same [Provider API v1](PROVIDER-API.md) used by the other providers:

| Provider API v1 | OpenBot Local scripts API |
| --- | --- |
| `agents.list` | `GET /v1/agents` |
| `message.send` | `POST /v1/agents/:id/messages` with `{"text","clientMessageId"}` |
| completion | `GET /v1/agents/:id/deliveries/:deliveryId` until the delivery ends |

`agents.list` returns only agents that currently allow **Local scripts**. Agents
with that setting off do not appear at all, which is why the Preferences help text
says only Local scripts agents are listed. `availability` is `ready` for an
advertised agent.

`message.send` accepts the turn, then polls the returned delivery. Queued,
starting and running deliveries produce `message.progress`; the terminal delivery
produces one `message.finished` with the OpenBot `answer`. The poll deadline is
180 seconds by default.

Capabilities are deliberately honest: `streaming:false`, `cancellation:"none"`,
`attachments:false`, `history:false`, `prompts:false`, `compaction:false` and
`deferredReplies:false`. The Local scripts API documents no cancellation route,
so `request.cancel` returns `status:"unsupported"` with
`remoteMayContinue:true`; the remote turn is not claimed to have stopped.

## Required hop configuration

The plugin host reaches the Local scripts listener through an explicit shell hop.
There is no built-in host or container default. Configure a command that works in
your environment; a generic SSH example is:

```text
ssh -o BatchMode=yes -o ConnectTimeout=8 user@openbot-host docker exec -i openbot bash -lc
```

Replace `user@openbot-host` and the container command with your own deployment.
A Proxmox host could use `pct exec <vmid> -- docker exec -i openbot bash -lc` as
one optional pattern, but it is not assumed by this project.

The helper appends its remote script to that command. On the far side it reads
`/data/.config/OpenBot/automation/{url,headers}`; set `OPENBOT_AUTOMATION_DIR` to
override that directory. The bearer token is used only by `curl`'s `-H @headers`
form: this project never reads the token, prints it, or puts it in a command line.
Prompts are written to helper stdin, never argv.

Set the hop with the `OPENBOT_LOCAL_SCRIPTS_HOP` environment variable or in the
provider config. The hop is required when the provider is used; a missing hop
exits with a clear error naming both options.

```json
{
  "providers": {
    "openbot": {
      "hop": "ssh -o BatchMode=yes -o ConnectTimeout=8 user@openbot-host docker exec -i openbot bash -lc",
      "timeoutSeconds": 180
    }
  }
}
```

`timeoutSeconds` is the delivery polling deadline, between 1 and 1800. It is
optional and defaults to 180. The provider is discovered when `providers.openbot`
is present, or when `OPENBOT_LOCAL_SCRIPTS_HOP` is set. The environment variable
takes precedence over the config entry.

## Helper CLI

The helper can also be used directly:

```bash
./bin/openbot-local-scripts agents
printf 'Summarise the build failure' | ./bin/openbot-local-scripts send <agentId>
./bin/openbot-local-scripts delivery <agentId> <deliveryId>
```

All three print the upstream JSON, or exit non-zero with a short generic stderr
message on HTTP or transport failure.

## Known limits

- **Local scripts only.** The adapter does not use the OpenBot Team API, so
  agents without Local scripts enabled cannot be reached.
- **No attachments.** Messages are text only, from 1 to 4,000 characters.
- **No cancellation.** The Local scripts API has no cancellation route; cancel
  reports `unsupported` and says the remote turn may continue.
- **No streaming, history, prompts, compaction or deferred replies.** Those
  capabilities are advertised as unavailable rather than emulated.
- **No avatars from OpenBot.** The Local scripts avatar route returns 404, so
  this adapter does not sync OpenBot photos. Agents use `avatarShape:"blob"` and a
  stable `avatarColor` chosen from the existing palette by hashing the agent id
  and name. Full OpenBot photos need the Team API later; until then, do not expect
  the picture from the OpenBot app.
- **No live acceptance claim.** Portable contract tests cover the adapter; a live
  run against a real OpenBot deployment remains the integrator's responsibility.

## Open Bot Avatar is not OpenBot

`OpenBotAvatar.qml` and the "Open Bot Avatar" system are Dominik Scholz's
MIT-licensed vector character format, used for appearance in this project. They
are unrelated to the OpenBot product. The provider id is `openbot` to keep the two
names separate.
