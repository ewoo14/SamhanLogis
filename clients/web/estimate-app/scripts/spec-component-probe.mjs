// #3 데이터 가용성 probe — 세트 구성품 모델이 SPEC_DETAIL_MAP 에 개별 상세사양을 갖는지.
import { chromium } from 'playwright';
const URL = 'http://localhost:5183/?email=dev_master@samhan-air.com';
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu'] });
const page = await (await browser.newContext()).newPage();
page.on('pageerror', (e) => console.log('[probe] pageerror', String(e).slice(0, 150)));
try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#singleBody tr', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(2000);
  const res = await page.evaluate(() => {
    const out = { samples: [] };
    const sets = (typeof SINGLE_SETS !== 'undefined' && SINGLE_SETS) || [];
    // 구성품 보유 세트 5개 샘플
    let n = 0;
    for (const s of sets) {
      if (n >= 5) break;
      const item = { ...s, isSet: true };
      let parts = [];
      try { parts = explodeSetParts(item, 1, null) || []; } catch (e) {}
      if (!parts.length) continue;
      n++;
      const sample = { set: s.model, name: s.name, comps: [] };
      for (const p of parts) {
        const m = String(p.model || '').trim();
        const entry = (typeof SPEC_DETAIL_MAP !== 'undefined' && SPEC_DETAIL_MAP[m]) || null;
        sample.comps.push({
          model: m, kind: p.kind || '', specLabel: p.spec || '',
          hasSpecMapEntry: !!entry,
          subKeys: entry ? Object.keys(entry) : [],
          homeFieldCount: entry && entry.home ? Object.keys(entry.home).length : 0,
          commFieldCount: entry && entry.comm ? Object.keys(entry.comm).length : 0,
          singleFieldCount: entry && entry.single ? Object.keys(entry.single).length : 0,
        });
      }
      out.samples.push(sample);
    }
    // 전체 SPEC_DETAIL_MAP 키 개수 + 구성품 모델 매칭률
    const allCompModels = new Set();
    for (const s of sets) {
      let parts = [];
      try { parts = explodeSetParts({ ...s, isSet: true }, 1, null) || []; } catch (e) {}
      parts.forEach((p) => { if (p.model) allCompModels.add(String(p.model).trim()); });
    }
    let matched = 0;
    allCompModels.forEach((m) => { if (typeof SPEC_DETAIL_MAP !== 'undefined' && SPEC_DETAIL_MAP[m]) matched++; });
    out.totalComponentModels = allCompModels.size;
    out.componentModelsWithSpecEntry = matched;
    out.specMapKeys = (typeof SPEC_DETAIL_MAP !== 'undefined') ? Object.keys(SPEC_DETAIL_MAP).length : 0;
    return out;
  });
  console.log(JSON.stringify(res, null, 2));
} catch (e) {
  console.log('[probe] FATAL', String(e));
} finally {
  await browser.close();
}
