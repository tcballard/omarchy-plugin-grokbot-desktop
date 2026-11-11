import QtQuick
import QtQuick.Controls
import Quickshell.Io

TextArea {
  id: editor
  ContextMenu.menu: null
  textFormat: TextEdit.PlainText
  property bool singleLine: false
  function safePaste() {
    if (!enabled || readOnly || transfer.running) return
    transfer.running = true
  }
  Keys.onPressed: function(event) {
    if (event.matches(StandardKey.Paste)) {
      event.accepted = true
      safePaste()
    } else if (singleLine && (event.key === Qt.Key_Return || event.key === Qt.Key_Enter)) {
      event.accepted = true
    }
  }
  MouseArea {
    anchors.fill: parent
    acceptedButtons: Qt.MiddleButton
    onClicked: editor.safePaste()
  }
  Process {
    id: transfer
    command: ["/usr/bin/python3", "-I", Qt.resolvedUrl("bin/grokbot-paste-text").toString().replace(/^file:\/\//, "")]
    stdout: StdioCollector { id: captured }
    onExited: function(code) {
      if (code !== 0 || !editor.enabled || editor.readOnly) return
      var value
      try { value = JSON.parse(captured.text) } catch (error) { return }
      if (editor.singleLine) value = value.replace(/[\r\n]+/g, " ")
      var start = editor.selectionStart
      editor.remove(start, editor.selectionEnd)
      editor.insert(start, value)
    }
  }
}
