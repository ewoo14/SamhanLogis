'use strict';

/** 작성 중인 견적이 있을 때 새로고침을 두 단계 사용자 선택으로 제한한다. */
function createVersionReloadGuard(isDirty, reload) {
  return (confirmed = false) => {
    if (isDirty() && !confirmed) return 'confirmation-required';
    reload();
    return 'reloaded';
  };
}

module.exports = { createVersionReloadGuard };

