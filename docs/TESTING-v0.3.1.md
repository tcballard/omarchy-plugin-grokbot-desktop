# Test Agent Desktop v0.3.1 on Omarchy

Record the plugin commit, Omarchy revision, hardware and Hermes version. Use a disposable profile and harmless commands.

1. Install from a fresh checkout and upgrade separately from v0.3.0. Confirm the mark, settings, bot selection, Grok asks and Stop work on the standard backend.
2. Open a Hermes profile with recent conversations and load an earlier page. Switch bots during a page fetch, then test retry after a provider error. Confirm the viewport stays in place as older exchanges load.
3. Ask Hermes for a long Markdown reply. Check progress, incremental reply text, links and Scroll down.
4. Trigger a harmless approval. Check the full command and answer choices, including an approval while another bot is selected. Test accept, deny, retry and Stop. Test both choice and free-text questions.
5. Restart with the experimental daemon enabled. Check streaming, bot switching, and the fallback after repeated daemon failure. Restart with the standard backend and verify Hermes history and approvals again.
6. Disable and remove the plugin. Check the shell stays usable and existing bot and provider settings remain available for reinstall.

Provider API fixtures, QML syntax and offscreen rendering each cover separate parts of the integration. Record live results separately.
