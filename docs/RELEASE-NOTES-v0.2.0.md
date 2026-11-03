# Agent Desktop v0.2.0

Grok Bot Desktop Companion is becoming **Agent Desktop**. One companion, a shared provider API, and room for more agents without maintaining a separate desktop plugin for each one.

- **A proper Settings menu.** Appearance, Behaviour and Providers have their own sections. Pick your bot, change its look and movement, or manage the Hermes connection in one place. The familiar shapes and colours stay front and centre.
- **GrokBot behind the same API.** GrokBot and the experimental Hermes adapter use the versioned provider interface. Existing Grok bot IDs, reply connections and settings are preserved. Developers can build adapters against the documented JSON Lines contract and example provider.
- **Make your own character.** Open the optional Custom avatar builder, describe a design, preview it, refine it and Apply. It uses your Omarchy default agent's configured model and selected account, initially supporting Codex, Claude and Grok. Open Bot Avatar v1 import/export is included. Nothing replaces your current avatar until you apply it.
- **Less waiting, fewer desktop rough edges.** Avatar generation no longer gets stuck behind blocked prompt delivery; Codex drafts use low reasoning effort and show elapsed waiting time. This release also brings monitor-dragging and reply-interaction fixes, stable-shell IPC compatibility, Hex dictation support, clearer bot-name routing and supervised request timeouts.

**Hermes is experimental.** The adapter has automated coverage, but has not been tested with a live Hermes setup. The desktop shows completed replies; streaming, history and approval controls are not yet exposed in Settings or chat. Approval requests send you back to Hermes and are never automatically approved. Hermes attachments are unsupported.

The owner has tested the Grok side and confirmed the avatar-generation speed issue is fixed with Codex. Automated coverage includes 121 Node tests, 50 Python tests, native Qt avatar rendering and Settings interactions. Claude/Grok avatar generation, a live Hermes gateway and the full fresh-install/update/removal walkthrough still need live validation. See the [v0.2.0 acceptance record](https://github.com/tcballard/omarchy-plugin-grokbot-desktop/blob/feature/multi-provider-companion/docs/ACCEPTANCE-v0.2.0.json) for the exact scope.

The product name changes; the existing plugin ID and configuration paths stay in place so upgrades preserve your setup. The GitHub repository rename to `omarchy-plugin-agent-desktop` is still pending. Dots and accessory costumes are not included in v0.2.0. Restarting the shell clears in-memory conversations and drafts.

Thanks to **Yani3rt** for the Hermes integration and desktop fixes, and **Dominik Scholz** for [Open Bot Avatar](https://github.com/DominikScholz/open-bot-avatar). The companion continues to build on ideas from [Clippy for Omarchy](https://github.com/jankeesvw/omarchy-clippy) and [Clanky](https://github.com/rdoupe/omarchy-clanky).

**Draft for review — not tagged or published.** [Candidate setup and testing](https://github.com/tcballard/omarchy-plugin-grokbot-desktop/blob/feature/multi-provider-companion/docs/TESTING-v0.2.0.md).
