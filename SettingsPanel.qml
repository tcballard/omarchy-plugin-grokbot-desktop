import QtQuick

// Monochrome appearance drawer. Inactive marks stay muted; the active shape
// uses the selected accent. Strings are plain text.
Rectangle {
  id: drawer
  property var app: null
  radius: 22
  color: "#141416"
  border.width: 1
  border.color: "#27272A"

  readonly property color tone: app.shownColor === "omarchy" ? app.accent : app.paletteFill(app.shownColor)
  readonly property var accentNames: {
    var names = app && app.colorNames ? app.colorNames : []
    var out = []
    var i
    for (i = 0; i < names.length; i++) if (names[i] !== "omarchy") out.push(names[i])
    return out
  }

  Flickable {
    id: flick
    anchors.fill: parent
    anchors.margins: 16
    contentHeight: body.implicitHeight
    clip: true
    boundsBehavior: Flickable.StopAtBounds

    Column {
      id: body
      width: flick.width
      spacing: 14

      Item {
        width: parent.width
        height: 28
        Text {
          text: "Companion Appearance"
          color: "#F4F4F5"
          font.pixelSize: 15
          font.bold: true
          anchors.verticalCenter: parent.verticalCenter
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

      Text {
        text: "MARK SILHOUETTE  ·  25 SHAPES"
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
            height: 52
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
              anchors.horizontalCenter: parent.horizontalCenter
              y: 4
              width: 26
              height: 26
              shapeFrom: modelData
              shapeTo: modelData
              morph: 1
              colorName: active ? app.shownColor : "gray"
              accent: app.accent
              fillHex: active ? "" : "#71717A"
              cutoutHex: active && app.shownColor === "black" ? "#F4F4F5" : "#19191C"
              eyeOpen: 1
            }
            Text {
              anchors.horizontalCenter: parent.horizontalCenter
              anchors.bottom: parent.bottom
              anchors.bottomMargin: 3
              width: parent.width - 4
              horizontalAlignment: Text.AlignHCenter
              text: modelData
              color: active ? "#F4F4F5" : "#71717A"
              font.pixelSize: 8
              font.bold: active
              elide: Text.ElideRight
              textFormat: Text.PlainText
            }
            MouseArea { anchors.fill: parent; onClicked: app.selectShape(modelData) }
          }
        }
      }

      Text {
        text: "COLOUR  ·  11 ACCENTS"
        color: "#71717A"
        font.pixelSize: 10
        font.bold: true
        font.family: "monospace"
        textFormat: Text.PlainText
      }

      Flow {
        width: parent.width
        spacing: 6
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
            MouseArea { anchors.fill: parent; onClicked: app.selectColor(modelData) }
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
          }
          MouseArea { anchors.fill: parent; onClicked: app.selectColor("omarchy") }
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
        text: "DESKTOP ANCHOR"
        color: "#71717A"
        font.pixelSize: 10
        font.bold: true
        font.family: "monospace"
        textFormat: Text.PlainText
      }

      Row {
        id: anchorRow
        width: parent.width
        spacing: 8
        property real pillW: (width - spacing * 3) / 4
        Repeater {
          model: [
            { "id": "br", "label": "Bottom R" },
            { "id": "bl", "label": "Bottom L" },
            { "id": "tr", "label": "Top R" },
            { "id": "tl", "label": "Top L" }
          ]
          delegate: Rectangle {
            required property var modelData
            readonly property bool active: app.anchorName === modelData.id
            width: anchorRow.pillW
            height: 36
            radius: 10
            color: active ? "#232327" : "#19191C"
            border.width: active ? 1.5 : 1
            border.color: active ? drawer.tone : "#26262A"
            Text {
              anchors.centerIn: parent
              text: modelData.label
              color: active ? "#F4F4F5" : "#A1A1AA"
              font.pixelSize: 11
              font.bold: active
              textFormat: Text.PlainText
            }
            MouseArea { anchors.fill: parent; onClicked: app.setAnchor(modelData.id) }
          }
        }
      }

      Text {
        text: "SIZE & DODGE"
        color: "#71717A"
        font.pixelSize: 10
        font.bold: true
        font.family: "monospace"
        textFormat: Text.PlainText
      }

      Flow {
        width: parent.width
        spacing: 8
        Repeater {
          model: ["small", "medium", "large"]
          delegate: Rectangle {
            required property string modelData
            width: sizeLabel.implicitWidth + 18
            height: 28
            radius: 10
            color: app.sizeName === modelData ? "#232327" : "#19191C"
            border.width: 1
            border.color: app.sizeName === modelData ? drawer.tone : "#26262A"
            Text {
              id: sizeLabel
              anchors.centerIn: parent
              text: modelData.charAt(0).toUpperCase() + modelData.slice(1)
              color: app.sizeName === modelData ? "#F4F4F5" : "#A1A1AA"
              font.pixelSize: 11
              font.bold: app.sizeName === modelData
              textFormat: Text.PlainText
            }
            MouseArea { anchors.fill: parent; onClicked: app.setSize(modelData) }
          }
        }
        Rectangle {
          width: dodgeLabel.implicitWidth + 18
          height: 28
          radius: 10
          color: app.dodgeOn ? "#232327" : "#19191C"
          border.width: 1
          border.color: app.dodgeOn ? drawer.tone : "#26262A"
          Text {
            id: dodgeLabel
            anchors.centerIn: parent
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
}
