# OpenBot provider (proposed)

Status: proposed, not implemented. No OpenBot adapter, settings entry or selectable
provider exists in this release. This page describes what an OpenBot provider
would do and where the design is tracked.

## What it would do

An OpenBot provider would let Agent Desktop discover and talk to
[OpenBot](https://github.com/nightly-labs/openbot) agents through the same
[Provider API v1](PROVIDER-API.md) used by GrokBot and Hermes. The roster would
come from OpenBot's Team API (`GET /v1/agents`), asks would use the documented
message send path, and each agent's OpenBot avatar would be shown on the floating
mark and roster chips. The companion window, chat bubble and settings stay shared;
no second UI or second local OpenBot host is added.

Reaching a remote, self-hosted Team API from the plugin process requires a
supported non-UI messaging and authentication path. That path is not established
yet and is the main prerequisite before implementation.

## Open Bot Avatar is not OpenBot

`OpenBotAvatar.qml` and the "Open Bot Avatar" system are Dominik Scholz's
MIT-licensed vector character format, used for appearance in this project. They
are unrelated to the OpenBot product. The proposed provider id is `openbot` to
keep the two names separate.

## More detail

See [the full proposal](proposals/openbot-provider.md) for the capability map,
transport questions, out-of-scope items and acceptance sketch.
