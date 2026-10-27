<h1 align="center">Grok Bot Desktop Companion</h1>

<p align="center">A floating Grok Bot companion for the Omarchy desktop. It morphs into your bots and asks them from a speech bubble.</p>

<p align="center"><a href="https://github.com/tcballard/omarchy-badges"><img alt="Built for Omarchy: Plugin" height="20" src="https://raw.githubusercontent.com/tcballard/omarchy-badges/75975e5b5bf75e7ede3764bcd2950046f7abfe2c/badges/v1/omarchy-plugin.svg"></a></p>

**Inspired by [Clippy for Omarchy](https://github.com/jankeesvw/omarchy-clippy) and [Clanky](https://github.com/rdoupe/omarchy-clanky).** The layer-shell window, click-through mask, dodge behaviour, cursor helper, and speech-bubble IPC follow those companions. Plugin conventions come from [Build Omarchy Plugins](https://github.com/tcballard/build-omarchy-plugins).

<img src="preview.png" width="800" alt="Architectural preview of the Grok Bot companion in the corner of an Omarchy-style desktop, with the speech bubble, Bob's teardrop, and the shape and colour grid.">

**Preview:** `preview.png` is an architectural preview rendered from this repository's shape and palette data. It is not a live on-device capture. No desktop acceptance is claimed.

## Install

Intended for Omarchy 4 (Quattro) on Hyprland. This repository has no recorded live install yet. The command to try, once you have reviewed the code, is:

```bash
omarchy plugin add https://github.com/tcballard/omarchy-plugin-grokbot-desktop --enable
```

Optional launcher and close helper. Nothing copies these for you:

```bash
cp grokbot-desktop.desktop ~/.local/share/applications/
cp assets/grokbot-desktop.svg ~/.local/share/icons/hicolor/scalable/apps/io.github.tcballard.grokbot-desktop.svg
cp grokbot-desktop-close ~/.local/bin/
```

```lua
-- ~/.config/hypr/bindings.lua, only if you want Super+W to dismiss the bubble first
hl.unbind("SUPER + W")
o.bind("SUPER + W", "Close window / Grok Bot", "grokbot-desktop-close")
```

## Use

The companion sits in a corner. Clicks outside the mark pass through. Drag it, or hold Super and drag, and the corner margins are written back to its own `plugins[]` entry. Right-click, the gear in the bubble, or `settings` opens the appearance drawer.

| Action | Result |
| --- | --- |
| Click, `summon`, or `toggle` | Opens the speech bubble |
| Enter | Sends the prompt to the active Bot |
| Escape | Closes the bubble |
| Switch Bot | Morphs into that Bot's shape and colour when sync is on, and routes the next ask there |
| Pointer nearby, dodge on | Fades and lets clicks through until you rest on the mark |
| Pointer idle for 2 minutes | Eyes half-close and a couple of z's drift up |

Bob (`e0195a7d-f804-4688-9191-e2cf3574a6d1`, teardrop, orange) is the default. Asking Bob sends Bob's id, so a Grok Bot routine named for the Omarchy desktop companion can delegate to the other bots. This plugin only delivers the payload.

## IPC

```bash
omarchy-shell io.github.tcballard.grokbot-desktop summon
omarchy-shell io.github.tcballard.grokbot-desktop toggle
omarchy-shell io.github.tcballard.grokbot-desktop hide
omarchy-shell io.github.tcballard.grokbot-desktop show
omarchy-shell io.github.tcballard.grokbot-desktop settings
omarchy-shell io.github.tcballard.grokbot-desktop ask "What's on my calendar?"
omarchy-shell io.github.tcballard.grokbot-desktop bot "OmaBot"
omarchy-shell io.github.tcballard.grokbot-desktop appearance hex green
omarchy-shell io.github.tcballard.grokbot-desktop animate hop
omarchy-shell io.github.tcballard.grokbot-desktop say "Bob" "Morning briefing is ready."
omarchy-shell io.github.tcballard.grokbot-desktop sayLink "PR Merged" "omarchy-spaces #27 merged." "Open PR" "https://github.com/tornikegomareli/omarchy-spaces/pull/27"
```

`animate` accepts `wave`, `think`, `happy`, `celebrate`, `alert`, `sleep`, `hop`, `spin`, and `morph`. `sayLinks` takes a second label and URL. Links must be `https`, or `http` to localhost, with no credentials. A button opens only when you click it.

`bot` accepts an id, a short name (`OmaBot`, `Poteto`, `dr eggbot`), or the full profile name.

## Dispatch

Each ask is one JSON object on the stdin of `bin/grokbot-ask`, launched as `/usr/bin/setpriv` and `/usr/bin/python3 -I`. The prompt is not an argument.

Set `dispatch` to `webhook` or `agent` in `~/.config/omarchy/grokbot-desktop.json`. The same keys on this plugin's `shell.json` entry win when they are present.

Webhook mode POSTs exactly:

```json
{ "botId": "…", "botName": "Bob", "prompt": "…", "host": "…" }
```

The bearer token is read from `~/.config/omarchy/grokbot-webhook.key` (mode `0600`) or from `GROKBOT_WEBHOOK_KEY` in the helper's own environment. The shell does not put that variable on the helper command line. The URL must be `https`, or `http` to localhost.

Agent mode is the fallback. It reads `~/.config/omarchy/defaults/agent` and can target `grok`, `claude`, `codex`, `opencode`, `gemini`, `copilot`, `crush`, `pi`, or `omp`. A `command` array overrides that and still receives the prompt on stdin. Stdout is capped at 64 KiB.

```json
{
  "dispatch": "webhook",
  "webhookUrl": "https://example.invalid/omarchy-desktop-companion"
}
```

```json
{
  "id": "io.github.tcballard.grokbot-desktop",
  "botId": "e0195a7d-f804-4688-9191-e2cf3574a6d1",
  "syncAppearance": true,
  "dodge": true,
  "idleMotion": true,
  "size": "medium",
  "marginX": 24,
  "marginY": 24
}
```

`size` may be `small`, `medium`, `large`, or `custom` with `sizePx` from 48 to 320. `idleMotion: false` stops the idle float so a resting companion is not repainting every frame. `syncAppearance: false` keeps a custom shape and colour while asks still go to the selected Bot.

## Roster

`data/bots.json` is the bundled roster: ids, names, shapes, and colours from the live export, with descriptions shortened to a public role line. `bin/grokbot-sync` refreshes `~/.config/omarchy/grokbot-bots.json` from a local agents directory (`--from`, `agentsDir`, or `GROKBOT_AGENTS_DIR`). It keeps `id`, `name`, `avatarShape`, `avatarColor`, and a redacted one-line description. The companion watches that file.

## Remove

```bash
omarchy plugin remove io.github.tcballard.grokbot-desktop
```

That removes the plugin checkout and its `shell.json` entry. It does not delete `~/.config/omarchy/grokbot-desktop.json`, `~/.config/omarchy/grokbot-bots.json`, or `~/.config/omarchy/grokbot-webhook.key`. Hyprland bindings and the copied desktop file stay until you remove them.

## Development

```bash
./tests/run
```

[Build, run and remove](docs/DEVELOPMENT.md) · [Architecture](ARCHITECTURE.md) · [Release process](docs/RELEASE.md)

## Compatibility

Intended target: Omarchy 4 / Hyprland. Exact installed Omarchy versions tested: **none yet**.
Portable checks cover structure, the roster, shape morphing, the palette, and the ask and sync helpers. They do not establish live desktop compatibility. Record a real run in [acceptance evidence](docs/ACCEPTANCE.json).

## Credits

Built from [Build Omarchy Plugins](https://github.com/tcballard/build-omarchy-plugins) guidance and the Omarchy template set. [Sources, inspiration and assets](CREDITS.md).

## Licence

[MIT](LICENSE). Third-party software and media retain their own licences.
