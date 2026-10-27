# Develop and test the plugin

The project is already initialized as `io.github.tcballard.grokbot-desktop`. Run the portable checks from the repository root:

```bash
./tests/run
```

On a target Omarchy machine, run `omarchy plugin validate .` and record `omarchy-version` in `docs/ACCEPTANCE.json`. Portable checks cover the service manifest, the 14-shape morph, the palette, the bundled roster, and the ask, sync, and cursor helpers. The installed host's validator is authoritative. Passing `./tests/run` does not mean the layer shell, Hyprland socket, or webhook was exercised on a desktop.

`preview.png` is a frame from the live Try Omarchy session in `assets/grokbot-companion-demo.mp4` (`Virtual-1`, 1280×800). `tools/render-preview.py` remains a 3× supersampled offline drawing of the monochrome chrome and flat marks. When the design backdrop is present that script uses it; otherwise it paints a flat field. Regenerating with the script replaces the on-device preview, so keep the live frame unless the chrome itself has changed. The script still draws the older separate appearance drawer; the appearance settings now live on the bubble card's second page. The recorded session is in `docs/ACCEPTANCE.json`.

Use the current Omarchy plugin linking workflow or Plugin Workbench after inspecting its current commands. `.omarchy-workbench.json` proposes `./tests/run`. It does not grant trust or execute that command by itself.

Before a public release, document the exact verified install command and the installed host version. This repository has no published marketplace listing. Disable the plugin in the host's plugin manager before removing the linked copy.

## What a live pass should include

- The mark appears in the corner and clicks outside it reach the window underneath.
- Dragging updates only this plugin's `marginX` and `marginY`.
- Switching to OmaBot, Poteto, or another roster bot morphs the mark when sync is on.
- `omarchy-shell io.github.tcballard.grokbot-desktop summon` opens the bubble.
- An ask in webhook mode and in agent mode returns text into the bubble, or a plain error.
- Dodge and `idleMotion: false` behave as described in the README.
- Theme changes update an `omarchy` colour without a shell restart beyond what the host already does.
- With the bubble open, clicks elsewhere on the desktop reach the window underneath, and Esc steps back from the menu to the appearance page to closing the bubble.
- Opening the bubble, starting a drag, and closing the bubble again do not make the mark jump while the window grows from its compact corner box to the full output and back.
- `omarchy toggle animations` stops the breathing and bob and makes morphs and panel changes instant.
- The mark and eyes stay crisp on a 1.5× or 2× output.
- Motion is judged from a 60fps capture (for example `wf-recorder -r 60`); a 30fps recording cannot show frame pacing.

## Removal

`omarchy plugin remove io.github.tcballard.grokbot-desktop` removes the checkout and this plugin's `shell.json` entry. Leave these user files alone unless the owner asks:

- `~/.config/omarchy/grokbot-desktop.json`
- `~/.config/omarchy/grokbot-bots.json`
- `~/.config/omarchy/grokbot-webhook.key`

Also leave Hyprland bindings, `~/.local/share/applications/grokbot-desktop.desktop`, and `~/.local/bin/grokbot-desktop-close` unless those copies were part of the removal the owner requested.

Installed runtime files are the manifest, QML, `qml/*.js`, `data/bots.json`, `bin/*`, `assets/fonts/*` (Inter and its OFL licence), the licence, and the optional desktop, icon, and close helper. Authoring files (blueprint, workflows, tests, and `tools/`) are not part of that runtime set.

## Re-measuring Grok Bot's shapes

`qml/shapes.js` carries outlines and eyes measured from a screenshot of Grok Bot's Avatar > Shape sheet. To refresh them after the app changes its shapes, capture that sheet on a phone, convert it to sRGB, and run:

```bash
python3 tools/measure-avatars.py picker-srgb.png /tmp/measured.json --js qml/shapes.js
```

The tool needs numpy, scipy, scikit-image, and Pillow. It rewrites only the block between the `MEASURED SHAPES` markers. Then run `node tools/gaze-room.mjs` to regenerate the `GAZE ROOM` table, which bounds how far each shape's eyes follow the pointer; the tests fail while it is stale. It expects the fourteen shapes in rows of four, five, and five; check the printed extents and eye angles before committing.
