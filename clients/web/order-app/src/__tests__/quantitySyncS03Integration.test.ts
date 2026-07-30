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

  it('사용자가 target에 입력한 77은 설정 조회 때문에 지워지지 않는다', () => {
    expect(runLegacyS03({ sourceQuantity: 4, manualQuantity: 77 })).toEqual({
      sourceQuantity: 4,
      targetQuantity: 77,
      manualLock: true,
    });
  });
});
