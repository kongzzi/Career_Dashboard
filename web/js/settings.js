// 설정 — 연간 목표·기본값, 기관 마스터 관리
import { state, el, $, won, api, absorb, toast, num, dv } from './core.js';

/** 일감 기록에서 기관별 정보를 긁어모은다.
 *  기관명 쪽은 담당자/연락처/지역을, 발주처 쪽은 발주처 담당자/연락처를 쓴다.
 *  같은 이름이 여러 건에 나오면 최근 일정의 값을 우선하고, 빈 칸은 예전 건으로 메운다. */
function harvestOrgs() {
  const byRecency = [...state.records]
    .sort((a, b) => (dv(b).start?.getTime() || 0) - (dv(a).start?.getTime() || 0));

  const map = new Map();
  const add = (name, kind, contact, phone, region, rate) => {
    const key = String(name || '').trim();
    if (!key) return;
    const cur = map.get(key)
      || { name: key, kind: '', contact: '', phone: '', region: '', rate: '', _kinds: new Set(), _rates: new Set() };
    cur._kinds.add(kind);
    // 최근 건부터 도니까, 아직 비어 있을 때만 채우면 최근 값이 이긴다
    if (!cur.contact && contact) cur.contact = String(contact).trim();
    if (!cur.phone && phone) cur.phone = String(phone).trim();
    if (!cur.region && region) cur.region = String(region).trim();
    if (rate) cur._rates.add(Number(rate));
    map.set(key, cur);
  };

  for (const r of byRecency) {
    if (r.status === '취소') continue;
    const rate = r.pay_type === '월정액(연봉제)' ? 0 : num(r.rate);
    add(r.org, '강의처', r.contact, r.phone, r.region, rate);
    add(r.client, '발주처', r.client_contact, r.client_phone, '', rate);
  }

  for (const o of map.values()) {
    o.kind = o._kinds.size > 1 ? '둘다' : [...o._kinds][0] || '';
    // 단가가 건마다 다르면 섣불리 채우지 않는다
    o.rate = o._rates.size === 1 ? [...o._rates][0] : '';
    delete o._kinds;
    delete o._rates;
  }
  return map;
}

export function renderSettings(root) {
  const s = { ...state.settings };

  const numField = (key, label, hint, suffix) => el('div', { class: 'field' }, [
    el('label', { text: label }),
    el('div', { style: 'display:flex;gap:6px;align-items:center' }, [
      el('input', { type: 'number', step: 'any', value: s[key] ?? 0, oninput: (e) => { s[key] = e.target.value; } }),
      suffix ? el('span', { class: 'hint', style: 'white-space:nowrap', text: suffix }) : null,
    ]),
    hint ? el('span', { class: 'hint', text: hint }) : null,
  ]);

  root.append(el('div', { class: 'card', style: 'margin-bottom:16px' }, [
    el('div', { class: 'card-head' }, [el('h3', { class: 'card-title', text: '기본값' })]),
    el('div', { class: 'field-grid' }, [
      numField('annual_goal', '연간 목표 수입', '0이면 대시보드에서 목표 게이지를 숨깁니다', '원'),
      numField('default_tax_rate', '기본 원천징수율', '새 일감의 세금적용 기본 선택 · 3.3 사업소득 / 8.8 기타소득 / 0 미적용', '%'),
      numField('default_rate', '기본 시간당 단가', '새 일감을 만들 때 미리 채워집니다', '원'),
    ]),
    el('div', { class: 'fieldset', style: 'margin-top:20px;margin-bottom:0' }, [
      el('span', { class: 'fs-title', text: '4대보험 요율 (근로자 부담)' }),
      el('p', { class: 'card-sub', style: 'margin:-4px 0 10px' ,
        text: '세금적용을 "4대보험 (근로소득)"으로 고른 건에 적용됩니다. 요율은 해마다 바뀌니 확인 후 고쳐 쓰세요.' }),
      el('div', { class: 'field-grid' }, [
        numField('ins_pension', '국민연금', '월 급여 대비', '%'),
        numField('ins_health', '건강보험', '월 급여 대비', '%'),
        numField('ins_care', '장기요양', '건강보험료 대비', '%'),
        numField('ins_employment', '고용보험', '월 급여 대비', '%'),
        numField('ins_income_tax', '소득세 추정', '간이세액표라 부정확 · 월 실수령액을 직접 넣는 쪽이 정확합니다', '%'),
      ]),
    ]),
    el('div', { style: 'margin-top:16px' }, [
      el('button', {
        class: 'btn btn-primary', text: '설정 저장',
        onclick: async () => {
          try {
            const payload = Object.fromEntries(
              Object.keys(state.settings).map((k) => [k, num(s[k])]));
            absorb(await api('/api/settings', { method: 'POST', body: { settings: payload } }));
            toast('설정을 엑셀에 저장했습니다.', 'ok');
            document.dispatchEvent(new CustomEvent('rerender'));
          } catch (e) { toast(e.message, 'err'); }
        },
      }),
    ]),
  ]));

  /* 기관 마스터 */
  const orgs = state.orgs.map((o) => ({ ...o }));
  const harvested = harvestOrgs();
  const known = [...harvested.keys()];
  const missing = known.filter((n) => !orgs.some((o) => o.name === n));
  // 이미 있는 행이라도 비어 있는 칸은 채울 수 있다
  const fillable = orgs.filter((o) => {
    const info = harvested.get(o.name);
    return info && ['kind', 'contact', 'phone', 'region', 'rate']
      .some((k) => !String(o[k] || '').trim() && info[k]);
  });

  const tbody = el('tbody');
  const draw = () => tbody.replaceChildren(...orgs.map((o, i) => el('tr', {}, [
    ...['name', 'kind', 'contact', 'phone', 'region'].map((k) =>
      el('td', {}, [el('input', {
        class: 'input', style: 'width:100%;border:0;background:transparent;padding:4px 2px',
        value: o[k] || '', oninput: (e) => { o[k] = e.target.value; },
      })])),
    el('td', { class: 'num' }, [el('input', {
      class: 'input', type: 'number', style: 'width:110px;border:0;background:transparent;padding:4px 2px;text-align:right',
      value: o.rate || '', oninput: (e) => { o.rate = e.target.value; },
    })]),
    el('td', {}, [el('button', { class: 'icon-btn', text: '✕', onclick: () => { orgs.splice(i, 1); draw(); } })]),
  ])));
  draw();

  root.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { class: 'card-title', text: '기관 목록' }),
      el('span', { class: 'card-sub', text: '강의처든 발주처든 모두 여기에 · 기본단가·지역을 넣어두면 입력 때 자동으로 채워집니다' }),
    ]),
    el('div', { class: 'table-wrap' }, [
      el('table', { class: 'data' }, [
        el('thead', {}, [el('tr', {}, ['기관명', '기관구분', '담당자', '연락처', '지역', '기본단가', ''].map((h) =>
          el('th', { text: h, class: h === '기본단가' ? 'num' : '' })))]),
        tbody,
      ]),
    ]),
    el('div', { style: 'display:flex;gap:8px;margin-top:14px;flex-wrap:wrap' }, [
      el('button', { class: 'btn', text: '+ 행 추가', onclick: () => { orgs.push({ name: '', kind: '', contact: '', phone: '', region: '', rate: '', memo: '' }); draw(); } }),
      (missing.length || fillable.length) ? el('button', {
        class: 'btn',
        text: missing.length
          ? `일감에서 가져오기 (새 기관 ${missing.length}곳${fillable.length ? `, 빈칸 ${fillable.length}곳` : ''})`
          : `일감에서 빈칸 채우기 (${fillable.length}곳)`,
        onclick: () => {
          for (const n of missing) orgs.push({ ...harvested.get(n), memo: '' });
          // 기존 행은 비어 있는 칸만 채운다 — 손으로 고친 값은 그대로 둔다
          for (const o of orgs) {
            const info = harvested.get(o.name);
            if (!info) continue;
            for (const k of ['kind', 'contact', 'phone', 'region', 'rate']) {
              if (!String(o[k] || '').trim() && info[k]) o[k] = info[k];
            }
          }
          draw();
          toast('일감에서 담당자·연락처·지역을 가져왔습니다. 저장을 눌러야 반영됩니다.', 'ok');
        },
      }) : null,
      el('span', { style: 'flex:1' }),
      el('button', {
        class: 'btn btn-primary', text: '기관 목록 저장',
        onclick: async () => {
          try {
            absorb(await api('/api/orgs', { method: 'POST', body: { orgs: orgs.filter((o) => o.name) } }));
            toast('기관 목록을 저장했습니다.', 'ok');
            document.dispatchEvent(new CustomEvent('rerender'));
          } catch (e) { toast(e.message, 'err'); }
        },
      }),
    ]),
  ]));

  root.append(el('div', { class: 'card', style: 'margin-top:16px' }, [
    el('div', { class: 'card-head' }, [el('h3', { class: 'card-title', text: '데이터 파일' })]),
    el('p', { class: 'card-sub', style: 'line-height:1.7' , html:
      `모든 내용은 <code>${state.file}</code> 에 저장됩니다.<br>`
      + '대시보드에서 저장할 때마다 직전 파일이 <code>data/backups/</code> 에 자동 보관됩니다(최근 10개).<br>'
      + '엑셀에서 직접 편집한 뒤에는 상단의 ↻ 버튼을 누르면 다시 읽어옵니다. '
      + '엑셀로 파일을 열어 둔 상태에서는 대시보드가 저장하지 못하니, 저장 전에 닫아 주세요.' }),
  ]));
}
