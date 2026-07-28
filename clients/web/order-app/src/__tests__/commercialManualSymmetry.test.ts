import { describe, expect, test } from 'vitest';

declare function require(id: string): any;

const {
  runExplicitZeroScenario,
  runOptionScenario,
  runVisualScenario,
  sourceGuardReport,
} = require('./commercialManualSymmetryHarness.cjs');

describe('#963 SOL 결함 ① — 실외기 변경은 상업 받침대 수동잠금을 보존한다', () => {
  test.each(['order', 'estimate'])('%s 자동 받침대 보정이 잠금 모델을 건드리지 않는다', (app) => {
    const result = sourceGuardReport(app);
    expect(result.outdoorClear).toBe(false);
    expect(result.accessoryChecksManualBase).toBe(true);
  });
});

describe('#963 SOL 결함 ② — 상업멀티 명시적 0은 칸 지움과 다르다', () => {
  test('주문 상업 수량 잠금은 명시적 0을 보존하고 빈칸만 해제한다', () => {
    expect(runExplicitZeroScenario()).toEqual({
      lockedAfterExplicitZero: true,
      lockedAfterClear: false,
    });
  });
});

describe('#963 SOL 결함 ③ — 상업 옵션은 지배 계열 잠금만 해제한다', () => {
  const expected = {
    comm_panel: { panel: false, hose: true, remote: true, pump: true, base: true },
    comm_p360: { panel: false, hose: true, remote: true, pump: true, base: true },
    comm_ex_hose: { panel: true, hose: false, remote: true, pump: true, base: true },
    comm_remote: { panel: true, hose: true, remote: false, pump: true, base: true },
    comm_ex_base: { panel: true, hose: true, remote: true, pump: true, base: false },
  };

  test.each(Object.entries(expected))('%s는 무관 계열 잠금을 보존한다', (controlId, locks) => {
    const result = runOptionScenario(controlId);
    expect(result).toMatchObject({ ...locks, recomputeCount: 1 });
  });
});

describe('#963 SOL 결함 ④ — 상업 5계열 수동잠금은 표시 가능한 상태다', () => {
  test('판넬·호스·리모컨·펌프·받침대 잠금을 모두 감지한다', () => {
    expect(runVisualScenario()).toEqual([
      { label: 'panel', manual: true },
      { label: 'hose', manual: true },
      { label: 'remote', manual: true },
      { label: 'pump', manual: true },
      { label: 'base', manual: true },
    ]);
  });
});
