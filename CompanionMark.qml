import QtQuick
import "qml/shapes.js" as Shapes
import "qml/palette.js" as Palette

// One Grok Bot mark: a morphed contour, a highlight, and a face.
Item {
  id: mark
  property string shapeFrom: "teardrop"
  property string shapeTo: "teardrop"
  property real morph: 1
  property string colorName: "orange"
  property string colorFromName: ""
  property color accent: "#7aa2f7"
  property color themeForeground: "#e8e6e3"
  property color themeBackground: "#1a1b26"
  property real gazeX: 0
  property real gazeY: 0
  property real eyeOpen: 1
  property string expression: "idle"
  property real thinkAngle: 0
  property real sleepDrift: 0
  property string imageSource: ""

  readonly property var blended: Shapes.blend(shapeFrom, shapeTo, morph)
  readonly property bool darkAccent: (accent.r * 0.2126 + accent.g * 0.7152 + accent.b * 0.0722) > 0.45
  readonly property color fillColor: mixToken("fill")
  readonly property color highlightColor: mixToken("highlight")
  readonly property color eyeColor: mixToken("eye")
  readonly property color outlineColor: mixToken("outline")
  readonly property color pupilColor: mixToken("pupil")

  function parseHex(hex) {
    var text = String(hex || "").replace("#", "")
    var n = parseInt(text, 16)
    if (!isFinite(n)) return Qt.rgba(0.9, 0.4, 0.1, 1)
    return Qt.rgba(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1)
  }

  function tokenColor(name, key) {
    var chosen = name !== "" ? name : "orange"
    if (chosen === Palette.OMARCHY) {
      if (key === "fill") return mark.accent
      if (key === "highlight") return Qt.lighter(mark.accent, 1.4)
      if (key === "outline") return Qt.darker(mark.accent, 1.7)
      if (key === "eye") return mark.parseHex(mark.darkAccent ? "#241c10" : "#f7f4ee")
      return mark.parseHex(mark.darkAccent ? "#fff6df" : "#16130f")
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

  onBlendedChanged: canvas.requestPaint()
  onFillColorChanged: canvas.requestPaint()
  onHighlightColorChanged: canvas.requestPaint()
  onEyeColorChanged: canvas.requestPaint()
  onOutlineColorChanged: canvas.requestPaint()
  onPupilColorChanged: canvas.requestPaint()
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
      function px(point) { return cx + point[0] * rad }
      function py(point) { return cy + point[1] * rad }
      ctx.beginPath()
      ctx.moveTo(px(pts[0]), py(pts[0]))
      var i
      for (i = 1; i < pts.length; i++) ctx.lineTo(px(pts[i]), py(pts[i]))
      ctx.closePath()
      if (avatar.status === Image.Ready && mark.imageSource.length > 6) {
        ctx.save()
        ctx.clip()
        ctx.drawImage(avatar, 0, 0, w, h)
        ctx.restore()
      } else {
        ctx.fillStyle = mark.fillColor
        ctx.fill()
        ctx.save()
        ctx.clip()
        var hx = cx - mark.gazeX * rad * 0.18
        var hy = cy - rad * 0.32 - mark.gazeY * rad * 0.1
        var gradient = ctx.createRadialGradient(hx, hy, rad * 0.04, cx, cy, rad * 0.95)
        gradient.addColorStop(0, mark.highlightColor)
        gradient.addColorStop(1, "rgba(255,255,255,0)")
        ctx.globalAlpha = 0.55
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, w, h)
        ctx.restore()
      }
      ctx.lineWidth = Math.max(1.25, w * 0.028)
      ctx.strokeStyle = mark.outlineColor
      ctx.lineJoin = "round"
      ctx.stroke()

      var eyeY = cy + face.eyeY * rad + mark.gazeY * rad * 0.05
      var spread = face.spread * rad
      var eyeR = Math.max(2.2, w * 0.07)
      if (mark.expression === "alert") eyeR *= 1.28
      var shift = mark.gazeX * rad * 0.045
      mark.paintEye(ctx, cx - spread + shift, eyeY, eyeR)
      mark.paintEye(ctx, cx + spread + shift, eyeY, eyeR)
      if (mark.expression === "think") mark.paintThink(ctx, cx, eyeY - eyeR * 1.8, eyeR)
      if (mark.expression === "sleep") mark.paintSleep(ctx, cx + spread + eyeR, eyeY - eyeR)
    }
  }

  function paintEye(ctx, x, y, radius) {
    var open = mark.eyeOpen
    if (mark.expression === "sleep") open = 0.08
    if (mark.expression === "think") open = Math.min(open, 0.38)
    ctx.lineCap = "round"
    ctx.strokeStyle = mark.outlineColor
    ctx.fillStyle = mark.eyeColor
    ctx.lineWidth = Math.max(1.2, radius * 0.18)
    if (mark.expression === "happy" || mark.expression === "celebrate") {
      ctx.beginPath()
      ctx.arc(x, y + radius * 0.15, radius * 0.85, Math.PI * 1.15, Math.PI * 1.85, false)
      ctx.stroke()
      return
    }
    if (open < 0.22) {
      ctx.beginPath()
      ctx.moveTo(x - radius, y)
      ctx.lineTo(x + radius, y)
      ctx.stroke()
      return
    }
    ctx.beginPath()
    ctx.ellipse(x, y, radius, Math.max(1.2, radius * open), 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    var pupil = radius * (mark.expression === "alert" ? 0.28 : 0.42)
    ctx.beginPath()
    ctx.fillStyle = mark.pupilColor
    ctx.ellipse(x + mark.gazeX * radius * 0.35, y + mark.gazeY * radius * 0.28, pupil, pupil * open, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  function paintThink(ctx, x, y, radius) {
    var i
    ctx.fillStyle = mark.eyeColor
    for (i = 0; i < 3; i++) {
      var angle = mark.thinkAngle + i * (Math.PI * 2 / 3)
      var dx = Math.cos(angle) * radius * 1.3
      var dy = Math.sin(angle) * radius * 0.55
      ctx.beginPath()
      ctx.arc(x + dx, y + dy, Math.max(1.3, radius * 0.16), 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function paintSleep(ctx, x, y) {
    ctx.fillStyle = mark.eyeColor
    ctx.font = Math.max(10, width * 0.12) + "px sans-serif"
    ctx.globalAlpha = 0.85
    ctx.fillText("z", x, y + mark.sleepDrift)
    ctx.globalAlpha = 0.55
    ctx.fillText("z", x + width * 0.08, y - width * 0.08 + mark.sleepDrift * 0.6)
    ctx.globalAlpha = 1
  }
}
