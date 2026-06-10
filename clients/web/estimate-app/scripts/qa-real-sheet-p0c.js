/**
 * P0-C 실 시트 standalone QA — 실 Google Sheet(SA key) 대상 계산 6함수 검증.
 *
 * 실행: GOOGLE_SERVICE_ACCOUNT_KEY=<path> node scripts/qa-real-sheet-p0c.js
 * (가짜 데이터 영구 배제 원칙 — 실 시트 '1RJqO3jT...' 직접 read 결과만 보고)
 */

'use strict';

const code = require('../lib/code');

async function main() {
  const t = await code.bootstrap('qa-p0c@samhan-air.com');

  const hm = JSON.parse(t.homemulti);
  const ss = JSON.parse(t.singleSets);
  const cm = JSON.parse(t.commercialMulti);
  const old = JSON.parse(t.oldProducts);
  const spec = JSON.parse(t.specDetailMap);

  const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : 'n/a');

  console.log('━━━ P0-C 실 시트 QA 결과 ━━━');
  console.log(`홈멀티: ${hm.length}행 | useK2=true: ${hm.filter((x) => x.useK2).length} | maxIndoor>0: ${hm.filter((x) => x.maxIndoor > 0).length}`);
  const hmCat = {};
  hm.forEach((x) => { hmCat[x.catL] = (hmCat[x.catL] || 0) + 1; });
  console.log(`홈멀티 catL 분포: ${JSON.stringify(hmCat)}`);

  const matDist = {};
  ss.forEach((x) => { matDist[x.matKey] = (matDist[x.matKey] || 0) + 1; });
  console.log(`싱글세트: ${ss.length}행 | matKey 분포: ${JSON.stringify(matDist)}`);

  const cmCat = {};
  cm.forEach((x) => { cmCat[x.catL] = (cmCat[x.catL] || 0) + 1; });
  const cmCatS = cm.filter((x) => x.catS).length;
  console.log(`상업멀티: ${cm.length}행 | useK2=true: ${cm.filter((x) => x.useK2).length} | catL 분포: ${JSON.stringify(cmCat)} | catS 채움: ${cmCatS} (${pct(cmCatS, cm.length)})`);

  console.log(`구형: ${old.length}행 | isDisc=true: ${old.filter((x) => x.isDisc).length}`);

  const models = Object.keys(spec);
  const homeSlots = models.filter((m) => spec[m].home);
  const singleSlots = models.filter((m) => spec[m].single);
  const commSlots = models.filter((m) => spec[m].comm);
  const fill = (slotArr, slot, field) => {
    const n = slotArr.filter((m) => String(spec[m][slot][field] || '').trim()).length;
    return `${field}:${n}(${pct(n, slotArr.length)})`;
  };
  console.log(`specDetailMap: ${models.length}모델 | home=${homeSlots.length} single=${singleSlots.length} comm=${commSlots.length}`);
  console.log(`  home 채움률  → ${['cool_kw', 'cool_kcal', 'cool_power', 'effGrade', 'packSize', 'maxPipe'].map((f) => fill(homeSlots, 'home', f)).join(' ')}`);
  console.log(`  single 채움률 → ${['grade', 'cool_cap_kw', 'heat_cap_kcal', 'powerLine', 'breaker', 'pipeLen', 'drop', 'inPackSize'].map((f) => fill(singleSlots, 'single', f)).join(' ')}`);
  console.log(`  comm 채움률  → ${['cool_cap_kcal', 'heat_cap_kw', 'cool_pow_kw', 'grade', 'maxPipe'].map((f) => fill(commSlots, 'comm', f)).join(' ')}`);

  // 샘플 3건 — 실명 기반 분류/스펙 눈검증용
  console.log('\n샘플 (홈멀티 상위 3):');
  hm.slice(0, 3).forEach((x) => console.log(`  ${x.model} | ${x.name} → catL=${x.catL} catM=${x.catM} catS=${x.catS} disp=${x.disp} useK2=${x.useK2} maxIndoor=${x.maxIndoor}`));
  console.log('샘플 (싱글 상위 3):');
  ss.slice(0, 3).forEach((x) => console.log(`  ${x.model} | ${x.name} → matKey=${x.matKey} price=${x.price}`));
  console.log('샘플 (상업 catS 보유 3):');
  cm.filter((x) => x.catS).slice(0, 3).forEach((x) => console.log(`  ${x.model} | ${x.name} → ${x.catL}/${x.catM}/${x.catS}`));
}

main().then(() => process.exit(0)).catch((e) => { console.error('QA 실패:', e); process.exit(1); });
