# Testing v0.3.0 on Omarchy

Nothing in v0.3.0 has been run on a live desktop. This is the short list to work through; record what you see in [ACCEPTANCE-v0.3.0.json](ACCEPTANCE-v0.3.0.json). Keep `journalctl --user -t omarchy-shell -f` open throughout: nothing from the plugin should appear there apart from the lines named below.

## Default path (no setting changed)

1. Update the plugin and run `omarchy restart shell`. The mark loads, follows the pointer and clicks pass through.
2. Break an ask on purpose: a wrong Sender key should show `webhook status 401: ...`, and a default agent that is not installed should show `<agent> isn't installed. Install it with: omarchy default agent <agent>`.
3. Scroll over the mark with a wheel and with a touchpad: one bot per notch, not a spin through the roster.
4. Start an ask, press Stop, and send another prompt at once: it should be sent, not lost.
5. Close the Grok Bot app, then trigger a reply with the bubble closed: the reply cue should appear straight away.
6. On two monitors, drag the mark across the edge. With `input` in `id -nG` it should carry over and drop on release; without it the drag should end at the edge.
7. Watch `top` while moving the mouse quickly: `grokbot-cursor` should stay low.
8. Dictation: "Hey <a bot you synced>, ..." through your backend should reach that bot, and a long dictation without a wake phrase should be typed whole.

## Daemon backend (experimental)

1. Add `"backend": "daemon"` to this plugin's entry in `~/.config/omarchy/shell.json` and run `omarchy restart shell`. Expect one journal line saying the agent daemon connected, and one `agent-desktopd` process.
2. Ask a bot from the bubble: typing dots, then the reply. A provider that streams (Hermes) should grow the text in place.
3. Press Stop during an ask: "Stopped waiting..." at once, and a new ask works straight away.
4. Switch bots during and after an ask: each keeps its conversation and draft, and a reply for the other bot puts a dot on its chip.
5. Clear the conversation, then Undo within 8 seconds.
6. From a terminal, try `clear`, `ask "hi"`, `say "Build" "done"`, `bot <name>` through `omarchy-shell io.github.tcballard.grokbot-desktop`, and `printf 'text' | bin/grokbot-desktop-ctl reply <bot>`. The return strings should match the default path.
7. Run `pkill -KILL -f agent-desktopd` during an ask: the ask ends with a plain message, the daemon restarts after about a second, and the bubble says once that conversations were lost. Kill it three times within a minute: the session should say it is using the standard asks, and asks should still work.
8. The journal should not contain `agent daemon answered ... with X, not Y` or `agent daemon refused ...`.
9. Remove the setting, restart the shell, and confirm no `agent-desktopd` process runs.
