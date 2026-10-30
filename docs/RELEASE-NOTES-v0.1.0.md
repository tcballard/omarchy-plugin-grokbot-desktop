Grok Bot Desktop Companion v0.1.0 puts your bots beside your work on Omarchy. Pick one, open the bubble, and ask without leaving what you're doing.

### A little company for your desktop

- **Your bots, your look.** Sync the Grok Bot desktop app's saved roster, switch between 14 avatar shapes and 11 colours, and adjust motion, size and placement. Pointer-following eyes and a persistent name badge give each bot a presence.
- **Room for each conversation.** Per-bot history and drafts, unread indicators, Stop, and clear-with-Undo keep conversations separate as you switch.
- **Two ways to get replies.** Connect a Grok Bot webhook routine for real bot replies, or use an installed and authenticated local coding agent.
- **More than typing.** Attach files and images in local-agent mode, dictate with Superwhisper or Voxtype, and optionally route completed dictation by bot name.
- **Fits around your work.** Drag the companion into place, keep clicking outside the bubble, hide and restore it, or turn down the motion.

### Try it

Targets Omarchy 4 with Hyprland and Quickshell; Python 3 is required for the helpers.

```bash
omarchy plugin add https://github.com/tcballard/omarchy-plugin-grokbot-desktop --enable
```

Sign in to the Grok Bot desktop app and let its roster load. Then open **Appearance & bots → Sync bots from Grok Bot**.

**Syncing bots does not connect chat.** For real Grok Bot replies, configure the routine and its reply path to your computer, then run:

```bash
cd ~/.config/omarchy/plugins/io.github.tcballard.grokbot-desktop
bin/grokbot-connect
```

Supply the routine's Webhook URL and Sender key. Alternatively, install and authenticate your local coding agent. That agent answers in the selected bot's name; it is not your account's actual Grok Bot.

The [setup guide](https://github.com/tcballard/omarchy-plugin-grokbot-desktop/blob/v0.1.0/docs/SETUP.md) covers the return path, optional Super+Alt+B binding, dictation routing and launcher integration.

### First-release limits

Conversations and drafts live for the shell session and disappear on restart. Attachments work only in local-agent mode; roster photos are not imported. Roster sync reads the desktop app's local cache. Voice routing is opt-in routing of completed dictation, not an always-listening wake word.

The owner accepted the candidate on an XPS running Omarchy `dev (573b518be)`. CI passed 81 Node tests and five Python sync tests. This does not establish compatibility with every Omarchy 4 release. The sleeping-eyes appearance at 1.25× scale remains a known issue, and ten-minute webhook-question expiry was not independently verified in the acceptance session. Existing preview media shows the older 27 October build.

Release assets are source code and SHA256 checksums, not a prebuilt installer. See the [acceptance record](https://github.com/tcballard/omarchy-plugin-grokbot-desktop/blob/v0.1.0/docs/ACCEPTANCE.json) for the tested scope.

Inspired by [Clippy for Omarchy](https://github.com/jankeesvw/omarchy-clippy) and [Clanky](https://github.com/rdoupe/omarchy-clanky), with plugin conventions from [Build Omarchy Plugins](https://github.com/tcballard/build-omarchy-plugins).
