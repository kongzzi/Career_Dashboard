// core.js 회귀 테스트 — derive() / sessionsOf() / incomeSchedule 의 계산 규칙.
//
//     node --test tests/
//
// core.js 는 DOM 을 모듈 최상위에서 건드리지 않으므로 브라우저 없이 그대로 import 된다.
// 기대값은 전부 손으로 계산해 주석에 근거를 남겼다 — 숫자가 틀리면 코드가 아니라
// 이 주석부터 읽고 어느 쪽이 맞는지 판단할 것.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  state, derive, rebuild, dv, sessionsOf, occurrences, listedDates, parseDateList,
  monthlyIncome, monthsBetween, taxRateOf, costModeOf, payerOf, venueOf, viaAgency,
  iso, parseDate,
} from '../web/js/core.js';

// server/schema.py 의 TAX_TYPE_RATE 사본. 실제로는 /api/bootstrap 이 내려준다.
// 여기가 schema.py 와 어긋나면 test_store.py 의 TaxTypeTable 테스트가 잡아낸다.
const TAX_TYPE_RATE = {
  '사업소득 3.3%': 3.3,
  '기타소득 8.8%': 8.8,
  '미적용 (세금 없음)': 0,
  '직접입력': null,
  '4대보험 (근로소득)': null,
};

/** state 를 깨끗이 세우고 파생값 캐시를 다시 만든다 */
function setup({ records = [], assignments = [], payroll = [], settings = {} } = {}) {
  state.records = records;
  state.assignments = assignments;
  state.payroll = payroll;
  state.orgs = [];
  state.settings = { default_tax_rate: 3.3, ...settings };
  state.schema = { tax_type_rate: TAX_TYPE_RATE };
  state.basis = 'cash';
  rebuild();
}

const isoList = (ds) => ds.map(iso);

/* ══════════════════════════════════════════════════ 날짜 목록 파싱 */
// test_store.py 의 ParseDateList 와 같은 입력·같은 기대값이어야 한다.
// (웹으로 넣든 엑셀에 직접 적든 똑같이 해석되는 것이 규칙)

test('parseDateList — 연·월을 이어받는 축약', () => {
  assert.deepEqual(isoList(parseDateList('2026-08-10, 08-17, 24')),
    ['2026-08-10', '2026-08-17', '2026-08-24']);
});

test('parseDateList — 달이 바뀌면 따라간다', () => {
  assert.deepEqual(isoList(parseDateList('2026-08-31, 09-01, 15')),
    ['2026-08-31', '2026-09-01', '2026-09-15']);
});

test('parseDateList — 슬래시·점 구분자', () => {
  assert.deepEqual(isoList(parseDateList('2026/08/10, 8.17')),
    ['2026-08-10', '2026-08-17']);
});

test('parseDateList — 엑셀이 날짜로 바꿔버린 문자열', () => {
  assert.deepEqual(isoList(parseDateList('2026-08-10 00:00:00')), ['2026-08-10']);
});

test('parseDateList — 정렬하고 중복을 지운다', () => {
  assert.deepEqual(isoList(parseDateList('2026-03-05, 2026-03-01, 2026-03-05')),
    ['2026-03-01', '2026-03-05']);
});

test('parseDateList — fallback 연도', () => {
  assert.deepEqual(isoList(parseDateList('8/10', 2025)), ['2025-08-10']);
});

test('parseDateList — 달 없이 일만 적으면 무시', () => {
  assert.deepEqual(parseDateList('24, 25'), []);
});

/* ══════════════════════════════════════════════════ 일정 우선순위 */
// 개별 날짜 > 요일 반복 > 연속 기간(31일 이내) > 시작일 하나

test('occurrences — 개별 날짜가 요일·기간을 이긴다', () => {
  const r = {
    dates: '2026-08-10, 08-17, 24',
    start_date: '2026-08-01', end_date: '2026-08-31', weekdays: '월,수',
  };
  assert.deepEqual(isoList(occurrences(r)),
    ['2026-08-10', '2026-08-17', '2026-08-24']);
});

test('occurrences — 요일 반복', () => {
  // 2026-03-02 는 월요일. 3/2~3/31 사이의 월·수는 9번.
  const r = { start_date: '2026-03-02', end_date: '2026-03-31', weekdays: '월,수' };
  assert.deepEqual(isoList(occurrences(r)), [
    '2026-03-02', '2026-03-04', '2026-03-09', '2026-03-11', '2026-03-16',
    '2026-03-18', '2026-03-23', '2026-03-25', '2026-03-30',
  ]);
});

test('occurrences — 31일 이내면 매일', () => {
  const r = { start_date: '2026-05-01', end_date: '2026-05-10' };
  assert.equal(occurrences(r).length, 10);
});

test('occurrences — 장기 프로젝트는 시작일 하나', () => {
  // 31일을 넘고 요일도 없으면 달력을 도배하지 않는다 — 기간은 타임라인이 보여준다
  const r = { start_date: '2026-03-01', end_date: '2026-12-31' };
  assert.deepEqual(isoList(occurrences(r)), ['2026-03-01']);
});

test('occurrences — 요일이 기간 안에 없으면 시작일 하나', () => {
  const r = { start_date: '2026-03-02', end_date: '2026-03-04', weekdays: '토,일' };
  assert.deepEqual(isoList(occurrences(r)), ['2026-03-02']);
});

test('occurrences — 종료일이 없으면 하루', () => {
  assert.deepEqual(isoList(occurrences({ start_date: '2026-05-01' })), ['2026-05-01']);
});

/* ══════════════════════════════════════════════════ 세율 */

test('taxRateOf — 세금적용이 원천징수율 칸을 이긴다', () => {
  setup();
  // 엑셀에서 '미적용'으로 바꿨는데 원천징수율에 3.3 이 남아 있어도 0 이어야 한다
  assert.equal(taxRateOf({ tax_type: '미적용 (세금 없음)', tax_rate: 3.3 }), 0);
  assert.equal(taxRateOf({ tax_type: '사업소득 3.3%', tax_rate: 99 }), 3.3);
  assert.equal(taxRateOf({ tax_type: '기타소득 8.8%' }), 8.8);
});

test('taxRateOf — 직접입력이면 원천징수율 칸을 쓴다', () => {
  setup();
  assert.equal(taxRateOf({ tax_type: '직접입력', tax_rate: 5 }), 5);
});

test('taxRateOf — 목록에 없는 항목은 라벨의 숫자를 읽는다', () => {
  setup();
  // 사용자가 설정 시트에 직접 추가한 항목
  assert.equal(taxRateOf({ tax_type: '지방소득세 12.5%' }), 12.5);
});

test('taxRateOf — 아무것도 없으면 기본 원천징수율', () => {
  setup({ settings: { default_tax_rate: 3.3 } });
  assert.equal(taxRateOf({ tax_type: '', tax_rate: '' }), 3.3);
});

/* ══════════════════════════════════════════════════ 금액 — 시간급 */

test('derive — 시간급 · 사업소득 3.3%', () => {
  setup();
  // 30시간 × 5만원 = 150만 / 3.3% = 49,500 / 실수령 1,450,500
  const d = derive({ id: 'R1', pay_type: '시간급', hours: 30, rate: 50000, tax_type: '사업소득 3.3%' });
  assert.equal(d.gross, 1_500_000);
  assert.equal(d.tax, 49_500);
  assert.equal(d.net, 1_450_500);
  assert.equal(d.takeHome, 1_450_500);
  assert.equal(d.effRate, 48_350);       // 1,450,500 ÷ 30
});

test('derive — 기타소득 8.8%', () => {
  setup();
  const d = derive({ id: 'R1', gross: 1_000_000, tax_type: '기타소득 8.8%' });
  assert.equal(d.tax, 88_000);
  assert.equal(d.net, 912_000);
});

test('derive — 총액을 직접 넣으면 시수×단가를 이긴다', () => {
  setup();
  const d = derive({ id: 'R1', hours: 30, rate: 50000, gross: 2_000_000, tax_type: '미적용 (세금 없음)' });
  assert.equal(d.gross, 2_000_000);
  assert.equal(d.tax, 0);
});

/* ══════════════════════════════════════════════════ 경비 */

test('derive — 자부담 경비는 실수령에서 빠지고 입금 예상은 안 건드린다', () => {
  setup();
  const d = derive({
    id: 'R1', gross: 1_000_000, tax_type: '사업소득 3.3%',
    travel_cost: 50_000, cost_covered: '자부담',
  });
  assert.equal(d.net, 967_000);
  assert.equal(d.outOfPocket, 50_000);
  assert.equal(d.takeHome, 917_000);     // 내 주머니에서 나간 돈
  assert.equal(d.reimbursable, 0);
  assert.equal(d.expected, 967_000);     // 통장에 찍힐 돈은 그대로
});

test('derive — 받기로 한 경비는 통과금이라 실수령을 늘리지 않는다', () => {
  setup();
  const d = derive({
    id: 'R1', gross: 1_000_000, tax_type: '사업소득 3.3%',
    travel_cost: 50_000, cost_covered: '강사료와 함께', settle_status: '미청구',
  });
  assert.equal(d.takeHome, 967_000);         // 실수령 예상 = 세후 강사료
  assert.equal(d.expected, 1_017_000);       // 입금 예상 = 세후 + 경비
});

test('derive — 강사료는 받았는데 경비는 아직 (별도 지급)', () => {
  setup();
  const d = derive({
    id: 'R1', gross: 1_000_000, tax_type: '사업소득 3.3%',
    travel_cost: 50_000, cost_covered: '별도 지급', cost_status: '청구',
    settle_status: '입금완료',
  });
  assert.equal(d.feeReceived, 967_000);
  assert.equal(d.costReceived, 0);
  assert.equal(d.feeOutstanding, 0);
  assert.equal(d.costOutstanding, 50_000);   // 이 상태가 보이는 것이 '별도 지급'의 이유
});

test('derive — 예전 값 "지급"/"미지급"도 읽는다', () => {
  assert.equal(costModeOf({ cost_covered: '지급' }), '강사료와 함께');
  assert.equal(costModeOf({ cost_covered: '미지급' }), '자부담');
  assert.equal(costModeOf({ cost_covered: '' }), '해당없음');
});

/* ══════════════════════════════════════════════════ 합산 입금 (회귀) */

test('derive — 경비를 강사료와 함께 받으면 두 번 더하지 않는다', () => {
  // 2026-08-10 에 잡은 버그: 실입금액을 강사료 단독으로 가정해 경비가 두 번 들어갔다.
  // '강사료와 함께'면 실입금액이 곧 합산 금액이다.
  setup();
  const d = derive({
    id: 'R1', gross: 1_000_000, tax_type: '사업소득 3.3%',
    travel_cost: 30_000, other_cost: 20_000,
    cost_covered: '강사료와 함께', settle_status: '입금완료',
    paid_amount: 1_017_000,                  // 967,000 + 50,000 이 한 번에 들어옴
  });
  assert.equal(d.paidTogether, true);
  assert.equal(d.feeReceived, 967_000);
  assert.equal(d.costReceived, 50_000);
  assert.equal(d.received, 1_017_000);       // 1,067,000 이 되면 그 버그가 돌아온 것
  assert.equal(d.feeVariance, 0);
  assert.equal(d.costVariance, null);        // 합산이면 차액도 한 번만 센다
  assert.equal(d.variance, 0);
});

test('derive — 부분 입금은 차액만 미수금으로 남는다', () => {
  setup();
  // 967,000 청구 → 100,000 만 입금 → 867,000 미수
  const d = derive({
    id: 'R1', gross: 1_000_000, tax_type: '사업소득 3.3%',
    settle_status: '청구', paid_amount: 100_000,
  });
  assert.equal(d.feeReceived, 100_000);
  assert.equal(d.feeOutstanding, 867_000);
});

/* ══════════════════════════════════════════════════ 월정액 · 4대보험 */

// 4대보험 근로자 부담 (설정 기본값 기준, 월 급여 400만원):
//   국민연금  4,000,000 × 4.5%   = 180,000
//   건강보험  4,000,000 × 3.545% = 141,800
//   장기요양    141,800 × 12.95% =  18,363   (건강보험료 대비)
//   고용보험  4,000,000 × 0.9%   =  36,000
//   소득세                        =       0   (기본 0% — 간이세액표라 계산 불가)
//   ─────────────────────────────────────────
//   월 공제                        = 376,163
const DED_400 = 376_163;

test('derive — 월정액 · 4대보험은 월 급여에 요율을 적용한 뒤 개월수를 곱한다', () => {
  setup();
  const d = derive({
    id: 'R1', pay_type: '월정액(연봉제)', annual_pay: 48_000_000,
    start_date: '2026-09-01', end_date: '2027-02-28',
    tax_type: '4대보험 (근로소득)', hours: 30,
  });
  assert.equal(d.monthly, true);
  assert.equal(d.months, 6);
  assert.equal(d.monthlyPay, 4_000_000);        // 연봉의 12분의 1
  assert.equal(d.gross, 24_000_000);
  assert.equal(d.deduction.perMonth, DED_400);
  assert.equal(d.tax, DED_400 * 6);             // 2,256,978
  assert.equal(d.net, 21_743_022);
  assert.equal(d.monthlyNet, 3_623_837);
  assert.equal(d.effRate, 0);                   // 월정액은 시간당 환산을 하지 않는다
  assert.equal(d.deduction.parts.length, 4);    // 소득세 0%는 항목에서 뺀다
});

test('derive — 월 실수령액을 적으면 공제 계산을 이긴다', () => {
  setup();
  const d = derive({
    id: 'R1', pay_type: '월정액(연봉제)', monthly_pay: 4_000_000, monthly_net: 3_700_000,
    start_date: '2026-09-01', end_date: '2027-02-28', tax_type: '4대보험 (근로소득)',
  });
  assert.equal(d.net, 22_200_000);              // 370만 × 6
  assert.equal(d.tax, 1_800_000);               // 공제액은 역산된다
});

test('monthsBetween — 계약이 걸치는 달 수', () => {
  assert.equal(monthsBetween(parseDate('2026-09-01'), parseDate('2027-02-28')), 6);
  assert.equal(monthsBetween(parseDate('2026-09-01'), parseDate('2026-09-30')), 1);
  assert.equal(monthsBetween(parseDate('2026-09-01'), null), 1);
});

/* ══════════════════════════════════════════════════ 월급여 시트가 이긴다 */

test('derive — 월급여 행이 있으면 계약의 추정치를 대신한다', () => {
  const rec = {
    id: 'R1', pay_type: '월정액(연봉제)', monthly_pay: 4_000_000,
    start_date: '2026-09-01', end_date: '2026-11-30', tax_type: '4대보험 (근로소득)',
  };
  setup({
    records: [rec],
    payroll: [
      // 9월은 일할, 10월은 정상, 11월은 아직 안 받음
      { record_id: 'R1', month: '2026-09', gross: 2_000_000, net: 1_850_000, status: '입금완료' },
      { record_id: 'R1', month: '2026-10', gross: 4_000_000, net: 3_620_000, status: '입금완료' },
      { record_id: 'R1', month: '2026-11', gross: 4_000_000, net: '', status: '예정' },
    ],
  });
  const d = dv(rec);

  assert.equal(d.hasPayroll, true);
  assert.equal(d.gross, 10_000_000);            // 행 합계가 계약 추정(1,200만)을 이긴다
  // 11월은 실수령 미기입 → 그 달 지급액으로 추정: 4,000,000 − 376,163
  assert.equal(d.net, 1_850_000 + 3_620_000 + 3_623_837);
  assert.equal(d.months, 3);
  assert.equal(d.paidMonths, 2);
  assert.equal(d.feeReceived, 5_470_000);       // 입금완료인 달의 실수령 합
  assert.equal(d.feeOutstanding, 3_623_837);    // 아직 '예정'인 11월치
  assert.equal(d.enteredCount, 2);              // 손으로 적은 달만
  assert.equal(d.enteredNet, 5_470_000);
  assert.equal(d.enteredGross, 6_000_000);
});

test('derive — 상여가 있는 달은 그 달 지급액으로 추정한다', () => {
  // 초기 버그: 실수령 미기입 달을 '월 지급액' 으로 고정 추정해 상여 달이 틀렸다.
  const rec = {
    id: 'R1', pay_type: '월정액(연봉제)', monthly_pay: 4_000_000, monthly_net: 3_700_000,
    start_date: '2026-12-01', end_date: '2027-01-31', tax_type: '4대보험 (근로소득)',
  };
  setup({
    records: [rec],
    payroll: [
      { record_id: 'R1', month: '2026-12', gross: 4_000_000, net: '', status: '예정' },
      { record_id: 'R1', month: '2027-01', gross: 6_000_000, net: '', status: '예정' },   // 상여
    ],
  });
  const d = dv(rec);
  const sched = d.incomeSchedule;

  // 평소와 같은 달이면 직접 적은 월 실수령액을 그대로 쓴다
  assert.equal(sched[0].amount, 3_700_000);
  // 상여 달은 그 달 지급액 600만원 기준으로 다시 계산한다
  //   국민연금 270,000 + 건강보험 212,700 + 장기요양 27,545 + 고용보험 54,000 = 564,245
  assert.equal(sched[1].amount, 6_000_000 - 564_245);   // 5,435,755
  assert.equal(d.net, 3_700_000 + 5_435_755);
});

test('derive — 공제액만 적어도 실수령을 역산한다', () => {
  const rec = {
    id: 'R1', pay_type: '월정액(연봉제)', monthly_pay: 4_000_000,
    start_date: '2026-09-01', end_date: '2026-09-30', tax_type: '4대보험 (근로소득)',
  };
  setup({
    records: [rec],
    payroll: [{ record_id: 'R1', month: '2026-09', gross: 4_000_000, deduction: 380_000, status: '입금완료' }],
  });
  assert.equal(dv(rec).net, 3_620_000);
});

/* ══════════════════════════════════════════════════ 강의배정 (분반) */

test('sessionsOf — 개강일부터 주차만큼만 펼친다', () => {
  // 계약은 1년이지만 1학기 과목은 15주로 끝나야 한다 (초기 버그: 2월까지 달력에 떴다)
  const rec = { id: 'R1', start_date: '2026-09-01', end_date: '2027-08-31' };
  setup({
    records: [rec],
    assignments: [{
      record_id: 'R1', term: '1학기', subject: 'AI 이해와 활용', section: '1분반',
      weekdays: '화,목', weekly_hours: 3, start_date: '2026-09-01', weeks: 15,
      start_time: '10:00', end_time: '12:00',
    }],
  });
  const s = sessionsOf(rec);

  assert.equal(s.length, 30);                        // 15주 × 주 2회
  assert.equal(iso(s[0].date), '2026-09-01');        // 개강일(화)
  assert.equal(iso(s.at(-1).date), '2026-12-10');    // 15주차 목요일
  assert.equal(s.at(-1).date.getFullYear(), 2026);   // 2027년으로 새지 않는다
  assert.equal(s[0].hours, 1.5);                     // 주당 3시간 ÷ 주 2회
  assert.equal(s[0].label, 'AI 이해와 활용 1분반');
  assert.equal(s[0].start, '10:00');
});

test('sessionsOf — 계약 종료일이 주차보다 짧으면 거기서 끊는다', () => {
  const rec = { id: 'R1', start_date: '2026-09-01', end_date: '2026-10-31' };
  setup({
    records: [rec],
    assignments: [{
      record_id: 'R1', subject: 'AI', weekdays: '화,목',
      weekly_hours: 3, start_date: '2026-09-01', weeks: 15,
    }],
  });
  // 9월 9회 + 10월 9회
  assert.equal(sessionsOf(rec).length, 18);
});

test('sessionsOf — 분반이 여럿이면 각각 펼친다', () => {
  const rec = { id: 'R1', start_date: '2026-09-01', end_date: '2026-12-31' };
  setup({
    records: [rec],
    assignments: [
      { record_id: 'R1', subject: 'AI', section: '1분반', weekdays: '화', weekly_hours: 2, start_date: '2026-09-01', weeks: 15 },
      { record_id: 'R1', subject: 'AI', section: '2분반', weekdays: '목', weekly_hours: 2, start_date: '2026-09-03', weeks: 15 },
    ],
  });
  const s = sessionsOf(rec);
  assert.equal(s.length, 30);
  assert.equal(s.filter((x) => x.section === '1분반').length, 15);
  assert.equal(s.filter((x) => x.section === '2분반').length, 15);
  // 날짜순으로 섞여 나온다 (달력이 그대로 쓴다)
  assert.deepEqual(isoList(s.slice(0, 3).map((x) => x.date)),
    ['2026-09-01', '2026-09-03', '2026-09-08']);
});

test('sessionsOf — 배정이 없으면 일감 자체의 요일로 한 줄', () => {
  const rec = {
    id: 'R1', title: '단기특강', start_date: '2026-03-02', end_date: '2026-03-31',
    weekdays: '월,수', start_time: '14:00',
  };
  setup({ records: [rec] });
  const s = sessionsOf(rec);
  assert.equal(s.length, 9);
  assert.equal(s[0].label, '단기특강');
  assert.equal(s[0].start, '14:00');
  assert.equal(s[0].section, '');
});

test('derive — 총시수를 비우면 배정에서 계산한다', () => {
  const rec = { id: 'R1', start_date: '2026-09-01', end_date: '2026-12-31', hours: '' };
  setup({
    records: [rec],
    assignments: [{
      record_id: 'R1', subject: 'AI', weekdays: '화,목',
      weekly_hours: 3, start_date: '2026-09-01', weeks: 15,
    }],
  });
  assert.equal(dv(rec).hours, 45);      // 1.5시간 × 30회
});

/* ══════════════════════════════════════════════════ 수업일과 수입일의 분리 */

test('incomeSchedule — 월정액은 수업이 주 2회여도 수입은 달마다', () => {
  // 이 분리를 없애면 초빙교수 월급이 수업 횟수만큼 쪼개진다.
  const rec = {
    id: 'R1', pay_type: '월정액(연봉제)', annual_pay: 48_000_000,
    start_date: '2026-09-01', end_date: '2027-02-28', tax_type: '4대보험 (근로소득)',
  };
  setup({
    records: [rec],
    assignments: [{
      record_id: 'R1', subject: 'AI', weekdays: '화,목',
      weekly_hours: 3, start_date: '2026-09-01', weeks: 15,
    }],
  });
  const d = dv(rec);

  assert.equal(sessionsOf(rec).length, 30);        // 달력에는 수업이 30번 뜨고
  assert.equal(d.incomeSchedule.length, 6);        // 수입은 6개월치로만 잡힌다
  assert.deepEqual(isoList(d.incomeSchedule.map((x) => x.date)),
    ['2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01']);
});

test('incomeSchedule — 월급여 행이 있으면 그 달 실제 금액으로 잡는다', () => {
  const rec = {
    id: 'R1', pay_type: '월정액(연봉제)', monthly_pay: 4_000_000,
    start_date: '2026-09-01', end_date: '2026-11-30', tax_type: '4대보험 (근로소득)',
  };
  setup({
    records: [rec],
    payroll: [
      { record_id: 'R1', month: '2026-09', gross: 2_000_000, net: 1_850_000, status: '입금완료' },
      { record_id: 'R1', month: '2026-10', gross: 4_000_000, net: 3_620_000, status: '입금완료' },
      { record_id: 'R1', month: '2026-11', gross: 4_000_000, net: '', status: '예정' },
    ],
  });
  const sched = dv(rec).incomeSchedule;

  assert.deepEqual(sched.map((x) => x.amount), [1_850_000, 3_620_000, 3_623_837]);
  assert.deepEqual(sched.map((x) => x.isActual), [true, true, false]);   // 몇 달치가 추정인지
  assert.deepEqual(sched.map((x) => x.gross), [2_000_000, 4_000_000, 4_000_000]);
});

/* ══════════════════════════════════════════════════ 월별 집계 */

test('monthlyIncome — 입금기준은 입금일에, 발생기준은 수업일에 귀속', () => {
  const rec = {
    id: 'R1', status: '완료', category: '강의',
    gross: 1_000_000, tax_type: '사업소득 3.3%',
    start_date: '2026-05-01', end_date: '2026-05-10',      // 수업은 5월
    settle_status: '입금완료', paid_date: '2026-07-15',     // 돈은 7월에
  };
  setup({ records: [rec] });

  const accrual = monthlyIncome(2026, { basis: 'accrual' });
  assert.equal(Math.round(accrual[4].total), 967_000);      // 5월
  assert.equal(Math.round(accrual[6].total), 0);

  const cash = monthlyIncome(2026, { basis: 'cash' });
  assert.equal(Math.round(cash[4].total), 0);
  assert.equal(Math.round(cash[6].total), 967_000);         // 7월
  assert.equal(Math.round(cash[6]['강의']), 967_000);
});

test('monthlyIncome — 문의·취소는 집계에서 빠진다', () => {
  const base = {
    gross: 1_000_000, tax_type: '미적용 (세금 없음)', category: '강의',
    start_date: '2026-05-01', settle_status: '입금완료', paid_date: '2026-05-10',
  };
  setup({
    records: [
      { ...base, id: 'R1', status: '완료' },
      { ...base, id: 'R2', status: '문의' },
      { ...base, id: 'R3', status: '취소' },
    ],
  });
  assert.equal(Math.round(monthlyIncome(2026)[4].total), 1_000_000);
});

test('monthlyIncome — 세전은 참고로 따로 쌓인다', () => {
  const rec = {
    id: 'R1', status: '완료', category: '강의', gross: 1_000_000, tax_type: '사업소득 3.3%',
    start_date: '2026-05-01', settle_status: '입금완료', paid_date: '2026-05-10',
  };
  setup({ records: [rec] });
  const m = monthlyIncome(2026)[4];
  assert.equal(Math.round(m.total), 967_000);      // 실입금 기준
  assert.equal(Math.round(m.gross), 1_000_000);    // 세전 (참고)
});

/* ══════════════════════════════════════════════════ 기관 / 발주처 */

test('발주처가 비어 있으면 기관이 곧 발주처', () => {
  assert.equal(payerOf({ org: '○○대학교', client: '' }), '○○대학교');
  assert.equal(payerOf({ org: '○○대학교', client: '△△교육원' }), '△△교육원');
  assert.equal(venueOf({ org: '○○대학교', client: '△△교육원' }), '○○대학교');
  assert.equal(viaAgency({ org: '○○대학교', client: '△△교육원' }), true);
  assert.equal(viaAgency({ org: '○○대학교', client: '' }), false);
  assert.equal(viaAgency({ org: '○○대학교', client: '○○대학교' }), false);
  assert.equal(payerOf({ org: '', client: '' }), '(미입력)');
});

/* ══════════════════════════════════════════════════ 기간 */

test('listedDates — 개별 날짜가 곧 계약 기간', () => {
  setup();
  const d = derive({ id: 'R1', dates: '2026-08-10, 08-17, 24', gross: 900_000, tax_type: '미적용 (세금 없음)' });
  assert.equal(iso(d.start), '2026-08-10');
  assert.equal(iso(d.end), '2026-08-24');
  assert.equal(d.occ.length, 3);
  assert.equal(listedDates({ dates: '2026-08-10, 08-17, 24' }).length, 3);
  // 수입은 수업일마다 나뉜다 (월정액이 아니므로)
  assert.equal(d.incomeSchedule.length, 3);
  assert.equal(d.incomeSchedule[0].amount, 300_000);
});
