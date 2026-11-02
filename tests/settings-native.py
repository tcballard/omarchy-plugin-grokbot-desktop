"""Render the real settings components and exercise their pointer navigation."""
import os
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

def click(label):
    settle()
    candidates = [item for item in descendants(root) if item.property('label') == label and item.isVisible() and item.isEnabled()]
    assert len(candidates) == 1, (label, len(candidates), root.property('settingsSection'), messages)
    item = candidates[0]
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
click('Custom avatar…')
assert root.property('settingsSection') == 'avatar'
capture('custom-avatar')
click('Back')
assert root.property('settingsSection') == 'appearance'
click('Back to settings')
click('Providers')
click('Hermes')
assert root.property('chosenBotId') == 'hermes:default'
capture('providers')
click('Connection settings')
capture('hermes-connection')
click('GrokBot')
assert root.property('chosenBotId') == 'bob'
assert not messages, messages
print('PASS native settings rendering, page navigation and provider selection')
