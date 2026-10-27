# Architecture

`Main.qml` is a `kind: service` entry point. It runs inside the long-running `omarchy-shell` Quickshell process and mounts one transparent `PanelWindow` on `WlrLayershell`, anchored to the full output. The mark is placed with `marginX` and `marginY` from the corner named by `anchor` (`br`, `bl`, `tr`, or `tl`). The compositor does not resize the surface when the bubble opens. A `mask` limits pointer input to the mark and, while it is open, the bubble card (chat and appearance pages). The rest of the desktop stays clickable with the bubble open; the minimize button, Esc, a click on the mark, or `dismiss` closes it. Only the right-click menu widens the mask to the output, so a click anywhere closes the menu.

Dodge mode, on by default, uses the cursor helper rather than the layer surface. When the pointer comes near the mark, the mask drops and the mark fades until the pointer has rested inside the mark. Calm motion keeps a slow breath and skips the float. Playful adds the float and the gaze spring. Hyper orbits and hops. Gaze spring frames run only while the eyes are catching up. Blink, ask, and named animations still run when they are triggered.

`qml/shapes.js` stores the 25 Grok Bot marks as closed contours resampled to the same point count, so `morphProgress` can blend any mark into any other. `qml/palette.js` stores the 11 named colours. `qml/theme.js` holds the chrome colours for the card, menu, and name tag. Text uses the shell's `Style.font.family` (the `omarchy font set` alias) when the shell has it. `qml/face.js` sizes the two eye cut-outs: rounded rectangles that are tall capsules when open and flatten into lid lines when they blink or sleep. `omarchy` is not a swatch: the shell reads `accent` from the active theme `colors.toml`, with `Commons.Color` as the fallback, and crossfades it with the same morph.

`CompanionMark.qml` fills a flat silhouette. There is no outline and no highlight. The face is two capsule cutouts, tilted about 11 degrees, in `#141416` (or `#F4F4F5` on black). They shift with the gaze, squash on a blink, and squint or open for think, happy, alert, and sleep. After two minutes without a cursor event the capsules become slits. An optional `avatarImage` on a roster bot is clipped to the mark when appearance is synced from that bot. Official roster shapes such as `teardrop`, `blob`, `hex`, `tablet`, `wedge`, and `squircle` alias onto the 25 picker contours.

Speech-bubble and settings strings that come from the roster, the prompt, a reply, or IPC use `Text.PlainText`.

## Processes

Both helpers are started with a cleared environment.

- `bin/grokbot-cursor` is `/usr/bin/python3 -I -S`. It may see only `HYPRLAND_INSTANCE_SIGNATURE` and `XDG_RUNTIME_DIR`, asks Hyprland for `cursorpos`, and prints `x y` when the position changes. It exits when its parent changes.
- `bin/grokbot-ask` is `/usr/bin/setpriv --pdeathsig TERM` then `/usr/bin/python3 -I`. Stdin is `{"botId","botName","prompt","host"}`. Webhook mode reads the bearer token from `~/.config/omarchy/grokbot-webhook.key` or `GROKBOT_WEBHOOK_KEY` and POSTs those four fields. Agent mode resolves `grok`, `claude`, `codex`, `opencode`, and the other Omarchy agent names from trusted directories, writes the prompt to that process's stdin, and stops at 64 KiB of stdout. The token and the prompt are not arguments.

`Component.onDestruction` stops both processes. Hiding the companion cancels an ask in flight. Closing the bubble, Esc, or a click outside it does not; the Stop button in the composer does. A reply that arrives while the bubble is closed leaves a dot on the mark until the bubble opens.

`bin/grokbot-sync` is not a shell child. Run it when a local agents directory should replace `~/.config/omarchy/grokbot-bots.json`. The service watches that file and falls back to `data/bots.json`.

The waveform button launches `bin/grokbot-dictate`, which execs `omarchy dictation toggle` when `omarchy` is on `PATH`. That command follows `~/.config/omarchy/defaults/dictation` (`superwhisper` or `voxtype`). Without `omarchy`, the helper execs `superwhisper record` or `voxtype record toggle`. It does not take the transcript as an argument.

`qml/dictation.js` and `bin/grokbot-dictation-route` share the wake-phrase rules. `dictate` IPC and a prompt that starts with "Hey <name>" both use the QML copy. Voxtype's `[output.post_process]` filter and `bin/grokbot-dictation-route --wtype` use the Python copy so a wake phrase is not typed into the focused window. `bin/grokbot-voice-watch --enable` is the opt-in Superwhisper and Voxtype watcher. It is not started by the shell service. `bin/grokbot-desktop-ctl` forwards one IPC call to `omarchy-shell`.

## Settings ownership

Position, the active bot, sync, custom shape and colour, size, dodge, and idle motion are written through `shell.updateEntryInline` onto this plugin's own `plugins[]` entry, merged with keys already there. Dispatch URL and command are read from that entry or from `~/.config/omarchy/grokbot-desktop.json` and are not rewritten by the service.

Removal of the plugin does not delete `grokbot-desktop.json`, `grokbot-bots.json`, or `grokbot-webhook.key`. The service does not edit Hyprland. `grokbot-desktop-close` and `grokbot-desktop.desktop` are opt-in copies.

Node runs the portable checks only. It is not part of the shell plugin.

Workbench registration and command trust remain explicit user actions. Portable checks do not establish live desktop acceptance.
