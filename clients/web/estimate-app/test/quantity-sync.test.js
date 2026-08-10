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
    const apply = source.slice(source.indexOf('function applyServerHomeQuantitySync_()'), source.indexOf('/* 홈파생계산 */'));
    expect(source).not.toContain('configuredByModel.forEach((quantity, model) => {');
    expect(apply).not.toContain('recomputeHomeRemotes();');
  });

  test('서버 규칙 적용 후에도 legacy 네 파생계산을 실행하고 target 소유 모델만 덮어쓴다', () => {
    const source = fs.readFileSync(path.join(__dirname, '../views/index.ejs'), 'utf8');
    const derived = source.slice(source.indexOf('function recomputeHomeDerived('));
    const apply = source.slice(source.indexOf('function applyServerHomeQuantitySync_()'), source.indexOf('/* 홈파생계산 */'));

    expect(apply).toContain('return new Set(');
    expect(derived).toContain('const serverOwnedTargets = typeof applyServerHomeQuantitySync_ === \'function\'');
    expect(derived).not.toMatch(/applyServerHomeQuantitySync_\(\)\)\s*\{[\s\S]*?\breturn\s*;/);
    expect(derived.indexOf('recomputeHomeHoses_();')).toBeGreaterThan(-1);
    expect(derived.indexOf('recomputeHomeBranches();')).toBeGreaterThan(derived.indexOf('recomputeHomeHoses_();'));
    expect(derived.indexOf('recomputeFootAll();')).toBeGreaterThan(derived.indexOf('recomputeHomeBranches();'));
    expect(derived.indexOf('recomputeHomePanels();')).toBeGreaterThan(derived.indexOf('recomputeFootAll();'));
    expect(derived.indexOf('recomputeHomeRemotes();')).toBeGreaterThan(-1);
    expect(derived.indexOf('recomputeHomeRemotes();')).toBeLessThan(derived.indexOf('const serverOwnedTargets ='));
  });

  test('R19 UI 분모는 실제 select·checkbox 선언값을 사용한다', () => {
    const source = fs.readFileSync(path.join(__dirname, '../views/index.ejs'), 'utf8');
    expect(source).toContain("sel('리모컨',['기본','유선','컬러','제외'],defRemote,'home_remote')");
    expect(source).toContain("sel('판넬변경',['','판넬제외','공청판넬','인피니트 25년형','인피니트 공청+동작감지 AI'],HOME_DEFAULTS['판넬변경']||'','home_panel')");
    expect(source).toContain("'home_hose_i'");
    expect(source).toContain("'home_no_hose'");
    expect(source).toContain("'home_no_branch'");
    expect(source).toContain("'home_foot'");
  });

  test('규칙 적용 뒤 target별 규칙·legacy 결과와 옵션 계약을 재수렴한다', () => {
    const source = fs.readFileSync(path.join(__dirname, '../views/index.ejs'), 'utf8');
    const derived = source.slice(source.indexOf('function recomputeHomeDerived('));
    const apply = source.slice(source.indexOf('function applyServerHomeQuantitySync_()'), source.indexOf('/* 홈파생계산 */'));
    const serverApply = derived.indexOf('const serverOwnedTargets =');
    const optionReconciliation = derived.slice(serverApply);

    expect(apply).not.toContain('recomputeHomeRemotes();');
    expect(optionReconciliation).toContain('reconcileHomeFamily');
    expect(optionReconciliation).toContain('HOME_MANUAL_HOSE');
    expect(optionReconciliation).toContain("!!el('#home_no_hose')?.checked || !!el('#home_hose_i')?.checked");
    expect(optionReconciliation).toContain("(el('#home_panel')?.value || '') !== ''");
    expect(optionReconciliation).toContain("(el('#home_remote')?.value || '기본') !== '기본'");
    expect(optionReconciliation).toContain('HOME_MANUAL_REMOTE');
    expect(optionReconciliation).toContain('recomputeHomeRemotes,');
    expect(optionReconciliation).toContain('legacyHomeQuantitiesWithoutRuleSources');
    expect(optionReconciliation).toContain('recomputeHomePanels,');
    expect(source).toContain('const FOOT_FLAT_MODELS=HOMEMULTI');
  });

  test('유연호스 I형 옵션은 4WAY target도 I형으로 전환한다', () => {
    const source = fs.readFileSync(path.join(__dirname, '../views/index.ejs'), 'utf8');
    const hose = source.slice(source.indexOf('function recomputeHomeHoses_()'), source.indexOf('/* 서버 규칙 기반 홈멀티'));
    expect(hose).toContain('const hoseI4Model = hasServerHomeRules ? (HOSE_I_4W || HOSE_I_1W) : \'\';');
    expect(hose).toContain('if(hoseI4Model) setH(hoseI4Model, n4w');
    expect(hose).toContain("if(HOSE_4W) setH(HOSE_4W, 0);");
  });
});
