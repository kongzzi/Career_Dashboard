"""store.py 회귀 테스트 — 날짜 파싱, 금액 정규화, 엑셀 읽기/쓰기 규칙.

    python3 -m unittest discover -s tests -v

사용자의 data/career.xlsx 는 절대 건드리지 않는다.
쓰기가 있는 테스트는 전부 tempfile 안에서만 돈다(백업도 그 안에 생긴다).
"""
from __future__ import annotations

import datetime as dt
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "server"))

from openpyxl import Workbook, load_workbook   # noqa: E402

import store                                   # noqa: E402
from schema import (                           # noqa: E402
    ASSIGNMENT_FIELDS, CHOICES, FIELDS, SETTINGS, SHEET_ASSIGN, SHEET_CONFIG, SHEET_RECORDS,
)

D = dt.date


class TempBook(unittest.TestCase):
    """엑셀을 만드는 테스트의 공통 뼈대 — 임시 폴더 안에서만 논다."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.path = self.dir / "career.xlsx"

    def tearDown(self):
        self._tmp.cleanup()

    def assertUntouched(self):
        """실데이터 폴더에 아무것도 안 만들었는지 — 안전망."""
        self.assertFalse((ROOT / "data" / "backups" / "career-").exists())


# ─────────────────────────────────────────────────────────── 날짜 목록 파싱

class ParseDateList(unittest.TestCase):
    """'2026-08-10, 08-17, 24' 처럼 연·월을 이어받는 축약 표기.
    core.js 의 parseDateList() 와 같은 규칙이어야 한다 — 웹으로 넣든 엑셀에 직접 적든 같게."""

    def test_연월을_이어받는다(self):
        self.assertEqual(
            store.parse_date_list("2026-08-10, 08-17, 24"),
            [D(2026, 8, 10), D(2026, 8, 17), D(2026, 8, 24)],
        )

    def test_달이_바뀌면_따라간다(self):
        self.assertEqual(
            store.parse_date_list("2026-08-31, 09-01, 15"),
            [D(2026, 8, 31), D(2026, 9, 1), D(2026, 9, 15)],
        )

    def test_슬래시와_점_구분자(self):
        self.assertEqual(
            store.parse_date_list("2026/08/10, 8.17"),
            [D(2026, 8, 10), D(2026, 8, 17)],
        )

    def test_엑셀이_날짜로_바꿔버린_문자열도_읽는다(self):
        self.assertEqual(store.parse_date_list("2026-08-10 00:00:00"), [D(2026, 8, 10)])

    def test_정렬하고_중복을_지운다(self):
        self.assertEqual(
            store.parse_date_list("2026-03-05, 2026-03-01, 2026-03-05"),
            [D(2026, 3, 1), D(2026, 3, 5)],
        )

    def test_fallback_year(self):
        self.assertEqual(store.parse_date_list("8/10", 2025), [D(2025, 8, 10)])

    def test_없는_날짜는_버린다(self):
        self.assertEqual(store.parse_date_list("2026-02-30"), [])

    def test_빈값(self):
        self.assertEqual(store.parse_date_list(""), [])
        self.assertEqual(store.parse_date_list(None), [])

    def test_월없이_일만_적으면_무시(self):
        # 앞에 달이 안 나왔으면 '24' 만으로는 날짜를 만들 수 없다
        self.assertEqual(store.parse_date_list("24, 25"), [])


# ─────────────────────────────────────────────────────────── 기간 정규화

class NormalizeSpan(unittest.TestCase):
    """개별 날짜를 적었으면 그것이 곧 일정 — 시작일·종료일을 맞춰 둔다."""

    def test_시작일_종료일을_맞춘다(self):
        rec = store.normalize_span({"dates": "2026-08-10, 08-17, 24", "start_date": "", "end_date": ""})
        self.assertEqual(rec["dates"], "2026-08-10,2026-08-17,2026-08-24")
        self.assertEqual(rec["start_date"], "2026-08-10")
        self.assertEqual(rec["end_date"], "2026-08-24")

    def test_하루뿐이면_종료일은_비운다(self):
        rec = store.normalize_span({"dates": "2026-08-10", "start_date": "", "end_date": "2026-09-01"})
        self.assertEqual(rec["start_date"], "2026-08-10")
        self.assertEqual(rec["end_date"], "")

    def test_개별날짜가_없으면_그대로_둔다(self):
        rec = store.normalize_span({"dates": "", "start_date": "2026-05-01", "end_date": "2026-05-10"})
        self.assertEqual(rec["start_date"], "2026-05-01")
        self.assertEqual(rec["end_date"], "2026-05-10")

    def test_시작일의_연도를_이어받는다(self):
        # 개별 날짜에 연도가 없으면 시작일에서 가져온다
        rec = store.normalize_span({"dates": "3/5, 3/12", "start_date": "2027-03-01", "end_date": ""})
        self.assertEqual(rec["start_date"], "2027-03-05")
        self.assertEqual(rec["end_date"], "2027-03-12")


# ─────────────────────────────────────────────────────────── 개월수

class MonthsBetween(unittest.TestCase):
    def test_해를_넘기는_계약(self):
        self.assertEqual(store.months_between(D(2026, 9, 1), D(2027, 2, 28)), 6)

    def test_같은_달(self):
        self.assertEqual(store.months_between(D(2026, 9, 1), D(2026, 9, 30)), 1)

    def test_종료일이_없으면_한달(self):
        self.assertEqual(store.months_between(D(2026, 9, 1), None), 1)

    def test_종료일이_시작일보다_앞이면_한달(self):
        self.assertEqual(store.months_between(D(2026, 9, 1), D(2026, 8, 1)), 1)

    def test_시작일이_없으면_0(self):
        self.assertEqual(store.months_between(None, D(2026, 9, 1)), 0)


class MonthList(unittest.TestCase):
    def test_해를_넘긴다(self):
        self.assertEqual(
            store.month_list(D(2026, 11, 15), D(2027, 2, 1)),
            ["2026-11", "2026-12", "2027-01", "2027-02"],
        )

    def test_시작일이_없으면_빈목록(self):
        self.assertEqual(store.month_list(None, D(2027, 2, 1)), [])


# ─────────────────────────────────────────────────────────── 총액 자동 계산

class NormalizeAmounts(unittest.TestCase):
    """엑셀만 열어 봐도 금액이 보이도록 총액을 채운다. 직접 적은 총액은 건드리지 않는다."""

    def test_시간급(self):
        rec = store.normalize_amounts({"pay_type": "시간급", "hours": 30, "rate": 50000, "gross": ""})
        self.assertEqual(rec["gross"], 1_500_000)

    def test_급여방식을_안적으면_시간급(self):
        rec = store.normalize_amounts({"pay_type": "", "hours": 10, "rate": 100000, "gross": ""})
        self.assertEqual(rec["gross"], 1_000_000)

    def test_월정액은_연봉의_12분의1에_개월수(self):
        rec = store.normalize_amounts({
            "pay_type": "월정액(연봉제)", "annual_pay": 48_000_000,
            "start_date": "2026-09-01", "end_date": "2027-02-28", "gross": "",
        })
        self.assertEqual(rec["gross"], 24_000_000)   # 400만 × 6개월

    def test_월지급액이_연봉을_이긴다(self):
        rec = store.normalize_amounts({
            "pay_type": "월정액(연봉제)", "annual_pay": 48_000_000, "monthly_pay": 3_000_000,
            "start_date": "2026-09-01", "end_date": "2026-11-30", "gross": "",
        })
        self.assertEqual(rec["gross"], 9_000_000)    # 300만 × 3개월

    def test_총액_일괄은_계산하지_않는다(self):
        rec = store.normalize_amounts({"pay_type": "총액 일괄", "hours": 30, "rate": 50000, "gross": ""})
        self.assertEqual(rec["gross"], "")

    def test_직접_적은_총액이_우선(self):
        rec = store.normalize_amounts({"pay_type": "시간급", "hours": 30, "rate": 50000, "gross": 2_000_000})
        self.assertEqual(rec["gross"], 2_000_000)


# ─────────────────────────────────────────────────────────── 월급여 생성

class GeneratePayroll(unittest.TestCase):
    def test_달마다_한_행(self):
        rows = store.generate_payroll({
            "id": "R0001", "annual_pay": 48_000_000,
            "start_date": "2026-09-01", "end_date": "2027-02-28",
        })
        self.assertEqual([r["month"] for r in rows],
                         ["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"])
        self.assertTrue(all(r["gross"] == 4_000_000 for r in rows))
        self.assertTrue(all(r["status"] == "예정" for r in rows))
        self.assertTrue(all(r["net"] is None for r in rows))     # 실수령은 손으로 채운다
        self.assertTrue(all(r["record_id"] == "R0001" for r in rows))

    def test_월지급액도_연봉도_없으면_총액을_나눈다(self):
        rows = store.generate_payroll({
            "id": "R0002", "gross": 6_000_000,
            "start_date": "2026-09-01", "end_date": "2026-11-30",
        })
        self.assertEqual([r["gross"] for r in rows], [2_000_000, 2_000_000, 2_000_000])

    def test_시작일이_없으면_만들지_않는다(self):
        self.assertEqual(store.generate_payroll({"id": "R0003", "annual_pay": 48_000_000}), [])


# ─────────────────────────────────────────────────────────── 헤더 이름으로 읽기

class ReadByHeaderName(TempBook):
    """모든 시트를 헤더 '이름'으로 읽는다.

    위치로 읽으면 컬럼을 중간에 끼워 넣는 순간 예전 파일의 값이 통째로 밀린다
    (실제로 강의배정에 '학기'를 2번째로 끼워 넣다 겪은 사고).
    """

    def test_자식시트의_컬럼_순서가_달라도_맞게_읽는다(self):
        wb = Workbook()
        ws = wb.active
        ws.title = SHEET_ASSIGN
        # 스키마와 순서를 뒤섞고, 모르는 컬럼도 하나 끼워 넣는다
        ws.append(["과목명", "일감ID", "낯선컬럼", "주차", "요일", "개강일", "분반"])
        ws.append(["AI 이해와 활용", "R0007", "무시됨", 15, "화,목", D(2026, 9, 1), "1분반"])
        wb.save(self.path)

        rows = store._read_sheet(load_workbook(self.path)[SHEET_ASSIGN], ASSIGNMENT_FIELDS)
        self.assertEqual(len(rows), 1)
        a = rows[0]
        self.assertEqual(a["record_id"], "R0007")
        self.assertEqual(a["subject"], "AI 이해와 활용")
        self.assertEqual(a["section"], "1분반")
        self.assertEqual(a["weekdays"], "화,목")
        self.assertEqual(a["weeks"], 15)
        self.assertEqual(a["start_date"], "2026-09-01")
        self.assertEqual(a["term"], "")          # 시트에 없는 컬럼은 빈 값

    def test_예전_헤더도_계속_읽힌다(self):
        # '강사료 실입금액' → '실입금액' 으로 이름이 바뀌었지만 예전 파일이 깨지면 안 된다
        wb = Workbook()
        ws = wb.active
        ws.title = SHEET_RECORDS
        ws.append(["ID", "기관명", "강사료 실입금액", "실비지급"])
        ws.append(["R0001", "○○대학교", 492480, "지급"])
        wb.save(self.path)

        d = store.read_all(self.path)
        self.assertEqual(len(d["records"]), 1)
        self.assertEqual(d["records"][0]["paid_amount"], 492480)
        self.assertEqual(d["records"][0]["cost_covered"], "지급")

    def test_빈_행은_건너뛴다(self):
        wb = Workbook()
        ws = wb.active
        ws.title = SHEET_RECORDS
        ws.append(["ID", "기관명"])
        ws.append(["R0001", "○○대학교"])
        ws.append([None, None])
        ws.append(["R0002", "△△기업"])
        wb.save(self.path)

        self.assertEqual([r["id"] for r in store.read_all(self.path)["records"]], ["R0001", "R0002"])


# ─────────────────────────────────────────────────────────── 드롭다운 병합

class ChoicesMerge(TempBook):
    """시트에 적힌 목록이 우선이되, 나중에 코드에 추가된 선택지는 뒤에 붙는다.
    (예전 파일의 '목록' 행이 새 기능의 선택지를 통째로 가리던 버그)"""

    def test_시트_우선_코드는_뒤에_붙는다(self):
        wb = Workbook()
        wb.active.title = SHEET_RECORDS
        wb.active.append([f["label"] for f in FIELDS])
        wc = wb.create_sheet(SHEET_CONFIG)
        wc.append(["구분", "키", "값", "설명"])
        for v in ["문의", "확정", "보류"]:          # '보류'는 사용자가 엑셀에서 추가한 것
            wc.append(["목록", "상태", v])
        wb.save(self.path)

        choices = store.read_all(self.path)["choices"]
        # 시트 순서가 앞, 코드에만 있는 선택지는 뒤
        self.assertEqual(choices["상태"], ["문의", "확정", "보류", "진행중", "완료", "취소"])
        # 시트에 아예 없는 목록은 코드 기본값 그대로
        self.assertEqual(choices["급여방식"], CHOICES["급여방식"])

    def test_설정값을_시트에서_읽는다(self):
        wb = Workbook()
        wb.active.title = SHEET_RECORDS
        wb.active.append([f["label"] for f in FIELDS])
        wc = wb.create_sheet(SHEET_CONFIG)
        wc.append(["구분", "키", "값", "설명"])
        wc.append(["설정", "연간 목표 수입", 50_000_000, ""])
        wc.append(["설정", "국민연금(%)", 4.5, ""])
        wb.save(self.path)

        s = store.read_all(self.path)["settings"]
        self.assertEqual(s["annual_goal"], 50_000_000)
        self.assertEqual(s["ins_pension"], 4.5)
        self.assertEqual(s["ins_health"], 3.545)   # 시트에 없으면 코드 기본값


# ─────────────────────────────────────────────────────────── 쓰기 왕복

class WriteRoundTrip(TempBook):
    def test_쓰고_다시_읽으면_같다(self):
        store.create_workbook(self.path)
        records = [{
            "id": "R0001", "status": "확정", "category": "강의", "org": "○○대학교",
            "title": "AI 이해와 활용", "start_date": "2026-09-01", "end_date": "2027-02-28",
            "pay_type": "월정액(연봉제)", "annual_pay": 48_000_000, "gross": 24_000_000,
            "tax_type": "4대보험 (근로소득)", "hours": 30, "settle_status": "미청구",
        }]
        out = store.write_records(records, path=self.path)

        self.assertEqual(len(out["records"]), 1)
        r = out["records"][0]
        self.assertEqual(r["id"], "R0001")
        self.assertEqual(r["org"], "○○대학교")
        self.assertEqual(r["start_date"], "2026-09-01")
        self.assertEqual(r["annual_pay"], 48_000_000)
        self.assertEqual(r["tax_type"], "4대보험 (근로소득)")
        self.assertEqual(out["next_id"], "R0002")

    def test_자식시트도_왕복한다(self):
        store.create_workbook(self.path)
        assignments = [{
            "record_id": "R0001", "term": "1학기", "subject": "AI 이해와 활용", "section": "1분반",
            "weekdays": "화,목", "start_time": "10:00", "end_time": "12:00",
            "weekly_hours": 3, "start_date": "2026-09-01", "weeks": 15,
        }]
        payroll = [{
            "record_id": "R0001", "month": "2026-09", "gross": 2_000_000,
            "net": 1_850_000, "paid_date": "2026-09-25", "status": "입금완료",
        }]
        out = store.write_records([{"id": "R0001"}], assignments=assignments,
                                  payroll=payroll, path=self.path)

        a = out["assignments"][0]
        self.assertEqual(a["term"], "1학기")
        self.assertEqual(a["subject"], "AI 이해와 활용")
        self.assertEqual(a["weekly_hours"], 3)
        self.assertEqual(a["start_time"], "10:00")
        self.assertEqual(a["start_date"], "2026-09-01")

        p = out["payroll"][0]
        self.assertEqual(p["month"], "2026-09")
        self.assertEqual(p["net"], 1_850_000)
        self.assertEqual(p["paid_date"], "2026-09-25")
        self.assertEqual(p["status"], "입금완료")

    def test_저장하면_백업이_원본_옆에_생긴다(self):
        store.create_workbook(self.path)
        store.write_records([{"id": "R0001"}], path=self.path)
        backups = list((self.dir / "backups").glob("career-*.xlsx"))
        self.assertEqual(len(backups), 1)
        # 실데이터 폴더에는 아무것도 만들지 않았다
        self.assertFalse((self.dir / "backups" / "..").resolve() == (ROOT / "data").resolve())

    def test_ID_채번은_최대값_다음(self):
        store.create_workbook(self.path)
        out = store.write_records([{"id": "R0003"}, {"id": "R0011"}, {"id": "R0007"}], path=self.path)
        self.assertEqual(out["next_id"], "R0012")

    def test_컬럼을_추가해도_예전_파일이_안깨진다(self):
        """스키마에 칸이 늘어난 상황을 흉내낸다 — 헤더가 적은 예전 파일을 읽고 되쓴다."""
        wb = Workbook()
        ws = wb.active
        ws.title = SHEET_RECORDS
        ws.append(["ID", "기관명", "총액(세전)"])          # 칸 3개뿐인 예전 파일
        ws.append(["R0001", "○○대학교", 1_500_000])
        wb.save(self.path)

        d = store.read_all(self.path)
        self.assertEqual(d["records"][0]["gross"], 1_500_000)
        self.assertEqual(d["records"][0]["org"], "○○대학교")

        out = store.write_records(d["records"], path=self.path)      # 되쓰면 전체 스키마로 승격
        self.assertEqual(out["records"][0]["gross"], 1_500_000)
        self.assertEqual(out["records"][0]["org"], "○○대학교")
        header = [c.value for c in load_workbook(self.path)[SHEET_RECORDS][1]]
        self.assertEqual(header, [f["label"] for f in FIELDS])


# ─────────────────────────────────────────────────────────── 스키마 무결성

class SchemaIntegrity(unittest.TestCase):
    """'컬럼을 추가하려면 FIELDS 에 한 줄' 이 성립하려면 지켜져야 하는 것들."""

    def test_key와_label은_중복이_없다(self):
        for name, fields in [("FIELDS", FIELDS), ("ASSIGNMENT_FIELDS", ASSIGNMENT_FIELDS)]:
            keys = [f["key"] for f in fields]
            labels = [f["label"] for f in fields]
            self.assertEqual(len(keys), len(set(keys)), f"{name} 의 key 가 겹친다")
            self.assertEqual(len(labels), len(set(labels)), f"{name} 의 label(엑셀 헤더)이 겹친다")

    def test_select_필드는_실재하는_목록을_가리킨다(self):
        for f in FIELDS:
            if f["type"] == "select":
                self.assertIn(f["options"], CHOICES, f"{f['label']} 의 목록이 CHOICES 에 없다")

    def test_예전_헤더_별칭은_실재하는_key를_가리킨다(self):
        from schema import LEGACY_LABELS
        keys = {f["key"] for f in FIELDS}
        for label, key in LEGACY_LABELS.items():
            self.assertIn(key, keys, f"예전 헤더 '{label}' 이 없는 key '{key}' 를 가리킨다")

    def test_세부유형은_업무구분과_맞물린다(self):
        from schema import SUBTYPE_BY_CATEGORY
        for cat, subs in SUBTYPE_BY_CATEGORY.items():
            self.assertIn(cat, CHOICES["업무구분"])
            for s in subs:
                self.assertIn(s, CHOICES["세부유형"])

    def test_세금적용_목록과_요율표가_일치한다(self):
        # 목록에만 있고 요율표에 없으면 라벨의 숫자를 읽는 우회 경로로 빠진다
        from schema import TAX_TYPE_RATE
        self.assertEqual(set(TAX_TYPE_RATE), set(CHOICES["세금적용"]))


class CrossLanguageConstants(unittest.TestCase):
    """core.js 에 복사된 상수가 schema.py 와 어긋나지 않는지.

    양쪽에 같은 값을 적어 둔 곳이 몇 군데 있다(브라우저가 서버를 거치지 않고 쓰는 값).
    어긋나도 에러가 안 나고 금액만 조용히 틀리므로 여기서 잡는다.
    """

    @classmethod
    def setUpClass(cls):
        cls.core = (ROOT / "web" / "js" / "core.js").read_text(encoding="utf-8")

    def test_기본_주차(self):
        import re
        from schema import DEFAULT_WEEKS
        m = re.search(r"DEFAULT_WEEKS\s*=\s*(\d+)", self.core)
        self.assertIsNotNone(m, "core.js 에서 DEFAULT_WEEKS 를 찾지 못했다")
        self.assertEqual(int(m.group(1)), DEFAULT_WEEKS)

    def test_4대보험_기본요율(self):
        import re
        # core.js 의 insRates() 는 설정값이 비었을 때 쓸 기본값을 직접 들고 있다
        found = {k: float(v) for k, v in re.findall(r"pick\('(ins_\w+)',\s*([\d.]+)\)", self.core)}
        expected = {s["key"]: float(s["value"]) for s in SETTINGS if s["key"].startswith("ins_")}
        self.assertTrue(found, "core.js 에서 insRates() 기본값을 찾지 못했다")
        self.assertEqual(found, expected)

    def test_세금적용_요율표_사본(self):
        import re
        from schema import TAX_TYPE_RATE
        mjs = (ROOT / "tests" / "test_core.mjs").read_text(encoding="utf-8")
        block = re.search(r"const TAX_TYPE_RATE = \{(.*?)\n\};", mjs, re.S)
        self.assertIsNotNone(block, "test_core.mjs 에서 TAX_TYPE_RATE 사본을 찾지 못했다")
        keys = set(re.findall(r"'([^']+)':", block.group(1)))
        self.assertEqual(keys, set(TAX_TYPE_RATE))


# ─────────────────────────────────────────────────────────── 실데이터 안전망

class RealDataUntouched(unittest.TestCase):
    """이 테스트 파일이 사용자의 실데이터를 건드리지 않는지 스스로 확인한다."""

    def test_실데이터는_읽기만_한다(self):
        real = ROOT / "data" / "career.xlsx"
        if not real.exists():
            self.skipTest("실데이터 없음 (새로 받은 저장소)")
        before = real.stat().st_mtime
        store.read_all(real)          # 읽기는 안전해야 한다
        self.assertEqual(real.stat().st_mtime, before)


if __name__ == "__main__":
    unittest.main(verbosity=2)
