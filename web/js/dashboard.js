// 수입 현황 중심 대시보드
import {
  state, el, won, wonShort, num, parseDate, iso, today, addDays, fmtMD,
  CATS, CAT_COLOR, MONEY_STATUS, dv, monthlyIncome, recordsInYear, chartBox, flushCharts,
  payerOf, venueOf, viaAgency, sessionsOf,
} from './core.js';
import { stackedColumns, hBars, stackedBar, lineChart, legend } from './charts.js';

const M_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

function card(title, sub, body, cls = '') {
  return el('div', { class: `card ${cls}` }, [
    el('div', { class: 'card-head' }, [
      el('div', {}, [el('h3', { class: 'card-title', text: title })]),
      sub ? el('span', { class: 'card-sub', text: sub }) : null,
    ]),
    ...[].concat(body),
  ]);
}

function stat(label, value, unit, note) {
  return el('div', { class: 'card stat' }, [
    el('span', { class: 'stat-label', text: label }),
    el('span', { class: 'stat-value' }, [String(value), unit ? el('small', { text: unit }) : null]),
    note ? el('span', { class: 'stat-note', text: note }) : null,
  ]);
}

export function renderDashboard(root, { openRecord, onNew }) {
  const year = state.year;

  if (!state.records.length) {
    root.append(el('div', { class: 'empty' }, [
      el('h3', { text: '아직 등록된 일감이 없습니다' }),
      el('p', { text: '강의·컨설팅·프로젝트를 한 건 등록하면 여기에 수입 현황이 나타납니다.' }),
      el('button', { class: 'btn btn-primary', onclick: onNew, text: '+ 첫 일감 등록하기' }),
    ]));
    return;
  }

  const cur = monthlyIncome(year);
  const prev = monthlyIncome(year - 1);
  const total = cur.reduce((s, b) => s + b.total, 0);          // 실입금 기준
  const grossTotal = cur.reduce((s, b) => s + b.gross, 0);      // 세전 계산값 (참고)
  const actualSum = cur.reduce((s, b) => s + b.actual, 0);      // 기록에서 온 몫
  const prevTotal = prev.reduce((s, b) => s + b.total, 0);
  const hours = cur.reduce((s, b) => s + b.hours, 0);
  const take = cur.reduce((s, b) => s + b.take, 0);
  const takeH = cur.reduce((s, b) => s + b.takeH, 0);
  const effHours = cur.reduce((s, b) => s + b.effHours, 0);
  const goal = num(state.settings.annual_goal);

  const inYear = recordsInYear(year);
  const counted = inYear.filter((r) => MONEY_STATUS.includes(r.status));

  // 이번 달 (올해가 아니면 월 평균)
  const now = new Date();
  const isThisYear = year === now.getFullYear();
  const thisMonth = isThisYear ? cur[now.getMonth()].total : total / 12;
  const thisMonthGross = isThisYear ? cur[now.getMonth()].gross : grossTotal / 12;
  const thisMonthIsActual = isThisYear && cur[now.getMonth()].actual > 0;

  // 파이프라인은 전부 '실제 돈' 기준 — 받은 건 실입금액, 못 받은 건 남은 세후 금액.
  // 세전 계약 규모를 섞으면 아래 합계와 축이 어긋나므로 쓰지 않는다.
  let receivable = 0, unbilled = 0, billed = 0, paid = 0;
  let costReceivable = 0, cUnbilled = 0, cBilled = 0, cPaid = 0, costTotal = 0;
  let received = 0, variance = 0, actualCount = 0, expectedTotal = 0;
  for (const r of counted) {
    const d = dv(r);

    paid += d.feeReceived;                       // 실입금액(없으면 세후 예상)
    if (r.settle_status === '청구') billed += d.feeOutstanding;
    else if (r.settle_status !== '입금완료') unbilled += d.feeOutstanding;
    receivable += d.feeOutstanding;

    received += d.received;
    expectedTotal += d.expected;
    if (d.hasActual) { variance += d.variance; actualCount += 1; }

    if (d.reimbursable > 0) {
      costTotal += d.reimbursable;
      cPaid += d.costReceived;
      if (d.costStatus === '청구') cBilled += d.costOutstanding;
      else if (d.costStatus !== '입금완료') cUnbilled += d.costOutstanding;
    }
    costReceivable += d.costOutstanding;
  }
  receivable += costReceivable;

  // 가망 (문의 단계)
  const prospect = inYear.filter((r) => r.status === '문의').reduce((s, r) => s + dv(r).gross, 0);

  /* ── 1행: 히어로 + 스탯 ── */
  const deltaPct = prevTotal > 0 ? (total - prevTotal) / prevTotal : null;
  const hero = el('div', { class: 'card hero-card' }, [
    el('div', {}, [
      el('span', { class: 'hero-label',
        text: `${year}년 수입 · ${state.basis === 'cash' ? '입금일에 귀속' : '수업일에 귀속'} · 실입금액` }),
      el('div', { class: 'hero-value' }, [wonShort(total), el('span', { class: 'hero-unit', text: '원' })]),
      el('div', { class: 'hero-meta' }, [
        deltaPct === null ? '' : el('span', {}, [
          el('span', { class: `delta ${deltaPct >= 0 ? 'up' : 'down'}`,
            text: `${deltaPct >= 0 ? '▲' : '▼'} ${Math.abs(deltaPct * 100).toFixed(0)}%` }),
          ` ${year - 1}년 대비 · `,
        ]),
        `세전 계산값 ${wonShort(grossTotal)}원`,
      ]),
      el('div', { class: 'hero-meta', style: 'color:var(--muted);margin-top:2px',
        text: actualSum > 0
          ? `이 중 ${wonShort(actualSum)}원은 입력한 실입금액 · 나머지는 추정`
          : '아직 실입금액 기록이 없어 전부 추정입니다' }),
    ]),
    goal > 0 ? el('div', { style: 'margin-top:18px' }, [
      el('div', { class: 'hero-meta', text: `연간 목표 ${wonShort(goal)}원의 ${Math.round((total / goal) * 100)}% 달성` }),
      el('div', { class: 'goal-track' }, [
        el('div', { class: 'goal-fill', style: `width:${Math.min(100, (total / goal) * 100)}%` }),
      ]),
    ]) : el('div', { class: 'hero-meta', style: 'margin-top:14px;color:var(--muted)', text: '설정에서 연간 목표를 넣으면 달성률이 표시됩니다' }),
  ]);

  const stats = el('div', { class: 'grid g-2' }, [
    stat(isThisYear ? '이번 달 수입' : '월 평균 수입', wonShort(thisMonth), '원',
      `세전 계산값 ${wonShort(thisMonthGross)}원`
        + (isThisYear ? (thisMonthIsActual ? ' · 실입금 반영' : ' · 추정') : ' · 12개월 평균')),
    stat('받을 돈 (세후)', wonShort(receivable), '원',
      receivable > 0
        ? (costReceivable > 0 ? `강사료 + 미수령 경비 ${wonShort(costReceivable)}원 포함` : '미청구 + 청구 후 미입금')
        : '미입금 없음'),
    stat('총 시수', hours ? hours.toFixed(hours % 1 ? 1 : 0) : '0', '시간', `일감 ${counted.length}건`),
    stat('실효 시간당', effHours > 0 ? wonShort(takeH / effHours) : '—', effHours > 0 ? '원' : '',
      '세금·경비 제외 후 · 시간 기준 계약만 (월정액 제외)'),
  ]);

  root.append(el('div', { class: 'grid g-hero', style: 'margin-bottom:16px' }, [hero, stats]));

  /* ── 2행: 월별 추이 + 다가오는 일정 ── */
  const series = CATS.map((c) => ({ name: c, color: CAT_COLOR[c], values: cur.map((b) => b[c]) }));
  const activeSeries = series.filter((s) => s.values.some((v) => v > 0));

  const estimatedMonths = cur.filter((b) => b.total > 0 && b.actual === 0).length;
  const trend = card(`${year}년 월별 수입`,
    '실입금 기준 · 막대를 누르면 그 달 일감을 봅니다', [
    chartBox((w) => stackedColumns({
      width: w, height: 260, labels: M_LABELS, series: activeSeries.length ? activeSeries : series,
      onClick: (i) => openMonth(i),
      // 세전 계산값을 툴팁에 함께 — 실입금과 바로 견줄 수 있게
      extraRows: (i) => {
        const b = cur[i];
        if (!b.total) return [];
        const out = [['세전 계산값', won(b.gross) + '원']];
        out.push([b.actual > 0 && b.estimated === 0 ? '실입금 기록' : b.actual > 0 ? '일부 실입금' : '추정치',
          b.actual > 0 ? won(b.actual) + '원' : '기록 없음']);
        return out;
      },
    })),
    legend((activeSeries.length ? activeSeries : series).map((s) => ({
      name: s.name, color: s.color, note: wonShort(s.values.reduce((a, b) => a + b, 0)) + '원',
    }))),
    el('p', { class: 'card-sub', style: 'margin-top:8px',
      text: `세전 계산 합계 ${wonShort(grossTotal)}원`
        + (estimatedMonths ? ` · 실입금 미기록 ${estimatedMonths}개월은 추정치` : ' · 전 기간 실입금 반영') }),
  ]);

  const upcoming = card('다가오는 일정', '오늘부터 8건', [buildUpcoming(openRecord)]);
  root.append(el('div', { class: 'grid g-32', style: 'margin-bottom:16px' }, [trend, upcoming]));

  /* ── 3행: 기관별 + 실효단가 추이 ── */
  // 대행사를 거친 건은 "돈 준 곳"과 "강의한 곳"이 다르다. 두 관점을 토글로 모두 제공한다.
  let orgItems = [];
  const agencyCount = counted.filter(viaAgency).length;

  const orgCaption = el('p', { class: 'card-sub', style: 'margin:-6px 0 10px' });
  // 차트 박스는 한 번만 만들고, 토글은 데이터만 갈아끼운 뒤 다시 그린다
  const orgChart = chartBox((w) => (orgItems.length
    ? hBars({ width: w, items: orgItems, fmt: wonShort, color: 'var(--s1)' })
    : el('p', { class: 'card-sub', text: '데이터 없음' })));

  const orgSeg = el('div', { class: 'seg', style: 'font-size:11px' }, [
    el('button', { class: state.orgBasis !== 'venue' ? 'is-active' : '', text: '발주처', dataset: { b: 'payer' } }),
    el('button', { class: state.orgBasis === 'venue' ? 'is-active' : '', text: '기관', dataset: { b: 'venue' } }),
  ]);
  orgSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.classList.contains('is-active')) return;
    state.orgBasis = b.dataset.b;
    [...orgSeg.children].forEach((x) => x.classList.toggle('is-active', x === b));
    computeOrgs();
    flushCharts();
  });

  computeOrgs();

  const orgCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { class: 'card-title', text: '거래처별 수입' }),
      orgSeg,
    ]),
    orgCaption,
    orgChart,
    agencyCount
      ? el('p', { class: 'card-sub', style: 'margin-top:10px',
          text: `발주처와 기관이 다른 건 ${agencyCount}건 — 토글로 두 관점을 비교해 보세요` })
      : null,
  ]);

  function computeOrgs() {
    const byPayer = state.orgBasis !== 'venue';
    orgCaption.textContent = byPayer
      ? '계약·입금 주체 기준 — 실제로 돈을 준 곳'
      : '강의·업무가 이뤄진 곳 기준';
    const map = new Map();
    for (const r of counted) {
      const key = byPayer ? payerOf(r) : venueOf(r);
      const d = dv(r);
      const acc = map.get(key) || { value: 0, count: 0, hours: 0, via: 0 };
      acc.value += d.gross; acc.count += 1; acc.hours += d.hours;
      if (viaAgency(r)) acc.via += 1;
      map.set(key, acc);
    }
    orgItems = [...map.entries()]
      .map(([label, v]) => ({
        label, value: v.value,
        rows: [
          ['수입(세전)', won(v.value) + '원', 'var(--s1)'],
          ['건수', v.count + '건'],
          ['시수', v.hours.toFixed(0) + '시간'],
          ...(v.via ? [[byPayer ? '대행으로 받은 건' : '대행사 경유', v.via + '건']] : []),
        ],
      }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
  }

  const effByMonth = cur.map((b) => (b.effHours > 0 ? b.takeH / b.effHours : 0));
  const effCard = card('실효 시간당 단가', '세금·자부담 경비를 뺀 뒤 시수로 나눈 값 · 월정액 제외', [
    chartBox((w) => lineChart({
      width: w, height: 226, labels: M_LABELS.map((m) => m.replace('월', '')), values: effByMonth,
      name: '실효 시간당', color: 'var(--s1)',
    })),
  ]);
  root.append(el('div', { class: 'grid g-2', style: 'margin-bottom:16px' }, [orgCard, effCard]));

  /* ── 4행: 정산 현황 ── */
  const segs = [
    { name: '미청구', value: unbilled, color: 'var(--warning)' },
    { name: '청구(입금 대기)', value: billed, color: 'var(--s1)' },
    { name: '받음 (실입금)', value: paid, color: 'var(--good)' },
  ];
  const overdue = counted.filter((r) => {
    const due = parseDate(r.due_date);
    return r.settle_status !== '입금완료' && due && due < today();
  });

  // 경비는 강사료와 별개로 들어오는 경우가 있어 따로 한 줄 더 보여준다
  const costSegs = [
    { name: '미청구', value: cUnbilled, color: 'var(--warning)' },
    { name: '청구(입금 대기)', value: cBilled, color: 'var(--s1)' },
    { name: '받음 (실입금)', value: cPaid, color: 'var(--good)' },
  ];
  const separateCount = counted.filter((r) => dv(r).costMode === '별도 지급').length;

  const settleCard = card('정산 파이프라인', `${year}년 · 세후 실입금 기준`, [
    el('div', { class: 'card-sub', style: 'margin-bottom:6px',
      text: `강사료 · 받음 ${wonShort(paid)}원 + 미수 ${wonShort(unbilled + billed)}원` }),
    chartBox((w) => stackedBar({ width: w, segments: segs })),
    legend(segs.map((s) => ({ name: s.name, color: s.color, note: wonShort(s.value) + '원' }))),
    expectedTotal > 0
      ? el('div', { style: 'margin-top:14px;padding-top:12px;border-top:1px solid var(--border)' }, [
          el('div', { class: 'card-sub', style: 'display:flex;justify-content:space-between;gap:12px' }, [
            el('span', { text: '입금 예상 합계 · 세후 강사료 + 받을 경비' }),
            el('span', { style: 'font-weight:650;color:var(--ink)', text: won(expectedTotal) + '원' }),
          ]),
          el('div', { class: 'card-sub', style: 'display:flex;justify-content:space-between;gap:12px;margin-top:3px' }, [
            el('span', { text: actualCount ? `실제 입금 합계 · ${actualCount}건 기록됨` : '실제 입금 · 기록 없음' }),
            el('span', { style: 'font-weight:650;color:var(--ink)', text: won(received) + '원' }),
          ]),
          actualCount > 0
            ? el('div', { class: 'card-sub', style: 'display:flex;justify-content:space-between;gap:12px;margin-top:3px' }, [
                el('span', { text: '기록된 건의 예상 대비' }),
                el('span', {
                  style: `font-weight:650;color:${Math.round(variance) === 0 ? 'var(--good-text)'
                    : variance < 0 ? 'var(--critical)' : 'var(--good-text)'}`,
                  text: Math.round(variance) === 0 ? '일치'
                    : `${variance > 0 ? '+' : '−'}${won(Math.abs(variance))}원`,
                }),
              ])
            : null,
        ])
      : null,
    costTotal > 0
      ? el('div', { style: 'margin-top:16px' }, [
          el('div', { class: 'card-sub', style: 'margin-bottom:6px',
            text: `경비 · 받음 ${wonShort(cPaid)}원 + 미수 ${wonShort(cUnbilled + cBilled)}원`
                + (separateCount ? ` · 별도 지급 ${separateCount}건` : '') }),
          chartBox((w) => stackedBar({ width: w, segments: costSegs, height: 26 })),
          costReceivable > 0
            ? el('p', { class: 'card-sub', style: 'margin-top:8px',
                text: `아직 못 받은 경비 ${won(costReceivable)}원` })
            : null,
        ])
      : null,
    overdue.length
      ? el('div', { style: 'margin-top:14px;padding-top:12px;border-top:1px solid var(--border)' }, [
          el('div', { class: 'card-sub', style: 'color:var(--critical);font-weight:600;margin-bottom:6px',
            text: `⚠ 입금예정일이 지난 건 ${overdue.length}건` }),
          ...overdue.slice(0, 5).map((r) => el('div', {
            class: 'up-row', onclick: () => openRecord(r),
          }, [
            el('span', { class: 'up-bar', style: 'background:var(--critical)' }),
            el('div', { class: 'up-body' }, [
              el('div', { class: 'up-title', text: `${r.org || '-'} · ${r.title || '-'}` }),
              el('div', { class: 'up-meta', text: `예정일 ${r.due_date} · ${won(dv(r).net)}원` }),
            ]),
          ])),
        ])
      : null,
  ]);

  const prospectCard = card('가망 (문의 단계)', '아직 확정되지 않은 건', [
    el('div', { class: 'stat' }, [
      el('span', { class: 'stat-value' }, [wonShort(prospect), el('small', { text: '원' })]),
      el('span', { class: 'stat-note', text: `${inYear.filter((r) => r.status === '문의').length}건 · 확정되면 위 수치에 합산됩니다` }),
    ]),
  ]);

  root.append(el('div', { class: 'grid g-32' }, [settleCard, prospectCard]));

  function openMonth(monthIdx) {
    state.calMonth = monthIdx;
    document.dispatchEvent(new CustomEvent('goto-view', { detail: 'calendar' }));
  }
}

function buildUpcoming(openRecord) {
  const t = today();
  const horizon = addDays(t, 120);
  const items = [];
  for (const r of state.records) {
    if (r.status === '취소') continue;
    // 분반별 수업까지 보이도록 배정 기준으로 (배정이 없으면 일감 자체 일정)
    for (const ses of sessionsOf(r)) {
      if (ses.date >= t && ses.date <= horizon) items.push({ date: ses.date, r, ses });
    }
  }
  items.sort((a, b) => a.date - b.date || String(a.ses.start).localeCompare(String(b.ses.start)));
  if (!items.length) return el('p', { class: 'card-sub', text: '예정된 일정이 없습니다.' });

  return el('div', { class: 'upcoming' }, items.slice(0, 8).map(({ date, r, ses }) => {
    const dd = Math.round((date - t) / 86400000);
    return el('div', { class: 'up-row', onclick: () => openRecord(r) }, [
      el('span', { class: 'up-bar', style: `background:${CAT_COLOR[r.category] || 'var(--muted)'}` }),
      el('div', { class: 'up-body' }, [
        el('div', { class: 'up-title', text: ses.label || r.title || r.org || '(제목 없음)' }),
        el('div', { class: 'up-meta',
          text: `${r.org || '-'}${ses.start ? ' · ' + ses.start : ''}${ses.room ? ' · ' + ses.room : ''}` }),
      ]),
      el('div', { style: 'text-align:right' }, [
        el('div', { class: 'up-date', style: 'width:auto', text: fmtMD(date) }),
        el('div', { class: 'dday', text: dd === 0 ? '오늘' : `D-${dd}` }),
      ]),
    ]);
  }));
}
