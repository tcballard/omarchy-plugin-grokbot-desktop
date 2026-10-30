# Roadmap

## Current local additions

Requested after the v0.1.0 testing pass: an app-roster Sync button in Appearance & bots and a persistent name badge beneath the companion. These need a fresh live check before release; the earlier acceptance does not cover them. They are additions to the untagged first-release candidate, not a v0.1.n patch.

## Versions

- **v0.1.n: fixes only.** A patch changes how shipped behaviour works, never what ships: no new settings, IPC commands or features. Every patch still needs a live pass recorded in `ACCEPTANCE.json` before it can be tagged (see [RELEASE.md](RELEASE.md)). Batch fixes, and re-check the areas they touch plus the short list below rather than the whole v0.1.0 runbook.
- **v0.2.0: costumes.** Scoped below.

Patch check, for every v0.1.n: the mark loads and follows the pointer, clicks pass through, the bubble opens and closes without moving the mark, an agent-mode ask answers, `omarchy plugin validate` passes, and nothing from the plugin shows in `journalctl --user -t omarchy-shell`.

### Known for v0.1.1

- **Sleeping eyes as dots.** One report says Bob's eyes show as dots rather than lid lines after two minutes idle. Offscreen renders at 1×, 1.5× and 2×, in Calm and Playful and on all fourteen shapes, all show lid lines; the reporting XPS runs at 1.25×, which those renders did not cover. Needs a close-up with the shape, size, motion, Dodge state and `hyprctl monitors` scale.

### Branches while both are open

`main` stays releasable as v0.1.n until the first costume PR is ready to merge. At that point, create `release/0.1` from the latest v0.1.n tag. Then:

- Fixes merge to `main` first and are cherry-picked onto `release/0.1`.
- v0.1.n tags are cut from `release/0.1`.
- Costumes merge to `main` freely.

CI runs on pull requests to any branch, so `release/0.1` fixes are checked like the rest.

## v0.2.0: costumes

A costume changes how the companion looks without pretending to be a different Grok Bot. Costumes are optional and off by default. They sit outside the Grok Bot avatar picker, which keeps matching the app, and the bot's colour always shows, so it stays clear who is answering.

### What v0.2.0 ships

- **The costume system:**
  - A `costume` setting on this plugin's own entry: `{ "accessory": "party-hat" }`, with `body` and `style` keys reserved but not yet accepted.
  - IPC `costume <name>` and `costume off`.
  - A "Costume" row on the appearance page, below and visibly apart from the Grok Bot picker. Reset to default leaves the costume alone.
- **Two or three accessories:** a party hat, sunglasses, and possibly one seasonal item. All are original artwork.

### What an accessory has to do

- Be drawn over the bot's outline, after the eye cut-out, in its own colours.
- Fit each of the fourteen shapes. Like the pumpkin stem, each accessory has an anchor per shape, measured or set by hand and checked against each shape in rendered checks. The tests fail if a shape has no anchor.
- Turn with the head. The outline tilts up to 25° as the face turns (`Face.rotatePoints` with `turned.turn` and `turned.centre`), and the accessory must use the same rotation, unlike the stem, which only appears on the still picker tile.
- Morph with the bot. During a bot switch the anchor blends between the two shapes, the same way the eyes do.
- Fit inside the mark's box. The body uses a radius of 0.43 × size, so tall items need room above it. Decide whether the box grows for them, because that also moves the click-through area and the window's input region.
- Stop moving with animations off, like everything else.

### Later, not in v0.2.0

- **Styles:** the same outline drawn differently (outline only, neon glow, pixel, sketch). Pixel needs care to stay crisp at 1.5× and 2× scaling.
- **Bodies:** a replacement shape, starting with "Paperclip", an original paperclip and not Microsoft's Clippit. A body needs its own drawing, eyes on top instead of cut through, and a pop-out-and-in when you switch bots instead of a morph.
- **Per-bot costumes:** only if a single global costume turns out to be limiting.

### Not planned

- Copies of other companies' characters, including Clippit and its catchphrases.
- Costumes in the Grok Bot avatar picker, or written into Grok Bot's own data.

### Done means

- Focused tests for the setting, the IPC command, and an anchor on every shape.
- Rendered checks of each accessory on all fourteen shapes: at rest, turned fully left, right, up and down, and halfway through a bot switch.
- A live pass on the XPS with a 60 fps capture, recorded in `ACCEPTANCE.json`.
- README sections for the setting and IPC command, and release notes in the v0.1.0 style.
