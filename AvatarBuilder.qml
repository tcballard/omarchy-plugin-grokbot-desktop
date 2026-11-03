import QtQuick
import QtQuick.Controls
import "qml/theme.js" as Theme

Column {
  id: builder
  property var app: null
  spacing: 10
  onVisibleChanged: if (visible && app) app.loadAvatarBuilder()
  Component.onCompleted: if (visible && app) app.loadAvatarBuilder()
  Text {
    width: parent.width
    text: "Describe your avatar"
    color: Theme.text
    font.family: app.fontFamily; font.pixelSize: 14; font.weight: Font.DemiBold
    textFormat: Text.PlainText
  }
  Text {
    width: parent.width
    text: app.avatarBuilderAgent ? "Uses your Omarchy default: " + app.avatarBuilderAgent + " · configured model and login" + (app.avatarBuilderAgent === "codex" ? " · low reasoning" : "") : "Uses the default agent selected in Omarchy"
    color: Theme.textMuted
    font.family: app.fontFamily; font.pixelSize: 11
    textFormat: Text.PlainText; wrapMode: Text.Wrap
  }
  TextArea {
    width: parent.width; height: 82
    text: app.avatarBuilderDescription
    placeholderText: "A chunky rocket with two eyes on its window…"
    placeholderTextColor: Theme.textFaint
    color: Theme.text
    font.family: app.fontFamily; font.pixelSize: 12
    textFormat: TextEdit.PlainText; wrapMode: TextEdit.Wrap
    selectByMouse: true; padding: 10
    enabled: !app.avatarGenerating
    background: Rectangle { color: Theme.surface; radius: 8; border.width: 1; border.color: Theme.edgeField }
    onTextChanged: {
      if (text.length > 2000) text = text.slice(0, 2000)
      if (app.avatarBuilderDescription !== text) app.avatarBuilderDescription = text
    }
  }
  Row {
    width: parent.width; spacing: 8
    SettingsAction {
      width: parent.width - (app.avatarGenerating ? 98 : 0)
      fontFamily: app.fontFamily; chevron: false
      title: app.avatarGenerating ? "Generating…" : app.avatarDraft ? "Generate again" : "Generate avatar"
      enabled: app.avatarBuilderSupported && !app.avatarGenerating && app.avatarBuilderDescription.trim() !== ""
      onActivated: app.generateAvatar()
    }
    SettingsAction {
      width: 90; visible: app.avatarGenerating
      fontFamily: app.fontFamily; title: "Cancel"; chevron: false
      onActivated: app.cancelAvatarGeneration()
    }
  }
  Rectangle {
    width: parent.width; height: 150
    visible: !!app.avatarDraft
    radius: 10; color: Theme.surface
    OpenBotAvatar {
      anchors.centerIn: parent
      width: 138; height: 138
      definition: app.avatarDraft
      bodyColor: app.shownColor === "omarchy" ? app.accent : app.paletteFill(app.shownColor)
      inkColor: Theme.surface
      reducedMotion: app.reduceMotion
    }
  }
  SettingsAction {
    width: parent.width
    visible: !!app.avatarDraft
    enabled: !app.avatarGenerating && app.avatarDraftBotId === app.chosenBotId
    fontFamily: app.fontFamily; chevron: false
    title: app.avatarDraftBotId === app.chosenBotId ? "Apply to " + app.botLabel() : "Switch back to the original bot to apply"
    onActivated: app.applyAvatarDraft()
  }
  Text {
    width: parent.width
    text: app.avatarGenerating ? "Waiting for " + app.avatarBuilderAgent + " · " + app.avatarGenerationSeconds + "s" + (app.avatarGenerationSeconds >= 30 ? ". Still waiting for a complete response; you can cancel." : "") : app.avatarBuilderStatus
    visible: text !== ""
    color: Theme.textMuted
    font.family: app.fontFamily; font.pixelSize: 11
    textFormat: Text.PlainText; wrapMode: Text.Wrap
  }
}
