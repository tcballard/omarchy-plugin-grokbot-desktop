import QtQuick
import "qml/theme.js" as Theme

Column {
  id: connection
  property var app: null
  property bool expanded: false
  spacing: 10
  SettingsAction {
    width: parent.width; fontFamily: app.fontFamily
    title: "Connection settings"
    detail: "Use your existing Hermes installation"
    onActivated: {
      connection.expanded = !connection.expanded
      if (connection.expanded) app.loadHermesSettings()
    }
  }
  Column {
    width: parent.width
    visible: connection.expanded
    spacing: 10
    enabled: !app.providerConfigBusy
    SettingsField { id: rootPath; width: parent.width; fontFamily: app.fontFamily; label: "Hermes home"; text: app.hermesSettings.root || "" }
    SettingsField { id: agentPath; width: parent.width; fontFamily: app.fontFamily; label: "Hermes source folder"; text: app.hermesSettings.agentDir || "" }
    SettingsField { id: pythonPath; width: parent.width; fontFamily: app.fontFamily; label: "Hermes Python executable"; text: app.hermesSettings.python || "" }
    SettingsAction {
      width: parent.width; fontFamily: app.fontFamily
      title: "Save and refresh"
      chevron: false
      onActivated: app.saveHermesSettings(rootPath.text, agentPath.text, pythonPath.text)
    }
    Text {
      width: parent.width
      text: app.providerConfigStatus || "This uses your existing Hermes login. No credentials are copied."
      font.family: app.fontFamily; font.pixelSize: 11
      textFormat: Text.PlainText; color: Theme.textMuted
      wrapMode: Text.Wrap
    }
  }
}
