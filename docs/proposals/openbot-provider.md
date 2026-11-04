# Proposal: OpenBot provider adapter

Status: proposed, not implemented. This document asks maintainers to add
[OpenBot](https://github.com/nightly-labs/openbot) as a Provider API v1 adapter so
Agent Desktop can discover, ask and cancel against OpenBot agents the same way it
does with GrokBot and Hermes, including each agent's OpenBot avatar.

## Summary

Add an OpenBot adapter behind the existing Provider API v1 boundary. The adapter
translates OpenBot's Team API into `hello`, `agents.list`, `message.send`,
`request.cancel`, optional `history.list`, and the corresponding message events.
The desktop UI, roster, chat bubble and appearance code stay shared. A configured
OpenBot provider instance appears next to GrokBot and Hermes, with no second
companion or second full local OpenBot host.

## Motivation and user problem

The requester runs the OpenBot desktop AppImage on Omarchy against a remote,
self-hosted Team API host. The local OpenBot host is deliberately hidden
(`openbot:local-server-hidden`), so agents live on the remote host and are reached
over the Team API. That setup is the daily driver.

The GrokBot companion was previously removed from this Omarchy install, and the
user wants a floating companion for OpenBot agents without standing up another
full local OpenBot host just to host the desktop integration. The missing piece is
an adapter that speaks to the already configured remote Team API and surfaces the
same roster and avatars the OpenBot app shows.

## Fit with Agent Desktop scope

This is the integration shape [MULTI-PROVIDER-SCOPE](../MULTI-PROVIDER-SCOPE.md)
already defines: a new adapter, provider configuration, and conformance tests,
without another copy of the avatar or chat interface. Provider adapters own
upstream protocol details, discovery, authentication integration and capability
reporting; the desktop keeps one roster and one window.

OpenBot is not currently named in that document's future-candidates list, which
mentions OpenClaw, Dots and Muse. This proposal asks maintainers to add OpenBot to
that list and to the [future provider integration checklist](../MULTI-PROVIDER-SCOPE.md#future-provider-integration-checklist)
once the transport question below is resolved.

## Naming

`OpenBotAvatar.qml` and the "Open Bot Avatar" system in this repository are
Dominik Scholz's MIT-licensed vector character format. They are unrelated to the
OpenBot product. This proposal does not overload that name: the provider id should
be `openbot`, and user-facing copy should say "OpenBot provider" or "OpenBot
agent". Open Bot Avatar definitions remain an appearance concern and are never
included in prompts.

## Proposed adapter surface

The table maps OpenBot's documented routes to Provider API v1. Anything marked
"to verify against OpenBot contracts" is a question for the OpenBot side, not an
invented endpoint.

| Provider API v1 | OpenBot Team API | Notes |
| --- | --- | --- |
| `hello` | Provider instance config | Advertise only capabilities proven against the contracts below |
| `agents.list` | `GET /v1/agents` | Map each agent to `id`, `name`, `availability`; a failed discovery is an error, not an empty roster |
| `message.send` | `POST /v1/agents/:id/messages` (or the conversation send path) | Map streaming/progress to `message.delta`, `message.progress`, `message.finished` |
| `request.cancel` | Interrupt route | Report `remoteMayContinue` truthfully; never claim a remote turn stopped because the bubble closed |
| `history.list` | Conversation page | Only if bounded pages and an opaque cursor are feasible; otherwise advertise `history:false` |
| Avatars | `GET /v1/agents/:id/avatar` | `png`/`jpeg`/`webp`, plus `avatarHue`, agent-colors-v1 `#rrggbb`, and `avatarSeed` |

### Discovery

`GET /v1/agents` is the roster source. Each agent needs a stable native id, a
display name, and an availability value that maps to `unknown`, `ready` or
`offline`. Preserve the previous roster when discovery fails. Do not merge agents
by display name; the desktop already keys identity on
`(providerInstanceId, nativeAgentId)`.

### Ask and events

`message.send` should use `POST /v1/agents/:id/messages`, or whichever conversation
send path OpenBot documents for automation. Streaming or progress updates become
`message.delta` (cumulative snapshots) and `message.progress`; completion becomes
one `message.finished` with `completed`, `cancelled` or `failed`. If OpenBot only
exposes a non-streaming reply, advertise `streaming:false` rather than fabricating
deltas. Which response fields carry partial text and terminal status is **to verify
against OpenBot contracts**.

### Cancellation

Map the interrupt route to `request.cancel`. The acknowledgement must be honest:
if OpenBot cannot confirm that the remote turn stopped, return `remoteMayContinue`
instead of `confirmed`. This matches the existing GrokBot and Hermes semantics.

### History

`history.list` is optional. Use the conversation-page route only if it can return
bounded pages with an opaque cursor and an explicit history boundary. If not,
advertise `history:false` and leave the history control hidden.

### Avatars

The desktop mark today is the Grok silhouette morph driven by `qml/shapes.js`.
OpenBot agents have their own identity, so the adapter needs a different path: a
raster avatar from `GET /v1/agents/:id/avatar` (`png`, `jpeg` or `webp`) clipped
into the mark, or a hue-disk fallback from `avatarHue`, agent-colors-v1 `#rrggbb`
or `avatarSeed`. Shapes must not pretend to match OpenBot geometry. Roster chips
should show the same picture or colour the OpenBot app shows for that agent. How
raster avatars interact with the existing appearance and Open Bot Avatar settings
is an implementation detail to settle with maintainers.

### Authentication and transport

OpenBot's remote Team API is reached by app peers over WebRTC v9 DataChannels. A
plugin adapter cannot assume it may reuse the app's peer connection. Prefer
whatever **documented** local or HTTP path exists for automation. Inbound status
webhooks for routines are not the GrokBot ask/`replyWith` pattern and do not by
themselves provide ask-and-reply.

Verifying a supported, non-UI messaging path plus an authentication flow is a
prerequisite, at the same bar as the Dots investigation. No cookie scraping,
session extraction or reverse-engineered credential reuse. If no documented path
exists, record the blocker and defer the adapter rather than emulating OpenBot
through a different agent. The exact auth model, token lifetime and whether an
HTTP path exists for third-party clients are **to verify against OpenBot
contracts**.

## Out of scope for the v1 adapter

- Implementing or modifying OpenBot itself.
- Bundling the OpenBot AppImage or managing its installation.
- Computer Use, host tools, or desktop-as-computer work.
- Replacing or embedding the OpenBot UI.
- Open Bot Avatar costumes and unrelated appearance redesign.

## Acceptance sketch

- `agents.list` matches the OpenBot roster, with unavailable agents marked rather
  than dropped.
- A foreground ask round-trips: accepted, optional deltas/progress, one terminal
  event with the final text.
- Cancellation reports its real scope and does not claim remote success.
- The agent's avatar image, or its hue, is visible on the mark and the roster chip.
- One unavailable provider leaves the other configured providers usable.
- Conformance tests run against a deterministic fake OpenBot adapter before any
  live host is required, following the existing provider test pattern.

## References

- [nightly-labs/openbot](https://github.com/nightly-labs/openbot)
- Team API docs in that repository: `docs/architecture/team-api.md`
- Avatar route: `GET /v1/agents/:id/avatar`
- agent-colors-v1 and `avatarHue` / `avatarSeed`
- [Provider API v1](../PROVIDER-API.md)
- [Multi-provider scope](../MULTI-PROVIDER-SCOPE.md)
