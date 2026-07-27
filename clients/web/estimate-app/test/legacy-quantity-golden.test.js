'use strict';

const { evaluateLegacyQuantityBoundary } = require('../../legacy-quantity-golden/legacyQuantityBoundary');
const { fixtures, optionFixtures } = require('../../legacy-quantity-golden/fixtures');
const { estimateGoldens, estimateOptionGoldens, orderGoldens, orderOptionGoldens } = require('../../legacy-quantity-golden/goldens');

const FAMILY_ORDER = ['H-01', 'H-02', 'H-03', 'H-04', 'H-05', 'H-06', 'H-07', 'H-08', 'S-01', 'S-02', 'S-03', 'C-01', 'C-02', 'C-03', 'C-04', 'C-05', 'C-06', 'C-07', 'C-08', 'C-09'];

function inputFor(fixture) {
  // target 모델(HOSE_*/FOOT_*/REMOTE_*/BRANCH_*/SS_*_ID)은 fixture나 테스트가 주입하지
  // 않는다 — legacyQuantityBoundary가 정본의 derivationPreambleSource를 그대로 실행해
  // catalog snapshot에서 도출한다. 과거에는 여기서 remote360Default: 'AR-EC05'를 강제로
  // 얹어 두 앱의 REMOTE_360_DEFAULT 드리프트(정본 정규식 자체가 다름 — index.ejs:4489
  // vs index.html:2789)를 가려버렸다.
  return { ...fixture, app: 'estimate' };
}

function replaceOnce(source, from, to) {
  if (!source.includes(from)) throw new Error(`뮤테이션 지점을 찾지 못했습니다: ${from}`);
  return source.replace(from, to);
}

function mutationSource(source, mutation) {
  switch (mutation) {
    case 'multiplier':
      return replaceOnce(source, 'if (m && !HOME_MANUAL_HOSE.has(m)) homeQty.set(m, q);', 'if (m && !HOME_MANUAL_HOSE.has(m)) homeQty.set(m, q * 2);');
    case 'target-model':
      return replaceOnce(source, 'p1sWi:\'PC1MWSK3NW\'', 'p1sWi:\'PC1NWSK3NW\'');
    case 'source-omit':
      return source;
    case 'add-to-replace':
      return replaceOnce(source, 'want.set(pm, (want.get(pm) || 0) + q);', 'want.set(pm, q);');
    case 'inactive-keep':
      return replaceOnce(source, 'if (isPanelRow(r) && !HOME_MANUAL_PANEL.has(r.model)) homeQty.set(r.model, 0);', 'if (false && isPanelRow(r) && !HOME_MANUAL_PANEL.has(r.model)) homeQty.set(r.model, 0);');
    case 'option-invert':
      return replaceOnce(source, "if (opt === '공청판넬')", "if (opt !== '공청판넬')");
    case 'manual-lock-ignore':
      return replaceOnce(source, 'if (isPanelRow(r) && !HOME_MANUAL_PANEL.has(r.model)) homeQty.set(r.model, 0);', 'if (isPanelRow(r)) homeQty.set(r.model, 0);');
    // --- 아래 12종은 D-2("target 모델 도출 계층 전체가 golden 밖") 재발 방지 게이트다.
    // 각각 derivationPreambleSource가 추출하는 정본 상수 하나를 실제로 변조한다.
    // 이 12종이 전부 RED가 되어야 golden이 하드코딩된 fixture 값이 아니라 정본의
    // 카탈로그 기반 도출 계산에 실제로 묶여 있다고 말할 수 있다.
    case 'derive-foot-round':
      return replaceOnce(
        source,
        "const FOOT_ROUND=(HOMEMULTI.find(r=>/원형발통\\s*세트|발통세트/i.test(r?.name||''))||{}).model||'';",
        "const FOOT_ROUND=(HOMEMULTI.find(r=>/SI-AL700a/i.test(r?.model||''))||{}).model||'';",
      );
    case 'derive-branch-swap':
      return replaceOnce(
        replaceOnce(
          source,
          "const BRANCH_2512=(HOMEMULTI.find(r=>/AXJ-YA2512N/.test(r?.model||''))||{}).model||'';",
          "const BRANCH_2512=(HOMEMULTI.find(r=>/AXJ-YA1509N/.test(r?.model||''))||{}).model||'';",
        ),
        "const BRANCH_1509=(HOMEMULTI.find(r=>/AXJ-YA1509N/.test(r?.model||''))||{}).model||'';",
        "const BRANCH_1509=(HOMEMULTI.find(r=>/AXJ-YA2512N/.test(r?.model||''))||{}).model||'';",
      );
    case 'derive-hose-1w-swap':
      return replaceOnce(
        source,
        "const _HOSE_L_1W=(HOMEMULTI.find(r=>/유연호스.*(L형|엘형).*(1\\s*-?\\s*WAY|1WAY)/i.test(r?.name||''))||{}).model||'';",
        "const _HOSE_L_1W=(HOMEMULTI.find(r=>/유연호스.*(I형|아이형).*(1\\s*-?\\s*WAY|1WAY)/i.test(r?.name||''))||{}).model||'';",
      );
    case 'derive-remote-kit-off':
      return replaceOnce(
        source,
        "const REMOTE_WIRED_KIT=(HOMEMULTI.find(r=>/(유선\\s*리모컨\\s*키트|유선\\s*키트|리모컨\\s*키트)/i.test(r?.name||''))||{}).model||null;",
        "const REMOTE_WIRED_KIT=(HOMEMULTI.find(r=>/$^/i.test(r?.name||''))||{}).model||null;",
      );
    case 'derive-cumsum-threshold':
      return replaceOnce(source, "if(csum < 150) return '1509';", "if(csum < 9999) return '1509';");
    case 'derive-renew-filter-map':
      return replaceOnce(
        source,
        "'AF-R09A': ['AM035FXMRHC1','AM050MXMRBC1','AM050FXMRHC1'],",
        "'AF-R09A': ['AM075FXMRHC1'],",
      );
    case 'derive-remote-360-drift':
      return replaceOnce(
        source,
        "const REMOTE_360_DEFAULT=(HOMEMULTI.find(r=>/(AR-?EC05)/i.test(r?.model||'')||/(AR-?EC05)/i.test(r?.name||''))||{}).model||null;",
        "const REMOTE_360_DEFAULT=(HOMEMULTI.find(r=>/(AR-?KH05)/i.test(r?.model||'')||/(AR-?KH05)/i.test(r?.name||''))||{}).model||null;",
      );
    case 'derive-outdoor-hp-threshold':
      return replaceOnce(source, "else if(hp <= 160)  forced = '2812';", "else if(hp <= 60)  forced = '2812';");
    case 'derive-hose-4w-swap':
      return replaceOnce(
        source,
        "const _HOSE_L_4W=(HOMEMULTI.find(r=>/유연호스.*(L형|엘형).*(4\\s*-?\\s*WAY|4WAY)/i.test(r?.name||''))||{}).model||'';",
        "const _HOSE_L_4W=(HOMEMULTI.find(r=>/유연호스.*(I형|아이형).*(4\\s*-?\\s*WAY|4WAY)/i.test(r?.name||''))||{}).model||'';",
      );
    case 'derive-remote-wireless-off':
      return replaceOnce(
        source,
        "const REMOTE_WIRELESS=(HOMEMULTI.find(r=>/(AR-EC05|무선\\s*리모컨|무선리모콘)/i.test(r?.name||''))||{}).model||null;",
        "const REMOTE_WIRELESS=(HOMEMULTI.find(r=>/$^/i.test(r?.name||''))||{}).model||null;",
      );
    case 'derive-wired-board-off':
      return replaceOnce(
        source,
        "const SS_WIRED_BOARD_ID=(SINGLE_SETS.find(s=>/유선보드/i.test(s?.name||'')||/AIM-?A01N/i.test(s?.model||''))||{}).id||null;",
        "const SS_WIRED_BOARD_ID=(SINGLE_SETS.find(s=>/$^/i.test(s?.name||''))||{}).id||null;",
      );
    case 'derive-ceiling-pump-off':
      return replaceOnce(
        source,
        "const SS_CEILING_PUMP_ID=(SINGLE_SETS.find(s=>/(실링용\\s*)?드레인펌프/i.test(s?.name||'')&&/실링/i.test(s?.name||''))||{}).id||null;",
        "const SS_CEILING_PUMP_ID=(SINGLE_SETS.find(s=>/$^/i.test(s?.name||''))||{}).id||null;",
      );
    default:
      return source;
  }
}

// 새 12종 뮤테이션의 base fixture 라우팅. 값은 fixtures(20 가족) 안의 family명이다.
const DERIVATION_MUTATION_FAMILY = {
  'derive-foot-round': 'H-08',
  'derive-hose-1w-swap': 'H-01',
  'derive-remote-kit-off': 'H-06',
  'derive-renew-filter-map': 'C-07',
  'derive-remote-360-drift': 'H-01',
  'derive-outdoor-hp-threshold': 'C-09',
  'derive-hose-4w-swap': 'H-02',
  'derive-remote-wireless-off': 'H-01',
  'derive-wired-board-off': 'S-02',
  'derive-ceiling-pump-off': 'S-03',
};

function mutationInput(mutation) {
  if (mutation === 'source-omit') {
    const base = inputFor(fixtures.find((fixture) => fixture.family === 'H-01'));
    const sourceQuantities = { ...base.sourceQuantities };
    delete sourceQuantities.AM020BN1PBH1;
    return { ...base, sourceQuantities };
  }
  if (mutation === 'add-to-replace') {
    const base = fixtures.find((fixture) => fixture.family === 'C-01');
    const catalog = JSON.parse(JSON.stringify(base.catalog));
    const first = catalog.commercial.find((row) => row.model === 'AM052DNLDBH1');
    first.name = '실내기 1WAY WIFI 내장 중형';
    return { ...inputFor({ ...base, catalog, sourceQuantities: { AM052DNLDBH1: 2, AM072DNMDBH1: 1 } }) };
  }
  if (mutation === 'inactive-keep') {
    const base = fixtures.find((fixture) => fixture.family === 'H-03');
    return { ...inputFor(base), sourceQuantities: { PC2NWSK1N: 7 } };
  }
  if (mutation === 'manual-lock-ignore') {
    const base = fixtures.find((fixture) => fixture.family === 'H-03');
    return {
      ...inputFor(base),
      sourceQuantities: { ...base.sourceQuantities, PC1MWSK3NW: 9 },
      manualLocks: { home: { panel: ['PC1MWSK3NW'] } },
    };
  }
  // BRANCH_2512/1509는 recomputeHomeBranches의 "분기관 수량"에만 쓰인다 — 기존 20 가족
  // 중 단배관 실외기가 있는 건 H-07/H-08뿐인데, H-07은 에어콤보가 실내기 카운트에서
  // 빠지는 앱 드리프트 때문에(§4) 두 앱 다 분기관이 0, H-08은 #home_no_branch=true라
  // 이 분기 자체를 타지 않는다. 그래서 이 뮤테이션만은 단배관 실외기 1대 + 순수 실내기
  // 3대로 직접 구성한 입력으로 검증한다(두 앱 모두 AXJ-YA1509N:2가 정상값).
  if (mutation === 'derive-branch-swap') {
    const base = fixtures.find((fixture) => fixture.family === 'H-01');
    return { ...inputFor(base), sourceQuantities: { AM020BN1PBH1: 3, AJ040MXHNBC1: 1 } };
  }
  // 누적합 임계표 뮤테이션은 C-09의 6개 경계 옵션 중 하나(2512 버킷)를 써야 실제로
  // 코드가 바뀌는 지점을 통과한다 — base C-09(2-슬롯)는 누적합 코드가 실외기 HP
  // 강제표로 항상 덮어써져서 이 뮤테이션의 영향을 받지 않는다.
  if (mutation === 'derive-cumsum-threshold') {
    return inputFor(optionFixtures.find((fixture) => fixture.id === 'C-09-2512'));
  }
  if (DERIVATION_MUTATION_FAMILY[mutation]) {
    return inputFor(fixtures.find((fixture) => fixture.family === DERIVATION_MUTATION_FAMILY[mutation]));
  }
  return inputFor(fixtures.find((fixture) => fixture.family === (mutation === 'option-invert' ? 'H-04' : mutation === 'target-model' || mutation === 'manual-lock-ignore' ? 'H-03' : 'H-01')));
}

describe('단계 0 견적 앱 legacy 수량 경계 golden', () => {
  test('H-01~08 · S-01~03 · C-01~09 20 가족을 모두 실행한다', () => {
    expect(fixtures.map((fixture) => fixture.family)).toEqual(FAMILY_ORDER);
  });

  test.each(fixtures)('$family 수량·target 모델이 golden과 같다', (fixture) => {
    const actual = evaluateLegacyQuantityBoundary(inputFor(fixture));
    expect(actual.quantities).toEqual(estimateGoldens[fixture.family]);
    expect(actual.unitPrices).toBeNull();
    expect(actual.subtotals).toBeNull();
    expect(actual.supplyAmount).toBeNull();
    expect(actual.vat).toBeNull();
    expect(actual.total).toBeNull();
  });

  test.each(optionFixtures)('$id 옵션 갈래의 수량·target 모델이 golden과 같다', (fixture) => {
    const actual = evaluateLegacyQuantityBoundary(inputFor(fixture));
    expect(actual.quantities).toEqual(estimateOptionGoldens[fixture.id]);
    expect(actual.unitPrices).toBeNull();
    expect(actual.subtotals).toBeNull();
    expect(actual.supplyAmount).toBeNull();
    expect(actual.vat).toBeNull();
    expect(actual.total).toBeNull();
  });

  test('C-09-2812 견적 분기 수동 추가 3개를 golden에 반영한다', () => {
    const fixture = optionFixtures.find((item) => item.id === 'C-09-2812');
    const actual = evaluateLegacyQuantityBoundary(inputFor(fixture));
    expect(actual.quantities['AXJ-YA2812M']).toBe(5);
  });

  test('정찰 §5 드리프트 8종이 양 앱 golden에 각각 남아 있다', () => {
    const cases = [
      [estimateGoldens['H-01'], orderGoldens['H-01'], 'AR-EC05', 4, 3],
      [estimateGoldens['H-07'], orderGoldens['H-07'], 'AXJ-YA1509N', 1, 0],
      [estimateOptionGoldens['H-01-I-DOM-ONLY'], orderOptionGoldens['H-01-I-DOM-ONLY'], 'FH-LFHIF', 2, 0],
      [estimateOptionGoldens['C-01-AIR-PANEL'], orderOptionGoldens['C-01-AIR-PANEL'], 'PC4NUCK4NW', 1, 0],
      [estimateOptionGoldens['S-01-CATEGORY-DRIFT'], orderOptionGoldens['S-01-CATEGORY-DRIFT'], 'set-round-target', 0, 4],
      [estimateOptionGoldens['C-02-REMAINDER-DRIFT'], orderOptionGoldens['C-02-REMAINDER-DRIFT'], 'FH-LFHLF4W', 2, 0],
      [estimateOptionGoldens['H-03-PANEL-LOCK'], orderOptionGoldens['H-03-PANEL-LOCK'], 'PC1MWSK3NW', 9, 1],
      [estimateOptionGoldens['C-09-2812'], orderOptionGoldens['C-09-2812'], 'AXJ-YA2812M', 5, 2],
    ];
    cases.forEach(([estimate, order, model, estimateQty, orderQty]) => {
      expect(estimate[model] || 0).toBe(estimateQty);
      expect(order[model] || 0).toBe(orderQty);
      expect(estimateQty).not.toBe(orderQty);
    });
  });

  test('두 앱 드리프트의 견적 fixture를 보존한다', () => {
    expect(estimateGoldens['H-01']['AR-EC05']).toBe(4);
    expect(estimateGoldens['H-07']['AXJ-YA1509N']).toBe(1);
    expect(estimateGoldens['C-07']['AF-R09A']).toBe(2);
  });

  const mutation = process.env.LEGACY_MUTATION;
  if (mutation && mutation !== 'drift-fixture-delete') {
    test(`뮤테이션 ${mutation}은 golden을 RED로 만든다`, () => {
      const input = mutationInput(mutation);
      const baselineInput = mutation === 'source-omit' ? inputFor(fixtures.find((fixture) => fixture.family === 'H-01')) : input;
      const baseline = evaluateLegacyQuantityBoundary(baselineInput).quantities;
      const mutated = evaluateLegacyQuantityBoundary(input, { sourceMutator: (source) => mutationSource(source, mutation) }).quantities;
      expect(mutated).toEqual(baseline);
    });
  }

  if (mutation === 'drift-fixture-delete') {
    test('드리프트 fixture 삭제를 RED로 감지한다', () => {
      const activeFixtures = fixtures.filter((fixture) => fixture.family !== 'H-07');
      expect(activeFixtures.map((fixture) => fixture.family)).toEqual(FAMILY_ORDER);
    });
  }
});
