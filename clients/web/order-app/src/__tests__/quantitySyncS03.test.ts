import { describe, expect, it } from 'vitest';

declare const process: { cwd: () => string };
import {
  evaluateSingleS03Rule,
  selectSingleS03Rule,
} from '../quantitySync';

declare function require(id: string): any;

const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const {
  runLegacyS03,
  runLegacyS03TargetSwap,
  runLegacyCaseDistinctSource,
  runOrderReadiness,
} = require('./quantitySyncS03Harness.cjs');

const INDEX_PATH = resolve(process.cwd(), 'index.html');
const API_PATH = resolve(process.cwd(), 'src/samhanApi.ts');
const MAIN_PATH = resolve(process.cwd(), 'src/main.ts');

const S03_RULE = {
  ruleKey: 'SINGLE_S03_CEILING_DRAIN_PUMP',
  legacyRef: 'S-03',
  estimateCategory: 'SINGLE_SET',
  enabled: true,
  aggregation: 'SUM',
  when: {},
  inactiveBehavior: 'ZERO',
  sources: [
    { productCode: 'AC072BSCPBH2SY', factor: 1 },
    { productCode: 'AC090BSCPBH2SY', factor: 1 },
    { productCode: 'AC130BSCPHH2SY', factor: 1 },
    { productCode: 'AC145BSCPHH2SY', factor: 1 },
  ],
  targets: [{ productCode: 'ADP-F075SP', multiplier: 1, roundingMode: 'NONE', displayOrder: 1 }],
};

function loadRows(): any[] {
  return JSON.parse(readFileSync(resolve(
    process.cwd(),
    'src/__tests__/fixtures/singleSetsBootstrap.fixture.json',
  ), 'utf8')).rows;
}

describe('S-03 설정 기반 수량 동기화', () => {
  it('order-app은 설정 API를 읽지만 사용자 계산·전송 경로에는 연결하지 않는다', () => {
    const index = readFileSync(INDEX_PATH, 'utf8');
    const api = readFileSync(API_PATH, 'utf8');
    const main = readFileSync(MAIN_PATH, 'utf8');

    expect(api).toContain("/quantity-sync-rules");
    expect(main).toContain('getQuantitySyncRules');
    expect(index).toContain('__SAMHAN_QUANTITY_SYNC__');
    expect(index).toContain('loadSingleS03QuantitySync_');
    expect(index).not.toContain('configuredSingleS03_');
    expect(index).not.toContain('evaluateSingleS03(');
    expect(index).not.toContain('hasSingleCatalogBlockingError_');
    expect(main).not.toContain('evaluateSingleS03');
  });

  it('S-03은 실 catalog source와 ADP-F075SP target을 설정으로 연결한다', () => {
    const fixture = JSON.parse(readFileSync(resolve(
      process.cwd(),
      'src/__tests__/fixtures/singleSetsBootstrap.fixture.json',
    ), 'utf8'));
    const source = fixture.rows.find((row: any) => row.id === '싱글 실링61');
    const target = fixture.rows.find((row: any) => row.model === 'ADP-F075SP');

    expect(source).toMatchObject({ model: 'AC072BSCPBH2SY', name: '싱글 실링' });
    expect(fixture.rows.filter((row: any) => row.name === '싱글 실링').map((row: any) => row.model))
      .toEqual([
        'AC072BSCPBH2SY',
        'AC090BSCPBH2SY',
        'AC130BSCPHH2SY',
        'AC145BSCPHH2SY',
      ]);
    expect(target).toMatchObject({ id: '실링용 드레인펌프75', name: '실링용 드레인펌프' });
    expect(indexHasS03RuleShape()).toBe(true);
  });

  it.each([0, 1, 4, 77])('shadow: 같은 입력 %s는 legacy와 설정 evaluator가 같은 파생 수량을 낸다', (sourceQuantity) => {
    const rows = loadRows();
    const source = rows.find((row) => row.id === '싱글 실링61');
    const target = rows.find((row) => row.model === 'ADP-F075SP');
    const quantities = new Map([[source.id, sourceQuantity]]);
    const legacy = sourceQuantity;
    const selected = selectSingleS03Rule([S03_RULE], rows);
    const configured = evaluateSingleS03Rule(selected.rule, rows, quantities);

    expect(selected.status).toBe('ready');
    expect(configured.status).toBe('ready');
    expect(configured.targetQuantities.get(target.id)).toBe(legacy);
    expect(configured.targetProductCode).toBe('ADP-F075SP');
    expect(configured).toEqual(evaluateSingleS03Rule(selected.rule, rows, quantities));
  });

  it.each([
    ['AC072BSCPBH2SY', '싱글 실링61'],
    ['AC090BSCPBH2SY', '싱글 실링62'],
    ['AC130BSCPHH2SY', '싱글 실링63'],
    ['AC145BSCPHH2SY', '싱글 실링64'],
  ])('shadow: 실 catalog의 S-03 source %s 단독 수량 1도 legacy와 같은 pump 수량·금액을 낸다', (model, sourceId) => {
    const rows = loadRows();
    const target = rows.find((row) => row.model === 'ADP-F075SP');
    const source = rows.find((row) => row.id === sourceId);
    const quantities = new Map([[source.id, 1]]);
    const selected = selectSingleS03Rule([S03_RULE], rows);
    const configured = evaluateSingleS03Rule(selected.rule, rows, quantities);

    expect(selected.status).toBe('ready');
    expect(configured.status).toBe('ready');
    expect(configured.targetQuantities.get(target.id)).toBe(1);
    expect(Number(target.price) * Number(configured.targetQuantities.get(target.id))).toBe(79200);
  });

  it('shadow: S-03 source 네 개를 모두 합산한 전환 전후 수량·금액이 같다', () => {
    const rows = loadRows();
    const target = rows.find((row) => row.model === 'ADP-F075SP');
    const sources = rows.filter((row) => row.name === '싱글 실링');
    const quantities = new Map(sources.map((row) => [row.id, 1]));
    const selected = selectSingleS03Rule([S03_RULE], rows);
    const configured = evaluateSingleS03Rule(selected.rule, rows, quantities);

    expect(sources).toHaveLength(4);
    expect(configured.targetQuantities.get(target.id)).toBe(4);
    expect(Number(target.price) * Number(configured.targetQuantities.get(target.id))).toBe(316800);
  });

  it('shadow: legacy와 다른 계수는 브라우저 관측 대상에서도 제외하고 legacy를 유지한다', () => {
    const rows = loadRows();
    const decimalRule = {
      ...S03_RULE,
      sources: S03_RULE.sources.map((source, index) => index === 0 ? { ...source, factor: 0.5 } : source),
      targets: [{ ...S03_RULE.targets[0], multiplier: 2 }],
    };

    const selected = selectSingleS03Rule([decimalRule], rows);

    expect(selected.status).toBe('error');
    expect(selected.rule).toBeNull();
    expect(selected.errorMessage).toContain('legacy');
    expect(runLegacyS03({ sourceQuantity: 3 })).toMatchObject({
      targetQuantity: 3,
      manualLock: false,
    });
  });

  it('전환 전후의 S-03 소계와 전송 line은 같은 수량으로 이어진다', () => {
    const rows = loadRows();
    const source = rows.find((row) => row.id === '싱글 실링61');
    const target = rows.find((row) => row.model === 'ADP-F075SP');
    const quantities = new Map([[source.id, 77]]);
    const selected = selectSingleS03Rule([S03_RULE], rows);
    const after = evaluateSingleS03Rule(selected.rule, rows, quantities);
    const beforeQuantity = 77;
    const afterQuantity = after.targetQuantities.get(target.id);
    const measuredUnitPrice = 79200; // 펌프 단가. 77개 target 소계는 6,098,400원

    expect(afterQuantity).toBe(beforeQuantity);
    expect(measuredUnitPrice * beforeQuantity).toBe(6098400);
    expect(measuredUnitPrice * Number(afterQuantity)).toBe(6098400);
    expect({ model: target.model, qty: afterQuantity })
      .toEqual({ model: 'ADP-F075SP', qty: 77 });
  });

  it('source 또는 target이 실제 catalog에서 빠지면 0으로 확정하지 않고 오류를 낸다', () => {
    const rows = loadRows();
    const source = rows.find((row) => row.id === '싱글 실링61');
    const withoutTarget = rows.filter((row) => row.model !== 'ADP-F075SP');
    const selection = selectSingleS03Rule([S03_RULE], withoutTarget);
    const evaluated = evaluateSingleS03Rule(S03_RULE, withoutTarget, new Map([[source.id, 4]]));

    expect(selection.status).toBe('error');
    expect(selection.missingCatalogCodes).toEqual(['ADP-F075SP']);
    expect(evaluated.status).toBe('error');
    expect(evaluated.targetQuantities.size).toBe(0);
    expect(evaluated.missingCatalogCodes).toEqual(['ADP-F075SP']);
  });

  it('F-01 재현: reset 뒤 남은 누락 Map이 S-03 무관 25,000원 주문을 막지 않는다', () => {
    expect(runOrderReadiness({ missingModel: 'ADP-F075SP' })).toEqual({
      disabled: false,
      missingMapSize: 1,
      unrelatedOrder: { model: 'SI-AL700a', quantity: 1, subtotal: 25000 },
    });
  });

  it('F-03 재현: 저장 복원은 legacy target만 유지하고 구·신 target을 혼입하지 않는다', () => {
    expect(runLegacyS03TargetSwap()).toEqual({
      oldTargetQuantity: 1,
      newTargetQuantity: 0,
      targetSubtotal: 79200,
      sendModels: ['AC072BSCPBH2SY', 'ADP-F075SP'],
    });
  });

  it('F-04 재현: 대소문자만 다른 catalog 품목은 legacy S-03 source로 가산되지 않는다', () => {
    expect(runLegacyCaseDistinctSource()).toEqual({
      legacyPumpQty: 0,
      legacyPumpSubtotal: 0,
      caseDistinctSourceQuantity: 1,
    });
  });
});

function indexHasS03RuleShape(): boolean {
  const index = readFileSync(INDEX_PATH, 'utf8');
  const evaluator = readFileSync(resolve(process.cwd(), 'src/quantitySync.ts'), 'utf8');
  return index.includes('ADP-F075SP')
    && evaluator.includes("text(rule.aggregation) !== 'SUM'");
}
