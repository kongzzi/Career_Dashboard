#!/bin/bash
# 커리어 대시보드 런처 (macOS)
#
#   bash tools/launch_mac.sh           서버가 없으면 띄우고 브라우저를 연다
#   bash tools/launch_mac.sh --stop    서버를 내린다
#
# 데스크톱 앱(.app)이 이 스크립트를 부른다. GUI 에서 실행되면 로그인 셸을 거치지 않아
# PATH 에 pyenv·homebrew 가 없다. 그래서 파이썬을 절대경로로 찾는다.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT=8765
URL="http://127.0.0.1:${PORT}/"
LOG="$ROOT/data/launcher.log"

say_error() {
  # GUI 로 띄우면 터미널이 없어 메시지가 보이지 않는다 — 대화상자로 알린다
  /usr/bin/osascript -e "display dialog \"$1\" with title \"커리어 대시보드\" buttons {\"확인\"} default button 1 with icon stop" >/dev/null 2>&1
  echo "$1" >&2
  exit 1
}

find_python() {
  # .venv 가 있으면 그게 가장 확실하다 (의존성이 이미 들어 있음)
  [ -x "$ROOT/.venv/bin/python3" ] && { echo "$ROOT/.venv/bin/python3"; return; }
  for p in /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
    [ -x "$p" ] && { echo "$p"; return; }
  done
  command -v python3 2>/dev/null
}

# 우리 서버가 이미 떠 있나 — 포트만 보면 남의 프로세스일 수 있어 API 로 확인한다
is_running() {
  /usr/bin/curl -fsS --max-time 2 "${URL}api/bootstrap" >/dev/null 2>&1
}

if [ "${1:-}" = "--stop" ]; then
  is_running || { echo "떠 있는 서버가 없습니다."; exit 0; }
  # 포트를 쥔 프로세스를 직접 찾는다. pkill -f "run.py" 는 다른 프로젝트의
  # 같은 이름 스크립트까지 잡을 수 있어 쓰지 않는다.
  pid="$(/usr/sbin/lsof -nP -ti:"$PORT" -sTCP:LISTEN 2>/dev/null | head -1)"
  [ -n "$pid" ] || say_error "포트 $PORT 를 쓰는 프로세스를 찾지 못했습니다."
  case "$(ps -o command= -p "$pid" 2>/dev/null)" in
    *run.py*) kill "$pid" ;;
    *) say_error "포트 $PORT 를 쓰는 건 이 도구가 아닙니다. 그대로 두었습니다." ;;
  esac
  sleep 1
  is_running && say_error "서버를 내리지 못했습니다." || echo "서버를 내렸습니다."
  exit 0
fi

if is_running; then
  # 두 번 눌러도 서버가 하나 더 뜨지 않게 — run.py 는 포트가 차 있으면 8766 으로 올라간다
  open "$URL"
  exit 0
fi

PY="$(find_python)"
[ -n "${PY:-}" ] || say_error "파이썬을 찾지 못했습니다.\n\nhttps://www.python.org 에서 설치한 뒤 다시 시도해 주세요."

"$PY" -c 'import fastapi, uvicorn, openpyxl' 2>/dev/null || say_error \
  "필요한 패키지가 없습니다.\n\n터미널에서 아래를 실행해 주세요:\n\ncd $ROOT\npython3 -m pip install -r requirements.txt"

mkdir -p "$(dirname "$LOG")"
{ echo; echo "=== $(date '+%Y-%m-%d %H:%M:%S') 시작 ($PY) ==="; } >>"$LOG"

cd "$ROOT" || say_error "폴더를 찾지 못했습니다: $ROOT"
nohup "$PY" run.py --no-browser >>"$LOG" 2>&1 &

# 서버가 올라올 때까지 기다린다 (첫 실행은 엑셀을 만드느라 조금 걸린다)
for _ in $(seq 1 40); do
  is_running && { open "$URL"; exit 0; }
  sleep 0.5
done

say_error "서버가 뜨지 않았습니다.\n\n로그: $LOG"
