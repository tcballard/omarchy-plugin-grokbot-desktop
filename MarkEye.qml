import QtQuick
import "qml/face.js" as Face

// One eye of a CompanionMark: a capsule at the shape's resting place for it,
// moved by the gaze, tilted and squinted by the expression, and closed by
// blinks and sleep.
Rectangle {
  id: eye
  property var host: null
  property var spec: ({ x: 0, y: 0, length: 0.5, width: 0.2, angle: 63 })
  readonly property var geo: Face.eye(eye.spec, eye.host.rad, eye.host.eyeOpenNow, eye.host.eyeSquint)

  width: eye.geo.w
  height: eye.geo.h
  radius: eye.geo.r
  x: eye.host.cx + eye.spec.x * eye.host.rad + eye.host.gazeDx - width / 2
  y: eye.host.cy + eye.spec.y * eye.host.rad + eye.host.gazeDy - height / 2
  rotation: Face.rotation(eye.spec, eye.host.eyeTiltDelta)
  antialiasing: true
}
