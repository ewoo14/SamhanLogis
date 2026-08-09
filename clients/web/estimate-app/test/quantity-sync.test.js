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

  test('서버 target 리모컨 계약 판정은 카탈로그 분류를 따르고 모델 목록을 하드코딩하지 않는다', () => {
    const source = fs.readFileSync(path.join(__dirname, '../views/index.ejs'), 'utf8');
    expect(source).toContain("function isHomeRemoteContractRow(row){");
    expect(source).toContain("return isRemoteRow(row) || String(row?.catM || '').trim() === '리모컨';");
    expect(source).not.toContain('/^(AWR-WE13N|AWR-WG00N|AR-CH01)$/i.test(String(row?.model || \'\'))');
  });

  test('기본 옵션은 서버가 선언한 리모컨 target을 복원하지 않고 legacy 매핑을 최종 계약으로 쓴다', () => {
    const source = fs.readFileSync(path.join(__dirname, '../views/index.ejs'), 'utf8');
    expect(source).not.toContain('configuredByModel.forEach((quantity, model) => {');
    expect(source).toContain("if (remoteOption === '기본') {");
  });

  test('서버 규칙 적용 후에도 legacy 네 파생계산을 실행하고 target 소유 모델만 덮어쓴다', () => {
    const source = fs.readFileSync(path.join(__dirname, '../views/index.ejs'), 'utf8');
    const derived = source.slice(source.indexOf('function recomputeHomeDerived('));
    const apply = source.slice(source.indexOf('function applyServerHomeQuantitySync_()'), source.indexOf('/* 홈파생계산 */'));

    expect(apply).toContain('return new Set(');
    expect(derived).toContain('const serverOwnedTargets = typeof applyServerHomeQuantitySync_ === \'function\'');
    expect(derived).not.toMatch(/applyServerHomeQuantitySync_\(\)\)\s*\{[\s\S]*?\breturn\s*;/);
    expect(derived.indexOf('recomputeHomeBranches();')).toBeGreaterThan(-1);
    expect(derived.indexOf('recomputeHomeRemotes();')).toBeGreaterThan(derived.indexOf('recomputeHomeBranches();'));
    expect(derived.indexOf('recomputeFootAll();')).toBeGreaterThan(derived.indexOf('recomputeHomeRemotes();'));
    expect(derived.indexOf('recomputeHomePanels();')).toBeGreaterThan(derived.indexOf('recomputeFootAll();'));
  });
});
