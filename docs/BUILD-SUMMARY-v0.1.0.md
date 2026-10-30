# What we built for v0.1.0

This is a factual source for the owner's release notes, not the final release announcement.

Grok Bot Desktop Companion is an Omarchy service plugin that puts a small, interactive bot on the desktop and lets you ask questions without leaving your current work.

- **The bot's appearance:** fourteen Grok Bot avatar shapes, eleven colours, bot-switch morphing, pointer-following eyes/head, idle behaviour and motion preferences. A persistent name badge identifies the active bot. Size, placement, custom appearance and dodge are adjustable.
- **Your own roster:** a Sync button in Appearance & bots reads the signed-in Grok Bot desktop app's cached list. It imports names, shapes, colours and short descriptions. Invalid or unsupported data leaves the previous roster intact. Exported profile directories remain supported.
- **A conversation per bot:** a scrolling bubble with per-bot session history and drafts, bot switching, stop/cancel, clear with Undo, and unread indicators when another bot replies.
- **Two answering modes:** a local coding agent, or a manually connected Grok Bot webhook routine. The connection helper tests the URL/key before saving; asynchronous replies are matched to the right question and bot, with useful connection errors.
- **Files and dictation:** paste, choose or drop attachments for local-agent questions; a dictation button for Superwhisper/Voxtype; optional routing of dictated “Hey Bob” or other bot-name prompts.
- **Desktop behaviour:** drag to position, click-through outside the companion and bubble, proximity dodge, hide/show with a restore notification, screensaver hiding, and reduced-motion support. Optional keyboard bindings and launcher integration are documented.

## What users must set up

1. Install and enable the plugin on Omarchy.
2. Open/sign in to the Grok Bot desktop app, then use **Sync bots from Grok Bot** and select a bot.
3. For real Grok Bot replies, configure the routine and its return path to the Omarchy computer, then run `bin/grokbot-connect` with its Webhook URL and Sender key. Alternatively install/authenticate a supported local coding agent.
4. Optionally add the show/hide shortcut, configure dictation routing, and copy the launcher/close helper.

The exact commands and required distinctions are in [SETUP.md](SETUP.md).

## Boundaries to communicate

- Roster sync and webhook connection are separate. Sync reads the local app cache; it does not fetch directly from the cloud or connect the chat transport.
- The local-agent fallback answers in the bot's name; it is not the account's actual Grok Bot.
- History and drafts live in memory and disappear on shell restart.
- Attachments work in local-agent mode only; roster photos are not imported.
- Desktop-wide voice routing is opt-in and requires a configured dictation backend. It is not always-listening wake-word detection.
- The owner accepted the candidate on the XPS running Omarchy `dev (573b518be)`. Existing preview media is older. The complete suite passed on GitHub CI; the sleeping-eyes report at 1.25× is tracked for v0.1.1.

## Maintainer steps after merging

Check green CI and merge with **Create a merge commit** to preserve the acceptance commit, then tag the merged release-preparation commit `v0.1.0`, push the tag, then run **Release source** in GitHub Actions with that tag. It runs tests and creates a draft source release with an archive and checksums. Write the Release Notes and publish the draft yourself. The archive is source code, not a prebuilt installer. No tag or release has been created by this PR.
