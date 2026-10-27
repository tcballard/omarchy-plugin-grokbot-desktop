# Develop and test the plugin

The project is already initialized as `io.github.tcballard.grokbot-desktop`. Run the portable checks from the repository root:

```bash
./tests/run
```

On a target Omarchy machine, run `omarchy plugin validate .` and record `omarchy-version` in `docs/ACCEPTANCE.json`. Portable checks cover the service manifest, the 25-shape morph, the palette, the bundled roster, and the ask, sync, and cursor helpers. The installed host's validator is authoritative. Passing `./tests/run` does not mean the layer shell, Hyprland socket, or webhook was exercised on a desktop.

`preview.png` is produced by `tools/render-preview.py`, a 3× supersampled drawing of the monochrome chrome and flat marks. When the design backdrop is present the composite uses it; otherwise the script paints a flat field. Regenerate the preview when the marks or chrome change. It is an architectural composite, not an on-device capture, and acceptance stays `not-run` until someone records a live session.

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

## Removal

`omarchy plugin remove io.github.tcballard.grokbot-desktop` removes the checkout and this plugin's `shell.json` entry. Leave these user files alone unless the owner asks:

- `~/.config/omarchy/grokbot-desktop.json`
- `~/.config/omarchy/grokbot-bots.json`
- `~/.config/omarchy/grokbot-webhook.key`

Also leave Hyprland bindings, `~/.local/share/applications/grokbot-desktop.desktop`, and `~/.local/bin/grokbot-desktop-close` unless those copies were part of the removal the owner requested.

Installed runtime files are the manifest, QML, `qml/*.js`, `data/bots.json`, `bin/*`, the licence, and the optional desktop, icon, and close helper. Authoring files (blueprint, workflows, tests, and `tools/`) are not part of that runtime set.
