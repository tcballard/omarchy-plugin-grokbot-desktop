import QtQuick
import QtQuick.Shapes
import "qml/openbotavatar.js" as Avatar

Item {
  id: avatar
  property var definition: null
  property color bodyColor: "orange"
  property color inkColor: "#151515"
  property real gazeX: 0
  property real gazeY: 0
  property string mood: "idle"
  property bool animated: false
  property bool reducedMotion: false
  property real clock: 0
  readonly property var frame: definition ? Avatar.avatarFrame(definition, {
    color: String(bodyColor), eyeColor: String(inkColor), time: clock,
    gaze: { x: gazeX, y: gazeY }, motion: mood, reducedMotion: reducedMotion
  }) : null
  function matrix(m) {
    return Qt.matrix4x4(m[0], m[2], 0, m[4], m[1], m[3], 0, m[5], 0, 0, 1, 0, 0, 0, 0, 1)
  }
  function pathFor(shape) {
    if (shape.kind === "slice") {
      for (var i = 0; i < frame.paths.length; i++) if (frame.paths[i].id === shape.path) return frame.paths[i]
    }
    return { d: shape.mark && shape.mark.d || "", evenOdd: false }
  }
  Timer {
    interval: 33
    repeat: true
    running: avatar.visible && avatar.animated && !avatar.reducedMotion && avatar.definition !== null
    onTriggered: avatar.clock += 0.033
  }
  Item {
    width: 100
    height: 100
    anchors.centerIn: parent
    scale: Math.min(avatar.width, avatar.height) / 100
    Item {
      width: 100
      height: 100
      transform: Matrix4x4 { matrix: avatar.matrix(avatar.frame ? avatar.frame.root : [1,0,0,1,0,0]) }
      Repeater {
        model: avatar.frame ? avatar.frame.shapes.length : 0
        delegate: Item {
          required property int index
          readonly property var modelData: avatar.frame.shapes[index]
          readonly property bool pill: modelData.kind === "eye" && modelData.mark.shape === "pill"
          readonly property var geometry: avatar.pathFor(modelData)
          width: 100
          height: 100
          transform: Matrix4x4 { matrix: avatar.matrix(modelData.matrix) }
          Shape {
            visible: !parent.pill
            anchors.fill: parent
            ShapePath {
              strokeWidth: modelData.kind === "eye" && modelData.mark.shape === "arc" ? modelData.mark.strokeWidth : -1
              strokeColor: avatar.inkColor
              capStyle: ShapePath.RoundCap
              fillColor: modelData.kind === "eye" ? "transparent" : avatar.bodyColor
              fillRule: geometry.evenOdd ? ShapePath.OddEvenFill : ShapePath.WindingFill
              PathSvg { path: geometry.d }
            }
          }
          Rectangle {
            visible: parent.pill
            x: parent.pill ? modelData.mark.x : 0
            y: parent.pill ? modelData.mark.y : 0
            width: parent.pill ? modelData.mark.width : 0
            height: parent.pill ? modelData.mark.height : 0
            radius: parent.pill ? modelData.mark.radius : 0
            color: avatar.inkColor
          }
        }
      }
    }
  }
}
