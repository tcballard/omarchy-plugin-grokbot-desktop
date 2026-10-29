# v0.1.0: release runbook and draft notes

v0.1.0 is the first tagged release. `VERSION` and `manifest.json` already say `0.1.0`.

## Why a live pass comes first

`scripts/archive.mjs` builds the release archive only when `docs/ACCEPTANCE.json` records a passed live run against a commit, and nothing but documentation has changed since that commit. The recorded run is from `a8a5d0b` (27 October), and the companion's runtime has changed a lot since, so the release needs a fresh live pass on the commit being released.

Any change to QML, `qml/*.js`, `bin/*`, `data/`, `assets/`, `preview.png` or the manifest after the pass means testing again. Documentation (`docs/`, `README.md`, `CREDITS.md`) can still change.

## 1–3. Install, test and capture

Follow [WALKTHROUGH.md](WALKTHROUGH.md) from a fresh install, after everything for the release is merged into `main`. It installs with the README's own command, checks every feature, and lists what to record. A failure means a fix, a new commit, and the walkthrough again on that commit.

- **Webhook (optional):** with the routine's Sender key, an ask in webhook mode reaches Grok Bot. If it still returns 401, it ships as a known limitation.
- **Pictures:** new images and video go under `docs/media/`, so they don't count as runtime changes. The existing `preview.png` and demo video stay as the 27 October record.

## 4. Record, tag, release

1. A documentation-only commit records the pass in `docs/ACCEPTANCE.json`:
   - status `passed`, with `input_commit` set to the SHA the walkthrough recorded
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
> - **Stays out of the way.** Clicks around it reach your windows, even with the bubble open. Drag it anywhere on the screen. It fades as the pointer comes near, hides under the screensaver, and follows `omarchy toggle animations`. Hide it from its menu and a notification brings it back with a click, or bind Super+Alt+B to show and hide it.
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
