// 직접 그리는 SVG 차트 — 외부 라이브러리 없이 오프라인에서도 동작한다.
import { svg, el, won, wonShort } from './core.js';

/* ── 공용 툴팁 ────────────────────────────────────────────────────────── */
let tipEl = null;
function tip() {
  if (!tipEl) { tipEl = el('div', { class: 'tooltip' }); document.body.append(tipEl); }
  return tipEl;
}
export function showTip(html, ev) {
  const t = tip();
  t.innerHTML = html;
  t.classList.add('show');
  const pad = 14, r = t.getBoundingClientRect();
  let x = ev.clientX + pad, y = ev.clientY + pad;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
  t.style.left = Math.max(8, x) + 'px';
  t.style.top = Math.max(8, y) + 'px';
}
export function hideTip() { if (tipEl) tipEl.classList.remove('show'); }

export function tipRows(title, rows, foot) {
  const body = rows.map(([label, value, color]) => `
    <div class="tt-row">
      <span class="k">${color ? `<i class="tt-dot" style="background:${color}"></i>` : ''}${label}</span>
      <span class="v">${value}</span>
    </div>`).join('');
  return `<div class="tt-title">${title}</div>${body}${foot ? `<div class="tt-sep"></div><div class="tt-row"><span class="k">${foot[0]}</span><span class="v">${foot[1]}</span></div>` : ''}`;
}

/* ── 눈금 ─────────────────────────────────────────────────────────────── */
export function niceTicks(max, count = 4) {
  if (!max || max <= 0) return { ticks: [0, 1], max: 1 };
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + 1e-6; v += step) ticks.push(v);
  return { ticks, max: top };
}

/** 위쪽 끝만 둥근 막대 경로 (바닥은 각지게 — 베이스라인에 붙는다) */
function colPath(x, y, w, h, r = 4, round = true) {
  if (h <= 0) return '';
  const rr = round ? Math.min(r, h, w / 2) : 0;
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}
/** 오른쪽 끝만 둥근 가로 막대 */
function barPath(x, y, w, h, r = 4, round = true) {
  if (w <= 0) return '';
  const rr = round ? Math.min(r, w, h / 2) : 0;
  return `M${x},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h - rr} Q${x + w},${y + h} ${x + w - rr},${y + h} L${x},${y + h} Z`;
}

const GAP = 2;   // 인접·적층 마크 사이 서피스 간격

/* ── 월별 적층 세로막대 ───────────────────────────────────────────────── */
export function stackedColumns({ width, height = 250, labels, series, onClick, fmt = wonShort, fmtFull = won, extraRows }) {
  const m = { t: 14, r: 8, b: 26, l: 46 };
  const iw = Math.max(60, width - m.l - m.r), ih = height - m.t - m.b;
  const totals = labels.map((_, i) => series.reduce((s, se) => s + (se.values[i] || 0), 0));
  const { ticks, max } = niceTicks(Math.max(...totals, 0));
  const y = (v) => m.t + ih - (v / max) * ih;

  const band = iw / labels.length;
  const bw = Math.min(24, band * 0.56);

  const g = svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, width, height, role: 'img' });

  for (const t of ticks) {
    g.append(svg('line', { class: t === 0 ? 'baseline' : 'gridline', x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t) }));
    g.append(svg('text', { class: 'tick', x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end', text: fmt(t) }));
  }

  labels.forEach((lab, i) => {
    const cx = m.l + band * (i + 0.5);
    g.append(svg('text', { class: 'tick', x: cx, y: height - 8, 'text-anchor': 'middle', text: lab }));

    let acc = 0;
    const drawn = [];
    series.forEach((se) => {
      const v = se.values[i] || 0;
      if (v <= 0) return;
      drawn.push({ se, v, from: acc });
      acc += v;
    });
    drawn.forEach((d, k) => {
      const bottom = y(d.from), top = y(d.from + d.v);
      // 아래 조각과 맞닿는 면만 2px 줄여 서피스 간격을 만든다
      const h = Math.max(1, bottom - top - (k > 0 ? GAP : 0));
      g.append(svg('path', {
        d: colPath(cx - bw / 2, top, bw, h, 4, k === drawn.length - 1),
        fill: d.se.color,
      }));
    });

    if (totals[i] > 0) {
      const hit = svg('rect', { class: 'hit', x: cx - band / 2, y: m.t, width: band, height: ih });
      const rows = drawn.slice().reverse().map((d) => [d.se.name, fmtFull(d.v) + '원', d.se.color]);
      if (extraRows) rows.push(...extraRows(i));
      hit.addEventListener('mousemove', (e) => showTip(tipRows(lab, rows, ['합계', fmtFull(totals[i]) + '원']), e));
      hit.addEventListener('mouseleave', hideTip);
      if (onClick) hit.addEventListener('click', () => onClick(i));
      g.append(hit);
    }
  });

  return g;
}

/* ── 가로 막대 (단일 계열, 순차 파랑) ─────────────────────────────────── */
export function hBars({ width, items, fmt = won, unit = '원', color = 'var(--s1)', onClick }) {
  const rowH = 30, m = { t: 4, r: 66, b: 4, l: 118 };
  const height = m.t + m.b + rowH * items.length;
  const iw = Math.max(60, width - m.l - m.r);
  const max = Math.max(...items.map((d) => d.value), 1);
  const g = svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, width, height, role: 'img' });

  items.forEach((d, i) => {
    const y = m.t + i * rowH;
    const bh = Math.min(18, rowH - 10);
    const w = Math.max(2, (d.value / max) * iw);
    const label = d.label.length > 11 ? d.label.slice(0, 10) + '…' : d.label;
    g.append(svg('text', { class: 'tick', x: m.l - 10, y: y + bh / 2 + 8, 'text-anchor': 'end', text: label }));
    g.append(svg('path', { d: barPath(m.l, y + 5, w, bh, 4, true), fill: d.color || color }));
    g.append(svg('text', { class: 'mark-label', x: m.l + w + 8, y: y + bh / 2 + 9, text: fmt(d.value) + unit }));
    const hit = svg('rect', { class: 'hit', x: 0, y, width, height: rowH });
    hit.addEventListener('mousemove', (e) => showTip(tipRows(d.label, d.rows || [['금액', fmt(d.value) + unit, d.color || color]]), e));
    hit.addEventListener('mouseleave', hideTip);
    if (onClick) hit.addEventListener('click', () => onClick(d));
    g.append(hit);
  });
  return g;
}

/* ── 100% 적층 가로막대 (정산 파이프라인) ─────────────────────────────── */
export function stackedBar({ width, segments, height = 34 }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const g = svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, width, height, role: 'img' });
  if (total <= 0) {
    g.append(svg('rect', { x: 0, y: 6, width, height: height - 12, rx: 6, fill: 'var(--surface-2)' }));
    return g;
  }
  let x = 0;
  const drawn = segments.filter((s) => s.value > 0);
  drawn.forEach((s, i) => {
    const w = (s.value / total) * width;
    const isLast = i === drawn.length - 1, isFirst = i === 0;
    const ww = Math.max(2, w - (isLast ? 0 : GAP));
    const r = 6;
    let d;
    if (isFirst && isLast) d = `M${x},6 h${ww} v${height - 12} h-${ww} Z`;
    else if (isFirst) d = `M${x + r},6 h${ww - r} v${height - 12} h-${ww - r} a${r},${r} 0 0 1 -${r},-${r} v-${height - 12 - 2 * r} a${r},${r} 0 0 1 ${r},-${r} Z`;
    else if (isLast) d = barPath(x, 6, ww, height - 12, r, true);
    else d = `M${x},6 h${ww} v${height - 12} h-${ww} Z`;
    const p = svg('path', { d, fill: s.color });
    p.addEventListener('mousemove', (e) => showTip(tipRows(s.name, [['금액', won(s.value) + '원', s.color], ['비중', ((s.value / total) * 100).toFixed(1) + '%']]), e));
    p.addEventListener('mouseleave', hideTip);
    g.append(p);
    x += w;
  });
  return g;
}

/* ── 꺾은선 (실효 시간당 단가 추이) ───────────────────────────────────── */
export function lineChart({ width, height = 210, labels, values, color = 'var(--s1)', fmt = wonShort, fmtFull = won, name = '' }) {
  const m = { t: 16, r: 14, b: 26, l: 52 };
  const iw = Math.max(60, width - m.l - m.r), ih = height - m.t - m.b;
  const defined = values.map((v, i) => [i, v]).filter(([, v]) => v > 0);
  const { ticks, max } = niceTicks(Math.max(...values, 0));
  const x = (i) => m.l + (labels.length === 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const y = (v) => m.t + ih - (v / max) * ih;

  const g = svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, width, height, role: 'img' });
  for (const t of ticks) {
    g.append(svg('line', { class: t === 0 ? 'baseline' : 'gridline', x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t) }));
    g.append(svg('text', { class: 'tick', x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end', text: fmt(t) }));
  }
  labels.forEach((lab, i) => {
    if (labels.length > 8 && i % 2 === 1) return;
    g.append(svg('text', { class: 'tick', x: x(i), y: height - 8, 'text-anchor': 'middle', text: lab }));
  });

  if (defined.length) {
    const d = defined.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
    g.append(svg('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    for (const [i, v] of defined) {
      g.append(svg('circle', { cx: x(i), cy: y(v), r: 4, fill: color, stroke: 'var(--surface)', 'stroke-width': 2 }));
    }
    const [li, lv] = defined[defined.length - 1];
    g.append(svg('text', {
      class: 'mark-label', x: Math.min(x(li) + 9, width - 4), y: y(lv) - 9,
      'text-anchor': x(li) > width - 60 ? 'end' : 'start', text: fmtFull(lv) + '원',
    }));
  }

  const band = iw / Math.max(1, labels.length - 1);
  labels.forEach((lab, i) => {
    const hit = svg('rect', { class: 'hit', x: x(i) - band / 2, y: m.t, width: band, height: ih });
    hit.addEventListener('mousemove', (e) => showTip(tipRows(lab, [[name || '값', values[i] > 0 ? fmtFull(values[i]) + '원' : '—', color]]), e));
    hit.addEventListener('mouseleave', hideTip);
    g.append(hit);
  });
  return g;
}

/* ── 범례 (HTML — 색만으로 식별하지 않게 항상 함께 낸다) ─────────────── */
export function legend(items) {
  return el('div', { class: 'legend' }, items.map((i) =>
    el('span', { class: 'legend-item' }, [
      el('i', { class: 'legend-swatch', style: `background:${i.color}` }),
      i.name + (i.note ? ` · ${i.note}` : ''),
    ])));
}
