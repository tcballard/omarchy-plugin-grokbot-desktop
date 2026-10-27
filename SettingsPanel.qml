import QtQuick
import QtQuick.Controls
import QtQuick.Shapes
import "qml/theme.js" as Theme
import "qml/shapes.js" as Shapes

// Appearance page, laid out like Grok Bot's avatar picker. It slides in
// inside the bubble card, so it has no chrome of its own. Strings are plain
// text.
Item {
  id: drawer
  property var app: null
  implicitHeight: header.height + 14 + body.implicitHeight

  readonly property var shapeRows: Shapes.ROWS

  // Row, column, and row length for the shape at `index`.
  function cellPlace(index) {
    var start = 0
    var r
    for (r = 0; r < drawer.shapeRows.length; r++) {
      if (index < start + drawer.shapeRows[r]) return { row: r, col: index - start, count: drawer.shapeRows[r] }
      start += drawer.shapeRows[r]
    }
    return { row: 0, col: 0, count: 1 }
  }

  function title(name) {
    var text = String(name || "")
    return text.charAt(0).toUpperCase() + text.slice(1)
  }

  // Active borders use the chosen colour, or near-white when that colour is
  // too dark to read on the chrome.
  readonly property color tone: app.ringColor(app.shownColor === "omarchy" ? app.accent : app.paletteFill(app.shownColor))
  readonly property var accentNames: {
    var names = app && app.colorNames ? app.colorNames : []
    var out = []
    var i
    for (i = 0; i < names.length; i++) if (names[i] !== "omarchy") out.push(names[i])
    return out
  }

  Item {
    id: header
    width: parent.width
    height: 36

    Rectangle {
      id: backButton
      width: 32
      height: 32
      radius: 16
      anchors.verticalCenter: parent.verticalCenter
      color: Theme.raised
      border.width: 1
      border.color: Theme.edge
      Canvas {
        anchors.fill: parent
        onPaint: {
          var ctx = getContext("2d")
          ctx.reset()
          ctx.strokeStyle = Theme.icon
          ctx.lineWidth = 1.6
          ctx.lineCap = "round"
          ctx.lineJoin = "round"
          ctx.beginPath()
          ctx.moveTo(width * 0.56, height * 0.34)
          ctx.lineTo(width * 0.42, height * 0.5)
          ctx.lineTo(width * 0.56, height * 0.66)
          ctx.stroke()
        }
      }
      HoverArea { label: "Back to chat"; onActivated: app.closeSettings() }
    }

    Text {
      anchors.left: backButton.right
      anchors.leftMargin: 10
      anchors.verticalCenter: parent.verticalCenter
      text: "Appearance"
      color: Theme.text
      font.pixelSize: 15
      font.bold: true
      font.family: app.fontFamily
      textFormat: Text.PlainText
    }

    Rectangle {
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      width: syncLabel.implicitWidth + 28
      height: 24
      radius: 12
      color: app.syncOn ? Theme.okFill : Theme.field
      border.width: 1
      border.color: app.syncOn ? Theme.okEdge : Theme.edge
      Rectangle {
        x: 8
        y: 8
        width: 8
        height: 8
        radius: 4
        color: app.syncOn ? Theme.ok : Theme.textFaint
      }
      Text {
        id: syncLabel
        x: 20
        y: 4
        text: app.syncOn ? "Synced · " + app.botLabel() : "Custom"
        color: app.syncOn ? Theme.ok : Theme.textMuted
        font.pixelSize: 11
        font.bold: true
        font.family: app.fontFamily
        textFormat: Text.PlainText
      }
      HoverArea { label: app.syncOn ? "Stop syncing appearance with the bot" : "Sync appearance with the bot"; onActivated: app.setSync(!app.syncOn) }
    }
  }

  Flickable {
    id: flick
    anchors.top: header.bottom
    anchors.topMargin: 14
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.bottom: parent.bottom
    contentHeight: body.implicitHeight
    clip: true
    boundsBehavior: Flickable.StopAtBounds
    ScrollBar.vertical: ScrollBar { policy: flick.contentHeight > flick.height ? ScrollBar.AsNeeded : ScrollBar.AlwaysOff }

    Column {
      id: body
      width: flick.width
      spacing: 12

      // Shapes as Grok Bot's picker lays them out: rows of four, five, and
      // five, every shape in the chosen colour, and a ring that follows the
      // chosen shape's outline.
      Item {
        id: shapeGrid
        width: parent.width
        readonly property real pitch: width / 5
        readonly property real rowPitch: pitch * 0.8
        height: rowPitch * drawer.shapeRows.length
        Repeater {
          model: app.shapeNames
          delegate: Item {
            id: cell
            required property string modelData
            required property int index
            readonly property bool active: modelData === app.canonicalShape
            readonly property var place: drawer.cellPlace(index)
            readonly property real markSize: shapeGrid.pitch * 0.711
            readonly property real unit: markSize * 0.43
            width: shapeGrid.pitch
            height: shapeGrid.rowPitch
            x: (shapeGrid.width - place.count * shapeGrid.pitch) / 2 + place.col * shapeGrid.pitch
            y: place.row * shapeGrid.rowPitch

            // The ring is two strokes of the outline: a wide one in the ring
            // colour and a narrower one in the page colour, so it follows the
            // shape at an even distance, round every concave turn.
            Shape {
              id: ring
              anchors.centerIn: parent
              width: cell.markSize
              height: cell.markSize
              // Grok Bot moves the ring at once, with no transition.
              visible: cell.active
              readonly property string outline: Shapes.svgPath(Shapes.get(cell.modelData).points, cell.unit, width / 2, height / 2)
              ShapePath {
                strokeColor: Theme.textMuted
                strokeWidth: 2 * (0.224 + 0.055) * cell.unit
                fillColor: "transparent"
                joinStyle: ShapePath.RoundJoin
                PathSvg { path: ring.outline }
              }
              ShapePath {
                strokeColor: Theme.surface
                strokeWidth: 2 * (0.224 - 0.055) * cell.unit
                fillColor: Theme.surface
                joinStyle: ShapePath.RoundJoin
                PathSvg { path: ring.outline }
              }
            }

            CompanionMark {
              anchors.centerIn: parent
              width: cell.markSize
              height: cell.markSize
              shapeFrom: cell.modelData
              shapeTo: cell.modelData
              showStem: true
              morph: 1
              colorName: app.shownColor
              accent: app.accent
              cutoutHex: Theme.surface
              eyeOpen: 1
              // Pressed, the shape dims to 55%, as in the app.
              opacity: shapeArea.pressed ? 0.55 : 1
            }

            HoverArea {
              id: shapeArea
              label: drawer.title(cell.modelData)
              tint: false
              onActivated: app.selectShape(cell.modelData)
            }
          }
        }
      }

      // Colours as the picker shows them, in rows of six; the last swatch
      // follows the Omarchy theme accent. The chosen one wears a ring with a
      // gap, as in Grok Bot.
      Item {
        id: swatchGrid
        width: parent.width
        readonly property var names: drawer.accentNames.concat(["omarchy"])
        readonly property real pitch: width / 6
        readonly property real rowPitch: 44
        readonly property real dot: 28
        height: rowPitch * Math.ceil(names.length / 6)
        Repeater {
          model: swatchGrid.names
          delegate: Item {
            required property string modelData
            required property int index
            readonly property bool active: modelData === app.shownColor
            readonly property int row: Math.floor(index / 6)
            readonly property int inRow: Math.min(6, swatchGrid.names.length - row * 6)
            width: swatchGrid.pitch
            height: swatchGrid.rowPitch
            x: (swatchGrid.width - inRow * swatchGrid.pitch) / 2 + (index % 6) * swatchGrid.pitch
            y: row * swatchGrid.rowPitch
            Rectangle {
              anchors.centerIn: parent
              width: swatchGrid.dot * 1.32 + swatchGrid.dot * 0.16
              height: width
              radius: width / 2
              color: "transparent"
              border.width: swatchGrid.dot * 0.08
              border.color: Theme.textMuted
              visible: parent.active
            }
            Rectangle {
              anchors.centerIn: parent
              width: swatchGrid.dot
              height: width
              radius: width / 2
              color: modelData === "omarchy" ? app.accent : app.paletteFill(modelData)
              opacity: swatchArea.pressed ? 0.55 : 1
              // A hole marks the swatch that follows the theme accent.
              Rectangle {
                anchors.centerIn: parent
                visible: modelData === "omarchy"
                width: parent.width * 0.36
                height: width
                radius: width / 2
                color: Theme.surface
              }
            }
            HoverArea {
              id: swatchArea
              label: modelData === "omarchy" ? "Theme accent" : drawer.title(modelData)
              tint: false
              onActivated: app.selectColor(modelData)
            }
          }
        }
      }

      Rectangle {
        width: parent.width
        height: 1
        color: Theme.divider
      }

      Item {
        width: parent.width
        height: 24
        Text {
          id: resetText
          anchors.verticalCenter: parent.verticalCenter
          text: "Reset to default"
          color: Theme.link
          opacity: app.syncOn ? 0.45 : 1
          font.pixelSize: 14
          font.family: app.fontFamily
          textFormat: Text.PlainText
        }
        Item {
          width: resetText.implicitWidth
          height: parent.height
          HoverArea {
            label: "Reset to " + app.botLabel() + "'s look"
            tint: false
            enabled: !app.syncOn
            onActivated: app.setSync(true)
          }
        }
      }

      Text {
        text: "IDLE MOTION & RIG"
        color: Theme.textFaint
        font.pixelSize: 10
        font.bold: true
        font.family: "monospace"
        textFormat: Text.PlainText
      }

      Row {
        id: motionRow
        width: parent.width
        spacing: 8
        property real cardW: (width - spacing * 2) / 3
        Repeater {
          model: [
            { "id": "calm", "label": "Calm", "detail": "Breathing" },
            { "id": "playful", "label": "Playful", "detail": "Bob + Gaze" },
            { "id": "hyper", "label": "Hyper", "detail": "Orbit + Hop" }
          ]
          delegate: Rectangle {
            required property var modelData
            readonly property bool active: app.motionName === modelData.id
            width: motionRow.cardW
            height: 44
            radius: 11
            color: active ? Theme.selected : Theme.field
            border.width: active ? 1.5 : 1
            border.color: active ? drawer.tone : Theme.edgeSoft
            Text {
              x: 10
              y: 6
              text: modelData.label
              color: active ? Theme.text : Theme.textMuted
              font.pixelSize: 12
              font.bold: active
              font.family: app.fontFamily
              textFormat: Text.PlainText
            }
            Text {
              x: 10
              y: 24
              text: modelData.detail
              color: active ? drawer.tone : Theme.textFaint
              font.pixelSize: 10
              font.family: app.fontFamily
              textFormat: Text.PlainText
            }
            HoverArea { label: modelData.label; onActivated: app.setMotion(modelData.id) }
          }
        }
      }

      Text {
        readonly property var corners: ({ br: "Bottom right", bl: "Bottom left", tr: "Top right", tl: "Top left" })
        text: "PLACEMENT  ·  " + corners[app.anchorName]
        color: Theme.textFaint
        font.pixelSize: 10
        font.bold: true
        font.family: "monospace"
        textFormat: Text.PlainText
      }

      // Corner, size, and dodge share one row. The corner picker is a small
      // screen with a dot in each corner.
      Item {
        width: parent.width
        height: 44

        Rectangle {
          id: cornerPicker
          width: 66
          height: 44
          radius: 9
          color: Theme.field
          border.width: 1
          border.color: Theme.edgeSoft
          Repeater {
            model: ["tl", "tr", "bl", "br"]
            delegate: Item {
              required property string modelData
              readonly property bool active: app.anchorName === modelData
              width: 26
              height: 18
              x: modelData.charAt(1) === "l" ? 4 : cornerPicker.width - width - 4
              y: modelData.charAt(0) === "t" ? 4 : cornerPicker.height - height - 4
              Rectangle {
                width: active ? 12 : 8
                height: width
                radius: width / 2
                anchors.centerIn: parent
                anchors.horizontalCenterOffset: modelData.charAt(1) === "l" ? -4 : 4
                color: active ? drawer.tone : (cornerArea.containsMouse ? Theme.textMuted : Theme.dim)
                Behavior on width { NumberAnimation { duration: app && app.reduceMotion ? 0 : 140; easing.type: Easing.OutCubic } }
              }
              HoverArea {
                id: cornerArea
                label: ({ br: "Bottom right", bl: "Bottom left", tr: "Top right", tl: "Top left" })[modelData]
                tint: false
                onActivated: app.setAnchor(modelData)
              }
            }
          }
        }

        Row {
          id: sizeRow
          anchors.left: cornerPicker.right
          anchors.leftMargin: 10
          anchors.verticalCenter: parent.verticalCenter
          spacing: 6
          Repeater {
            model: ["small", "medium", "large"]
            delegate: Rectangle {
              required property string modelData
              required property int index
              readonly property bool active: app.sizeName === modelData
              width: 64
              height: 32
              radius: 10
              color: active ? Theme.selected : Theme.field
              border.width: active ? 1.5 : 1
              border.color: active ? drawer.tone : Theme.edgeSoft
              z: active ? 1 : 0
              Text {
                anchors.centerIn: parent
                text: drawer.title(modelData)
                color: active ? Theme.text : Theme.textMuted
                font.pixelSize: 11
                font.bold: active
                font.family: app.fontFamily
                textFormat: Text.PlainText
              }
              HoverArea { label: drawer.title(modelData); onActivated: app.setSize(modelData) }
            }
          }
        }

        Rectangle {
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          width: dodgeLabel.implicitWidth + 40
          height: 32
          radius: 10
          color: app.dodgeOn ? Theme.selected : Theme.field
          border.width: app.dodgeOn ? 1.5 : 1
          border.color: app.dodgeOn ? drawer.tone : Theme.edgeSoft
          Rectangle {
            x: 10
            anchors.verticalCenter: parent.verticalCenter
            width: 8
            height: 8
            radius: 4
            color: app.dodgeOn ? drawer.tone : Theme.dim
          }
          Text {
            id: dodgeLabel
            x: 26
            anchors.verticalCenter: parent.verticalCenter
            text: "Dodge"
            color: app.dodgeOn ? Theme.text : Theme.textMuted
            font.pixelSize: 11
            font.bold: app.dodgeOn
            font.family: app.fontFamily
            textFormat: Text.PlainText
          }
          HoverArea { label: "Dodge"; onActivated: app.setDodge(!app.dodgeOn) }
        }
      }
    }
  }

  Rectangle {
    anchors.bottom: parent.bottom
    width: parent.width
    height: 22
    opacity: flick.contentY + flick.height < flick.contentHeight - 1 ? 1 : 0
    Behavior on opacity { NumberAnimation { duration: app && app.reduceMotion ? 0 : 120 } }
    gradient: Gradient {
      GradientStop { position: 0; color: Theme.surfaceClear }
      GradientStop { position: 1; color: Theme.surface }
    }
  }
}
