# v0.1.0: release runbook and draft notes

v0.1.0 is the first tagged release. `VERSION` and `manifest.json` already say `0.1.0`.

## Why a live pass comes first

`scripts/archive.mjs` builds the release archive only when `docs/ACCEPTANCE.json` records a passed live run against a commit, and nothing but documentation has changed since that commit. The recorded run is from `a8a5d0b` (27 October), and the companion's runtime has changed a lot since, so the release needs a fresh live pass on the commit being released.

Any change to QML, `qml/*.js`, `bin/*`, `data/`, `assets/`, `preview.png` or the manifest after the pass means testing again. Documentation (`docs/`, `README.md`, `CREDITS.md`) can still change.

## 1. Install from `main`, the way users will

Keep a log open in one terminal:

```bash
journalctl --user -t omarchy-shell -f
```

In another, swap the branch checkout for a clean install of `main` with the README's own command. This also exercises removal:

```bash
ID=io.github.tcballard.grokbot-desktop
omarchy plugin remove "$ID"
ls ~/.config/omarchy/grokbot-desktop.json ~/.config/omarchy/grokbot-bots.json ~/.config/omarchy/grokbot-webhook.key 2>&1
omarchy plugin add https://github.com/tcballard/omarchy-plugin-grokbot-desktop --enable
D=~/.config/omarchy/plugins/$ID
git -C "$D" rev-parse HEAD
omarchy-version
omarchy plugin validate "$D"
```

- The `ls` line should still list whichever of those files you had: removal keeps your settings, roster and key.
- Keep the output of `rev-parse`, `omarchy-version` and `validate`. They go into the acceptance record.

## 2. Live checks

Note anything that fails or looks off. A failure means a fix, a new commit, and this pass again on that commit.

**Mark**
- [ ] Bob appears in the corner; clicks around the mark reach the window underneath.
- [ ] The eyes follow the pointer across the screen, and the face turns toward it.
- [ ] With the pointer right on Bob, the eyes face forward at a normal size.
- [ ] Dragging moves the mark and it stays where it is dropped.
- [ ] Opening and closing the bubble leaves the mark exactly where it was.
- [ ] Bob is hidden while the screensaver runs and comes back after it.

**Bubble**
- [ ] It opens with a short settle and no bounce.
- [ ] The appearance page and the chat cross-fade, with the card's height following.
- [ ] The divider, the thread, the attach menu, attachment tray, note and Undo chip ease in and out with no jumps.
- [ ] A long prompt wraps, and Shift+Enter starts a new line.
- [ ] The header pill shows the bot's name; its role slides out on hover.

**Asking and conversations**
- [ ] An ask through Grok in agent mode answers in the bubble, and the mark looks around while it works.
- [ ] A second ask keeps the first exchange above it in a scrolling thread.
- [ ] Switching bots shows each bot's own conversation, and a reply to a bot you left gets a dot.
- [ ] Right-click > Clear conversation clears it, and Undo brings it back.

**Attachments**
- [ ] + > Paste image attaches a copied image, and Ctrl+V does the same.
- [ ] + > Choose a file… opens Omarchy's chooser; an image and a non-image file both attach.
- [ ] Dropping a file on the bubble attaches it.
- [ ] An ask with an image gets an answer that shows the agent saw it.

**System**
- [ ] `omarchy toggle animations` makes panel changes and morphs instant.
- [ ] Optional: in webhook mode with the routine's Sender key, an ask reaches Grok Bot. If it still returns 401, it ships as a known limitation.

## 3. Capture

- [ ] A screenshot for the README: the bubble open with a short conversation and an attachment thumbnail, plus the mark.
- [ ] Optional: a 15–20 second clip at 60fps of the bubble opening, an ask, and a bot switch: `wf-recorder -r 60 -f ~/grokbot-v0.1.0.mp4`.

New pictures go under `docs/media/` so they don't count as runtime changes. The existing `preview.png` and demo video stay as the 27 October record.

## 4. Record, tag, release

1. A documentation-only commit records the pass in `docs/ACCEPTANCE.json`:
   - status `passed`, with `input_commit` set to the SHA from step 1
   - the date, the XPS and Omarchy version, the commands and results
   - what was not exercised, under limitations
   It also moves the README preview to the new capture.
2. Tag that commit `v0.1.0` and push the tag.
3. Run **Release source** from Actions with `v0.1.0`. It runs the tests, builds the source archive with its SHA256SUMS and opens a draft release.
4. Replace the draft's placeholder text with the notes below, adjusted to what the pass confirmed, and publish.

## Draft release notes

> **Grok Bot Desktop Companion v0.1.0**
>
> Your Grok Bots, on the Omarchy desktop. A small companion sits in a corner of the screen, looks like whichever bot you're talking to, and answers in a speech bubble without taking you out of what you're doing.
>
> **What you get**
> - **Your bots, as they look in Grok Bot.** All fourteen avatar shapes and eleven colours, measured from the app. Switching bots morphs the companion into that bot, and it turns its head toward your pointer the way Bob does.
> - **A conversation per bot.** Each bot keeps a scrolling history and an unsent draft for the session. A reply from a bot you've switched away from waits with a dot on its chip. Clearing has an Undo.
> - **Files and images in a question.** Paste an image, press Ctrl+V, choose files in Omarchy's file chooser, or drop them on the bubble.
> - **Stays out of the way.** Clicks around it reach your windows, even with the bubble open. It fades as the pointer comes near, hides under the screensaver, and follows `omarchy toggle animations`.
> - **Talk to it.** After a one-time setup, saying "Hey Bob" or "Hey OmaBot" through Superwhisper or Voxtype selects that bot and asks it.
>
> **Install**
>
> ```bash
> omarchy plugin add https://github.com/tcballard/omarchy-plugin-grokbot-desktop --enable
> ```
>
> **Good to know**
> - Asks run through your local coding agent (Grok, Claude, Codex and others) answering as the bot, or through a Grok Bot routine webhook. *[Delete or keep after the webhook check.]* The webhook has not yet completed an ask from the companion.
> - Conversations live in memory only and are gone after a shell restart.
> - Attachments go to agents, not the webhook.
> - Tested live on *[XPS model, Omarchy version, scale]*.
>
> **Remove**
>
> `omarchy plugin remove io.github.tcballard.grokbot-desktop` removes the plugin and leaves your settings, roster and webhook key.
>
> Inspired by Clippy for Omarchy and Clanky.
