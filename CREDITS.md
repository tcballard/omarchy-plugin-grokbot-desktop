# Credits and provenance

**Inspired by [Clippy for Omarchy](https://github.com/jankeesvw/omarchy-clippy) by Jankees van Woezik and [Clanky](https://github.com/rdoupe/omarchy-clanky) by Ryan Doupe.** Both are MIT-licensed Omarchy layer-shell companions. This project follows their window, click-through, dodge, cursor-socket, and speech-bubble ideas. It does not copy their code, wire rigs, robot artwork, or manual tips.

Template authorship: Tom Ballard, 2026, MIT. Preserve this attribution when adapting the starter.
Project author: Tom Ballard.

- plugin conventions: [build-omarchy-plugins](https://github.com/tcballard/build-omarchy-plugins).
- Community badge artwork: [omarchy-badges](https://github.com/tcballard/omarchy-badges), pinned to 75975e5b5bf75e7ede3764bcd2950046f7abfe2c. No badge artwork is bundled.

The mark outlines and eyes in `qml/shapes.js` are measured by `tools/measure-avatars.py` from screenshots of Grok Bot's own avatar picker, and the colours in `qml/palette.js` are Grok Bot's; no Grok Bot image files are bundled. `assets/grokbot-desktop.svg` is original to this repository. `preview.png` and `assets/grokbot-companion-demo.mp4` are a screen capture of this plugin running on Try Omarchy (`Virtual-1`, 1280×800) on 2026-10-27. The rocket-launch wallpaper belongs to that desktop session. It is not a separate asset of this plugin. `tools/render-preview.py` can redraw the chrome offline and is not the source of `preview.png`.

`assets/fonts/Inter-Regular.ttf` and `assets/fonts/Inter-SemiBold.ttf` are [Inter](https://github.com/rsms/inter) 4.1 by Rasmus Andersson and the Inter Project Authors, under the SIL Open Font License 1.1 (`assets/fonts/OFL-Inter.txt`), subset to Latin, Greek, and Cyrillic. They stand in for Apple's SF Pro, which Grok Bot's app uses and which may only be used on Apple platforms.

The bundled roster in `data/bots.json` uses ids, names, shapes, and colours from Tom Ballard's Grok Bot export. Descriptions in the repository are shortened public role lines, not the bots' private instructions. Crediting an inspiration does not grant permission to copy its code or artwork.

## Hermes gateway adapter

`agent_desktop/hermes_gateway.py` adapts the Bot Chat transport, event bookkeeping,
and history presentation from [Yani3rt/omarchy-plugin-hermes-blob](https://github.com/Yani3rt/omarchy-plugin-hermes-blob),
`bin/hermes-blob-bridge` at commit `3cc1649084efb98989a7cd335c009f30c44e426f`.
Credit to Yani3rt for the Hermes integration. That fork carries the MIT license,
Copyright (c) 2026 Tom Ballard; its license notice is preserved in this repository's
[LICENSE](LICENSE). The public Agent Desktop protocol and adapter wrapper are new
work here. Hermes itself remains a separately installed dependency.

## Open Bot Avatar

The avatar v1 contract, geometry validator, volume and motion engine, design prompt (`data/avatar-design-prompt.md`), and bundled rocket/ghost definitions are from [Dominik Scholz's Open Bot Avatar](https://github.com/DominikScholz/open-bot-avatar), MIT, Copyright (c) 2026 Dominik Scholz. The exact revision is recorded in `data/open-bot-avatar-source.json`; the license is retained in `licenses/open-bot-avatar-MIT.txt`. `qml/openbotavatar.js` is generated with TypeScript removal, ES2016 syntax lowering and local flat/flatMap compatibility substitutions. `OpenBotAvatar.qml` draws the upstream frame data using native Qt Shapes.

Stable-shell compatibility and follow-ups, Hex dictation, monitor dragging and reply interaction improvements incorporate contributions from PRs #17, #18, #24 and #25, including Yani3rt's `pr24-followups`. The timeout setting follows PR #26 while retaining the existing supervised process cleanup.
