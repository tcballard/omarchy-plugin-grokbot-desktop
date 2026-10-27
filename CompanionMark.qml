import QtQuick
import QtQuick.Shapes
import QtQuick.Effects
import "qml/shapes.js" as Shapes
import "qml/palette.js" as Palette
import "qml/face.js" as Face

// Flat Grok Bot silhouette. No outline, no highlight, no sclera. The face is
// two capsules cut through the shape, placed, sized, and tilted per shape the
// way Grok Bot draws them; they flatten into lid lines to blink or sleep.
Item {
  id: mark
  property string shapeFrom: "teardrop"
  property string shapeTo: "teardrop"
  property real morph: 1
  property string colorName: "orange"
  property string colorFromName: ""
  property color accent: "#5BC67A"
  property string fillHex: ""
  property string cutoutHex: ""
  property real gazeX: 0
  property real gazeY: 0
  property real eyeOpen: 1
  property string expression: "idle"
  property real thinkAngle: 0
  property real sleepDrift: 0
  property string imageSource: ""
  // A contour supplied by the caller replaces the named blend. The main
  // mark uses it to morph from whatever was on screen.
  property var face: null
  // Resting eyes supplied by the caller, alongside `face`.
  property var eyeSet: null
  // Stem visibility supplied by the caller, alongside `face`; below zero
  // means work it out from the named shapes.
  property real stemOverride: -1
  // Grok Bot's picker decorates the pebble with a pumpkin stem; avatars
  // themselves do not wear it.
  property bool showStem: false
  // Whether the mark sits on a dark surface; Grok Bot then draws black as
  // white.
  property bool darkSurface: true
  readonly property real stemLevel: mark.stemOverride >= 0 ? mark.stemOverride : Shapes.stemLevel(mark.shapeFrom, mark.shapeTo, mark.morph)
  readonly property string stemPath: Shapes.svgPath(Shapes.stemPoints(), mark.rad, mark.cx, mark.cy)
  // Punch the eyes through the shape so whatever is behind shows, as Grok
  // Bot does. Off, they are painted in eyeColor, which callers set to the
  // surface behind the mark.
  property bool cutout: false
  // Eye opening multiplier for attention, such as the pointer resting on
  // the mark.
  property real attention: 1
  property bool reduceMotion: false
  property bool mixFromColors: false
  property color fillFrom: "#FF6700"
  property color eyeFrom: "#141416"

  readonly property var named: Shapes.blend(shapeFrom, shapeTo, morph)
  readonly property var blended: face ? ({ points: face, eyes: eyeSet || named.eyes }) : named
  readonly property var restEyes: mark.blended.eyes
  readonly property real accentLuma: accent.r * 0.2126 + accent.g * 0.7152 + accent.b * 0.0722
  readonly property color fillColor: mark.fillHex !== "" ? mark.parseHex(mark.fillHex) : mixToken("fill")
  readonly property color eyeColor: mark.cutoutHex !== "" ? mark.parseHex(mark.cutoutHex) : mixToken("eye")

  function parseHex(hex) {
    var text = String(hex || "").replace("#", "")
    var n = parseInt(text, 16)
    if (!isFinite(n) || text.length < 6) return Qt.rgba(0.95, 0.55, 0.19, 1)
    return Qt.rgba(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1)
  }

  function tokenColor(name, key) {
    var chosen = name !== "" ? name : "orange"
    if (chosen === Palette.OMARCHY) {
      if (key === "fill") return mark.accent
      if (key === "eye") return mark.parseHex(mark.accentLuma < 0.16 ? "#F4F4F5" : "#141416")
      return mark.parseHex(mark.accentLuma < 0.16 ? "#FFFFFF" : "#09090B")
    }
    return mark.parseHex(key === "fill" ? Palette.fillFor(chosen, mark.darkSurface) : Palette.get(chosen)[key])
  }

  function mixToken(key) {
    var fromName = mark.colorFromName !== "" ? mark.colorFromName : mark.colorName
    var a = mark.mixFromColors ? (key === "fill" ? mark.fillFrom : mark.eyeFrom) : mark.tokenColor(fromName, key)
    var b = mark.tokenColor(mark.colorName, key)
    if (mark.morph >= 1) return b
    var c = Palette.mix(a, b, mark.morph)
    return Qt.rgba(c.r, c.g, c.b, 1)
  }

  // The eye pose eases between expressions instead of snapping.
  readonly property var pose: Face.pose(expression)
  property real poseTilt: pose.tilt
  property real poseHeight: pose.height
  property real poseOpen: pose.open
  Behavior on poseTilt { NumberAnimation { duration: mark.reduceMotion ? 0 : 160; easing.type: Easing.OutCubic } }
  Behavior on poseHeight { NumberAnimation { duration: mark.reduceMotion ? 0 : 160; easing.type: Easing.OutCubic } }
  Behavior on poseOpen { NumberAnimation { duration: mark.reduceMotion ? 0 : 180; easing.type: Easing.InOutCubic } }

  // Geometry shared by the body and the eyes.
  // One unit is the circle's radius; the widest shapes reach about 1.08.
  readonly property real rad: Math.min(width, height) * 0.43
  readonly property real cx: width / 2
  readonly property real cy: height / 2
  readonly property string outline: Shapes.svgPath(mark.blended ? mark.blended.points : null, mark.rad, mark.cx, mark.cy)
  readonly property real eyeTiltDelta: mark.poseTilt + (mark.expression === "think" ? Math.sin(mark.thinkAngle) * 2 : 0)
  readonly property real eyeOpenNow: Math.min(mark.eyeOpen, mark.poseOpen)
  readonly property real eyeSquint: mark.poseHeight * mark.attention * (1 - Math.min(0.2, Math.abs(mark.gazeY) * 0.12))
  readonly property real gazeDx: mark.gazeX * mark.rad * 0.16
  readonly property real gazeDy: mark.gazeY * mark.rad * 0.1 + mark.sleepDrift * 0.12
  readonly property bool showImage: mark.imageSource.length > 6 && avatar.status === Image.Ready

  // Supersample the cut-out layers so the mark stays crisp while breathing,
  // hopping, and squashing scale it up.
  readonly property size layerSize: Qt.size(Math.ceil(width * Screen.devicePixelRatio * 2), Math.ceil(height * Screen.devicePixelRatio * 2))

  Image {
    id: avatar
    anchors.fill: parent
    visible: false
    asynchronous: true
    cache: false
    fillMode: Image.PreserveAspectCrop
    source: mark.imageSource.length > 6 ? mark.imageSource : ""
  }

  Item {
    id: art
    anchors.fill: parent
    visible: !mark.cutout
    layer.enabled: mark.cutout
    layer.textureSize: mark.layerSize
    layer.smooth: true
    layer.mipmap: true

    // The silhouette is a GPU-drawn path, so it stays crisp at any scale.
    Shape {
      id: body
      anchors.fill: parent
      visible: !mark.showImage
      Component.onCompleted: {
        try {
          body.preferredRendererType = Shape.CurveRenderer
        } catch (e) {
          // Older Qt draws with the default renderer.
        }
      }
      ShapePath {
        strokeWidth: -1
        strokeColor: "transparent"
        fillColor: mark.fillColor
        PathSvg { path: mark.outline }
      }
    }

    Shape {
      id: stem
      anchors.fill: parent
      // Kept visible and faded with opacity: a child that turns visible
      // inside the hidden cut-out layer is not picked up by it.
      visible: !mark.showImage
      opacity: mark.showStem ? mark.stemLevel : 0
      ShapePath {
        strokeWidth: -1
        strokeColor: "transparent"
        fillColor: Shapes.STEM_COLOR
        PathSvg { path: mark.stemPath }
      }
    }

    // A bot photo is clipped to the silhouette. Few bots have one, so this
    // painter only loads when one is shown.
    Loader {
      anchors.fill: parent
      active: mark.showImage
      sourceComponent: Canvas {
        id: photo
        Connections {
          target: mark
          function onOutlineChanged() { photo.requestPaint() }
        }
        onPaint: {
          var ctx = getContext("2d")
          ctx.reset()
          ctx.path = mark.outline
          ctx.save()
          ctx.clip()
          ctx.drawImage(avatar, 0, 0, width, height)
          ctx.restore()
        }
      }
    }

    Repeater {
      model: mark.cutout ? 0 : 2
      delegate: MarkEye {
        required property int index
        host: mark
        spec: mark.restEyes[index]
        color: mark.eyeColor
      }
    }
  }

  Item {
    id: eyeMask
    anchors.fill: parent
    visible: false
    layer.enabled: mark.cutout
    layer.textureSize: mark.layerSize
    layer.smooth: true
    layer.mipmap: true
    Repeater {
      model: mark.cutout ? 2 : 0
      delegate: MarkEye {
        required property int index
        host: mark
        spec: mark.restEyes[index]
        color: "#FFFFFF"
      }
    }
  }

  MultiEffect {
    anchors.fill: parent
    visible: mark.cutout
    source: art
    maskEnabled: true
    maskSource: eyeMask
    maskInverted: true
    maskThresholdMin: 0.5
    maskSpreadAtMin: 1.0
  }
}
