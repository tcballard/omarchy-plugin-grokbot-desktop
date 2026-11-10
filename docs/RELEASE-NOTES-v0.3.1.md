# Agent Desktop v0.3.1

Hermes conversations can pick up where you left off. Open a bot to see recent exchanges, load earlier pages, and answer supported approvals and questions right in the desktop bubble.

- Hermes replies stream as they arrive, with progress shown while the agent works. The adapter sends your prompt without adding a desktop-specific note.
- Replies render Markdown, and **Scroll down** brings you back to the latest message.
- Hermes-only setups hide the sample Grok roster. A synced roster or an explicitly configured Grok connection stays available.
- Approval buttons stay paired with the command they apply to. Review commands that exceed the desktop preview limits in Hermes.

Thanks to [Yani3rt](https://github.com/Yani3rt) for the Hermes conversation work. Leave the backend at its default for history, progress and in-bubble approvals. The opt-in daemon still offers experimental reply streaming.

Hermes support remains experimental. The full automated suite passed. Live Hermes and Omarchy lifecycle checks are pending. [CI run](https://github.com/tcballard/omarchy-plugin-grokbot-desktop/actions/runs/42773619101) · [Live test checklist](https://github.com/tcballard/omarchy-plugin-grokbot-desktop/blob/v0.3.1/docs/TESTING-v0.3.1.md)
