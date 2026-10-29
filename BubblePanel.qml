import QtQuick
import QtQuick.Controls
import "qml/theme.js" as Theme

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
  // Height eases so a reply, an error, or a page change grows the card.
  height: shownHeight
  property real shownHeight: implicitHeight
  // Above the mark the card grows upward, so its content stays pinned to the
  // bottom edge and the header is what slides into view.
  property bool growsUp: true
  readonly property real growOffset: growsUp ? Math.min(0, height - implicitHeight) : 0
  Behavior on shownHeight {
    // The roster unfold already eases the height; chasing it would lag.
    enabled: rosterBlock.expand <= 0 || rosterBlock.expand >= 1
    NumberAnimation { duration: bubble.ms(200); easing.type: Easing.OutCubic }
  }
  radius: 22
  color: Theme.surface
  border.width: 1
  border.color: Theme.lifted
  clip: true

  // The primary bot plus the three most recently used, shown in roster
  // order so chips do not reshuffle as you switch between them.
  // Once a conversation has started the bot row folds away; the header pill
  // becomes the switch button and unfolds every bot until one is picked.
  readonly property bool hasThread: app ? (app.history.length > 0 || app.askedText !== "" || app.bubbleBody !== "" || app.noticeLinks.length > 0) : false
  readonly property bool inThread: app ? (app.askingHere || bubble.hasThread) : false
  readonly property bool rosterShown: !bubble.inThread || (app ? app.rosterExpanded : false)

  function pickBot(id) {
    app.selectBot(id)
    if (bubble.inThread) app.rosterExpanded = false
  }

  readonly property var pinnedBots: {
    var bots = app && app.bots ? app.bots : []
    var wanted = {}
    var count = 0
    var primary = app ? app.primaryBot() : null
    if (primary) { wanted[primary.id] = true; count++ }
    var recent = app ? app.recentBots : []
    var i
    for (i = 0; i < recent.length && count < 4; i++) {
      if (wanted[recent[i]] || !app.findBot(recent[i])) continue
      wanted[recent[i]] = true
      count++
    }
    for (i = 0; i < bots.length && count < 4; i++) {
      if (wanted[bots[i].id]) continue
      wanted[bots[i].id] = true
      count++
    }
    var out = []
    for (i = 0; i < bots.length; i++) {
      var bot = bots[i]
      if (!wanted[bot.id]) continue
      out.push({
        id: String(bot.id || ""),
        label: String(bot.shortName || bot.name || "Bot"),
        shape: String(bot.avatarShape || "bean"),
        color: String(bot.avatarColor || "orange")
      })
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

  function ms(value) { return app && app.reduceMotion ? 0 : value }

  function focusPrompt() {
    promptField.forceActiveFocus()
    promptField.selectAll()
  }

  // Ctrl+V attaches an image when the clipboard holds one; otherwise the
  // helper reports none and the text is pasted as usual.
  function pasteText() {
    promptField.forceActiveFocus()
    promptField.paste()
  }

  property bool attachMenuOpen: false

  // Image files dropped on the card are attached.
  DropArea {
    anchors.fill: parent
    keys: ["text/uri-list"]
    onDropped: function (drop) {
      var i
      for (i = 0; i < drop.urls.length; i++) {
        var url = String(drop.urls[i])
        if (/^file:\/\/.+\.(png|jpe?g|webp|gif)$/i.test(url)) {
          app.attach("file", decodeURIComponent(url.slice(7)))
          drop.accept()
          return
        }
      }
    }
  }

  function activePin(id) {
    return app && id === app.chosenBotId
  }

  FrameAnimation {
    running: voiceButton.dictating && bubble.visible && !(app && app.reduceMotion)
    onTriggered: voiceButton.wave = (voiceButton.wave + frameTime * 6.4) % 6.28318
  }

  SettingsPanel {
    id: settingsPage
    app: bubble.app
    x: bubble.appearancePage ? 16 : bubble.width + 16
    y: 14
    width: bubble.width - 32
    height: bubble.height - 28
    visible: bubble.appearancePage || x < bubble.width
    Behavior on x { NumberAnimation { duration: bubble.ms(240); easing.type: Easing.OutCubic } }
  }

  Column {
    id: column
    x: bubble.appearancePage ? 16 - bubble.width : 16
    y: 14 + bubble.growOffset
    width: parent.width - 32
    spacing: 12
    visible: !bubble.appearancePage || x > -bubble.width + 16
    Behavior on x { NumberAnimation { duration: bubble.ms(240); easing.type: Easing.OutCubic } }

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
        color: app.settingsOpen ? Theme.selected : Theme.raised
        border.width: 1
        border.color: app.settingsOpen ? Theme.edgeStrong : Theme.edge
        Canvas {
          id: slidersIcon
          anchors.fill: parent
          anchors.margins: 7
          onPaint: {
            var ctx = getContext("2d")
            ctx.reset()
            ctx.lineCap = "round"
            ctx.lineWidth = 1.4
            ctx.strokeStyle = Theme.icon
            var rows = [3, 9, 15]
            var knobs = [4, 14, 8]
            var i
            for (i = 0; i < 3; i++) {
              ctx.beginPath()
              ctx.moveTo(1, rows[i])
              ctx.lineTo(width - 1, rows[i])
              ctx.stroke()
              ctx.fillStyle = i === 1 ? Theme.ok : Theme.text
              ctx.beginPath()
              ctx.arc(knobs[i], rows[i], 2.1, 0, Math.PI * 2)
              ctx.fill()
            }
          }
          onWidthChanged: requestPaint()
        }
        HoverArea {
          label: "Appearance"
          onActivated: app.settingsOpen ? app.closeSettings() : app.openSettings()
        }
      }

      Rectangle {
        id: minimizeButton
        width: 32
        height: 32
        radius: 16
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        color: Theme.raised
        border.width: 1
        border.color: Theme.edge
        Canvas {
          anchors.fill: parent
          onPaint: {
            var ctx = getContext("2d")
            ctx.reset()
            ctx.strokeStyle = Theme.textMuted
            ctx.lineWidth = 1.6
            ctx.lineCap = "round"
            ctx.beginPath()
            ctx.moveTo(width * 0.32, height / 2)
            ctx.lineTo(width * 0.68, height / 2)
            ctx.stroke()
          }
        }
        HoverArea {
          label: "Close"
          onActivated: app.closeBubble()
        }
      }

      Rectangle {
        id: headerPill
        height: 36
        radius: 18
        anchors.horizontalCenter: parent.horizontalCenter
        color: Theme.raised
        border.width: 1
        border.color: Theme.edge
        width: Math.min(parent.width - 80, headerRow.implicitWidth + 22)

        Row {
          id: headerRow
          x: 8
          spacing: 6
          height: parent.height
          // Name, mark, chevron, padding, and spacing come out of the pill's
          // widest size; the role takes what is left and elides.
          readonly property real roleRoom: header.width - 80 - 22 - 8 - 22 - 12 - 6 * 3 - nameText.implicitWidth
          CompanionMark {
            width: 22
            height: 22
            y: 7
            shapeFrom: app.shapeFrom
            shapeTo: app.shapeTo
            morph: app.morphProgress
            face: app.shownFace
            eyeSet: app.shownEyes
            stemOverride: app.shownStem
            colorFromName: app.colorFrom
            colorName: app.colorTo
            mixFromColors: app.morphFromPoints !== null
            fillFrom: app.fillFrom
            eyeFrom: app.eyeFrom
            accent: app.accent
            cutoutHex: Theme.raised
            expression: "idle"
            eyeOpen: 1
          }
          Text {
            id: nameText
            y: 9
            text: app.botLabel()
            color: Theme.text
            font.pixelSize: 14
            font.weight: Font.DemiBold
            font.family: app.fontFamily
            textFormat: Text.PlainText
          }
          // The pill names the bot; its role slides out only while the
          // pointer or keyboard focus is on the pill.
          Text {
            readonly property real shown: pillArea.containsMouse || pillArea.activeFocus ? 1 : 0
            property real reveal: shown
            Behavior on reveal { NumberAnimation { duration: bubble.ms(180); easing.type: Easing.OutCubic } }
            y: 11
            visible: reveal > 0.01
            opacity: reveal
            width: reveal * Math.max(0, Math.min(implicitWidth, headerRow.roleRoom))
            text: "· " + app.botTag()
            color: Theme.textMuted
            font.pixelSize: 12
            elide: Text.ElideRight
            font.family: app.fontFamily
            textFormat: Text.PlainText
          }
          Canvas {
            width: 12
            height: 12
            y: 12
            rotation: app.rosterExpanded ? 180 : 0
            Behavior on rotation { NumberAnimation { duration: bubble.ms(200); easing.type: Easing.OutCubic } }
            onPaint: {
              var ctx = getContext("2d")
              ctx.reset()
              ctx.strokeStyle = Theme.textMuted
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

        HoverArea {
          id: pillArea
          label: bubble.inThread ? (app.rosterExpanded ? "Hide bots" : "Switch bot") : (app.rosterExpanded ? "Show fewer bots" : "Show all bots")
          onActivated: app.rosterExpanded = !app.rosterExpanded
        }
      }
    }

    // The extra bots unfold below the pinned row; the block's height eases
    // open so the card grows instead of jumping.
    Item {
      id: rosterBlock
      property real expand: app.rosterExpanded && bubble.extraBots.length > 0 ? 1 : 0
      property real shown: bubble.rosterShown ? 1 : 0
      Behavior on expand { NumberAnimation { duration: bubble.ms(220); easing.type: Easing.OutCubic } }
      Behavior on shown { NumberAnimation { duration: bubble.ms(220); easing.type: Easing.OutCubic } }
      width: parent.width
      height: rosterBlock.shown * (pinRow.height + rosterBlock.expand * (6 + extraRow.implicitHeight))
      visible: rosterBlock.shown > 0.01
      opacity: rosterBlock.shown
      clip: true

      Flow {
        id: pinRow
        width: parent.width
        spacing: 6

        Repeater {
          model: bubble.pinnedBots
          delegate: Rectangle {
            required property var modelData
            readonly property bool active: bubble.activePin(modelData.id)
            readonly property string plate: active ? Theme.lifted : Theme.raised
            readonly property string eyePlate: plate
            width: pinLabel.width + 34
            height: 28
            radius: 14
            color: plate
            border.width: active ? 1.5 : 1
            border.color: active ? app.ringColor(app.paletteFill(modelData.color)) : Theme.edge
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
              width: Math.min(implicitWidth, 120)
              elide: Text.ElideRight
              text: modelData.label
              color: active ? Theme.text : Theme.textMuted
              font.pixelSize: 11
              font.weight: active ? Font.DemiBold : Font.Normal
              font.family: app.fontFamily
              textFormat: Text.PlainText
            }
            // A reply from this bot that has not been seen yet.
            Rectangle {
              visible: app.unreadBots.indexOf(modelData.id) >= 0
              width: 9
              height: 9
              radius: 4.5
              x: parent.width - 9
              y: 0
              color: Theme.text
              border.width: 2
              border.color: Theme.surface
            }
            HoverArea {
              label: modelData.label
              onActivated: bubble.pickBot(modelData.id)
            }
          }
        }

        Rectangle {
          visible: bubble.extraBots.length > 0 && !bubble.inThread
          width: extraLabel.implicitWidth + 18
          height: 28
          radius: 14
          color: app.rosterExpanded ? Theme.selected : Theme.raised
          border.width: 1
          border.color: Theme.edge
          Text {
            id: extraLabel
            anchors.centerIn: parent
            text: app.rosterExpanded ? "Less" : "+" + bubble.extraBots.length
            color: Theme.textMuted
            font.pixelSize: 11
            font.weight: Font.DemiBold
            font.family: app.fontFamily
            textFormat: Text.PlainText
          }
          HoverArea {
            label: app.rosterExpanded ? "Show fewer bots" : "Show all bots"
            onActivated: app.rosterExpanded = !app.rosterExpanded
          }
        }
      }

      Flow {
        id: extraRow
        y: pinRow.height + 6
        width: parent.width
        spacing: 6
        opacity: rosterBlock.expand
        enabled: rosterBlock.expand > 0.5
        Repeater {
          model: bubble.extraBots
          delegate: Rectangle {
            required property var modelData
            readonly property bool active: bubble.activePin(modelData.id)
            readonly property string plate: active ? Theme.lifted : Theme.raised
            readonly property string eyePlate: plate
            width: extraName.implicitWidth + 34
            height: 28
            radius: 14
            color: plate
            border.width: active ? 1.5 : 1
            border.color: active ? app.ringColor(app.paletteFill(modelData.color)) : Theme.edge
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
              color: active ? Theme.text : Theme.textMuted
              font.pixelSize: 11
              font.weight: active ? Font.DemiBold : Font.Normal
              font.family: app.fontFamily
              textFormat: Text.PlainText
            }
            // A reply from this bot that has not been seen yet.
            Rectangle {
              visible: app.unreadBots.indexOf(modelData.id) >= 0
              width: 9
              height: 9
              radius: 4.5
              x: parent.width - 9
              y: 0
              color: Theme.text
              border.width: 2
              border.color: Theme.surface
            }
            HoverArea {
              label: modelData.label
              onActivated: bubble.pickBot(modelData.id)
            }
          }
        }
      }
    }

    Rectangle {
      width: parent.width
      height: 1
      color: Theme.divider
      visible: bubble.hasThread
    }

    // The conversation with the bot on screen: earlier exchanges above, the
    // latest at the bottom, in one scrolling view with a fade at whichever
    // edge has more to read.
    Item {
      id: threadBox
      // Whatever the card has left once the header, divider, and composer
      // are placed.
      readonly property real cap: Math.max(140, bubble.maxHeight - 28 - header.height - rosterBlock.height - 1 - composer.height - column.spacing * 3)
      width: parent.width
      height: Math.min(cap, threadColumn.implicitHeight)
      visible: bubble.hasThread || (app && app.askingHere)

      Flickable {
        id: threadFlick
        anchors.fill: parent
        contentHeight: threadColumn.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        ScrollBar.vertical: ScrollBar { policy: threadFlick.contentHeight > threadFlick.height ? ScrollBar.AsNeeded : ScrollBar.AlwaysOff }

        Column {
          id: threadColumn
          width: threadFlick.width - 10
          spacing: 14

          Repeater {
            model: app ? app.history : []
            delegate: Exchange {
              required property var modelData
              asked: modelData.asked || ""
              images: modelData.images || []
              body: modelData.body || ""
              links: modelData.links || []
            }
          }

          Exchange {
            id: latest
            asked: app ? app.askedText : ""
            images: app ? app.askedImages : []
            body: app ? app.bubbleBody : ""
            links: app ? app.noticeLinks : []
            typing: app ? app.askingHere && app.bubbleBody === "" : false
          }
        }

        // New content scrolls into view: the end of the thread, or the top
        // of the latest exchange when it is taller than the view, so a long
        // reply is read from its start.
        onContentHeightChanged: {
          var end = Math.max(0, contentHeight - height)
          contentY = Math.min(end, Math.max(0, latest.y))
        }
      }

      Rectangle {
        width: parent.width - 10
        height: 16
        opacity: threadFlick.contentY > 1 ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: bubble.ms(120) } }
        gradient: Gradient {
          GradientStop { position: 0; color: Theme.surface }
          GradientStop { position: 1; color: Theme.surfaceClear }
        }
      }

      Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width - 10
        height: 16
        opacity: threadFlick.contentY + threadFlick.height < threadFlick.contentHeight - 1 ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: bubble.ms(120) } }
        gradient: Gradient {
          GradientStop { position: 0; color: Theme.surfaceClear }
          GradientStop { position: 1; color: Theme.surface }
        }
      }
    }

    // Images waiting to go with the next ask, each with a remove button,
    // and a line when attaching did not work.
    Item {
      width: parent.width
      height: pendingRow.height
      visible: app ? app.pendingImages.length > 0 : false
      Row {
        id: pendingRow
        spacing: 8
        Repeater {
          model: app ? app.pendingImages : []
          delegate: Item {
            required property string modelData
            required property int index
            width: 52
            height: 52
            Thumb {
              y: 4
              source: modelData
              size: 48
            }
            Rectangle {
              x: 34
              width: 18
              height: 18
              radius: 9
              color: Theme.raised
              border.width: 1
              border.color: Theme.edgeStrong
              Text {
                anchors.centerIn: parent
                text: "×"
                color: Theme.text
                font.pixelSize: 12
                font.family: app.fontFamily
                textFormat: Text.PlainText
              }
              HoverArea {
                label: "Remove image"
                onActivated: app.removeImage(index)
              }
            }
          }
        }
      }
    }

    Text {
      width: parent.width
      visible: app ? app.attachNote !== "" : false
      text: app ? app.attachNote : ""
      color: Theme.textMuted
      font.pixelSize: 12
      wrapMode: Text.WordWrap
      font.family: app.fontFamily
      textFormat: Text.PlainText
    }

    // The + opens these two ways to attach an image.
    Column {
      id: attachMenu
      width: parent.width
      spacing: 4
      visible: bubble.attachMenuOpen
      Repeater {
        model: [
          { label: "Screenshot an area", mode: "screenshot" },
          { label: "Paste image from clipboard", mode: "paste" }
        ]
        delegate: Rectangle {
          required property var modelData
          width: attachMenu.width
          height: 34
          radius: 10
          color: Theme.raised
          border.width: 1
          border.color: Theme.edge
          Text {
            x: 14
            anchors.verticalCenter: parent.verticalCenter
            text: modelData.label
            color: Theme.text
            font.pixelSize: 13
            font.family: app.fontFamily
            textFormat: Text.PlainText
          }
          HoverArea {
            label: modelData.label
            onActivated: {
              bubble.attachMenuOpen = false
              app.attach(modelData.mode)
            }
          }
        }
      }
    }

    // After a conversation is cleared, a chip offers it back for a few
    // seconds.
    Rectangle {
      id: undoChip
      readonly property bool shown: app ? app.undoShown : false
      anchors.horizontalCenter: parent.horizontalCenter
      width: undoText.implicitWidth + undoAction.implicitWidth + 40
      height: shown ? 30 : 0
      visible: shown
      radius: 15
      color: Theme.raised
      border.width: 1
      border.color: Theme.edge
      Text {
        id: undoText
        x: 14
        anchors.verticalCenter: parent.verticalCenter
        text: "Conversation cleared"
        color: Theme.textMuted
        font.pixelSize: 12
        font.family: app.fontFamily
        textFormat: Text.PlainText
      }
      Text {
        id: undoAction
        anchors.left: undoText.right
        anchors.leftMargin: 12
        anchors.verticalCenter: parent.verticalCenter
        text: "Undo"
        color: Theme.link
        font.pixelSize: 12
        font.weight: Font.DemiBold
        font.family: app.fontFamily
        textFormat: Text.PlainText
      }
      HoverArea {
        label: "Undo clearing the conversation"
        onActivated: app.undoClear()
      }
    }

    Item {
      id: composer
      width: parent.width
      // The field grows with a long prompt, up to six lines, then scrolls.
      readonly property real fieldHeight: Math.max(42, Math.min(promptField.implicitHeight, promptField.oneLine * 6 + promptField.topPadding + promptField.bottomPadding))
      height: fieldHeight
      Behavior on height { NumberAnimation { duration: bubble.ms(120); easing.type: Easing.OutCubic } }

      // The left button attaches an image. The right button is dictation
      // while the field is empty, send while it has text, and stop while an
      // ask is running; its icons crossfade between modes.
      Rectangle {
        id: attachButton
        readonly property bool usable: app ? !app.askingHere && !app.attaching && app.pendingImages.length < app.imageLimit : false
        anchors.bottom: parent.bottom
        width: 42
        height: 42
        radius: 21
        color: bubble.attachMenuOpen ? Theme.selected : Theme.raised
        border.width: 1
        border.color: Theme.edgeField
        opacity: usable ? 1 : 0.45
        Behavior on opacity { NumberAnimation { duration: bubble.ms(140) } }
        Rectangle {
          width: 14
          height: 1.6
          radius: 1
          anchors.centerIn: parent
          color: Theme.iconSoft
        }
        Rectangle {
          width: 1.6
          height: 14
          radius: 1
          anchors.centerIn: parent
          color: Theme.iconSoft
          rotation: bubble.attachMenuOpen ? 90 : 0
          Behavior on rotation { NumberAnimation { duration: bubble.ms(160); easing.type: Easing.OutCubic } }
        }
        HoverArea {
          enabled: attachButton.usable
          label: "Attach an image"
          onActivated: bubble.attachMenuOpen = !bubble.attachMenuOpen
        }
      }

      Rectangle {
        id: voiceButton
        readonly property bool dictating: app ? app.dictating : false
        property real wave: 0
        property string ink: dictating ? Theme.recording : Theme.text
        readonly property bool asking: app ? app.askingHere : false
        readonly property string mode: asking ? "stop" : (promptField.text.trim() !== "" || (app && app.pendingImages.length > 0) ? "send" : "voice")
        width: 42
        height: 42
        radius: 21
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        color: mode === "send" ? Theme.text : Theme.selected
        // Another bot's ask is running; this one's send waits for it.
        opacity: mode === "send" && app && app.asking && !app.askingHere ? 0.45 : 1
        Behavior on opacity { NumberAnimation { duration: bubble.ms(140) } }
        border.width: dictating && mode === "voice" ? 1.5 : 1
        border.color: mode === "send" ? Theme.text : (dictating ? (app ? app.accent : Theme.recording) : Theme.edgeStrong)
        Behavior on color { ColorAnimation { duration: bubble.ms(120) } }

        Canvas {
          id: waveCanvas
          anchors.fill: parent
          opacity: voiceButton.mode === "voice" ? 1 : 0
          scale: voiceButton.mode === "voice" ? 1 : 0.6
          Behavior on opacity { NumberAnimation { duration: bubble.ms(120) } }
          Behavior on scale { NumberAnimation { duration: bubble.ms(160); easing.type: Easing.OutCubic } }
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
          Behavior on opacity { NumberAnimation { duration: bubble.ms(120) } }
          Behavior on scale { NumberAnimation { duration: bubble.ms(160); easing.type: Easing.OutCubic } }
          onPaint: {
            var ctx = getContext("2d")
            ctx.reset()
            ctx.strokeStyle = Theme.surface
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
          color: Theme.text
          opacity: voiceButton.mode === "stop" ? 1 : 0
          scale: voiceButton.mode === "stop" ? 1 : 0.6
          Behavior on opacity { NumberAnimation { duration: bubble.ms(120) } }
          Behavior on scale { NumberAnimation { duration: bubble.ms(160); easing.type: Easing.OutCubic } }
        }

        onDictatingChanged: waveCanvas.requestPaint()
        onWaveChanged: waveCanvas.requestPaint()
        onInkChanged: waveCanvas.requestPaint()

        HoverArea {
          label: voiceButton.mode === "stop" ? "Stop" : (voiceButton.mode === "send" ? "Send" : "Dictate")
          tint: voiceButton.mode !== "send"
          onActivated: {
            if (!app) return
            if (app.askingHere) {
              app.stopAsk()
              return
            }
            if (promptField.text.trim() !== "" || app.pendingImages.length > 0) {
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
        anchors.left: attachButton.right
        anchors.right: voiceButton.left
        anchors.leftMargin: 8
        anchors.rightMargin: 8
        anchors.bottom: parent.bottom
        height: composer.fieldHeight
        radius: 21
        color: Theme.field
        border.width: 1
        border.color: Theme.edgeField

        // Long prompts wrap instead of scrolling sideways, so the whole
        // prompt is visible before it is sent. Enter sends; Shift+Enter
        // starts a new line.
        Flickable {
          id: promptFlick
          anchors.fill: parent
          anchors.leftMargin: 16
          anchors.rightMargin: 10
          clip: true
          boundsBehavior: Flickable.StopAtBounds
          contentWidth: width
          contentHeight: promptField.implicitHeight
          TextArea.flickable: TextArea {
            id: promptField
            readonly property real oneLine: Math.ceil(fontMetrics.height)
            topPadding: 11
            bottomPadding: 11
            leftPadding: 0
            rightPadding: 6
            wrapMode: TextArea.Wrap
            // One ask runs at a time; another bot's draft waits for it.
            placeholderText: app.askingHere ? "Asking…" : (app.asking ? ("Waiting for " + app.askingLabel() + " to answer…") : ("Ask " + app.botLabel()))
            placeholderTextColor: Theme.textFaint
            font.family: app.fontFamily
            text: app.promptDraft
            color: Theme.text
            font.pixelSize: 14
            selectByMouse: true
            textFormat: TextEdit.PlainText
            background: Item {}
            FontMetrics {
              id: fontMetrics
              font: promptField.font
            }
            onTextChanged: {
              if (text !== app.promptDraft) app.promptDraft = text
              // Superwhisper and Voxtype type the transcript when recording ends.
              if (app.dictating && text.trim() !== "") app.dictating = false
            }
            // Keep the caret in view while the field scrolls.
            onCursorRectangleChanged: {
              var r = cursorRectangle
              if (r.y < promptFlick.contentY) promptFlick.contentY = r.y
              else if (r.y + r.height + bottomPadding > promptFlick.contentY + promptFlick.height)
                promptFlick.contentY = r.y + r.height + bottomPadding - promptFlick.height
            }
            Keys.onPressed: function (event) {
              if (event.key === Qt.Key_V && (event.modifiers & Qt.ControlModifier) && !(event.modifiers & Qt.ShiftModifier)) {
                event.accepted = true
                if (app.attach("paste", "quiet") !== "ok") promptField.paste()
              }
            }
            Keys.onReturnPressed: function (event) { promptField.returnKey(event) }
            Keys.onEnterPressed: function (event) { promptField.returnKey(event) }
            Keys.onEscapePressed: app.stepBack()

            function returnKey(event) {
              if (event.modifiers & Qt.ShiftModifier) {
                event.accepted = false
                return
              }
              event.accepted = true
              app.submitPrompt(text)
            }
          }
        }
      }
    }
  }

  // An attached image, cropped square inside a rounded frame. The image is
  // inset far enough that its square corners stay inside the frame's
  // curve, so no masking layer is needed.
  component Thumb: Rectangle {
    id: thumb
    property string source: ""
    property real size: 44
    width: size
    height: size
    radius: 8
    color: Theme.field
    border.width: 1
    border.color: Theme.edge
    Image {
      anchors.fill: parent
      anchors.margins: 3
      source: thumb.source !== "" ? "file://" + thumb.source : ""
      fillMode: Image.PreserveAspectCrop
      asynchronous: true
      cache: false
      smooth: true
      mipmap: true
      sourceSize.width: thumb.size * 2
      sourceSize.height: thumb.size * 2
    }
  }

  // One exchange: what was asked, on the right, then the reply or notice as
  // selectable plain text with its link buttons. While an ask runs and
  // nothing has come back, three dots pulse where the reply will land.
  component Exchange: Column {
    id: exchange
    property string asked: ""
    property var images: []
    property string body: ""
    property var links: []
    property bool typing: false
    width: parent ? parent.width : 0
    spacing: 10

    // Images that went with the question, above it on the right.
    Item {
      width: parent.width
      height: 64
      visible: exchange.images.length > 0
      Row {
        anchors.right: parent.right
        spacing: 6
        Repeater {
          model: exchange.images
          delegate: Thumb {
            required property string modelData
            source: modelData
            size: 64
          }
        }
      }
    }

    Item {
      width: parent.width
      height: userBubble.height
      visible: exchange.asked !== ""
      Rectangle {
        id: userBubble
        anchors.right: parent.right
        width: userText.width + 28
        height: userText.implicitHeight + 20
        radius: 18
        color: Theme.selected
        border.width: 1
        border.color: Theme.edge
        Text {
          id: userText
          x: 14
          y: 10
          width: Math.min(implicitWidth, bubble.width - 120)
          text: exchange.asked
          color: Theme.text
          font.pixelSize: 13
          wrapMode: Text.WordWrap
          font.family: app.fontFamily
          textFormat: Text.PlainText
        }
      }
    }

    Item {
      id: typing
      width: parent.width
      height: 18
      visible: exchange.typing
      property real phase: 0
      FrameAnimation {
        running: typing.visible && !(app && app.reduceMotion)
        onTriggered: typing.phase = (typing.phase + frameTime * 5) % (Math.PI * 2)
      }
      Row {
        anchors.verticalCenter: parent.verticalCenter
        spacing: 5
        Repeater {
          model: 3
          delegate: Rectangle {
            required property int index
            width: 7
            height: 7
            radius: 3.5
            color: Theme.textMuted
            opacity: 0.35 + 0.65 * Math.max(0, Math.sin(typing.phase - index * 0.7))
            y: -2 * Math.max(0, Math.sin(typing.phase - index * 0.7))
          }
        }
      }
    }

    TextEdit {
      width: parent.width
      visible: exchange.body !== ""
      text: exchange.body
      readOnly: true
      selectByMouse: true
      color: Theme.text
      selectionColor: Theme.edgeStrong
      selectedTextColor: Theme.text
      font.pixelSize: 13
      wrapMode: TextEdit.Wrap
      font.family: app.fontFamily
      textFormat: TextEdit.PlainText
    }

    Flow {
      width: parent.width
      spacing: 6
      visible: exchange.links.length > 0
      Repeater {
        model: exchange.links
        delegate: Rectangle {
          required property var modelData
          width: linkLabel.implicitWidth + 18
          height: 28
          radius: 14
          color: Theme.field
          border.width: 1
          border.color: Theme.edgeLink
          Text {
            id: linkLabel
            anchors.centerIn: parent
            text: modelData.label
            color: Theme.textMuted
            font.pixelSize: 12
            font.family: app.fontFamily
            textFormat: Text.PlainText
          }
          HoverArea {
            label: modelData.label
            onActivated: app.openLink(modelData.url)
          }
        }
      }
    }
  }
}
