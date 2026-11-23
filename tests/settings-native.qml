import QtQuick
import ".."
import "../qml/shapes.js" as Shapes
import "../qml/palette.js" as Palette

Rectangle {
  id: mock
  width: 780
  height: Math.min(760, panel.implicitHeight + 32)
  color: "#141416"
  property string settingsSection: "appearance"
  property string cardPage: "appearance"
  property string settingsProvider: "grokbot"
  property string fontFamily: "Sans Serif"
  property var bots: [{id:"bob",name:"Bob the Bot",provider:"grokbot"}, {id:"hermes:default",name:"Personal assistant",provider:"hermes"}, {id:"openbot:grok",name:"Grok Bridge",provider:"openbot"}]
  property string chosenBotId: "bob"
  property string shownColor: "orange"
  property string canonicalShape: "teardrop"
  property color accent: "#83a5ff"
  property var shapeNames: Shapes.NAMES
  property var colorNames: Palette.NAMES
  property bool syncOn: true
  property bool reduceMotion: true
  property bool dodgeOn: false
  property string anchorName: "br"
  property string motionName: "calm"
  property string sizeName: "medium"
  property string workspaceMode: "all"
  property int workspaceNumber: 1
  property bool discoveringProviders: false
  property bool syncingRoster: false
  property string syncStatus: ""
  property string providerStatus: ""
  property string avatarStatus: ""
  property bool providerConfigBusy: false
  property string providerConfigStatus: ""
  property var hermesSettings: ({root:"/home/tom/.hermes",agentDir:"/home/tom/.hermes/hermes-agent",python:"/home/tom/.hermes/hermes-agent/.venv/bin/python"})
  property string avatarBuilderDescription: "A rocket"
  property string avatarBuilderAgent: "codex"
  property bool avatarBuilderSupported: true
  property string avatarBuilderStatus: ""
  property var avatarDraft: null
  property var sampleAvatar: null
  property string avatarDraftBotId: ""
  property bool avatarGenerating: false
  property int avatarGenerationSeconds: 0
  property bool draftApplied: false
  function loadAvatarBuilder() {}
  function generateAvatar() { avatarDraft = sampleAvatar; avatarDraftBotId = chosenBotId }
  function cancelAvatarGeneration() { avatarGenerating = false }
  function applyAvatarDraft() { draftApplied = true }
  function currentBot() { return bots.find(function(bot) {return bot.id === chosenBotId}) }
  function botLabel() { return currentBot().name }
  function avatarFor(id) { return null }
  function ringColor(color) { return color }
  function paletteFill(name) { return Palette.fillFor(name, true) }
  function closeSettings() { settingsSection = settingsSection === "avatar" ? "appearance" : "home" }
  function chooseProvider(id) { settingsProvider = id; chosenBotId = bots.find(function(bot) {return bot.provider === id}).id }
  function selectBot(id) { chosenBotId = id }
  function selectShape(name) { canonicalShape = name }
  function selectColor(name) { shownColor = name }
  function setMotion(value) { motionName = value }
  function setSync(value) { syncOn = value }
  function setWorkspaceMode(mode) { workspaceMode = mode === "selected" ? "selected" : "all" }
  function setWorkspace(number) { workspaceNumber = number }
  function loadHermesSettings() {}
  PreferencesPanel { id: panel; x:16; y:16; width:mock.width-32; height:mock.height-32; app:mock }
}
