/**
 * single-material-product 슬라이스 — estimate-app(종합견적서) 세트 실 캡처.
 *
 * 실서버 :5183 (product-service DB 시드 + 실 사양맵). mock 미사용.
 * 출력: docs/qa/single-material-product/screenshots/
 *
 *   05-estimate-set-components-spec.png — 싱글중대형 구성품 사양 모달(실내기/실외기/판넬/리모컨 + 합산 사양)
 *   06-estimate-option-delta.png        — 싱글중대형 표 선택(qty=1) → 부품행 실내/외 배분가 +
 *                                        판넬 옵션 변경(기본 판넬 → 블랙판넬)에 따른 동적 금액차
 *
 * 조작은 모두 production 함수/실 DOM 경유:
 *   - 표 수량셀 입력(singleQty.set + renderSingle) = 라이브 사용자가 수량 입력하는 것과 동일 경로.
 *   - 옵션 변경 = #ss_panel select 의 value 변경 + change 이벤트 디스패치(라이브 동일).
 *   - 사양 모달 = openSpecModalByItem(item,'single') (dblclick 과 동일 production 함수).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const OUT = resolveQaShotsDir(path.resolve(__dirname, '..', '..', '..', '..', 'docs', 'qa', 'single-material-product', 'screenshots'));
const URL = 'http://localhost:5183/?email=dev_master@samhan-air.com';
const log = (...a) => console.log('[smp-est]', ...a);

async function shot(page, file) {
  const p = path.join(OUT, file);
  await page.screenshot({ path: p, fullPage: false });
  log(`${file} (${(fs.statSync(p).size / 1024).toFixed(1)} KB)`);
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept().catch(() => {}));
page.on('pageerror', (e) => log('pageerror:', String(e).slice(0, 220)));
page.on('crash', () => log('PAGE CRASHED'));

try {
  log('loading', URL);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#singleBody tr', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(2800);

  // 인증 게이트 통과 확인
  const auth = await page.evaluate(() => (typeof USER_AUTH !== 'undefined' ? { authorized: USER_AUTH.authorized, managerName: USER_AUTH.managerName } : null));
  log('auth=', JSON.stringify(auth));
  if (!auth || !auth.authorized) throw new Error('인증 게이트 차단');

  // ─────────────────────────────────────────────────────────────────────────
  // #5 — 싱글중대형 구성품 사양 모달 (실내/외 물리치수 + 판넬/리모컨 사양 합산)
  //   "구성품별 사양" 섹션이 실제 렌더되는 첫 세트 선택 → openSpecModalByItem(item,'single')
  // ─────────────────────────────────────────────────────────────────────────
  const single = await page.evaluate(() => {
    const out = {};
    try {
      const sets = (typeof SINGLE_SETS !== 'undefined' && SINGLE_SETS) || [];
      let target = null, parts = [];
      for (const s of sets) {
        const item = { ...s, isSet: true };
        let p = [];
        try { p = (typeof explodeSetParts === 'function') ? explodeSetParts(item, 1, null) : []; } catch (e) {}
        if (!p || !p.length) continue;
        let html = '';
        try { html = renderComponentSpecs_(p, (SPEC_DETAIL_MAP[s.model] || {}).single || {}, 'single'); } catch (e) {}
        if (html && html.includes('구성품별 사양')) { target = item; parts = p; break; }
      }
      if (!target) { for (const s of sets) { const item = { ...s, isSet: true }; let p = []; try { p = explodeSetParts(item, 1, null) || []; } catch (e) {} if (p.length) { target = item; parts = p; break; } } }
      if (!target) { out.err = 'no single set'; return out; }
      out.model = target.model; out.name = target.name; out.partCount = parts.length;
      out.parts = parts.map((p) => ({ model: p.model || '', name: p.name || '', kind: p.kind || '', specsCount: Array.isArray(p.specs) ? p.specs.length : 0 }));
      const d0 = document.querySelector('#dlgSpec'); if (d0 && d0.open) d0.close();
      openSpecModalByItem(target, 'single');
      out.opened = !!document.querySelector('#dlgSpec[open]');
      const body = document.querySelector('#specBody');
      out.hasCompSection = !!(body && body.querySelector('.comp-spec-section'));
    } catch (e) { out.err = String(e); }
    return out;
  });
  log('#5 single:', JSON.stringify({ model: single.model, name: single.name, partCount: single.partCount, opened: single.opened, hasCompSection: single.hasCompSection, err: single.err }));
  log('#5 parts:', JSON.stringify(single.parts));
  if (single.opened) {
    await page.waitForTimeout(450);
    const dlg = await page.$('#dlgSpec');
    if (dlg) await dlg.screenshot({ path: path.join(OUT, '05-estimate-set-components-spec.png') }).catch(async () => { await shot(page, '05-estimate-set-components-spec.png'); });
    else await shot(page, '05-estimate-set-components-spec.png');
    log('#5 captured. hasCompSection=', single.hasCompSection);
  } else {
    log('WARN #5 modal not opened:', single.err);
  }
  // 모달 닫기
  await page.evaluate(() => { const d = document.querySelector('#dlgSpec'); if (d && d.open) d.close(); }).catch(() => {});
  await page.waitForTimeout(300);

  // ─────────────────────────────────────────────────────────────────────────
  // #6 — 싱글중대형 표 선택(qty=1) → '보기'로 부품행(실내/외 배분가) 펼침 + 판넬 옵션 변경 동적 금액차
  // ─────────────────────────────────────────────────────────────────────────
  // (0) '싱글중대형' 탭으로 전환 (기본 진입은 전표작성 카드라 표가 안 보임).
  await page.click('#btnGoSingle').catch(() => {});
  await page.waitForTimeout(800);

  // (a) 표에 렌더된 첫 360 CST 세트(보기 버튼 보유) 선택 → 수량 1 입력칸에 기입(라이브 동일).
  const pick = await page.evaluate(() => {
    const out = {};
    try {
      if (typeof renderSingleOptions === 'function') renderSingleOptions();
      const tbody = document.querySelector('#singleBody');
      // 표에 실제 렌더된 360 CST 세트 행(data-id 보유 + 보기 버튼) 탐색
      const setRows = Array.from(tbody.querySelectorAll('tr[data-id]'));
      let targetRow = null, set = null;
      for (const tr of setRows) {
        const id = tr.getAttribute('data-id');
        const s = SINGLE_SETS.find((x) => String(x.id) === String(id));
        if (!s) continue;
        if (!/360 CST/.test(s.name || '') || !/^AC/.test(s.model || '')) continue;
        if (!tr.querySelector('.toggle-comp-single')) continue;
        targetRow = tr; set = s; break;
      }
      if (!set) { out.err = 'no rendered 360 set with 보기'; return out; }
      out.id = set.id; out.model = set.model; out.name = set.name;
      // 수량 입력칸(.qty-input)에 1 기입 + input/change 디스패치(라이브 사용자 입력 동일)
      const qtyInp = targetRow.querySelector('.qty-input');
      if (qtyInp) {
        qtyInp.value = '1';
        qtyInp.dispatchEvent(new Event('input', { bubbles: true }));
        qtyInp.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (typeof singleQty !== 'undefined' && singleQty.set) {
        singleQty.set(set.id, 1);
        if (typeof renderSingle === 'function') renderSingle();
      }
      out.unit = (typeof getRealSinglePrice === 'function') ? getRealSinglePrice(set.id) : (typeof calcSetUnitPrice === 'function' ? calcSetUnitPrice(set) : null);
      return out;
    } catch (e) { out.err = String(e); return out; }
  });
  log('#6 pick:', JSON.stringify(pick));
  if (pick.err) throw new Error('#6 set 선택 실패: ' + pick.err);
  await page.waitForTimeout(500);

  // (b) 선택 세트의 '보기' 버튼 클릭 → 부품행(실내기/실외기/판넬/리모컨 + 배분가) 펼침.
  const opened = await page.evaluate((sid) => {
    const tbody = document.querySelector('#singleBody');
    const row = tbody.querySelector(`tr[data-id="${(window.CSS && CSS.escape) ? CSS.escape(sid) : sid}"]`);
    const btn = row && row.querySelector('.toggle-comp-single');
    if (!btn) return { clicked: false };
    if (btn.textContent.trim() !== '닫기') btn.click(); // 이미 열려있지 않으면 펼침
    const parts = tbody.querySelectorAll(`tr.set-part-single[data-part-of="${(window.CSS && CSS.escape) ? CSS.escape(sid) : sid}"]`);
    const visible = Array.from(parts).filter((p) => p.style.display !== 'none');
    return { clicked: true, btnText: btn.textContent.trim(), totalParts: parts.length, visibleParts: visible.length };
  }, pick.id);
  log('#6 보기 펼침:', JSON.stringify(opened));
  await page.waitForTimeout(500);

  // (c) before 배분(현재=기본 판넬) 측정.
  const before = await page.evaluate((sid) => {
    const set = SINGLE_SETS.find((s) => String(s.id) === String(sid));
    const unit = (typeof getRealSinglePrice === 'function') ? getRealSinglePrice(set.id) : calcSetUnitPrice(set);
    const parts = explodeSetParts(set, 1, unit) || [];
    const f = (k) => parts.find((p) => p.kind === k) || {};
    return { indoor: f('INDOOR').price ?? null, outdoor: f('OUTDOOR').price ?? null, panelModel: f('PANEL').model ?? null, panelName: f('PANEL').name ?? null, remote: f('REMOTE').price ?? null };
  }, pick.id);
  log('#6 before:', JSON.stringify(before));

  // 선택 세트 앵커를 화면 상단으로 스크롤 후 'before' 캡처(부품행 배분가 노출).
  await page.evaluate((sid) => {
    const tbody = document.querySelector('#singleBody');
    const row = tbody.querySelector(`tr[data-id="${(window.CSS && CSS.escape) ? CSS.escape(sid) : sid}"]`);
    if (row) row.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -40);
  }, pick.id);
  await page.waitForTimeout(500);
  await shot(page, '06a-estimate-set-allocation-before.png');

  // (d) 판넬 옵션 변경: 기본 → '블랙판넬' (라이브 #ss_panel select change) → 동적 재계산.
  const panelOptions = await page.evaluate(() => {
    const pnl = document.getElementById('ss_panel');
    return pnl ? Array.from(pnl.options).map((o) => o.value).filter(Boolean) : [];
  });
  await page.evaluate(() => {
    const pnl = document.getElementById('ss_panel');
    if (pnl) { pnl.value = '블랙판넬'; pnl.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(900);

  const after = await page.evaluate((sid) => {
    const set = SINGLE_SETS.find((s) => String(s.id) === String(sid));
    const unit = (typeof getRealSinglePrice === 'function') ? getRealSinglePrice(set.id) : calcSetUnitPrice(set);
    const parts = explodeSetParts(set, 1, unit) || [];
    const f = (k) => parts.find((p) => p.kind === k) || {};
    return { indoor: f('INDOOR').price ?? null, outdoor: f('OUTDOOR').price ?? null, panelModel: f('PANEL').model ?? null, panelName: f('PANEL').name ?? null, remote: f('REMOTE').price ?? null };
  }, pick.id);
  log('#6 after:', JSON.stringify(after));

  // 변경 후 상태 캡처(부품행 판넬 모델/배분가 변동 반영) — 동일 앵커 유지.
  await page.evaluate((sid) => {
    const tbody = document.querySelector('#singleBody');
    const row = tbody.querySelector(`tr[data-id="${(window.CSS && CSS.escape) ? CSS.escape(sid) : sid}"]`);
    if (row) row.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -40);
  }, pick.id);
  await page.waitForTimeout(500);
  await shot(page, '06-estimate-option-delta.png');

  const indoorDelta = (after.indoor != null && before.indoor != null) ? after.indoor - before.indoor : null;
  const outdoorDelta = (after.outdoor != null && before.outdoor != null) ? after.outdoor - before.outdoor : null;

  // 캡처 근거 텍스트 동봉(검증용)
  fs.writeFileSync(path.join(OUT, '06-estimate-option-delta.txt'),
    `세트=${pick.model} ${pick.name}\nset unit(배송가)=${pick.unit}\n`
    + `'보기' 펼침: visibleParts=${opened.visibleParts}/${opened.totalParts} (btn=${opened.btnText})\n`
    + `판넬 옵션 변경: 기본(${before.panelModel} ${before.panelName}) → 블랙판넬(${after.panelModel} ${after.panelName})\n`
    + `실내기 배분가: ${before.indoor} → ${after.indoor} (Δ=${indoorDelta})\n`
    + `실외기 배분가: ${before.outdoor} → ${after.outdoor} (Δ=${outdoorDelta})\n`
    + `리모컨 배분가: ${before.remote} → ${after.remote}\n`
    + `판넬 옵션 목록: ${panelOptions.join(', ')}\n`, 'utf8');

  log('done. outputs in', OUT);
} catch (e) {
  log('FATAL', String(e));
} finally {
  await browser.close();
}
