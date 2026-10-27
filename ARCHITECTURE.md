# Architecture

`Main.qml` is a `kind: service` entry point. It runs inside the long-running `omarchy-shell` Quickshell process and mounts one transparent `PanelWindow` on `WlrLayershell`, anchored to the full output. The mark is placed with `marginX` and `marginY` from the bottom-right corner. The compositor does not resize the surface when the bubble opens. A `mask` limits pointer input to the mark while the bubble, settings drawer, and right-click menu are closed. While any of those are open, the mask covers the output so a click outside dismisses them.

Dodge mode, on by default, uses the cursor helper rather than the layer surface. When the pointer comes near the mark, the mask drops and the mark fades until the pointer has rested inside the mark. `idleMotion: false` stops the breathing float. Gaze spring frames run only while the eyes are catching up, and only when idle motion is on. Blink, ask, and named animations still run when they are triggered.

`qml/shapes.js` stores the 25 Grok Bot marks as closed contours resampled to the same point count, so `morphProgress` can blend any mark into any other. `qml/palette.js` stores the 11 named colours. `omarchy` is not a swatch: the shell reads `accent` from the active theme `colors.toml`, with `Commons.Color` as the fallback, and crossfades it with the same morph.

`CompanionMark.qml` fills the contour, paints a highlight offset by gaze, and draws the face. Expressions are idle, blink, happy arcs, a thinking squint with orbiting dots, alert eyes, and sleep (a line and floating z's after two minutes without a cursor event). An optional `avatarImage` on a roster bot is clipped to the mark when appearance is synced from that bot.

Speech-bubble and settings strings that come from the roster, the prompt, a reply, or IPC use `Text.PlainText`.

## Processes

Both helpers are started with a cleared environment.

- `bin/grokbot-cursor` is `/usr/bin/python3 -I -S`. It may see only `HYPRLAND_INSTANCE_SIGNATURE` and `XDG_RUNTIME_DIR`, asks Hyprland for `cursorpos`, and prints `x y` when the position changes. It exits when its parent changes.
- `bin/grokbot-ask` is `/usr/bin/setpriv --pdeathsig TERM` then `/usr/bin/python3 -I`. Stdin is `{"botId","botName","prompt","host"}`. Webhook mode reads the bearer token from `~/.config/omarchy/grokbot-webhook.key` or `GROKBOT_WEBHOOK_KEY` and POSTs those four fields. Agent mode resolves `grok`, `claude`, `codex`, `opencode`, and the other Omarchy agent names from trusted directories, writes the prompt to that process's stdin, and stops at 64 KiB of stdout. The token and the prompt are not arguments.

`Component.onDestruction` stops both processes. Hiding the companion cancels an ask in flight.

`bin/grokbot-sync` is not a shell child. Run it when a local agents directory should replace `~/.config/omarchy/grokbot-bots.json`. The service watches that file and falls back to `data/bots.json`.

## Settings ownership

Position, the active bot, sync, custom shape and colour, size, dodge, and idle motion are written through `shell.updateEntryInline` onto this plugin's own `plugins[]` entry, merged with keys already there. Dispatch URL and command are read from that entry or from `~/.config/omarchy/grokbot-desktop.json` and are not rewritten by the service.

Removal of the plugin does not delete `grokbot-desktop.json`, `grokbot-bots.json`, or `grokbot-webhook.key`. The service does not edit Hyprland. `grokbot-desktop-close` and `grokbot-desktop.desktop` are opt-in copies.

Node runs the portable checks only. It is not part of the shell plugin.

Workbench registration and command trust remain explicit user actions. Portable checks do not establish live desktop acceptance.
