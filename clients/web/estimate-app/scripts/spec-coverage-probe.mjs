// #3 종합 데이터 커버리지 probe — 싱글세트 + 상업멀티 구성품의 SPEC_DETAIL_MAP 보유율 + 세트 spec 필드.
import { chromium } from 'playwright';
const URL = 'http://localhost:5183/?email=dev_master@samhan-air.com';
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu'] });
const page = await (await browser.newContext()).newPage();
page.on('pageerror', (e) => console.log('[cov] pageerror', String(e).slice(0, 150)));
try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#singleBody tr', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(2000);
  const res = await page.evaluate(() => {
    const has = (m) => typeof SPEC_DETAIL_MAP !== 'undefined' && !!SPEC_DETAIL_MAP[String(m || '').trim()];
    const out = {};

    // ── 싱글세트 ──
    const singleSets = (typeof SINGLE_SETS !== 'undefined' && SINGLE_SETS) || [];
    const sComp = new Set(); const sCompByKind = {};
    let sSetsWithParts = 0;
    for (const s of singleSets) {
      let parts = [];
      try { parts = explodeSetParts({ ...s, isSet: true }, 1, null) || []; } catch (e) {}
      if (parts.length) sSetsWithParts++;
      parts.forEach((p) => {
        const m = String(p.model || '').trim(); if (!m) return;
        sComp.add(m);
        const k = (p.kind || '?'); sCompByKind[k] = sCompByKind[k] || { total: new Set(), withSpec: new Set() };
        sCompByKind[k].total.add(m); if (has(m)) sCompByKind[k].withSpec.add(m);
      });
    }
    out.single = {
      sets: singleSets.length, setsWithParts: sSetsWithParts,
      compModels: sComp.size, compWithSpec: [...sComp].filter(has).length,
      byKind: Object.fromEntries(Object.entries(sCompByKind).map(([k, v]) => [k, `${v.withSpec.size}/${v.total.size}`])),
    };

    // ── 상업멀티 ──
    const commSets = (typeof COMMULTI !== 'undefined' && COMMULTI) || [];
    const cComp = new Set(); const cCompByKind = {};
    let cSetsWithParts = 0, cSetRows = 0;
    for (const r of commSets) {
      cSetRows++;
      let parts = [];
      try { parts = (typeof explodeCommSets_ === 'function') ? (explodeCommSets_(r, 1) || []) : []; } catch (e) {}
      if (parts.length) cSetsWithParts++;
      parts.forEach((p) => {
        const m = String(p.model || '').trim(); if (!m) return;
        cComp.add(m);
        const k = (p.kind || '?'); cCompByKind[k] = cCompByKind[k] || { total: new Set(), withSpec: new Set() };
        cCompByKind[k].total.add(m); if (has(m)) cCompByKind[k].withSpec.add(m);
      });
    }
    out.commercial = {
      rows: cSetRows, setsWithParts: cSetsWithParts,
      compModels: cComp.size, compWithSpec: [...cComp].filter(has).length,
      byKind: Object.fromEntries(Object.entries(cCompByKind).map(([k, v]) => [k, `${v.withSpec.size}/${v.total.size}`])),
    };

    // ── 세트 spec 엔트리가 가진 필드(per-component 물리치수 유도 가능 여부) ──
    const sampleSet = singleSets.find((s) => { try { return (explodeSetParts({ ...s, isSet: true }, 1, null) || []).length; } catch (e) { return false; } });
    if (sampleSet) {
      const e = (SPEC_DETAIL_MAP[sampleSet.model] || {});
      out.sampleSetSpecKeys = { model: sampleSet.model, sub: Object.keys(e), singleFields: e.single ? Object.keys(e.single) : [], commFields: e.comm ? Object.keys(e.comm) : [] };
    }
    // 상업 샘플(구성품 spec 보유 예) — 보유 구성품 있는 첫 상업세트
    const cSample = commSets.find((r) => { try { return (explodeCommSets_(r, 1) || []).some((p) => has(p.model)); } catch (e) { return false; } });
    if (cSample) {
      let parts = []; try { parts = explodeCommSets_(cSample, 1) || []; } catch (e) {}
      out.commSampleWithSpec = {
        set: cSample.model || cSample.name,
        comps: parts.map((p) => ({ model: p.model, kind: p.kind, hasSpec: has(p.model), specSub: has(p.model) ? Object.keys(SPEC_DETAIL_MAP[String(p.model).trim()]) : [] })),
      };
    }
    return out;
  });
  console.log(JSON.stringify(res, null, 2));
} catch (e) {
  console.log('[cov] FATAL', String(e));
} finally {
  await browser.close();
}
