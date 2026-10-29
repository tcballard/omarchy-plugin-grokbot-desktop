import QtQuick
import "qml/theme.js" as Theme

// A click target with the feedback every control in the companion shares:
// a pointing-hand cursor, a light tint on hover and press, Tab focus with a
// visible ring, Enter or Space to activate, and an accessible name. Use
// onActivated rather than onClicked so keyboard and pointer act alike.
MouseArea {
  id: area
  property string label: ""
  property bool tint: true
  // Matches the rounded parent it sits in, when the parent has a radius.
  property var host: parent
  property real tintRadius: host && host.radius !== undefined ? Number(host.radius) : 0
  signal activated()

  anchors.fill: parent
  hoverEnabled: true
  cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
  activeFocusOnTab: enabled
  onClicked: area.activated()
  Keys.onReturnPressed: area.activated()
  Keys.onEnterPressed: area.activated()
  Keys.onSpacePressed: area.activated()

  Accessible.role: Accessible.Button
  Accessible.name: area.label
  Accessible.onPressAction: area.activated()

  Rectangle {
    anchors.fill: parent
    radius: area.tintRadius
    color: "#FFFFFF"
    opacity: !area.tint || !area.enabled ? 0 : (area.pressed ? 0.1 : (area.containsMouse ? 0.06 : 0))
  }

  Rectangle {
    anchors.fill: parent
    anchors.margins: -3
    radius: area.tintRadius + 3
    color: "transparent"
    border.width: 2
    border.color: Theme.text
    visible: area.activeFocus
  }
}
