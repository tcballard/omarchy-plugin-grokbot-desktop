Grok Bot Desktop Companion v0.1.2 keeps asynchronous webhook answers out of process command lines.

Thanks to @HANCORE-linux for tracing the return path after confirming the earlier prompt and dictation fixes. [#21](https://github.com/tcballard/omarchy-plugin-grokbot-desktop/pull/21) moves delayed answers onto stdin and Omarchy's private socket.

### Updating your routine

Existing asynchronous webhook routines need an update. `replyWith` is now an argument array, accompanied by `replyInput` instructions. Execute that array directly on the Omarchy computer and write the answer to its stdin. Do not append the answer to arguments or interpolate it into shell code.

For an answer already in a private file, run `bin/grokbot-desktop-ctl reply <askId> < answer.txt` from the plugin directory. The helper preserves Unicode and line breaks, rejects answers over 4,000 characters and protocol delimiters, and never retries with answer text in arguments. Immediate HTTP-response replies are unchanged.

Update the plugin and restart the shell. Restarting clears session conversations and waiting questions. The private Omarchy socket and ShellIpc support are required. See [setup](https://github.com/tcballard/omarchy-plugin-grokbot-desktop/blob/v0.1.2/docs/SETUP.md).

### Tested scope

CI passed 107 Node tests and five Python tests with zero failures or skips ([run](https://github.com/tcballard/omarchy-plugin-grokbot-desktop/actions/runs/41326620270)). Portable CI covers real helper subprocesses, Unix socket delivery, live /proc argument/environment inspection, rejected inputs and delivery failures. See the [versioned evidence](https://github.com/tcballard/omarchy-plugin-grokbot-desktop/blob/v0.1.2/docs/ACCEPTANCE-v0.1.2.json).

Live Quickshell, a real asynchronous webhook routine, and install/update/removal acceptance for this patch remain pending. Existing preview media belongs to an older build. Automated checks are not a security audit or marketplace approval.

Assets contain source code, source/release manifests, an SPDX source-package inventory and SHA-256 checksums.
