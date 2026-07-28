import { describe, expect, test } from 'vitest';

declare function require(id: string): any;

const {
  runCommercialScenario,
  runSingleScenario,
  chooseGhpBase,
  hasGenericLockArchitecture,
} = require('./sol2QuantityFixHarness.cjs');
const { runCommSnapshotRoundtrip } = require('./commManualLockHarness.cjs');

describe('#967 SOL2 결함 1 — 상업 T형 분기관 0경계', () => {
  test('실외기 수량을 지우면 자동 분기관도 0으로 소거된다', () => {
    expect(runCommercialScenario('branch')).toEqual({
      valueAfterSourceClear: 0,
      lockedAfterSourceClear: false,
    });
  });
});

describe('#967 SOL2 결함 2 — 상업 리뉴얼 필터', () => {
  test('AF-R09A 손입력 77은 다음 실외기 재계산에서도 보존된다', () => {
    const result = runCommercialScenario('filter');
    expect(result.automatic).toBe(1);
    expect(result.afterManualRecompute).toBe(77);
    expect(result.lockedAfterManualRecompute).toBe(true);
  });

  test('리뉴얼 필터 자동값은 모든 원천을 지우면 stale 없이 0이 된다', () => {
    const result = runCommercialScenario('filterClear');
    expect(result.automatic).toBe(1);
    expect(result.afterAllSourcesClear).toBe(0);
  });
});

describe('#967 SOL2 결함 3 — 싱글 파생 3계열', () => {
  test.each([
    ['받침대', 'roundFoot'],
    ['유선보드', 'wiredBoard'],
    ['실링펌프', 'ceilingPump'],
  ])('%s 손입력 77은 원천 변경 후에도 보존되고 잠긴다', (_label, key) => {
    const result = runSingleScenario(key);
    expect(result.valueAfterSourceChange).toBe(77);
    expect(result.lockedAfterSourceChange).toBe(true);
  });
});

describe('#967 SOL2 결함 4 — 잠금 배열이 없는 구형 snapshot', () => {
  test('구형 상업 snapshot의 T형 분기관 손입력 77은 복원 직후에도 보존된다', () => {
    const result = runCommSnapshotRoundtrip({
      family: 'C-06',
      model: 'AXJ-TA3419M',
      lockValue: 77,
      legacyShot: true,
    });
    expect(result.valueAfterRestore).toBe(77);
    expect(result.lockedAfterRestore).toBe(true);
  });
});

describe('#967 SOL2 결함 5 — GHP 보조품 코드', () => {
  test('GHP 파생 target은 기준 카탈로그의 ACL-KORGHP07이다', () => {
    expect(chooseGhpBase()).toContain('ACL-KORGHP07');
  });
});

describe('#967 H-1 — 계열별 Set 열거가 아닌 공통 잠금 레지스트리', () => {
  test('홈·상업·싱글 입력과 snapshot이 공통 레지스트리를 사용한다', () => {
    expect(hasGenericLockArchitecture()).toEqual({
      genericRegistry: true,
      noHomeFamilyRegistry: true,
      noCommercialFamilyRegistry: true,
      singleInputHandler: true,
      genericSnapshot: true,
    });
  });
});
