import QtQuick
import QtQuick.Shapes
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons
import qs.Commons as Commons
import "qml/shapes.js" as Shapes
import "qml/palette.js" as Palette
import "qml/dictation.js" as Dictation
import "qml/theme.js" as Theme

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
  readonly property string attachHelper: root.localPath(Qt.resolvedUrl("bin/grokbot-attach"))

  property bool ready: false
  property bool present: true
  property bool bubbleOpen: false
  property string cardPage: "chat"
  readonly property bool settingsOpen: root.bubbleOpen && root.cardPage === "appearance"
  property bool menuOpen: false
  property bool switcherOpen: false
  property bool asking: false
  // Lit while a dictation toggle is believed to be recording. Neither
  // backend reports its state here, so every exit path clears it.
  property bool dictating: false
  property bool replyUnread: false
  property bool dragging: false
  property bool ghost: false
  property bool claimed: false
  property bool pointerNear: false
  property bool dodgeOn: true
  property bool idleOn: true
  property string motionName: "calm"
  property string anchorName: "br"
  property bool rosterExpanded: false
  property string askedText: ""
  property bool syncOn: true
  property string chosenBotId: root.defaultBotId
  // Most recently used bot ids, newest first. The bubble pins the primary
  // bot plus the latest of these.
  property var recentBots: []
  property string switchTag: ""
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
  // The contour and colours on screen when the current morph began, so a
  // new target picked mid-morph starts from what is visible, not from the
  // previous target.
  property var morphFromPoints: null
  property var morphToPoints: null
  property var morphFromEyes: null
  property real stemFrom: 0
  property real stemTo: 0
  property var morphToEyes: null
  property color fillFrom: "#FF6700"
  property color eyeFrom: "#141416"
  readonly property var shownFace: root.morphFromPoints ? Shapes.mix(root.morphFromPoints, root.morphToPoints, root.morphProgress) : null
  readonly property real shownStem: root.morphFromEyes ? root.stemFrom + (root.stemTo - root.stemFrom) * root.morphProgress : -1
  readonly property var shownEyes: root.morphFromEyes ? Shapes.mixEyes(root.morphFromEyes, root.morphToEyes, root.morphProgress) : null
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
  property real talkScale: 1
  property real morphPop: 1
  // Pointer feedback: a resting pointer perks the mark up; a drag lifts it
  // off the floor and leans it into the motion.
  property bool hovering: false
  property real hoverScale: root.hovering && !root.dragging ? 1.04 : 1
  Behavior on hoverScale { NumberAnimation { duration: root.ms(160); easing.type: Easing.OutCubic } }
  property real dragLift: root.dragging ? 1 : 0
  Behavior on dragLift { NumberAnimation { duration: root.ms(180); easing.type: Easing.OutCubic } }
  property real dragTilt: 0
  property real dragTiltTarget: 0
  property real lastDragX: 0
  property real lastDragAt: 0
  property real idleY: 0
  property real hopY: 0
  // Vertical squash and stretch about the base; width answers inversely so
  // the mark keeps its volume.
  property real squash: 1
  property real bobAmp: root.liveMotion === "playful" ? 1 : 0
  Behavior on bobAmp { NumberAnimation { duration: root.ms(420); easing.type: Easing.InOutCubic } }
  readonly property real stretchY: root.squash * (1 + root.bobAmp * (-root.idleY / 7 * 0.04 - 0.02))
  property real spinAngle: 0
  property real waveAngle: 0
  property real orbit: 0
  // Hyper's orbit radius fades in and out so switching motion never jumps.
  property real orbitAmp: root.liveMotion === "hyper" ? 1 : 0
  Behavior on orbitAmp { NumberAnimation { duration: root.ms(420); easing.type: Easing.InOutCubic } }
  property var bots: []
  property string bubbleBody: ""
  property string promptDraft: ""
  property var noticeLinks: []
  // Files waiting to go with the next ask, as paths grokbot-attach saved,
  // and those that went with the latest ask.
  property var pendingFiles: []
  property var askedFiles: []
  readonly property int fileLimit: 4
  property bool attaching: false
  property string attachNote: ""
  // Earlier exchanges with the bot on screen, oldest first, each
  // { asked, files, body, links }; the latest stays in askedText,
  // askedFiles, bubbleBody, and noticeLinks. A new ask or notice moves the
  // latest here.
  property var history: []
  readonly property int historyLimit: 40
  // Each bot keeps its own conversation. The one on screen lives in
  // history, askedText, bubbleBody, noticeLinks, and promptDraft; switching
  // bots puts it away under its bot and brings the next bot's back. They are
  // kept for the session only and never written to disk.
  property var threads: ({})
  // The bot whose ask is running, and bots with a reply not yet seen.
  property string askBotId: ""
  property var unreadBots: []
  readonly property string threadBotId: {
    var bot = root.currentBot()
    return bot ? bot.id : root.defaultBotId
  }
  readonly property bool askingHere: root.asking && root.askBotId === root.threadBotId
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
  // The drawn size eases to the chosen size.
  property real shownSize: root.markSize
  Behavior on shownSize { NumberAnimation { duration: root.ms(220); easing.type: Easing.OutCubic } }
  readonly property string shownShape: root.shapeTo
  readonly property string shownColor: root.colorTo
  readonly property string canonicalShape: Shapes.resolve(root.shownShape)
  readonly property bool anchorFromRight: root.anchorName === "br" || root.anchorName === "tr"
  readonly property bool anchorFromBottom: root.anchorName === "br" || root.anchorName === "bl"
  // Omarchy turns shell animation off with Hyprland's (`omarchy toggle
  // animations`, for machines that render on the CPU). Older shells have no
  // Style.reduceMotion, so that reads as motion allowed.
  readonly property bool reduceMotion: root.styleReducesMotion()
  readonly property string liveMotion: root.reduceMotion ? "calm" : root.motionName

  function styleReducesMotion() {
    try {
      return Commons.Style !== undefined && Commons.Style !== null && Commons.Style.reduceMotion === true
    } catch (e) {
      return false
    }
  }

  function ms(value) { return root.reduceMotion ? 0 : value }

  // Text is set like Grok Bot's app, which uses Apple's SF Pro. SF Pro may
  // only be used on Apple platforms, so it is used where it is installed and
  // otherwise the bundled Inter (SIL OFL 1.1), the closest open match, in
  // Regular and SemiBold, subset to Latin, Greek and Cyrillic; fontconfig
  // fills in other scripts. Without either, the shell's font.
  FontLoader {
    id: interRegular
    source: Qt.resolvedUrl("assets/fonts/Inter-Regular.ttf")
  }
  FontLoader {
    id: interSemiBold
    source: Qt.resolvedUrl("assets/fonts/Inter-SemiBold.ttf")
  }
  readonly property var appleFamilies: ["SF Pro Text", "SF Pro"]
  readonly property string fontFamily: root.pickFontFamily()

  function pickFontFamily() {
    var installed = Qt.fontFamilies()
    var i
    for (i = 0; i < root.appleFamilies.length; i++) {
      if (installed.indexOf(root.appleFamilies[i]) >= 0) return root.appleFamilies[i]
    }
    if (interRegular.status === FontLoader.Ready && interSemiBold.status === FontLoader.Ready) return interRegular.font.family
    return root.styleFontFamily()
  }

  function styleFontFamily() {
    try {
      return Commons.Style && Commons.Style.font ? String(Commons.Style.font.family || "") : ""
    } catch (e) {
      return ""
    }
  }

  onReduceMotionChanged: {
    if (!root.reduceMotion) return
    root.breathe = 1
    root.sleepDrift = 0
  }

  readonly property bool surfacesOpen: root.bubbleOpen || root.menuOpen

  // Mark placement in output coordinates. The window covers the output, so
  // these are also window coordinates.
  readonly property int screenW: win.screen ? win.screen.width : 0
  readonly property int screenH: win.screen ? win.screen.height : 0
  readonly property real stageW: root.shownSize + 24
  readonly property real stageH: root.shownSize + 28
  readonly property real stageScreenX: {
    var edge = root.anchorFromRight ? root.screenW - root.stageW - root.posRight : root.posRight
    return Math.max(0, Math.min(root.screenW - root.stageW, edge))
  }
  readonly property real stageScreenY: {
    var edge = root.anchorFromBottom ? root.screenH - root.stageH - root.posBottom : root.posBottom
    return Math.max(0, Math.min(root.screenH - root.stageH, edge))
  }

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
    return root.labelOf(root.currentBot())
  }

  function labelOf(bot) {
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

  // Every bot shows its role: the first clause of its description. The
  // header elides it to fit, so it is never cut mid-word.
  // Switching bots with the bubble closed (voice, IPC) names the new bot
  // beside the mark for a moment.
  function showSwitchTag() {
    root.switchTag = root.botLabel()
    switchTagTimer.restart()
  }

  Timer {
    id: switchTagTimer
    interval: 1400
    onTriggered: root.switchTag = ""
  }

  // The name of the bot whose ask is running.
  function askingLabel() {
    return root.labelOf(root.findBot(root.askBotId))
  }

  function botTag() {
    var bot = root.currentBot()
    var role = root.plainLine(bot ? bot.description : "", 120)
    role = role.split(/[.;:,](\s|$)/)[0].trim()
    if (role !== "") return role
    return bot && bot.isPrimary ? "Main" : "Bot"
  }

  // Fills as they appear on the dark bubble chrome.
  function paletteFill(name) {
    return Palette.known(name) ? Palette.fillFor(name, true) : root.accent
  }

  // The desktop counts as dark when the Omarchy theme's background is.
  readonly property bool desktopDark: (0.2126 * root.paper.r + 0.7152 * root.paper.g + 0.0722 * root.paper.b) < 0.5

  function ringColor(value) {
    var c = Qt.color(value)
    return Palette.ringReadable({ r: c.r, g: c.g, b: c.b }) ? c : Qt.color(Theme.text)
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
    if (nextShape === root.shapeTo && nextColor === root.colorTo && (root.morphProgress >= 0.999 || animate)) return
    if (!animate) {
      morphAnim.stop()
      root.morphFromPoints = null
      root.morphFromEyes = null
      root.shapeFrom = nextShape
      root.shapeTo = nextShape
      root.colorFrom = nextColor
      root.colorTo = nextColor
      root.morphProgress = 1
      return
    }
    root.startMorph(nextShape, nextColor)
  }

  function startMorph(nextShape, nextColor) {
    // The picker-pose contour and eyes, before the desktop mark turns its
    // face: the header and other plain marks share this snapshot.
    var face = mark.blended.points
    var eyesNow = mark.blended.eyes
    root.stemFrom = mark.stemLevel
    root.stemTo = Shapes.resolve(nextShape) === Shapes.STEM_SHAPE ? 1 : 0
    root.morphToEyes = Shapes.eyes(nextShape)
    root.morphFromEyes = eyesNow
    root.fillFrom = mark.fillColor
    root.eyeFrom = mark.eyeColor
    root.morphToPoints = Shapes.align(face, Shapes.get(nextShape).points)
    root.morphFromPoints = face
    root.shapeFrom = root.shapeTo
    root.colorFrom = root.colorTo
    root.shapeTo = nextShape
    root.colorTo = nextColor
    root.morphProgress = 0
    morphAnim.restart()
    morphPopAnim.restart()
  }

  function loadSettings() {
    root.chosenBotId = String(root.setting("botId", root.defaultBotId))
    var recent = root.setting("recentBots", [])
    root.recentBots = Array.isArray(recent) ? recent.filter(function (id) { return typeof id === "string" && id.length <= 64 }).slice(0, 6) : []
    root.syncOn = root.setting("syncAppearance", true) !== false
    root.customShape = String(root.setting("shape", "teardrop"))
    root.customColor = String(root.setting("color", "orange"))
    root.dodgeOn = root.setting("dodge", true) !== false
    var motion = String(root.setting("motion", ""))
    if (motion !== "calm" && motion !== "playful" && motion !== "hyper")
      motion = root.setting("idleMotion", false) === true ? "playful" : "calm"
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
    layerRuleProc.running = true
  }

  // Hyprland animates layer surfaces as they map, which would pop the
  // companion in from the middle of the screen when it is shown again after
  // hide. Omarchy turns that off for its own shell surfaces with a layer
  // rule; the companion adds the same rule for its
  // namespace before its window first maps, and again after a config reload,
  // which drops rules added at runtime. The rule matches only this namespace
  // and is gone at the next reload once the plugin is removed.
  readonly property string layerNamespace: "grokbot-desktop"
  property bool layerRuleTried: false

  Process {
    id: layerRuleProc
    command: ["/usr/bin/hyprctl", "eval",
      "pcall(function() grokbot_desktop_layer_rule:set_enabled(false) end); "
      + "grokbot_desktop_layer_rule = hl.layer_rule({ match = { namespace = \"^" + root.layerNamespace + "$\" }, no_anim = true, animation = \"none\" })"]
    onExited: root.layerRuleTried = true
  }

  // A Hyprland without the Lua API, or no hyprctl, must not keep the
  // companion hidden.
  Timer {
    interval: 1500
    running: !root.layerRuleTried
    onTriggered: root.layerRuleTried = true
  }

  Connections {
    target: Hyprland
    function onRawEvent(event) {
      if (!event) return
      var name = String(event.name)
      if (name === "configreloaded" && !layerRuleProc.running) layerRuleProc.running = true
      else root.screensaverEvent(name, String(event.data || ""))
    }
  }

  // The companion steps aside while Omarchy's screensaver runs. It is named
  // org.omarchy.screensaver either way: a full-screen terminal window in
  // Omarchy before 27 October 2026, which the companion's layer would draw
  // over, and since then a native overlay-layer surface on each output.
  readonly property string screensaverName: "org.omarchy.screensaver"
  property var screensaverWindows: []
  property int screensaverLayers: 0
  readonly property bool screensaverUp: root.screensaverWindows.length > 0 || root.screensaverLayers > 0

  function screensaverEvent(name, data) {
    if (name === "openwindow") {
      var parts = data.split(",")
      if (parts.length >= 3 && parts[2] === root.screensaverName)
        root.screensaverWindows = root.screensaverWindows.concat([parts[0]])
    } else if (name === "closewindow") {
      root.screensaverWindows = root.screensaverWindows.filter(function (address) { return address !== data })
    } else if (name === "openlayer" && data === root.screensaverName) {
      root.screensaverLayers++
    } else if (name === "closelayer" && data === root.screensaverName) {
      root.screensaverLayers = Math.max(0, root.screensaverLayers - 1)
    }
  }

  // A missed close event must not leave the companion hidden, so while it is
  // hidden it checks every 20 seconds that a screensaver is still there.
  Timer {
    interval: 20000
    repeat: true
    running: root.screensaverUp
    onTriggered: if (!screensaverCheck.running) screensaverCheck.running = true
  }

  Process {
    id: screensaverCheck
    command: ["/usr/bin/sh", "-c", "/usr/bin/hyprctl -j clients; echo; /usr/bin/hyprctl -j layers"]
    stdout: StdioCollector { id: screensaverCheckOut }
    onExited: function (code) {
      if (code !== 0) return
      if (String(screensaverCheckOut.text).indexOf(root.screensaverName) < 0) {
        root.screensaverWindows = []
        root.screensaverLayers = 0
      }
    }
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
    settings.recentBots = root.recentBots
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

  function stashThread(id) {
    var next = Object.assign({}, root.threads)
    next[id] = { history: root.history, asked: root.askedText, files: root.askedFiles, body: root.bubbleBody, links: root.noticeLinks, draft: root.promptDraft, pending: root.pendingFiles }
    root.threads = next
  }

  function loadThread(id) {
    var thread = root.threads[id] || {}
    root.history = thread.history || []
    root.askedText = thread.asked || ""
    root.askedFiles = thread.files || []
    root.pendingFiles = thread.pending || []
    root.bubbleBody = thread.body || ""
    root.noticeLinks = thread.links || []
    root.promptDraft = thread.draft || ""
    root.unreadBots = root.unreadBots.filter(function (other) { return other !== id })
  }

  // A reply or status for the bot `id`: shown if its conversation is on
  // screen, otherwise kept with it and marked unread.
  function deliver(id, body) {
    if (id === "" || id === root.threadBotId) {
      root.bubbleBody = body
      return true
    }
    var next = Object.assign({}, root.threads)
    var thread = Object.assign({}, next[id] || {})
    thread.body = body
    next[id] = thread
    root.threads = next
    if (root.unreadBots.indexOf(id) < 0) root.unreadBots = root.unreadBots.concat([id])
    root.hop()
    return false
  }

  function selectBot(id) {
    if (!root.findBot(id)) return "unknown bot"
    var changed = id !== root.threadBotId
    if (changed) {
      root.clearedThread = null
      root.stashThread(root.threadBotId)
    }
    root.chosenBotId = id
    if (changed) {
      root.loadThread(id)
      if (root.expression === "work" || root.expression === "idle") root.expression = root.askingHere ? "work" : "idle"
    }
    root.recentBots = [id].concat(root.recentBots.filter(function (other) { return other !== id })).slice(0, 6)
    if (changed && !root.bubbleOpen) root.showSwitchTag()
    root.switcherOpen = false
    root.rosterExpanded = false
    root.retargetAppearance(true)
    root.scheduleSave()
    root.hop()
    return root.botLabel()
  }

  // Picking a shape or colour swaps the avatar at once, as Grok Bot's
  // picker does; only a switch to another bot morphs.
  function selectShape(name) {
    if (!Shapes.known(name)) return "unknown shape"
    root.syncOn = false
    root.customShape = name
    root.retargetAppearance(false)
    root.scheduleSave()
    return "ok"
  }

  function selectColor(name) {
    if (!Palette.accepts(name)) return "unknown color"
    root.syncOn = false
    root.customColor = name
    root.retargetAppearance(false)
    root.scheduleSave()
    return "ok"
  }

  function setSync(value) {
    root.syncOn = value === true
    root.retargetAppearance(false)
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
    root.scheduleSave()
  }

  // Changing corners pops the mark out where it is and back in at the new
  // corner, rather than sliding it across whatever is on the desktop.
  function setAnchor(name) {
    if (name !== "br" && name !== "bl" && name !== "tr" && name !== "tl") return
    if (name === root.anchorName) return
    root.pendingAnchor = name
    cornerAnim.restart()
  }

  property string pendingAnchor: "br"
  property real cornerScale: 1
  property real cornerFade: 1

  SequentialAnimation {
    id: cornerAnim
    ParallelAnimation {
      NumberAnimation { target: root; property: "cornerScale"; to: 0.6; duration: root.ms(120); easing.type: Easing.InCubic }
      NumberAnimation { target: root; property: "cornerFade"; to: 0; duration: root.ms(120); easing.type: Easing.InCubic }
    }
    ScriptAction {
      script: {
        root.anchorName = root.pendingAnchor
        root.scheduleSave()
      }
    }
    ParallelAnimation {
      NumberAnimation { target: root; property: "cornerScale"; to: 1; duration: root.ms(260); easing.type: Easing.OutBack }
      NumberAnimation { target: root; property: "cornerFade"; to: 1; duration: root.ms(160); easing.type: Easing.OutCubic }
    }
  }

  function setIdle(value) {
    root.setMotion(value === true ? "playful" : "calm")
  }

  function plainLine(value, max) {
    return String(value || "").replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim().slice(0, max)
  }

  // A typed prompt keeps the line breaks Shift+Enter put in it; other
  // control characters become spaces.
  function plainPrompt(value, max) {
    var text = String(value || "").replace(/\r\n?/g, "\n")
    text = text.replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]+/g, " ")
    return text.replace(/[ ]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max)
  }

  function cleanText(value, max) {
    var text = String(value || "").replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
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
    root.dictating = false
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

  // Esc steps back one level: the menu, then the appearance page, then the
  // bubble.
  function stepBack() {
    if (root.menuOpen) root.menuOpen = false
    else if (root.settingsOpen) root.closeSettings()
    else root.closeBubble()
  }

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
      root.startMorph(next, root.colorTo)
      morphBackTimer.restart()
      return "ok"
    }
    return "unknown"
  }

  Timer {
    id: morphBackTimer
    interval: 700
    onTriggered: root.startMorph(root.destinationShape(), root.destinationColor())
  }

  // Moves the latest exchange into the history, so a new one can start.
  function archiveExchange() {
    root.clearedThread = null
    if (root.askedText === "" && root.bubbleBody === "" && root.noticeLinks.length === 0) return
    root.history = root.history.concat([{ asked: root.askedText, files: root.askedFiles, body: root.bubbleBody, links: root.noticeLinks }]).slice(-root.historyLimit)
    root.askedText = ""
    root.askedFiles = []
    root.bubbleBody = ""
    root.noticeLinks = []
  }

  function sayNotice(title, text, links) {
    var body = root.plainLine(text, 300)
    if (body === "") return "empty text"
    root.summon()
    root.archiveExchange()
    root.noticeLinks = links || []
    var who = root.plainLine(title, 80)
    root.bubbleBody = (who !== "" ? who + "\n" : "") + body
    root.flashExpression("alert", 1200)
    syllableAnim.restart()
    return "ok"
  }

  // Clearing a bot's conversation keeps it for a few seconds behind an
  // Undo chip. Switching bots, a new ask, or the timeout lets it go.
  property var clearedThread: null
  readonly property bool undoShown: root.clearedThread !== null && root.clearedThread.botId === root.threadBotId
  readonly property bool canClear: !root.askingHere && (root.history.length > 0 || root.askedText !== "" || root.bubbleBody !== "" || root.noticeLinks.length > 0)

  function clearConversation() {
    if (!root.canClear) return "nothing to clear"
    root.clearedThread = { botId: root.threadBotId, history: root.history, asked: root.askedText, files: root.askedFiles, body: root.bubbleBody, links: root.noticeLinks }
    root.history = []
    root.askedText = ""
    root.askedFiles = []
    root.bubbleBody = ""
    root.noticeLinks = []
    undoTimer.restart()
    root.openBubble()
    return "ok"
  }

  function undoClear() {
    var cleared = root.clearedThread
    if (!cleared || cleared.botId !== root.threadBotId) return
    root.history = cleared.history
    root.askedText = cleared.asked
    root.askedFiles = cleared.files
    root.bubbleBody = cleared.body
    root.noticeLinks = cleared.links
    root.clearedThread = null
    undoTimer.stop()
  }

  Timer {
    id: undoTimer
    interval: 8000
    onTriggered: root.clearedThread = null
  }

  function submitPrompt(value) {
    var prompt = root.plainPrompt(value, 4000)
    // Attachments can go on their own, as in a chat app.
    if (prompt === "" && root.pendingFiles.length > 0) prompt = "Have a look at this."
    if (prompt === "" || root.asking) return
    var route = Dictation.route(prompt, root.bots, root.defaultBotId)
    if (route.matched) {
      if (route.botId) root.selectBot(route.botId)
      prompt = root.plainPrompt(route.prompt, 4000)
      root.promptDraft = ""
      if (prompt === "") {
        root.openBubble()
        return
      }
    }
    root.promptDraft = ""
    root.launchAsk(prompt)
  }

  function dictateText(text) {
    root.dictating = false
    var raw = root.plainLine(text, 4000)
    if (raw === "") return "empty"
    var route = Dictation.route(raw, root.bots, root.defaultBotId)
    if (!route.matched) return "ignored"
    if (root.asking) return "busy"
    if (route.botId) root.selectBot(route.botId)
    root.promptDraft = ""
    root.openBubble()
    if (!route.prompt) return "opened"
    return root.launchAsk(route.prompt)
  }

  onDictatingChanged: if (root.dictating) dictationWatchdog.restart(); else dictationWatchdog.stop()

  Timer {
    id: dictationWatchdog
    interval: 120000
    onTriggered: root.dictating = false
  }

  function toggleDictation() {
    if (root.dictateHelper.indexOf("/bin/grokbot-dictate") < 0 || root.dictateHelper.indexOf("..") >= 0)
      return "error"
    Quickshell.execDetached(["/usr/bin/python3", root.dictateHelper])
    return "ok"
  }

  // Attaching runs grokbot-attach, which saves private copies and prints
  // their paths: "paste" takes the image on the clipboard, and "file" copies
  // files chosen in Omarchy's file chooser (omarchy-file-select, the desktop
  // portal) or dropped on the card. The card steps aside while the chooser
  // is open.
  property string attachMode: ""
  // Ctrl+V tries for an image quietly and falls back to pasting text.
  property bool attachQuiet: false
  property bool choosingFiles: false

  function isImageFile(path) {
    return /\.(png|jpe?g|webp|gif)$/i.test(String(path || ""))
  }

  // The name a file was attached under, without its unique prefix.
  function fileLabel(path) {
    return String(path || "").replace(/^.*\//, "").replace(/^\d{8}-\d{6}-[0-9a-f]{8}-/, "")
  }

  function attach(mode, paths) {
    if (attachProc.running || filePicker.running || root.askingHere) return "busy"
    var room = root.fileLimit - root.pendingFiles.length
    if (room <= 0) {
      root.attachNote = "Up to " + root.fileLimit + " files per ask."
      return "full"
    }
    root.attachNote = ""
    if (mode === "choose") {
      root.choosingFiles = true
      filePicker.running = true
      return "ok"
    }
    if (root.attachHelper.indexOf("/bin/grokbot-attach") < 0 || root.attachHelper.indexOf("..") >= 0) return "error"
    var args = ["/usr/bin/python3", "-I", root.attachHelper, mode]
    if (mode === "file") {
      var list = (Array.isArray(paths) ? paths : [paths]).map(String).filter(function (p) { return p !== "" })
      if (list.length === 0) return "empty"
      if (list.length > room) root.attachNote = "Up to " + root.fileLimit + " files per ask; the rest were left out."
      args = args.concat(list.slice(0, room))
    }
    root.attachMode = mode
    root.attachQuiet = mode === "paste" && paths === "quiet"
    root.attaching = true
    attachProc.command = args
    attachProc.running = true
    return "ok"
  }

  function removeFile(index) {
    root.pendingFiles = root.pendingFiles.filter(function (item, i) { return i !== index })
  }

  // Omarchy's own chooser; an Omarchy older than August 2026 has none.
  Process {
    id: filePicker
    command: ["/usr/bin/sh", "-c", "command -v omarchy-file-select >/dev/null 2>&1 || exit 127; exec omarchy-file-select --title 'Attach to your question' --multiple"]
    stdout: StdioCollector { id: pickedOut }
    onExited: function (code) {
      root.choosingFiles = false
      var paths = String(pickedOut.text || "").split("\n").map(function (line) { return line.trim() }).filter(function (line) { return line.indexOf("/") === 0 })
      if (code === 0 && paths.length > 0) root.attach("file", paths)
      else if (code === 127) root.attachNote = "Choosing files needs omarchy-file-select, from a newer Omarchy."
      else if (code !== 1) root.attachNote = "The file chooser didn't open."
    }
  }

  Process {
    id: attachProc
    clearEnvironment: true
    environment: ({
      XDG_RUNTIME_DIR: Quickshell.env("XDG_RUNTIME_DIR") || "",
      WAYLAND_DISPLAY: Quickshell.env("WAYLAND_DISPLAY") || "",
      HYPRLAND_INSTANCE_SIGNATURE: Quickshell.env("HYPRLAND_INSTANCE_SIGNATURE") || ""
    })
    stdout: StdioCollector { id: attachOut }
    stderr: StdioCollector { id: attachErr }
    onExited: function (code) {
      root.attaching = false
      var saved = String(attachOut.text || "").split("\n").map(function (line) { return line.trim() }).filter(function (line) {
        return /^\/run\/user\/\d+\/grokbot-desktop\/attachments\/[A-Za-z0-9._-]+$/.test(line)
      })
      if (saved.length > 0) root.pendingFiles = root.pendingFiles.concat(saved).slice(0, root.fileLimit)
      if (code === 4) {
        if (root.attachQuiet && bubblePanel) bubblePanel.pasteText()
        else root.attachNote = "There's no image on the clipboard."
      } else if (code !== 0 || String(attachErr.text || "").trim() !== "") {
        var reason = root.cleanText(attachErr.text, 200)
        if (reason !== "" || saved.length === 0) root.attachNote = reason || "That couldn't be attached."
      }
      if (!root.bubbleOpen) root.openBubble()
    }
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
    root.archiveExchange()
    root.askedText = String(prompt || "")
    root.askedFiles = root.pendingFiles
    root.pendingFiles = []
    root.attachNote = ""
    if (bubblePanel) bubblePanel.attachMenuOpen = false
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
      host: "",
      attachments: root.askedFiles
    })
    root.askBotId = root.threadBotId
    root.asking = true
    root.expression = "work"
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
    root.deliver(root.askBotId, "Stopped.")
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
      var ok = code === 0 && out !== ""
      var here = root.deliver(root.askBotId, ok ? out : (err !== "" ? err : "The ask didn't return a reply."))
      if (here && ok) {
        root.flashExpression("happy", 1600)
        syllableAnim.restart()
      } else {
        root.expression = "idle"
      }
      if (here) root.replyLanded()
    }
  }

  Timer {
    id: askTimeout
    interval: 180000
    onTriggered: {
      root.cancelAsk()
      if (root.deliver(root.askBotId, "That took too long, so I stopped waiting.")) root.replyLanded()
      root.expression = "idle"
    }
  }

  // Continuous motion runs on the frame clock, so it is as smooth as the
  // display refresh instead of stepping at a fixed timer rate.
  FrameAnimation {
    running: root.expression === "think" && !root.reduceMotion
    onTriggered: root.thinkAngle += frameTime * 4.5
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
    gazeFrames.running = true
    root.pointerNear = root.pointerIsNear()
    root.updateDodge()
  }

  function updateGazeTarget() {
    if (!root.cursorKnown || !win.screen) return
    var local = mark.mapToItem(win.contentItem, mark.width / 2, mark.height / 2)
    var dx = root.cursorX - (win.screen.x + local.x)
    var dy = root.cursorY - (win.screen.y + local.y)
    var dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 1) {
      root.gazeTargetX = 0
      root.gazeTargetY = 0
      return
    }
    // Most of the way there a short distance from the mark, and all the way
    // across the screen, so the eyes visibly follow the pointer anywhere.
    // Measured against the larger axis, so a pointer off a corner turns the
    // face fully that way on both axes, as Grok Bot's corner looks do.
    var reach = 1 - Math.exp(-dist / 220)
    var edge = Math.max(Math.abs(dx), Math.abs(dy))
    root.gazeTargetX = Math.max(-1, Math.min(1, dx / edge * reach))
    root.gazeTargetY = Math.max(-1, Math.min(1, dy / edge * reach))
  }

  FrameAnimation {
    id: gazeFrames
    onTriggered: {
      var k = 1 - Math.exp(-frameTime * 8)
      root.gazeX += (root.gazeTargetX - root.gazeX) * k
      root.gazeY += (root.gazeTargetY - root.gazeY) * k
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
    var point = stage.mapToItem(win.contentItem, 0, 0)
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

  // Pixels from the pointer to the mark's box; 0 inside it.
  function pointerGap() {
    var rect = root.stageRect()
    if (!rect || !root.cursorKnown) return 1e9
    var dx = Math.max(rect.x - root.cursorX, 0, root.cursorX - rect.x - rect.w)
    var dy = Math.max(rect.y - root.cursorY, 0, root.cursorY - rect.y - rect.h)
    return Math.sqrt(dx * dx + dy * dy)
  }

  // Dodge fades with distance: faint as the pointer arrives, and while it
  // rests on the mark the mark visibly fades back in over the dwell before
  // it takes clicks again.
  function updateDodge() {
    if (!root.dodgeOn || !root.present || root.dragging || root.surfacesOpen || !root.cursorKnown || !root.pointerIsNear()) {
      root.ghost = false
      root.claimed = false
      root.dwellSince = 0
      root.dodgeOpacity = 1
      return
    }
    var floor = 0.28
    if (root.pointerInside()) {
      if (root.dwellSince === 0) root.dwellSince = Date.now()
      var held = (Date.now() - root.dwellSince) / root.dwellMs
      if (held >= 1) root.claimed = true
      root.dodgeOpacity = root.claimed ? 1 : floor + (1 - floor) * Math.max(0, Math.min(1, held))
    } else {
      root.dwellSince = 0
      root.claimed = false
      root.dodgeOpacity = floor + (1 - floor) * Math.max(0, Math.min(1, root.pointerGap() / 36))
    }
    root.ghost = !root.claimed
  }

  readonly property int dwellMs: 380
  property real dodgeOpacity: 1

  FrameAnimation {
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
      if (root.askingHere) root.expression = "work"
      else if (root.sleepHold || Date.now() - root.lastMoveAt > 120000) root.expression = "sleep"
      else root.expression = "idle"
    }
  }

  // Calm holds still, as Grok Bot's avatars do at rest; coming from another
  // motion, the breath settles back first.
  NumberAnimation {
    id: settleBreath
    target: root
    property: "breathe"
    to: 1
    duration: root.ms(300)
    easing.type: Easing.OutCubic
  }
  onLiveMotionChanged: if (root.liveMotion === "calm") settleBreath.restart()

  // A new gap is drawn after every blink so the rhythm never settles.
  Timer {
    id: blinkTimer
    interval: 3200
    repeat: true
    running: root.present && root.expression === "idle" && !root.askingHere && root.liveMotion !== "calm"
    onTriggered: {
      root.blinkTwice = Math.random() < 0.35
      blinkAnim.restart()
      blinkTimer.interval = 2800 + Math.random() * 2400
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
    running: root.present && !root.dragging && root.liveMotion !== "calm" && root.expression !== "sleep"
    loops: Animation.Infinite
    NumberAnimation { target: root; property: "breathe"; to: 1.035; duration: 1700; easing.type: Easing.InOutSine }
    NumberAnimation { target: root; property: "breathe"; to: 0.985; duration: 1700; easing.type: Easing.InOutSine }
  }

  // Asleep, the breath slows and deepens.
  SequentialAnimation {
    running: root.present && !root.dragging && root.liveMotion !== "calm" && root.expression === "sleep"
    loops: Animation.Infinite
    NumberAnimation { target: root; property: "breathe"; to: 1.05; duration: 3000; easing.type: Easing.InOutSine }
    NumberAnimation { target: root; property: "breathe"; to: 0.975; duration: 3000; easing.type: Easing.InOutSine }
  }

  // Thinking, the eyes drift up and aside and the body sways slowly.
  property real thinkLook: root.expression === "think" ? 1 : 0
  Behavior on thinkLook { NumberAnimation { duration: root.ms(320); easing.type: Easing.InOutCubic } }

  // While an ask runs the mark looks around as Bob does in Grok Bot's chat
  // header while it is "Working…": this loop of looks and holds (gaze, then
  // milliseconds held) is measured from a 60fps recording of the app, as is
  // the way each look is reached, a fast-out curve over about 280ms, and the
  // one blink. The app's nod down past the chin is left out: it shows the
  // top of the head, which a flat outline cannot.
  readonly property var workLooks: [
    [0, -0.8, 230], [0, 1, 300], [0, -1, 300], [0, 0.4, 620], [1, -1, 920],
    [-0.85, 0.17, 510], [-0.54, -1, 350], [-0.1, -1, 400], [-0.55, -0.65, 350],
    [0.32, -0.3, 200], [1, -0.95, 300], [0, 0.4, 720], [-0.54, -0.13, 560, "blink"],
    [-0.6, -0.65, 230], [0.37, -0.42, 780], [0.1, -0.8, 280]
  ]
  readonly property int workMoveMs: 280
  property int workStep: 0
  property real workX: 0
  property real workY: 0
  property real workBlend: root.askingHere && !root.reduceMotion ? 1 : 0
  Behavior on workX { NumberAnimation { duration: root.ms(root.workMoveMs); easing.type: Easing.BezierSpline; easing.bezierCurve: [0.4, 0, 0.2, 1, 1, 1] } }
  Behavior on workY { NumberAnimation { duration: root.ms(root.workMoveMs); easing.type: Easing.BezierSpline; easing.bezierCurve: [0.4, 0, 0.2, 1, 1, 1] } }
  Behavior on workBlend { NumberAnimation { duration: root.ms(root.workMoveMs); easing.type: Easing.BezierSpline; easing.bezierCurve: [0.4, 0, 0.2, 1, 1, 1] } }

  Timer {
    id: workTimer
    running: root.present && root.askingHere && !root.reduceMotion
    repeat: true
    triggeredOnStart: true
    onRunningChanged: if (running) root.workStep = 0
    onTriggered: {
      var look = root.workLooks[root.workStep % root.workLooks.length]
      root.workX = look[0]
      root.workY = look[1]
      if (look[3] === "blink") blinkAnim.restart()
      interval = look[2] + root.workMoveMs
      root.workStep++
    }
  }

  // When the bob stops (another motion, or a drag) the mark settles back
  // to rest instead of freezing or snapping.
  NumberAnimation {
    id: settleIdle
    target: root
    property: "idleY"
    to: 0
    duration: root.ms(360)
    easing.type: Easing.OutCubic
  }

  SequentialAnimation {
    running: root.liveMotion === "playful" && root.present && !root.dragging
    loops: Animation.Infinite
    onRunningChanged: if (!running && root.idleY !== 0) settleIdle.restart()
    NumberAnimation { target: root; property: "idleY"; to: -7; duration: 1800; easing.type: Easing.InOutSine }
    NumberAnimation { target: root; property: "idleY"; to: 0; duration: 1800; easing.type: Easing.InOutSine }
  }

  NumberAnimation {
    running: root.liveMotion === "hyper" && root.present && !root.dragging
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
    running: root.liveMotion === "hyper" && root.present && !root.dragging && !root.askingHere
    onTriggered: root.hop()
  }

  SequentialAnimation {
    running: root.expression === "sleep" && !root.reduceMotion
    loops: Animation.Infinite
    NumberAnimation { target: root; property: "sleepDrift"; to: -8; duration: 1400; easing.type: Easing.InOutSine }
    NumberAnimation { target: root; property: "sleepDrift"; to: 0; duration: 1400; easing.type: Easing.InOutSine }
  }

  // Anticipate, launch stretched, fall, land squashed, then settle.
  SequentialAnimation {
    id: hopAnim
    NumberAnimation { target: root; property: "squash"; to: 0.88; duration: root.ms(70); easing.type: Easing.OutQuad }
    ParallelAnimation {
      NumberAnimation { target: root; property: "hopY"; to: -18; duration: root.ms(170); easing.type: Easing.OutQuad }
      NumberAnimation { target: root; property: "squash"; to: 1.07; duration: root.ms(120); easing.type: Easing.OutQuad }
    }
    ParallelAnimation {
      NumberAnimation { target: root; property: "hopY"; to: 0; duration: root.ms(170); easing.type: Easing.InQuad }
      NumberAnimation { target: root; property: "squash"; to: 1; duration: root.ms(170); easing.type: Easing.InOutQuad }
    }
    NumberAnimation { target: root; property: "squash"; to: 0.9; duration: root.ms(70); easing.type: Easing.OutQuad }
    NumberAnimation { target: root; property: "squash"; to: 1; duration: root.ms(240); easing.type: Easing.OutBack }
  }

  SequentialAnimation {
    id: syllableAnim
    NumberAnimation { target: root; property: "talkScale"; to: 1.08; duration: root.ms(90); easing.type: Easing.OutQuad }
    NumberAnimation { target: root; property: "talkScale"; to: 0.96; duration: root.ms(90); easing.type: Easing.InOutQuad }
    NumberAnimation { target: root; property: "talkScale"; to: 1; duration: root.ms(120); easing.type: Easing.OutQuad }
  }

  NumberAnimation {
    id: spinAnim
    target: root
    property: "spinAngle"
    from: 0
    to: 360
    duration: root.ms(700)
    easing.type: Easing.InOutCubic
  }

  SequentialAnimation {
    id: waveAnim
    NumberAnimation { target: root; property: "waveAngle"; to: -10; duration: root.ms(140) }
    NumberAnimation { target: root; property: "waveAngle"; to: 10; duration: root.ms(180) }
    NumberAnimation { target: root; property: "waveAngle"; to: -6; duration: root.ms(140) }
    NumberAnimation { target: root; property: "waveAngle"; to: 0; duration: root.ms(160) }
  }

  // A small give while the contour changes: shrink through the middle of
  // the morph, overshoot as it lands, settle.
  SequentialAnimation {
    id: morphPopAnim
    NumberAnimation { target: root; property: "morphPop"; to: 0.94; duration: root.ms(260); easing.type: Easing.InOutQuad }
    NumberAnimation { target: root; property: "morphPop"; to: 1.03; duration: root.ms(170); easing.type: Easing.OutQuad }
    NumberAnimation { target: root; property: "morphPop"; to: 1; duration: root.ms(200); easing.type: Easing.InOutQuad }
  }

  NumberAnimation {
    id: morphAnim
    target: root
    property: "morphProgress"
    from: 0
    to: 1
    duration: root.ms(560)
    easing.type: Easing.InOutCubic
  }

  // Drag follows the mark's own pointer events in window coordinates, so it
  // tracks at the input rate rather than the cursor helper's 30Hz polls.
  function beginDrag(px, py) {
    root.dragging = true
    root.ghost = false
    root.dragCursorX = px
    root.dragCursorY = py
    root.dragRight = root.posRight
    root.lastDragX = px
    root.lastDragAt = Date.now()
    root.dragBottom = root.posBottom
  }

  function dragMove(px, py) {
    if (!win.screen) return
    var maxRight = Math.max(0, root.screenW - root.stageW)
    var maxBottom = Math.max(0, root.screenH - root.stageH)
    var dx = px - root.dragCursorX
    var dy = py - root.dragCursorY
    var nextX = root.anchorFromRight ? root.dragRight - dx : root.dragRight + dx
    var nextY = root.anchorFromBottom ? root.dragBottom - dy : root.dragBottom + dy
    root.posRight = Math.max(0, Math.min(maxRight, Math.round(nextX)))
    root.posBottom = Math.max(0, Math.min(maxBottom, Math.round(nextY)))
    var now = Date.now()
    var dt = Math.max(4, now - root.lastDragAt)
    root.dragTiltTarget = Math.max(-8, Math.min(8, (px - root.lastDragX) / dt * 4))
    root.lastDragX = px
    root.lastDragAt = now
  }

  FrameAnimation {
    running: root.dragging || Math.abs(root.dragTilt) > 0.05 || Math.abs(root.dragTiltTarget) > 0.05
    onTriggered: {
      root.dragTiltTarget *= Math.exp(-frameTime * 6)
      root.dragTilt += (root.dragTiltTarget - root.dragTilt) * (1 - Math.exp(-frameTime * 14))
    }
  }

  SequentialAnimation {
    id: landAnim
    NumberAnimation { target: root; property: "squash"; to: 0.9; duration: root.ms(80); easing.type: Easing.OutQuad }
    NumberAnimation { target: root; property: "squash"; to: 1; duration: root.ms(260); easing.type: Easing.OutBack }
  }

  function endDrag() {
    landAnim.restart()
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
    function clear(): string { return root.clearConversation() }
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
      root.retargetAppearance(false)
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
    visible: root.present && root.targetScreen !== null && root.layerRuleTried && !root.screensaverUp
    // The window always covers the whole output and never changes size, so
    // the mark cannot move when the card opens or closes: a layer surface
    // that grows or shrinks is re-placed (and animated) by the compositor.
    // The mask below keeps the rest of the desktop clickable.
    anchors {
      top: true
      bottom: true
      left: true
      right: true
    }
    color: "transparent"
    exclusionMode: ExclusionMode.Ignore
    WlrLayershell.namespace: root.layerNamespace
    WlrLayershell.layer: WlrLayer.Top
    WlrLayershell.keyboardFocus: root.surfacesOpen ? WlrKeyboardFocus.OnDemand : WlrKeyboardFocus.None


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

    // The card and the menu grow out of the mark's side and fade, and leave
    // the same way. Each stays visible until its exit has finished.
    BubblePanel {
      id: bubblePanel
      app: root
      // Out of the way while the file chooser is open.
      readonly property bool shown: root.bubbleOpen && !root.choosingFiles
      growsUp: y < stage.y
      visible: opacity > 0.01
      opacity: shown ? 1 : 0
      scale: shown ? 1 : 0.94
      transformOrigin: {
        var above = y < stage.y
        var right = stage.x + stage.width / 2 > x + width / 2
        if (above) return right ? Item.BottomRight : Item.BottomLeft
        return right ? Item.TopRight : Item.TopLeft
      }
      Behavior on opacity { NumberAnimation { duration: root.ms(bubblePanel.shown ? 180 : 120); easing.type: bubblePanel.shown ? Easing.OutCubic : Easing.InCubic } }
      Behavior on scale { NumberAnimation { duration: root.ms(bubblePanel.shown ? 240 : 120); easing.type: bubblePanel.shown ? Easing.OutBack : Easing.InCubic; easing.overshoot: 1.2 } }
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
      visible: opacity > 0.01
      opacity: root.menuOpen ? 1 : 0
      scale: root.menuOpen ? 1 : 0.92
      transformOrigin: x < stage.x ? (root.anchorFromBottom ? Item.BottomRight : Item.TopRight) : (root.anchorFromBottom ? Item.BottomLeft : Item.TopLeft)
      Behavior on opacity { NumberAnimation { duration: root.ms(root.menuOpen ? 140 : 100); easing.type: Easing.OutCubic } }
      Behavior on scale { NumberAnimation { duration: root.ms(root.menuOpen ? 180 : 100); easing.type: Easing.OutCubic } }
      width: 188
      height: menuColumn.implicitHeight + 16
      radius: 12
      color: Theme.surface
      border.width: 1
      border.color: Theme.lifted
      // Opens on the side of the mark that faces the screen, level with the
      // mark's floor or top depending on the corner.
      x: {
        var side = root.anchorFromRight ? stage.x - width - 8 : stage.x + stage.width + 8
        if (side < 8) side = stage.x + stage.width + 8
        if (side + width > win.width - 8) side = stage.x - width - 8
        return Math.max(8, Math.min(side, win.width - width - 8))
      }
      y: {
        var level = root.anchorFromBottom ? stage.y + stage.height - height - 8 : stage.y + 8
        return Math.max(8, Math.min(level, win.height - height - 8))
      }
      Column {
        id: menuColumn
        x: 8
        y: 8
        width: parent.width - 16
        spacing: 4
        Repeater {
          model: (root.canClear ? [{ "label": "Clear conversation", "action": "clear" }] : []).concat([
            { "label": "Appearance & bots", "action": "settings" },
            { "label": "Hide companion", "action": "hide" }
          ])
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
              color: Theme.text
              font.pixelSize: 13
              font.family: root.fontFamily
              textFormat: Text.PlainText
            }
            HoverArea {
              id: menuArea
              label: modelData.label
              tint: false
              onActivated: {
                if (modelData.action === "clear") {
                  root.menuOpen = false
                  root.clearConversation()
                } else if (modelData.action === "settings") root.openSettings()
                else root.hideCompanion()
              }
            }
          }
        }
      }
    }

    Item {
      id: stage
      opacity: root.cornerFade

      // Lives on an item so it resolves the layer window it belongs to.
      Shortcut {
        sequence: "Escape"
        enabled: root.surfacesOpen
        onActivated: root.stepBack()
      }
      width: root.stageW
      height: root.stageH
      x: root.stageScreenX
      y: root.stageScreenY

      // Soft contact shadow. It shrinks and fades as the mark lifts off the
      // floor, so bobbing and hopping read as height rather than sliding.
      Shape {
        id: floorShadow
        readonly property real lift: Math.max(0, -(root.idleY + root.hopY + Math.sin(root.orbit * Math.PI / 180) * 5 * root.orbitAmp)) + root.dragLift * 14
        readonly property real flat: Math.max(10, root.shownSize * 0.12) / width
        property real rest: 0.34 * root.dodgeOpacity
        Behavior on rest { NumberAnimation { duration: root.ms(160) } }
        // Drawn as a circle and squashed, so the radial fade stays soft all
        // the way round the ellipse.
        width: root.shownSize * 0.62
        height: width
        anchors.horizontalCenter: parent.horizontalCenter
        y: parent.height - 6 - root.shownSize * 0.07 - height / 2
        scale: Math.max(0.55, 1 - lift / 70)
        opacity: rest * Math.max(0.3, 1 - lift / 45)
        transform: Scale { origin.x: floorShadow.width / 2; origin.y: floorShadow.height / 2; yScale: floorShadow.flat }
        ShapePath {
          strokeWidth: -1
          strokeColor: "transparent"
          fillGradient: RadialGradient {
            centerX: floorShadow.width / 2
            centerY: floorShadow.height / 2
            focalX: floorShadow.width / 2
            focalY: floorShadow.height / 2
            centerRadius: floorShadow.width / 2
            GradientStop { position: 0; color: "#FF000000" }
            GradientStop { position: 0.5; color: "#8C000000" }
            GradientStop { position: 1; color: "#00000000" }
          }
          PathAngleArc {
            centerX: floorShadow.width / 2
            centerY: floorShadow.height / 2
            radiusX: floorShadow.width / 2
            radiusY: floorShadow.height / 2
            startAngle: 0
            sweepAngle: 360
          }
        }
      }

      Rectangle {
        id: nameTag
        readonly property bool shown: root.switchTag !== ""
        property string label: ""
        width: nameText.implicitWidth + 20
        height: 24
        radius: 12
        color: Theme.surface
        border.width: 1
        border.color: Theme.lifted
        anchors.horizontalCenter: parent.horizontalCenter
        y: root.anchorFromBottom ? -height - 4 + (shown ? 0 : 6) : parent.height + 4 - (shown ? 0 : 6)
        opacity: shown ? 1 : 0
        visible: opacity > 0.01
        onShownChanged: if (shown) label = root.switchTag
        Behavior on opacity { NumberAnimation { duration: root.ms(160) } }
        Behavior on y { NumberAnimation { duration: root.ms(200); easing.type: Easing.OutCubic } }
        Text {
          id: nameText
          anchors.centerIn: parent
          text: nameTag.label
          color: Theme.text
          font.pixelSize: 12
          font.weight: Font.DemiBold
          font.family: root.fontFamily
          textFormat: Text.PlainText
        }
      }

      CompanionMark {
        id: mark
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 8
        width: root.shownSize
        height: root.shownSize
        shapeFrom: root.shapeFrom
        shapeTo: root.shapeTo
        morph: root.morphProgress
        face: root.shownFace
        eyeSet: root.shownEyes
        stemOverride: root.shownStem
        cutout: true
        darkSurface: root.desktopDark
        colorFromName: root.colorFrom
        colorName: root.colorTo
        mixFromColors: root.morphFromPoints !== null
        fillFrom: root.fillFrom
        eyeFrom: root.eyeFrom
        accent: root.accent
        lively: true
        gazeX: (root.gazeX * (1 - root.workBlend) + root.workX * root.workBlend) * (1 - root.thinkLook) + 0.55 * root.thinkLook
        gazeY: (root.gazeY * (1 - root.workBlend) + root.workY * root.workBlend) * (1 - root.thinkLook) - 0.75 * root.thinkLook
        eyeOpen: root.eyeOpen
        expression: root.expression === "celebrate" ? "happy" : root.expression
        thinkAngle: root.thinkAngle
        sleepDrift: root.sleepDrift
        imageSource: {
          var bot = root.currentBot()
          if (!root.syncOn || !bot || !bot.avatarImage) return ""
          return "file://" + bot.avatarImage
        }
        opacity: root.dodgeOpacity
        scale: root.breathe * root.talkScale * root.morphPop * root.hoverScale * root.cornerScale * (1 + 0.06 * root.dragLift)
        // Hovering lifts the mark a little; the eyes keep their size.
        attention: 1
        reduceMotion: root.reduceMotion
        transformOrigin: Item.Bottom
        transform: [
          Scale {
            origin.x: mark.width / 2
            origin.y: mark.height
            yScale: root.stretchY
            xScale: 1 + (1 - root.stretchY) * 0.8
          },
          Translate {
            x: Math.cos(root.orbit * Math.PI / 180) * 6 * root.orbitAmp
            y: root.idleY + root.hopY + Math.sin(root.orbit * Math.PI / 180) * 5 * root.orbitAmp - root.dragLift * 10
          },
          Rotation { origin.x: mark.width / 2; origin.y: mark.height; angle: root.spinAngle + root.waveAngle + Math.sin(root.thinkAngle * 0.5) * 3 * root.thinkLook + root.dragTilt }
        ]
        Behavior on opacity { NumberAnimation { duration: root.ms(90) } }

        Rectangle {
          id: replyDot
          width: Math.max(12, root.shownSize * 0.11)
          height: width
          radius: width / 2
          x: mark.width * 0.7
          y: mark.height * 0.14
          color: Theme.text
          border.width: 2
          border.color: Theme.surface
          scale: root.replyUnread ? 1 : 0
          visible: scale > 0.01
          Behavior on scale { NumberAnimation { duration: root.ms(260); easing.type: Easing.OutBack } }
        }
      }

      MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        hoverEnabled: true
        preventStealing: true
        cursorShape: root.dragging ? Qt.ClosedHandCursor : Qt.PointingHandCursor
        property point pressAt: Qt.point(0, 0)
        property bool moved: false
        // Output coordinates, which stay put while the mark moves under
        // the pointer.
        function windowPoint(mouse) {
          return mapToItem(win.contentItem, mouse.x, mouse.y)
        }
        onPressed: function (mouse) {
          pressAt = windowPoint(mouse)
          moved = false
          if (mouse.button === Qt.RightButton) {
            root.menuOpen = !root.menuOpen
            mouse.accepted = true
            return
          }
          if (mouse.modifiers & Qt.MetaModifier) root.beginDrag(pressAt.x, pressAt.y)
        }
        onPositionChanged: function (mouse) {
          if (!(mouse.buttons & Qt.LeftButton)) return
          var p = windowPoint(mouse)
          var dx = p.x - pressAt.x
          var dy = p.y - pressAt.y
          if (!root.dragging && (Math.abs(dx) > 6 || Math.abs(dy) > 6 || (mouse.modifiers & Qt.MetaModifier)))
            root.beginDrag(pressAt.x, pressAt.y)
          if (root.dragging) root.dragMove(p.x, p.y)
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
          root.hovering = containsMouse
          if (containsMouse) {
            root.claimed = true
            root.ghost = false
            root.dodgeOpacity = 1
          }
        }
      }
    }
  }
}
