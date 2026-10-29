# Credits and provenance

**Inspired by [Clippy for Omarchy](https://github.com/jankeesvw/omarchy-clippy) by Jankees van Woezik and [Clanky](https://github.com/rdoupe/omarchy-clanky) by Ryan Doupe.** Both are MIT-licensed Omarchy layer-shell companions. This project follows their window, click-through, dodge, cursor-socket, and speech-bubble ideas. It does not copy their code, wire rigs, robot artwork, or manual tips.

Template authorship: Tom Ballard, 2026, MIT. Preserve this attribution when adapting the starter.
Project author: Tom Ballard.

- plugin conventions: [build-omarchy-plugins](https://github.com/tcballard/build-omarchy-plugins).
- Community badge artwork: [omarchy-badges](https://github.com/tcballard/omarchy-badges), pinned to 75975e5b5bf75e7ede3764bcd2950046f7abfe2c. No badge artwork is bundled.

The mark outlines and eyes in `qml/shapes.js` are measured by `tools/measure-avatars.py` from screenshots of Grok Bot's own avatar picker, and the colours in `qml/palette.js` are Grok Bot's; no Grok Bot image files are bundled. `assets/grokbot-desktop.svg` is original to this repository. `preview.png` and `assets/grokbot-companion-demo.mp4` are a screen capture of this plugin running on Try Omarchy (`Virtual-1`, 1280×800) on 2026-10-27. The rocket-launch wallpaper belongs to that desktop session. It is not a separate asset of this plugin. `tools/render-preview.py` can redraw the chrome offline and is not the source of `preview.png`.

`assets/fonts/Inter-Regular.ttf` and `assets/fonts/Inter-SemiBold.ttf` are [Inter](https://github.com/rsms/inter) 4.1 by Rasmus Andersson and the Inter Project Authors, under the SIL Open Font License 1.1 (`assets/fonts/OFL-Inter.txt`), subset to Latin, Greek, and Cyrillic. They stand in for Apple's SF Pro, which Grok Bot's app uses and which may only be used on Apple platforms.

The bundled roster in `data/bots.json` uses ids, names, shapes, and colours from Tom Ballard's Grok Bot export. Descriptions in the repository are shortened public role lines, not the bots' private instructions. Crediting an inspiration does not grant permission to copy its code or artwork.
