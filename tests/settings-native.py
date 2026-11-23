"""Render the real settings components and exercise their pointer navigation."""
import os
import json
from pathlib import Path
import time
from PySide6.QtCore import QUrl, QPointF, Qt, qInstallMessageHandler
from PySide6.QtGui import QGuiApplication
from PySide6.QtQuick import QQuickView, QQuickItem
from PySide6.QtTest import QTest

ROOT = Path(__file__).resolve().parent.parent
messages = []
qInstallMessageHandler(lambda kind, context, message: messages.append(message))
app = QGuiApplication([])
view = QQuickView()
view.setResizeMode(QQuickView.SizeViewToRootObject)
view.setSource(QUrl.fromLocalFile(str(ROOT/'tests/settings-native.qml')))
assert not view.errors(), view.errors()
view.show()
root = view.rootObject()
def settle():
    for _ in range(5):
        app.processEvents()
        time.sleep(.02)
def descendants(item):
    yield item
    for child in item.childItems():
        yield from descendants(child)

def reveal(item):
    # Appearance content is taller than the settings card. Scroll each
    # Flickable ancestor so the control sits in the viewport before the click.
    parent = item.parentItem()
    while parent is not None:
        height = parent.property('contentHeight')
        offset = parent.property('contentY')
        if height is not None and offset is not None and parent.height() > 0 and height > parent.height():
            centre = item.mapToItem(parent, QPointF(0, item.height() / 2)).y()
            limit = max(0, height - parent.height())
            parent.setProperty('contentY', min(max(centre - parent.height() / 2, 0), limit))
        parent = parent.parentItem()

def click(label):
    settle()
    candidates = [item for item in descendants(root) if item.property('label') == label and item.isVisible() and item.isEnabled()]
    assert len(candidates) == 1, (label, len(candidates), root.property('settingsSection'), messages)
    item = candidates[0]
    reveal(item)
    settle()
    point = item.mapToScene(QPointF(item.width()/2, item.height()/2)).toPoint()
    QTest.mouseClick(view, Qt.LeftButton, Qt.NoModifier, point)
    settle()
def capture(name):
    settle()
    frame = view.grabWindow()
    assert not frame.isNull()
    folder = os.environ.get('SETTINGS_CAPTURE_DIR')
    if folder:
        Path(folder).mkdir(parents=True,exist_ok=True)
        frame.save(str(Path(folder)/f'{name}.png'))

capture('settings')
click('Appearance')
assert root.property('settingsSection') == 'appearance'
capture('appearance')
click('Selected workspace')
assert root.property('workspaceMode') == 'selected'
click('Workspace 2')
assert root.property('workspaceNumber') == 2
capture('workspace')
click('All workspaces')
assert root.property('workspaceMode') == 'all'
click('Behaviour')
click('Hyper')
assert root.property('motionName') == 'hyper'
capture('behaviour')
click('Appearance')
click('Custom avatar…')
assert root.property('settingsSection') == 'avatar'
root.setProperty('sampleAvatar', json.loads((ROOT/'data/avatars/rocket.json').read_text()))
click('Generate avatar')
capture('custom-avatar')
click('Apply to Bob the Bot')
assert root.property('draftApplied') is True
click('Back to appearance')
assert root.property('settingsSection') == 'appearance'
click('Providers')
click('Hermes')
assert root.property('chosenBotId') == 'hermes:default'
capture('providers')
click('Connection settings')
capture('hermes-connection')
click('GrokBot')
assert root.property('chosenBotId') == 'bob'
click('Appearance')
click('Use agent’s appearance')
assert root.property('syncOn') is False
root.setProperty('width', 480)
capture('compact-settings')
click('Providers')
click('Hermes')
assert root.property('chosenBotId') == 'hermes:default'
click('Close settings')
assert root.property('cardPage') == 'chat'
assert not messages, messages
print('PASS native settings rendering, page navigation and provider selection')
