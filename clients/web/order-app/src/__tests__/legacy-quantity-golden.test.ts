import { describe, expect, test } from 'vitest';

declare const process: { env: Record<string, string | undefined> };
declare function require(id: string): any;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { evaluateLegacyQuantityBoundary } = require('../../../legacy-quantity-golden/legacyQuantityBoundary');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fixtures, optionFixtures } = require('../../../legacy-quantity-golden/fixtures');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { orderGoldens, orderOptionGoldens } = require('../../../legacy-quantity-golden/goldens');

const FAMILY_ORDER = ['H-01', 'H-02', 'H-03', 'H-04', 'H-05', 'H-06', 'H-07', 'H-08', 'S-01', 'S-02', 'S-03', 'C-01', 'C-02', 'C-03', 'C-04', 'C-05', 'C-06', 'C-07', 'C-08', 'C-09'];

function inputFor(fixture: any) {
  // target 모델(HOSE_*/FOOT_*/REMOTE_*/BRANCH_*/SS_*_ID)은 fixture나 테스트가 주입하지
  // 않는다 — legacyQuantityBoundary가 정본의 derivationPreambleSource를 그대로 실행해
  // catalog snapshot에서 도출한다. 과거에는 여기서 remote360Default: 'AR-KH05'를 강제로
  // 얹어 두 앱의 REMOTE_360_DEFAULT 드리프트(정본 정규식 자체가 다름 — index.html:2789
  // vs index.ejs:4489)를 가려버렸다.
  return { ...fixture, app: 'order' };
}

function replaceOnce(source: string, from: string, to: string) {
  if (!source.includes(from)) throw new Error(`뮤테이션 지점을 찾지 못했습니다: ${from}`);
  return source.replace(from, to);
}

function mutationSource(source: string, mutation: string) {
  switch (mutation) {
    case 'multiplier': return replaceOnce(source, 'if(HOSE_4W)   homeQty.set(HOSE_4W,   n4w);', 'if(HOSE_4W)   homeQty.set(HOSE_4W,   n4w * 2);');
    case 'target-model': return replaceOnce(source, "p1sWi:'PC1MWSK3NW'", "p1sWi:'PC1NWSK3NW'");
    case 'source-omit': return source;
    case 'legacy-963-home-manual': return replaceOnce(source, 'if(isPanelRow(r) && !HOME_MANUAL_PANEL.has(r.model)) homeQty.set(r.model,0);', 'if(isPanelRow(r)) homeQty.set(r.model,0);');
    case 'add-to-replace': return replaceOnce(source, 'if(pm) want.set(pm, (want.get(pm)||0) + q);', 'if(pm) want.set(pm, q);');
    case 'inactive-keep': return replaceOnce(source, 'if(isPanelRow(r)) homeQty.set(r.model,0);', 'if(false && isPanelRow(r)) homeQty.set(r.model,0);');
    case 'option-invert': return replaceOnce(source, "// 4WAY 공청 고정 치환\n  if(opt==='공청판넬'){", "// 4WAY 공청 고정 치환\n  if(opt!=='공청판넬'){");
    case 'manual-lock-ignore': {
      const from = 'if(isBase && COMM_MANUAL_BASE?.has?.(m)) return;';
      if (!source.includes(from)) throw new Error(`뮤테이션 지점을 찾지 못했습니다: ${from}`);
      return source
        .split(from).join('if(false && COMM_MANUAL_BASE?.has?.(m)) return;')
        .split('if(isBaseRow && COMM_MANUAL_BASE?.has?.(m)) return;').join('if(false && isBaseRow && COMM_MANUAL_BASE?.has?.(m)) return;');
    }
    // --- 아래 12종은 D-2("target 모델 도출 계층 전체가 golden 밖") 재발 방지 게이트다.
    // 각각 derivationPreambleSource가 추출하는 정본 상수 하나를 실제로 변조한다.
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
      // 주문 앱은 REMOTE_360_DEFAULT가 AR-KH05를 찾는다(견적은 AR-EC05) — 이것이
      // §4에서 "고정"이라 선언한 두 앱 드리프트 그 자체다. 이 뮤테이션은 주문의
      // 정규식을 견적과 같은 AR-EC05 탐색으로 되돌려, 드리프트 fixture(H-01/H-02/H-05)가
      // 실제로 그 차이를 검증하고 있는지 확인한다.
      return replaceOnce(
        source,
        "const REMOTE_360_DEFAULT=(HOMEMULTI.find(r=>/(AR-?KH05)/i.test(r?.model||'')||/360.*리모컨/i.test(r?.name||''))||{}).model||null;",
        "const REMOTE_360_DEFAULT=(HOMEMULTI.find(r=>/(AR-?EC05)/i.test(r?.model||'')||/(AR-?EC05)/i.test(r?.name||''))||{}).model||null;",
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
    default: return source;
  }
}

const DERIVATION_MUTATION_FAMILY: Record<string, string> = {
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

function mutationInput(mutation: string) {
  if (mutation === 'source-omit') {
    const base = inputFor(fixtures.find((fixture: any) => fixture.family === 'H-01'));
    const sourceQuantities = { ...base.sourceQuantities };
    delete sourceQuantities.AM020BN1PBH1;
    return { ...base, sourceQuantities };
  }
  if (mutation === 'manual-lock-ignore') {
    const base = fixtures.find((fixture: any) => fixture.family === 'C-05');
    return {
      ...inputFor(base),
      manualLocks: { commercial: { base: ['방진가대S2소'] } },
    };
  }
  // BRANCH_2512/1509는 recomputeHomeBranches의 "분기관 수량"에만 쓰인다 — 기존 20 가족
  // 중 단배관 실외기가 있는 건 H-07/H-08뿐인데, H-07은 주문 쪽 실내기 카운트가 에어콤보를
  // 제외하는 드리프트 때문에 두 앱 다 분기관이 0이 되고, H-08은 #home_no_branch=true라
  // 이 분기 자체를 타지 않는다. 그래서 단배관 실외기 1대 + 순수 실내기 3대로 직접
  // 구성한 입력으로 검증한다(두 앱 모두 AXJ-YA1509N:2가 정상값).
  if (mutation === 'derive-branch-swap') {
    const base = fixtures.find((fixture: any) => fixture.family === 'H-01');
    return { ...inputFor(base), sourceQuantities: { AM020BN1PBH1: 3, AJ040MXHNBC1: 1 } };
  }
  if (mutation === 'add-to-replace') {
    const base = fixtures.find((fixture: any) => fixture.family === 'C-01');
    const catalog = JSON.parse(JSON.stringify(base.catalog));
    const first = catalog.commercial.find((row: any) => row.model === 'AM052DNLDBH1');
    first.name = '실내기 1WAY WIFI 내장 중형';
    return inputFor({ ...base, catalog, sourceQuantities: { AM052DNLDBH1: 2, AM072DNMDBH1: 1 } });
  }
  if (mutation === 'inactive-keep') {
    const base = fixtures.find((fixture: any) => fixture.family === 'H-03');
    return { ...inputFor(base), sourceQuantities: { PC2NWSK1N: 7 } };
  }
  if (mutation === 'derive-cumsum-threshold') {
    return inputFor(optionFixtures.find((fixture: any) => fixture.id === 'C-09-2512'));
  }
  if (DERIVATION_MUTATION_FAMILY[mutation]) {
    return inputFor(fixtures.find((fixture: any) => fixture.family === DERIVATION_MUTATION_FAMILY[mutation]));
  }
  if (mutation === 'legacy-963-home-manual') {
    return inputFor(optionFixtures.find((fixture: any) => fixture.id === 'H-03-PANEL-LOCK'));
  }
  return inputFor(fixtures.find((fixture: any) => fixture.family === (mutation === 'option-invert' ? 'H-04' : mutation === 'target-model' ? 'H-03' : 'H-01')));
}

describe('단계 0 주문 앱 legacy 수량 경계 golden', () => {
  test('H-01~08 · S-01~03 · C-01~09 20 가족을 모두 실행한다', () => {
    expect(fixtures.map((fixture: any) => fixture.family)).toEqual(FAMILY_ORDER);
  });

  test.each(fixtures as any[])('$family 수량·target 모델이 golden과 같다', (fixture: any) => {
    const actual = evaluateLegacyQuantityBoundary(inputFor(fixture));
    expect(actual.quantities).toEqual(orderGoldens[fixture.family]);
    expect(actual.unitPrices).toBeNull();
    expect(actual.subtotals).toBeNull();
    expect(actual.supplyAmount).toBeNull();
    expect(actual.vat).toBeNull();
    expect(actual.total).toBeNull();
  });

  test.each(optionFixtures as any[])('$id 옵션 갈래의 수량·target 모델이 golden과 같다', (fixture: any) => {
    const actual = evaluateLegacyQuantityBoundary(inputFor(fixture));
    expect(actual.quantities).toEqual(orderOptionGoldens[fixture.id]);
    expect(actual.unitPrices).toBeNull();
    expect(actual.subtotals).toBeNull();
    expect(actual.supplyAmount).toBeNull();
    expect(actual.vat).toBeNull();
    expect(actual.total).toBeNull();
  });

  test('C-09-2812 주문 분기에는 견적 수동 추가 경로가 없어 2개를 유지한다', () => {
    const fixture = optionFixtures.find((item: any) => item.id === 'C-09-2812');
    const actual = evaluateLegacyQuantityBoundary(inputFor(fixture));
    expect(actual.quantities['AXJ-YA2812M']).toBe(2);
  });

  test.each([
    ['판넬', 'H-01', 'PC1NWSK3NW', 'panel', 'FH-LFHLF', 2],
    ['호스', 'H-01', 'FH-LFHLF', 'hose', 'PC1NWSK3NW', 2],
    ['리모컨', 'H-01', 'AR-EC05', 'remote', 'PC1NWSK3NW', 2],
    ['발통', 'H-08', '발통세트', 'foot', 'AXJ-YA1509N', 0],
    ['분기관', 'H-07', 'AXJ-YA1509N', 'branch', 'PC1NWSK3NW', 1],
  ])('결함 2: 홈 %s 수동 입력은 재계산 후 보존되고 다른 파생은 자동 계산된다', (label, family, model, lockKey, autoModel, autoExpected) => {
    const fixture = fixtures.find((item: any) => item.family === family);
    const actual = evaluateLegacyQuantityBoundary({
      ...inputFor(fixture),
      sourceQuantities: { ...fixture.sourceQuantities, [model]: 77 },
      manualLocks: { home: { [lockKey]: [model] } },
    });
    expect(actual.quantities[model]).toBe(77);
    expect(actual.quantities[autoModel] || 0).toBe(autoExpected);
  });

  test('정찰 §5 기존 8종 중 7종은 유지되고 해소된 2종은 견적과 수렴한다', () => {
    expect(orderGoldens['H-01']['AR-KH05']).toBe(1);
    expect(orderGoldens['H-07']['AXJ-YA1509N']).toBeUndefined();
    expect(orderGoldens['C-07']['AF-R09A']).toBeUndefined();
    expect(orderOptionGoldens['H-03-PANEL-LOCK']['PC1MWSK3NW']).toBe(9);
    expect(orderOptionGoldens['C-02-I-HOSE']['FH-LFHIF']).toBe(2);
  });

  // 주문 앱의 isCommOutdoorRow(index.html:2291-2299)는 견적처럼 모델 문자열 패턴이
  // 아니라 catL==='실외기' 또는 이름의 dvm/프라임/표준형/한랭지/상부토출 키워드로만
  // 실외기를 판별한다. RENEW_FILTER_MAP의 세 모델(AM035FXMRHC1 등) 중 어느 것도 이
  // 조건을 만족하지 않아 — 정본을 변조해도 주문 C-07 결과 자체가 원래부터 빈 값이라
  // 바뀌지 않는다. §4에 이미 기록된 "리뉴얼 필터: 견적만 존재" 드리프트와 같은 원인이며,
  // 이 축(RENEW_FILTER_MAP)은 견적에서만 RED로 검증 가능하다.
  const NOT_REACHABLE_FOR_ORDER = new Set(['derive-renew-filter-map']);
  const mutation = process.env.LEGACY_MUTATION;
  if (mutation && mutation !== 'drift-fixture-delete' && NOT_REACHABLE_FOR_ORDER.has(mutation)) {
    test(`뮤테이션 ${mutation}은 주문 앱에서 도달 불가능함을 문서화한다(도달성은 견적에서 검증)`, () => {
      const input = mutationInput(mutation);
      const baseline = evaluateLegacyQuantityBoundary(input).quantities;
      const mutated = evaluateLegacyQuantityBoundary(input, { sourceMutator: (source: string) => mutationSource(source, mutation) }).quantities;
      expect(mutated).toEqual(baseline);
      expect(baseline).toEqual(orderGoldens['C-07']);
    });
  } else if (mutation && mutation !== 'drift-fixture-delete') {
    test(`뮤테이션 ${mutation}은 golden을 RED로 만든다`, () => {
      const input = mutationInput(mutation);
      const baselineInput = mutation === 'source-omit' ? inputFor(fixtures.find((fixture: any) => fixture.family === 'H-01')) : input;
      const baseline = evaluateLegacyQuantityBoundary(baselineInput).quantities;
      const mutated = evaluateLegacyQuantityBoundary(input, { sourceMutator: (source: string) => mutationSource(source, mutation) }).quantities;
      expect(mutated).toEqual(baseline);
    });
  }

  if (mutation === 'drift-fixture-delete') {
    test('드리프트 fixture 삭제를 RED로 감지한다', () => {
      const activeFixtures = fixtures.filter((fixture: any) => fixture.family !== 'H-07');
      expect(activeFixtures.map((fixture: any) => fixture.family)).toEqual(FAMILY_ORDER);
    });
  }
});
