import QtQuick
import QtQuick.Controls
import "qml/theme.js" as Theme

Column {
  id: field
  property string label: ""
  property string fontFamily: ""
  property alias text: input.text
  spacing: 6
  Text {
    text: field.label
    font.family: field.fontFamily; font.pixelSize: 11
    textFormat: Text.PlainText; color: Theme.textMuted
  }
  SafeTextArea {
    singleLine: true
    wrapMode: TextEdit.NoWrap
    id: input
    width: parent.width; height: 36
    font.family: field.fontFamily; font.pixelSize: 12
    color: Theme.text
    selectionColor: Theme.edgeStrong
    selectByMouse: true
    leftPadding: 10; rightPadding: 10
    background: Rectangle { color: Theme.field; radius: 8; border.width: 1; border.color: input.activeFocus ? Theme.edgeStrong : Theme.edgeField }
  }
}
