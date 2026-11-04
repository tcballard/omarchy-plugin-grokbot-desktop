import QtQuick
import "qml/theme.js" as Theme

Column {
  id: group
  property string title: ""
  property string fontFamily: ""
  default property alias content: contents.data
  spacing: 8
  Text {
    visible: group.title !== ""
    text: group.title
    font.family: group.fontFamily
    font.pixelSize: 12
    font.weight: Font.DemiBold
    color: Theme.textMuted
    textFormat: Text.PlainText
  }
  Rectangle {
    width: parent.width
    height: contents.implicitHeight + 24
    radius: 12
    color: Theme.field
    border.width: 1
    border.color: Theme.edgeSoft
    Column {
      id: contents
      x: 12; y: 12
      width: parent.width - 24
      spacing: 12
    }
  }
}
