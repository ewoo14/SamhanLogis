'use strict';

const { createVersionReloadGuard } = require('../lib/version-gate');

describe('종합견적 웹 버전 안내 새로고침 보호', () => {
  test('작성 중이면 사용자가 확인하기 전까지 reload하지 않는다', () => {
    const reload = jest.fn();
    const guard = createVersionReloadGuard(() => true, reload);

    expect(guard()).toBe('confirmation-required');
    expect(reload).not.toHaveBeenCalled();
    expect(guard(true)).toBe('reloaded');
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
