// 상태, 서버 통신, 파생 계산, 포맷 — 다른 모듈이 공유하는 기반.

export const state = {
  records: [], payroll: [], assignments: [], orgs: [], settings: {}, choices: {}, schema: null,
  nextId: 'R0001', file: '',
  year: new Date().getFullYear(),
  basis: 'cash',             // cash = 입금일 기준(기본) / accrual = 수업일 기준
  orgBasis: 'payer',         // 거래처별 수입 집계 기준: payer = 발주처 / venue = 기관
  view: 'dashboard',
  calMonth: new Date().getMonth(),
  ttWeek: startOfWeek(new Date()),
};

export const MONEY_STATUS = ['확정', '진행중', '완료'];
export const CAT_COLOR = { '강의': 'var(--s1)', '컨설팅': 'var(--s2)', '프로젝트': 'var(--s3)' };
export const CATS = ['강의', '컨설팅', '프로젝트'];
export const WD = ['월', '화', '수', '목', '금', '토', '일'];
export const DEFAULT_WEEKS = 15;   // 대학 정규 학기 (schema.py와 같은 값)

/* ── DOM 헬퍼 ─────────────────────────────────────────────────────────── */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style') node.setAttribute('style', v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'text') { node.textContent = v; continue; }
    if (k.startsWith('on')) { node.addEventListener(k.slice(2), v); continue; }
    node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

/* ── 포맷 ─────────────────────────────────────────────────────────────── */
const nf = new Intl.NumberFormat('ko-KR');

export function won(n) { return nf.format(Math.round(n || 0)); }

/** 큰 금액을 만원/억 단위로 축약 — 스탯 타일과 축 눈금용 */
export function wonShort(n) {
  const v = Math.round(n || 0);
  const a = Math.abs(v);
  if (a >= 1e8) return trim(v / 1e8) + '억';
  if (a >= 1e4) return trim(v / 1e4) + '만';
  return nf.format(v);
}
function trim(x) {
  const r = Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 10) / 10;
  return nf.format(r);
}

export function pct(n, digits = 0) { return (n * 100).toFixed(digits) + '%'; }
export const num = (v) => (v === '' || v === null || v === undefined || isNaN(v) ? 0 : Number(v));
/** 값이 아예 없는가 — 0과 미입력을 구별해야 하는 곳에서 쓴다 */
export const blank = (v) => v === '' || v === null || v === undefined;

export function parseDate(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const isoMonth = (d) => iso(d).slice(0, 7);
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function startOfWeek(d) { const x = new Date(d); const w = (x.getDay() + 6) % 7; x.setDate(x.getDate() - w); x.setHours(0, 0, 0, 0); return x; }
export function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
export const fmtMD = (d) => `${d.getMonth() + 1}/${d.getDate()}`;

export function minutes(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  return m ? +m[1] * 60 + +m[2] : null;
}

/* ── 파생 계산 ────────────────────────────────────────────────────────── */

/** 자유롭게 적은 날짜 목록을 파싱한다.
 *  "2026-08-10, 08-17, 24" 처럼 앞에서 쓴 연·월을 이어받는 축약 표기를 허용해
 *  띄엄띄엄한 특강 날짜를 빨리 입력할 수 있게 한다. 중복은 지우고 날짜순으로 돌려준다. */
export function parseDateList(raw, fallbackYear) {
  if (!raw) return [];
  let y = fallbackYear || new Date().getFullYear();
  let mo = null;
  const out = [];
  for (const tok of String(raw).split(/[,;\n]+|\s{2,}/)) {
    const t = tok.trim();
    if (!t) continue;
    let m;
    if ((m = /^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/.exec(t))) {
      y = +m[1]; mo = +m[2]; out.push(new Date(y, mo - 1, +m[3]));
    } else if ((m = /^(\d{1,2})[-./]\s*(\d{1,2})$/.exec(t))) {
      mo = +m[1]; out.push(new Date(y, mo - 1, +m[2]));
    } else if ((m = /^(\d{1,2})일?$/.exec(t)) && mo) {
      out.push(new Date(y, mo - 1, +m[1]));
    }
  }
  const seen = new Set();
  return out
    .filter((d) => !isNaN(d) && (seen.has(iso(d)) ? false : seen.add(iso(d))))
    .sort((a, b) => a - b);
}

/** 개별 날짜가 적혀 있으면 그것이 곧 일정이다 */
export const listedDates = (r) => parseDateList(r.dates, parseDate(r.start_date)?.getFullYear());

/** 실제 수업/작업이 일어나는 날짜들.
 *  우선순위: 개별 날짜 > 요일 반복 > 연속 기간 > 시작일 하나. */
export function occurrences(r) {
  const listed = listedDates(r);
  if (listed.length) return listed;

  const s = parseDate(r.start_date);
  if (!s) return [];
  const e = parseDate(r.end_date) || s;
  if (e < s) return [s];

  const wds = parseWeekdays(r.weekdays);

  const out = [];
  if (wds.length) {
    for (let d = new Date(s); d <= e && out.length < 400; d = addDays(d, 1)) {
      if (wds.includes((d.getDay() + 6) % 7)) out.push(new Date(d));
    }
    return out.length ? out : [s];
  }
  const span = Math.round((e - s) / 86400000) + 1;
  if (span <= 31) {
    for (let d = new Date(s); d <= e; d = addDays(d, 1)) out.push(new Date(d));
    return out;
  }
  return [s];   // 장기 프로젝트는 시작일 하나만 — 기간은 타임라인이 보여준다
}

/** '월,수' → [0, 2] (월=0) */
export function parseWeekdays(str) {
  return String(str || '').split(/[,\s/]+/).filter(Boolean)
    .map((w) => WD.indexOf(w.replace('요일', ''))).filter((i) => i >= 0);
}

/** 계약 기간이 걸치는 달의 시작일들 (첫 달은 시작일 그대로) */
function monthStarts(start, end) {
  if (!start) return [];
  if (!end || end <= start) return [start];
  const out = [];
  const d = new Date(start.getFullYear(), start.getMonth(), 1);
  while (d <= end && out.length < 60) {
    out.push(new Date(Math.max(d, start)));
    d.setMonth(d.getMonth() + 1);
  }
  return out.length ? out : [start];
}

/** 계약 기간이 몇 달에 걸치는가 — 월정액 총액 계산의 기준 */
export function monthsBetween(start, end) {
  return Math.max(1, monthStarts(start, end).length);
}

/** 수입을 귀속시킬 날짜들.
 *  월정액은 수업이 주 2회든 상관없이 달마다 한 번 — 월급은 달 단위로 들어오니까.
 *  그 외에는 수업일이 여러 개면 그 날들에, 한 덩어리면 걸친 달마다 나눈다. */
function incomeDays(occ, start, end, monthly) {
  if (monthly) return monthStarts(start, end);
  if (occ.length > 1) return occ;
  if (!start) return [];
  return monthStarts(start, end);
}

/** 이 일감의 담당 과목·분반 */
export function assignmentsOf(id) {
  return state.assignments.filter((a) => String(a.record_id) === String(id));
}

/** 계약 기간 (개별 날짜를 적었으면 그 범위) */
export function periodOf(r) {
  const listed = listedDates(r);
  const start = listed.length ? listed[0] : parseDate(r.start_date);
  const end = listed.length ? listed[listed.length - 1] : (parseDate(r.end_date) || start);
  return { start, end };
}

/** 실제 수업 한 칸씩 — 분반마다 요일·시각이 다르므로 배정이 있으면 그쪽을 펼친다.
 *  배정이 없으면 일감 자체의 요일·시각으로 한 줄짜리 수업을 만든다. */
export function sessionsOf(r) {
  const list = assignmentsOf(r.id);
  if (!list.length) {
    return occurrences(r).map((d) => ({
      date: d, start: r.start_time || '', end: r.end_time || '',
      label: r.title || r.org || '일감', subject: '', section: '', hours: null, record: r,
    }));
  }
  const { start: cStart, end: cEnd } = periodOf(r);
  const out = [];
  for (const a of list) {
    const wds = parseWeekdays(a.weekdays);
    if (!wds.length) continue;
    // 학기는 개강일부터 N주 — 계약 기간 전체로 펼치면 1학기 과목이 2월까지 뜬다
    const open = parseDate(a.start_date) || cStart;
    if (!open) continue;
    const weeks = num(a.weeks) || DEFAULT_WEEKS;
    const close = addDays(open, weeks * 7 - 1);
    const last = cEnd && cEnd < close ? cEnd : close;
    const per = num(a.weekly_hours) / wds.length;   // 주당시수를 요일 수로 나눈 게 1회분
    for (let d = new Date(open); d <= last && out.length < 3000; d = addDays(d, 1)) {
      if (!wds.includes((d.getDay() + 6) % 7)) continue;
      out.push({
        date: new Date(d), start: a.start_time || '', end: a.end_time || '',
        label: a.section ? `${a.subject} ${a.section}` : a.subject,
        subject: a.subject, section: a.section, term: a.term || '', hours: per || null,
        room: a.room || '', record: r, assignment: a,
      });
    }
  }
  return out.sort((x, y) => x.date - y.date);
}

/** 이 일감의 달별 급여 (년월 오름차순) */
export function payrollOf(id) {
  return state.payroll
    .filter((p) => String(p.record_id) === String(id))
    .sort((a, b) => String(a.month).localeCompare(String(b.month)));
}

/** 'YYYY-MM' → 그 달 1일 */
export function monthDate(m) {
  const x = /^(\d{4})-(\d{1,2})/.exec(String(m || ''));
  return x ? new Date(+x[1], +x[2] - 1, 1) : null;
}

/** 예전 '실비지급' 값을 새 '경비지급방식'으로 읽어준다 */
const COST_MODE_ALIAS = { '지급': '강사료와 함께', '미지급': '자부담' };
export const costModeOf = (r) =>
  COST_MODE_ALIAS[r.cost_covered] || r.cost_covered || '해당없음';

/** 돈을 주는 쪽. 발주처가 비어 있으면 기관이 곧 발주처다. */
export const payerOf = (r) => (r.client || r.org || '(미입력)').trim() || '(미입력)';
/** 일이 벌어지는 쪽. */
export const venueOf = (r) => (r.org || r.client || '(미입력)').trim() || '(미입력)';
/** 대행사를 거친 건인지 */
export const viaAgency = (r) => !!(r.client && r.org && r.client.trim() !== r.org.trim());

/** '세금적용' 선택값 → 원천징수율(%).
 *  목록에 없는 항목이면 라벨 안의 "8.8%" 같은 숫자를 쓰고, 그것도 없으면 null(직접입력). */
export function rateOfTaxType(type) {
  const t = String(type || '').trim();
  if (!t) return null;
  const table = state.schema?.tax_type_rate || {};
  if (t in table) return table[t];
  const m = /(\d+(?:\.\d+)?)\s*%/.exec(t);
  return m ? Number(m[1]) : null;
}

export const INSURANCE = '4대보험 (근로소득)';

/** 4대보험 근로자 부담 요율 (설정에서 조정 가능 — 해마다 바뀐다) */
function insRates() {
  const s = state.settings || {};
  const pick = (k, d) => (blank(s[k]) ? d : num(s[k]));
  return {
    pension: pick('ins_pension', 4.5),
    health: pick('ins_health', 3.545),
    care: pick('ins_care', 12.95),          // 건강보험료 대비
    employment: pick('ins_employment', 0.9),
    incomeTax: pick('ins_income_tax', 0),
  };
}

/** 공제액 계산. 4대보험은 단일 요율이 아니라 항목별로 쌓이고,
 *  월 단위로 떼는 돈이라 월 급여에 요율을 적용한 뒤 개월수를 곱한다. */
export function computeDeduction(r, { gross, monthly, monthlyPay, months }) {
  if (String(r.tax_type || '').trim() === INSURANCE) {
    const R = insRates();
    const n = monthly ? Math.max(1, months || 1) : 1;
    const base = monthly ? (monthlyPay || gross / n) : gross;
    const pension = Math.round(base * R.pension / 100);
    const health = Math.round(base * R.health / 100);
    const care = Math.round(health * R.care / 100);
    const employment = Math.round(base * R.employment / 100);
    const incomeTax = Math.round(base * R.incomeTax / 100);
    const perMonth = pension + health + care + employment + incomeTax;
    return {
      total: perMonth * n,
      perMonth,
      isInsurance: true,
      parts: [
        ['국민연금', pension], ['건강보험', health], ['장기요양', care],
        ['고용보험', employment], ...(incomeTax ? [['소득세(추정)', incomeTax]] : []),
      ],
      rate: gross ? (perMonth * n) / gross * 100 : 0,
    };
  }
  const rate = taxRateOf(r);
  return { total: gross * rate / 100, perMonth: 0, isInsurance: false, parts: null, rate };
}

/** 이 건에 실제로 적용되는 원천징수율 */
export function taxRateOf(r) {
  const byType = rateOfTaxType(r.tax_type);
  if (byType !== null) return byType;
  if (r.tax_rate === '' || r.tax_rate === null || r.tax_rate === undefined) {
    return num(state.settings.default_tax_rate);
  }
  return num(r.tax_rate);
}

/** 레코드 하나의 금액·일정 파생값 */
export function derive(r) {
  // 기간부터 — 월정액은 총액이 계약 개월수에 달려 있다
  const occ = occurrences(r);
  const listed = listedDates(r);
  const start = listed.length ? listed[0] : parseDate(r.start_date);
  const end = listed.length ? listed[listed.length - 1] : (parseDate(r.end_date) || start);

  const payType = r.pay_type || '시간급';
  const monthly = payType === '월정액(연봉제)';
  const months = monthly && start ? monthsBetween(start, end) : 0;
  // 연봉을 적었으면 월 지급액은 그 12분의 1
  const annualPay = num(r.annual_pay);
  const monthlyPay = num(r.monthly_pay) || (annualPay ? annualPay / 12 : 0);

  // 총시수를 안 적었으면 담당 과목·분반에서 계산한다 (주당시수 × 학기 중 수업 횟수)
  const assignHours = (() => {
    if (!blank(r.hours) && num(r.hours)) return 0;
    if (!assignmentsOf(r.id).length) return 0;
    return sessionsOf(r).reduce((a, x) => a + (x.hours || 0), 0);
  })();
  const hours = num(r.hours) || assignHours;
  const rate = num(r.rate);
  const autoGross = monthly ? monthlyPay * months
    : payType === '총액 일괄' ? 0
    : hours * rate;
  const gross = num(r.gross) || autoGross;

  // 월급여 시트에 행이 있으면 그쪽이 사실이다 — 계약에서 추정한 값을 대신한다
  const rows = monthly ? payrollOf(r.id) : [];
  const hasPayroll = rows.length > 0;
  const rowNet = (p) => (!blank(p.net) ? num(p.net)
    : !blank(p.deduction) ? num(p.gross) - num(p.deduction) : null);

  const ded = computeDeduction(r, { gross: hasPayroll ? 0 : gross, monthly, monthlyPay, months });
  let tax = ded.total;
  let net = gross - tax;
  // 급여명세서의 월 실수령액을 적었으면 그 값이 공제 계산을 이긴다
  const monthlyNetInput = blank(r.monthly_net) ? null : num(r.monthly_net);
  // 실수령이 안 적힌 달은 그 달 지급액으로 추정한다.
  // 월 실수령액을 직접 넣었고 금액이 평소와 같은 달이면 그 값을 그대로 쓴다.
  const estimateNet = (rowGross) => {
    if (!rowGross) return 0;
    if (monthlyNetInput !== null && Math.round(rowGross) === Math.round(monthlyPay)) return monthlyNetInput;
    return rowGross - computeDeduction(r, { gross: rowGross, monthly: false, monthlyPay: rowGross, months: 1 }).total;
  };

  let payrollGross = 0;
  if (hasPayroll) {
    payrollGross = rows.reduce((a, p) => a + num(p.gross), 0);
    net = rows.reduce((a, p) => a + (rowNet(p) ?? estimateNet(num(p.gross))), 0);
    tax = payrollGross - net;
  } else if (monthly && months && monthlyNetInput !== null) {
    net = monthlyNetInput * months;
    tax = gross - net;
  }
  const grossFinal = hasPayroll && payrollGross ? payrollGross : gross;
  const taxRate = grossFinal ? tax / grossFinal * 100 : 0;
  const costs = num(r.travel_cost) + num(r.lodging_cost) + num(r.other_cost);
  const costMode = costModeOf(r);
  // 자부담이면 내 주머니에서 나가고, 받기로 한 경비는 통과금이라 실수령에 영향이 없다
  const outOfPocket = costMode === '자부담' ? costs : 0;
  const reimbursable = (costMode === '강사료와 함께' || costMode === '별도 지급') ? costs : 0;
  // '강사료와 함께'면 강사료 정산상태를 그대로 따라간다
  const costStatus = costMode === '강사료와 함께' ? (r.settle_status || '미청구')
    : costMode === '별도 지급' ? (r.cost_status || '미청구') : '';
  const takeHome = net - outOfPocket;

  // 실제 입금액 — 적혀 있으면 예상액보다 우선한다. 안 적었으면 null(=아직 모름).
  const actualFee = blank(r.paid_amount) ? null : num(r.paid_amount);
  const actualCost = blank(r.cost_paid_amount) ? null : num(r.cost_paid_amount);
  // 월정액은 '몇 달치를 받았는지'가 곧 입금액 — 실입금액을 적었으면 그 값이 우선한다
  const monthsFinal = hasPayroll ? rows.length : months;
  const monthlyNet = monthly && monthsFinal ? net / monthsFinal : 0;
  const paidMonths = hasPayroll
    ? rows.filter((p) => p.status === '입금완료').length
    : Math.min(num(r.paid_months), months || 0);
  const byMonths = monthly ? monthlyNet * paidMonths : 0;

  const payrollReceived = rows
    .filter((p) => p.status === '입금완료')
    .reduce((a, p) => a + (rowNet(p) ?? 0), 0);
  // 손으로 적어 넣은 실수령액만의 합계 (추정치는 빼고) — 표 합계·검산용
  const enteredRows = rows.filter((p) => rowNet(p) !== null);
  const enteredNet = enteredRows.reduce((a, p) => a + rowNet(p), 0);
  const enteredGross = enteredRows.reduce((a, p) => a + num(p.gross), 0);

  // 경비를 강사료와 함께 받으면 통장에는 한 번에 찍힌다.
  // 그러니 실입금액도 '합산 금액'으로 받고, 경비를 따로 더하지 않는다.
  const paidTogether = costMode === '강사료와 함께' && reimbursable > 0;

  let feeReceived, costReceived;
  if (paidTogether && !hasPayroll) {
    const total = actualFee !== null ? actualFee
      : r.settle_status === '입금완료' ? net + reimbursable
      : byMonths;
    costReceived = Math.min(reimbursable, Math.max(0, total));
    feeReceived = Math.max(0, total - costReceived);
  } else {
    feeReceived = hasPayroll ? payrollReceived
      : actualFee !== null ? actualFee
      : r.settle_status === '입금완료' ? net
      : byMonths;
    costReceived = actualCost !== null ? actualCost : (costStatus === '입금완료' ? reimbursable : 0);
  }

  // 일부만 들어온 경우도 있어 남은 금액으로 계산한다
  const feeOutstanding = hasPayroll ? Math.max(0, net - feeReceived)
    : r.settle_status === '입금완료' ? 0 : Math.max(0, net - feeReceived);
  const costOutstanding = paidTogether
    ? Math.max(0, reimbursable - costReceived)
    : !costStatus || costStatus === '입금완료'
      ? 0 : Math.max(0, reimbursable - (actualCost ?? 0));
  // 통장에 찍힐 예상 금액 — 세후 강사료 + 받기로 한 경비.
  // 자부담 경비를 빼는 takeHome(실수령)과는 다른 숫자다.
  const expectedFee = net;
  const expectedCost = reimbursable;
  const expected = expectedFee + expectedCost;
  // 월정액은 '지금까지 들어왔어야 할' 금액이 비교 기준 — 남은 달치는 차액이 아니다
  const expectedFeeSoFar = monthly && paidMonths ? monthlyNet * paidMonths : net;

  // 합산 입금이면 차액도 합산 기준으로 한 번만 센다
  const feeVariance = paidTogether && !hasPayroll
    ? (actualFee !== null ? actualFee - (expectedFeeSoFar + reimbursable) : null)
    : (actualFee !== null ? actualFee - expectedFeeSoFar : null);
  const costVariance = paidTogether && !hasPayroll
    ? null
    : (actualCost !== null ? actualCost - reimbursable : null);
  return {
    hours, rate, gross: grossFinal, taxRate, tax, net, takeHome,
    payType, monthly, months: monthsFinal, annualPay, monthlyPay, monthlyNet, paidMonths,
    monthlyNetInput, deduction: ded,
    costs, costMode, costStatus, reimbursable, outOfPocket, costOutstanding,
    actualFee, actualCost, feeReceived, costReceived, feeOutstanding,
    feeVariance, costVariance,
    expectedFee, expectedCost, expected, expectedFeeSoFar,
    received: feeReceived + costReceived,
    variance: (feeVariance ?? 0) + (costVariance ?? 0),
    paidTogether,
    hasActual: actualFee !== null || actualCost !== null,
    occ, start, end, incomeDays: incomeDays(occ, start, end, monthly),
    hasPayroll, payroll: rows, monthsFinal,
    enteredNet, enteredGross, enteredCount: enteredRows.length,
    assignments: assignmentsOf(r.id), assignHours,
    // 월별 수입 배분표 — 월급여가 있으면 달마다 실제 금액, 없으면 균등 배분
    // 월별 집계의 단일 창구.
    //   gross  = 세전 계약 금액 (참고용)
    //   amount = 수입으로 칠 금액 — 실입금 기록이 있으면 그 값, 없으면 세후 추정
    //   isActual = 그 금액이 실제 기록에서 나왔는지
    incomeSchedule: (() => {
      if (hasPayroll) {
        return rows.map((p) => {
          const entered = rowNet(p);
          return {
            date: monthDate(p.month), gross: num(p.gross),
            amount: entered ?? estimateNet(num(p.gross)),
            isActual: entered !== null,
            take: entered ?? estimateNet(num(p.gross)),
            paidDate: parseDate(p.paid_date), paid: p.status === '입금완료',
          };
        }).filter((x) => x.date);
      }
      const days = incomeDays(occ, start, end, monthly);
      if (!days.length) return [];
      // 실입금액을 적었으면 강사료 몫(경비 제외)을, 아니면 세후 예상을 쓴다
      const realized = actualFee !== null ? feeReceived : net;
      return days.map((d) => ({
        date: d, gross: grossFinal / days.length,
        amount: realized / days.length,
        isActual: actualFee !== null,
        take: takeHome / days.length,
        paidDate: parseDate(r.paid_date), paid: r.settle_status === '입금완료',
      }));
    })(),
    // 월정액은 시간당 환산이 무의미하다 (계약이 시간 기준이 아님)
    effRate: !monthly && hours > 0 ? takeHome / hours : 0,
    counted: MONEY_STATUS.includes(r.status),
    prospect: r.status === '문의',
  };
}

/** 캐시된 파생값 — 레코드가 바뀔 때마다 rebuild() 로 갱신 */
export const D = new Map();
export function rebuild() {
  D.clear();
  for (const r of state.records) D.set(r.id, derive(r));
}
export const dv = (r) => D.get(r.id) || derive(r);

/** 수입을 월별로 배분한다. 발생기준은 수업일에, 입금기준은 입금일에 귀속. */
export function monthlyIncome(year, { basis = state.basis, statuses = MONEY_STATUS } = {}) {
  // effHours/takeH = 실효 시간당 단가용 — 시간 기준 계약(월정액 제외)만 담는다
  const blank = () => ({ '강의': 0, '컨설팅': 0, '프로젝트': 0,
    total: 0, gross: 0, actual: 0, estimated: 0, hours: 0, take: 0, takeH: 0, effHours: 0 });
  const buckets = Array.from({ length: 12 }, blank);
  for (const r of state.records) {
    if (!statuses.includes(r.status)) continue;
    const d = dv(r);
    const cat = CATS.includes(r.category) ? r.category : '강의';
    // 월급여가 있으면 달마다 금액이 다르므로 배분표를 그대로 쓴다
    const sched = d.incomeSchedule;
    if (!sched.length) continue;
    const h = d.hours / sched.length;
    for (const item of sched) {
      const day = basis === 'cash' ? (item.paid ? item.paidDate || item.date : null) : item.date;
      if (!day || day.getFullYear() !== year) continue;
      const b = buckets[day.getMonth()];
      b[cat] += item.amount;
      b.total += item.amount;      // 실입금 기준
      b.gross += item.gross;       // 세전 계산값 (참고)
      b.hours += h;
      b.take += item.take;
      if (item.isActual) b.actual += item.amount; else b.estimated += item.amount;
      if (!d.monthly && d.hours > 0) { b.takeH += item.take; b.effHours += h; }
    }
  }
  return buckets;
}

/** 해당 연도에 걸쳐 있는 레코드 */
export function recordsInYear(year) {
  return state.records.filter((r) => {
    const d = dv(r);
    const paid = parseDate(r.paid_date);
    if (paid && paid.getFullYear() === year) return true;
    if (!d.start) return false;
    const e = d.end || d.start;
    return d.start.getFullYear() <= year && e.getFullYear() >= year;
  });
}

export function years() {
  const set = new Set([new Date().getFullYear()]);
  for (const r of state.records) {
    for (const k of ['start_date', 'end_date', 'paid_date', 'cost_paid_date']) {
      const d = parseDate(r[k]);
      if (d) set.add(d.getFullYear());
    }
    for (const d of listedDates(r)) set.add(d.getFullYear());
  }
  return [...set].sort((a, b) => b - a);
}

/* ── 차트 마운트 ──────────────────────────────────────────────────────── */
// SVG는 컨테이너 실제 폭을 알아야 정확히 그려지므로, DOM에 붙은 뒤 한 번에 렌더한다.
let pending = [];
export function chartBox(render, attrs = {}) {
  const box = el('div', attrs);
  pending.push([box, render]);
  return box;
}
export function resetCharts() { pending = []; }
export function flushCharts() {
  for (const [box, render] of pending) {
    const w = Math.max(240, Math.floor(box.clientWidth || box.parentElement?.clientWidth || 600));
    box.replaceChildren(render(w));
  }
}

/* ── 서버 통신 ────────────────────────────────────────────────────────── */
function loading(on) { document.getElementById('loading').classList.toggle('on', on); }

export function toast(msg, kind = '') {
  const wrap = document.getElementById('toast-wrap');
  const t = el('div', { class: `toast ${kind}`, text: msg });
  wrap.append(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, kind === 'err' ? 6000 : 2600);
}

export async function api(path, opts = {}) {
  loading(true);
  try {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `요청 실패 (${res.status})`);
    return data;
  } finally {
    loading(false);
  }
}

export function absorb(data) {
  if (data.records) state.records = data.records;
  if (data.payroll) state.payroll = data.payroll;
  if (data.assignments) state.assignments = data.assignments;
  if (data.orgs) state.orgs = data.orgs;
  if (data.settings) state.settings = data.settings;
  if (data.choices) state.choices = data.choices;
  if (data.schema) state.schema = data.schema;
  if (data.next_id) state.nextId = data.next_id;
  if (data.file) state.file = data.file;
  rebuild();
}
