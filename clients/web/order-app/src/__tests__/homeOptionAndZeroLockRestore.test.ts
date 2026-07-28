import { describe, expect, test } from 'vitest';

declare function require(id: string): any;

/*
 * #967 R2 결함 G-3[MED·회귀]/G-5[MED]/G-6[LOW-MED] 재현 전용 RED-first 테스트.
 * homeOptionAndZeroLockHarness.cjs 가 정본 함수(onHomeOptionChange 신규·
 * onHomeQtyInput 3-인자 확장·홈 재계산 함수)를 index.html 에서 그대로 추출해 실행한다.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runHomeOptionChangeScenario, runPanelSwapScenario, runExplicitZeroScenario } = require('./homeOptionAndZeroLockHarness.cjs');

const LOCK_VALUE = 9;

describe('#967 G-3 — 계열 단위 "제외" 옵션은 개별 잠금을 막지 않는다(U-1)', () => {
  test('판넬제외 — 판넬 수동잠금 후 옵션을 판넬제외로 바꾸면 0이 되고 잠금이 풀린다', () => {
    const r = runHomeOptionChangeScenario({
      family: 'H-01', model: 'PC1NWSK3NW', lockValue: LOCK_VALUE,
      controlId: 'home_panel', dom: { '#home_panel': '판넬제외' },
    });
    expect(r.lockedBeforeOptionChange).toBe(true);
    expect(r.valueBeforeOptionChange).toBe(LOCK_VALUE);
    expect(r.valueAfterOptionChange).toBe(0);
    expect(r.lockedAfterOptionChange).toBe(false);
  });

  test('유연호스 제외 — 호스 수동잠금 후 체크하면 0이 되고 잠금이 풀린다', () => {
    const r = runHomeOptionChangeScenario({
      family: 'H-01', model: 'FH-LFHLF', lockValue: LOCK_VALUE,
      controlId: 'home_no_hose', dom: { '#home_no_hose': { checked: true } },
    });
    expect(r.lockedBeforeOptionChange).toBe(true);
    expect(r.valueAfterOptionChange).toBe(0);
    expect(r.lockedAfterOptionChange).toBe(false);
  });

  test('리모컨 제외 — 리모컨 수동잠금 후 옵션을 제외로 바꾸면 0이 되고 잠금이 풀린다', () => {
    const r = runHomeOptionChangeScenario({
      family: 'H-01', model: 'AR-EC05', lockValue: LOCK_VALUE,
      controlId: 'home_remote', dom: { '#home_remote': '제외' },
    });
    expect(r.lockedBeforeOptionChange).toBe(true);
    expect(r.valueAfterOptionChange).toBe(0);
    expect(r.lockedAfterOptionChange).toBe(false);
  });

  test('분기관 제외 — 분기관 수동잠금 후 체크하면 0이 되고 잠금이 풀린다', () => {
    const r = runHomeOptionChangeScenario({
      family: 'H-07', model: 'AXJ-YA1509N', lockValue: LOCK_VALUE,
      controlId: 'home_no_branch', dom: { '#home_no_branch': { checked: true } },
    });
    expect(r.lockedBeforeOptionChange).toBe(true);
    expect(r.valueAfterOptionChange).toBe(0);
    expect(r.lockedAfterOptionChange).toBe(false);
  });

  test('발통포함 해제 — 계열 sweep(③)으로 추가 발견: 발통 수동잠금 후 발통포함 체크를 끄면 0이 되고 잠금이 풀린다', () => {
    const r = runHomeOptionChangeScenario({
      family: 'H-08', model: '발통세트', lockValue: LOCK_VALUE,
      controlId: 'home_foot', dom: { '#home_foot': { checked: false } },
    });
    expect(r.lockedBeforeOptionChange).toBe(true);
    expect(r.valueAfterOptionChange).toBe(0);
    expect(r.lockedAfterOptionChange).toBe(false);
  });

  test('회귀 울타리 — 옵션 변경이 없는 계열의 값은 이 fix로 사라지지 않는다(전 계열 0건 소실)', () => {
    // 판넬 옵션 변경(home_panel)이 호스 잠금(HOME_MANUAL_HOSE)까지 지우지 않는지 확인 —
    // Root① fix가 "옵션 컨트롤별로 자기 계열만" 비우는 스코프인지 검증한다.
    const r = runHomeOptionChangeScenario({
      family: 'H-01', model: 'FH-LFHLF', lockValue: LOCK_VALUE,
      controlId: 'home_panel', dom: { '#home_panel': '판넬제외' },
    });
    expect(r.lockedBeforeOptionChange).toBe(true);
    // home_panel 변경은 호스 잠금을 건드리지 않아야 한다 — 값·잠금 모두 유지
    expect(r.lockedAfterOptionChange).toBe(true);
    expect(r.valueAfterOptionChange).toBe(LOCK_VALUE);
  });
});

describe('#967 G-6 — 공청↔기본 판넬(4WAY) 왕복 시 이중 계상되지 않는다', () => {
  test('기본→공청→수동잠금→기본 복귀 시 from/to 합계가 실내기 수를 넘지 않는다', () => {
    const r = runPanelSwapScenario({
      family: 'H-04', indoorModel: 'AM052BN4DBH1',
      fromModel: 'PC4NUFK1NW', toModel: 'PC4NUCK4NW',
      indoorQty: 5, manualToValue: 2,
    });

    // (d1) 기본판넬 5개 — from에만 실림
    expect(r.d1).toEqual({ from: 5, to: 0 });
    // (d2) 공청판넬로 치환 — to에만 실림(잠금 없음)
    expect(r.d2).toEqual({ from: 0, to: 5 });
    // (d3) to를 수동 2로 잠금
    expect(r.d3).toEqual({ from: 0, to: 2 });

    // G-6 본체: (d4) 기본판넬로 되돌림 — from=5, to=0 이어야 한다(합계 5, 이중계상 아님)
    expect(r.d4.from + r.d4.to).toBeLessThanOrEqual(5);
    expect(r.d4).toEqual({ from: 5, to: 0 });

    // (d5) 다시 공청판넬 — 치환이 고착되지 않고 to=5 로 복귀한다
    expect(r.d5).toEqual({ from: 0, to: 5 });
  });
});

describe('#967 G-5 — 파생 수량에 "0"을 수동값으로 지정할 수 있다(U-2, 칸을 지움과 구분)', () => {
  test('명시적 0 입력은 잠금을 걸고(add), 값이 0으로 유지된다', () => {
    const r = runExplicitZeroScenario({ family: 'H-01', model: 'PC1NWSK3NW' });
    expect(r.lockedAfterExplicitZero).toBe(true);
    expect(r.valueAfterExplicitZero).toBe(0);
  });

  test('회귀 울타리 — 진짜로 칸을 지우면(explicit=false) 여전히 잠금이 풀린다', () => {
    const r = runExplicitZeroScenario({ family: 'H-01', model: 'PC1NWSK3NW' });
    expect(r.lockedAfterRealClear).toBe(false);
  });

  test('하위호환 — 2-인자 레거시 호출은 기존처럼 0=해제로 동작한다(R1 하네스 시그니처 불변)', () => {
    const r = runExplicitZeroScenario({ family: 'H-01', model: 'PC1NWSK3NW' });
    expect(r.lockedAfterLegacyTwoArgClear).toBe(false);
  });
});
