// 일정 보기 4종: 월간 캘린더 · 연간 타임라인 · 주간 시간표 · 연간 히트맵
import {
  state, el, iso, won, wonShort, parseDate, addDays, startOfWeek, today, minutes,
  CAT_COLOR, CATS, WD, dv, recordsInYear, sessionsOf, assignmentsOf,
} from './core.js';
import { showTip, hideTip, tipRows } from './charts.js';

const MONTH_KO = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

function card(title, sub, body) {
  return el('div', { class: 'card' }, [
    (title || sub) ? el('div', { class: 'card-head' }, [
      el('h3', { class: 'card-title', text: title || '' }),
      sub ? el('span', { class: 'card-sub', text: sub }) : null,
    ]) : null,
    ...[].concat(body),
  ]);
}

const catColor = (r) => CAT_COLOR[r.category] || 'var(--muted)';
const dim = (r) => (r.status === '문의' ? 'opacity:.55;' : r.status === '취소' ? 'opacity:.3;text-decoration:line-through;' : '');

/** 날짜 → 그 날의 수업들 (분반이 여럿이면 각각 한 칸) */
function dayIndex(year) {
  const map = new Map();
  for (const r of state.records) {
    if (r.status === '취소') continue;
    for (const ses of sessionsOf(r)) {
      if (ses.date.getFullYear() !== year) continue;
      const k = iso(ses.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(ses);
    }
  }
  return map;
}

function evTip(ses) {
  const r = ses.record;
  const d = dv(r);
  return tipRows(ses.label || r.title || r.org || '(제목 없음)', [
    ['기관', r.org || '—'],
    ['구분', `${r.category || '—'}${r.subtype ? ' · ' + r.subtype : ''}`, catColor(r)],
    ['시간', ses.start ? `${ses.start}–${ses.end || ''}` : '—'],
    ...(ses.assignment ? [
      ['학기', ses.term || '—'],
      ['분반', ses.section || '—'],
      ['강의실', ses.room || '—'],
      ...(ses.assignment.memo ? [['비고', ses.assignment.memo]] : []),
    ] : []),
    ['대상', (ses.assignment?.audience) || r.audience || '—'],
  ], ['총액(세전)', won(d.gross) + '원']);
}

/* ── 월간 캘린더 ──────────────────────────────────────────────────────── */
export function renderCalendar(root, { openRecord }) {
  const year = state.year;
  const idx = dayIndex(year);

  const head = el('div', { class: 'cal-head' }, [
    el('button', { class: 'btn btn-ghost', text: '‹', onclick: () => shift(-1) }),
    el('span', { class: 'cal-title', text: `${year}년 ${MONTH_KO[state.calMonth]}` }),
    el('button', { class: 'btn btn-ghost', text: '›', onclick: () => shift(1) }),
    el('button', { class: 'btn btn-ghost', text: '오늘', onclick: () => {
      state.year = new Date().getFullYear(); state.calMonth = new Date().getMonth();
      document.dispatchEvent(new CustomEvent('rerender'));
    }}),
  ]);

  const first = new Date(year, state.calMonth, 1);
  const startCell = startOfWeek(first);
  const grid = el('div', { class: 'cal-grid' });
  ['월','화','수','목','금','토','일'].forEach((d, i) =>
    grid.append(el('div', { class: `cal-dow${i === 5 ? ' sat' : i === 6 ? ' sun' : ''}`, text: d })));

  const tdy = iso(today());
  const monthTotal = state.records.reduce((sum, r) => {
    if (r.status === '취소') return sum;
    return sum + dv(r).incomeSchedule.reduce((a, x) =>
      (x.date.getFullYear() === year && x.date.getMonth() === state.calMonth ? a + x.gross : a), 0);
  }, 0);
  for (let i = 0; i < 42; i++) {
    const d = addDays(startCell, i);
    const inMonth = d.getMonth() === state.calMonth && d.getFullYear() === year;
    const evs = idx.get(iso(d)) || [];
    const cell = el('div', { class: `cal-cell${inMonth ? '' : ' out'}${iso(d) === tdy ? ' today' : ''}` }, [
      el('div', { class: 'cal-date', text: d.getDate() }),
    ]);
    for (const ses of evs.slice(0, 3)) {
      const r = ses.record;
      const label = `${ses.start ? ses.start + ' ' : ''}${ses.label || r.title || r.org || '일감'}`;
      cell.append(el('div', {
        class: 'cal-ev', style: `border-left-color:${catColor(r)};${dim(r)}`, text: label,
        onclick: () => openRecord(r),
        onmousemove: (e) => showTip(evTip(ses), e),
        onmouseleave: hideTip,
      }));
    }
    if (evs.length > 3) cell.append(el('div', { class: 'cal-more', text: `+${evs.length - 3}건 더` }));
    grid.append(cell);
  }

  root.append(card(null, null, [head, grid,
    el('div', { class: 'card-sub', style: 'margin-top:12px', text: `이 달 배분 수입 약 ${wonShort(monthTotal)}원 · 색은 업무구분(파랑 강의 · 주황 컨설팅 · 초록 프로젝트)` }),
  ]));

  function shift(n) {
    let m = state.calMonth + n;
    if (m < 0) { m = 11; state.year -= 1; }
    if (m > 11) { m = 0; state.year += 1; }
    state.calMonth = m;
    document.dispatchEvent(new CustomEvent('rerender'));
  }
}

/* ── 연간 타임라인 ────────────────────────────────────────────────────── */
export function renderTimeline(root, { openRecord }) {
  const year = state.year;
  const y0 = new Date(year, 0, 1), y1 = new Date(year, 11, 31);
  const span = (y1 - y0) || 1;
  // 일정이 실제로 이 해에 걸치는 건만 (입금만 이 해인 건은 제외)
  const items = recordsInYear(year).filter((r) => {
    const d = dv(r);
    return r.status !== '취소' && d.start && d.start <= y1 && (d.end || d.start) >= y0;
  });

  if (!items.length) {
    root.append(el('div', { class: 'empty' }, [el('h3', { text: `${year}년 일정이 없습니다` })]));
    return;
  }

  const axis = el('div', { class: 'tl-axis' }, [
    el('div'),
    el('div', { class: 'tl-months' }, MONTH_KO.map((m) => el('div', { text: m }))),
  ]);

  const body = el('div');
  for (const cat of CATS) {
    const rows = items.filter((r) => (r.category || '강의') === cat)
      .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
    if (!rows.length) continue;
    body.append(el('div', { class: 'tl-group' }, [
      el('span', { class: 'legend-swatch', style: `background:${CAT_COLOR[cat]};display:inline-block;margin-right:6px` }),
      `${cat} ${rows.length}건`,
    ]));
    for (const r of rows) {
      const d = dv(r);
      const s = d.start < y0 ? y0 : d.start;
      const e = (d.end || d.start) > y1 ? y1 : (d.end || d.start);
      const left = ((s - y0) / span) * 100;
      const width = Math.max(0.6, ((e - s) / span) * 100);
      body.append(el('div', { class: 'tl-row' }, [
        el('div', { class: 'tl-name', onclick: () => openRecord(r), title: `${r.org || ''} ${r.title || ''}` }, [
          r.title || r.org || '(제목 없음)', el('span', { text: r.org ? ` · ${r.org}` : '' }),
        ]),
        el('div', { class: 'tl-track' }, [
          el('div', {
            class: 'tl-bar',
            style: `left:${left}%;width:${width}%;background:${CAT_COLOR[cat]};${dim(r)}`,
            onclick: () => openRecord(r),
            onmousemove: (ev) => showTip(tipRows(r.title || r.org || '일감', [
              ['기간', `${r.start_date || '?'} → ${r.end_date || r.start_date || '?'}`],
              ['형태', r.format || '—', CAT_COLOR[cat]],
              ['시수', d.hours ? d.hours + '시간' : '—'],
            ], ['총액(세전)', won(d.gross) + '원']), ev),
            onmouseleave: hideTip,
          }),
        ]),
      ]));
    }
  }

  // 오늘 표시선
  const todayPct = (today().getFullYear() === year) ? ((today() - y0) / span) * 100 : null;
  const wrap = el('div', { style: 'position:relative' }, [axis, body]);
  if (todayPct !== null) {
    wrap.append(el('div', {
      style: `position:absolute;top:22px;bottom:0;left:calc(202px + (100% - 202px) * ${todayPct / 100});width:1px;background:var(--critical);opacity:.55;pointer-events:none`,
    }));
  }
  root.append(card(`${year}년 타임라인`, '막대 하나가 일감 하나 — 학기·장기 계약의 겹침이 보입니다', [wrap]));
}

/* ── 주간 시간표 ──────────────────────────────────────────────────────── */
export function renderTimetable(root, { openRecord }) {
  const weekStart = state.ttWeek;
  const weekEnd = addDays(weekStart, 6);

  // 이 주에 걸리는 일정 수집
  const cells = Array.from({ length: 7 }, () => []);
  let minH = 9, maxH = 19, any = false;
  for (const r of state.records) {
    if (r.status === '취소') continue;
    for (const ses of sessionsOf(r)) {
      const d = ses.date;
      if (d < weekStart || d > weekEnd) continue;
      const col = (d.getDay() + 6) % 7;
      const s = minutes(ses.start), e = minutes(ses.end);
      cells[col].push({ r, s, e, date: d, ses });
      any = true;
      if (s !== null) minH = Math.min(minH, Math.floor(s / 60));
      if (e !== null) maxH = Math.max(maxH, Math.ceil(e / 60));
    }
  }
  minH = Math.max(0, Math.min(minH, 9));
  maxH = Math.min(24, Math.max(maxH, 19));
  const hours = maxH - minH;
  const HOUR_PX = 46;

  const head = el('div', { class: 'cal-head' }, [
    el('button', { class: 'btn btn-ghost', text: '‹', onclick: () => shift(-7) }),
    el('span', { class: 'cal-title', style: 'min-width:190px',
      text: `${weekStart.getFullYear()}. ${weekStart.getMonth() + 1}.${weekStart.getDate()} – ${weekEnd.getMonth() + 1}.${weekEnd.getDate()}` }),
    el('button', { class: 'btn btn-ghost', text: '›', onclick: () => shift(7) }),
    el('button', { class: 'btn btn-ghost', text: '이번 주', onclick: () => { state.ttWeek = startOfWeek(new Date()); document.dispatchEvent(new CustomEvent('rerender')); } }),
  ]);

  const grid = el('div', { class: 'tt-grid' });
  grid.append(el('div', { class: 'tt-h', text: '' }));
  WD.forEach((d, i) => {
    const day = addDays(weekStart, i);
    grid.append(el('div', { class: 'tt-h', text: `${d} ${day.getMonth() + 1}/${day.getDate()}` }));
  });

  // 시간 눈금 열
  const timeCol = el('div', { style: `position:relative;height:${hours * HOUR_PX}px;background:var(--surface-2)` });
  for (let h = minH; h < maxH; h++) {
    timeCol.append(el('div', {
      class: 'tt-time',
      style: `position:absolute;top:${(h - minH) * HOUR_PX}px;right:0;left:0`,
      text: `${h}:00`,
    }));
  }
  grid.append(timeCol);

  for (let c = 0; c < 7; c++) {
    const col = el('div', { class: 'tt-col', style: `height:${hours * HOUR_PX}px` });
    for (let h = minH + 1; h < maxH; h++) {
      col.append(el('div', { style: `position:absolute;left:0;right:0;top:${(h - minH) * HOUR_PX}px;height:1px;background:var(--grid)` }));
    }
    const list = cells[c].sort((a, b) => (a.s ?? 0) - (b.s ?? 0));
    list.forEach((item, i) => {
      const { r, s, e } = item;
      const st = s ?? minH * 60;
      const en = e ?? st + 120;
      const top = ((st - minH * 60) / 60) * HOUR_PX;
      const h = Math.max(24, ((en - st) / 60) * HOUR_PX - 2);
      const overlap = list.filter((o, k) => k !== i && (o.s ?? 0) < en && (o.e ?? (o.s ?? 0) + 120) > st).length;
      const widthPct = overlap ? 100 / (overlap + 1) : 100;
      const leftPct = overlap ? (list.slice(0, i).filter((o) => (o.s ?? 0) < en && (o.e ?? 0) > st).length) * widthPct : 0;
      col.append(el('div', {
        class: 'tt-block',
        style: `top:${top}px;height:${h}px;left:calc(${leftPct}% + 3px);width:calc(${widthPct}% - 6px);`
             + `background:color-mix(in srgb, ${catColor(r)} 16%, var(--surface));border-left-color:${catColor(r)};${dim(r)}`,
        onclick: () => openRecord(r),
        onmousemove: (ev) => showTip(evTip(item.ses), ev),
        onmouseleave: hideTip,
      }, [
        el('b', { text: item.ses.label || r.title || r.org || '일감' }),
        el('em', { text: `${item.ses.start || ''}${item.ses.end ? '–' + item.ses.end : ''}` }),
      ]));
    });
    grid.append(col);
  }

  root.append(card(null, null, [
    head, grid,
    el('div', { class: 'card-sub', style: 'margin-top:12px',
      text: any ? '시작·종료 시각이 입력된 일정만 정확한 위치에 놓입니다. 빈 슬롯이 곧 신규 의뢰를 받을 수 있는 시간입니다.'
                : '이 주에는 일정이 없습니다.' }),
  ]));

  function shift(n) { state.ttWeek = addDays(state.ttWeek, n); document.dispatchEvent(new CustomEvent('rerender')); }
}

/* ── 연간 히트맵 ──────────────────────────────────────────────────────── */
export function renderHeatmap(root, { openRecord }) {
  const year = state.year;
  const perDay = new Map();
  for (const r of state.records) {
    if (r.status === '취소') continue;
    const d = dv(r);
    const ses = sessionsOf(r);
    // 배정에 주당시수가 있으면 그 값을, 없으면 총시수를 회차로 나눠 쓴다
    const fallback = ses.length ? d.hours / ses.length : 0;
    for (const x of ses) {
      if (x.date.getFullYear() !== year) continue;
      const k = iso(x.date);
      const cur = perDay.get(k) || { hours: 0, recs: [] };
      cur.hours += x.hours ?? fallback ?? 0;
      cur.recs.push(r);
      perDay.set(k, cur);
    }
  }

  const maxH = Math.max(1, ...[...perDay.values()].map((v) => v.hours));
  const steps = ['var(--seq-100)', 'var(--seq-300)', 'var(--seq-400)', 'var(--seq-600)'];
  const colorOf = (h) => {
    if (!h) return 'var(--surface-2)';
    const t = h / maxH;
    return t <= 0.25 ? 'var(--seq-100)' : t <= 0.5 ? 'var(--seq-300)' : t <= 0.75 ? 'var(--seq-400)' : 'var(--seq-600)';
  };

  const CELL = 17, GAPX = 4;
  const start = startOfWeek(new Date(year, 0, 1));
  const end = new Date(year, 11, 31);
  const weeks = Math.ceil((addDays(end, 1) - start) / (7 * 86400000));
  const width = weeks * (CELL + GAPX) + 34;
  const height = 7 * (CELL + GAPX) + 24;

  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', `0 0 ${width} ${height}`);
  s.setAttribute('width', width); s.setAttribute('height', height);
  s.setAttribute('class', 'chart');

  ['월', '', '수', '', '금', '', '일'].forEach((lab, i) => {
    if (!lab) return;
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('class', 'tick'); t.setAttribute('x', 0);
    t.setAttribute('y', 20 + i * (CELL + GAPX) + CELL - 2);
    t.textContent = lab; s.append(t);
  });

  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const day = addDays(start, w * 7 + d);
      if (day.getFullYear() !== year) continue;
      const k = iso(day);
      const info = perDay.get(k);
      const x = 30 + w * (CELL + GAPX), y = 20 + d * (CELL + GAPX);
      if (day.getMonth() !== lastMonth && d === 0) {
        lastMonth = day.getMonth();
        const t = document.createElementNS(ns, 'text');
        t.setAttribute('class', 'tick'); t.setAttribute('x', x); t.setAttribute('y', 12);
        t.textContent = MONTH_KO[lastMonth]; s.append(t);
      }
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', x); rect.setAttribute('y', y);
      rect.setAttribute('width', CELL); rect.setAttribute('height', CELL);
      rect.setAttribute('rx', 3);
      rect.setAttribute('fill', colorOf(info?.hours || 0));
      if (info) {
        rect.style.cursor = 'pointer';
        rect.addEventListener('mousemove', (e) => showTip(tipRows(k, [
          ['시수', info.hours.toFixed(1) + '시간', 'var(--s1)'],
          ['일감', info.recs.length + '건'],
        ], [info.recs[0].title || info.recs[0].org || '', '']), e));
        rect.addEventListener('mouseleave', hideTip);
        rect.addEventListener('click', () => openRecord(info.recs[0]));
      }
      s.append(rect);
    }
  }

  const busyDays = perDay.size;
  const totalH = [...perDay.values()].reduce((a, b) => a + b.hours, 0);

  root.append(card(`${year}년 활동 밀도`, `일한 날 ${busyDays}일 · 총 ${totalH.toFixed(0)}시간`, [
    el('div', { class: 'hm-scroll' }, [s]),
    el('div', { class: 'hm-legend' }, [
      '적음',
      ...['var(--surface-2)', ...steps].map((c) => el('i', { style: `background:${c}` })),
      '많음',
      el('span', { style: 'margin-left:14px', text: `하루 최대 ${maxH.toFixed(1)}시간` }),
    ]),
  ]));
}
