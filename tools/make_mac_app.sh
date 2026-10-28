#!/bin/bash
# 데스크톱 실행 아이콘(.app)을 만든다.
#
#   bash tools/make_mac_app.sh              ~/Desktop 에 만든다
#   bash tools/make_mac_app.sh ~/Applications
#
# 만들어진 앱은 stay-open 애플릿이라 **Dock 에 떠 있는 동안 서버가 살아 있고,
# 앱을 종료하면 서버도 내려간다.** 실행·종료의 실제 동작은 launch_mac.sh 가 한다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-$HOME/Desktop}"
APP="$DEST/커리어 대시보드.app"
LAUNCH="$ROOT/tools/launch_mac.sh"
ICON="$ROOT/tools/app_icon.icns"

[ -f "$LAUNCH" ] || { echo "런처가 없습니다: $LAUNCH" >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# on quit 이 있어야 앱 종료가 서버 종료로 이어진다. -s (stay-open) 가 그 전제다.
cat > "$tmp/app.applescript" <<EOS
on run
	do shell script "/bin/bash " & quoted form of "$LAUNCH"
end run

on quit
	-- 앱을 끄면 서버도 내린다. 실패해도 앱은 닫혀야 하므로 오류를 삼킨다.
	try
		do shell script "/bin/bash " & quoted form of "$LAUNCH" & " --stop"
	end try
	continue quit
end quit
EOS

rm -rf "$APP"
osacompile -s -o "$APP" "$tmp/app.applescript"

if [ -f "$ICON" ]; then
  cp "$ICON" "$APP/Contents/Resources/applet.icns"
fi
/usr/libexec/PlistBuddy -c "Set :CFBundleIconFile applet" "$APP/Contents/Info.plist" >/dev/null 2>&1 \
  || /usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string applet" "$APP/Contents/Info.plist" >/dev/null
/usr/libexec/PlistBuddy -c "Set :CFBundleName 커리어 대시보드" "$APP/Contents/Info.plist" >/dev/null 2>&1 \
  || /usr/libexec/PlistBuddy -c "Add :CFBundleName string 커리어 대시보드" "$APP/Contents/Info.plist" >/dev/null
# LSUIElement 는 넣지 않는다 — Dock 에 보여야 거기서 종료할 수 있다.
/usr/libexec/PlistBuddy -c "Delete :LSUIElement" "$APP/Contents/Info.plist" >/dev/null 2>&1 || true

touch "$APP"
echo "만들었습니다: $APP"
echo "  실행: 더블클릭 → 서버가 뜨고 브라우저가 열립니다 (앱은 Dock 에 남습니다)"
echo "  종료: Dock 아이콘 우클릭 → 종료  또는  ⌘Q — 서버도 함께 내려갑니다"
