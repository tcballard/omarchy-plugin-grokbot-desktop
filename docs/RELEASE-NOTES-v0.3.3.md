# Agent Desktop v0.3.3

The layer rule, startup window check, and screensaver poll now use deadline-bound Hyprland IPC. Each operation runs in a single process, so unloading Agent Desktop closes any in-flight connection.

The layer rule has 1.5 seconds. The startup check and the screensaver poll each have three seconds, including both requests in the screensaver poll. If a poll fails, Agent Desktop keeps the last known window state.

Thanks to [HANCORE-linux](https://github.com/HANCORE-linux) for flagging the helper lifecycle issue in the [marketplace review](https://github.com/omacom/omarchy-plugin-marketplace/issues/13848#issuecomment-6809344393). The [automated checks](https://github.com/tcballard/omarchy-plugin-grokbot-desktop/actions/runs/43170592724) include six socket regression tests. Live Omarchy unload and reload testing is pending.
