# Agent Desktop v0.3.0

These are the changes since v0.2.0. The owner has used v0.3.0 on an Omarchy desktop and reported it looks good; the itemised live checks below have not been run.

- **Failures say why again.** When an ask fails, the bubble shows the real reason: `webhook status 401: Invalid API key`, or that `claude` isn't installed and how to install it, instead of a generic line. The text is the helper's own, trimmed to 400 characters with control characters removed.
- **Scrolling picks one bot at a time.** Each wheel notch over the mark moves one bot. A touchpad swipe no longer spins through the whole roster.
- **A prompt sent right after Stop is not lost.** If the stopped ask is still shutting down, your prompt waits and goes as soon as it can, as long as you stay on that bot and leave the draft alone.
- **Drags no longer get stuck at a monitor edge.** If the cursor helper can't read the mouse button, a drag that leaves the output now ends at the edge instead of waiting for a release that never arrives. Carrying the mark onto another monitor needs the helper to read `/dev/input/event*`, which normally means membership of the `input` group.
- **A quieter cursor helper.** It asks Hyprland at most 30 times a second while the mouse moves, and backs off to once a second when the mouse has been still for ten seconds and its event nodes are readable.
- **Wake phrases know your real bots.** Voxtype's filter, the wtype wrapper and the voice watcher match against the roster you synced, not only the bundled one. Dictation without a wake phrase is typed whole, however long it is. `grokbot-voice-watch --once` now picks up a transcript written in the 15 seconds before it ran.
- **One recording at a time.** If a dictation backend fails or times out, the waveform button no longer tries the next one, so you don't end up with two recordings. It still moves on when a backend is simply missing.
- **Safer setup and sync.** `bin/grokbot-connect` checks your settings file before it asks for anything, saves keys where asks actually read them (`webhookKeyFile`, `webhookHeaderFile`), and puts everything back if a save fails. Roster sync writes through a private temporary file, so a planted link can't redirect it.
- **`appearance` over IPC matches the settings page,** including removing a custom avatar from the selected agent.
- **Hermes is more robust.** An approval request now stops the request with a message that says so and tells you to run it in Hermes. One bad event or one bad roster row fails only that request or row, not the whole connection or roster.
- **Experimental daemon backend.** `"backend": "daemon"` on the plugin's `shell.json` entry selects `bin/agent-desktopd`, a long-lived process that holds conversations and runs asks, so a streaming provider's reply can grow in the bubble as it arrives. It is off by default; restart the shell after changing the setting. If the daemon cannot be started or keeps failing, the session goes back to the standard asks and says so once. Conversations still clear when the shell restarts. See the [desktop protocol](DESKTOP-PROTOCOL.md).

## What to watch for

- Without access to `/dev/input/event*` you can no longer drag the companion from one monitor to the next; the drag stops at the edge. Check `id -nG` for `input` if you rely on that.
- A dictation backend that fails for another reason no longer hands over to the next one. If the waveform button seems to do nothing, check that the backend you chose works on its own.
- Error text from your local agent is now shown in the bubble as it printed it, within the limits above.
- The daemon backend is experimental. Leave `backend` unset unless you are testing it.

## Not yet verified item by item

Everything above was checked by the automated suites (`./tests/run`, plus ruff, byte-compilation, a QML/JavaScript syntax check and offscreen Qt checks in CI). Beyond the owner's general use, none of these has been checked on its own ([what to try](TESTING-v0.3.0.md)):

- multi-monitor dragging with and without `input` group membership, and the cursor helper's request rate on real hardware;
- scroll-wheel and touchpad bot switching, and a prompt sent straight after Stop;
- dictation with Superwhisper, Voxtype and Hex on stable and dev Omarchy;
- the specific failure messages for a real webhook routine and real local agents;
- Hermes approval handling against a live gateway;
- the daemon backend, end to end, including streaming and its control socket.
