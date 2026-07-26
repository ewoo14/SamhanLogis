// #3 세트 구성품 사양 집계 표시 — 실 캡처 (싱글중대형 + 상업멀티 모달).
// 실 시드(product-service DB, /components specs) + 실 사양맵. mock 미사용.
// 탭 비활성으로 셀 dblclick 불가 → dblclick 와 동일 production 함수 openSpecModalByItem(item,scope) 직접 호출.
// 모달 <dialog>.showModal() top-layer 라 탭 무관 실제 렌더 → 실 캡처.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
// 절대경로 하드코딩 제거 + _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const OUT = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/set-component-spec-display'));
const URL = 'http://localhost:5183/?email=dev_master@samhan-air.com';
const log = (...a) => console.log('[cap]', ...a);

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu'] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1300 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept().catch(() => {}));
page.on('pageerror', (e) => log('pageerror:', String(e).slice(0, 250)));
page.on('crash', () => log('PAGE CRASHED'));

const dumpDialog = async (file) => {
  const dlg = await page.$('#dlgSpec');
  if (!dlg) return false;
  await dlg.screenshot({ path: path.join(OUT, file) }).catch(async () => { await page.screenshot({ path: path.join(OUT, file) }); });
  return true;
};
const closeDlg = () => page.evaluate(() => { const d = document.querySelector('#dlgSpec'); if (d && d.open) d.close(); }).catch(() => {});

try {
  log('loading', URL);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#singleBody tr', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(2500);

  // ───────────── 1) 싱글중대형 모달 (구성품별 사양 = 실내/외 물리치수 + 판넬/리모컨 사양) ─────────────
  const single = await page.evaluate(() => {
    const out = {};
    try {
      const sets = (typeof SINGLE_SETS !== 'undefined' && SINGLE_SETS) || [];
      let target = null, parts = [];
      // "구성품별 사양" 섹션이 실제로 렌더되는(=구성품 specs 또는 실내/외 물리치수 보유) 첫 세트 선택
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
      out.title = (document.querySelector('#specTitle') || {}).textContent || '';
      const body = document.querySelector('#specBody');
      out.bodyText = body ? body.innerText : '';
      out.hasCompSection = !!(body && body.querySelector('.comp-spec-section'));
    } catch (e) { out.err = String(e); }
    return out;
  });
  log('SINGLE:', JSON.stringify({ ...single, bodyText: undefined, parts: `[${(single.parts || []).length}]` }));
  if (single.opened) {
    await page.waitForTimeout(350);
    await dumpDialog('single-set-modal.png');
    fs.writeFileSync(path.join(OUT, 'single-set-modal.txt'),
      `MODE=openSpecModalByItem(item,'single')\nmodel=${single.model}\nname=${single.name}\npartCount=${single.partCount}\nhasCompSection=${single.hasCompSection}\n\n`
      + `--- 구성품 (kind/model/specsCount[DB]) ---\n${(single.parts || []).map((p) => `[${p.kind}] ${p.model} ${p.name} | DB specs=${p.specsCount}`).join('\n')}\n\n`
      + `--- 모달 #specBody innerText ---\n${(single.bodyText || '').trim()}\n`, 'utf8');
    log('SINGLE captured. hasCompSection=', single.hasCompSection);
  } else log('WARN single not opened:', single.err);
  await closeDlg(); await page.waitForTimeout(200);

  // ───────────── 2) 상업멀티 세트 모달 (구성품별 전체 사양 = DB specs) ─────────────
  const comm = await page.evaluate(() => {
    const out = {};
    try {
      const rows = (typeof COMMULTI !== 'undefined' && COMMULTI) || [];
      let target = null, parts = [];
      // 세트 실외기(catL=실외기, 상업 단위는 전부 EA) + 구성품 explode + 구성품 DB specs 다수 보유 행 우선
      for (const r of rows) {
        const L = String(r.catL || r.L || '').trim();
        if (L !== '실외기') continue;
        let p = [];
        try { p = (typeof explodeCommSets_ === 'function') ? (explodeCommSets_(r, 1) || []) : []; } catch (e) {}
        if (!p.length) continue;
        const withSpecs = p.filter((x) => Array.isArray(x.specs) && x.specs.length).length;
        if (withSpecs >= 2) { target = r; parts = p; break; }       // 구성품 사양 다수 = 풍부한 캡처
        if (!target && withSpecs > 0) { target = r; parts = p; }     // 최소 1개라도 보관
      }
      if (!target) { out.err = 'no comm set'; return out; }
      out.model = target.model; out.name = target.name; out.catL = String(target.catL || target.L || ''); out.unit = target.unit;
      out.partCount = parts.length;
      out.parts = parts.map((p) => ({ model: p.model || '', name: p.name || '', kind: p.kind || '', specsCount: Array.isArray(p.specs) ? p.specs.length : 0 }));
      const d0 = document.querySelector('#dlgSpec'); if (d0 && d0.open) d0.close();
      openSpecModalByItem(target, 'comm');
      out.opened = !!document.querySelector('#dlgSpec[open]');
      out.title = (document.querySelector('#specTitle') || {}).textContent || '';
      const body = document.querySelector('#specBody');
      out.bodyText = body ? body.innerText : '';
      out.hasCompSection = !!(body && body.querySelector('.comp-spec-section'));
    } catch (e) { out.err = String(e); }
    return out;
  });
  log('COMM:', JSON.stringify({ ...comm, bodyText: undefined, parts: `[${(comm.parts || []).length}]` }));
  if (comm.opened) {
    await page.waitForTimeout(350);
    await dumpDialog('commercial-set-modal.png');
    fs.writeFileSync(path.join(OUT, 'commercial-set-modal.txt'),
      `MODE=openSpecModalByItem(item,'comm')\nmodel=${comm.model}\nname=${comm.name}\ncatL=${comm.catL}\nunit=${comm.unit}\npartCount=${comm.partCount}\nhasCompSection=${comm.hasCompSection}\n\n`
      + `--- 구성품 (kind/model/specsCount[DB]) ---\n${(comm.parts || []).map((p) => `[${p.kind}] ${p.model} ${p.name} | DB specs=${p.specsCount}`).join('\n')}\n\n`
      + `--- 모달 #specBody innerText ---\n${(comm.bodyText || '').trim()}\n`, 'utf8');
    log('COMM captured. hasCompSection=', comm.hasCompSection);
  } else log('WARN comm not opened:', comm.err);
  await closeDlg();

  log('done. outputs in', OUT);
} catch (e) {
  log('FATAL', String(e));
} finally {
  await browser.close();
}
