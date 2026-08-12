#!/usr/bin/env python3
"""커리어 대시보드 실행기.

    python3 run.py

엑셀 파일이 없으면 만들고, 로컬 서버를 띄우고, 브라우저를 연다.
서버는 127.0.0.1 에만 바인딩되므로 외부에서는 접근할 수 없다.
"""
from __future__ import annotations

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


def main() -> None:
    try:
        import uvicorn  # noqa: F401
    except ImportError:
        raise SystemExit(
            "필요한 패키지가 없습니다. 아래 명령으로 설치해 주세요:\n"
            "    python3 -m pip install fastapi uvicorn openpyxl"
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

    import uvicorn
    uvicorn.run("app:app", host=HOST, port=port, log_level="warning", reload=True)


if __name__ == "__main__":
    main()
