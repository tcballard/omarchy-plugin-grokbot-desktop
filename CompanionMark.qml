import QtQuick
import "qml/shapes.js" as Shapes
import "qml/palette.js" as Palette

// Flat Grok Bot silhouette. No outline, no highlight, no sclera.
// The face is two angled capsule cutouts.
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

  readonly property var blended: Shapes.blend(shapeFrom, shapeTo, morph)
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
    return mark.parseHex(Palette.get(chosen)[key])
  }

  function mixToken(key) {
    var fromName = mark.colorFromName !== "" ? mark.colorFromName : mark.colorName
    var a = mark.tokenColor(fromName, key)
    var b = mark.tokenColor(mark.colorName, key)
    var t = mark.morph
    return Qt.rgba(
      a.r + (b.r - a.r) * t,
      a.g + (b.g - a.g) * t,
      a.b + (b.b - a.b) * t,
      1
    )
  }

  function tracePath(ctx, pts, rad, cx, cy) {
    var n = pts.length
    function px(point) { return cx + point[0] * rad }
    function py(point) { return cy + point[1] * rad }
    ctx.beginPath()
    ctx.moveTo(px(pts[0]), py(pts[0]))
    var i
    for (i = 0; i < n; i++) {
      var a = pts[i]
      var b = pts[(i + 1) % n]
      ctx.quadraticCurveTo(px(a), py(a), px([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), py([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]))
    }
    ctx.closePath()
  }

  function paintCapsule(ctx, x, y, capsuleW, capsuleH, angleDeg, fill) {
    var hw = capsuleW / 2
    var straight = Math.max(0, capsuleH / 2 - hw)
    var ang = angleDeg * Math.PI / 180
    var ca = Math.cos(ang)
    var sa = Math.sin(ang)
    var steps = 28
    ctx.beginPath()
    var i
    for (i = 0; i < steps; i++) {
      var t = (Math.PI * 2 * i) / steps
      var px = Math.cos(t) * hw
      var py = Math.sin(t) * hw
      if (py >= 0) py += straight
      else py -= straight
      var rx = px * ca - py * sa
      var ry = px * sa + py * ca
      if (i === 0) ctx.moveTo(x + rx, y + ry)
      else ctx.lineTo(x + rx, y + ry)
    }
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
  }

  onBlendedChanged: canvas.requestPaint()
  onFillColorChanged: canvas.requestPaint()
  onEyeColorChanged: canvas.requestPaint()
  onGazeXChanged: canvas.requestPaint()
  onGazeYChanged: canvas.requestPaint()
  onEyeOpenChanged: canvas.requestPaint()
  onExpressionChanged: canvas.requestPaint()
  onThinkAngleChanged: canvas.requestPaint()
  onSleepDriftChanged: canvas.requestPaint()
  onWidthChanged: canvas.requestPaint()
  onHeightChanged: canvas.requestPaint()

  Image {
    id: avatar
    anchors.fill: parent
    visible: false
    asynchronous: true
    cache: false
    fillMode: Image.PreserveAspectCrop
    source: mark.imageSource.length > 6 ? mark.imageSource : ""
    onStatusChanged: canvas.requestPaint()
  }

  Canvas {
    id: canvas
    anchors.fill: parent
    antialiasing: true
    onPaint: {
      var ctx = getContext("2d")
      ctx.reset()
      ctx.clearRect(0, 0, width, height)
      var face = mark.blended
      var pts = face ? face.points : null
      if (!pts || pts.length < 3) return
      var w = width
      var h = height
      var cx = w / 2
      var cy = h / 2
      var rad = Math.min(w, h) * 0.46
      mark.tracePath(ctx, pts, rad, cx, cy)
      if (avatar.status === Image.Ready && mark.imageSource.length > 6) {
        ctx.save()
        ctx.clip()
        ctx.drawImage(avatar, 0, 0, w, h)
        ctx.restore()
      } else {
        ctx.fillStyle = mark.fillColor
        ctx.fill()
      }

      var open = mark.eyeOpen
      var tilt = 11
      var heightScale = 1
      if (mark.expression === "sleep") {
        open = Math.min(open, 0.16)
        heightScale = 0.42
      } else if (mark.expression === "think") {
        open = Math.min(open, 0.45)
        tilt = 18 + Math.sin(mark.thinkAngle) * 2
        heightScale = 0.62
      } else if (mark.expression === "alert") {
        tilt = 7
        heightScale = 1.16
      } else if (mark.expression === "happy" || mark.expression === "celebrate") {
        tilt = 16
        heightScale = 0.72
      }
      heightScale *= 1 - Math.min(0.2, Math.abs(mark.gazeY) * 0.12)

      var gx = cx + mark.gazeX * rad * 0.16
      var gy = cy + mark.gazeY * rad * 0.1 + mark.sleepDrift * 0.12
      var sep = rad * 0.3
      var eyeW = Math.max(1.6, rad * 0.165)
      var eyeH = Math.max(eyeW * 0.34, rad * 0.43 * Math.max(0.08, open) * heightScale)
      mark.paintCapsule(ctx, gx - sep * 0.5, gy + rad * 0.035, eyeW, eyeH, tilt, mark.eyeColor)
      mark.paintCapsule(ctx, gx + sep * 0.5, gy - rad * 0.035, eyeW, eyeH, tilt, mark.eyeColor)
    }
  }
}
