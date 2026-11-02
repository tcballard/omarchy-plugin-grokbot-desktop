import QtQuick
import QtQuick.Controls
import "qml/theme.js" as Theme

Item {
  id: panel
  property var app: null
  readonly property string section: app ? app.settingsSection : "home"
  implicitHeight: section === "appearance" ? appearance.implicitHeight : 50 + content.implicitHeight

  SettingsPanel {
    id: appearance
    anchors.fill: parent
    app: panel.app
    visible: panel.section === "appearance"
  }

  Item {
    id: header
    visible: panel.section !== "appearance"
    width: parent.width
    height: 36
    Rectangle {
      width: 32; height: 32; radius: 16
      anchors.verticalCenter: parent.verticalCenter
      color: Theme.raised
      border.width: 1; border.color: Theme.edge
      Text {
        anchors.centerIn: parent
        text: "‹"
        font.family: app.fontFamily; font.pixelSize: 24
        textFormat: Text.PlainText; color: Theme.text
      }
      HoverArea { label: panel.section === "home" ? "Back to chat" : "Back"; onActivated: app.closeSettings() }
    }
    Text {
      x: 42
      anchors.verticalCenter: parent.verticalCenter
      text: panel.section === "home" ? "Settings" : panel.section === "providers" ? "Providers" : "Custom avatar"
      font.family: app.fontFamily; font.pixelSize: 15; font.weight: Font.DemiBold
      textFormat: Text.PlainText; color: Theme.text
    }
  }

  Flickable {
    id: settingsFlick
    visible: panel.section !== "appearance"
    anchors.top: header.bottom; anchors.topMargin: 14
    anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom
    contentHeight: content.implicitHeight
    clip: true
    boundsBehavior: Flickable.StopAtBounds
    ScrollBar.vertical: ScrollBar { policy: settingsFlick.contentHeight > settingsFlick.height ? ScrollBar.AsNeeded : ScrollBar.AlwaysOff }
    Column {
      id: content
      width: parent.width
      spacing: 12
      Column {
        width: parent.width
        visible: panel.section === "home"
        spacing: 10
        SettingsAction {
          width: parent.width; fontFamily: app.fontFamily
          title: "Providers"
          detail: "Choose GrokBot or Hermes and manage your agents"
          onActivated: app.settingsSection = "providers"
        }
        SettingsAction {
          width: parent.width; fontFamily: app.fontFamily
          title: "Appearance"
          detail: "Shape, colour, motion and placement"
          onActivated: app.settingsSection = "appearance"
        }
        Text {
          width: parent.width
          text: "Using " + app.botLabel() + " · " + ((app.currentBot() || {}).provider === "hermes" ? "Hermes" : "GrokBot")
          font.family: app.fontFamily; font.pixelSize: 11
          textFormat: Text.PlainText; color: Theme.textMuted
          wrapMode: Text.Wrap
        }
      }
      Column {
        width: parent.width
        visible: panel.section === "providers"
        spacing: 10
        Row {
          width: parent.width; spacing: 8
          Repeater {
            model: [{id:"grokbot", name:"GrokBot"}, {id:"hermes", name:"Hermes"}]
            delegate: SettingsAction {
              required property var modelData
              width: (parent.width - 8) / 2
              fontFamily: app.fontFamily
              title: modelData.name
              selected: app.settingsProvider === modelData.id
              chevron: false
              onActivated: app.chooseProvider(modelData.id)
            }
          }
        }
        Text {
          width: parent.width
          text: app.settingsProvider === "hermes" ? "Choose a Hermes profile. Keep Bot Chat open in Hermes to receive replies." : "Choose a bot from your Grok Bot app. Your existing reply connection is kept."
          font.family: app.fontFamily; font.pixelSize: 12
          textFormat: Text.PlainText; color: Theme.textMuted
          wrapMode: Text.Wrap
        }
        Repeater {
          model: app.bots.filter(function(bot) { return bot.provider === app.settingsProvider })
          delegate: SettingsAction {
            required property var modelData
            width: parent.width; fontFamily: app.fontFamily
            title: modelData.shortName || modelData.name
            selected: app.chosenBotId === modelData.id
            chevron: false
            onActivated: app.selectBot(modelData.id)
          }
        }
        Text {
          width: parent.width
          visible: !app.bots.some(function(bot) { return bot.provider === app.settingsProvider })
          text: app.discoveringProviders ? "Looking for profiles…" : (app.settingsProvider === "hermes" ? "No profiles found. Check your Hermes connection below, then refresh." : "No bots found. Open Grok Bot, let its bot list load, then sync.")
          font.family: app.fontFamily; font.pixelSize: 12
          textFormat: Text.PlainText; color: Theme.textMuted
          wrapMode: Text.Wrap
        }
        SettingsAction {
          width: parent.width; fontFamily: app.fontFamily; chevron: false
          title: app.settingsProvider === "grokbot" ? (app.syncingRoster ? "Syncing…" : "Sync bots from Grok Bot") : (app.discoveringProviders ? "Refreshing…" : "Refresh Hermes profiles")
          enabled: !app.syncingRoster && !app.discoveringProviders
          onActivated: app.settingsProvider === "grokbot" ? app.syncRoster() : app.refreshProviders()
        }
        Text {
          width: parent.width
          text: app.settingsProvider === "grokbot" ? app.syncStatus : app.providerStatus
          visible: text !== ""
          font.family: app.fontFamily; font.pixelSize: 11
          textFormat: Text.PlainText; color: Theme.textMuted
          wrapMode: Text.Wrap
        }
        HermesSettings {
          width: parent.width
          visible: app.settingsProvider === "hermes"
          app: panel.app
        }
      }
      Column {
        width: parent.width
        visible: panel.section === "avatar"
        spacing: 10
        Text {
          width: parent.width
          text: "An optional character for " + app.botLabel() + ". Your usual shapes and colours are always available in Appearance."
          font.family: app.fontFamily; font.pixelSize: 12
          textFormat: Text.PlainText; color: Theme.textMuted
          wrapMode: Text.Wrap
        }
        TextArea {
          id: avatarJson
          width: parent.width; height: 120
          placeholderText: "Paste Open Bot Avatar JSON…"
          placeholderTextColor: Theme.textFaint
          color: Theme.text
          font.family: app.fontFamily; font.pixelSize: 12
          textFormat: TextEdit.PlainText; wrapMode: TextEdit.Wrap
          selectByMouse: true
          padding: 12
          background: Rectangle { color: Theme.field; radius: 10; border.width: 1; border.color: Theme.edgeField }
          onTextChanged: if (text.length > 16384) text = text.slice(0, 16384)
        }
        Row {
          width: parent.width; spacing: 8
          SettingsAction { width: (parent.width - 16) / 3; fontFamily: app.fontFamily; title: "Import"; chevron: false; onActivated: app.importAvatar(avatarJson.text) }
          SettingsAction { width: (parent.width - 16) / 3; fontFamily: app.fontFamily; title: "Export"; chevron: false; enabled: !!app.avatarFor(app.chosenBotId); onActivated: { avatarJson.text = app.exportAvatar(); avatarJson.selectAll() } }
          SettingsAction { width: (parent.width - 16) / 3; fontFamily: app.fontFamily; title: "Remove"; chevron: false; enabled: !!app.avatarFor(app.chosenBotId); onActivated: app.removeAvatar() }
        }
        Text {
          width: parent.width
          text: app.avatarStatus
          visible: text !== ""
          font.family: app.fontFamily; font.pixelSize: 11
          textFormat: Text.PlainText; color: Theme.textMuted
          wrapMode: Text.Wrap
        }
      }
    }
  }
}
