// #2 종합견적서 사양(스펙) 모달 실 캡처 — 세트 vs 일반 품목.
// 실 시드 데이터(product-service DB) + 실 사양맵. mock 미사용.
// 카탈로그 테이블이 비활성 탭이라 헤드리스에서 셀 dblclick 불가(not visible) →
// dblclick 가 호출하는 동일 production 함수 openSpecModalByItem(item,scope) 직접 호출(동일 코드경로).
// 모달은 top-layer <dialog>.showModal() 이라 탭 무관하게 실제 렌더 → 실 캡처.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
// 절대경로 하드코딩 제거 + _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const OUT = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/product-master-registration/screenshots'));
const URL = 'http://localhost:5183/?email=dev_master@samhan-air.com';
const log = (...a) => console.log('[cap]', ...a);

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu'],
});
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept().catch(() => {}));
page.on('pageerror', (e) => log('pageerror:', String(e).slice(0, 200)));
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
  log('dlgSpec present:', !!(await page.$('#dlgSpec')));

  // ───────────────── 1) SET 사양 모달 (production 함수 직접 호출) ─────────────────
  const setMeta = await page.evaluate(() => {
    const out = {};
    try {
      const sets = (typeof SINGLE_SETS !== 'undefined' && SINGLE_SETS) || [];
      out.totalSets = sets.length;
      let target = null, parts = [];
      for (const s of sets) {
        const item = { ...s, isSet: true };
        let p = [];
        try { p = (typeof explodeSetParts === 'function') ? explodeSetParts(item, 1, null) : []; } catch (e) {}
        if (p && p.length) { target = item; parts = p; break; }
      }
      if (!target && sets.length) { target = { ...sets[0], isSet: true }; }
      if (!target) { out.err = 'no sets'; return out; }
      out.model = target.model; out.name = target.name; out.unit = target.unit;
      out.partCount = parts.length;
      out.parts = parts.map((p) => ({ model: p.model || '', name: p.name || '', kind: p.kind || '', spec: p.spec || '' }));
      const d0 = document.querySelector('#dlgSpec'); if (d0 && d0.open) d0.close();
      openSpecModalByItem(target, 'single');
      out.opened = !!document.querySelector('#dlgSpec[open]');
      out.title = (document.querySelector('#specTitle') || {}).textContent || '';
      const body = document.querySelector('#specBody');
      out.bodyText = body ? body.innerText : '';
    } catch (e) { out.err = String(e); }
    return out;
  });
  log('SET meta:', JSON.stringify({ ...setMeta, parts: `[${(setMeta.parts || []).length} parts]`, bodyText: (setMeta.bodyText || '').slice(0, 400) }));
  if (setMeta.opened) {
    await page.waitForTimeout(300);
    await dumpDialog('estimate-spec-set-modal.png');
    fs.writeFileSync(path.join(OUT, 'estimate-spec-set-modal.txt'),
      `MODE=openSpecModalByItem(item,'single') — dblclick 와 동일 production 경로(탭 비활성으로 직접호출)\n`
      + `model=${setMeta.model}\nname=${setMeta.name}\nunit=${setMeta.unit}\npartCount=${setMeta.partCount}\ntitle=${setMeta.title}\n\n`
      + `--- 구성품(explodeSetParts) 각자 .spec 보유 여부 (집계 가능한 원천 데이터) ---\n`
      + `${(setMeta.parts || []).map((p) => `[${p.kind}] ${p.model} ${p.name} | spec=${p.spec || '(없음)'}`).join('\n')}\n\n`
      + `--- 모달 #specBody innerText (현재 사용자가 보는 내용) ---\n${(setMeta.bodyText || '').trim()}\n`, 'utf8');
    log('SET modal captured.');
  } else {
    log('WARN: SET modal not opened. err=', setMeta.err);
  }
  await closeDlg();
  await page.waitForTimeout(200);

  // ───────────────── 2) 일반(홈멀티) 품목 사양 모달 ─────────────────
  const homeMeta = await page.evaluate(() => {
    const out = {};
    try {
      const allowL = ['실내기', '실외기', '판넬'];
      const arr = (typeof HOMEMULTI !== 'undefined' && HOMEMULTI) || [];
      out.totalHome = arr.length;
      let target = null;
      for (const r of arr) { const L = String(r.catL || r.L || r.catLText || '').trim(); if (allowL.includes(L)) { target = r; break; } }
      if (!target && arr.length) target = arr[0];
      if (!target) { out.err = 'no home rows'; return out; }
      out.model = target.model; out.name = target.name;
      out.L = String(target.catL || target.L || target.catLText || '');
      const d0 = document.querySelector('#dlgSpec'); if (d0 && d0.open) d0.close();
      openSpecModalByItem(target, 'home');
      out.opened = !!document.querySelector('#dlgSpec[open]');
      out.title = (document.querySelector('#specTitle') || {}).textContent || '';
      const body = document.querySelector('#specBody');
      out.bodyText = body ? body.innerText : '';
    } catch (e) { out.err = String(e); }
    return out;
  });
  log('HOME meta:', JSON.stringify({ ...homeMeta, bodyText: (homeMeta.bodyText || '').slice(0, 400) }));
  if (homeMeta.opened) {
    await page.waitForTimeout(300);
    await dumpDialog('estimate-spec-home-modal.png');
    fs.writeFileSync(path.join(OUT, 'estimate-spec-home-modal.txt'),
      `MODE=openSpecModalByItem(item,'home')\nmodel=${homeMeta.model}\nname=${homeMeta.name}\nL=${homeMeta.L}\ntitle=${homeMeta.title}\n\n--- 모달 #specBody innerText ---\n${(homeMeta.bodyText || '').trim()}\n`, 'utf8');
    log('HOME modal captured.');
  } else {
    log('WARN: HOME modal not opened. err=', homeMeta.err);
  }
  await closeDlg();

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'estimate-catalog-overview.png') });
  log('done. outputs in', OUT);
} catch (e) {
  log('FATAL', String(e));
} finally {
  await browser.close();
}
