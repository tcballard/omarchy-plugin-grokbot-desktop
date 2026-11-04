import Quickshell.Io
import qs.Commons
import "shapes.js" as Shapes
import "palette.js" as Palette

// Omarchy #13435+: ShellIpc registers with IpcRegistry for the private socket.
// Keep methods in sync with CompanionIpcHandler.qml.
ShellIpc {
  property var host: null

  target: "io.github.tcballard.grokbot-desktop"

  function summon(): string { host.summon(); return "ok" }
  function show(): string { host.showCompanion(); return "ok" }
  function hide(): string { host.hideCompanion(); return "ok" }
  // For a show/hide shortcut.
  function toggleVisible(): string {
    if (host.present) host.hideCompanion()
    else host.showCompanion()
    return host.present ? "shown" : "hidden"
  }
  function toggle(): string { host.toggleBubble(); return "ok" }
  function settings(): string { host.openSettings(); return "ok" }
  function clear(): string { return host.clearConversation() }
  function ask(prompt: string): string {
    var text = host.plainLine(prompt, 4000)
    if (text === "") return "empty"
    return host.launchAsk(text)
  }
  function dictate(text: string): string { return host.dictateText(text) }
  function bot(name: string): string {
    var found = host.matchBot(name)
    if (!found) return "unknown bot"
    return host.selectBot(found.id)
  }
  function appearance(shape: string, color: string): string {
    if (!Shapes.known(shape)) return "unknown shape"
    if (!Palette.accepts(color)) return "unknown color"
    host.syncOn = false
    host.customShape = shape
    host.customColor = color
    host.retargetAppearance(false)
    host.scheduleSave()
    return "ok"
  }
  function animate(name: string): string { return host.playAnimation(name) }
  function say(title: string, text: string): string { return host.sayNotice(title, text, []) }
  function reply(target: string, text: string): string { return host.receiveReply(target, text) }
  function sayLink(title: string, text: string, label: string, url: string): string {
    var link = host.linkButton(label, url)
    if (!link) return "invalid link"
    return host.sayNotice(title, text, [link])
  }
  function sayLinks(title: string, text: string, label1: string, url1: string, label2: string, url2: string): string {
    var first = host.linkButton(label1, url1)
    var second = host.linkButton(label2, url2)
    if (!first || !second) return "invalid link"
    return host.sayNotice(title, text, [first, second])
  }
  function dismiss(): string { return host.dismissSurfaces() ? "dismissed" : "nothing" }
  function ping(): string { return "ok" }
}
