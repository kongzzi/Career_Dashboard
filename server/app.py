"""로컬 전용 API 서버. 엑셀 파일을 읽어 대시보드에 넘기고, 대시보드의 편집을 엑셀에 되쓴다."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

sys.path.insert(0, str(Path(__file__).resolve().parent))

import store  # noqa: E402
from schema import (  # noqa: E402
    ASSIGNMENT_FIELDS, FIELDS, PAYROLL_FIELDS, SETTINGS, SUBTYPE_BY_CATEGORY, TAX_TYPE_RATE, WEEKDAY_NAMES,
)

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"

app = FastAPI(title="Career Dashboard")


@app.middleware("http")
async def no_cache(request, call_next):
    """로컬 전용 도구이므로 항상 최신 파일을 내려준다."""
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/bootstrap")
def bootstrap():
    data = store.read_all()
    data["schema"] = {
        "fields": FIELDS,
        "payroll_fields": PAYROLL_FIELDS,
        "assignment_fields": ASSIGNMENT_FIELDS,
        "subtype_by_category": SUBTYPE_BY_CATEGORY,
        "tax_type_rate": TAX_TYPE_RATE,
        "weekday_names": WEEKDAY_NAMES,
        "setting_labels": {s["key"]: s["label"] for s in SETTINGS},
    }
    return data


def _excel_error(exc: Exception):
    return JSONResponse(
        status_code=423,
        content={
            "detail": "엑셀 파일에 쓸 수 없습니다. Excel에서 career.xlsx를 열어 두었다면 "
                      f"닫은 뒤 다시 시도해 주세요. ({exc})"
        },
    )


@app.post("/api/records")
def save_record(payload: dict = Body(...)):
    """id가 있으면 수정, 없으면 신규."""
    data = store.read_all()
    records = data["records"]
    payroll = data["payroll"]
    rec = store.normalize_amounts(
        store.normalize_span({f["key"]: payload.get(f["key"], "") for f in FIELDS}))
    rid = str(rec.get("id") or "").strip()
    if rid:
        for i, r in enumerate(records):
            if str(r.get("id")) == rid:
                records[i] = rec
                break
        else:
            records.append(rec)
    else:
        rec["id"] = data["next_id"]
        records.append(rec)

    # 월정액 계약은 달별 급여 행이 있어야 정산이 된다 — 없으면 만들어 준다.
    # 이미 있으면 손대지 않는다(사용자가 채운 실수령액을 지우면 안 되므로).
    changed_payroll = None
    if rec.get("pay_type") == "월정액(연봉제)":
        mine = [p for p in payroll if str(p.get("record_id")) == str(rec["id"])]
        if not mine:
            generated = store.generate_payroll(rec)
            if generated:
                changed_payroll = payroll + generated
    try:
        return store.write_records(records, payroll=changed_payroll)
    except PermissionError as e:
        return _excel_error(e)


@app.post("/api/records/bulk")
def save_records(payload: dict = Body(...)):
    records = payload.get("records")
    if not isinstance(records, list):
        raise HTTPException(400, "records 배열이 필요합니다")
    normalized = [
        store.normalize_amounts(store.normalize_span({f["key"]: r.get(f["key"], "") for f in FIELDS}))
        for r in records
    ]
    next_num = int(store.read_all()["next_id"][1:])
    for r in normalized:
        if not str(r.get("id") or "").strip():
            r["id"] = f"R{next_num:04d}"
            next_num += 1
    try:
        return store.write_records(normalized)
    except PermissionError as e:
        return _excel_error(e)


@app.delete("/api/records/{rid}")
def delete_record(rid: str):
    data = store.read_all()
    records = [r for r in data["records"] if str(r.get("id")) != rid]
    try:
        return store.write_records(records)
    except PermissionError as e:
        return _excel_error(e)


@app.post("/api/payroll")
def save_payroll(payload: dict = Body(...)):
    """특정 일감의 달별 급여를 통째로 교체한다."""
    rid = str(payload.get("record_id") or "").strip()
    rows = payload.get("rows")
    if not rid or not isinstance(rows, list):
        raise HTTPException(400, "record_id와 rows가 필요합니다")
    data = store.read_all()
    others = [p for p in data["payroll"] if str(p.get("record_id")) != rid]
    mine = [{**{f["key"]: r.get(f["key"], "") for f in PAYROLL_FIELDS}, "record_id": rid} for r in rows]
    try:
        return store.write_records(data["records"], payroll=others + mine)
    except PermissionError as e:
        return _excel_error(e)


@app.post("/api/payroll/generate")
def regenerate_payroll(payload: dict = Body(...)):
    """계약 기간·월 지급액으로 달별 급여를 다시 만든다.
    이미 입금완료로 표시한 달은 그대로 두고, 없는 달만 채운다."""
    rid = str(payload.get("record_id") or "").strip()
    data = store.read_all()
    rec = next((r for r in data["records"] if str(r.get("id")) == rid), None)
    if not rec:
        raise HTTPException(404, "일감을 찾을 수 없습니다")
    mine = {str(p.get("month")): p for p in data["payroll"] if str(p.get("record_id")) == rid}
    others = [p for p in data["payroll"] if str(p.get("record_id")) != rid]
    merged = []
    for row in store.generate_payroll(rec):
        old = mine.get(row["month"])
        merged.append(old if old and (old.get("status") == "입금완료" or old.get("net")) else row)
    try:
        return store.write_records(data["records"], payroll=others + merged)
    except PermissionError as e:
        return _excel_error(e)


@app.post("/api/assignments")
def save_assignments(payload: dict = Body(...)):
    """특정 일감의 담당 과목·분반을 통째로 교체한다."""
    rid = str(payload.get("record_id") or "").strip()
    rows = payload.get("rows")
    if not rid or not isinstance(rows, list):
        raise HTTPException(400, "record_id와 rows가 필요합니다")
    data = store.read_all()
    others = [a for a in data["assignments"] if str(a.get("record_id")) != rid]
    mine = [{**{f["key"]: r.get(f["key"], "") for f in ASSIGNMENT_FIELDS}, "record_id": rid}
            for r in rows if str(r.get("subject") or "").strip()]
    try:
        return store.write_records(data["records"], assignments=others + mine)
    except PermissionError as e:
        return _excel_error(e)


@app.post("/api/orgs")
def save_orgs(payload: dict = Body(...)):
    data = store.read_all()
    try:
        return store.write_records(data["records"], orgs=payload.get("orgs", []))
    except PermissionError as e:
        return _excel_error(e)


@app.post("/api/settings")
def save_settings(payload: dict = Body(...)):
    data = store.read_all()
    try:
        return store.write_records(data["records"], settings=payload.get("settings", {}))
    except PermissionError as e:
        return _excel_error(e)


@app.post("/api/open-excel")
def open_excel():
    path = store.ensure_workbook()
    try:
        if sys.platform == "darwin":
            subprocess.Popen(["open", str(path)])
        elif sys.platform.startswith("win"):
            subprocess.Popen(["cmd", "/c", "start", "", str(path)])
        else:
            subprocess.Popen(["xdg-open", str(path)])
    except Exception as e:  # 열기 실패해도 대시보드는 계속 동작해야 한다
        raise HTTPException(500, f"엑셀을 열지 못했습니다: {e}")
    return {"ok": True, "path": str(path)}


@app.get("/")
def index():
    return FileResponse(WEB / "index.html")


app.mount("/", StaticFiles(directory=WEB), name="web")
