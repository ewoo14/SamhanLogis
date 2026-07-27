'use strict';

const { evaluateLegacyQuantityBoundary } = require('../../legacy-quantity-golden/legacyQuantityBoundary');
const { fixtures, optionFixtures } = require('../../legacy-quantity-golden/fixtures');
const { estimateGoldens, estimateOptionGoldens } = require('../../legacy-quantity-golden/goldens');

const FAMILY_ORDER = ['H-01', 'H-02', 'H-03', 'H-04', 'H-05', 'H-06', 'H-07', 'H-08', 'S-01', 'S-02', 'S-03', 'C-01', 'C-02', 'C-03', 'C-04', 'C-05', 'C-06', 'C-07', 'C-08', 'C-09'];

function inputFor(fixture) {
  return {
    ...fixture,
    app: 'estimate',
    targets: { ...fixture.targets, remote360Default: 'AR-EC05' },
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
    case 'add-to-replace':
      return replaceOnce(source, 'want.set(pm, (want.get(pm) || 0) + q);', 'want.set(pm, q);');
    case 'inactive-keep':
      return replaceOnce(source, 'if (isPanelRow(r) && !HOME_MANUAL_PANEL.has(r.model)) homeQty.set(r.model, 0);', 'if (false && isPanelRow(r) && !HOME_MANUAL_PANEL.has(r.model)) homeQty.set(r.model, 0);');
    case 'option-invert':
      return replaceOnce(source, "if (opt === '공청판넬')", "if (opt !== '공청판넬')");
    case 'manual-lock-ignore':
      return replaceOnce(source, 'if (isPanelRow(r) && !HOME_MANUAL_PANEL.has(r.model)) homeQty.set(r.model, 0);', 'if (isPanelRow(r)) homeQty.set(r.model, 0);');
    default:
      return source;
  }
}

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
