import QtQuick
import QtQuick.Controls
import "qml/theme.js" as Theme

Item {
  id: panel
  property var app: null
  property bool avatarJsonExpanded: false
  readonly property string section: app && app.settingsSection !== "home" ? app.settingsSection : "appearance"
  readonly property bool compact: width < 580
  readonly property real sidebarWidth: compact ? width : 176
  implicitHeight: 620

  Rectangle {
    id: sidebar
    width: panel.sidebarWidth
    height: panel.compact ? 132 : parent.height
    radius: 12
    color: Theme.field
    Column {
      x: 12; y: 18
      width: parent.width - 24
      spacing: 6
      Text {
        width: parent.width
        text: "Settings"
        color: Theme.text
        font.family: app.fontFamily; font.pixelSize: 19; font.weight: Font.DemiBold
        textFormat: Text.PlainText
      }
      Text {
        width: parent.width
        text: "Agent Desktop"
        color: Theme.textMuted
        font.family: app.fontFamily; font.pixelSize: 11
        textFormat: Text.PlainText; wrapMode: Text.Wrap
      }
    }
    Flow {
      x: 12; y: 82
      width: parent.width - 24
      spacing: 6
      Repeater {
        model: [{id:"appearance", name:"Appearance"}, {id:"behaviour", name:"Behaviour"}, {id:"providers", name:"Providers"}]
        delegate: Rectangle {
          required property var modelData
          width: panel.compact ? (parent.width - 12) / 3 : parent.width; height: 38; radius: 7
          readonly property bool selected: panel.section === modelData.id || (panel.section === "avatar" && modelData.id === "appearance")
          color: selected ? Theme.selected : "transparent"
          border.width: selected ? 1 : 0
          border.color: Theme.edgeStrong
          Rectangle { x: 0; y: 10; width: 3; height: 18; radius: 1; color: app.accent; visible: parent.selected }
          Text {
            x: 10; anchors.verticalCenter: parent.verticalCenter
            text: modelData.name
            color: Theme.text
            font.family: app.fontFamily; font.pixelSize: 12
            font.weight: parent.selected ? Font.DemiBold : Font.Normal
            textFormat: Text.PlainText
          }
          HoverArea { label: modelData.name; onActivated: app.settingsSection = modelData.id }
        }
      }
    }
    Column {
      x: 12; width: parent.width - 24
      visible: !panel.compact
      anchors.bottom: parent.bottom; anchors.bottomMargin: 16
      spacing: 5
      Text { text: "SELECTED AGENT"; color: Theme.textFaint; font.family: app.fontFamily; font.pixelSize: 9; textFormat: Text.PlainText }
      Text { width: parent.width; text: app.botLabel(); color: Theme.textMuted; font.family: app.fontFamily; font.pixelSize: 11; textFormat: Text.PlainText; wrapMode: Text.Wrap }
    }
  }

  Item {
    id: page
    x: panel.compact ? 0 : sidebar.width + 20
    y: panel.compact ? sidebar.height + 16 : 0
    width: parent.width - x
    height: parent.height - y
    Item {
      id: header
      width: parent.width; height: 64
      Column {
        width: parent.width - 40
        spacing: 6
        Text {
          text: panel.section === "appearance" ? "Appearance" : panel.section === "providers" ? "Providers" : panel.section === "behaviour" ? "Behaviour" : "Custom avatar"
          font.family: app.fontFamily; font.pixelSize: 20; font.weight: Font.DemiBold
          textFormat: Text.PlainText; color: Theme.text
        }
        Text {
          width: parent.width
          text: panel.section === "appearance" ? "Personalise your desktop companion" : panel.section === "providers" ? "Choose the agent behind your companion" : panel.section === "behaviour" ? "Motion, size and desktop placement" : "Optional · Open Bot Avatar"
          font.family: app.fontFamily; font.pixelSize: 11
          textFormat: Text.PlainText; color: Theme.textMuted; wrapMode: Text.Wrap
        }
      }
      Rectangle {
        anchors.right: parent.right
        width: 30; height: 30; radius: 8
        color: Theme.raised
        Text { anchors.centerIn: parent; text: "×"; color: Theme.textMuted; font.pixelSize: 20; textFormat: Text.PlainText }
        HoverArea { label: "Close settings"; onActivated: app.cardPage = "chat" }
      }
    }
    SettingsPanel {
      id: appearance
      anchors.top: header.bottom
      anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom
      app: panel.app
      embedded: true
      visible: panel.section === "appearance" || panel.section === "behaviour"
    }
    Flickable {
      id: settingsFlick
      visible: panel.section === "providers" || panel.section === "avatar"
      anchors.top: header.bottom
      anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom
      contentHeight: content.implicitHeight
      clip: true
      boundsBehavior: Flickable.StopAtBounds
      onVisibleChanged: contentY = 0
      ScrollBar.vertical: ScrollBar { policy: settingsFlick.contentHeight > settingsFlick.height ? ScrollBar.AsNeeded : ScrollBar.AlwaysOff }
      Column {
        id: content
        width: parent.width
        spacing: 16
      SettingsGroup {
        width: parent.width
        visible: panel.section === "providers"
        title: "Agent provider"
        fontFamily: app.fontFamily
        Row {
          width: parent.width; spacing: 8
          Repeater {
            model: [{id:"grokbot", name:"GrokBot"}, {id:"hermes", name:"Hermes"}, {id:"openbot", name:"OpenBot"}]
            delegate: SettingsAction {
              required property var modelData
              width: (parent.width - 16) / 3
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
          text: app.settingsProvider === "hermes" ? "Experimental: live Hermes validation is pending. Choose a profile and keep Bot Chat open in Hermes to receive replies." : app.settingsProvider === "openbot" ? "Experimental: OpenBot Local scripts adapter. Only agents with Local scripts enabled appear. Configure the hop in agent-desktop.json, keep OpenBot running, then refresh." : "Choose a bot from your Grok Bot app. Your existing reply connection is kept."
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
          text: app.discoveringProviders ? "Looking for agents…" : (app.settingsProvider === "hermes" ? "No profiles found. Check your Hermes connection below, then refresh." : app.settingsProvider === "openbot" ? "No agents found. Turn on Local scripts for an agent in OpenBot, then refresh." : "No bots found. Open Grok Bot, let its bot list load, then sync.")
          font.family: app.fontFamily; font.pixelSize: 12
          textFormat: Text.PlainText; color: Theme.textMuted
          wrapMode: Text.Wrap
        }
        SettingsAction {
          width: parent.width; fontFamily: app.fontFamily; chevron: false
          title: app.settingsProvider === "grokbot" ? (app.syncingRoster ? "Syncing…" : "Sync bots from Grok Bot") : (app.discoveringProviders ? "Refreshing…" : app.settingsProvider === "openbot" ? "Refresh OpenBot agents" : "Refresh Hermes profiles")
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
      SettingsGroup {
        width: parent.width
        visible: panel.section === "avatar"
        title: "Custom character"
        fontFamily: app.fontFamily
        SettingsAction { width: parent.width; fontFamily: app.fontFamily; title: "Back to appearance"; onActivated: app.settingsSection = "appearance" }
        AvatarBuilder { width: parent.width; app: panel.app }
        SettingsAction {
          width: parent.width; fontFamily: app.fontFamily
          title: "Import / export JSON"
          detail: "Use an existing design or save your character"
          onActivated: panel.avatarJsonExpanded = !panel.avatarJsonExpanded
        }
        TextArea {
          id: avatarJson
          visible: panel.avatarJsonExpanded
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
          visible: panel.avatarJsonExpanded
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
}
