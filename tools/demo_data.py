#!/usr/bin/env python3
"""화면을 채워 볼 데모 데이터를 만든다.

    python3 tools/demo_data.py                     # demo/career.xlsx 에 생성
    python3 tools/demo_data.py /경로/파일.xlsx     # 원하는 곳에 생성
    python3 run.py --data demo/career.xlsx         # 그 파일로 대시보드 띄우기

`data/` 와 섞이지 않게 `demo/` 폴더를 따로 쓴다(백업도 그 안에 생긴다).

쓰임새는 둘이다.

1. **스크린샷** — 공개용 이미지에 내 실제 기관명·연봉이 찍히면 안 된다.
   여기 나오는 기관과 금액은 전부 가짜다.
2. **처음 써 보기** — 빈 화면은 무엇을 할 수 있는 도구인지 보여주지 못한다.

기존 파일이 있으면 덮어쓰지 않는다(--force 로 덮어쓴다).
계약 형태를 골고루 섞어 모든 화면이 채워지도록 했다 —
연봉제(분반 3개·월급여 12개월), 주간반복 강의, 비연속 특강, 컨설팅, 교재 집필,
캠프, 문의 단계 건, 그리고 부분 입금 한 건.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "server"))

YEAR = 2026   # 데모의 기준 연도

ORGS = [
    {"name": "한빛대학교",     "kind": "강의처", "contact": "김수민", "phone": "042-000-0000",
     "region": "대전", "rate": 0,       "memo": "교양학부"},
    {"name": "새길대학교",     "kind": "강의처", "contact": "박지호", "phone": "02-000-0000",
     "region": "서울", "rate": 60000,   "memo": ""},
    {"name": "미래인재개발원", "kind": "발주처", "contact": "이가온", "phone": "02-000-1111",
     "region": "서울", "rate": 250000,  "memo": "대행사 — 정산은 여기로"},
    {"name": "(주)테크브릿지", "kind": "둘다",   "contact": "정하람", "phone": "031-000-2222",
     "region": "성남", "rate": 0,       "memo": ""},
    {"name": "한국직업능력원", "kind": "발주처", "contact": "최윤서", "phone": "044-000-3333",
     "region": "세종", "rate": 0,       "memo": ""},
]

RECORDS = [
    # 연봉제 초빙교수 — 이 도구를 만든 이유. 분반이 여럿이고 달마다 금액이 다르다.
    {"id": "R0001", "status": "진행중", "category": "강의", "subtype": "주강사",
     "format": "정규(주간반복)", "org": "한빛대학교", "contact": "김수민", "phone": "042-000-0000",
     "title": "초빙교수 (교양학부)", "topic": "AI, 데이터분석", "audience": "대학생",
     "start_date": f"{YEAR}-03-01", "end_date": f"{YEAR + 1}-02-28",
     "pay_type": "월정액(연봉제)", "annual_pay": 48_000_000, "monthly_pay": 4_000_000,
     "tax_type": "4대보험 (근로소득)", "region": "대전", "mode": "대면",
     "cost_covered": "해당없음", "settle_status": "청구",
     "memo": "1학기 3분반 · 2학기 재계약 예정"},

    # 시간급 정규 강의 — 요일 반복
    {"id": "R0002", "status": "확정", "category": "강의", "subtype": "주강사",
     "format": "정규(주간반복)", "org": "새길대학교", "contact": "박지호",
     "title": "파이썬 프로그래밍 기초", "topic": "파이썬", "audience": "대학생", "headcount": 32,
     "start_date": f"{YEAR}-09-04", "end_date": f"{YEAR}-12-18", "weekdays": "금",
     "start_time": "13:00", "end_time": "16:00",
     "pay_type": "시간급", "hours": 45, "rate": 60_000, "tax_type": "사업소득 3.3%",
     "region": "서울", "mode": "대면", "travel_cost": 120_000,
     "cost_covered": "강사료와 함께", "settle_status": "미청구",
     "due_date": f"{YEAR}-12-31"},

    # 비연속 특강 + 발주처가 따로 있는 건 + 경비 별도 지급
    {"id": "R0003", "status": "진행중", "category": "강의", "subtype": "주강사",
     "format": "집중특강(여러 날)", "org": "한빛대학교", "contact": "김수민",
     "client": "미래인재개발원", "client_contact": "이가온", "client_phone": "02-000-1111",
     "title": "생성형 AI 활용 집중과정", "topic": "생성형AI", "audience": "교직원", "headcount": 24,
     "dates": f"{YEAR}-08-10, 08-17, 08-24", "start_time": "10:00", "end_time": "13:00",
     "pay_type": "시간급", "hours": 9, "rate": 250_000, "tax_type": "기타소득 8.8%",
     "region": "대전", "mode": "대면", "travel_cost": 90_000,
     "cost_covered": "별도 지급", "cost_status": "청구",
     "settle_status": "청구", "due_date": f"{YEAR}-09-15",
     "memo": "격주 3회 · 경비는 따로 청구"},

    # 컨설팅 — 총액 일괄
    {"id": "R0004", "status": "완료", "category": "컨설팅", "subtype": "기술상담",
     "format": "해당없음", "org": "(주)테크브릿지", "contact": "정하람",
     "title": "사내 AI 도입 자문", "topic": "AI전략",
     "start_date": f"{YEAR}-06-15", "end_date": f"{YEAR}-06-16",
     "pay_type": "총액 일괄", "gross": 3_000_000, "hours": 12, "tax_type": "사업소득 3.3%",
     "region": "성남", "mode": "혼합", "cost_covered": "해당없음",
     "settle_status": "입금완료", "paid_date": f"{YEAR}-07-10", "paid_amount": 2_901_000},

    # 프로젝트 — 교재 집필
    {"id": "R0005", "status": "완료", "category": "프로젝트", "subtype": "교재",
     "format": "해당없음", "org": "한국직업능력원", "contact": "최윤서",
     "title": "데이터 리터러시 교재 집필", "topic": "데이터분석",
     "start_date": f"{YEAR}-04-01", "end_date": f"{YEAR}-07-31",
     "pay_type": "총액 일괄", "gross": 8_000_000, "tax_type": "사업소득 3.3%",
     "mode": "온라인", "cost_covered": "해당없음",
     "settle_status": "입금완료", "paid_date": f"{YEAR}-08-05", "paid_amount": 7_736_000},

    # 캠프 — 부분 입금 (파이프라인에 '청구' 구간이 보이도록)
    {"id": "R0006", "status": "완료", "category": "강의", "subtype": "주강사",
     "format": "캠프", "org": "새길대학교", "contact": "박지호",
     "title": "여름 AI 캠프", "topic": "AI, 파이썬", "audience": "중고등학생", "headcount": 40,
     "start_date": f"{YEAR}-07-20", "end_date": f"{YEAR}-07-24",
     "pay_type": "시간급", "hours": 20, "rate": 200_000, "tax_type": "사업소득 3.3%",
     "region": "서울", "mode": "대면", "lodging_cost": 200_000,
     "cost_covered": "자부담", "settle_status": "청구",
     "paid_amount": 2_000_000, "due_date": f"{YEAR}-08-31",
     "memo": "선금 200만 수령 · 잔금 정산 대기"},

    # 아직 확정 안 된 건 — '가망'으로 따로 집계된다
    {"id": "R0007", "status": "문의", "category": "강의", "subtype": "주강사",
     "format": "단기특강(단발)", "org": "미래인재개발원", "contact": "이가온",
     "title": "연말 리더십 특강", "topic": "AI리터러시", "audience": "성인",
     "start_date": f"{YEAR}-12-08", "start_time": "14:00", "end_time": "17:00",
     "pay_type": "시간급", "hours": 3, "rate": 300_000, "tax_type": "기타소득 8.8%",
     "region": "서울", "mode": "온라인", "cost_covered": "해당없음", "settle_status": "미청구"},

    # 장기 프로젝트 — 타임라인에서 길게 걸친다
    {"id": "R0008", "status": "확정", "category": "프로젝트", "subtype": "시스템",
     "format": "해당없음", "org": "(주)테크브릿지", "contact": "정하람",
     "title": "사내 학습관리 시스템 구축", "topic": "시스템개발",
     "start_date": f"{YEAR}-09-01", "end_date": f"{YEAR}-11-30",
     "pay_type": "총액 일괄", "gross": 12_000_000, "tax_type": "사업소득 3.3%",
     "region": "성남", "mode": "혼합", "cost_covered": "해당없음",
     "settle_status": "미청구", "due_date": f"{YEAR}-12-15"},
]

# 초빙교수의 담당 과목·분반 — 캘린더와 시간표가 분반별로 갈라진다
ASSIGNMENTS = [
    {"record_id": "R0001", "term": "1학기", "subject": "AI 이해와 활용", "section": "1분반",
     "weekdays": "화", "start_time": "10:00", "end_time": "12:00", "weekly_hours": 2,
     "start_date": f"{YEAR}-03-03", "weeks": 15, "audience": "대학생", "headcount": 38,
     "room": "공학관 201", "memo": ""},
    {"record_id": "R0001", "term": "1학기", "subject": "AI 이해와 활용", "section": "2분반",
     "weekdays": "목", "start_time": "10:00", "end_time": "12:00", "weekly_hours": 2,
     "start_date": f"{YEAR}-03-05", "weeks": 15, "audience": "대학생", "headcount": 35,
     "room": "공학관 201", "memo": ""},
    {"record_id": "R0001", "term": "1학기", "subject": "데이터 리터러시", "section": "1분반",
     "weekdays": "수", "start_time": "13:00", "end_time": "16:00", "weekly_hours": 3,
     "start_date": f"{YEAR}-03-04", "weeks": 15, "audience": "대학생+교직원", "headcount": 42,
     "room": "인문관 305", "memo": "중간고사 주 휴강"},
    {"record_id": "R0001", "term": "2학기", "subject": "AI 이해와 활용", "section": "1분반",
     "weekdays": "화", "start_time": "10:00", "end_time": "12:00", "weekly_hours": 2,
     "start_date": f"{YEAR}-09-01", "weeks": 15, "audience": "대학생", "headcount": 40,
     "room": "공학관 201", "memo": ""},
    {"record_id": "R0001", "term": "2학기", "subject": "생성형 AI 실습", "section": "1분반",
     "weekdays": "목", "start_time": "13:00", "end_time": "16:00", "weekly_hours": 3,
     "start_date": f"{YEAR}-09-03", "weeks": 15, "audience": "대학생", "headcount": 30,
     "room": "공학관 305", "memo": ""},
]

# 달마다 실제로 들어온 금액이 조금씩 다르다 — 이 도구가 월급여 시트를 둔 이유
PAYROLL = [
    # (년월, 지급예정, 실수령, 입금일, 상태)
    ("03", 4_000_000, 3_623_800, "03-25", "입금완료"),
    ("04", 4_000_000, 3_623_800, "04-24", "입금완료"),
    ("05", 4_000_000, 3_623_800, "05-25", "입금완료"),
    ("06", 4_000_000, 3_618_400, "06-25", "입금완료"),   # 요율 조정
    ("07", 4_000_000, 3_618_400, "07-24", "입금완료"),
    ("08", 4_000_000, 3_618_400, "08-25", "입금완료"),
    ("09", 4_000_000, None, "", "예정"),
    ("10", 4_000_000, None, "", "예정"),
    ("11", 4_000_000, None, "", "예정"),
    ("12", 6_000_000, None, "", "예정"),                 # 성과급
    ("01", 4_000_000, None, "", "예정"),
    ("02", 4_000_000, None, "", "예정"),
]

SETTINGS = {
    "annual_goal": 70_000_000,
    "default_tax_rate": 3.3,
    "default_rate": 250_000,
    "ins_pension": 4.5,
    "ins_health": 3.545,
    "ins_care": 12.95,
    "ins_employment": 0.9,
    "ins_income_tax": 0,
}


def build_payroll() -> list[dict]:
    rows = []
    for month, gross, net, paid, status in PAYROLL:
        year = YEAR if month >= "03" else YEAR + 1
        rows.append({
            "record_id": "R0001",
            "month": f"{year}-{month}",
            "gross": gross,
            "deduction": (gross - net) if net else None,
            "net": net,
            "paid_date": f"{year}-{paid}" if paid else "",
            "status": status,
            "memo": "성과급 포함" if month == "12" else "",
        })
    return rows


def main() -> None:
    import store
    from schema import FIELDS

    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    force = "--force" in sys.argv
    # 기본 위치는 demo/ — data/ 에 두면 백업이 실데이터 백업과 한 폴더에 섞인다
    path = Path(args[0]).expanduser() if args else ROOT / "demo" / "career.xlsx"

    if path.exists() and not force:
        raise SystemExit(
            f"이미 있는 파일입니다: {path}\n"
            "덮어쓰려면 --force 를 붙이세요. (실데이터 파일을 가리키고 있지 않은지 먼저 확인!)"
        )

    path.parent.mkdir(parents=True, exist_ok=True)
    store.create_workbook(path)

    records = []
    for r in RECORDS:
        full = {f["key"]: r.get(f["key"], "") for f in FIELDS}
        records.append(store.normalize_amounts(store.normalize_span(full)))

    store.write_records(
        records,
        orgs=ORGS,
        settings=SETTINGS,
        payroll=build_payroll(),
        assignments=ASSIGNMENTS,
        path=path,
    )

    print(f"데모 데이터를 만들었습니다: {path}")
    print(f"  일감 {len(records)}건 · 강의배정 {len(ASSIGNMENTS)}개 · "
          f"월급여 {len(PAYROLL)}개월 · 기관 {len(ORGS)}곳")
    print()
    print("띄워 보려면:")
    try:
        rel = path.relative_to(Path.cwd())
    except ValueError:
        rel = path
    print(f"    python3 run.py --data {rel}")


if __name__ == "__main__":
    main()
