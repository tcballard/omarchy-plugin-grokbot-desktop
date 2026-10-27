import QtQuick

// Appearance and bot drawer. Opens from the gear, the right-click menu, or IPC.
Rectangle {
  id: drawer
  property var app: null
  radius: 18
  color: Qt.rgba(app.paperR, app.paperG, app.paperB, 0.97)
  border.width: 1
  border.color: Qt.rgba(1, 1, 1, 0.14)

  Flickable {
    id: flick
    anchors.fill: parent
    anchors.margins: 14
    contentHeight: body.implicitHeight
    clip: true
    boundsBehavior: Flickable.StopAtBounds

    Column {
      id: body
      width: flick.width
      spacing: 12

      Text {
        text: "Appearance & bots"
        color: app.ink
        font.pixelSize: 15
        font.bold: true
        textFormat: Text.PlainText
      }

      Row {
        spacing: 8
        Rectangle {
          width: 18
          height: 18
          radius: 5
          border.color: app.inkSoft
          color: app.syncOn ? app.accent : "transparent"
          MouseArea { anchors.fill: parent; onClicked: app.setSync(!app.syncOn) }
        }
        Text {
          text: app.syncOn ? "Sync appearance from active Bot" : "Custom appearance"
          color: app.ink
          font.pixelSize: 12
          anchors.verticalCenter: parent.verticalCenter
          textFormat: Text.PlainText
        }
      }

      Flow {
        width: parent.width
        spacing: 6
        Repeater {
          model: app.bots
          delegate: Rectangle {
            required property var modelData
            width: botChip.implicitWidth + 14
            height: 24
            radius: 12
            color: modelData.id === app.chosenBotId ? app.accent : Qt.rgba(1, 1, 1, 0.06)
            Text {
              id: botChip
              anchors.centerIn: parent
              text: modelData.shortName || modelData.name
              color: modelData.id === app.chosenBotId ? "#1a120c" : app.ink
              font.pixelSize: 11
              textFormat: Text.PlainText
            }
            MouseArea { anchors.fill: parent; onClicked: app.selectBot(modelData.id) }
          }
        }
      }

      Text {
        text: "Shape"
        color: app.inkSoft
        font.pixelSize: 11
        textFormat: Text.PlainText
      }

      Grid {
        width: parent.width
        columns: 5
        rowSpacing: 6
        columnSpacing: 6
        Repeater {
          model: app.shapeNames
          delegate: Rectangle {
            required property string modelData
            width: 48
            height: 48
            radius: 10
            color: modelData === app.shownShape ? Qt.rgba(1, 1, 1, 0.1) : "transparent"
            border.color: modelData === app.shownShape ? app.accent : Qt.rgba(1, 1, 1, 0.06)
            CompanionMark {
              anchors.fill: parent
              anchors.margins: 4
              shapeFrom: modelData
              shapeTo: modelData
              morph: 1
              colorName: app.shownColor
              accent: app.accent
              eyeOpen: 1
            }
            MouseArea { anchors.fill: parent; onClicked: app.selectShape(modelData) }
          }
        }
      }

      Text {
        text: "Colour"
        color: app.inkSoft
        font.pixelSize: 11
        textFormat: Text.PlainText
      }

      Flow {
        width: parent.width
        spacing: 6
        Repeater {
          model: app.colorNames
          delegate: Rectangle {
            required property string modelData
            width: 22
            height: 22
            radius: 11
            border.width: modelData === app.shownColor ? 2 : 1
            border.color: modelData === app.shownColor ? app.ink : Qt.rgba(0, 0, 0, 0.35)
            color: modelData === "omarchy" ? app.accent : app.paletteFill(modelData)
            MouseArea { anchors.fill: parent; onClicked: app.selectColor(modelData) }
          }
        }
      }

      Text {
        text: "Size"
        color: app.inkSoft
        font.pixelSize: 11
        textFormat: Text.PlainText
      }

      Row {
        spacing: 6
        Repeater {
          model: ["small", "medium", "large"]
          delegate: Rectangle {
            required property string modelData
            width: sizeLabel.implicitWidth + 16
            height: 26
            radius: 8
            color: app.sizeName === modelData ? app.accent : Qt.rgba(1, 1, 1, 0.06)
            Text {
              id: sizeLabel
              anchors.centerIn: parent
              text: modelData.charAt(0).toUpperCase() + modelData.slice(1)
              color: app.sizeName === modelData ? "#1a120c" : app.ink
              font.pixelSize: 12
              textFormat: Text.PlainText
            }
            MouseArea { anchors.fill: parent; onClicked: app.setSize(modelData) }
          }
        }
      }

      Row {
        spacing: 8
        Rectangle {
          width: 18
          height: 18
          radius: 5
          border.color: app.inkSoft
          color: app.dodgeOn ? app.accent : "transparent"
          MouseArea { anchors.fill: parent; onClicked: app.setDodge(!app.dodgeOn) }
        }
        Text {
          text: "Dodge the pointer"
          color: app.ink
          font.pixelSize: 12
          anchors.verticalCenter: parent.verticalCenter
          textFormat: Text.PlainText
        }
      }

      Row {
        spacing: 8
        Rectangle {
          width: 18
          height: 18
          radius: 5
          border.color: app.inkSoft
          color: app.idleOn ? app.accent : "transparent"
          MouseArea { anchors.fill: parent; onClicked: app.setIdle(!app.idleOn) }
        }
        Text {
          text: "Idle motion"
          color: app.ink
          font.pixelSize: 12
          anchors.verticalCenter: parent.verticalCenter
          textFormat: Text.PlainText
        }
      }
    }
  }
}
