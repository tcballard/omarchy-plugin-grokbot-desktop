# v0.1.0: release runbook and draft notes

v0.1.0 is the first tagged release. `VERSION` and `manifest.json` already say `0.1.0`.

## Accepted candidate: 30 October

The owner explicitly accepted candidate `487fbb816a8a34d20a838ba5d98fea2cf0eb01a9` after testing on the XPS and restarting the shell to load the Sync button and persistent name badge. [ACCEPTANCE.json](ACCEPTANCE.json) records that owner-reported acceptance and its limitations. The old capture record remains in [ACCEPTANCE-2026-10-27.json](ACCEPTANCE-2026-10-27.json).

The release-preparation PR changes documentation and two stale regression-test assertions; runtime code is unchanged. The accepted input is `cd8a24c`, whose runtime matches owner-tested `487fbb8`. Full CI must pass before release; local complete-suite attempts timed out, so owner acceptance must not be described as a full automated pass. No new live recording was captured. The README preview remains labelled as the older 27 October capture.

## Prepare and publish after merging

1. Check green CI on the PR and merged candidate. Read the [build summary](BUILD-SUMMARY-v0.1.0.md), [setup guide](SETUP.md), and [testing handoff](TESTING-2026-10-30.md).
2. Tag the merged commit `v0.1.0` and push the tag. `VERSION` and `manifest.json` already say `0.1.0`.
3. Run **Release source** in GitHub Actions with `v0.1.0`. It runs the complete tests, builds the source archive and SHA256SUMS, and opens a draft release.
4. Write your own Release Notes using the build summary and setup guide, then publish the draft. The older draft below is reference material, not approved final copy.

`scripts/archive.mjs` requires the accepted input commit to remain an ancestor and permits only `docs/`, `README.md`, and `CREDITS.md` changes after it. If runtime or build inputs change again, test and record acceptance against the new candidate before tagging. New screenshots and recordings should go under `docs/media/` so they remain documentation changes.

## Draft release notes

> **Grok Bot Desktop Companion v0.1.0**
>
> Your Grok Bots, on the Omarchy desktop. A small companion sits in a corner of the screen, looks like whichever bot you're talking to, and answers in a speech bubble without taking you out of what you're doing.
>
> **What you get**
> - **Your bots, as they look in Grok Bot.** All fourteen avatar shapes and eleven colours, measured from the app. Switching bots morphs the companion into that bot, and it turns its head toward your pointer the way Bob does.
> - **Refresh your bots from the desktop app.** Appearance settings has a Sync button that reads the signed-in Grok Bot app's saved roster. A name badge beneath the companion identifies the selected bot.
> - **A conversation per bot.** Each bot keeps a scrolling history and an unsent draft for the session. A reply from a bot you've switched away from waits with a dot, and the companion shows one too while the bubble is closed. Clearing has an Undo.
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
> - **Ask the real Bob.** Run `bin/grokbot-connect`, paste your Grok Bot routine's Webhook URL and Sender key, and asks go to Bob himself. His answers come back into the bubble, under the question they answer. Without it, your local coding agent (Grok, Claude, Codex and others) answers in the bot's name.
> - Sync uses the desktop app's last saved bot list; let changes from other devices reach the app first. It imports names, shapes, colours and short descriptions, but not photos.
> - Conversations live in memory only and are gone after a shell restart.
> - Attachments go to the local agent, not the webhook.
> - When an ask fails, the bubble says why: no connection, a wrong key, or no answer in time.
> - Tested live on *[XPS model, Omarchy version, scale]*.
>
> **Remove**
>
> `omarchy plugin remove io.github.tcballard.grokbot-desktop` removes the plugin and leaves your settings, roster and webhook key.
>
> Inspired by Clippy for Omarchy and Clanky.
