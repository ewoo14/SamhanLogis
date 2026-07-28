import { describe, expect, test } from 'vitest';

declare function require(id: string): any;

const { runCommOptionsRerenderScenario } = require('./legacyPreexistingFixHarness.cjs');
const { runCommBranchRecomputeScenario } = require('./commManualLockHarness.cjs');

describe('#967 선재 결함 ① — 상업멀티 옵션은 재렌더 후에도 사용자 선택을 보존한다', () => {
  test('검색·필터·저장복원 경로의 옵션 재렌더가 5개 선택값을 기본값으로 덮어쓰지 않는다', () => {
    expect(runCommOptionsRerenderScenario()).toEqual({
      panel: '블랙판넬',
      p360: '사각',
      remote: '컬러유선',
      exHose: true,
      exBase: true,
    });
  });
});

describe('#967 선재 결함 ② — 상업 T형 분기관 수동 수량은 재계산 후에도 보존된다', () => {
  test('AXJ-TA3419M 수동 입력값이 재계산으로 자동값에 덮이지 않고 잠금 표시 상태를 유지한다', () => {
    expect(runCommBranchRecomputeScenario({
      family: 'C-06',
      model: 'AXJ-TA3419M',
      lockValue: 77,
    })).toEqual({
      valueAfterRecompute: 77,
      lockedAfterRecompute: true,
    });
  });
});
