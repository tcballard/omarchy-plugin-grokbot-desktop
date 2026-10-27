import QtQuick
import QtQuick.Controls

// Speech bubble. Every string that comes from a bot, a prompt, or IPC is plain text.
Rectangle {
  id: bubble
  property var app: null
  implicitWidth: 340
  implicitHeight: column.implicitHeight + 28
  radius: 18
  color: Qt.rgba(app.paperR, app.paperG, app.paperB, 0.96)
  border.width: 1
  border.color: Qt.rgba(1, 1, 1, 0.14)

  function focusPrompt() {
    promptField.forceActiveFocus()
    promptField.selectAll()
  }

  Column {
    id: column
    x: 14
    y: 14
    width: 312
    spacing: 10

    Item {
      id: pill
      width: parent.width
      height: 36

      Row {
      width: parent.width
      height: 36
      spacing: 8

      CompanionMark {
        width: 28
        height: 28
        shapeFrom: app.shownShape
        shapeTo: app.shownShape
        morph: 1
        colorName: app.shownColor
        accent: app.accent
        expression: "idle"
        eyeOpen: 1
      }

      Column {
        width: parent.width - 36
        y: 4
        spacing: 1
        Text {
          width: parent.width
          text: app.botLabel()
          color: app.ink
          font.pixelSize: 14
          font.bold: true
          elide: Text.ElideRight
          textFormat: Text.PlainText
        }
        Text {
          width: parent.width
          text: app.botRole()
          color: app.inkSoft
          font.pixelSize: 11
          elide: Text.ElideRight
          textFormat: Text.PlainText
        }
      }

      }

      MouseArea {
        anchors.fill: parent
        onClicked: app.switcherOpen = !app.switcherOpen
      }
    }

    Flow {
      width: parent.width
      spacing: 6
      visible: app.switcherOpen
      Repeater {
        model: app.bots
        delegate: Rectangle {
          required property var modelData
          width: chip.implicitWidth + 16
          height: 26
          radius: 13
          color: modelData.id === app.chosenBotId ? app.accent : Qt.rgba(1, 1, 1, 0.06)
          Text {
            id: chip
            anchors.centerIn: parent
            text: modelData.shortName || modelData.name
            color: modelData.id === app.chosenBotId ? "#1a120c" : app.ink
            font.pixelSize: 11
            textFormat: Text.PlainText
          }
          MouseArea {
            anchors.fill: parent
            onClicked: app.selectBot(modelData.id)
          }
        }
      }
    }

    Flickable {
      id: replyFlick
      width: parent.width
      height: Math.min(120, replyText.implicitHeight)
      contentHeight: replyText.implicitHeight
      clip: true
      visible: app.bubbleBody !== ""
      Text {
        id: replyText
        width: replyFlick.width
        text: app.bubbleBody
        color: app.ink
        font.pixelSize: 13
        wrapMode: Text.WordWrap
        textFormat: Text.PlainText
      }
    }

    Flow {
      width: parent.width
      spacing: 6
      visible: app.noticeLinks.length > 0
      Repeater {
        model: app.noticeLinks
        delegate: Rectangle {
          required property var modelData
          width: linkLabel.implicitWidth + 18
          height: 28
          radius: 8
          color: app.accent
          Text {
            id: linkLabel
            anchors.centerIn: parent
            text: modelData.label
            color: "#1a120c"
            font.pixelSize: 12
            textFormat: Text.PlainText
          }
          MouseArea {
            anchors.fill: parent
            onClicked: app.openLink(modelData.url)
          }
        }
      }
    }

    Row {
      width: parent.width
      spacing: 8
      TextField {
        id: promptField
        width: parent.width - 40
        height: 36
        placeholderText: app.asking ? "Asking…" : ("Ask " + app.botLabel())
        text: app.promptDraft
        color: app.ink
        font.pixelSize: 13
        selectByMouse: true
        onTextChanged: if (text !== app.promptDraft) app.promptDraft = text
        onAccepted: app.submitPrompt(text)
        Keys.onEscapePressed: app.closeBubble()
        background: Rectangle {
          radius: 10
          color: Qt.rgba(0, 0, 0, 0.18)
          border.color: Qt.rgba(1, 1, 1, 0.12)
        }
      }
      Rectangle {
        width: 32
        height: 32
        radius: 10
        color: gearArea.containsMouse ? Qt.rgba(1, 1, 1, 0.12) : Qt.rgba(1, 1, 1, 0.05)
        Text {
          anchors.centerIn: parent
          text: "⚙"
          color: app.ink
          font.pixelSize: 14
          textFormat: Text.PlainText
        }
        MouseArea {
          id: gearArea
          anchors.fill: parent
          hoverEnabled: true
          onClicked: app.openSettings()
        }
      }
    }
  }
}
