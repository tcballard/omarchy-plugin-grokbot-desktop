"""Optional native smoke test: QT_QPA_PLATFORM=offscreen python3 tests/avatar-native.py.
Requires PySide6; verifies Qt rendering, not a hosted Omarchy session.
"""
import json
from pathlib import Path
import sys
import time
import subprocess
import PySide6
from PySide6.QtCore import QUrl, qInstallMessageHandler
from PySide6.QtGui import QGuiApplication
from PySide6.QtQuick import QQuickView

ROOT = Path(__file__).resolve().parent.parent
formatter = Path(PySide6.__file__).parent/'qmlformat'
for file in list(ROOT.glob('*.qml')) + list((ROOT/'qml').glob('*.qml')):
    result = subprocess.run([str(formatter), '-n', str(file)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
print('PASS QML syntax parsing')
messages = []
qInstallMessageHandler(lambda kind, context, message: messages.append(message))
app = QGuiApplication([])
view = QQuickView()
view.setColor('transparent')
view.setResizeMode(QQuickView.SizeRootObjectToView)
view.setSource(QUrl.fromLocalFile(str(ROOT/'OpenBotAvatar.qml')))
assert not view.errors(), view.errors()
view.resize(256, 256)
view.show()
item = view.rootObject()
for name in ('rocket', 'ghost'):
    definition = json.loads((ROOT/'data/avatars'/f'{name}.json').read_text())
    started = time.monotonic()
    item.setProperty('definition', definition)
    for _ in range(5):
        app.processEvents()
        time.sleep(.03)
    frame = item.property('frame').toVariant()
    assert frame['shapes'], 'Missing frame'
    image = view.grabWindow()
    assert not image.isNull(), 'No Qt frame captured'
    opaque = sum(image.pixelColor(x, y).alpha() > 0 for x in range(0,256,4) for y in range(0,256,4))
    assert 100 < opaque < 4096, opaque
    for x in (-1, 0, 1):
        item.setProperty('gazeX', x)
        item.setProperty('mood', 'happy' if x else 'thinking')
        app.processEvents()
        assert item.property('frame').toVariant()['shapes']
    print(f'{name}: Qt rendered {len(frame["shapes"])} shapes, {time.monotonic()-started:.2f}s including capture and gaze changes')
assert not messages, messages
print('PASS native Qt avatar smoke test')
