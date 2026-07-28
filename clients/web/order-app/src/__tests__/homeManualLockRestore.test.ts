import { describe, expect, test } from 'vitest';

declare function require(id: string): any;

/*
 * #967 R1 라운드 게이트 2건(둘 다 이번 fix 가 만든 것) 재현 전용 RED-first 테스트.
 *
 * 결함 A [HIGH] — onHomeQtyInput(index.html:4864-4887)이 HOME_MANUAL_*.add()만 하고
 *   delete()가 없어 파생 수량 칸을 지워도(v=0) 잠금이 풀리지 않고, 이어지는 재계산이
 *   자동값으로 복귀하지 못한 채 0에 영구히 갇힌다.
 * 결함 B [HIGH] — takeSnapshot(index.html:8740-8773)이 HOME_MANUAL_* 을 직렬화하지 않고
 *   applySnapshot(index.html:9031-9097)이 clearHomeManualLocks() 로 잠금을 비운 뒤
 *   recomputeHomeDerived(true) 를 불러, 저장한 수동수량이 복원 시 자동값으로 덮인다.
 *
 * homeManualLockHarness.js가 정본 함수(onHomeQtyInput/recomputeHomeDerived/
 * takeSnapshot/applySnapshot/clearHomeManualLocks)를 index.html에서 그대로 추출해
 * 실행한다 — 재구현이 아니다. 홈 파생 5계열(판넬·호스·리모컨·분기관·발통) 전부를
 * 지난다.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runClearScenario, runSnapshotRoundtrip } = require('./homeManualLockHarness.cjs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { orderGoldens } = require('../../../legacy-quantity-golden/goldens');

// golden(사람이 손대지 않은 자동계산 결과)과 절대 겹치지 않는 값으로 "수동 입력"을 흉내낸다.
const LOCK_VALUE = 999;

// [라벨, family, model] — legacy-quantity-golden.test.ts의 "결함 2" 케이스(§213-228)와
// 동일한 (family, model) 매핑을 재사용한다(같은 5계열, 같은 golden 소스원).
const SERIES: Array<[string, string, string]> = [
  ['판넬', 'H-01', 'PC1NWSK3NW'],
  ['호스', 'H-01', 'FH-LFHLF'],
  ['리모컨', 'H-01', 'AR-EC05'],
  ['분기관', 'H-07', 'AXJ-YA1509N'],
  ['발통', 'H-08', '발통세트'],
];

function autoGolden(family: string, model: string): number {
  return (orderGoldens[family] || {})[model] || 0;
}

describe('#963 R1 결함 A — 홈 파생 5계열: 칸을 지우면 잠금 해제 + 자동값 복귀', () => {
  test.each(SERIES)('%s — 수동 입력 후 칸을 지우면 잠금이 풀리고 재계산이 자동값으로 복귀한다', (_label, family, model) => {
    const auto = autoGolden(family, model);
    const result = runClearScenario({ family, model, lockValue: LOCK_VALUE });

    // 잠금(add)은 이미 정상 동작한다 — 이 fix의 원래 목적
    expect(result.lockedAfterManualInput).toBe(true);
    expect(result.valueAfterManualInput).toBe(LOCK_VALUE);

    // 결함 A 본체: 칸을 지우면(v=0) HOME_MANUAL_* 잠금이 해제돼야 한다
    expect(result.lockedAfterClear).toBe(false);

    // 잠금 해제 후 재계산(다음 트리거)은 자동값으로 복귀해야 한다 — 0 영구잠김이 아니라
    expect(result.valueAfterRecompute).toBe(auto);
  });

  test('회귀 울타리(fix 목적) — 칸을 지우지 않고 유지한 수동값은 그대로 보존된다', () => {
    const result = runClearScenario({ family: 'H-01', model: 'PC1NWSK3NW', lockValue: LOCK_VALUE });
    expect(result.lockedAfterManualInput).toBe(true);
    expect(result.valueAfterManualInput).toBe(LOCK_VALUE);
  });
});

describe('#963 R1/R2 결함 B — 저장내역 복원 시 수동수량 보존(구형 snapshot 포함)', () => {
  test.each(SERIES)('%s — 신규 저장분은 잠금이 직렬화되고 복원 후에도 수동값이 보존된다', (_label, family, model) => {
    const result = runSnapshotRoundtrip({ family, model, lockValue: LOCK_VALUE, legacyShot: false });

    // 결함 B 본체 1: takeSnapshot()이 HOME_MANUAL_* 잠금을 직렬화해야 한다
    expect(result.anyLockSerialized).toBe(true);

    // 결함 B 본체 2: applySnapshot() 복원 후 수동값이 자동값으로 덮이지 않고 보존돼야 한다
    expect(result.lockedAfterRestore).toBe(true);
    expect(result.valueAfterRestore).toBe(LOCK_VALUE);
  });

  test.each(SERIES)('%s — 잠금 배열이 없는 구형 저장분도 수동 입력을 보존한다', (_label, family, model) => {
    const result = runSnapshotRoundtrip({ family, model, lockValue: LOCK_VALUE, legacyShot: true });

    // 기존(legacy) 스냅샷은 애초에 잠금 필드를 직렬화하지 않았다
    expect(result.anyLockSerialized).toBe(false);

    // H-2: 구형 snapshot은 당시 잠금 배열이 없었어도 snapshot의 사용자 수량을 보존한다.
    expect(result.lockedAfterRestore).toBe(true);
    expect(result.valueAfterRestore).toBe(LOCK_VALUE);
  });
});
