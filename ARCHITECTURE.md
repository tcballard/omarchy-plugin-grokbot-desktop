# Architecture

`Main.qml` is a `kind: service` entry point. It runs inside the long-running `omarchy-shell` Quickshell process and mounts one transparent `PanelWindow` on `WlrLayershell`. The mark is placed with `marginX` and `marginY` from the corner named by `anchor` (`br`, `bl`, `tr`, or `tl`). While nothing is open the window is a small box around the mark, anchored to that corner, so the idle animations redraw a few hundred pixels rather than the whole output. It is anchored to the full output while the bubble card or menu is showing, during a drag, and while the mark changes corners. Placement follows the size the compositor has actually given the window, so the mark stays put while a resize is in flight. A `mask` limits pointer input to the mark and, while it is open, the bubble card (chat and appearance pages). The rest of the desktop stays clickable with the bubble open; the minimize button, Esc, a click on the mark, or `dismiss` closes it. Only the right-click menu widens the mask to the output, so a click anywhere closes the menu.

Dodge mode, on by default, uses the cursor helper rather than the layer surface. When the pointer comes near the mark, the mask drops and the mark fades until the pointer has rested inside the mark. Calm motion keeps a slow breath and skips the float. Playful adds the float and the gaze spring. Hyper orbits and hops. Gaze spring frames run only while the eyes are catching up. Blink, ask, and named animations still run when they are triggered.

`qml/shapes.js` stores Grok Bot's fourteen avatar shapes, measured from the app's own avatar picker by `tools/measure-avatars.py`: each outline (tilt included) resampled to the same point count, the two eye capsules for that shape, and the picker's pumpkin stem for the pebble. `morphProgress` can blend any shape into any other, eyes included. `qml/palette.js` stores the 11 named colours. `qml/theme.js` holds the chrome colours for the card, menu, and name tag. Text uses the shell's `Style.font.family` (the `omarchy font set` alias) when the shell has it. `CompanionMark.qml` draws the silhouette as a `QtQuick.Shapes` path (the curve renderer where Qt has it) and the eyes as two rotated rounded rectangles (`MarkEye.qml`), so the mark is drawn on the GPU and stays crisp at fractional scales; only a bot photo, when one is set, is clipped through a Canvas. `qml/face.js` sizes the two eye cut-outs: rounded rectangles that are tall capsules when open and flatten into lid lines when they blink or sleep. `omarchy` is not a swatch: the shell reads `accent` from the active theme `colors.toml`, with `Commons.Color` as the fallback, and crossfades it with the same morph.

`CompanionMark.qml` fills a flat silhouette. There is no outline and no highlight. The face is two capsules placed, sized, and tilted for each shape as Grok Bot draws them, leaning with their tops to the left. On the desktop they are cut through the shape (a `MultiEffect` inverted mask over supersampled, mipmapped layers), so the wallpaper shows through as it would through the app's avatar; in the bubble and appearance page they are painted in the colour of the surface behind (`#F4F4F5` on black). They shift with the gaze, squash on a blink, and squint or open for think, happy, alert, and sleep. After two minutes without a cursor event the capsules become slits. An optional `avatarImage` on a roster bot is clipped to the mark when appearance is synced from that bot. Roster shapes such as `teardrop`, `blob`, `hex`, `tablet`, `wedge`, `squircle`, `pebble`, and `cloud` are the app's own names: Grok Bot's roster shows `blob` as the round shape and `pebble` as the lumpy round one, which its picker decorates with a pumpkin stem that avatars do not wear. The remaining shapes are named for how they look, and older names alias onto the nearest of the fourteen.

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
