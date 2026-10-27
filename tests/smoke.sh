#!/usr/bin/env bash
# Portable smoke: the repository checks, then qmllint on the plugin QML.
set -euo pipefail
cd "$(dirname "$0")/.."
./tests/run
QMLLINT="$(command -v qmllint || true)"
if [[ -z "${QMLLINT}" && -x /usr/lib/qt6/bin/qmllint ]]; then
  QMLLINT=/usr/lib/qt6/bin/qmllint
fi
if [[ -z "${QMLLINT}" ]]; then
  echo "qmllint is not installed" >&2
  exit 1
fi
# Unqualified ids are the house style. This Qt install is missing jsroot.qmltypes,
# so builtins such as Timer are unresolved here. Main.qml is parsed with Quickshell
# types unresolved, so unknown-property checks there wait for an Omarchy host.
"${QMLLINT}" --unqualified info --import info --type info CompanionMark.qml BubblePanel.qml SettingsPanel.qml
"${QMLLINT}" --unqualified info --import info --type info --property info Main.qml
