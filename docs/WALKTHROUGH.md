# Walkthrough

A guided tour of the companion, from a fresh install through every feature. It takes about 40 minutes. It doubles as:

- **A live test.** Tick each box, and note anything that looks off. The results are what [RELEASE.md](RELEASE.md) asks you to record in `ACCEPTANCE.json`.
- **A demo.** Each part opens with a **Show:** line, which is the point to make if someone is watching. Parts 2–12 run in order as a demo; parts 13–15 are housekeeping.

## 0. Before you start

**What you need**

- Omarchy 4 on Hyprland, online.
- An agent to answer asks. This walkthrough uses Grok:

  ```bash
  command -v grok
  cat ~/.config/omarchy/defaults/agent
  ```

  The first line should print a path. The second names the agent that answers; if it isn't `grok`, that agent answers instead.
- **Start in agent mode.** Part 7 connects Bob's Grok Bot routine. Until then, asks should go to the local agent. If you connected the webhook earlier, switch back after installing in part 1:

  ```bash
  "$D/bin/grokbot-connect" --off
  ```

- **For part 7:** the routine's Webhook URL and Sender key, from Grok Bot. Click Bob in the chat header, open Routines, then "Omarchy desktop companion".

- **Props:** an image (a photo or screenshot) and a non-image file, such as a PDF or text file, somewhere easy to find, like `~/Pictures` and `~/Documents`.

**Two terminals**

- One for commands.
- One for the shell's log, left running. Note any line that mentions `grokbot`:

  ```bash
  journalctl --user -t omarchy-shell -f
  ```

**Optional: record it**

Alt+Print opens Omarchy's screen-recording menu. Choose the whole screen; it records at 60 fps into `~/Videos`. Press Alt+Print again to stop. A 30 fps recording can't show whether motion is smooth.

## 1. Install

**Show:** one command, straight from GitHub.

```bash
ID=io.github.tcballard.grokbot-desktop
omarchy plugin remove "$ID"        # only if it is already installed
ls ~/.config/omarchy | grep grokbot
omarchy plugin add https://github.com/tcballard/omarchy-plugin-grokbot-desktop --enable
D=~/.config/omarchy/plugins/$ID
git -C "$D" rev-parse HEAD
omarchy-version
omarchy plugin validate "$D"
```

`omarchy plugin add` installs the repository's default branch, `main`.

- [ ] If it was already installed, removal succeeds and `ls` still lists your `grokbot-*` files. Removal keeps your settings, roster and webhook key.
- [ ] `add` and `validate` succeed, and the log shows no errors.
- [ ] Keep the outputs of `rev-parse`, `omarchy-version` and `validate`.

## 2. Meet Bob

**Show:** it lives on the desktop and watches what you do.

- [ ] Bob, an orange teardrop, appears in the bottom-right corner.
- [ ] Move the pointer around the whole screen. Bob turns his head to follow: his eyes slide across his face and shrink as he turns away, and his outline tilts.
- [ ] Rest the pointer right on Bob. His eyes face you at a normal size; they don't stare wide.
- [ ] Click windows and desktop right next to Bob. The clicks reach them.
- [ ] Bring the pointer close. Bob fades and lets clicks through (this is Dodge). Rest on him and he fades back in within about half a second, ready for a click.
- [ ] Optional: leave the pointer still for two minutes. His eyes close to lid lines, then open when you move.

## 3. Put him anywhere

**Show:** he isn't stuck in a corner.

- [ ] Rest on Bob until he's solid, then drag him to the middle of the screen. He stays exactly where you drop him.
- [ ] Drag him against an edge. He stops at the screen's edge.
- [ ] Hold Super and drag Bob. He moves as soon as you press, and letting go doesn't open the bubble. A Super+click on Bob doesn't open it either.
- [ ] Run `omarchy restart shell`. Bob comes back where you left him.

Put him somewhere comfortable for the rest of the tour, for example a little way in from the bottom-right corner.

## 4. The bubble

**Show:** ask without leaving what you're doing.

- [ ] Click Bob. The bubble settles open from slightly smaller, with no bounce, and the prompt field has focus.
- [ ] The header has the sliders button on the left, a pill with Bob's mark and name in the middle, and a minimise button on the right.
- [ ] Hover the pill. Bob's role slides out beside his name.
- [ ] Below the header is a row of bot chips: Bob, OmaBot, Poteto and others, then **+N**. Click **+N** to unfold every bot, and **Less** to fold them away. The card eases taller and shorter with no jump.
- [ ] With the bubble open, click a window beside it. The click reaches the window, and the bubble stays.
- [ ] Opening and closing the bubble never moves Bob.
- [ ] Esc closes the bubble, and clicking Bob opens it again.

## 5. Ask

**Show:** a conversation, answered on the desktop.

- [ ] Type a question and press Enter. Your question appears on the right with typing dots under it, and Bob looks around while he works. The bot row folds into the pill. The reply fades in where the dots were, and nothing jumps.
- [ ] Ask two or three follow-ups. Earlier exchanges stay above in a scrolling thread. Once it's full, each new question scrolls smoothly into view, and a fade at the top shows there's more.
- [ ] Scroll back up through the thread, then ask again. It returns to the newest exchange.
- [ ] Paste or type a long paragraph. The field wraps and grows to six lines, then scrolls. Shift+Enter starts a new line, and Enter sends.
- [ ] Start an ask and press the square stop button. The ask is cancelled.

## 6. Many bots, one desktop

**Show:** each Grok Bot has its own conversation, and Bob becomes whoever you're talking to.

- [ ] Click the pill. Every bot unfolds. Pick OmaBot. Bob morphs into OmaBot's shape and colour, OmaBot's empty conversation fades in, and the card eases to its new height.
- [ ] Type something for OmaBot without sending it. Switch to Bob, then back to OmaBot. The draft is still there.
- [ ] Ask OmaBot something, then switch to Bob straight away. When OmaBot's reply arrives, its chip in the pill's list shows a dot. Switch to OmaBot: the reply is there, and the dot clears.
- [ ] In the field, type `Hey Poteto, what should I cook tonight?` and press Enter. It switches to Poteto and asks.

## 7. Ask the real Bob

**Show:** Bob himself answers on the desktop, through his Grok Bot routine.

- [ ] Run `"$D/bin/grokbot-connect"`. Paste the routine's Webhook URL, then its Sender key, which isn't shown as you type. It sends Bob a short test message, then says "Connected." A wrong key is refused with a reason, and nothing is saved.
- [ ] `"$D/bin/grokbot-connect" --status` says asks go to Grok Bot.
- [ ] Ask Bob something from the bubble. The question keeps its typing dots and Bob looks around while the routine works. His answer appears under the question, as with the local agent, not as a separate message.
- [ ] Ask Bob again, then switch to OmaBot straight away. When Bob answers, his chip in the pill's list shows a dot, and his answer is under his question when you switch back.
- [ ] Run `"$D/bin/grokbot-connect" --off`. Asks go to the local agent again for the rest of the tour.

## 8. Show it things

**Show:** paste a screenshot or attach any file to a question.

- [ ] Run `omarchy-capture-screenshot region copy` and pick an area. In the bubble, press **+**, then **Paste image**. A thumbnail eases in above the field.
- [ ] With an image copied, Ctrl+V in the field attaches it. With text copied, Ctrl+V pastes the text.
- [ ] Press **+**, then **Choose a file…**. The bubble steps aside and Omarchy's file chooser opens. Pick your image and your PDF or text file together. The image shows as a thumbnail and the other file as a chip with its name.
- [ ] Drag a file from the file manager onto the bubble. It attaches.
- [ ] With four files attached, **+** greys out. Dropping a fifth file shows a short note that only four go with an ask.
- [ ] Remove files with their **×**. Removing the last one folds the tray away smoothly.
- [ ] Attach an image and ask "What's in this picture?" The thumbnail goes up with your question. Note whether the answer shows Grok actually saw it. How well that works depends on the agent.
- [ ] Attach a file and send without typing anything. It asks "Have a look at this."

## 9. Clear and undo

- [ ] Right-click Bob and choose **Clear conversation**. The thread folds away and a "Conversation cleared · Undo" chip eases in.
- [ ] Click **Undo** within 8 seconds. The conversation comes back.
- [ ] Clear again and wait. The chip leaves by itself after 8 seconds.

## 10. Make it yours

**Show:** every shape and colour from the Grok Bot app's avatar picker.

- [ ] Click the sliders button. The chat crossfades to the appearance page while the card eases to its height. The back chevron, or Esc, returns to the chat.
- [ ] Tap shapes and colours. Each change lands at once, a pressed tile dims, and the ring jumps to the new pick, as in the app.
- [ ] Black draws white on a dark theme.
- [ ] **Reset to default** returns to the bot's own look, and greys out while it matches.
- [ ] The sync pill reads "Synced · Bob". Tap it to make it "Custom": the look you picked now stays when you switch bots. Tap again to sync.
- [ ] Motion:
  - **Calm** holds still.
  - **Playful** breathes, bobs and blinks.
  - **Hyper** adds an orbit and hops.

  Finish on Calm.
- [ ] Placement: tap each corner. Bob pops out and back in at that corner. Finish where you like.
- [ ] Size: Small, Medium and Large ease between sizes.
- [ ] Dodge off: Bob no longer fades as the pointer comes near. Turn it back on.

## 11. Hide and bring back

**Show:** out of the way in one click, and back in one.

- [ ] Right-click Bob and choose **Hide companion**. Bob disappears, and a "Grok Bot is hidden" notification appears. Click it, or its **Show** button, and Bob comes back.
- [ ] Add a shortcut to `~/.config/hypr/bindings.lua` and save:

  ```lua
  o.bind("SUPER + ALT + B", "Show or hide Grok Bot", "omarchy-shell io.github.tcballard.grokbot-desktop toggleVisible")
  ```

  Super+Alt+B now hides Bob, and pressing it again brings him back.

## 12. Tricks for scripts and routines

**Show:** anything on the desktop can drive it, from a keybinding to a Grok Bot routine.

```bash
C="omarchy-shell io.github.tcballard.grokbot-desktop"
$C animate wave
$C animate celebrate
$C animate spin
$C say "Bob" "Morning briefing is ready."
$C sayLink "Grok Bot" "The companion is open source." "Open repo" "https://github.com/tcballard/omarchy-plugin-grokbot-desktop"
$C bot "OmaBot"
$C appearance hex green
$C ask "What's on my calendar today?"
```

- [ ] `animate` waves, celebrates with a hop, and spins.
- [ ] `say` opens the bubble with the message. `sayLink` adds an **Open repo** button, which opens the browser only when clicked.
- [ ] `bot` switches to OmaBot, and `appearance` turns the mark into a green hex.
- [ ] `ask` opens the bubble and asks.

Afterwards, open the appearance page and press **Reset to default**.

## 13. Plays nicely with Omarchy

- [ ] Run `omarchy-launch-screensaver force`. Bob is not drawn over the screensaver. Dismiss it, and Bob is back.
- [ ] Run `omarchy toggle animations`. Opening the bubble, page changes and bot switches happen at once, and Bob holds still. Run it again to restore.
- [ ] Optional: pick **Theme accent** as the colour, then change the Omarchy theme. Bob takes on the new accent.

## 14. Voice (optional)

- [ ] With the field empty, the waveform button lights up and starts Omarchy's dictation (Superwhisper or Voxtype, whichever Omarchy is set to). The transcript lands in the field.
- [ ] Wake phrases such as "Hey OmaBot, …" need the one-time setup in the README's Dictation section.

## 15. Remove (optional, last)

- [ ] `omarchy plugin remove io.github.tcballard.grokbot-desktop` removes Bob. `ls ~/.config/omarchy | grep grokbot` still lists your files.
- [ ] Reinstall with the command from part 1.

## Record

Keep these:

- **Machine:** the outputs of `git -C "$D" rev-parse HEAD`, `omarchy-version` and `omarchy plugin validate "$D"`, plus the machine, the display, and its scale (`hyprctl monitors`).
- **Results:** a pass, fail or skip for each part, with a short note for anything that looked off.
- **Log:** any lines in the log that mention `grokbot`.
- **Screenshot:** one for the README, with the bubble open on a short conversation, an image thumbnail and Bob in view.
- **Video:** the recording, if you made one.
