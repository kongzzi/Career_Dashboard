// 부팅 · 라우팅 · 전역 이벤트
import {
  state, $, $$, el, api, absorb, toast, years, resetCharts, flushCharts,
} from './core.js';
import { renderDashboard } from './dashboard.js';
import { renderCalendar, renderTimeline, renderTimetable, renderHeatmap } from './schedule.js';
import { renderRecords, openForm, closeForm, saveForm, deleteCurrent } from './records.js';
import { renderSettings } from './settings.js';
import { hideTip } from './charts.js';

const VIEWS = {
  dashboard: { title: '대시보드', sub: '수입 현황 한눈에 보기', render: renderDashboard },
  calendar:  { title: '월간 캘린더', sub: '날짜별 일정', render: renderCalendar },
  timeline:  { title: '연간 타임라인', sub: '장기 계약과 학기 겹침', render: renderTimeline },
  timetable: { title: '주간 시간표', sub: '요일·시간대 점유와 빈 슬롯', render: renderTimetable },
  heatmap:   { title: '연간 히트맵', sub: '바쁜 시기와 비수기 패턴', render: renderHeatmap },
  records:   { title: '일감 목록', sub: '전체 데이터 조회와 편집', render: renderRecords },
  settings:  { title: '설정', sub: '기본값과 기관 목록', render: renderSettings },
};

const ctx = {
  openRecord: (r) => openForm(r),
  onNew: () => openForm(null),
};

function render() {
  hideTip();
  resetCharts();
  const v = VIEWS[state.view] || VIEWS.dashboard;
  $('#view-title').textContent = v.title;
  $('#view-sub').textContent = v.sub;
  $$('.nav-item').forEach((b) => b.classList.toggle('is-active', b.dataset.view === state.view));

  const root = $('#viewport');
  root.replaceChildren();
  v.render(root, ctx);
  requestAnimationFrame(flushCharts);
}

function fillYears() {
  const sel = $('#year-select');
  const list = years();
  if (!list.includes(state.year)) state.year = list[0];
  sel.replaceChildren(...list.map((y) => el('option', { value: y, text: `${y}년`, selected: y === state.year })));
}

/* ── 이벤트 ───────────────────────────────────────────────────────────── */
$('#nav').addEventListener('click', (e) => {
  const b = e.target.closest('.nav-item');
  if (!b) return;
  state.view = b.dataset.view;
  render();
});

document.addEventListener('rerender', () => { fillYears(); render(); });
document.addEventListener('goto-view', (e) => { state.view = e.detail; render(); });

$('#year-select').addEventListener('change', (e) => { state.year = +e.target.value; render(); });

$('#basis-toggle').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.basis = b.dataset.basis;
  $$('#basis-toggle button').forEach((x) => x.classList.toggle('is-active', x === b));
  render();
});

$('#btn-new').addEventListener('click', () => openForm(null));
$('#btn-save').addEventListener('click', saveForm);
$('#btn-cancel').addEventListener('click', closeForm);
$('#modal-close').addEventListener('click', closeForm);
$('#btn-delete').addEventListener('click', deleteCurrent);
$('#modal-backdrop').addEventListener('mousedown', (e) => { if (e.target.id === 'modal-backdrop') closeForm(); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#modal-backdrop').hidden) closeForm();
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !$('#modal-backdrop').hidden) saveForm();
  if (e.key === 'n' && !e.metaKey && !e.ctrlKey && $('#modal-backdrop').hidden
      && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
    e.preventDefault(); openForm(null);
  }
});

$('#btn-reload').addEventListener('click', async () => {
  try {
    absorb(await api('/api/bootstrap'));
    fillYears(); render();
    toast('엑셀에서 다시 읽었습니다.', 'ok');
  } catch (e) { toast(e.message, 'err'); }
});

$('#btn-open-excel').addEventListener('click', async () => {
  try { await api('/api/open-excel', { method: 'POST' }); toast('엑셀을 여는 중…'); }
  catch (e) { toast(e.message, 'err'); }
});

$('#btn-theme').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme;
  const next = cur === 'dark' ? 'light' : cur === 'light' ? 'auto' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
  render();
});

let rt;
addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(flushCharts, 160); });

/* ── 시작 ─────────────────────────────────────────────────────────────── */
document.documentElement.dataset.theme = localStorage.getItem('theme') || 'auto';

(async function boot() {
  try {
    absorb(await api('/api/bootstrap'));
    $('#file-path').textContent = state.file.replace(/^.*\/(?=[^/]*\/[^/]*$)/, '…/');
    fillYears();
    render();
  } catch (e) {
    $('#viewport').append(el('div', { class: 'empty' }, [
      el('h3', { text: '데이터를 불러오지 못했습니다' }),
      el('p', { text: e.message }),
    ]));
  }
})();
