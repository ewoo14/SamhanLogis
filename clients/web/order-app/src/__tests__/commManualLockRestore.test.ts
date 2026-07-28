import { describe, expect, test } from 'vitest';

declare function require(id: string): any;

/*
 * #967 R2 결함 G-1[HIGH]/G-2[HIGH] 재현 전용 RED-first 테스트.
 *
 * G-1 — takeSnapshot(index.html:8749-8787)이 COMM_MANUAL_PANEL/HOSE/REMOTE/PUMP/BASE
 *   (:2272-2276)를 직렬화하지 않고, applySnapshot(:9045-9120)의 recomputeCommDerived()가
 *   복원 직후 저장된 수동수량을 자동값으로 덮는다 — 홈멀티 R1 결함 B 와 문자 그대로 동일한
 *   패턴이 상업멀티에 이식되지 않았다(D-2 대칭 위반).
 * G-2 — bindCommQtyEvents(:2894-2960)의 인라인 잠금 로직이 값과 무관하게 add(model)만 하고
 *   delete가 없어 칸을 지워도(q=0) 잠금이 풀리지 않는다. btnResetComm(:6312)에는
 *   clearHomeManualLocks() 같은 잠금 해제 호출이 한 줄도 없어 회복 수단이 새로고침뿐이다.
 *
 * fix — applyCommManualLock(rec, model, q)(신규, q truthy 면 add·falsy 면 delete로 대칭)와
 *   clearCommManualLocks()(신규, clearHomeManualLocks 의 comm 대칭)를 추출해 정본을 그대로
 *   실행한다 — 재구현이 아니다. commManualLockHarness.cjs 가 그 harness다.
 *
 * legacyQuantityBoundary.js·fixtures.js·goldens.js·legacy-quantity-golden.test.{js,ts}
 * (공유 golden 하네스)와 homeManualLockHarness.cjs(R1)는 이 테스트가 건드리지 않는다.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runCommClearScenario, runCommResetScenario, runCommSnapshotRoundtrip } = require('./commManualLockHarness.cjs');

// golden(사람이 손대지 않은 자동계산 결과)과 절대 겹치지 않는 값으로 "수동 입력"을 흉내낸다.
const LOCK_VALUE = 11;

// [라벨, family, model] — legacy-quantity-golden.test.ts C-01 fixture(§goldens.js 'C-01')와
// 동일한 family 를 재사용한다. 판넬/호스/펌프/받침대(base)는 C-01 golden target
// (PC1MWSK3NW/FH-LFHLF/MDP-Z075SZED/ADP-G075SPK1D)을 그대로 쓴다. 리모컨만 C-01의
// golden target(AR-EH05)을 쓰지 않고 AWR-WE13N(유선리모컨)으로 바꿨다 — AR-EH05 는
// computeCommRemoteModelForIndoor_() 가 고르는 자동 target 모델일 뿐 rec.name 에
// "리모컨" 문자열이 없어(name="AR-EH05 무선 냉난방") isCommRemoteRow() 로는 "리모컨
// 행"으로 분류되지 않는다 — 이 결함군(G-1/G-2) 이 잠그는 것은 isCommRemoteRow 기준의
// "리모컨 행"이므로 그 분류를 실제로 통과하는 모델을 써야 한다(정본 분류기 그대로 사용,
// 재구현 아님).
const SERIES: Array<[string, string, string]> = [
  ['판넬', 'C-01', 'PC1MWSK3NW'],
  ['호스', 'C-01', 'FH-LFHLF'],
  ['리모컨', 'C-01', 'AWR-WE13N'],
  ['펌프', 'C-01', 'MDP-Z075SZED'],
  ['받침대', 'C-01', 'ADP-G075SPK1D'],
  ['분기관', 'C-06', 'AXJ-TA3419M'],
];

describe('#967 G-2 — 상업 파생 6계열: applyCommManualLock 이 add/delete 를 대칭으로 처리한다', () => {
  test.each(SERIES)('%s — 수동 입력 후 칸을 지우면 잠금이 풀리고 재계산이 자동값으로 복귀한다', (_label, family, model) => {
    const result = runCommClearScenario({ family, model, lockValue: LOCK_VALUE });

    // 잠금(add)은 원래도 정상 동작한다
    expect(result.lockedAfterManualInput).toBe(true);
    expect(result.valueAfterManualInput).toBe(LOCK_VALUE);

    // G-2 본체: 칸을 지우면(q=0) COMM_MANUAL_* 잠금이 해제돼야 한다
    expect(result.lockedAfterClear).toBe(false);
  });

  test.each(SERIES)('%s — 상업멀티 초기화(clearCommManualLocks)는 6계열 잠금을 모두 비운다', (_label, family, model) => {
    const result = runCommResetScenario({ family, model, lockValue: LOCK_VALUE });

    expect(result.lockedBeforeReset).toBe(true);
    // G-2 본체(초기화 무효): btnResetComm 경로가 부르는 clearCommManualLocks() 는
    // 값과 무관하게 잠금을 비워야 한다 — 회복 수단이 새로고침뿐이면 안 된다.
    expect(result.lockedAfterReset).toBe(false);
  });
});

describe('#967 G-1 — 상업 저장내역 복원 시 수동수량 보존(D-3 comm 대칭: 기존 저장분은 동작 불변)', () => {
  test.each(SERIES)('%s — 신규 저장분은 잠금이 직렬화되고 복원 후에도 수동값이 보존된다', (_label, family, model) => {
    const result = runCommSnapshotRoundtrip({ family, model, lockValue: LOCK_VALUE, legacyShot: false });

    // G-1 본체 1: takeSnapshot()이 COMM_MANUAL_* 잠금을 직렬화해야 한다
    expect(result.anyLockSerialized).toBe(true);

    // G-1 본체 2: applySnapshot() 복원 후 수동값이 자동값으로 덮이지 않고 보존돼야 한다
    expect(result.lockedAfterRestore).toBe(true);
    expect(result.valueAfterRestore).toBe(LOCK_VALUE);
  });

  test.each(SERIES)('%s — D-3 comm 대칭: 잠금 필드가 없는 기존 저장분의 복원 결과는 이 fix로 바뀌지 않는다', (_label, family, model) => {
    const result = runCommSnapshotRoundtrip({ family, model, lockValue: LOCK_VALUE, legacyShot: true });

    // 기존(legacy) 스냅샷은 애초에 comm 잠금 필드를 직렬화하지 않았다
    expect(result.anyLockSerialized).toBe(false);

    // 잠금 없이 복원 → recomputeCommDerived()가 자동값으로 덮는다 — fix 이전과 동일 동작.
    // (락이 없으므로 "자동값"은 fixture 별로 다를 수 있어 개별 값 대신 "잠금 상태 false"만 단정한다.
    //  자동값 자체의 정확성은 legacy-quantity-golden.test.ts 의 C-01 golden 73/73 이 이미 검사한다.)
    expect(result.lockedAfterRestore).toBe(false);
  });
});
