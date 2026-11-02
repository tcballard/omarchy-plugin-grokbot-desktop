import QtQuick
import "qml/theme.js" as Theme

Rectangle {
  id: control
  property string title: ""
  property string detail: ""
  property string fontFamily: ""
  property bool selected: false
  property bool chevron: true
  signal activated()
  implicitHeight: detail === "" ? 38 : 60
  height: implicitHeight
  radius: 10
  color: selected ? Theme.selected : Theme.raised
  border.width: 1
  border.color: selected ? Theme.edgeStrong : Theme.edge
  opacity: enabled ? 1 : 0.5
  Column {
    anchors.left: parent.left
    anchors.right: trailing.left
    anchors.margins: 12
    anchors.verticalCenter: parent.verticalCenter
    spacing: 4
    Text {
      width: parent.width
      text: control.title
      textFormat: Text.PlainText
      font.family: control.fontFamily
      font.pixelSize: 13
      font.weight: Font.DemiBold
      color: Theme.text
      elide: Text.ElideRight
    }
    Text {
      width: parent.width
      visible: text !== ""
      text: control.detail
      textFormat: Text.PlainText
      font.family: control.fontFamily
      font.pixelSize: 11
      color: Theme.textMuted
      elide: Text.ElideRight
    }
  }
  Text {
    id: trailing
    anchors.right: parent.right
    anchors.rightMargin: 12
    anchors.verticalCenter: parent.verticalCenter
    text: control.selected ? "✓" : control.chevron ? "›" : ""
    textFormat: Text.PlainText
    font.family: control.fontFamily
    font.pixelSize: 18
    color: control.selected ? Theme.ok : Theme.textMuted
  }
  HoverArea { label: control.title; onActivated: control.activated() }
}
