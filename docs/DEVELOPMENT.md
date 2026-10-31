# Develop and test the plugin

The project is already initialized as `io.github.tcballard.grokbot-desktop`. Run the portable checks from the repository root:

```bash
./tests/run
```

On a target Omarchy machine, run `omarchy plugin validate .` and record `omarchy-version` in `docs/ACCEPTANCE.json`. Portable checks cover the service manifest, the 14-shape morph, the palette, the bundled roster, and the ask, sync, and cursor helpers. The installed host's validator is authoritative. Passing `./tests/run` does not mean the layer shell, Hyprland socket, or webhook was exercised on a desktop.

`preview.png` is a frame from the live Try Omarchy session in `assets/grokbot-companion-demo.mp4` (`Virtual-1`, 1280×800). `tools/render-preview.py` remains a 3× supersampled offline drawing of the monochrome chrome and flat marks. When the design backdrop is present that script uses it; otherwise it paints a flat field. Regenerating with the script replaces the on-device preview, so keep the live frame unless the chrome itself has changed. The script still draws the older separate appearance drawer; the appearance settings now live on the bubble card's second page. The recorded session is in `docs/ACCEPTANCE.json`.

After pulling a change into the installed checkout, run `omarchy restart shell` before checking it. The shell reloads the plugin on its own when files change, but on Omarchy 4 that reload kept running the old QML (seen with both `Main.qml` and `BubblePanel.qml`); only a restart loaded the change. The restart also clears every conversation and waiting question, since they are kept in memory.

Use the current Omarchy plugin linking workflow or Plugin Workbench after inspecting its current commands. `.omarchy-workbench.json` proposes `./tests/run`. It does not grant trust or execute that command by itself.

Before a public release, document the exact verified install command and the installed host version. This repository has no published marketplace listing. Disable the plugin in the host's plugin manager before removing the linked copy.

## What a live pass should include

- The mark appears in the corner and clicks outside it reach the window underneath.
- Dragging updates only this plugin's `marginX` and `marginY`.
- Switching to OmaBot, Poteto, or another roster bot morphs the mark when sync is on.
- `omarchy-shell io.github.tcballard.grokbot-desktop summon` opens the bubble.
- Hide companion in the menu sends a notification that brings the companion back when clicked, and `toggleVisible` shows and hides it.
- An ask in agent mode returns text into the bubble, or a plain error saying why it failed.
- `bin/grokbot-connect` connects the webhook only after its test ask is accepted. In webhook mode a question waits with typing dots until the routine answers with `reply`, or a `say` titled with the bot's name, and the answer lands under that question, in that bot's conversation.
- Dodge and `idleMotion: false` behave as described in the README.
- Theme changes update an `omarchy` colour without a shell restart beyond what the host already does.
- With the bubble open, clicks elsewhere on the desktop reach the window underneath, and Esc steps back from the menu to the appearance page to closing the bubble.
- Opening the bubble, starting a drag, and closing the bubble again leave the mark exactly where it was: the window covers the output and never resizes.
- With two monitors, drag the mark past the edge: it crosses, and after release it stays on that monitor while the pointer moves back. `monitor` in this plugin's shell entry is that output.
- `omarchy toggle animations` stops the breathing and bob and makes morphs and panel changes instant.
- The mark and eyes stay crisp on a 1.5× or 2× output.
- The mark hides while Omarchy's screensaver runs and returns after it.
- Each bot keeps its own conversation; Clear conversation and Undo work from the right-click menu.
- Paste image, Ctrl+V, Choose a file… (`omarchy-file-select`) and dropping a file all attach, and an agent-mode ask can use them.
- Every bubble change (page switch, thread, attach menu, tray, note, Undo chip) eases with no jump, and the card opens without overshoot.
- Motion is judged from a 60fps capture. Omarchy's own recorder (Alt+Print, or `omarchy capture screenrecording`) records at 60fps; a 30fps recording cannot show frame pacing.

[WALKTHROUGH.md](WALKTHROUGH.md) covers all of this as a guided tour from a fresh install.

## Removal

`omarchy plugin remove io.github.tcballard.grokbot-desktop` removes the checkout and this plugin's `shell.json` entry. Leave these user files alone unless the owner asks:

- `~/.config/omarchy/grokbot-desktop.json`
- `~/.config/omarchy/grokbot-bots.json`
- `~/.config/omarchy/grokbot-webhook.key`
- `~/.config/omarchy/grokbot-webhook-header.key`

Also leave Hyprland bindings, `~/.local/share/applications/grokbot-desktop.desktop`, and `~/.local/bin/grokbot-desktop-close` unless those copies were part of the removal the owner requested.

Installed runtime files are the manifest, QML, `qml/*.js`, `data/bots.json`, `bin/*`, `assets/fonts/*` (Inter and its OFL licence), the licence, and the optional desktop, icon, and close helper. Authoring files (blueprint, workflows, tests, and `tools/`) are not part of that runtime set.

## Re-measuring Grok Bot's shapes

`qml/shapes.js` carries outlines and eyes measured from a screenshot of Grok Bot's Avatar > Shape sheet. To refresh them after the app changes its shapes, capture that sheet on a phone, convert it to sRGB, and run:

```bash
python3 tools/measure-avatars.py picker-srgb.png /tmp/measured.json --js qml/shapes.js
```

The tool needs numpy, scipy, scikit-image, and Pillow. It rewrites only the block between the `MEASURED SHAPES` markers. Then run `node tools/look-table.mjs` to regenerate the `LOOK` table (each shape's face position, eye size, and how far its eyes can turn); the tests fail while it is stale. It expects the fourteen shapes in rows of four, five, and five; check the printed extents and eye angles before committing.
