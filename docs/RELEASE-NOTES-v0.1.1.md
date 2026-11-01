Grok Bot Desktop Companion v0.1.1 keeps private questions out of process command lines and remembers the bot you picked after a shell restart.

- **Private prompts stay on stdin.** The local Grok adapter now uses `--prompt-file /dev/stdin`. Older Grok versions without that flag fail clearly instead of retrying with the prompt in arguments. [#15](https://github.com/tcballard/omarchy-plugin-grokbot-desktop/pull/15)
- **Wake-phrase routing gets the same protection.** Dictated questions pass through stdin and Omarchy's private IPC socket. The optional wtype fallback also reads stdin. Missing IPC, partial replies and timeouts never trigger an argument-based retry. [#19](https://github.com/tcballard/omarchy-plugin-grokbot-desktop/pull/19)
- **Your selected bot survives startup.** Loading settings before the roster no longer replaces your saved choice with the default bot. Thanks to @salmun-nister for the fix. [#14](https://github.com/tcballard/omarchy-plugin-grokbot-desktop/pull/14)

Thanks to @HANCORE-linux for tracing both prompt leaks through the marketplace review.

### Updating

Update the plugin, then run `omarchy restart shell` to load the new IPC handler. Restarting clears session conversations and drafts.

Wake-phrase routing needs Omarchy 4 with `ShellIpc` and the private shell socket introduced in September 2026. Scripts should feed transcripts to `bin/grokbot-desktop-ctl dictate` through stdin; text arguments are now refused. Local Grok must support `--prompt-file`. The [setup guide](https://github.com/tcballard/omarchy-plugin-grokbot-desktop/blob/v0.1.1/docs/SETUP.md) covers the prerequisites.

### Tested scope

The merged fixes passed 102 Node tests and five Python tests, with no failures or skips. The privacy regressions run the actual helpers against a Unix socket fixture, inspect their live process command lines and environments, and exercise Unicode text, delivery failures and typing fallbacks.

Live Quickshell, Superwhisper/Voxtype, and install/update/removal checks for this patch remain pending. The earlier XPS acceptance and preview belong to older builds. Portable tests are not a security audit or live desktop acceptance; marketplace approval is still pending.

Release assets contain source code, source and release manifests, an SPDX source-package inventory, and SHA-256 checksums. They are not a prebuilt installer. Existing settings and stored-state formats are unchanged. Multi-monitor following is not part of this patch.
