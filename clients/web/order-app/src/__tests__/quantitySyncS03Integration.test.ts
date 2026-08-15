import { describe, expect, it } from 'vitest';

declare function require(id: string): any;

const { runLegacyS03 } = require('./quantitySyncS03Harness.cjs');

describe('S-03 shadow과 legacy 사용자 계산 경계', () => {
  it('legacy 사용자 계산은 실 catalog source 4에서 target pump 4를 유지한다', () => {
    expect(runLegacyS03({ sourceQuantity: 4 })).toEqual({
      sourceQuantity: 4,
      targetQuantity: 4,
      manualLock: false,
    });
  });

  it('legacy GAS는 수동 입력된 target 77도 원품 4로 재계산한다', () => {
    // tools/legacy-gas/거래처 발송 주문서/index.html:4793-4800
    // if(SS_CEILING_PUMP_ID!=null){ ... singleQty.set(SS_CEILING_PUMP_ID,pumpQty); }
    // 원본 GAS의 단독 파생 수량은 수동잠금 없이 재계산 결과로 덮어쓴다.
    expect(runLegacyS03({ sourceQuantity: 4, manualQuantity: 77 })).toEqual({
      sourceQuantity: 4,
      targetQuantity: 4,
      manualLock: false,
    });
  });

  it('원품 수량이 4이면 수동 수정된 자동 부속 77을 공식값 4로 재계산한다', () => {
    expect(runLegacyS03({ sourceQuantity: 4, manualQuantity: 77 })).toEqual({
      sourceQuantity: 4,
      targetQuantity: 4,
      manualLock: false,
    });
  });
});
