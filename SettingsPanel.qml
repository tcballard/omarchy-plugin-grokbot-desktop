import QtQuick
import QtQuick.Controls

// Monochrome appearance page. It slides in inside the bubble card, so it has
// no chrome of its own. Inactive marks stay muted; the active shape uses the
// selected accent. Strings are plain text.
Item {
  id: drawer
  property var app: null
  implicitHeight: header.height + 14 + body.implicitHeight

  // The section headers name what is chosen, or what the pointer is over.
  property string hoverShape: ""
  property string hoverColor: ""
  function title(name) {
    var text = String(name || "")
    return text.charAt(0).toUpperCase() + text.slice(1)
  }

  readonly property color tone: app.shownColor === "omarchy" ? app.accent : app.paletteFill(app.shownColor)
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
      color: "#1C1C1F"
      border.width: 1
      border.color: "#2E2E32"
      Canvas {
        anchors.fill: parent
        onPaint: {
          var ctx = getContext("2d")
          ctx.reset()
          ctx.strokeStyle = "#E4E4E7"
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
      MouseArea { anchors.fill: parent; onClicked: app.closeSettings() }
    }

    Text {
      anchors.left: backButton.right
      anchors.leftMargin: 10
      anchors.verticalCenter: parent.verticalCenter
      text: "Appearance"
      color: "#F4F4F5"
      font.pixelSize: 15
      font.bold: true
      textFormat: Text.PlainText
    }

    Rectangle {
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      width: syncLabel.implicitWidth + 28
      height: 24
      radius: 12
      color: app.syncOn ? "#18261E" : "#19191C"
      border.width: 1
      border.color: app.syncOn ? "#284233" : "#2E2E32"
      Rectangle {
        x: 8
        y: 8
        width: 8
        height: 8
        radius: 4
        color: app.syncOn ? "#5BC67A" : "#71717A"
      }
      Text {
        id: syncLabel
        x: 20
        y: 4
        text: app.syncOn ? "Synced · " + app.botLabel() : "Custom"
        color: app.syncOn ? "#5BC67A" : "#A1A1AA"
        font.pixelSize: 11
        font.bold: true
        textFormat: Text.PlainText
      }
      MouseArea { anchors.fill: parent; onClicked: app.setSync(!app.syncOn) }
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
      spacing: 14

      Text {
        text: "MARK SILHOUETTE  ·  " + drawer.title(drawer.hoverShape !== "" ? drawer.hoverShape : app.canonicalShape)
        color: "#71717A"
        font.pixelSize: 10
        font.bold: true
        font.family: "monospace"
        textFormat: Text.PlainText
      }

      Grid {
        id: shapeGrid
        width: parent.width
        columns: 5
        rowSpacing: 8
        columnSpacing: 8
        property real cellW: (width - columnSpacing * 4) / 5
        Repeater {
          model: app.shapeNames
          delegate: Rectangle {
            required property string modelData
            readonly property bool active: modelData === app.canonicalShape
            width: shapeGrid.cellW
            height: 44
            radius: 12
            color: "#19191C"
            border.width: active ? 1.5 : 1
            border.color: active ? drawer.tone : "#26262A"
            Rectangle {
              anchors.fill: parent
              radius: parent.radius
              color: drawer.tone
              opacity: active ? 0.16 : 0
            }
            CompanionMark {
              anchors.centerIn: parent
              width: 28
              height: 28
              shapeFrom: modelData
              shapeTo: modelData
              morph: 1
              colorName: active ? app.shownColor : "gray"
              accent: app.accent
              fillHex: active ? "" : "#71717A"
              cutoutHex: active && app.shownColor === "black" ? "#F4F4F5" : "#19191C"
              eyeOpen: 1
            }
            MouseArea {
              anchors.fill: parent
              hoverEnabled: true
              onContainsMouseChanged: drawer.hoverShape = containsMouse ? modelData : (drawer.hoverShape === modelData ? "" : drawer.hoverShape)
              onClicked: app.selectShape(modelData)
            }
          }
        }
      }

      Text {
        text: "COLOUR  ·  " + (drawer.hoverColor !== "" ? drawer.hoverColor : (app.shownColor === "omarchy" ? "Theme accent" : drawer.title(app.shownColor)))
        color: "#71717A"
        font.pixelSize: 10
        font.bold: true
        font.family: "monospace"
        textFormat: Text.PlainText
      }

      Row {
        width: parent.width
        spacing: Math.max(2, (width - 30 * (drawer.accentNames.length + 1)) / drawer.accentNames.length)
        Repeater {
          model: drawer.accentNames
          delegate: Item {
            required property string modelData
            width: 30
            height: 30
            Rectangle {
              anchors.centerIn: parent
              width: 28
              height: 28
              radius: 14
              color: "transparent"
              border.width: modelData === app.shownColor ? 2 : 0
              border.color: "#F4F4F5"
            }
            Rectangle {
              anchors.centerIn: parent
              width: 20
              height: 20
              radius: 10
              color: app.paletteFill(modelData)
              border.width: 1
              border.color: "#27272A"
            }
            MouseArea {
              anchors.fill: parent
              hoverEnabled: true
              onContainsMouseChanged: drawer.hoverColor = containsMouse ? drawer.title(modelData) : ""
              onClicked: app.selectColor(modelData)
            }
          }
        }
        Item {
          width: 30
          height: 30
          Rectangle {
            anchors.centerIn: parent
            width: 28
            height: 28
            radius: 14
            color: "transparent"
            border.width: app.shownColor === "omarchy" ? 2 : 0
            border.color: "#F4F4F5"
          }
          Rectangle {
            anchors.centerIn: parent
            width: 20
            height: 20
            radius: 10
            color: app.accent
            border.width: 1
            border.color: "#27272A"
            // A hole marks the swatch that follows the theme accent.
            Rectangle {
              anchors.centerIn: parent
              width: 8
              height: 8
              radius: 4
              color: "#141416"
            }
          }
          MouseArea {
            anchors.fill: parent
            hoverEnabled: true
            onContainsMouseChanged: drawer.hoverColor = containsMouse ? "Theme accent" : ""
            onClicked: app.selectColor("omarchy")
          }
        }
      }

      Text {
        text: "IDLE MOTION & RIG"
        color: "#71717A"
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
            color: active ? "#232327" : "#19191C"
            border.width: active ? 1.5 : 1
            border.color: active ? drawer.tone : "#26262A"
            Text {
              x: 10
              y: 6
              text: modelData.label
              color: active ? "#F4F4F5" : "#A1A1AA"
              font.pixelSize: 12
              font.bold: active
              textFormat: Text.PlainText
            }
            Text {
              x: 10
              y: 24
              text: modelData.detail
              color: active ? drawer.tone : "#71717A"
              font.pixelSize: 10
              textFormat: Text.PlainText
            }
            MouseArea { anchors.fill: parent; onClicked: app.setMotion(modelData.id) }
          }
        }
      }

      Text {
        readonly property var corners: ({ br: "Bottom right", bl: "Bottom left", tr: "Top right", tl: "Top left" })
        text: "PLACEMENT  ·  " + corners[app.anchorName]
        color: "#71717A"
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
          color: "#19191C"
          border.width: 1
          border.color: "#26262A"
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
                color: active ? drawer.tone : (cornerArea.containsMouse ? "#A1A1AA" : "#52525B")
                Behavior on width { NumberAnimation { duration: app && app.reduceMotion ? 0 : 140; easing.type: Easing.OutCubic } }
              }
              MouseArea {
                id: cornerArea
                anchors.fill: parent
                hoverEnabled: true
                onClicked: app.setAnchor(modelData)
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
              color: active ? "#232327" : "#19191C"
              border.width: active ? 1.5 : 1
              border.color: active ? drawer.tone : "#26262A"
              z: active ? 1 : 0
              Text {
                anchors.centerIn: parent
                text: drawer.title(modelData)
                color: active ? "#F4F4F5" : "#A1A1AA"
                font.pixelSize: 11
                font.bold: active
                textFormat: Text.PlainText
              }
              MouseArea { anchors.fill: parent; onClicked: app.setSize(modelData) }
            }
          }
        }

        Rectangle {
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          width: dodgeLabel.implicitWidth + 40
          height: 32
          radius: 10
          color: app.dodgeOn ? "#232327" : "#19191C"
          border.width: app.dodgeOn ? 1.5 : 1
          border.color: app.dodgeOn ? drawer.tone : "#26262A"
          Rectangle {
            x: 10
            anchors.verticalCenter: parent.verticalCenter
            width: 8
            height: 8
            radius: 4
            color: app.dodgeOn ? drawer.tone : "#52525B"
          }
          Text {
            id: dodgeLabel
            x: 26
            anchors.verticalCenter: parent.verticalCenter
            text: "Dodge"
            color: app.dodgeOn ? "#F4F4F5" : "#A1A1AA"
            font.pixelSize: 11
            font.bold: app.dodgeOn
            textFormat: Text.PlainText
          }
          MouseArea { anchors.fill: parent; onClicked: app.setDodge(!app.dodgeOn) }
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
      GradientStop { position: 0; color: "#00141416" }
      GradientStop { position: 1; color: "#141416" }
    }
  }
}
