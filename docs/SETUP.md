# Set up Grok Bot Desktop Companion

The companion targets Omarchy 4 with Hyprland and Quickshell. It needs Python 3 for its helpers. Node.js 22+ is for development tests, not the running companion. The accepted machine reports Omarchy `dev (573b518be)`; this is not a claim that every Omarchy 4 release has been tested.

## 1. Install and show the companion

```bash
omarchy plugin add https://github.com/tcballard/omarchy-plugin-grokbot-desktop --enable
cd ~/.config/omarchy/plugins/io.github.tcballard.grokbot-desktop
```

If you have updated an existing installation and still see the old UI, run `omarchy restart shell`. Restarting clears the companion's in-memory conversations and waiting questions.

Click the companion to open its bubble. To restore a hidden companion:

```bash
omarchy-shell io.github.tcballard.grokbot-desktop show
```

## 2. Load your actual bots

Open the Grok Bot desktop app, sign in to the intended account, and let its bot list load. Right-click the companion, choose **Appearance & bots**, and press **Sync bots from Grok Bot**. Confirm the reported bot count, then select your bot in the bubble.

Sync imports names, shapes, colours, and short descriptions from the app's last saved roster on this computer. It excludes groups and removed bots, does not import photos, and keeps the existing desktop roster on an error. It does not fetch directly from the cloud: changes from a phone or another computer must reach the desktop app first. Syncing the roster does not connect conversations to the real bots.

The equivalent terminal command, from the plugin directory, is:

```bash
bin/grokbot-sync --app
```

For an exported agents directory containing `*/profile.json`, use `bin/grokbot-sync --from /absolute/path/to/agents`.

## 3. Choose how questions are answered

### Connect to your real Grok Bot

In Grok Bot, open Bob's chat-header menu, then **Routines → Omarchy desktop companion**. This routine must already exist or be created/configured in the app; installing the plugin does not create it. Obtain its **Webhook URL** and **Sender key**.

The routine receives the prompt, bot name and ID, an ask ID, and a `replyWith` command. For an asynchronous answer to appear in the desktop bubble, the routine needs access to the Omarchy computer and must run that reply command with the answer. An immediate textual webhook response is also supported. Verify the answer actually returns to the bubble; accepting the webhook alone does not establish the return path.

From the plugin directory:

```bash
bin/grokbot-connect
bin/grokbot-connect --status
```

Enter the URL and Sender key when prompted. The helper sends a short test question and saves the configuration only if accepted. If your routine requires its own additional header, use `bin/grokbot-connect --header Header-Name` and supply its value when prompted. Keep keys out of release notes, screenshots and the repository.

### Use a local coding agent

Without the webhook connection, the companion uses the agent selected in `~/.config/omarchy/defaults/agent`, or an explicit agent configuration. Install and authenticate that agent first; the companion will not install it on the first question. This is a local agent answering in the selected bot's name, not the actual Grok Bot account bot.

To return to this mode after connecting a webhook:

```bash
bin/grokbot-connect --off
```

Files and images work only in local-agent mode. Webhook mode currently refuses attachments.

## 4. Optional show/hide shortcut

The shortcut is not installed automatically. Add this to `~/.config/hypr/bindings.lua` if Super+Alt+B is free in your configuration:

```lua
o.bind("SUPER + ALT + B", "Show or hide Grok Bot", "omarchy-shell io.github.tcballard.grokbot-desktop toggleVisible")
```

Validate your binding changes with `hyprctl reload` and `hyprctl configerrors`. Clicking the companion's hidden notification also restores it.

## 5. Optional dictation and wake phrases

Install/configure Superwhisper or Voxtype and select your Omarchy dictation backend. The waveform button in the bubble invokes that backend; you can also dictate a prompt starting with “Hey Bob” or another bot's name into the composer.

For desktop-wide wake-phrase routing with Superwhisper, run this from the plugin directory:

```bash
bin/grokbot-voice-watch --enable
```

This is a foreground watcher, not an automatically installed startup service. Keep it running for routing; arrange session autostart separately if wanted. It routes completed dictation transcripts, not a continuously listening microphone wake word. It briefly checks the clipboard after dictation finishes, as described in the README.

For Voxtype, install the post-process filter so a routed wake phrase is not also typed into the focused application:

```bash
bin/grokbot-voice-watch --print-voxtype-hook
bin/grokbot-voice-watch --enable --install-voxtype-hook
```

The installer refuses to overwrite an existing post-process command. If one exists, integrate the printed block manually. Keep `fallback_on_empty = false`. See [the README](../README.md#dictation) for the routing details.

## 6. Optional launcher and close helper

From the plugin directory:

```bash
mkdir -p ~/.local/share/applications ~/.local/share/icons/hicolor/scalable/apps ~/.local/bin
cp grokbot-desktop.desktop ~/.local/share/applications/
cp assets/grokbot-desktop.svg ~/.local/share/icons/hicolor/scalable/apps/io.github.tcballard.grokbot-desktop.svg
cp grokbot-desktop-close ~/.local/bin/
```

The README also documents an optional Super+W binding that dismisses the bubble before closing the focused window. It replaces that key's existing binding, so use it only if that behaviour is wanted.

## Check and remove

Select a bot, check its name badge, send a question, and verify the answer in the bubble. Try hiding/showing it and syncing after an app-roster change. Chat history and drafts last only until the shell restarts.

```bash
omarchy plugin remove io.github.tcballard.grokbot-desktop
```

Removal preserves settings, roster and webhook credentials. Manually added bindings, launcher copies and dictation routing also need separate removal if no longer wanted.
