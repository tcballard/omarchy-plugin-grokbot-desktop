import QtQuick
import QtQuick.Controls

// Grok Bot popover. One card with two pages: the chat and, behind the
// sliders button, the appearance page. Roster text, replies, prompts, and
// links stay plain text.
Rectangle {
  id: bubble
  property var app: null
  property real maxHeight: 640
  readonly property bool appearancePage: app ? app.settingsOpen : false
  readonly property real pageHeight: appearancePage ? settingsPage.implicitHeight : column.implicitHeight
  implicitWidth: 464
  implicitHeight: Math.min(maxHeight, pageHeight + 28)
  radius: 22
  color: "#141416"
  border.width: 1
  border.color: "#27272A"
  clip: true

  readonly property var pinnedBots: {
    var wanted = [
      { key: "Bob", label: "Bob" },
      { key: "OmaBot", label: "OmaBot" },
      { key: "Poteto", label: "Poteto" },
      { key: "X Desk", label: "X Desk" },
      { key: "Inbox Admin", label: "Inbox" }
    ]
    var bots = app && app.bots ? app.bots : []
    var out = []
    var i
    var j
    for (i = 0; i < wanted.length; i++) {
      for (j = 0; j < bots.length; j++) {
        var bot = bots[j]
        var name = String(bot.shortName || bot.name || "")
        var inbox = wanted[i].key === "Inbox Admin" && name.indexOf("Inbox") === 0
        if (name === wanted[i].key || inbox) {
          out.push({
            id: String(bot.id || ""),
            label: wanted[i].label,
            shape: String(bot.avatarShape || "bean"),
            color: String(bot.avatarColor || "orange")
          })
          break
        }
      }
    }
    return out
  }

  readonly property var extraBots: {
    var bots = app && app.bots ? app.bots : []
    var pinned = bubble.pinnedBots
    var seen = {}
    var i
    for (i = 0; i < pinned.length; i++) seen[pinned[i].id] = true
    var out = []
    for (i = 0; i < bots.length; i++) {
      var bot = bots[i]
      var id = String(bot.id || "")
      if (seen[id]) continue
      out.push({
        id: id,
        label: String(bot.shortName || bot.name || "Bot"),
        shape: String(bot.avatarShape || "bean"),
        color: String(bot.avatarColor || "orange")
      })
    }
    return out
  }

  function focusPrompt() {
    promptField.forceActiveFocus()
    promptField.selectAll()
  }

  function activePin(id) {
    return app && id === app.chosenBotId
  }

  Timer {
    id: waveTimer
    interval: 70
    repeat: true
    running: voiceButton.dictating && bubble.visible
    onTriggered: voiceButton.wave = (voiceButton.wave + 0.45) % 6.28318
  }

  SettingsPanel {
    id: settingsPage
    app: bubble.app
    x: bubble.appearancePage ? 16 : bubble.width + 16
    y: 14
    width: bubble.width - 32
    height: bubble.height - 28
    visible: bubble.appearancePage || x < bubble.width
    Behavior on x { NumberAnimation { duration: 240; easing.type: Easing.OutCubic } }
  }

  Column {
    id: column
    x: bubble.appearancePage ? 16 - bubble.width : 16
    y: 14
    width: parent.width - 32
    spacing: 12
    visible: !bubble.appearancePage || x > -bubble.width + 16
    Behavior on x { NumberAnimation { duration: 240; easing.type: Easing.OutCubic } }

    Item {
      id: header
      width: parent.width
      height: 36

      Rectangle {
        id: slidersButton
        width: 32
        height: 32
        radius: 16
        anchors.verticalCenter: parent.verticalCenter
        color: app.settingsOpen ? "#232327" : "#1C1C1F"
        border.width: 1
        border.color: app.settingsOpen ? "#3F3F46" : "#2E2E32"
        Canvas {
          id: slidersIcon
          anchors.fill: parent
          anchors.margins: 7
          onPaint: {
            var ctx = getContext("2d")
            ctx.reset()
            ctx.lineCap = "round"
            ctx.lineWidth = 1.4
            ctx.strokeStyle = "#E4E4E7"
            var rows = [3, 9, 15]
            var knobs = [4, 14, 8]
            var i
            for (i = 0; i < 3; i++) {
              ctx.beginPath()
              ctx.moveTo(1, rows[i])
              ctx.lineTo(width - 1, rows[i])
              ctx.stroke()
              ctx.fillStyle = i === 1 ? "#5BC67A" : "#F4F4F5"
              ctx.beginPath()
              ctx.arc(knobs[i], rows[i], 2.1, 0, Math.PI * 2)
              ctx.fill()
            }
          }
          onWidthChanged: requestPaint()
        }
        MouseArea {
          anchors.fill: parent
          onClicked: app.settingsOpen ? app.closeSettings() : app.openSettings()
        }
      }

      Rectangle {
        id: minimizeButton
        width: 32
        height: 32
        radius: 16
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        color: "#1C1C1F"
        border.width: 1
        border.color: "#2E2E32"
        Canvas {
          anchors.fill: parent
          onPaint: {
            var ctx = getContext("2d")
            ctx.reset()
            ctx.strokeStyle = "#A1A1AA"
            ctx.lineWidth = 1.6
            ctx.lineCap = "round"
            ctx.beginPath()
            ctx.moveTo(width * 0.32, height / 2)
            ctx.lineTo(width * 0.68, height / 2)
            ctx.stroke()
          }
        }
        MouseArea {
          anchors.fill: parent
          onClicked: app.closeBubble()
        }
      }

      Rectangle {
        id: headerPill
        height: 36
        radius: 18
        anchors.horizontalCenter: parent.horizontalCenter
        color: "#1C1C1F"
        border.width: 1
        border.color: "#2E2E32"
        width: Math.min(parent.width - 80, headerRow.implicitWidth + 22)

        Row {
          id: headerRow
          x: 8
          spacing: 6
          height: parent.height
          CompanionMark {
            width: 22
            height: 22
            y: 7
            shapeFrom: app.shownShape
            shapeTo: app.shownShape
            morph: 1
            colorName: app.shownColor
            accent: app.accent
            cutoutHex: app.shownColor === "black" ? "#F4F4F5" : "#1C1C1F"
            expression: "idle"
            eyeOpen: 1
          }
          Text {
            y: 9
            text: app.botLabel()
            color: "#F4F4F5"
            font.pixelSize: 14
            font.bold: true
            textFormat: Text.PlainText
          }
          Text {
            y: 11
            text: "· " + app.botTag()
            color: "#A1A1AA"
            font.pixelSize: 12
            textFormat: Text.PlainText
          }
          Canvas {
            width: 12
            height: 12
            y: 12
            onPaint: {
              var ctx = getContext("2d")
              ctx.reset()
              ctx.strokeStyle = "#A1A1AA"
              ctx.lineWidth = 1.4
              ctx.lineCap = "round"
              ctx.lineJoin = "round"
              ctx.beginPath()
              ctx.moveTo(1.5, 4)
              ctx.lineTo(6, 8)
              ctx.lineTo(10.5, 4)
              ctx.stroke()
            }
          }
        }

        MouseArea {
          anchors.fill: parent
          onClicked: app.rosterExpanded = !app.rosterExpanded
        }
      }
    }

    Flow {
      id: pinRow
      width: parent.width
      spacing: 6

      Repeater {
        model: bubble.pinnedBots
        delegate: Rectangle {
          required property var modelData
          readonly property bool active: bubble.activePin(modelData.id)
          readonly property string plate: active ? "#232327" : "#1C1C1F"
          readonly property string eyePlate: modelData.color === "black" ? "#F4F4F5" : plate
          width: pinLabel.implicitWidth + 34
          height: 28
          radius: 14
          color: plate
          border.width: 1
          border.color: active ? "#3F3F46" : "#2E2E32"
          CompanionMark {
            x: 8
            y: 6
            width: 16
            height: 16
            shapeFrom: modelData.shape
            shapeTo: modelData.shape
            morph: 1
            colorName: modelData.color
            accent: app.accent
            cutoutHex: eyePlate
            eyeOpen: 1
          }
          Text {
            id: pinLabel
            x: 28
            y: 6
            text: modelData.label
            color: active ? "#F4F4F5" : "#A1A1AA"
            font.pixelSize: 11
            font.bold: active
            textFormat: Text.PlainText
          }
          MouseArea {
            anchors.fill: parent
            onClicked: app.selectBot(modelData.id)
          }
        }
      }

      Rectangle {
        visible: bubble.extraBots.length > 0
        width: extraLabel.implicitWidth + 18
        height: 28
        radius: 14
        color: app.rosterExpanded ? "#232327" : "#1C1C1F"
        border.width: 1
        border.color: "#2E2E32"
        Text {
          id: extraLabel
          anchors.centerIn: parent
          text: "+" + bubble.extraBots.length
          color: "#A1A1AA"
          font.pixelSize: 11
          font.bold: true
          textFormat: Text.PlainText
        }
        MouseArea {
          anchors.fill: parent
          onClicked: app.rosterExpanded = !app.rosterExpanded
        }
      }
    }

    Flow {
      width: parent.width
      spacing: 6
      visible: app.rosterExpanded && bubble.extraBots.length > 0
      Repeater {
        model: bubble.extraBots
        delegate: Rectangle {
          required property var modelData
          readonly property bool active: bubble.activePin(modelData.id)
          readonly property string plate: active ? "#232327" : "#1C1C1F"
          readonly property string eyePlate: modelData.color === "black" ? "#F4F4F5" : plate
          width: extraName.implicitWidth + 34
          height: 28
          radius: 14
          color: plate
          border.width: 1
          border.color: active ? "#3F3F46" : "#2E2E32"
          CompanionMark {
            x: 8
            y: 6
            width: 16
            height: 16
            shapeFrom: modelData.shape
            shapeTo: modelData.shape
            morph: 1
            colorName: modelData.color
            accent: app.accent
            cutoutHex: eyePlate
            eyeOpen: 1
          }
          Text {
            id: extraName
            x: 28
            y: 6
            text: modelData.label
            color: active ? "#F4F4F5" : "#A1A1AA"
            font.pixelSize: 11
            font.bold: active
            textFormat: Text.PlainText
          }
          MouseArea {
            anchors.fill: parent
            onClicked: app.selectBot(modelData.id)
          }
        }
      }
    }

    Rectangle {
      width: parent.width
      height: 1
      color: "#222226"
      visible: app.askedText !== "" || app.bubbleBody !== "" || app.noticeLinks.length > 0
    }

    Item {
      width: parent.width
      height: userBubble.height
      visible: app.askedText !== ""
      Rectangle {
        id: userBubble
        anchors.right: parent.right
        width: userText.width + 28
        height: userText.implicitHeight + 20
        radius: 18
        color: "#232327"
        border.width: 1
        border.color: "#2E2E32"
        Text {
          id: userText
          x: 14
          y: 10
          width: Math.min(300, bubble.width - 150)
          text: app.askedText
          color: "#F4F4F5"
          font.pixelSize: 13
          wrapMode: Text.WordWrap
          textFormat: Text.PlainText
        }
      }
    }

    Flickable {
      id: replyFlick
      width: parent.width
      height: Math.min(140, replyText.implicitHeight)
      contentHeight: replyText.implicitHeight
      clip: true
      visible: app.bubbleBody !== ""
      Text {
        id: replyText
        width: replyFlick.width
        text: app.bubbleBody
        color: "#F4F4F5"
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
          radius: 14
          color: "#19191C"
          border.width: 1
          border.color: "#2A2A2E"
          Text {
            id: linkLabel
            anchors.centerIn: parent
            text: modelData.label
            color: "#A1A1AA"
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

    Item {
      id: composer
      width: parent.width
      height: 42

      // The left button starts a new conversation. The right button is
      // dictation while the field is empty, send while it has text, and
      // stop while an ask is running; its icons crossfade between modes.
      Rectangle {
        id: plusButton
        readonly property bool usable: app ? !app.asking && (app.askedText !== "" || app.bubbleBody !== "" || app.noticeLinks.length > 0) : false
        width: 42
        height: 42
        radius: 21
        color: "#1C1C1F"
        border.width: 1
        border.color: "#2C2C30"
        opacity: usable ? 1 : 0.45
        Behavior on opacity { NumberAnimation { duration: 140 } }
        Rectangle {
          width: 14
          height: 1.6
          radius: 1
          anchors.centerIn: parent
          color: "#D4D4D8"
        }
        Rectangle {
          width: 1.6
          height: 14
          radius: 1
          anchors.centerIn: parent
          color: "#D4D4D8"
        }
        MouseArea {
          anchors.fill: parent
          enabled: plusButton.usable
          onClicked: app.newConversation()
        }
      }

      Rectangle {
        id: voiceButton
        readonly property bool dictating: app ? app.dictating : false
        property real wave: 0
        property string ink: dictating ? "#F28B30" : "#F4F4F5"
        readonly property bool asking: app ? app.asking : false
        readonly property string mode: asking ? "stop" : (promptField.text.trim() !== "" ? "send" : "voice")
        width: 42
        height: 42
        radius: 21
        anchors.right: parent.right
        color: mode === "send" ? "#F4F4F5" : "#232327"
        border.width: dictating && mode === "voice" ? 1.5 : 1
        border.color: mode === "send" ? "#F4F4F5" : (dictating ? (app ? app.accent : "#F28B30") : "#3F3F46")
        Behavior on color { ColorAnimation { duration: 120 } }

        Canvas {
          id: waveCanvas
          anchors.fill: parent
          opacity: voiceButton.mode === "voice" ? 1 : 0
          scale: voiceButton.mode === "voice" ? 1 : 0.6
          Behavior on opacity { NumberAnimation { duration: 120 } }
          Behavior on scale { NumberAnimation { duration: 160; easing.type: Easing.OutCubic } }
          onPaint: {
            var ctx = getContext("2d")
            ctx.reset()
            ctx.strokeStyle = voiceButton.ink
            ctx.lineCap = "round"
            ctx.lineWidth = 1.7
            var bars = [5, 11, 16, 9, 5]
            var i
            for (i = 0; i < bars.length; i++) {
              var scale = 1
              if (voiceButton.dictating)
                scale = 0.35 + 0.65 * Math.abs(Math.sin(voiceButton.wave + i * 0.9))
              var bar = bars[i] * scale
              var x = 12 + i * 4
              ctx.beginPath()
              ctx.moveTo(x, height / 2 - bar / 2)
              ctx.lineTo(x, height / 2 + bar / 2)
              ctx.stroke()
            }
          }
          onVisibleChanged: requestPaint()
        }

        Canvas {
          id: sendIcon
          anchors.fill: parent
          opacity: voiceButton.mode === "send" ? 1 : 0
          scale: voiceButton.mode === "send" ? 1 : 0.6
          Behavior on opacity { NumberAnimation { duration: 120 } }
          Behavior on scale { NumberAnimation { duration: 160; easing.type: Easing.OutCubic } }
          onPaint: {
            var ctx = getContext("2d")
            ctx.reset()
            ctx.strokeStyle = "#141416"
            ctx.lineWidth = 2
            ctx.lineCap = "round"
            ctx.lineJoin = "round"
            ctx.beginPath()
            ctx.moveTo(width / 2, height / 2 + 7)
            ctx.lineTo(width / 2, height / 2 - 7)
            ctx.moveTo(width / 2 - 6, height / 2 - 1)
            ctx.lineTo(width / 2, height / 2 - 7)
            ctx.lineTo(width / 2 + 6, height / 2 - 1)
            ctx.stroke()
          }
        }

        Rectangle {
          anchors.centerIn: parent
          width: 12
          height: 12
          radius: 3
          color: "#F4F4F5"
          opacity: voiceButton.mode === "stop" ? 1 : 0
          scale: voiceButton.mode === "stop" ? 1 : 0.6
          Behavior on opacity { NumberAnimation { duration: 120 } }
          Behavior on scale { NumberAnimation { duration: 160; easing.type: Easing.OutCubic } }
        }

        onDictatingChanged: waveCanvas.requestPaint()
        onWaveChanged: waveCanvas.requestPaint()
        onInkChanged: waveCanvas.requestPaint()

        MouseArea {
          anchors.fill: parent
          onClicked: {
            if (!app) return
            if (app.asking) {
              app.stopAsk()
              return
            }
            if (promptField.text.trim() !== "") {
              app.dictating = false
              app.submitPrompt(promptField.text)
              return
            }
            promptField.forceActiveFocus()
            app.dictating = !app.dictating
            app.toggleDictation()
          }
        }
      }

      Rectangle {
        anchors.left: plusButton.right
        anchors.right: voiceButton.left
        anchors.leftMargin: 8
        anchors.rightMargin: 8
        height: 42
        radius: 21
        color: "#19191C"
        border.width: 1
        border.color: "#2C2C30"

        TextField {
          id: promptField
          anchors.fill: parent
          anchors.leftMargin: 16
          anchors.rightMargin: 16
          topPadding: 0
          bottomPadding: 0
          verticalAlignment: TextInput.AlignVCenter
          placeholderText: app.asking ? "Asking…" : ("Ask " + app.botLabel())
          placeholderTextColor: "#71717A"
          text: app.promptDraft
          color: "#F4F4F5"
          font.pixelSize: 14
          selectByMouse: true
          onTextChanged: {
            if (text !== app.promptDraft) app.promptDraft = text
            // Superwhisper and Voxtype type the transcript when recording ends.
            if (app.dictating && text.trim() !== "") app.dictating = false
          }
          onAccepted: app.submitPrompt(text)
          Keys.onEscapePressed: app.closeBubble()
          background: Item {}
        }
      }
    }
  }
}
