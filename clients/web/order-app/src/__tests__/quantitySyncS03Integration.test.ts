import { describe, expect, it } from 'vitest';

declare function require(id: string): any;

const { runConfiguredS03 } = require('./quantitySyncS03Harness.cjs');

describe('S-03 설정 evaluator와 order-app 수동 잠금 sink', () => {
  it('설정값으로 계산해도 실 catalog source의 4가 target pump 4로 반영된다', () => {
    expect(runConfiguredS03({ sourceQuantity: 4 })).toEqual({
      sourceQuantity: 4,
      targetQuantity: 4,
      manualLock: false,
    });
  });

  it('사용자가 target에 입력한 77은 설정 재계산으로 지워지지 않는다', () => {
    expect(runConfiguredS03({ sourceQuantity: 4, manualQuantity: 77 })).toEqual({
      sourceQuantity: 4,
      targetQuantity: 77,
      manualLock: true,
    });
  });
});
