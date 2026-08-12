#!/usr/bin/env python3
"""커리어 대시보드 실행기.

    python3 run.py

엑셀 파일이 없으면 만들고, 로컬 서버를 띄우고, 브라우저를 연다.
서버는 127.0.0.1 에만 바인딩되므로 외부에서는 접근할 수 없다.
"""
from __future__ import annotations

import importlib.util
import socket
import sys
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "server"))

HOST = "127.0.0.1"
DEFAULT_PORT = 8765


def find_port(start: int) -> int:
    for port in range(start, start + 40):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((HOST, port))
                return port
            except OSError:
                continue
    raise SystemExit("빈 포트를 찾지 못했습니다.")


REQUIRED = ("fastapi", "uvicorn", "openpyxl")


def main() -> None:
    # 클론 직후 첫 실행에서 가장 흔한 실패라, 세 개를 한 번에 알려 준다
    # (하나씩 트레이스백으로 마주치게 하지 않는다).
    missing = [m for m in REQUIRED if importlib.util.find_spec(m) is None]
    if missing:
        raise SystemExit(
            f"필요한 패키지가 없습니다: {', '.join(missing)}\n"
            "아래 명령으로 설치해 주세요:\n"
            "    python3 -m pip install -r requirements.txt"
        )

    import store

    path = store.ensure_workbook()
    port = find_port(DEFAULT_PORT)
    url = f"http://{HOST}:{port}/"

    print("─" * 58)
    print("  커리어 대시보드")
    print(f"  데이터 파일 : {path}")
    print(f"  주소        : {url}")
    print("  종료        : 이 터미널에서 Ctrl+C")
    print("─" * 58)

    if "--no-browser" not in sys.argv:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()

    # 자동 리로드는 쓰지 않는다 — 개발용이고, 켜 두면 서버가 하위 프로세스로 갈라져
    # Ctrl+C 와 종료가 지저분해진다. 서버 코드를 고쳤으면 직접 재시작할 것.
    import uvicorn
    from app import app as api
    uvicorn.run(api, host=HOST, port=port, log_level="warning")


if __name__ == "__main__":
    main()
