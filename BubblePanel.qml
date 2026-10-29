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
  // 0 shows the chat page and 1 the appearance page. Between them the page
  // leaving fades out and drifts aside before the one arriving fades in, on
  // the same curve and duration as the card's height.
  readonly property int pageMs: 260
  readonly property var pageCurve: [0.2, 0, 0, 1, 1, 1]
  property real pageT: appearancePage ? 1 : 0
  Behavior on pageT { NumberAnimation { duration: bubble.ms(bubble.pageMs); easing.type: Easing.BezierSpline; easing.bezierCurve: bubble.pageCurve } }
  // The card is exactly as tall as its page. Every part of the chat page
  // eases its own height when it appears, goes, or grows, so the card
  // follows without an animation of its own that would lag behind its
  // content; between pages it blends from one page's height to the other's.
  readonly property real chatHeight: Math.min(maxHeight, column.implicitHeight + 28)
  readonly property real appearanceHeight: Math.min(maxHeight, settingsPage.implicitHeight + 28)
  implicitWidth: 464
  implicitHeight: chatHeight + (appearanceHeight - chatHeight) * pageT
  height: implicitHeight
  // Above the mark the card grows upward, so each page is pinned to the
  // bottom edge by its own height and the card's top edge is what reveals
  // or covers it; below the mark, both are pinned to the top.
  property bool growsUp: true
  function pageY(pageHeight) {
    return bubble.growsUp ? bubble.height - 14 - pageHeight : 14
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

  // A bot with an unseen reply whose chip is folded away: the pill's
  // chevron carries the dot instead, so the reply isn't missed.
  readonly property bool unreadHidden: {
    var unread = app ? app.unreadBots : []
    if (unread.length === 0) return false
    if (!bubble.rosterShown) return true
    if (app.rosterExpanded) return false
    var extra = bubble.extraBots
    var i
    var j
    for (i = 0; i < unread.length; i++)
      for (j = 0; j < extra.length; j++) if (extra[j].id === unread[i]) return true
    return false
  }

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

  // What the tray and the note last showed, kept while they fold away so
  // they do not empty before they have gone.
  property var heldFiles: []
  property string heldNote: ""
  function holdAttachments() {
    if (!app) return
    if (app.pendingFiles.length > 0) bubble.heldFiles = app.pendingFiles
    if (app.attachNote !== "") bubble.heldNote = app.attachNote
  }
  Component.onCompleted: holdAttachments()
  Connections {
    target: bubble.app
    function onPendingFilesChanged() { bubble.holdAttachments() }
    function onAttachNoteChanged() { bubble.holdAttachments() }
    function onThreadBotIdChanged() { threadFade.restart() }
  }

  // Files dropped on the card are attached.
  DropArea {
    anchors.fill: parent
    keys: ["text/uri-list"]
    onDropped: function (drop) {
      var paths = []
      var i
      for (i = 0; i < drop.urls.length; i++) {
        var url = String(drop.urls[i])
        if (url.indexOf("file:///") === 0) paths.push(decodeURIComponent(url.slice(7)))
      }
      if (paths.length === 0) return
      app.attach("file", paths)
      drop.accept()
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
    x: 16 + 24 * (1 - bubble.pageT)
    y: bubble.pageY(height)
    width: bubble.width - 32
    height: Math.min(implicitHeight, bubble.maxHeight - 28)
    opacity: Math.max(0, (bubble.pageT - 0.35) / 0.65)
    visible: opacity > 0.01
  }

  Column {
    id: column
    x: 16 - 24 * bubble.pageT
    y: bubble.pageY(implicitHeight)
    width: parent.width - 32
    // Each part below the header brings its own gap, so the gap eases with it.
    spacing: 0
    opacity: Math.max(0, 1 - bubble.pageT / 0.65)
    visible: opacity > 0.01

    // The header and the bot row move as one, so the row folding away
    // takes its gap with it instead of snapping the card at the end.
    Column {
      id: headerGroup
      width: parent.width
      spacing: 0

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

          // A reply for a bot whose chip is folded away.
          Rectangle {
            visible: bubble.unreadHidden
            width: 10
            height: 10
            radius: 5
            x: parent.width - 10
            y: 0
            color: Theme.text
            border.width: 2
            border.color: Theme.surface
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
        Behavior on expand { NumberAnimation { duration: bubble.ms(bubble.pageMs); easing.type: Easing.BezierSpline; easing.bezierCurve: bubble.pageCurve } }
        Behavior on shown { NumberAnimation { duration: bubble.ms(bubble.pageMs); easing.type: Easing.BezierSpline; easing.bezierCurve: bubble.pageCurve } }
        width: parent.width
        height: rosterBlock.shown * (12 + pinRow.height + rosterBlock.expand * (6 + extraRow.implicitHeight))
        visible: rosterBlock.shown > 0.01
        opacity: rosterBlock.shown
        clip: true

        Flow {
          id: pinRow
          y: 12
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
          y: 12 + pinRow.height + 6
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
    }

    Reveal {
      id: dividerReveal
      shown: bubble.hasThread
      Rectangle {
        width: parent.width
        height: 1
        color: Theme.divider
      }
    }

    // The conversation with the bot on screen: earlier exchanges above, the
    // latest at the bottom, in one scrolling view with a fade at whichever
    // edge has more to read.
    Reveal {
      id: threadReveal
      shown: bubble.hasThread || (app && app.askingHere)
      Item {
        id: threadBox
        // Whatever the card has left once everything else on the page is
        // placed; it follows those parts as they ease in and out.
        readonly property real cap: Math.max(140, bubble.maxHeight - 28 - headerGroup.height - dividerReveal.height - threadReveal.gap - trayReveal.height - noteReveal.height - menuReveal.height - undoReveal.height - composerReveal.height)
        // The thread's height eases toward its content, so a question, the
        // typing dots, or a reply slides in instead of jumping the card, and
        // a cleared one folds away. While the thread itself is still
        // opening, its reveal does the easing.
        property real fit: threadColumn.implicitHeight
        Behavior on fit {
          enabled: threadReveal.t >= 0.999
          NumberAnimation { duration: bubble.ms(bubble.pageMs); easing.type: Easing.BezierSpline; easing.bezierCurve: bubble.pageCurve }
        }
        width: parent.width
        height: Math.min(cap, fit)

        Flickable {
          id: threadFlick
          anchors.fill: parent
          contentHeight: threadColumn.implicitHeight
          clip: true
          boundsBehavior: Flickable.StopAtBounds
          ScrollBar.vertical: ScrollBar { policy: threadFlick.contentHeight > threadFlick.height ? ScrollBar.AsNeeded : ScrollBar.AlwaysOff }
          onMovementStarted: scrollAnim.stop()

          NumberAnimation {
            id: scrollAnim
            target: threadFlick
            property: "contentY"
            duration: bubble.ms(bubble.pageMs)
            easing.type: Easing.BezierSpline
            easing.bezierCurve: bubble.pageCurve
          }

          Column {
            id: threadColumn
            width: threadFlick.width - 10
            spacing: 14
            // Another bot's conversation fades in when you switch to it.
            NumberAnimation on opacity {
              id: threadFade
              running: false
              from: 0
              to: 1
              duration: bubble.ms(200)
              easing.type: Easing.OutCubic
            }

            Repeater {
              model: app ? app.history : []
              delegate: Exchange {
                required property var modelData
                asked: modelData.asked || ""
                files: modelData.files || []
                body: modelData.body || ""
                links: modelData.links || []
                typing: (modelData.wait || "") !== "" && (modelData.body || "") === ""
              }
            }

            Exchange {
              id: latest
              fadeReply: true
              asked: app ? app.askedText : ""
              files: app ? app.askedFiles : []
              body: app ? app.bubbleBody : ""
              links: app ? app.noticeLinks : []
              typing: app ? (app.askingHere || app.waitingHere) && app.bubbleBody === "" : false
            }
          }

          // New content scrolls into view: the end of the thread, or the top
          // of the latest exchange when it is taller than the view, so a long
          // reply is read from its start. The end is measured against the
          // height the view is easing to, so while the thread still fits it
          // stays at the top and the view's growth reveals the new content;
          // once it is full, the scroll eases on the same curve.
          onContentHeightChanged: {
            var end = Math.max(0, contentHeight - Math.min(threadBox.cap, contentHeight))
            var target = Math.min(end, Math.max(0, latest.y))
            scrollAnim.stop()
            if (bubble.ms(1) === 0 || !threadBox.visible || Math.abs(target - contentY) < 1) {
              contentY = target
              return
            }
            scrollAnim.from = contentY
            scrollAnim.to = target
            scrollAnim.start()
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
    }

    // Files waiting to go with the next ask, each with a remove button,
    // and a line when attaching did not work. Both keep what they last
    // showed while they fold away.
    Reveal {
      id: trayReveal
      shown: app ? app.pendingFiles.length > 0 : false
      Flow {
        id: pendingRow
        width: parent.width
        spacing: 8
        Repeater {
          model: bubble.heldFiles
          delegate: Item {
            required property string modelData
            required property int index
            width: pending.width + 4
            height: 52
            Attachment {
              id: pending
              y: 4
              source: modelData
              size: 48
            }
            Rectangle {
              x: pending.width - 14
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
                label: "Remove " + app.fileLabel(modelData)
                onActivated: app.removeFile(index)
              }
            }
          }
        }
      }
    }

    Reveal {
      id: noteReveal
      shown: app ? app.attachNote !== "" : false
      Text {
        width: parent.width
        text: bubble.heldNote
        color: Theme.textMuted
        font.pixelSize: 12
        wrapMode: Text.WordWrap
        font.family: app.fontFamily
        textFormat: Text.PlainText
      }
    }

    // The + opens these two ways to attach something.
    Reveal {
      id: menuReveal
      shown: bubble.attachMenuOpen
      Column {
        id: attachMenu
        width: parent.width
        spacing: 4
        Repeater {
          model: [
            { label: "Paste image", mode: "paste" },
            { label: "Choose a file…", mode: "choose" }
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
    }

    // After a conversation is cleared, a chip offers it back for a few
    // seconds.
    Reveal {
      id: undoReveal
      shown: app ? app.undoShown : false
      Rectangle {
        id: undoChip
        anchors.horizontalCenter: parent.horizontalCenter
        width: undoText.implicitWidth + undoAction.implicitWidth + 40
        height: 30
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
    }

    Reveal {
      id: composerReveal
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
          readonly property bool usable: app ? !app.askingHere && !app.attaching && !app.choosingFiles && app.pendingFiles.length < app.fileLimit : false
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
            label: "Attach a file or image"
            onActivated: bubble.attachMenuOpen = !bubble.attachMenuOpen
          }
        }

        Rectangle {
          id: voiceButton
          readonly property bool dictating: app ? app.dictating : false
          property real wave: 0
          property string ink: dictating ? Theme.recording : Theme.text
          readonly property bool asking: app ? app.askingHere : false
          readonly property string mode: asking ? "stop" : (promptField.text.trim() !== "" || (app && app.pendingFiles.length > 0) ? "send" : "voice")
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
              if (promptField.text.trim() !== "" || app.pendingFiles.length > 0) {
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
  }

  // A part of the chat page that eases open and shut: its height, with the
  // gap above it, grows and shrinks on the page curve while it fades, so
  // nothing below or above it jumps.
  component Reveal: Item {
    id: reveal
    default property alias content: holder.data
    property bool shown: true
    property real gap: 12
    property real t: shown ? 1 : 0
    Behavior on t { NumberAnimation { duration: bubble.ms(bubble.pageMs); easing.type: Easing.BezierSpline; easing.bezierCurve: bubble.pageCurve } }
    width: parent ? parent.width : 0
    height: t * (gap + holder.height)
    visible: t > 0.001
    clip: t < 0.999
    Item {
      id: holder
      y: reveal.gap
      width: reveal.width
      height: childrenRect.height
      opacity: reveal.t
      enabled: reveal.shown
    }
  }

  // An attachment: an image cropped square inside a rounded frame (inset
  // far enough that its square corners stay inside the frame's curve, so no
  // masking layer is needed), or any other file as a chip with its name.
  component Attachment: Rectangle {
    id: thumb
    property string source: ""
    property real size: 44
    readonly property bool image: app ? app.isImageFile(thumb.source) : false
    width: image ? size : Math.min(200, fileName.implicitWidth + 40)
    height: size
    radius: 8
    color: Theme.field
    border.width: 1
    border.color: Theme.edge
    Image {
      anchors.fill: parent
      anchors.margins: 3
      visible: thumb.image
      source: thumb.image && thumb.source !== "" ? "file://" + thumb.source : ""
      fillMode: Image.PreserveAspectCrop
      asynchronous: true
      cache: false
      smooth: true
      mipmap: true
      sourceSize.width: thumb.size * 2
      sourceSize.height: thumb.size * 2
    }
    // A folded-corner page for a file that is not an image.
    Rectangle {
      visible: !thumb.image
      x: 12
      anchors.verticalCenter: parent.verticalCenter
      width: 12
      height: 15
      radius: 2
      color: "transparent"
      border.width: 1.4
      border.color: Theme.iconSoft
    }
    Text {
      id: fileName
      visible: !thumb.image
      x: 30
      width: Math.min(implicitWidth, 160)
      anchors.verticalCenter: parent.verticalCenter
      text: app ? app.fileLabel(thumb.source) : ""
      elide: Text.ElideMiddle
      color: Theme.text
      font.pixelSize: 12
      font.family: app.fontFamily
      textFormat: Text.PlainText
    }
  }

  // One exchange: what was asked, on the right, then the reply or notice as
  // selectable plain text with its link buttons. While an ask runs and
  // nothing has come back, three dots pulse where the reply will land.
  component Exchange: Column {
    id: exchange
    property string asked: ""
    property var files: []
    property string body: ""
    property var links: []
    property bool typing: false
    // The latest reply fades in where the typing dots were.
    property bool fadeReply: false
    width: parent ? parent.width : 0
    spacing: 10

    // Files that went with the question, above it on the right.
    Item {
      width: parent.width
      height: 64
      visible: exchange.files.length > 0
      Row {
        anchors.right: parent.right
        spacing: 6
        Repeater {
          model: exchange.files
          delegate: Attachment {
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
      onTextChanged: if (exchange.fadeReply && text !== "") replyFade.restart()
      NumberAnimation on opacity {
        id: replyFade
        running: false
        from: 0
        to: 1
        duration: bubble.ms(220)
        easing.type: Easing.OutCubic
      }
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
