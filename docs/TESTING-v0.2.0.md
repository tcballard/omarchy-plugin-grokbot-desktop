# Test Agent Desktop v0.2.0-rc.1

This candidate is on `feature/multi-provider-companion` in the existing repository. It is not tagged or published. Dots is out of scope. The stable plugin ID, configuration filenames, webhook callback helper and launcher filename remain unchanged for upgrade compatibility. Product branding is Agent Desktop; the GitHub rename is still pending.

## Update an existing installation

Run this on your Omarchy machine. It refuses a dirty checkout and records the previous commit. Shell restart clears in-memory conversations, drafts and pending replies, so finish those first.

```bash
set -e
agent_plugin="$HOME/.config/omarchy/plugins/io.github.tcballard.grokbot-desktop"
test -d "$agent_plugin/.git"
test -z "$(git -C "$agent_plugin" status --porcelain)"
agent_backup="$HOME/.local/state/agent-desktop-test-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$agent_backup"
chmod 700 "$agent_backup"
git -C "$agent_plugin" rev-parse HEAD > "$agent_backup/previous-commit"
cp "$HOME/.config/omarchy/shell.json" "$agent_backup/shell.json"
git -C "$agent_plugin" fetch origin feature/multi-provider-companion
git -C "$agent_plugin" switch --detach FETCH_HEAD
omarchy plugin validate "$agent_plugin"
omarchy restart shell
printf 'Backup: %s\n' "$agent_backup"
```

If your checkout lives elsewhere, change `agent_plugin`. Do not use the normal main-branch install command to obtain this candidate.

To roll back, substitute the printed backup directory, read `previous-commit`, then use `git -C "$agent_plugin" switch --detach <that-commit>` and restart the shell. Keep the backup; do not overwrite the entire live shell.json if other plugin settings have changed since. The candidate keeps the existing Grok setting keys, so rollback normally requires no configuration replacement.

## Hermes configuration

GrokBot keeps using `grokbot-desktop.json`, its key files and synced roster. No reconnection is required.

Open **Settings → Providers → Hermes → Connection settings**, enter your existing Hermes paths, and choose **Save and refresh**. This preserves other provider configuration. You can also edit `~/.config/omarchy/agent-desktop.json`. Use the Python interpreter from your existing Hermes environment, which must contain PyYAML and the gateway's websockets dependencies. Replace these example paths with your actual absolute paths:

```json
{
  "providers": {
    "hermes": {
      "python": "/home/YOU/.hermes/hermes-agent/.venv/bin/python",
      "root": "/home/YOU/.hermes",
      "agentDir": "/home/YOU/.hermes/hermes-agent"
    }
  }
}
```

The default profile and named profiles are discovered through the adapter. Open Hermes Bot Chat and ensure its gateway works first. In Agent Desktop, open **Settings → Providers → Hermes**, refresh profiles, and select a profile. Selecting a provider switches to its first available agent; individual profiles can be chosen below.

This candidate displays completed replies. Hermes streaming, history, compaction and prompt-answer methods exist in the provider API but do not have dedicated desktop controls yet. An approval/input request stops the desktop request and directs you to Hermes; it is never automatically approved. Hermes attachments are explicitly unsupported. Stop requests interruption of an owned Hermes turn; if the gateway cannot confirm it, remote work may continue.

For a credential-free end-to-end smoke test, add `"example": {}` under `providers`, refresh, select Example Agent and ask a question. It returns `Example: ...`. Remove it after testing.

Set `askTimeoutSeconds` (30–1800, default 180) in the existing `grokbot-desktop.json` or plugin entry in shell.json; the shell entry wins. The client and adapter use this deadline, with a 15-second client cleanup allowance and a final UI backstop.

## Open Bot Avatar

1. Copy the JSON from `data/avatars/rocket.json` or `data/avatars/ghost.json`, or generate one in [the upstream editor](https://dominikscholz.github.io/open-bot-avatar/).
2. Select an agent, open **Settings → Appearance → Custom avatar…**, paste the JSON, and press **Import**.
3. Check the desktop mark, header and bot chips. Move the pointer and send a prompt to exercise gaze and thinking motion.
4. Switch agents: only the selected agent's character should change. Restart the shell and confirm the assignment survives.
5. **Export** shows selected JSON ready to copy. **Remove**, or choosing a built-in shape, returns that agent to the built-in renderer. Colour selection still applies to either renderer.

Imports are geometry-only v1 definitions validated by the upstream engine, capped at 16 KiB each, 12 assignments and 64 KiB total. Invalid JSON leaves the previous character unchanged. Imported characters switch directly rather than morphing their arbitrary outlines into the existing measured Grok shapes.

## Desktop acceptance checklist

- Stable Omarchy: the plugin loads through IpcHandler without a QVariant warning. Newer shells retain ShellIpc. Private stdin webhook replies and desktop-wide dictation still require the newer private socket; the fallback does not bypass that requirement.
- Settings opens a compact menu. Appearance starts with shapes and colours; custom avatar import is a secondary page. Back/Esc steps through pages to chat.
- Switch GrokBot/Hermes in Providers; the chosen agent receives subsequent messages. Save Hermes connection paths and verify they survive restart without changing Grok configuration.
- Existing Grok agent selection, appearance and webhook configuration survive restart and the upgrade.
- Local Grok agent asks and webhook callback replies still work. Stop terminates local descendants; remote webhook work may continue.
- Grok and Hermes agents with the same name retain separate drafts, conversations and replies. Ambiguous names and prefixes do not select a bot through `say`/`reply`; use the exact ID.
- A missing/unavailable Hermes gateway produces an error while Grok remains usable.
- Dictation works with your actual backend. Hex uses two presses and inserts the returned transcript into the composer.
- Drag between monitors, release, move the pointer away and restart. Position persists and unrelated settings remain unchanged. Also check mixed scale factors and a disconnected monitor. Cross-output continuation relies on readable mouse event devices; if unavailable, the drag ends at the boundary. Do not elevate the helper to work around that.
- Scroll over the companion to switch bots. Check normal click/drag, fade behaviour and click-through outside the mark/card. The mark now accepts clicks immediately even while faded.
- With the card closed, active-agent replies show a short toast and other-agent replies peek. Opening Grok Bot suppresses only Grok reply cues, not Hermes cues.
- Import/export/restart the two sample avatars, check fractional scaling and reduced motion, and compare CPU usage with the built-in mark.

## Verification limits

Portable tests and native offscreen Qt avatar rendering are available in this checkout. Live Quickshell, Hyprland, your real Hermes gateway, real Grok webhook and dictation devices require the checklist above. Existing acceptance records describe earlier releases, not this candidate.
