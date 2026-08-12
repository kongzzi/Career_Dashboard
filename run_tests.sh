#!/bin/sh
# 회귀 테스트 전부 — 파이썬(store.py)과 자바스크립트(core.js) 양쪽.
#
#     ./run_tests.sh
#
# 사용자의 data/career.xlsx 는 읽기만 한다. 쓰기 테스트는 임시 폴더 안에서만 돈다.
set -e
cd "$(dirname "$0")"

echo "── store.py (python) ─────────────────────────────"
python3 -m unittest discover -s tests

echo
echo "── core.js (node) ────────────────────────────────"
node --test "tests/**/*.mjs"
