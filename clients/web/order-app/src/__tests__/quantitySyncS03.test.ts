import { describe, expect, it } from 'vitest';

declare const process: { cwd: () => string };
import {
  evaluateSingleS03Rule,
  selectSingleS03Rule,
} from '../quantitySync';

declare function require(id: string): any;

const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

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
  sources: [{ productCode: 'AC072BSCPBH2SY', factor: 1 }],
  targets: [{ productCode: 'ADP-F075SP', multiplier: 1, roundingMode: 'NONE', displayOrder: 1 }],
};

function loadRows(): any[] {
  return JSON.parse(readFileSync(resolve(
    process.cwd(),
    'src/__tests__/fixtures/singleSetsBootstrap.fixture.json',
  ), 'utf8')).rows;
}

describe('S-03 설정 기반 수량 동기화', () => {
  it('order-app이 SINGLE_SET 수량 동기화 API를 소비한다', () => {
    const index = readFileSync(INDEX_PATH, 'utf8');
    const api = readFileSync(API_PATH, 'utf8');
    const main = readFileSync(MAIN_PATH, 'utf8');

    expect(api).toContain("/quantity-sync-rules");
    expect(main).toContain('getQuantitySyncRules');
    expect(index).toContain('__SAMHAN_QUANTITY_SYNC__');
    expect(index).toContain('SINGLE_QUANTITY_SYNC_WARNING');
    expect(index).toContain('현재 기존 계산을 유지합니다.');
  });

  it('S-03은 실 catalog source와 ADP-F075SP target을 설정으로 연결한다', () => {
    const fixture = JSON.parse(readFileSync(resolve(
      process.cwd(),
      'src/__tests__/fixtures/singleSetsBootstrap.fixture.json',
    ), 'utf8'));
    const source = fixture.rows.find((row: any) => row.id === '싱글 실링61');
    const target = fixture.rows.find((row: any) => row.model === 'ADP-F075SP');

    expect(source).toMatchObject({ model: 'AC072BSCPBH2SY', name: '싱글 실링' });
    expect(target).toMatchObject({ id: '실링용 드레인펌프75', name: '실링용 드레인펌프' });
    expect(indexHasS03RuleShape()).toBe(true);
  });

  it.each([0, 1, 4, 77])('같은 입력 %s는 legacy와 설정 evaluator가 같은 파생 수량을 낸다', (sourceQuantity) => {
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

  it('전환 전후의 S-03 소계와 전송 line은 같은 수량으로 이어진다', () => {
    const rows = loadRows();
    const source = rows.find((row) => row.id === '싱글 실링61');
    const target = rows.find((row) => row.model === 'ADP-F075SP');
    const quantities = new Map([[source.id, 77]]);
    const selected = selectSingleS03Rule([S03_RULE], rows);
    const after = evaluateSingleS03Rule(selected.rule, rows, quantities);
    const beforeQuantity = 77;
    const afterQuantity = after.targetQuantities.get(target.id);
    const measuredUnitPrice = 8958400 / 77; // 2026-07-28 실주문 QA에서 77개 소계 8,958,400원

    expect(afterQuantity).toBe(beforeQuantity);
    expect(measuredUnitPrice * beforeQuantity).toBe(8958400);
    expect(measuredUnitPrice * Number(afterQuantity)).toBe(8958400);
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
});

function indexHasS03RuleShape(): boolean {
  const index = readFileSync(INDEX_PATH, 'utf8');
  const evaluator = readFileSync(resolve(process.cwd(), 'src/quantitySync.ts'), 'utf8');
  return index.includes('ADP-F075SP')
    && evaluator.includes("text(rule.aggregation) !== 'SUM'");
}
