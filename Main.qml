import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons
import qs.Commons as Commons
import "qml/shapes.js" as Shapes
import "qml/palette.js" as Palette
import "qml/dictation.js" as Dictation

// Grok Bot desktop companion. A service inside omarchy-shell: a transparent
// layer-shell window, click-through except for the mark (and the bubble or
// drawer while they are open). Settings live on this plugin's own shell.json
// entry. The webhook key is never read here and never placed on argv.
Item {
  id: root

  property var shell: null
  property var manifest: null
  property string omarchyPath: ""

  readonly property string pluginId: "io.github.tcballard.grokbot-desktop"
  readonly property string defaultBotId: "e0195a7d-f804-4688-9191-e2cf3574a6d1"
  readonly property int configLimit: 256 * 1024
  readonly property var shapeNames: Shapes.NAMES
  readonly property var colorNames: Palette.NAMES.concat([Palette.OMARCHY])

  readonly property string homePath: Quickshell.env("HOME") || ""
  readonly property string userConfigPath: root.homePath + "/.config/omarchy/shell.json"
  readonly property string botsPath: root.homePath + "/.config/omarchy/grokbot-bots.json"
  readonly property string themePath: root.homePath + "/.local/state/omarchy/current/theme/colors.toml"

  function localPath(url) {
    var raw = String(url || "")
    if (raw.indexOf("file://") === 0) return decodeURIComponent(raw.slice(7))
    return raw
  }

  readonly property string bundledBotsPath: root.localPath(Qt.resolvedUrl("data/bots.json"))
  readonly property string cursorHelper: root.localPath(Qt.resolvedUrl("bin/grokbot-cursor"))
  readonly property string askHelper: root.localPath(Qt.resolvedUrl("bin/grokbot-ask"))
  readonly property string dictateHelper: root.localPath(Qt.resolvedUrl("bin/grokbot-dictate"))

  property bool ready: false
  property bool present: true
  property bool bubbleOpen: false
  property string cardPage: "chat"
  readonly property bool settingsOpen: root.bubbleOpen && root.cardPage === "appearance"
  property bool menuOpen: false
  property bool switcherOpen: false
  property bool asking: false
  property bool replyUnread: false
  property bool dragging: false
  property bool ghost: false
  property bool claimed: false
  property bool pointerNear: false
  property bool dodgeOn: true
  property bool idleOn: true
  property string motionName: "playful"
  property string anchorName: "br"
  property bool rosterExpanded: false
  property string askedText: ""
  property bool syncOn: true
  property string chosenBotId: root.defaultBotId
  property string customShape: "teardrop"
  property string customColor: "orange"
  property string sizeName: "medium"
  property int sizePx: 128
  property int posRight: 24
  property int posBottom: 24
  property string shapeFrom: "teardrop"
  property string shapeTo: "teardrop"
  property string colorFrom: "orange"
  property string colorTo: "orange"
  property real morphProgress: 1
  property string expression: "idle"
  property bool sleepHold: false
  property real eyeOpen: 1
  property bool blinkTwice: false
  property real gazeX: 0
  property real gazeY: 0
  property real gazeTargetX: 0
  property real gazeTargetY: 0
  property real cursorX: 0
  property real cursorY: 0
  property bool cursorKnown: false
  property real lastMoveAt: 0
  property real thinkAngle: 0
  property real sleepDrift: 0
  property real breathe: 1
  property real idleY: 0
  property real hopY: 0
  property real spinAngle: 0
  property real waveAngle: 0
  property real orbit: 0
  property var bots: []
  property string bubbleBody: ""
  property string promptDraft: ""
  property var noticeLinks: []
  property string pendingJson: ""
  property string themeAccent: ""
  property string themeForeground: ""
  property string themeBackground: ""
  property real dwellSince: 0
  property real dragCursorX: 0
  property real dragCursorY: 0
  property int dragRight: 0
  property int dragBottom: 0
  property string startMonitor: ""

  readonly property color accent: root.themeAccent !== "" ? root.themeAccent : Commons.Color.accent
  readonly property color ink: root.themeForeground !== "" ? root.themeForeground : Commons.Color.foreground
  readonly property color paper: root.themeBackground !== "" ? root.themeBackground : Commons.Color.background
  readonly property real paperR: paper.r
  readonly property real paperG: paper.g
  readonly property real paperB: paper.b
  readonly property color inkSoft: Qt.rgba(ink.r, ink.g, ink.b, 0.72)
  readonly property int markSize: {
    if (root.sizeName === "small") return 96
    if (root.sizeName === "large") return 176
    if (root.sizeName === "custom") return root.sizePx
    return 128
  }
  readonly property string shownShape: root.shapeTo
  readonly property string shownColor: root.colorTo
  readonly property string canonicalShape: Shapes.resolve(root.shownShape)
  readonly property bool anchorFromRight: root.anchorName === "br" || root.anchorName === "tr"
  readonly property bool anchorFromBottom: root.anchorName === "br" || root.anchorName === "bl"
  readonly property bool surfacesOpen: root.bubbleOpen || root.menuOpen

  function tomlColor(text, key) {
    var lines = String(text || "").split("\n")
    var i
    for (i = 0; i < lines.length; i++) {
      var line = lines[i].trim()
      if (line.indexOf("#") === 0 || line.indexOf("=") < 0) continue
      var name = line.split("=")[0].trim()
      if (name !== key) continue
      var value = line.slice(line.indexOf("=") + 1).trim().replace(/"/g, "")
      if (/^#[0-9A-Fa-f]{6}$/.test(value)) return value
    }
    return ""
  }

  function applyThemeText(text) {
    root.themeAccent = root.tomlColor(text, "accent")
    root.themeForeground = root.tomlColor(text, "foreground")
    root.themeBackground = root.tomlColor(text, "background")
  }

  FileView {
    id: userConfig
    path: root.userConfigPath
    blockLoading: true
    printErrors: false
  }

  FileView {
    id: bundledBots
    path: root.bundledBotsPath
    blockLoading: true
    printErrors: false
  }

  FileView {
    id: botsFile
    path: root.botsPath
    watchChanges: true
    printErrors: false
    onLoaded: root.applyBots(text())
    onFileChanged: reload()
    onLoadFailed: root.applyBots("")
  }

  FileView {
    id: themeFile
    path: root.themePath
    watchChanges: true
    printErrors: false
    onLoaded: root.applyThemeText(text())
    onFileChanged: reload()
  }

  Connections {
    target: Commons.Color
    function onAccentChanged() { themeFile.reload() }
    function onBackgroundChanged() { themeFile.reload() }
    function onForegroundChanged() { themeFile.reload() }
  }

  function pluginsConfig() {
    var text = userConfig.text() || ""
    if (text === "" || text.length > root.configLimit) return []
    try {
      var parsed = JSON.parse(text)
      if (parsed && Array.isArray(parsed.plugins)) return parsed.plugins
    } catch (e) {
      return []
    }
    return []
  }

  function ownEntry() {
    var list = root.pluginsConfig()
    var i
    for (i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].id || "") === root.pluginId) return list[i]
    }
    return ({})
  }

  function setting(key, fallback) {
    var entry = root.ownEntry()
    if (entry && entry[key] !== undefined) return entry[key]
    return fallback
  }

  function settingInt(key, fallback, min, max) {
    var n = Number(root.setting(key, fallback))
    if (!isFinite(n)) return fallback
    return Math.max(min, Math.min(max, Math.round(n)))
  }

  function safeImage(value) {
    var path = String(value || "")
    if (path.indexOf("/") !== 0 || path.indexOf("..") >= 0 || path.length > 512) return ""
    return path
  }

  function parseBots(text) {
    if (!text || String(text).length > 1024 * 1024) return []
    var data
    try { data = JSON.parse(text) } catch (e) { return [] }
    var list = data && Array.isArray(data.bots) ? data.bots : null
    if (!list) return []
    var out = []
    var i
    for (i = 0; i < list.length; i++) {
      var item = list[i]
      if (!item || !item.id || !item.name) continue
      out.push({
        id: String(item.id),
        name: String(item.name),
        shortName: String(item.shortName || ""),
        description: String(item.description || ""),
        avatarShape: String(item.avatarShape || "blob"),
        avatarColor: String(item.avatarColor || "blue"),
        avatarImage: root.safeImage(item.avatarImage),
        isPrimary: item.isPrimary === true
      })
    }
    return out
  }

  function applyBots(text) {
    var parsed = root.parseBots(text)
    if (parsed.length === 0) parsed = root.parseBots(bundledBots.text())
    if (parsed.length === 0) return
    root.bots = parsed
    if (!root.findBot(root.chosenBotId)) {
      var primary = root.primaryBot()
      root.chosenBotId = primary ? primary.id : root.defaultBotId
    }
    if (root.ready) root.retargetAppearance(true)
  }

  function findBot(id) {
    var i
    for (i = 0; i < root.bots.length; i++) {
      if (root.bots[i].id === id) return root.bots[i]
    }
    return null
  }

  function primaryBot() {
    var i
    for (i = 0; i < root.bots.length; i++) if (root.bots[i].isPrimary) return root.bots[i]
    return root.findBot(root.defaultBotId) || root.bots[0] || null
  }

  function currentBot() {
    return root.findBot(root.chosenBotId) || root.primaryBot()
  }

  function botLabel() {
    var bot = root.currentBot()
    if (!bot) return "Bob"
    var shortName = String(bot.shortName || "")
    if (shortName !== "") return shortName
    var name = String(bot.name || "Bob")
    var split = name.indexOf(" · ")
    return split > 0 ? name.slice(0, split) : name
  }

  function botRole() {
    var bot = root.currentBot()
    return bot ? String(bot.description || "") : ""
  }

  function botTag() {
    var bot = root.currentBot()
    if (!bot || bot.isPrimary) return "Main"
    var role = root.plainLine(bot.description || "", 22)
    return role !== "" ? role : "Bot"
  }

  function paletteFill(name) {
    return Palette.known(name) ? Palette.get(name).fill : root.accent
  }

  function matchBot(query) {
    var q = String(query || "").trim()
    var lower = q.toLowerCase()
    var i
    if (q === "") return null
    for (i = 0; i < root.bots.length; i++) if (root.bots[i].id === q) return root.bots[i]
    for (i = 0; i < root.bots.length; i++) {
      var bot = root.bots[i]
      var name = String(bot.name || "").toLowerCase()
      var shortName = String(bot.shortName || "").toLowerCase()
      if (name === lower || shortName === lower) return bot
    }
    for (i = 0; i < root.bots.length; i++) {
      var item = root.bots[i]
      var label = String(item.shortName || item.name || "").toLowerCase()
      if (label.indexOf(lower) === 0 || String(item.name || "").toLowerCase().indexOf(lower) === 0) return item
    }
    return null
  }

  function destinationShape() {
    if (root.syncOn) {
      var bot = root.currentBot()
      var name = bot ? String(bot.avatarShape || "") : ""
      return Shapes.known(name) ? name : "blob"
    }
    return Shapes.known(root.customShape) ? root.customShape : "blob"
  }

  function destinationColor() {
    if (root.syncOn) {
      var bot = root.currentBot()
      var name = bot ? String(bot.avatarColor || "") : ""
      return Palette.accepts(name) ? name : "blue"
    }
    return Palette.accepts(root.customColor) ? root.customColor : "orange"
  }

  function retargetAppearance(animate) {
    var nextShape = root.destinationShape()
    var nextColor = root.destinationColor()
    if (!animate || (nextShape === root.shapeTo && nextColor === root.colorTo && root.morphProgress >= 0.999)) {
      root.shapeFrom = nextShape
      root.shapeTo = nextShape
      root.colorFrom = nextColor
      root.colorTo = nextColor
      root.morphProgress = 1
      return
    }
    root.shapeFrom = root.shapeTo
    root.colorFrom = root.colorTo
    root.shapeTo = nextShape
    root.colorTo = nextColor
    root.morphProgress = 0
    morphAnim.restart()
  }

  function loadSettings() {
    root.chosenBotId = String(root.setting("botId", root.defaultBotId))
    root.syncOn = root.setting("syncAppearance", true) !== false
    root.customShape = String(root.setting("shape", "teardrop"))
    root.customColor = String(root.setting("color", "orange"))
    root.dodgeOn = root.setting("dodge", true) !== false
    var motion = String(root.setting("motion", ""))
    if (motion !== "calm" && motion !== "playful" && motion !== "hyper")
      motion = root.setting("idleMotion", true) !== false ? "playful" : "calm"
    root.motionName = motion
    root.idleOn = motion !== "calm"
    var anchor = String(root.setting("anchor", "br"))
    root.anchorName = anchor === "bl" || anchor === "tr" || anchor === "tl" ? anchor : "br"
    root.sizeName = String(root.setting("size", "medium"))
    root.sizePx = root.settingInt("sizePx", 128, 48, 320)
    root.posRight = root.settingInt("marginX", 24, 0, 4000)
    root.posBottom = root.settingInt("marginY", 24, 0, 4000)
    if (root.bots.length === 0) root.applyBots("")
    if (!root.findBot(root.chosenBotId)) root.chosenBotId = root.defaultBotId
    root.ready = true
    root.retargetAppearance(false)
    root.lastMoveAt = Date.now()
  }

  Component.onCompleted: {
    root.loadSettings()
    root.latchMonitor()
    cursorProc.running = root.cursorHelper !== ""
  }

  function scheduleSave() { saveTimer.restart() }

  function saveSettings() {
    if (!root.shell || typeof root.shell.updateEntryInline !== "function") return
    userConfig.reload()
    var settings = {}
    var entry = root.ownEntry()
    var key
    for (key in entry) if (key !== "id") settings[key] = entry[key]
    settings.marginX = root.posRight
    settings.marginY = root.posBottom
    settings.botId = root.chosenBotId
    settings.syncAppearance = root.syncOn
    settings.shape = root.customShape
    settings.color = root.customColor
    settings.size = root.sizeName
    settings.sizePx = root.sizePx
    settings.dodge = root.dodgeOn
    settings.motion = root.motionName
    settings.anchor = root.anchorName
    settings.idleMotion = root.motionName !== "calm"
    root.shell.updateEntryInline(root.pluginId, settings)
  }

  Timer {
    id: saveTimer
    interval: 500
    onTriggered: root.saveSettings()
  }

  function selectBot(id) {
    if (!root.findBot(id)) return "unknown bot"
    root.chosenBotId = id
    root.switcherOpen = false
    root.rosterExpanded = false
    root.retargetAppearance(true)
    root.scheduleSave()
    root.hop()
    return root.botLabel()
  }

  function selectShape(name) {
    if (!Shapes.known(name)) return "unknown shape"
    root.syncOn = false
    root.customShape = name
    root.retargetAppearance(true)
    root.scheduleSave()
    return "ok"
  }

  function selectColor(name) {
    if (!Palette.accepts(name)) return "unknown color"
    root.syncOn = false
    root.customColor = name
    root.retargetAppearance(true)
    root.scheduleSave()
    return "ok"
  }

  function setSync(value) {
    root.syncOn = value === true
    root.retargetAppearance(true)
    root.scheduleSave()
  }

  function setSize(name) {
    if (name !== "small" && name !== "medium" && name !== "large" && name !== "custom") return
    root.sizeName = name
    root.scheduleSave()
  }

  function setDodge(value) {
    root.dodgeOn = value === true
    if (!root.dodgeOn) root.ghost = false
    root.scheduleSave()
  }

  function setMotion(name) {
    if (name !== "calm" && name !== "playful" && name !== "hyper") return
    root.motionName = name
    root.idleOn = name !== "calm"
    if (name === "calm") {
      root.idleY = 0
      root.orbit = 0
    }
    root.scheduleSave()
  }

  function setAnchor(name) {
    if (name !== "br" && name !== "bl" && name !== "tr" && name !== "tl") return
    root.anchorName = name
    root.scheduleSave()
  }

  function setIdle(value) {
    root.setMotion(value === true ? "playful" : "calm")
  }

  function plainLine(value, max) {
    return String(value || "").replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim().slice(0, max)
  }

  function cleanText(value, max) {
    var text = String(value || "").replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
    text = text.replace(/[<>]/g, "")
    text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    return text.trim().slice(0, max)
  }

  function safeUrl(value) {
    var url = String(value || "")
    if (url.length === 0 || url.length > 2048) return ""
    if (/[\s\u0000-\u001f\u007f-\u009f<>"'`\\]/.test(url)) return ""
    var match = /^(https?):\/\/([^\/?#]*)/i.exec(url)
    if (!match || match[2].indexOf("@") >= 0) return ""
    var host = match[2].replace(/:\d{1,5}$/, "").replace(/^\[|\]$/g, "").toLowerCase()
    if (host === "") return ""
    if (match[1].toLowerCase() === "http" && host !== "localhost" && host !== "127.0.0.1" && host !== "::1") return ""
    return url
  }

  function linkButton(label, url) {
    var cleanLabel = root.plainLine(label, 24)
    var cleanUrl = root.safeUrl(url)
    return cleanLabel !== "" && cleanUrl !== "" ? { label: cleanLabel, url: cleanUrl } : null
  }

  function openLink(url) {
    var clean = root.safeUrl(url)
    if (clean === "") return
    Quickshell.execDetached(["omarchy-launch-browser", clean])
  }

  function openBubble() {
    root.present = true
    root.cardPage = "chat"
    root.bubbleOpen = true
    root.replyUnread = false
    root.menuOpen = false
    root.wake()
    Qt.callLater(function () { if (bubblePanel) bubblePanel.focusPrompt() })
  }

  function closeBubble() {
    root.bubbleOpen = false
    root.switcherOpen = false
    root.rosterExpanded = false
  }

  function openSettings() {
    root.present = true
    root.cardPage = "appearance"
    root.bubbleOpen = true
    root.menuOpen = false
    root.wake()
  }

  function closeSettings() { root.cardPage = "chat" }

  function toggleBubble() {
    if (!root.present) root.summon()
    else if (root.bubbleOpen) root.closeBubble()
    else root.openBubble()
  }

  function summon() {
    root.present = true
    root.openBubble()
    root.hop()
    root.flashExpression("happy", 1400)
  }

  function hideCompanion() {
    root.cancelAsk()
    root.closeBubble()
    root.closeSettings()
    root.menuOpen = false
    root.present = false
    root.ghost = false
  }

  function showCompanion() {
    root.present = true
  }

  // Closing never cancels an ask. A reply that lands while the bubble is
  // closed leaves a dot on the mark until the bubble is opened again.
  function dismissSurfaces() {
    var had = root.bubbleOpen || root.menuOpen
    root.closeBubble()
    root.closeSettings()
    root.menuOpen = false
    return had
  }

  function flashExpression(name, ms) {
    root.expression = name
    root.sleepHold = name === "sleep"
    expressionTimer.interval = ms
    expressionTimer.restart()
  }

  function wake() {
    root.sleepHold = false
    if (root.expression === "sleep") root.expression = "idle"
    root.lastMoveAt = Date.now()
  }

  function hop() { hopAnim.restart() }

  function playAnimation(name) {
    var key = String(name || "")
    if (key === "wave") { waveAnim.restart(); return "ok" }
    if (key === "think") { root.flashExpression("think", 2400); return "ok" }
    if (key === "happy") { root.flashExpression("happy", 1600); root.hop(); return "ok" }
    if (key === "celebrate") { root.flashExpression("celebrate", 1600); root.hop(); return "ok" }
    if (key === "alert") { root.flashExpression("alert", 1400); return "ok" }
    if (key === "sleep") { root.flashExpression("sleep", 60000); return "ok" }
    if (key === "hop") { root.hop(); return "ok" }
    if (key === "spin") { spinAnim.restart(); return "ok" }
    if (key === "morph") {
      var current = root.shapeTo
      var index = Shapes.NAMES.indexOf(Shapes.resolve(current))
      if (index < 0) index = 0
      var next = Shapes.NAMES[(index + 1) % Shapes.NAMES.length]
      root.shapeFrom = current
      root.shapeTo = next
      root.morphProgress = 0
      morphAnim.restart()
      morphBackTimer.restart()
      return "ok"
    }
    return "unknown"
  }

  Timer {
    id: morphBackTimer
    interval: 700
    onTriggered: {
      root.shapeFrom = root.shapeTo
      root.colorFrom = root.colorTo
      root.shapeTo = root.destinationShape()
      root.colorTo = root.destinationColor()
      root.morphProgress = 0
      morphAnim.restart()
    }
  }

  function sayNotice(title, text, links) {
    var body = root.plainLine(text, 300)
    if (body === "") return "empty text"
    root.summon()
    root.askedText = ""
    root.noticeLinks = links || []
    var who = root.plainLine(title, 80)
    root.bubbleBody = (who !== "" ? who + "\n" : "") + body
    root.flashExpression("alert", 1200)
    syllableAnim.restart()
    return "ok"
  }

  // While an ask is running the field stays editable for the next prompt,
  // and Enter leaves the draft alone instead of throwing it away.
  function submitPrompt(value) {
    var prompt = root.plainLine(value, 4000)
    if (prompt === "" || root.asking) return
    var route = Dictation.route(prompt, root.bots, root.defaultBotId)
    if (route.matched) {
      if (route.botId) root.selectBot(route.botId)
      prompt = root.plainLine(route.prompt, 4000)
      root.promptDraft = ""
      if (prompt === "") {
        root.openBubble()
        return
      }
    }
    root.promptDraft = ""
    root.noticeLinks = []
    root.bubbleBody = ""
    root.launchAsk(prompt)
  }

  function dictateText(text) {
    var raw = root.plainLine(text, 4000)
    if (raw === "") return "empty"
    var route = Dictation.route(raw, root.bots, root.defaultBotId)
    if (!route.matched) return "ignored"
    if (root.asking) return "busy"
    if (route.botId) root.selectBot(route.botId)
    root.promptDraft = ""
    root.noticeLinks = []
    root.bubbleBody = ""
    root.openBubble()
    if (!route.prompt) return "opened"
    return root.launchAsk(route.prompt)
  }

  function toggleDictation() {
    if (root.dictateHelper.indexOf("/bin/grokbot-dictate") < 0 || root.dictateHelper.indexOf("..") >= 0)
      return "error"
    Quickshell.execDetached(["/usr/bin/python3", root.dictateHelper])
    return "ok"
  }

  function trustedBin(path) {
    var text = String(path || "")
    if (text !== "/usr/bin/setpriv" && text !== "/usr/bin/python3" && text !== "/bin/python3") return false
    return true
  }

  function failAsk(message) {
    root.asking = false
    root.bubbleBody = message
    root.expression = "idle"
    root.openBubble()
  }

  function askEnvironment() {
    var env = {
      PATH: "/usr/bin:/bin",
      PYTHONNOUSERSITE: "1",
      PYTHONSAFEPATH: "1",
      PYTHONDONTWRITEBYTECODE: "1"
    }
    var keys = [
      "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "TERM",
      "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME", "XDG_RUNTIME_DIR",
      "TMPDIR", "SSL_CERT_FILE", "SSL_CERT_DIR",
      "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy",
      "MISE_DATA_DIR", "MISE_SHIMS_DIR",
      "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN",
      "OPENAI_API_KEY", "OPENAI_BASE_URL", "GEMINI_API_KEY", "GOOGLE_API_KEY",
      "GITHUB_TOKEN", "GH_TOKEN", "XAI_API_KEY", "GROK_API_KEY"
    ]
    var i
    for (i = 0; i < keys.length; i++) {
      var value = Quickshell.env(keys[i])
      if (value) env[keys[i]] = String(value)
    }
    return env
  }

  function launchAsk(prompt) {
    if (askProc.running) return "busy"
    root.openBubble()
    root.askedText = String(prompt || "")
    root.noticeLinks = []
    root.bubbleBody = ""
    if (!root.trustedBin("/usr/bin/setpriv") || !root.trustedBin("/usr/bin/python3")) {
      root.failAsk("Couldn't find trusted setpriv and python3.")
      return "error"
    }
    if (root.askHelper.indexOf("/bin/grokbot-ask") < 0 || root.askHelper.indexOf("..") >= 0) {
      root.failAsk("The ask helper is not the bundled script.")
      return "error"
    }
    var bot = root.currentBot()
    root.pendingJson = JSON.stringify({
      botId: bot ? bot.id : root.defaultBotId,
      botName: root.botLabel(),
      prompt: prompt,
      host: ""
    })
    root.asking = true
    root.expression = "think"
    askProc.command = ["/usr/bin/setpriv", "--pdeathsig", "TERM", "/usr/bin/python3", "-I", root.askHelper]
    askProc.environment = root.askEnvironment()
    askProc.stdinEnabled = true
    askProc.running = true
    askTimeout.restart()
    return "ok"
  }

  function cancelAsk() {
    askTimeout.stop()
    if (askProc.running) askProc.running = false
    root.asking = false
  }

  function stopAsk() {
    if (!root.asking) return
    root.cancelAsk()
    root.bubbleBody = "Stopped."
    root.expression = "idle"
  }

  function replyLanded() {
    if (root.bubbleOpen) return
    root.replyUnread = true
    root.hop()
  }

  Process {
    id: askProc
    clearEnvironment: true
    stdinEnabled: false
    stdout: StdioCollector { id: askOut }
    stderr: StdioCollector { id: askErr }
    onStarted: {
      if (root.pendingJson !== "") askProc.write(root.pendingJson)
      askProc.stdinEnabled = false
    }
    onExited: function (code) {
      askTimeout.stop()
      if (!root.asking) return
      root.asking = false
      var out = root.cleanText(askOut.text, 4000)
      var err = root.cleanText(askErr.text, 400)
      if (code === 0 && out !== "") {
        root.bubbleBody = out
        root.flashExpression("happy", 1600)
        syllableAnim.restart()
      } else {
        root.bubbleBody = err !== "" ? err : "The ask didn't return a reply."
        root.expression = "idle"
      }
      root.replyLanded()
    }
  }

  Timer {
    id: askTimeout
    interval: 180000
    onTriggered: {
      root.cancelAsk()
      root.bubbleBody = "That took too long, so I stopped waiting."
      root.expression = "idle"
      root.replyLanded()
    }
  }

  Timer {
    interval: 40
    repeat: true
    running: root.expression === "think" || root.asking
    onTriggered: root.thinkAngle += 0.18
  }

  function cursorLine(line) {
    var match = /^(-?\d{1,6}) (-?\d{1,6})$/.exec(String(line).slice(0, 32))
    if (!match) return
    root.cursorX = Number(match[1])
    root.cursorY = Number(match[2])
    root.cursorKnown = true
    root.lastMoveAt = Date.now()
    if (root.sleepHold || root.expression === "sleep") root.wake()
    root.updateGazeTarget()
    if (root.idleOn) gazeTimer.running = true
    else {
      root.gazeX = root.gazeTargetX
      root.gazeY = root.gazeTargetY
    }
    if (root.dragging) root.dragMove()
    root.pointerNear = root.pointerIsNear()
    root.updateDodge()
  }

  function updateGazeTarget() {
    if (!root.cursorKnown || !win.screen) return
    var local = mark.mapToItem(null, mark.width / 2, mark.height / 2)
    var dx = root.cursorX - (win.screen.x + local.x)
    var dy = root.cursorY - (win.screen.y + local.y)
    var dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 1) {
      root.gazeTargetX = 0
      root.gazeTargetY = 0
      return
    }
    var reach = dist / (dist + 180)
    root.gazeTargetX = Math.max(-1, Math.min(1, dx / dist * reach))
    root.gazeTargetY = Math.max(-1, Math.min(1, dy / dist * reach))
  }

  Timer {
    id: gazeTimer
    interval: 32
    repeat: true
    onTriggered: {
      root.gazeX += (root.gazeTargetX - root.gazeX) * 0.22
      root.gazeY += (root.gazeTargetY - root.gazeY) * 0.22
      var error = Math.abs(root.gazeTargetX - root.gazeX) + Math.abs(root.gazeTargetY - root.gazeY)
      if (error < 0.02) running = false
    }
  }

  Process {
    id: cursorProc
    command: ["/usr/bin/python3", "-I", "-S", root.cursorHelper]
    clearEnvironment: true
    environment: ({
      HYPRLAND_INSTANCE_SIGNATURE: Quickshell.env("HYPRLAND_INSTANCE_SIGNATURE") || "",
      XDG_RUNTIME_DIR: Quickshell.env("XDG_RUNTIME_DIR") || ""
    })
    stdout: SplitParser { onRead: function (line) { root.cursorLine(line) } }
    onExited: function () {
      if (root.present && cursorRestarts < 8) cursorRestart.restart()
    }
  }

  property int cursorRestarts: 0
  Timer {
    id: cursorRestart
    interval: 2000
    onTriggered: {
      root.cursorRestarts++
      if (root.present && root.cursorHelper !== "") cursorProc.running = true
    }
  }

  onPresentChanged: {
    cursorRestart.stop()
    cursorProc.running = root.present && root.cursorHelper !== ""
    if (!root.present) root.cursorRestarts = 0
  }

  Component.onDestruction: {
    cursorProc.running = false
    if (askProc.running) askProc.running = false
  }

  function stageRect() {
    if (!win.screen) return null
    var point = stage.mapToItem(null, 0, 0)
    return {
      x: win.screen.x + point.x,
      y: win.screen.y + point.y,
      w: stage.width,
      h: stage.height
    }
  }

  function pointerIsNear() {
    var rect = root.stageRect()
    if (!rect || !root.cursorKnown) return false
    var margin = 36
    return root.cursorX >= rect.x - margin && root.cursorX <= rect.x + rect.w + margin
      && root.cursorY >= rect.y - margin && root.cursorY <= rect.y + rect.h + margin
  }

  function pointerInside() {
    var rect = root.stageRect()
    if (!rect || !root.cursorKnown) return false
    return root.cursorX >= rect.x && root.cursorX <= rect.x + rect.w
      && root.cursorY >= rect.y && root.cursorY <= rect.y + rect.h
  }

  function updateDodge() {
    if (!root.dodgeOn || !root.present || root.dragging || root.surfacesOpen || !root.cursorKnown) {
      root.ghost = false
      root.claimed = false
      root.dwellSince = 0
      return
    }
    if (!root.pointerIsNear()) {
      root.ghost = false
      root.claimed = false
      root.dwellSince = 0
      return
    }
    if (root.pointerInside()) {
      if (root.dwellSince === 0) root.dwellSince = Date.now()
      if (Date.now() - root.dwellSince > 380) root.claimed = true
    } else {
      root.dwellSince = 0
      root.claimed = false
    }
    root.ghost = !root.claimed
  }

  Timer {
    interval: 100
    repeat: true
    running: root.dodgeOn && root.present && !root.surfacesOpen && root.pointerNear
    onTriggered: root.updateDodge()
  }

  Timer {
    interval: 5000
    repeat: true
    running: root.present && !root.surfacesOpen && !root.asking
    onTriggered: {
      if (!root.sleepHold && Date.now() - root.lastMoveAt > 120000) root.expression = "sleep"
    }
  }

  Timer {
    id: expressionTimer
    onTriggered: {
      if (root.asking) root.expression = "think"
      else if (root.sleepHold || Date.now() - root.lastMoveAt > 120000) root.expression = "sleep"
      else root.expression = "idle"
    }
  }

  Timer {
    interval: 2800 + Math.random() * 2400
    repeat: true
    running: root.present && root.expression === "idle" && !root.asking
    onTriggered: {
      root.blinkTwice = Math.random() < 0.35
      blinkAnim.restart()
    }
  }

  SequentialAnimation {
    id: blinkAnim
    loops: root.blinkTwice ? 2 : 1
    NumberAnimation { target: root; property: "eyeOpen"; to: 0.08; duration: 70 }
    NumberAnimation { target: root; property: "eyeOpen"; to: 1; duration: 90 }
    PauseAnimation { duration: 80 }
  }

  SequentialAnimation {
    running: root.present && !root.dragging
    loops: Animation.Infinite
    NumberAnimation { target: root; property: "breathe"; to: 1.035; duration: 1700; easing.type: Easing.InOutSine }
    NumberAnimation { target: root; property: "breathe"; to: 0.985; duration: 1700; easing.type: Easing.InOutSine }
  }

  SequentialAnimation {
    running: root.motionName === "playful" && root.present && !root.dragging
    loops: Animation.Infinite
    NumberAnimation { target: root; property: "idleY"; to: -7; duration: 1800; easing.type: Easing.InOutSine }
    NumberAnimation { target: root; property: "idleY"; to: 0; duration: 1800; easing.type: Easing.InOutSine }
  }

  NumberAnimation {
    running: root.motionName === "hyper" && root.present && !root.dragging
    loops: Animation.Infinite
    target: root
    property: "orbit"
    from: 0
    to: 360
    duration: 2800
  }

  Timer {
    interval: 2600
    repeat: true
    running: root.motionName === "hyper" && root.present && !root.dragging && !root.asking
    onTriggered: root.hop()
  }

  SequentialAnimation {
    running: root.expression === "sleep"
    loops: Animation.Infinite
    NumberAnimation { target: root; property: "sleepDrift"; to: -8; duration: 1400; easing.type: Easing.InOutSine }
    NumberAnimation { target: root; property: "sleepDrift"; to: 0; duration: 1400; easing.type: Easing.InOutSine }
  }

  SequentialAnimation {
    id: hopAnim
    NumberAnimation { target: root; property: "hopY"; to: -18; duration: 160; easing.type: Easing.OutQuad }
    NumberAnimation { target: root; property: "hopY"; to: 0; duration: 320; easing.type: Easing.OutBounce }
  }

  SequentialAnimation {
    id: syllableAnim
    NumberAnimation { target: root; property: "breathe"; to: 1.08; duration: 90 }
    NumberAnimation { target: root; property: "breathe"; to: 0.96; duration: 90 }
    NumberAnimation { target: root; property: "breathe"; to: 1; duration: 120 }
  }

  NumberAnimation {
    id: spinAnim
    target: root
    property: "spinAngle"
    from: 0
    to: 360
    duration: 700
    easing.type: Easing.InOutCubic
  }

  SequentialAnimation {
    id: waveAnim
    NumberAnimation { target: root; property: "waveAngle"; to: -10; duration: 140 }
    NumberAnimation { target: root; property: "waveAngle"; to: 10; duration: 180 }
    NumberAnimation { target: root; property: "waveAngle"; to: -6; duration: 140 }
    NumberAnimation { target: root; property: "waveAngle"; to: 0; duration: 160 }
  }

  NumberAnimation {
    id: morphAnim
    target: root
    property: "morphProgress"
    from: 0
    to: 1
    duration: 560
    easing.type: Easing.InOutCubic
  }

  function beginDrag() {
    root.dragging = true
    root.ghost = false
    root.dragCursorX = root.cursorX
    root.dragCursorY = root.cursorY
    root.dragRight = root.posRight
    root.dragBottom = root.posBottom
  }

  function dragMove() {
    if (!win.screen) return
    var maxRight = Math.max(0, win.width - stage.width)
    var maxBottom = Math.max(0, win.height - stage.height)
    var dx = root.cursorX - root.dragCursorX
    var dy = root.cursorY - root.dragCursorY
    var nextX = root.anchorFromRight ? root.dragRight - dx : root.dragRight + dx
    var nextY = root.anchorFromBottom ? root.dragBottom - dy : root.dragBottom + dy
    root.posRight = Math.max(0, Math.min(maxRight, Math.round(nextX)))
    root.posBottom = Math.max(0, Math.min(maxBottom, Math.round(nextY)))
  }

  function endDrag() {
    root.dragging = false
    root.saveSettings()
  }

  function latchMonitor() {
    if (root.startMonitor === "" && Hyprland.focusedMonitor)
      root.startMonitor = String(Hyprland.focusedMonitor.name || "")
  }

  Connections {
    target: Hyprland
    function onFocusedMonitorChanged() { root.latchMonitor() }
  }

  readonly property string monitorSetting: {
    var value = String(root.setting("monitor", ""))
    return /^[A-Za-z0-9._-]{1,64}$/.test(value) ? value : ""
  }

  readonly property var targetScreen: {
    var screens = Quickshell.screens
    var wanted = root.monitorSetting !== "" ? root.monitorSetting : root.startMonitor
    var i
    for (i = 0; i < screens.length; i++) if (screens[i].name === wanted) return screens[i]
    return screens.length > 0 ? screens[0] : null
  }

  IpcHandler {
    target: "io.github.tcballard.grokbot-desktop"

    function summon(): string { root.summon(); return "ok" }
    function show(): string { root.showCompanion(); return "ok" }
    function hide(): string { root.hideCompanion(); return "ok" }
    function toggle(): string { root.toggleBubble(); return "ok" }
    function settings(): string { root.openSettings(); return "ok" }
    function ask(prompt: string): string {
      var text = root.plainLine(prompt, 4000)
      if (text === "") return "empty"
      return root.launchAsk(text)
    }
    function dictate(text: string): string { return root.dictateText(text) }
    function bot(name: string): string {
      var found = root.matchBot(name)
      if (!found) return "unknown bot"
      return root.selectBot(found.id)
    }
    function appearance(shape: string, color: string): string {
      if (!Shapes.known(shape)) return "unknown shape"
      if (!Palette.accepts(color)) return "unknown color"
      root.syncOn = false
      root.customShape = shape
      root.customColor = color
      root.retargetAppearance(true)
      root.scheduleSave()
      return "ok"
    }
    function animate(name: string): string { return root.playAnimation(name) }
    function say(title: string, text: string): string { return root.sayNotice(title, text, []) }
    function sayLink(title: string, text: string, label: string, url: string): string {
      var link = root.linkButton(label, url)
      if (!link) return "invalid link"
      return root.sayNotice(title, text, [link])
    }
    function sayLinks(title: string, text: string, label1: string, url1: string, label2: string, url2: string): string {
      var first = root.linkButton(label1, url1)
      var second = root.linkButton(label2, url2)
      if (!first || !second) return "invalid link"
      return root.sayNotice(title, text, [first, second])
    }
    function dismiss(): string { return root.dismissSurfaces() ? "dismissed" : "nothing" }
    function ping(): string { return "ok" }
  }

  PanelWindow {
    id: win
    screen: root.targetScreen
    visible: root.present && root.targetScreen !== null
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    exclusionMode: ExclusionMode.Ignore
    WlrLayershell.namespace: "grokbot-desktop"
    WlrLayershell.layer: WlrLayer.Top
    WlrLayershell.keyboardFocus: root.bubbleOpen ? WlrKeyboardFocus.OnDemand : WlrKeyboardFocus.None

    // Only the mark and the open card take the pointer, so the desktop stays
    // usable while a reply is on screen. The right-click menu is the one
    // modal surface: while it is open a click anywhere closes it.
    mask: Region {
      x: root.menuOpen ? 0 : stage.x
      y: root.menuOpen ? 0 : stage.y
      width: root.menuOpen ? win.width : (root.ghost || !root.present ? 0 : stage.width)
      height: root.menuOpen ? win.height : (root.ghost || !root.present ? 0 : stage.height)
      Region {
        x: bubblePanel.x
        y: bubblePanel.y
        width: root.bubbleOpen ? bubblePanel.width : 0
        height: root.bubbleOpen ? bubblePanel.height : 0
      }
    }

    MouseArea {
      anchors.fill: parent
      visible: root.menuOpen
      z: -1
      acceptedButtons: Qt.LeftButton | Qt.RightButton
      onClicked: root.menuOpen = false
    }

    BubblePanel {
      id: bubblePanel
      app: root
      visible: root.bubbleOpen
      width: Math.min(464, Math.max(320, win.width - 24))
      maxHeight: {
        var above = stage.y - 20
        var below = win.height - stage.y - stage.height - 20
        var room = root.anchorFromBottom ? above : below
        return Math.max(360, Math.min(room, win.height - 16))
      }
      x: Math.max(8, Math.min(stage.x + stage.width - width, win.width - width - 8))
      y: {
        var above = stage.y - height - 12
        var below = stage.y + stage.height + 12
        var place = root.anchorFromBottom ? above : below
        if (place < 8) place = below
        if (place + height > win.height - 8) place = above
        return Math.max(8, Math.min(place, win.height - height - 8))
      }
    }

    Rectangle {
      id: menuCard
      visible: root.menuOpen
      width: 188
      height: menuColumn.implicitHeight + 16
      radius: 12
      color: "#141416"
      border.width: 1
      border.color: "#27272A"
      x: Math.max(8, stage.x - width - 8)
      y: Math.max(8, stage.y)
      Column {
        id: menuColumn
        x: 8
        y: 8
        width: parent.width - 16
        spacing: 4
        Repeater {
          model: [
            { "label": "Appearance & bots", "action": "settings" },
            { "label": "Hide companion", "action": "hide" }
          ]
          delegate: Rectangle {
            required property var modelData
            width: menuColumn.width
            height: 32
            radius: 8
            color: menuArea.containsMouse ? Qt.rgba(1, 1, 1, 0.08) : "transparent"
            Text {
              anchors.verticalCenter: parent.verticalCenter
              x: 8
              text: modelData.label
              color: "#F4F4F5"
              font.pixelSize: 13
              textFormat: Text.PlainText
            }
            MouseArea {
              id: menuArea
              anchors.fill: parent
              hoverEnabled: true
              onClicked: {
                if (modelData.action === "settings") root.openSettings()
                else root.hideCompanion()
              }
            }
          }
        }
      }
    }

    Item {
      id: stage
      width: root.markSize + 24
      height: root.markSize + 28
      x: {
        var edge = root.anchorFromRight ? win.width - width - root.posRight : root.posRight
        return Math.max(0, Math.min(win.width - width, edge))
      }
      y: {
        var edge = root.anchorFromBottom ? win.height - height - root.posBottom : root.posBottom
        return Math.max(0, Math.min(win.height - height, edge))
      }

      Rectangle {
        anchors.horizontalCenter: parent.horizontalCenter
        y: parent.height - 14
        width: root.markSize * 0.46
        height: 10
        radius: 5
        color: "#000000"
        opacity: root.ghost ? 0.05 : 0.18
      }

      CompanionMark {
        id: mark
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 8
        width: root.markSize
        height: root.markSize
        shapeFrom: root.shapeFrom
        shapeTo: root.shapeTo
        morph: root.morphProgress
        colorFromName: root.colorFrom
        colorName: root.colorTo
        accent: root.accent
        gazeX: root.gazeX
        gazeY: root.gazeY
        eyeOpen: root.eyeOpen
        expression: root.expression === "celebrate" ? "happy" : root.expression
        thinkAngle: root.thinkAngle
        sleepDrift: root.sleepDrift
        imageSource: {
          var bot = root.currentBot()
          if (!root.syncOn || !bot || !bot.avatarImage) return ""
          return "file://" + bot.avatarImage
        }
        opacity: root.ghost ? 0.28 : 1
        scale: root.breathe
        transform: [
          Translate {
            x: root.motionName === "hyper" ? Math.cos(root.orbit * Math.PI / 180) * 6 : 0
            y: root.idleY + root.hopY + (root.motionName === "hyper" ? Math.sin(root.orbit * Math.PI / 180) * 5 : 0)
          },
          Rotation { origin.x: mark.width / 2; origin.y: mark.height / 2; angle: root.spinAngle + root.waveAngle }
        ]
        Behavior on opacity { NumberAnimation { duration: 160 } }

        Rectangle {
          id: replyDot
          width: Math.max(12, root.markSize * 0.11)
          height: width
          radius: width / 2
          x: mark.width * 0.7
          y: mark.height * 0.14
          color: "#F4F4F5"
          border.width: 2
          border.color: "#141416"
          scale: root.replyUnread ? 1 : 0
          visible: scale > 0.01
          Behavior on scale { NumberAnimation { duration: 260; easing.type: Easing.OutBack } }
        }
      }

      MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        hoverEnabled: true
        preventStealing: true
        property point pressAt: Qt.point(0, 0)
        property bool moved: false
        onPressed: function (mouse) {
          pressAt = Qt.point(mouse.x, mouse.y)
          moved = false
          if (mouse.button === Qt.RightButton) {
            root.menuOpen = !root.menuOpen
            mouse.accepted = true
            return
          }
          if (mouse.modifiers & Qt.MetaModifier) root.beginDrag()
        }
        onPositionChanged: function (mouse) {
          if (!(mouse.buttons & Qt.LeftButton)) return
          var dx = mouse.x - pressAt.x
          var dy = mouse.y - pressAt.y
          if (!root.dragging && (Math.abs(dx) > 6 || Math.abs(dy) > 6 || (mouse.modifiers & Qt.MetaModifier)))
            root.beginDrag()
        }
        onReleased: function (mouse) {
          if (root.dragging) {
            root.endDrag()
            moved = true
          }
          if (mouse.button === Qt.LeftButton && !moved) {
            root.toggleBubble()
            root.hop()
          }
        }
        onContainsMouseChanged: {
          if (containsMouse) {
            root.claimed = true
            root.ghost = false
          }
        }
      }
    }
  }
}
