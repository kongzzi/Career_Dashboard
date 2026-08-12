"""데이터 스키마 정의 — 엑셀 컬럼과 웹 폼이 이 파일 하나를 공유한다."""

# key: 내부 식별자 / label: 엑셀 헤더이자 화면 라벨 / type: 입력 위젯과 파싱 규칙
FIELDS = [
    {"key": "id",           "label": "ID",           "type": "text",   "group": "식별", "width": 12, "readonly": True},
    {"key": "status",       "label": "상태",          "type": "select", "group": "식별", "width": 10, "options": "상태"},
    {"key": "category",     "label": "업무구분",       "type": "select", "group": "분류", "width": 10, "options": "업무구분"},
    {"key": "subtype",      "label": "세부유형",       "type": "select", "group": "분류", "width": 12, "options": "세부유형"},
    {"key": "format",       "label": "강의형태",       "type": "select", "group": "분류", "width": 16, "options": "강의형태"},
    {"key": "org",          "label": "기관명",         "type": "org",    "group": "기관", "width": 22,
     "hint": "실제 강의·업무가 이뤄지는 곳"},
    {"key": "contact",      "label": "담당자",         "type": "text",   "group": "기관", "width": 10},
    {"key": "phone",        "label": "연락처",         "type": "text",   "group": "기관", "width": 16},
    {"key": "client",       "label": "발주처",         "type": "org",    "group": "발주처", "width": 20,
     "hint": "계약·정산 주체 · 기관과 같으면 비워두세요"},
    {"key": "client_contact", "label": "발주처 담당자", "type": "text",   "group": "발주처", "width": 12},
    {"key": "client_phone", "label": "발주처 연락처",   "type": "text",   "group": "발주처", "width": 16},
    {"key": "title",        "label": "과정명",         "type": "text",   "group": "내용", "width": 28},
    {"key": "topic",        "label": "주제분야",       "type": "text",   "group": "내용", "width": 20,
     "hint": "쉼표로 여러 개 (예: 파이썬, 데이터분석)"},
    {"key": "audience",     "label": "수강대상",       "type": "select", "group": "내용", "width": 12, "options": "수강대상"},
    {"key": "headcount",    "label": "인원",           "type": "number", "group": "내용", "width": 8},
    {"key": "start_date",   "label": "시작일",         "type": "date",   "group": "일정", "width": 12},
    {"key": "end_date",     "label": "종료일",         "type": "date",   "group": "일정", "width": 12,
     "hint": "하루짜리면 비워두세요"},
    {"key": "dates",        "label": "개별 날짜",       "type": "dates",  "group": "일정", "width": 30,
     "hint": "날짜가 띄엄띄엄일 때 — 채우면 시작일·종료일·요일보다 우선합니다"},
    {"key": "weekdays",     "label": "요일",           "type": "weekdays", "group": "일정", "width": 12,
     "hint": "정규 강의만 — 매주 반복 요일"},
    {"key": "start_time",   "label": "시작시각",       "type": "time",   "group": "일정", "width": 10},
    {"key": "end_time",     "label": "종료시각",       "type": "time",   "group": "일정", "width": 10},
    {"key": "pay_type",     "label": "급여방식",       "type": "select", "group": "금액", "width": 15, "options": "급여방식"},
    {"key": "annual_pay",   "label": "계약 연봉",       "type": "money",  "group": "금액", "width": 14,
     "hint": "월정액일 때 — 넣으면 월 지급액이 12분의 1로 채워집니다"},
    {"key": "monthly_pay",  "label": "월 지급액",       "type": "money",  "group": "금액", "width": 13,
     "hint": "월정액일 때 — 연봉을 넣었으면 자동 계산"},
    {"key": "monthly_net",  "label": "월 실수령액",      "type": "money",  "group": "금액", "width": 14,
     "hint": "급여명세서의 실수령액 · 넣으면 공제 계산보다 우선합니다"},
    {"key": "hours",        "label": "총시수",         "type": "number", "group": "금액", "width": 9,
     "hint": "실제 강의 시간 · 월정액은 시간당 환산을 하지 않습니다"},
    {"key": "rate",         "label": "시간당단가",      "type": "money",  "group": "금액", "width": 13,
     "hint": "시간급일 때만 씁니다"},
    {"key": "gross",        "label": "총액(세전)",      "type": "money",  "group": "금액", "width": 14,
     "hint": "급여방식에 따라 자동 계산 — 직접 넣으면 그 값이 우선"},
    {"key": "tax_type",     "label": "세금적용",       "type": "select", "group": "금액", "width": 16, "options": "세금적용"},
    {"key": "tax_rate",     "label": "원천징수율(%)",   "type": "number", "group": "금액", "width": 13,
     "hint": "'직접입력'을 골랐을 때만 씁니다"},
    {"key": "region",       "label": "지역",           "type": "text",   "group": "내용", "width": 12},
    {"key": "mode",         "label": "진행방식",       "type": "select", "group": "내용", "width": 10, "options": "진행방식"},
    {"key": "travel_cost",  "label": "교통비",         "type": "money",  "group": "경비", "width": 11},
    {"key": "lodging_cost", "label": "숙박비",         "type": "money",  "group": "경비", "width": 11},
    {"key": "other_cost",   "label": "기타경비",       "type": "money",  "group": "경비", "width": 11},
    {"key": "cost_covered", "label": "경비지급방식",    "type": "select", "group": "경비", "width": 15, "options": "경비지급"},
    {"key": "cost_status",  "label": "경비 정산상태",   "type": "select", "group": "경비", "width": 13, "options": "정산상태",
     "hint": "'별도 지급'일 때만 씁니다"},
    {"key": "cost_paid_date", "label": "경비 입금일",   "type": "date",   "group": "경비", "width": 13},
    {"key": "cost_paid_amount", "label": "경비 실입금액", "type": "money", "group": "경비", "width": 14,
     "hint": "실제로 들어온 경비 · 비우면 청구액 그대로 봅니다"},
    {"key": "settle_status","label": "정산상태",       "type": "select", "group": "정산", "width": 10, "options": "정산상태"},
    {"key": "due_date",     "label": "입금예정일",      "type": "date",   "group": "정산", "width": 13},
    {"key": "paid_date",    "label": "입금일",         "type": "date",   "group": "정산", "width": 12},
    {"key": "paid_amount",  "label": "실입금액",       "type": "money",  "group": "정산", "width": 14,
     "hint": "통장에 찍힌 금액 그대로 · 비우면 예상액을 씁니다"},
    {"key": "paid_months",  "label": "입금 완료 개월수", "type": "number", "group": "정산", "width": 15,
     "hint": "월정액일 때 — 지금까지 몇 달치를 받았는지"},
    {"key": "doc_link",     "label": "증빙링크",       "type": "text",   "group": "기타", "width": 24},
    {"key": "memo",         "label": "메모",           "type": "text",   "group": "기타", "width": 34},
]

# 예전 파일의 헤더도 계속 읽히게 한다 (라벨이 바뀐 칸들)
LEGACY_LABELS = {
    "강사료 실입금액": "paid_amount",
    "실비지급": "cost_covered",
}

FIELD_BY_KEY = {f["key"]: f for f in FIELDS}
LABEL_TO_KEY = {**LEGACY_LABELS, **{f["label"]: f["key"] for f in FIELDS}}

# 드롭다운 목록 — 설정 시트에 기록되며, 사용자가 엑셀에서 항목을 추가하면 그대로 반영된다.
CHOICES = {
    "상태":     ["문의", "확정", "진행중", "완료", "취소"],
    "업무구분":  ["강의", "컨설팅", "프로젝트"],
    "세부유형":  ["주강사", "보조강사", "기술상담", "교재", "교구", "시스템", "서비스"],
    "강의형태":  ["정규(주간반복)", "집중특강(여러 날)", "단기특강(단발)", "캠프", "해당없음"],
    "수강대상":  ["대학생", "교직원", "대학생+교직원", "성인", "중고등학생", "초등학생", "혼합"],
    # 시간급 = 시수×단가 / 월정액 = 월 지급액×계약 개월수 / 총액 일괄 = 총액 직접 입력
    "급여방식":  ["시간급", "월정액(연봉제)", "총액 일괄"],
    "세금적용":  ["사업소득 3.3%", "기타소득 8.8%", "4대보험 (근로소득)", "미적용 (세금 없음)", "직접입력"],
    "진행방식":  ["대면", "온라인", "혼합"],
    # 강사료와 함께 = 강사료 정산상태를 그대로 따름 / 별도 지급 = 따로 청구·입금 추적
    "경비지급":  ["강사료와 함께", "별도 지급", "자부담", "해당없음"],
    "정산상태":  ["미청구", "청구", "입금완료"],
    "월급여상태": ["예정", "입금완료"],
    "학기":     ["1학기", "2학기", "여름계절", "겨울계절"],
}

# 세금적용 선택지 → 원천징수율. 여기 없는 값(사용자가 설정 시트에 추가한 항목 등)은
# 라벨에서 "12.3%" 꼴의 숫자를 찾아 쓰고, 그것도 없으면 원천징수율 칸의 값을 쓴다.
TAX_TYPE_RATE = {
    "사업소득 3.3%": 3.3,
    "기타소득 8.8%": 8.8,
    "미적용 (세금 없음)": 0,
    "직접입력": None,
    # 4대보험은 단일 요율이 아니라 항목별 계산이라 여기서 값을 주지 않는다 (core.js의 computeDeduction 참고)
    "4대보험 (근로소득)": None,
}

INSURANCE_TAX_TYPE = "4대보험 (근로소득)"

# 업무구분에 따라 세부유형 선택지를 좁힌다.
SUBTYPE_BY_CATEGORY = {
    "강의":     ["주강사", "보조강사"],
    "컨설팅":   ["기술상담"],
    "프로젝트": ["교재", "교구", "시스템", "서비스"],
}

SETTINGS = [
    {"key": "annual_goal",      "label": "연간 목표 수입", "value": 0,   "note": "0이면 목표 게이지를 숨깁니다"},
    {"key": "default_tax_rate", "label": "기본 원천징수율(%)", "value": 3.3, "note": "새 항목의 기본값"},
    {"key": "default_rate",     "label": "기본 시간당 단가", "value": 0,   "note": "새 항목의 기본값"},
    # 4대보험 근로자 부담 요율 — 해마다 바뀌므로 여기서 고칠 수 있게 둔다
    {"key": "ins_pension",    "label": "국민연금(%)",   "value": 4.5,   "note": "근로자 부담분"},
    {"key": "ins_health",     "label": "건강보험(%)",   "value": 3.545, "note": "근로자 부담분"},
    {"key": "ins_care",       "label": "장기요양(%)",   "value": 12.95, "note": "건강보험료 대비 비율"},
    {"key": "ins_employment", "label": "고용보험(%)",   "value": 0.9,   "note": "근로자 부담분"},
    {"key": "ins_income_tax", "label": "소득세 추정(%)", "value": 0,     "note": "간이세액표라 부정확 · 월 실수령액 직접 입력 권장"},
]

# 계약에 딸린 담당 과목·분반 — 일감 1건에 여러 행 (분반마다 요일·시각·시수가 다르다)
ASSIGNMENT_FIELDS = [
    {"key": "record_id",    "label": "일감ID",   "type": "text",   "width": 10},
    {"key": "term",         "label": "학기",     "type": "text",   "width": 11},
    {"key": "subject",      "label": "과목명",    "type": "text",   "width": 26},
    {"key": "section",      "label": "분반",     "type": "text",   "width": 9},
    {"key": "weekdays",     "label": "요일",     "type": "text",   "width": 10},
    {"key": "start_time",   "label": "시작시각",  "type": "time",   "width": 10},
    {"key": "end_time",     "label": "종료시각",  "type": "time",   "width": 10},
    {"key": "weekly_hours", "label": "주당시수",  "type": "number", "width": 10},
    {"key": "start_date",   "label": "개강일",    "type": "date",   "width": 12},
    {"key": "weeks",        "label": "주차",     "type": "number", "width": 8},
    {"key": "audience",     "label": "대상",     "type": "text",   "width": 12},
    {"key": "headcount",    "label": "인원",     "type": "number", "width": 8},
    {"key": "room",         "label": "강의실",    "type": "text",   "width": 12},
    {"key": "memo",         "label": "비고",     "type": "text",   "width": 24},
]

DEFAULT_WEEKS = 15   # 대학 정규 학기

# 월정액(연봉제) 계약에 딸린 달별 급여 — 일감 1건에 여러 행
PAYROLL_FIELDS = [
    {"key": "record_id", "label": "일감ID",       "type": "text",  "width": 10},
    {"key": "month",     "label": "년월",         "type": "text",  "width": 10},   # 2026-09
    {"key": "gross",     "label": "지급예정(세전)", "type": "money", "width": 16},
    {"key": "deduction", "label": "공제액",       "type": "money", "width": 13},
    {"key": "net",       "label": "실수령액",      "type": "money", "width": 14},
    {"key": "paid_date", "label": "입금일",       "type": "date",  "width": 13},
    {"key": "status",    "label": "상태",         "type": "text",  "width": 11},
    {"key": "memo",      "label": "메모",         "type": "text",  "width": 24},
]

ORG_FIELDS = [
    {"key": "name",     "label": "기관명",     "type": "text",  "width": 24},
    {"key": "kind",     "label": "기관구분",    "type": "text",  "width": 14},   # 강의처 / 발주처 / 둘다
    {"key": "contact",  "label": "담당자",     "type": "text",  "width": 10},
    {"key": "phone",    "label": "연락처",     "type": "text",  "width": 16},
    {"key": "region",   "label": "지역",       "type": "text",  "width": 12},
    {"key": "rate",     "label": "기본단가",    "type": "money", "width": 12},
    {"key": "memo",     "label": "메모",       "type": "text",  "width": 30},
]

SHEET_RECORDS = "일감"
SHEET_ORGS = "기관"
SHEET_ASSIGN = "강의배정"
SHEET_PAYROLL = "월급여"
SHEET_CONFIG = "설정"

WEEKDAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"]
