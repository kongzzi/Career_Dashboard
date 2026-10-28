// 일감 목록 (표) + 입력/수정 폼
import {
  state, el, $, won, wonShort, num, parseDate, iso, CAT_COLOR, MONEY_STATUS, dv, api, absorb, toast, WD,
  rateOfTaxType, viaAgency, costModeOf, listedDates, blank, payrollOf, assignmentsOf, sessionsOf,
} from './core.js';

const STATUS_COLOR = {
  '문의': 'var(--muted)', '확정': 'var(--s1)', '진행중': 'var(--warning)',
  '완료': 'var(--good)', '취소': 'var(--critical)',
};
const SETTLE_COLOR = { '미청구': 'var(--warning)', '청구': 'var(--s1)', '입금완료': 'var(--good)' };

const filters = { q: '', category: '', status: '', settle: '', sort: 'start_desc' };
// 골라 담은 일감 id — 화면에서만 쓰고 엑셀에는 저장하지 않는다.
// 필터를 바꿔도 유지돼야 "A 조건으로 몇 개, B 조건으로 몇 개" 식으로 모을 수 있다.
const picked = new Set();

function pill(text, color) {
  return el('span', { class: 'pill' }, [el('i', { class: 'dot', style: `background:${color}` }), text || '—']);
}

/* ── 목록 ─────────────────────────────────────────────────────────────── */
export function renderRecords(root, { openRecord, onNew }) {
  const opt = (name, key, list, placeholder) => el('select', {
    class: 'select', onchange: (e) => { filters[key] = e.target.value; rerender(); },
  }, [
    el('option', { value: '', text: placeholder }),
    ...list.map((v) => el('option', { value: v, text: v, selected: filters[key] === v })),
  ]);

  root.append(el('div', { class: 'filters' }, [
    el('input', {
      class: 'input grow', type: 'search', placeholder: '기관·발주처·과정명·주제 검색', value: filters.q,
      oninput: (e) => { filters.q = e.target.value; refreshBody(); },
    }),
    opt('업무구분', 'category', state.choices['업무구분'] || [], '업무구분 전체'),
    opt('상태', 'status', state.choices['상태'] || [], '상태 전체'),
    opt('정산', 'settle', state.choices['정산상태'] || [], '정산 전체'),
    el('select', { class: 'select', onchange: (e) => { filters.sort = e.target.value; refreshBody(); } }, [
      el('option', { value: 'start_desc', text: '최근 일정순', selected: filters.sort === 'start_desc' }),
      el('option', { value: 'start_asc', text: '오래된 일정순', selected: filters.sort === 'start_asc' }),
      el('option', { value: 'gross_desc', text: '금액 높은순', selected: filters.sort === 'gross_desc' }),
    ]),
    el('span', { style: 'flex:1' }),
    el('button', { class: 'btn btn-primary', text: '+ 새 일감', onclick: onNew }),
  ]));

  const wrap = el('div', { class: 'table-wrap' });
  root.append(wrap);
  const summary = el('div', { class: 'card-sub', style: 'margin-top:10px' });
  root.append(summary);
  const pickBar = el('div', { class: 'pick-bar', hidden: true });
  root.append(pickBar);
  refreshBody();

  function refreshBody() {
    const q = filters.q.trim().toLowerCase();
    let rows = state.records.filter((r) => {
      if (filters.category && r.category !== filters.category) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.settle && r.settle_status !== filters.settle) return false;
      if (q) {
        const hay = [r.org, r.client, r.title, r.topic, r.region, r.memo, r.contact, r.client_contact]
          .join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    rows.sort((a, b) => {
      if (filters.sort === 'gross_desc') return dv(b).gross - dv(a).gross;
      const cmp = (dv(a).start?.getTime() || 0) - (dv(b).start?.getTime() || 0);
      return filters.sort === 'start_asc' ? cmp : -cmp;
    });

    if (!rows.length) {
      wrap.replaceChildren(el('div', { class: 'empty', style: 'border:0' }, [
        el('h3', { text: state.records.length ? '조건에 맞는 일감이 없습니다' : '아직 등록된 일감이 없습니다' }),
        el('p', { text: state.records.length ? '필터를 바꿔 보세요.' : '+ 새 일감 버튼으로 첫 건을 등록하세요.' }),
      ]));
      summary.textContent = '';
      drawPickBar();
      return;
    }

    const table = el('table', { class: 'data' }, [
      el('thead', {}, [el('tr', {}, [
        el('th', { class: 'pick-col' }, [el('input', {
          type: 'checkbox', title: '보이는 일감 전체 선택',
          checked: rows.every((r) => picked.has(r.id)) || null,
          onclick: (ev) => {
            ev.stopPropagation();
            const on = ev.target.checked;
            rows.forEach((r) => (on ? picked.add(r.id) : picked.delete(r.id)));
            wrap.querySelectorAll('tbody tr').forEach((tr, i) => {
              const box = tr.querySelector('.pick-col input');
              if (box) box.checked = on;
              tr.classList.toggle('is-picked', picked.has(rows[i].id));
            });
            drawPickBar();
          },
        })]),
        ...['상태', '일정', '기관', '과정명', '구분', '대상', '시수', '단가', '총액(세전)', '입금 예상 / 실제', '정산']
          .map((h) => el('th', { text: h, class: ['시수', '단가', '총액(세전)', '입금 예상 / 실제'].includes(h) ? 'num' : '' })),
      ])]),
      el('tbody', {}, rows.map((r) => {
        const d = dv(r);
        // 개별 날짜만 적은 건도 기간이 보이도록 파생값을 쓴다
        const s = d.start ? iso(d.start) : '';
        const e = d.end ? iso(d.end) : '';
        const period = (e && e !== s ? `${s.slice(2)} ~ ${e.slice(5)}` : s.slice(2))
          + (d.occ.length > 1 ? ` (${d.occ.length}회)` : '');
        return el('tr', { class: picked.has(r.id) ? 'is-picked' : '', onclick: () => openRecord(r) }, [
          el('td', { class: 'pick-col', onclick: (ev) => ev.stopPropagation() }, [el('input', {
            type: 'checkbox', checked: picked.has(r.id) || null,
            onchange: (ev) => {
              ev.target.checked ? picked.add(r.id) : picked.delete(r.id);
              ev.target.closest('tr').classList.toggle('is-picked', picked.has(r.id));
              syncPickAll();
              drawPickBar();
            },
          })]),
          el('td', {}, [pill(r.status, STATUS_COLOR[r.status] || 'var(--muted)')]),
          el('td', { text: period || '—' }),
          // 대행사를 거친 건은 "기관 ↖ 발주처"로 두 줄 표시
          el('td', {}, viaAgency(r)
            ? [el('div', { text: r.org }),
               el('div', { class: 'via', text: `↖ ${r.client} 발주` })]
            : [r.org || r.client || '—']),
          el('td', { class: 'wrap', text: r.title || '—' }),
          el('td', {}, [pill(r.category, CAT_COLOR[r.category] || 'var(--muted)')]),
          el('td', { text: r.audience || '—' }),
          el('td', { class: 'num', text: d.hours || '—' }),
          // 월정액은 시간당단가가 없으니 월 지급액을 대신 보여준다
          el('td', { class: 'num' }, d.monthly
            ? [el('div', { text: won(d.monthlyPay) }),
               el('div', { class: 'via', text: `월정액 ×${d.months}개월` })]
            : [d.rate ? won(d.rate) : '—']),
          el('td', { class: 'num', text: d.gross ? won(d.gross) : '—' }),
          // 예상액을 항상 보여주고, 실입금이 있으면 그 아래 실제와 차액을 붙인다
          el('td', { class: 'num' }, [
            el('div', { text: d.expected ? won(d.expected) : '—' }),
            d.hasActual
              ? el('div', {
                  class: 'via',
                  style: Math.round(d.variance) === 0 ? '' : `color:${d.variance < 0 ? 'var(--critical)' : 'var(--good-text)'}`,
                  text: `실제 ${won(d.received)}`
                    + (Math.round(d.variance) === 0 ? '' : ` (${d.variance > 0 ? '+' : '−'}${wonShort(Math.abs(d.variance))})`),
                })
              : null,
          ]),
          // 경비가 강사료와 따로 도는 건은 그 상태도 함께 보여준다
          el('td', {}, [
            pill(r.settle_status, SETTLE_COLOR[r.settle_status] || 'var(--muted)'),
            d.costMode === '별도 지급' && d.reimbursable > 0
              ? el('div', { class: 'via', text: `경비 ${wonShort(d.reimbursable)}원 ${d.costStatus}` })
              : d.outOfPocket > 0
                ? el('div', { class: 'via', text: `경비 ${wonShort(d.outOfPocket)}원 자부담` })
                : null,
          ]),
        ]);
      })),
    ]);
    wrap.replaceChildren(table);
    syncPickAll();

    const counted = rows.filter((r) => MONEY_STATUS.includes(r.status));
    const g = counted.reduce((s, r) => s + dv(r).gross, 0);
    const t = counted.reduce((s, r) => s + dv(r).takeHome, 0);
    const h = counted.reduce((s, r) => s + dv(r).hours, 0);
    // 실효 단가는 시수가 있는 건만으로 — 프로젝트 총액이 섞이면 왜곡된다
    const effRows = counted.filter((r) => !dv(r).monthly && dv(r).hours > 0);
    const tH = effRows.reduce((s, r) => s + dv(r).takeHome, 0);
    const hEff = effRows.reduce((s, r) => s + dv(r).hours, 0);
    const withActual = counted.filter((r) => dv(r).hasActual);
    const vsum = withActual.reduce((s, r) => s + dv(r).variance, 0);
    const exp = counted.reduce((s, r) => s + dv(r).expected, 0);
    summary.textContent = `${rows.length}건 표시 · 집계 대상 ${counted.length}건 · 세전 ${won(g)}원`
      + ` · 입금 예상 ${won(exp)}원 · 실수령 예상 ${won(t)}원 · ${h.toFixed(h % 1 ? 1 : 0)}시간`
      + (hEff > 0 ? ` · 실효 시간당 ${won(tH / hEff)}원 (월정액 제외)` : '')
      + (withActual.length
        ? ` · 실입금 기록 ${withActual.length}건 (예상 대비 ${vsum >= 0 ? '+' : '−'}${won(Math.abs(vsum))}원)`
        : '');
    drawPickBar();
  }

  /** 보이는 행이 전부 선택됐는지에 맞춰 헤더 체크박스를 갱신 */
  function syncPickAll() {
    const boxes = [...wrap.querySelectorAll('tbody .pick-col input')];
    const head = wrap.querySelector('thead .pick-col input');
    if (!head || !boxes.length) return;
    const on = boxes.filter((b) => b.checked).length;
    head.checked = on === boxes.length;
    head.indeterminate = on > 0 && on < boxes.length;
  }

  /** 골라 담은 일감의 합계. 목록 하단 요약과 같은 계산(dv)을 쓴다. */
  function drawPickBar() {
    const sel = state.records.filter((r) => picked.has(r.id));
    pickBar.hidden = sel.length === 0;
    if (!sel.length) return;

    const money = sel.filter((r) => MONEY_STATUS.includes(r.status));
    const skipped = sel.length - money.length;
    const sum = (f) => money.reduce((a, r) => a + f(dv(r)), 0);
    const gross = sum((d) => d.gross);
    const expected = sum((d) => d.expected);
    const received = sum((d) => d.received);
    const take = sum((d) => d.takeHome);
    const hours = sum((d) => d.hours);
    const withActual = money.filter((r) => dv(r).hasActual).length;

    const item = (k, v, note) => el('div', { class: 'pick-item' }, [
      el('span', { class: 'k', text: k }),
      el('span', { class: 'v', text: v }),
      note ? el('span', { class: 'k', text: note }) : null,
    ]);

    pickBar.replaceChildren(
      el('div', { class: 'pick-head' }, [
        el('strong', { text: `선택 ${sel.length}건` }),
        skipped ? el('span', { class: 'card-sub', text: `· 집계 제외 ${skipped}건 (문의·취소)` }) : null,
        // 대시보드는 연도별로 쪼개 보여주지만 여기는 계약 전체다 — 헷갈리지 않게 못 박는다
        el('span', { class: 'card-sub', text: '· 계약 전체 기준 (연도 배분 아님)' }),
        el('span', { style: 'flex:1' }),
        el('button', { class: 'btn btn-sm', text: '선택 해제', onclick: () => { picked.clear(); refreshBody(); } }),
      ]),
      el('div', { class: 'pick-items' }, [
        item('세전 합계', won(gross) + '원'),
        item('입금 예상', won(expected) + '원'),
        item('실제 입금', won(received) + '원',
          withActual ? `${withActual}건 기록` : '전부 추정'),
        item('실수령 예상', won(take) + '원'),
        item('시수', hours ? hours.toFixed(hours % 1 ? 1 : 0) + '시간' : '—',
          hours ? `실효 ${won(take / hours)}원/시간` : null),
      ]),
    );
  }

  function rerender() { document.dispatchEvent(new CustomEvent('rerender')); }
}

/* ── 입력 폼 ──────────────────────────────────────────────────────────── */
let current = null;

const GROUPS = ['식별', '분류', '기관', '발주처', '내용', '일정', '금액', '경비', '정산', '기타'];
const WIDE = { title: 'span2', memo: 'span4', topic: 'span2', doc_link: 'span2', org: 'span2', client: 'span2', dates: 'span4' };

let manualGross = false;
let showAllFields = false;   // '모든 항목 보기' 토글
let payrollRows = [];        // 편집 중인 달별 급여 (저장 시 함께 전송)
let assignRows = [];         // 편집 중인 담당 과목·분반

/** 기본 원천징수율 설정값에 해당하는 '세금적용' 선택지를 고른다 */
function taxTypeForRate(rate) {
  const table = state.schema?.tax_type_rate || {};
  const hit = Object.entries(table).find(([, v]) => v !== null && Number(v) === Number(rate));
  return hit ? hit[0] : '직접입력';
}

/** '값이 있으면 숨기지 않는다' 예외를 적용할지.
 *  자동으로 채워지는 칸(원천징수율)이나 기본값이 들어가는 칸(경비지급방식)까지
 *  예외로 두면 아무것도 숨겨지지 않는다. */
function hasUserValue(key, cur) {
  if (key === 'tax_rate') return false;                    // 세금적용에서 자동 계산
  if (key === 'cost_covered') return num(cur.travel_cost) + num(cur.lodging_cost) + num(cur.other_cost) > 0;
  return !blank(cur[key]);
}

/** 이 건에서 실제로 쓰는 칸인가.
 *  46개를 한꺼번에 보여주면 어떤 유형이든 정신이 없다 — 고른 조건에 맞는 칸만 남긴다.
 *  단, 이미 값이 들어 있는 칸은 절대 숨기지 않는다(데이터가 눈앞에서 사라지면 안 된다). */
function fieldApplies(key, cur) {
  const monthly = cur.pay_type === '월정액(연봉제)';
  const lump = cur.pay_type === '총액 일괄';
  const hourly = !monthly && !lump;
  const format = cur.format || '';
  const oneShot = format === '단기특강(단발)';
  const costMode = costModeOf(cur);

  switch (key) {
    // 발주처 — 대행사를 거친 건에만
    case 'client_contact': case 'client_phone': return !!String(cur.client || '').trim();
    // 일정 — 하루짜리는 종료일이 필요 없고, 월정액은 요일 반복이라 개별 날짜를 안 쓴다
    case 'end_date': return !oneShot;
    case 'dates': return !oneShot && !monthly;
    case 'weekdays': return format === '정규(주간반복)' || monthly;
    // 온라인이면 지역이 의미 없다
    case 'region': return cur.mode !== '온라인';
    // 아직 청구도 안 한 건에 실입금액 칸은 이르다
    case 'paid_amount': return cur.settle_status === '청구' || cur.settle_status === '입금완료';
    case 'doc_link': return false;   // 쓸 때만 '모두 보기'로 꺼내 쓴다
    // 금액 — 급여방식이 정한다
    case 'annual_pay': case 'monthly_pay': case 'monthly_net': return monthly;
    case 'rate': return hourly;
    case 'hours': return !lump;
    case 'tax_rate': return rateOfTaxType(cur.tax_type) === null;
    // 경비 — 온라인이면 통째로 접고, 정산 칸은 별도 지급일 때만
    case 'travel_cost': case 'lodging_cost': case 'other_cost': case 'cost_covered':
      return cur.mode !== '온라인';
    case 'cost_status': case 'cost_paid_date': case 'cost_paid_amount':
      return cur.mode !== '온라인' && costMode === '별도 지급';
    // 정산
    case 'paid_months': return monthly;
    default: return true;
  }
}

export function openForm(record) {
  const fields = state.schema.fields;
  // 저장된 총액이 급여방식으로 계산한 값과 다르면 직접 입력한 값으로 보고 건드리지 않는다
  if (record && num(record.gross) > 0) {
    const base = dv({ ...record, id: '__tmp__', gross: '' });
    manualGross = Math.round(num(record.gross)) !== Math.round(base.gross);
  } else {
    manualGross = false;
  }
  current = record
    ? { ...record }
    : Object.fromEntries(fields.map((f) => [f.key, '']));
  if (!record) {
    current.status = '확정';
    current.category = '강의';
    current.subtype = '주강사';
    current.format = '단기특강(단발)';
    current.mode = '대면';
    current.pay_type = '시간급';
    current.cost_covered = '강사료와 함께';
    current.settle_status = '미청구';
    current.tax_rate = state.settings.default_tax_rate ?? 3.3;
    current.tax_type = taxTypeForRate(num(current.tax_rate));
    if (state.settings.default_rate) current.rate = state.settings.default_rate;
    current.start_date = iso(new Date());
  }

  $('#modal-title').textContent = record ? `일감 수정 · ${record.id}` : '새 일감';
  $('#btn-delete').style.display = record ? '' : 'none';

  const body = $('#modal-body');
  body.replaceChildren();

  const calc = el('div', { class: 'calc-strip' });
  body.append(calc);

  // 기관명·발주처 자동완성 — 지금까지 쓴 이름과 기관 마스터를 합쳐 매번 새로 만든다
  document.getElementById('org-list')?.remove();
  const names = new Set([
    ...state.records.flatMap((r) => [r.org, r.client]),
    ...state.orgs.map((o) => o.name),
  ].filter(Boolean));
  document.body.append(el('datalist', { id: 'org-list' },
    [...names].sort().map((o) => el('option', { value: o }))));

  payrollRows = record ? payrollOf(record.id).map((p) => ({ ...p })) : [];
  assignRows = record ? assignmentsOf(record.id).map((a) => ({ ...a })) : [];

  const wraps = new Map();      // key → 필드 컨테이너
  const groupBoxes = [];        // [fieldset, [key…]]

  for (const g of GROUPS) {
    const fs = fields.filter((f) => f.group === g && !(g === '식별' && f.key === 'id' && !record));
    if (!fs.length) continue;
    const box = el('div', { class: 'fieldset' }, [
      el('span', { class: 'fs-title', text: g }),
      el('div', { class: 'field-grid' }, fs.map(buildField)),
    ]);
    body.append(box);
    groupBoxes.push([box, fs.map((f) => f.key)]);
  }

  const assignBox = el('div', { class: 'fieldset' });
  body.append(assignBox);
  drawAssignments();

  const payrollBox = el('div', { class: 'fieldset' });
  body.append(payrollBox);
  drawPayroll();

  /** 담당 과목·분반 표 — 분반마다 요일·시각·시수가 다르므로 행으로 관리한다. */
  function drawAssignments() {
    // 정규 강의·월정액처럼 여러 분반을 맡는 형태에서만 의미가 있다
    const relevant = current.pay_type === '월정액(연봉제)' || current.format === '정규(주간반복)';
    assignBox.classList.toggle('is-hidden', !relevant);
    if (!relevant) return;

    if (!record) {
      assignBox.replaceChildren(
        el('span', { class: 'fs-title', text: '담당 과목·분반' }),
        el('p', { class: 'card-sub', text: '먼저 저장하면 과목을 추가할 수 있습니다.' }));
      return;
    }

    const weeklySum = assignRows.reduce((a, x) => a + num(x.weekly_hours), 0);
    const sessionCount = sessionsOf({ ...current, id: record.id }).length;
    const terms = [...new Set(assignRows.map((x) => x.term).filter(Boolean))];

    const cell = (a, key, type, ph) => el('input', {
      class: 'input pr-cell', type, placeholder: ph || '',
      step: type === 'number' ? 'any' : null,
      value: a[key] ?? '',
      oninput: (e) => { a[key] = e.target.value; refreshAssignFoot(); },
    });

    assignBox.replaceChildren(
      el('span', { class: 'fs-title', text: `담당 과목·분반 · ${assignRows.length}개` }),
      assignRows.length
        ? el('div', { class: 'table-wrap', style: 'margin-bottom:10px' }, [
            el('table', { class: 'data pr-table' }, [
              el('thead', {}, [el('tr', {}, ['학기', '과목명', '분반', '요일', '시작', '종료', '주당시수',
                '개강일', '주차', '대상', '인원', '강의실', '비고', '']
                .map((h) => el('th', { text: h, class: ['주당시수', '인원', '주차'].includes(h) ? 'num' : '' })))]),
              el('tbody', {}, assignRows.map((a, i) => el('tr', {}, [
                el('td', {}, [el('select', {
                  class: 'input pr-cell',
                  onchange: (e) => { a.term = e.target.value; refreshAssignFoot(); },
                }, ['', ...(state.choices['학기'] || ['1학기', '2학기'])].map((o) =>
                  el('option', { value: o, text: o || '—', selected: (a.term || '') === o })))]),
                el('td', {}, [cell(a, 'subject', 'text', '과목명')]),
                el('td', {}, [cell(a, 'section', 'text', '1분반')]),
                el('td', {}, [cell(a, 'weekdays', 'text', '월,수')]),
                el('td', {}, [cell(a, 'start_time', 'time')]),
                el('td', {}, [cell(a, 'end_time', 'time')]),
                el('td', { class: 'num' }, [cell(a, 'weekly_hours', 'number')]),
                el('td', {}, [cell(a, 'start_date', 'date')]),
                el('td', { class: 'num' }, [cell(a, 'weeks', 'number', '15')]),
                el('td', {}, [cell(a, 'audience', 'text')]),
                el('td', { class: 'num' }, [cell(a, 'headcount', 'number')]),
                el('td', {}, [cell(a, 'room', 'text')]),
                el('td', {}, [cell(a, 'memo', 'text', '공휴일 휴강 등')]),
                el('td', {}, [el('button', {
                  type: 'button', class: 'icon-btn', text: '✕',
                  onclick: () => { assignRows.splice(i, 1); drawAssignments(); },
                })]),
              ]))),
            ]),
          ])
        : el('p', { class: 'card-sub', text: '아직 등록한 과목이 없습니다.' }),
      el('div', { class: 'pr-foot' }, [
        el('span', { class: 'card-sub', id: 'as-foot',
          text: `주당 ${weeklySum}시간 · 총 ${sessionCount}회`
            + (terms.length ? ` · ${terms.join('·')}` : '') }),
        el('span', { style: 'flex:1' }),
        el('button', {
          type: 'button', class: 'btn btn-sm', text: '+ 과목 추가',
          onclick: () => {
            const prev = assignRows[assignRows.length - 1] || {};
            assignRows.push({
              record_id: record.id, subject: '', section: '', weekdays: '',
              start_time: '', end_time: '', weekly_hours: '', audience: '', headcount: '', room: '', memo: '',
              // 같은 학기 과목을 연달아 넣는 게 보통이라 학기·개강일·주차는 물려받는다
              term: prev.term || '',
              start_date: prev.start_date || (current.start_date || ''),
              weeks: prev.weeks || 15,
            });
            drawAssignments();
          },
        }),
      ]),
    );
  }

  function refreshAssignFoot() {
    const w = assignRows.reduce((a, x) => a + num(x.weekly_hours), 0);
    const n = record ? sessionsOfDraft().length : 0;
    const terms = [...new Set(assignRows.map((x) => x.term).filter(Boolean))];
    const f = $('#as-foot');
    if (f) f.textContent = `주당 ${w}시간 · 총 ${n}회` + (terms.length ? ` · ${terms.join('·')}` : '');
    updateCalc();
  }

  /** 편집 중인 배정으로 회차를 세어 본다 (저장 전 미리보기) */
  function sessionsOfDraft() {
    const saved = state.assignments;
    state.assignments = [...saved.filter((a) => String(a.record_id) !== String(record.id)), ...assignRows];
    const out = sessionsOf({ ...current, id: record.id });
    state.assignments = saved;
    return out;
  }

  /** 월정액 계약의 달별 급여 표 — 예상액은 자동, 실수령·입금일은 손으로 채운다. */
  function drawPayroll() {
    const monthly = current.pay_type === '월정액(연봉제)';
    payrollBox.classList.toggle('is-hidden', !monthly);
    if (!monthly) return;

    if (!record) {
      payrollBox.replaceChildren(
        el('span', { class: 'fs-title', text: '월별 급여' }),
        el('p', { class: 'card-sub', text: '저장하면 계약 기간·월 지급액으로 달별 행이 자동으로 만들어집니다.' }));
      return;
    }

    const rows = payrollRows;
    const paidCount = rows.filter((p) => p.status === '입금완료').length;

    const cell = (p, key, type) => el('input', {
      class: 'input pr-cell', type,
      step: type === 'number' ? '1000' : null,
      value: p[key] ?? '',
      oninput: (e) => { p[key] = e.target.value; refreshPayrollTotals(); },
    });

    payrollBox.replaceChildren(
      el('span', { class: 'fs-title', text: `월별 급여 · ${rows.length}개월 중 ${paidCount}개월 수령` }),
      rows.length
        ? el('div', { class: 'table-wrap', style: 'margin-bottom:10px' }, [
            el('table', { class: 'data pr-table' }, [
              el('thead', {}, [el('tr', {}, ['년월', '지급예정(세전)', '공제액', '실수령액', '입금일', '상태']
                .map((h) => el('th', { text: h, class: h.includes('액') ? 'num' : '' })))]),
              el('tbody', {}, rows.map((p) => el('tr', {}, [
                el('td', { text: p.month }),
                el('td', { class: 'num' }, [cell(p, 'gross', 'number')]),
                el('td', { class: 'num' }, [cell(p, 'deduction', 'number')]),
                el('td', { class: 'num' }, [cell(p, 'net', 'number')]),
                el('td', {}, [cell(p, 'paid_date', 'date')]),
                el('td', {}, [el('select', {
                  class: 'input pr-cell',
                  onchange: (e) => { p.status = e.target.value; refreshPayrollTotals(); },
                }, (state.choices['월급여상태'] || ['예정', '입금완료']).map((o) =>
                  el('option', { value: o, text: o, selected: (p.status || '예정') === o })))]),
              ]))),
              // 합계 — 눈으로 급여명세서와 대조할 수 있게 표 안에 둔다
              el('tfoot', {}, [el('tr', { class: 'pr-sum' }, [
                el('td', { text: '합계' }),
                el('td', { class: 'num', id: 'pr-sum-gross' }),
                el('td', { class: 'num', id: 'pr-sum-ded' }),
                el('td', { class: 'num', id: 'pr-sum-net' }),
                el('td', { colspan: '2', class: 'pr-sum-note', id: 'pr-sum-note' }),
              ])]),
            ]),
          ])
        : el('p', { class: 'card-sub', text: '아직 행이 없습니다. 아래 버튼으로 만들어 주세요.' }),
      el('div', { class: 'pr-foot' }, [
        el('span', { style: 'flex:1' }),
        el('button', {
          type: 'button', class: 'btn btn-sm', text: '계약 기간으로 다시 생성',
          onclick: regeneratePayroll,
        }),
      ]),
    );
    refreshPayrollTotals();
  }

  /** 표 아래 합계 — 실수령·공제는 '적어 넣은 달'만 더한다(추정치를 섞으면 검산이 안 된다) */
  function refreshPayrollTotals() {
    const rows = payrollRows;
    const filled = rows.filter((p) => !blank(p.net) || !blank(p.deduction));
    const g = rows.reduce((a, p) => a + num(p.gross), 0);
    const n = filled.reduce((a, p) => a + (!blank(p.net) ? num(p.net) : num(p.gross) - num(p.deduction)), 0);
    const ded = filled.reduce((a, p) => a + (!blank(p.deduction) ? num(p.deduction)
      : (!blank(p.net) ? num(p.gross) - num(p.net) : 0)), 0);
    const set = (id, v) => { const e = $(`#${id}`); if (e) e.textContent = v; };
    set('pr-sum-gross', won(g));
    set('pr-sum-ded', ded ? '- ' + won(ded) : '—');
    set('pr-sum-net', filled.length ? won(n) : '—');
    set('pr-sum-note', filled.length
      ? `실수령 ${filled.length}/${rows.length}개월 입력됨`
      : '실수령액을 채우면 합계가 나옵니다');
    updateCalc();
  }

  async function regeneratePayroll() {
    if (!record?.id) return;
    try {
      const data = await api('/api/payroll/generate', { method: 'POST', body: { record_id: record.id } });
      absorb(data);
      payrollRows = payrollOf(record.id).map((p) => ({ ...p }));
      drawPayroll();
      toast('달별 급여를 다시 만들었습니다. 이미 입금완료인 달은 그대로 뒀습니다.', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }

  body.append(el('label', { class: 'show-all' }, [
    el('input', {
      type: 'checkbox', checked: showAllFields || null,
      onchange: (e) => { showAllFields = e.target.checked; applyVisibility(); },
    }),
    '쓰지 않는 항목까지 모두 보기',
  ]));

  /** 조건에 안 맞는 칸을 숨긴다. 값이 들어 있으면 숨기지 않는다. */
  function applyVisibility() {
    for (const [key, wrap] of wraps) {
      const keep = showAllFields || fieldApplies(key, current) || hasUserValue(key, current);
      wrap.classList.toggle('is-hidden', !keep);
    }
    // 남은 칸이 하나도 없는 그룹은 제목까지 접는다
    for (const [box, keys] of groupBoxes) {
      const anyVisible = keys.some((k) => !wraps.get(k)?.classList.contains('is-hidden'));
      box.classList.toggle('is-hidden', !anyVisible);
    }
  }

  applyVisibility();
  syncPayType();
  syncTaxRate();
  syncCostSettle();
  syncPaidAmountLabel();
  syncSpanFromDates();
  applyVisibility();
  updateCalc();
  $('#modal-backdrop').hidden = false;
  setTimeout(() => body.querySelector('input:not([readonly]), select')?.focus(), 30);

  function buildField(f) {
    const wrap = el('div', { class: `field ${WIDE[f.key] || ''}` });
    wraps.set(f.key, wrap);
    wrap.append(el('label', { text: f.label, for: `f_${f.key}`, id: `l_${f.key}` }));

    let input;
    if (f.type === 'select') {
      const options = f.key === 'subtype'
        ? (state.schema.subtype_by_category[current.category] || state.choices['세부유형'] || [])
        : (state.choices[f.options] || []);
      input = el('select', { id: `f_${f.key}` }, [
        el('option', { value: '', text: '—' }),
        ...options.map((o) => el('option', { value: o, text: o, selected: current[f.key] === o })),
      ]);
    } else if (f.type === 'dates') {
      input = buildDatePicker();
    } else if (f.type === 'weekdays') {
      const picked = new Set(String(current.weekdays || '').split(/[,\s]+/).filter(Boolean));
      input = el('div', { class: 'wd-picker' }, WD.map((d) => el('button', {
        type: 'button', class: picked.has(d) ? 'on' : '', text: d,
        onclick: (e) => {
          picked.has(d) ? picked.delete(d) : picked.add(d);
          e.target.classList.toggle('on');
          current.weekdays = WD.filter((x) => picked.has(x)).join(',');
        },
      })));
    } else if (f.type === 'org') {
      input = el('input', { id: `f_${f.key}`, type: 'text', list: 'org-list', value: current[f.key] ?? '' });
    } else {
      const type = f.type === 'date' ? 'date' : f.type === 'time' ? 'time'
        : (f.type === 'number' || f.type === 'money') ? 'number' : 'text';
      input = el('input', {
        id: `f_${f.key}`, type,
        step: f.type === 'money' ? '1000' : f.type === 'number' ? 'any' : null,
        value: current[f.key] ?? '', readonly: f.readonly || null,
        placeholder: f.type === 'money' ? '0' : '',
      });
    }

    if (input.tagName !== 'DIV') {
      input.addEventListener('input', () => {
        current[f.key] = input.value;
        if (f.key === 'gross') manualGross = input.value !== '';
        if (['hours', 'rate', 'annual_pay', 'monthly_pay', 'start_date', 'end_date'].includes(f.key)) {
          syncAnnualToMonthly(f.key);
          autoFillGross();
        }
        updateCalc();
      });
      input.addEventListener('change', () => {
        current[f.key] = input.value;
        if (f.key === 'category') refreshSubtype();
        if (f.key === 'org' || f.key === 'client') applyOrgDefaults(input.value);
        if (f.key === 'pay_type') { syncPayType(); drawPayroll(); drawAssignments(); }
        if (f.key === 'format') drawAssignments();
        if (f.key === 'tax_type') syncTaxRate();
        if (f.key === 'cost_covered' || f.key === 'settle_status') syncCostSettle();
        if (['cost_covered', 'travel_cost', 'lodging_cost', 'other_cost'].includes(f.key)) syncPaidAmountLabel();
        if (f.key === 'mode' || f.key === 'settle_status' || f.key === 'format') applyVisibility();
        applyVisibility();
        updateCalc();
      });
    }
    wrap.append(input);
    if (f.hint) wrap.append(el('span', { class: 'hint', text: f.hint }));
    return wrap;
  }

  /** 총액을 시수×단가로 채워 둔다 — 엑셀만 열어 봐도 금액이 보이도록.
   *  사용자가 총액을 직접 건드린 뒤에는 덮어쓰지 않는다. */
  function autoFillGross() {
    if (manualGross) return;
    const d = dv({ ...current, id: '__tmp__', gross: '' });
    const v = d.monthly ? d.monthlyPay * d.months
      : current.pay_type === '총액 일괄' ? 0
      : num(current.hours) * num(current.rate);
    current.gross = v ? String(Math.round(v)) : '';
    const i = $('#f_gross');
    if (i) i.value = current.gross;
  }

  /** 연봉을 적으면 월 지급액을 12분의 1로 채운다. 월 지급액을 직접 고치면 그 값이 남는다. */
  function syncAnnualToMonthly(changedKey) {
    if (changedKey !== 'annual_pay') return;
    const a = num(current.annual_pay);
    if (!a) return;
    current.monthly_pay = String(Math.round(a / 12));
    const i = $('#f_monthly_pay');
    if (i) i.value = current.monthly_pay;
  }

  /** 급여방식에 따라 쓰는 칸만 열어 둔다. 월정액이면 시간당단가 대신 월 지급액. */
  function syncPayType() {
    const monthly = current.pay_type === '월정액(연봉제)';
    const lump = current.pay_type === '총액 일괄';
    const set = (id, on, note) => {
      const i = $(`#${id}`);
      if (!i) return;
      i.disabled = !on;
      i.title = on ? '' : (note || '');
      if (!on) { current[id.replace('f_', '')] = ''; i.value = ''; }
    };
    set('f_annual_pay', monthly, '월정액일 때만 씁니다');
    set('f_monthly_pay', monthly, '월정액일 때만 씁니다');
    set('f_monthly_net', monthly, '월정액일 때만 씁니다');
    set('f_rate', !monthly && !lump, '월정액·총액 일괄에서는 쓰지 않습니다');
    set('f_paid_months', monthly, '월정액일 때만 씁니다');
    const g = $('#f_gross');
    if (g) g.readOnly = false;
    autoFillGross();
  }

  /** 세금적용 선택에 맞춰 원천징수율 칸을 채우고 잠근다.
   *  '직접입력'일 때만 손으로 고칠 수 있다. */
  function syncTaxRate() {
    const i = $('#f_tax_rate');
    if (!i) return;
    const r = rateOfTaxType(current.tax_type);
    if (r === null) {
      i.readOnly = false;
      i.title = '';
    } else {
      current.tax_rate = String(r);
      i.value = current.tax_rate;
      i.readOnly = true;
      i.title = `'${current.tax_type}' 선택 시 자동 적용`;
    }
  }

  /** 불규칙한 날짜를 칩으로 담는 위젯.
   *  값은 "2026-08-10,2026-08-17,…" 형태로 정규화해 엑셀에도 그대로 들어간다. */
  function buildDatePicker() {
    const wrap = el('div', { class: 'date-picker' });
    const chips = el('div', { class: 'date-chips' });
    const picker = el('input', { type: 'date', class: 'date-add' });

    const add = () => {
      if (!picker.value) return;
      const list = new Set(listedDates(current).map(iso));
      list.add(picker.value);
      commit([...list].sort());
      picker.value = '';
    };
    const commit = (isoList) => {
      current.dates = isoList.join(',');
      syncSpanFromDates();
      draw();
      updateCalc();
    };
    const draw = () => {
      const list = listedDates(current).map(iso);
      chips.replaceChildren(...(list.length
        ? list.map((d) => el('span', { class: 'date-chip' }, [
            d.slice(5).replace('-', '/'),
            el('button', {
              type: 'button', 'aria-label': `${d} 삭제`, text: '✕',
              onclick: () => commit(list.filter((x) => x !== d)),
            }),
          ]))
        : [el('span', { class: 'hint', text: '비워두면 시작일~종료일 규칙을 따릅니다' })]));
    };

    picker.addEventListener('change', add);
    wrap.append(chips, el('div', { class: 'date-add-row' }, [
      picker,
      el('button', { type: 'button', class: 'btn btn-sm', text: '추가', onclick: add }),
      el('button', {
        type: 'button', class: 'btn btn-sm', text: '전체 지우기',
        onclick: () => commit([]),
      }),
    ]));
    draw();
    return wrap;
  }

  /** 개별 날짜를 고치면 시작일·종료일도 맞춰 둔다 — 엑셀만 봐도 기간을 알 수 있게. */
  function syncSpanFromDates() {
    const list = listedDates(current).map(iso);
    if (!list.length) return;
    current.start_date = list[0];
    current.end_date = list.length > 1 ? list[list.length - 1] : '';
    const s = $('#f_start_date'), e = $('#f_end_date');
    if (s) s.value = current.start_date;
    if (e) e.value = current.end_date;
    autoFillGross();
  }

  /** 경비 정산상태는 '별도 지급'일 때만 직접 고른다.
   *  '강사료와 함께'면 강사료 정산상태를 그대로 따라가므로 잠그고 값을 비춰 준다. */
  /** 경비를 강사료와 함께 받으면 실입금액은 합산 금액이다 — 라벨로 분명히 알린다. */
  function syncPaidAmountLabel() {
    const lab = $('#l_paid_amount');
    const inp = $('#f_paid_amount');
    if (!lab) return;
    const together = costModeOf(current) === '강사료와 함께'
      && (num(current.travel_cost) + num(current.lodging_cost) + num(current.other_cost)) > 0;
    lab.textContent = together ? '실입금액 (강사료+경비)' : '실입금액';
    const hint = lab.parentElement.querySelector('.hint');
    if (hint) {
      hint.textContent = together
        ? '통장에 찍힌 합산 금액 그대로 — 경비를 따로 떼지 마세요'
        : '통장에 찍힌 금액 그대로 · 비우면 예상액을 씁니다';
    }
    if (inp) inp.placeholder = together ? '강사료+경비 합계' : '0';
  }

  function syncCostSettle() {
    const sel = $('#f_cost_status');
    const dateInput = $('#f_cost_paid_date');
    const amtInput = $('#f_cost_paid_amount');
    if (!sel) return;
    const mode = costModeOf(current);
    const separate = mode === '별도 지급';
    sel.disabled = !separate;
    if (dateInput) dateInput.disabled = !separate;
    if (amtInput) amtInput.disabled = !separate;

    if (mode === '강사료와 함께') {
      sel.value = current.settle_status || '미청구';
      sel.title = '강사료 정산상태를 따라갑니다';
    } else if (!separate) {
      sel.value = '';
      sel.title = '';
    } else {
      sel.title = '';
      if (!current.cost_status) { current.cost_status = '미청구'; sel.value = '미청구'; }
    }
    if (!separate) {
      current.cost_status = '';
      current.cost_paid_date = '';
      current.cost_paid_amount = '';
      if (dateInput) dateInput.value = '';
      if (amtInput) amtInput.value = '';
    }
  }

  function refreshSubtype() {
    const sel = $('#f_subtype');
    if (!sel) return;
    const options = state.schema.subtype_by_category[current.category] || [];
    sel.replaceChildren(el('option', { value: '', text: '—' }),
      ...options.map((o) => el('option', { value: o, text: o })));
    current.subtype = options[0] || '';
    sel.value = current.subtype;
  }

  function applyOrgDefaults(name) {
    const org = state.orgs.find((o) => o.name === (name || current.org));
    if (!org) return;
    if (org.rate && !current.rate) { current.rate = org.rate; const i = $('#f_rate'); if (i) i.value = org.rate; }
    if (org.region && !current.region) { current.region = org.region; const i = $('#f_region'); if (i) i.value = org.region; }
    if (org.contact && !current.contact) { current.contact = org.contact; const i = $('#f_contact'); if (i) i.value = org.contact; }
  }

  function updateCalc() {
    // 편집 중인 월급여 표를 그대로 반영해서 계산한다 (저장 전에도 합계가 맞게)
    const saved = state.payroll;
    if (record && payrollRows.length) {
      state.payroll = [...saved.filter((p) => String(p.record_id) !== String(record.id)),
                       ...payrollRows.map((p) => ({ ...p, record_id: record.id }))];
    }
    const d = dv({ ...current, id: record ? record.id : '__tmp__' });
    state.payroll = saved;
    const auto = !num(current.gross) && num(current.hours) && num(current.rate);
    const noTax = d.taxRate === 0;
    // replaceChildren 은 el() 과 달리 null 을 걸러주지 않는다
    calc.replaceChildren(...[
      item(noTax ? '총액' : '총액(세전)', won(d.gross) + '원',
        manualGross ? '직접 입력'
          : d.monthly ? `월 ${won(d.monthlyPay)}원 × ${d.months}개월`
          : d.payType === '총액 일괄' ? '직접 입력'
          : auto ? '시수 × 단가 자동' : null),
      noTax
        ? item('원천징수', '없음', current.tax_type || '0%')
        : d.deduction.isInsurance
          ? item('4대보험 공제', '- ' + won(d.tax) + '원',
              d.monthlyNetInput !== null ? '월 실수령액 입력 기준'
                : `월 ${won(d.deduction.perMonth)}원 × ${d.months}개월`)
          : item('원천징수', '- ' + won(d.tax) + '원', `${d.taxRate.toFixed(1)}%`),
      // 4대보험 항목별 내역 — 급여명세서와 대조할 수 있게
      d.deduction.isInsurance && d.monthlyNetInput === null && d.deduction.perMonth > 0
        ? item(d.monthly ? '월 공제 내역' : '공제 내역',
            d.deduction.parts.map(([k, v]) => `${k} ${won(v)}`).join(' · '),
            d.monthly ? '월 기준 추정' : '추정')
        : null,
      // 월급여 표가 있으면 '적어 넣은 실수령의 합'이 가장 믿을 만한 숫자다
      d.hasPayroll && d.enteredCount
        ? item('실수령 합계', won(d.enteredNet) + '원',
            `${d.enteredCount}/${d.months}개월 입력`
              + (d.enteredCount < d.months ? ' · 나머지는 추정' : ''),
            'var(--good-text)')
        : null,
      d.monthly
        ? item(d.hasPayroll ? '월 평균 실수령' : '월 실수령',
            won(d.hasPayroll && d.enteredCount ? d.enteredNet / d.enteredCount : d.monthlyNet) + '원',
            (d.hasPayroll ? '' : d.monthlyNetInput !== null ? '직접 입력 · ' : '계산값 · ')
              + `${d.paidMonths}/${d.months}개월 수령`,
            d.hasPayroll ? null : 'var(--good-text)')
        : null,
      item('경비', won(d.costs) + '원',
        d.costs === 0 ? '없음'
          : d.costMode === '자부담' ? '자부담 — 실수령에서 차감'
          : d.costStatus ? `${d.costMode} · ${d.costStatus}`
          : d.costMode),
      // 통장 기준 예상액 — 실입금액과 바로 비교되도록 항상 보여준다
      item('입금 예상', won(d.expected) + '원',
        d.expectedCost > 0
          ? `강사료 ${wonShort(d.expectedFee)} + 경비 ${wonShort(d.expectedCost)}`
          : d.monthly ? `전체 ${d.months}개월분` : (noTax ? '세금 없음' : '원천징수 후')),
      d.hasActual
        ? item(d.paidTogether ? '실제 입금 (합산)' : '실제 입금', won(d.received) + '원',
            (d.paidTogether ? '강사료+경비 · ' : '')
              + (Math.round(d.variance) === 0 ? '예상과 일치'
                : `예상 대비 ${d.variance > 0 ? '+' : '−'}${won(Math.abs(d.variance))}원`),
            Math.round(d.variance) === 0 ? 'var(--good-text)'
              : d.variance < 0 ? 'var(--critical)' : 'var(--good-text)')
        : null,
      // 자부담 경비가 있으면 통장 입금액과 실제로 남는 돈이 다르다
      d.outOfPocket > 0
        ? item('실수령 예상', won(d.takeHome) + '원',
            `자부담 ${wonShort(d.outOfPocket)}원 제외`, 'var(--good-text)')
        : null,
      // 월정액은 시간당 환산이 무의미하므로 아예 내지 않는다
      d.monthly ? null
        : item('실효 시간당', d.hours ? won(d.effRate) + '원' : '—',
            d.hours ? `${d.hours}시간 기준` : '시수 미입력'),
      d.actualFee !== null && current.settle_status !== '입금완료'
        ? item('⚠ 확인', '정산상태 미완료', `실입금액이 있는데 '${current.settle_status || '미입력'}'`, 'var(--warning)')
        : null,
      item('일정 회차', d.occ.length ? d.occ.length + '회' : '—',
        d.occ.length > 1 ? `${iso(d.occ[0])} ~ ${iso(d.occ[d.occ.length - 1])}` : null),
    ].filter(Boolean));
  }
  function item(k, v, note, color) {
    return el('div', { class: 'calc-item' }, [
      el('span', { class: 'k', text: k }),
      el('span', { class: 'v', style: color ? `color:${color}` : null, text: v }),
      note ? el('span', { class: 'k', text: note }) : null,
    ]);
  }
}

export function closeForm() { $('#modal-backdrop').hidden = true; current = null; }

export async function saveForm() {
  if (!current) return;
  if (!current.start_date) { toast('시작일은 반드시 입력해 주세요.', 'err'); return; }
  if (!current.title && !current.org) { toast('과정명이나 기관명 중 하나는 입력해 주세요.', 'err'); return; }
  try {
    let data = await api('/api/records', { method: 'POST', body: current });
    // 달별 급여를 손봤으면 이어서 저장한다 (신규 건은 서버가 방금 만들어 준 행을 그대로 둔다)
    const id = String(current.id || '').trim();
    if (id && payrollRows.length) {
      data = await api('/api/payroll', { method: 'POST', body: { record_id: id, rows: payrollRows } });
    }
    if (id && (assignRows.length || assignmentsOf(id).length)) {
      data = await api('/api/assignments', { method: 'POST', body: { record_id: id, rows: assignRows } });
    }
    absorb(data);
    closeForm();
    toast('엑셀에 저장했습니다.', 'ok');
    document.dispatchEvent(new CustomEvent('rerender'));
  } catch (e) {
    toast(e.message, 'err');
  }
}

export async function deleteCurrent() {
  if (!current?.id) return;
  if (!confirm(`${current.id} 일감을 삭제할까요? (엑셀에서도 지워집니다)`)) return;
  try {
    const data = await api(`/api/records/${encodeURIComponent(current.id)}`, { method: 'DELETE' });
    absorb(data);
    closeForm();
    toast('삭제했습니다.', 'ok');
    document.dispatchEvent(new CustomEvent('rerender'));
  } catch (e) {
    toast(e.message, 'err');
  }
}
