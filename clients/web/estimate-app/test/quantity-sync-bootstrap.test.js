'use strict';

jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(async () => ({ status: 200, data: { data: [{ ruleKey: 'HOME_RULE' }] } })),
  })),
}));

describe('estimate-app 수량 동기화 bootstrap', () => {
  test('product-service internal 규칙 endpoint에서 HOME_MULTI 규칙을 읽는다', async () => {
    const catalog = require('../lib/db-catalog');
    await expect(catalog.quantitySyncRules()).resolves.toEqual([{ ruleKey: 'HOME_RULE' }]);
  });
});
