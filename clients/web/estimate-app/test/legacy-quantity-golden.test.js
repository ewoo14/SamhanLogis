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

function homeQuantitySyncRule(sourceCode, targetCode, multiplier = 1) {
  return {
    ruleKey: `HOME_MULTI_${sourceCode}_${targetCode}`,
    estimateCategory: 'HOME_MULTI',
    enabled: true,
    aggregation: 'SUM',
    inactiveBehavior: 'ZERO',
    sources: [{ productCode: sourceCode, factor: 1 }],
    targets: [{ productCode: targetCode, multiplier, roundingMode: 'NONE', displayOrder: 1 }],
  };
}

function realHomeQuantityInput({ family, sourceCode, targetCode, optionSelector, optionValue, quantitySyncRules }) {
  const fixture = fixtures.find((item) => item.family === family);
  const homeRows = fixture.catalog.home
    .filter((row) => !['FH-LFHLF4W', 'FH-LFHIF4W'].includes(row.model));
  const extraRows = [
    { model: 'AJ020BN1PBC1', name: '실내기 1WAY WIFI 중형', unit: 'EA' },
    { model: 'FH-LFHLN', name: '유연호스 L형 4WAY', unit: 'EA' },
    { model: 'SI-AL600A', name: 'SI-AL600A 일자발', unit: 'EA' },
  ];
  const knownModels = new Set(homeRows.map((row) => row.model));
  extraRows.forEach((row) => {
    if (!knownModels.has(row.model)) homeRows.push(row);
  });

  return {
    ...inputFor({
      ...fixture,
      catalog: { ...fixture.catalog, home: homeRows },
      sourceQuantities: { [sourceCode]: 2 },
      options: { ...fixture.options, dom: { ...fixture.options.dom, [optionSelector]: optionValue } },
    }),
    quantitySyncRules: quantitySyncRules ?? [homeQuantitySyncRule(sourceCode, targetCode)],
  };
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
    case 'legacy-963-hose-alias':
      return replaceOnce(source, 'const hose1L = HOSE_1W;', "const hose1L = pickHoseModel('1way');");
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
  if (mutation === 'legacy-963-hose-alias') {
    return inputFor(optionFixtures.find((fixture) => fixture.id === 'C-02-I-HOSE'));
  }
  return inputFor(fixtures.find((fixture) => fixture.family === (mutation === 'option-invert' ? 'H-04' : mutation === 'target-model' || mutation === 'manual-lock-ignore' ? 'H-03' : 'H-01')));
}

describe('단계 0 견적 앱 legacy 수량 경계 golden', () => {
  test('H-01~08 · S-01~03 · C-01~09 20 가족을 모두 실행한다', () => {
    expect(fixtures.map((fixture) => fixture.family)).toEqual(FAMILY_ORDER);
  });

  test.each(['recomputeHomeHoses_', 'applyServerHomeQuantitySync_'])(
    '앱별 홈 helper 경계: %s는 주문에서 선택적이고 견적에서 필수다',
    (name) => {
      const fixture = fixtures.find((item) => item.family === 'H-01');
      expect(() => evaluateLegacyQuantityBoundary({ ...fixture, app: 'order' })).not.toThrow();
      expect(() => evaluateLegacyQuantityBoundary(inputFor(fixture), {
        sourceMutator: (source) => replaceOnce(source, `function ${name}()`, `function missing_${name}()`),
      })).toThrow(`${name} 함수를 찾을 수 없습니다.`);
    },
  );

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

  test.each([
    [true, true, { l1w: 0, i1w: 2, l4w: 0, i4w: 1 }],
    [true, false, { l1w: 0, i1w: 2, l4w: 0, i4w: 1 }],
    [false, true, { l1w: 0, i1w: 2, l4w: 1, i4w: 0 }],
    [false, false, { l1w: 2, i1w: 0, l4w: 1, i4w: 0 }],
  ])('결함 1: 전역 I형=%s · 화면칩 I형=%s에서도 상업 호스 수량을 보존한다', (showIHose, domIHose, expected) => {
    const fixture = fixtures.find((item) => item.family === 'C-02');
    const actual = evaluateLegacyQuantityBoundary({
      ...inputFor(fixture),
      options: {
        ...fixture.options,
        dom: { ...fixture.options.dom, '#comm_hose_i': domIHose },
        showIHose,
      },
    });
    expect({
      l1w: actual.quantities['FH-LFHLF'] || 0,
      i1w: actual.quantities['FH-LFHIF'] || 0,
      l4w: actual.quantities['FH-LFHLF4W'] || 0,
      i4w: actual.quantities['FH-LFHIF4W'] || 0,
    }).toEqual(expected);
  });

  test('정찰 §5 기존 8종 중 7종은 유지되고 해소된 2종은 양 앱 값으로 수렴한다', () => {
    const cases = [
      [estimateGoldens['H-01'], orderGoldens['H-01'], 'AR-EC05', 4, 3],
      [estimateGoldens['H-07'], orderGoldens['H-07'], 'AXJ-YA1509N', 1, 0],
      [estimateOptionGoldens['H-01-I-DOM-ONLY'], orderOptionGoldens['H-01-I-DOM-ONLY'], 'FH-LFHIF', 2, 0],
      [estimateOptionGoldens['C-01-AIR-PANEL'], orderOptionGoldens['C-01-AIR-PANEL'], 'PC4NUCK4NW', 1, 0],
      [estimateOptionGoldens['S-01-CATEGORY-DRIFT'], orderOptionGoldens['S-01-CATEGORY-DRIFT'], 'set-round-target', 0, 4],
      [estimateOptionGoldens['C-02-REMAINDER-DRIFT'], orderOptionGoldens['C-02-REMAINDER-DRIFT'], 'FH-LFHLF4W', 2, 0],
      [estimateOptionGoldens['C-09-2812'], orderOptionGoldens['C-09-2812'], 'AXJ-YA2812M', 5, 2],
    ];
    cases.forEach(([estimate, order, model, estimateQty, orderQty]) => {
      expect(estimate[model] || 0).toBe(estimateQty);
      expect(order[model] || 0).toBe(orderQty);
      expect(estimateQty).not.toBe(orderQty);
    });
    expect(estimateOptionGoldens['H-03-PANEL-LOCK']['PC1MWSK3NW']).toBe(9);
    expect(orderOptionGoldens['H-03-PANEL-LOCK']['PC1MWSK3NW']).toBe(9);
    expect(estimateOptionGoldens['C-02-I-HOSE']['FH-LFHIF']).toBe(2);
    expect(orderOptionGoldens['C-02-I-HOSE']['FH-LFHIF']).toBe(2);
  });

  test('두 앱 드리프트의 견적 fixture를 보존한다', () => {
    expect(estimateGoldens['H-01']['AR-EC05']).toBe(4);
    expect(estimateGoldens['H-07']['AXJ-YA1509N']).toBe(1);
    expect(estimateGoldens['C-07']['AF-R09A']).toBe(2);
  });

  test.each([
    ['분기관 제외', 'H-01', 'AM020BN1PBH1', 'AXJ-YA1509N', '#home_no_branch', true],
    ['발통 미포함', 'H-08', 'AJ060MXHNBC1', '발통세트', '#home_foot', false],
    ['일자발통 미포함', 'H-08', 'AJ060MXHNBC1', 'SI-AL700a', '#home_foot', false],
  ])('RED-A: %s 옵션은 HOME_MULTI 규칙 target보다 우선해 0을 만든다', (label, family, sourceCode, targetCode, option, optionValue) => {
    const fixture = fixtures.find((item) => item.family === family);
    const sourceQuantities = { ...fixture.sourceQuantities, [sourceCode]: 2 };
    if (family === 'H-01') sourceQuantities.AJ040MXHNBC1 = 1;
    const actual = evaluateLegacyQuantityBoundary({
      ...inputFor({
        ...fixture,
        sourceQuantities,
        options: { ...fixture.options, dom: { ...fixture.options.dom, [option]: optionValue } },
      }),
      quantitySyncRules: [homeQuantitySyncRule(sourceCode, targetCode)],
    });

    expect(actual.quantities[targetCode] || 0).toBe(0);
  });

  test.each([
    ['분기관 포함', 'H-01', 'AM020BN1PBH1', 'AXJ-YA1509N', '#home_no_branch', false],
    ['발통 포함', 'H-08', 'AJ060MXHNBC1', '발통세트', '#home_foot', true],
    ['일자발통 포함', 'H-08', 'AJ060MXHNBC1', 'SI-AL700a', '#home_foot', true],
  ])('RED-B: %s에서는 규칙 target 계산값을 소비한다', (label, family, sourceCode, targetCode, option, optionValue) => {
    const fixture = fixtures.find((item) => item.family === family);
    const sourceQuantities = { ...fixture.sourceQuantities, [sourceCode]: 2 };
    if (family === 'H-01') sourceQuantities.AJ040MXHNBC1 = 1;
    const actual = evaluateLegacyQuantityBoundary({
      ...inputFor({
        ...fixture,
        sourceQuantities,
        options: { ...fixture.options, dom: { ...fixture.options.dom, [option]: optionValue } },
      }),
      quantitySyncRules: [homeQuantitySyncRule(sourceCode, targetCode, 2)],
    });

    expect(actual.quantities[targetCode] || 0).toBe(4);
  });

  test.each([
    ['호스', 'AJ020BN1PBC1', 'FH-LFHLN', '#home_no_hose', true],
    ['판넬', 'AJ020BN1PBC1', 'PC6NUDK1NW', '#home_panel', '판넬제외'],
    ['리모컨', 'AJ020BN1PBC1', 'AWR-WE13N', '#home_remote', '제외'],
    ['발통', 'AJ060MXHNBC1', 'SI-AL600A', '#home_foot', false],
  ])('R17 RED-A: %s 제외 옵션은 실 규칙 target을 0으로 만든다', (label, sourceCode, targetCode, optionSelector, optionValue) => {
    const family = targetCode === 'SI-AL600A' ? 'H-08' : 'H-01';
    const actual = evaluateLegacyQuantityBoundary(realHomeQuantityInput({
      family,
      sourceCode,
      targetCode,
      optionSelector,
      optionValue,
    }));

    expect(actual.quantities[targetCode] || 0).toBe(0);
  });

  test.each([
    ['호스', 'AJ020BN1PBC1', 'FH-LFHLN', '#home_no_hose', false],
    ['판넬', 'AJ020BN1PBC1', 'PC6NUDK1NW', '#home_panel', '기본'],
    ['리모컨', 'AJ020BN1PBC1', 'AWR-WE13N', '#home_remote', '기본'],
    ['발통', 'AJ060MXHNBC1', 'SI-AL600A', '#home_foot', true],
  ])('R17 RED-B: %s 비제외 옵션은 실 규칙 target 2를 보존한다', (label, sourceCode, targetCode, optionSelector, optionValue) => {
    const family = targetCode === 'SI-AL600A' ? 'H-08' : 'H-01';
    const actual = evaluateLegacyQuantityBoundary(realHomeQuantityInput({
      family,
      sourceCode,
      targetCode,
      optionSelector,
      optionValue,
    }));

    expect(actual.quantities[targetCode] || 0).toBe(2);
  });

  const r17FamilyMatrix = [
    {
      label: '호스', family: 'H-01', sourceCode: 'AJ020BN1PBC1', targetCode: 'FH-LFHLN',
      nonOwnedTarget: 'PC6NUDK1NW', optionSelector: '#home_no_hose', options: [true, false],
    },
    {
      label: '판넬', family: 'H-01', sourceCode: 'AJ020BN1PBC1', targetCode: 'PC6NUDK1NW',
      nonOwnedTarget: 'FH-LFHLN', optionSelector: '#home_panel', options: ['판넬제외', '기본'],
    },
    {
      label: '리모컨', family: 'H-01', sourceCode: 'AJ020BN1PBC1', targetCode: 'AWR-WE13N',
      nonOwnedTarget: 'FH-LFHLN', optionSelector: '#home_remote', options: ['제외', '기본'],
    },
    {
      label: '분기관', family: 'H-07', sourceCode: 'AM020BN1PBH1', targetCode: 'AXJ-YA1509N',
      nonOwnedTarget: 'PC6NUDK1NW', optionSelector: '#home_no_branch', options: [true, false],
    },
    {
      label: '발통', family: 'H-08', sourceCode: 'AJ060MXHNBC1', targetCode: 'SI-AL600A',
      nonOwnedTarget: 'FH-LFHLN', optionSelector: '#home_foot', options: [false, true],
    },
  ];

  test.each(r17FamilyMatrix.flatMap((familyCase) => familyCase.options.flatMap((optionValue) => [
    [familyCase, optionValue, '0건'],
    [familyCase, optionValue, '소유'],
    [familyCase, optionValue, '비소유'],
  ])))('R17 matrix: %s · 옵션=%s · 규칙=%s', (familyCase, optionValue, ruleState) => {
    const ruleTarget = ruleState === '소유' ? familyCase.targetCode : familyCase.nonOwnedTarget;
    const actual = evaluateLegacyQuantityBoundary(realHomeQuantityInput({
      family: familyCase.family,
      sourceCode: familyCase.sourceCode,
      targetCode: ruleTarget,
      optionSelector: familyCase.optionSelector,
      optionValue,
      quantitySyncRules: ruleState === '0건' ? [] : [homeQuantitySyncRule(familyCase.sourceCode, ruleTarget)],
    }));
    const legacy = evaluateLegacyQuantityBoundary(realHomeQuantityInput({
      family: familyCase.family,
      sourceCode: familyCase.sourceCode,
      targetCode: familyCase.targetCode,
      optionSelector: familyCase.optionSelector,
      optionValue,
      quantitySyncRules: [],
    }));

    if (ruleState === '소유') {
      const excluded = familyCase.label === '발통' ? optionValue === false
        : familyCase.label === '분기관' ? optionValue === true
          : optionValue === true || optionValue === '판넬제외' || optionValue === '제외';
      expect(actual.quantities[familyCase.targetCode] || 0).toBe(excluded ? 0 : 2);
    } else {
      expect(actual.quantities[familyCase.targetCode] || 0).toBe(legacy.quantities[familyCase.targetCode] || 0);
    }
  });

  test('R17 guard: 리모컨 규칙 target은 재계산을 반복해도 2→4로 누적되지 않는다', () => {
    const result = evaluateLegacyQuantityBoundary({
      ...realHomeQuantityInput({
        family: 'H-01',
        sourceCode: 'AJ020BN1PBC1',
        targetCode: 'AWR-WE13N',
        optionSelector: '#home_remote',
        optionValue: '기본',
      }),
      recomputeHomeDerivedCount: 3,
    });

    expect(result.detail.recomputeSequence.map((quantities) => quantities['AWR-WE13N'] || 0)).toEqual([2, 2, 2]);
  });

  test('R17 RED-B guard: 규칙 0건 golden과 분기관·발통 수동잠금 계약을 유지한다', () => {
    fixtures.forEach((fixture) => {
      expect(evaluateLegacyQuantityBoundary(inputFor(fixture)).quantities).toEqual(estimateGoldens[fixture.family]);
    });
    optionFixtures.forEach((fixture) => {
      expect(evaluateLegacyQuantityBoundary(inputFor(fixture)).quantities).toEqual(estimateOptionGoldens[fixture.id]);
    });

    const branchFixture = fixtures.find((item) => item.family === 'H-07');
    const branch = evaluateLegacyQuantityBoundary({
      ...inputFor({
        ...branchFixture,
        sourceQuantities: { ...branchFixture.sourceQuantities, 'AXJ-YA1509N': 77 },
      }),
      manualLocks: { home: { branch: ['AXJ-YA1509N'] } },
    });
    const footFixture = fixtures.find((item) => item.family === 'H-08');
    const foot = evaluateLegacyQuantityBoundary({
      ...inputFor({
        ...footFixture,
        sourceQuantities: { ...footFixture.sourceQuantities, '발통세트': 77 },
      }),
      manualLocks: { home: { foot: ['발통세트'] } },
    });
    expect(branch.quantities['AXJ-YA1509N']).toBe(77);
    expect(foot.quantities['발통세트']).toBe(77);
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
