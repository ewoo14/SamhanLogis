'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { evaluateQuantitySyncRules } = require('../public/quantitySync');

describe('종합견적서 HOME_MULTI 서버 규칙 수량 동기화', () => {
  test('실내기 1대가 서버 규칙의 판넬·리모컨·유연호스 target 수량을 만든다', () => {
    const rules = [{
      ruleKey: 'HOME_MULTI_INDOOR_ACCESSORIES',
      estimateCategory: 'HOME_MULTI',
      enabled: true,
      aggregation: 'SUM',
      inactiveBehavior: 'ZERO',
      sources: [{ productCode: 'INDOOR-01', factor: 1 }],
      targets: [
        { productCode: 'PANEL-01', multiplier: 1, roundingMode: 'NONE', displayOrder: 1 },
        { productCode: 'REMOTE-01', multiplier: 1, roundingMode: 'NONE', displayOrder: 2 },
        { productCode: 'HOSE-01', multiplier: 1, roundingMode: 'NONE', displayOrder: 3 },
      ],
    }];
    const catalog = [
      { model: 'INDOOR-01' },
      { model: 'PANEL-01' },
      { model: 'REMOTE-01' },
      { model: 'HOSE-01' },
    ];

    expect(evaluateQuantitySyncRules(rules, catalog, new Map([['INDOOR-01', 1]]))).toEqual(
      new Map([
        ['PANEL-01', 1],
        ['REMOTE-01', 1],
        ['HOSE-01', 1],
      ]),
    );
  });

  test('규칙 조회 실패 또는 규칙 오류는 fallback이 사용할 수 있도록 null을 반환한다', () => {
    expect(evaluateQuantitySyncRules(null, [], new Map())).toBeNull();
    expect(evaluateQuantitySyncRules([{ enabled: false }], [], new Map())).toBeNull();
  });

  test('recomputeHomeDerived는 서버 규칙 경계를 먼저 통과하고 legacy fallback을 별도 함수로 둔다', () => {
    const source = fs.readFileSync(path.join(__dirname, '../views/index.ejs'), 'utf8');
    expect(source).toContain('applyServerHomeQuantitySync_');
    expect(source).toContain('서버 규칙을 읽지 못한 구버전/장애 fallback');
    expect(source).toContain('typeof applyServerHomeQuantitySync_ === \'function\'');
  });
});
