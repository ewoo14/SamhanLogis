'use strict';

const mockSheetReadGrid = jest.fn(() => Promise.reject(new Error('Google Sheets must not be called')));
const mockSheetClearCache = jest.fn();

jest.mock('../lib/google-sheets-client', () => ({
  readSheetGrid: mockSheetReadGrid,
  clearCache: mockSheetClearCache,
}), { virtual: true });

jest.mock('axios', () => {
  const payloads = {
    '/internal/users/by-email': { fullName: '테스트담당자', loginId: 'TST-001' },
    '/internal/users/employees': [],
    '/internal/estimate-config': { commonHomeDiscountRate: 0.42, vatRate: 0.1 },
    '/products/internal/estimate-catalog/products?category=HOME_MULTI': [{ modelCode: 'HM-1', name: '홈멀티' }],
    '/products/internal/estimate-catalog/products?category=SINGLE_SET': [{ modelCode: 'SS-1', name: '싱글세트' }],
    '/products/internal/estimate-catalog/components?category=SINGLE_SET': [{ componentModelCode: 'SP-1', name: '싱글구성품' }],
    '/products/internal/estimate-catalog/material-prices': [{ name: '동관', price: 100 }],
    '/products/internal/estimate-catalog/products?category=COMMERCIAL_MULTI': [{ modelCode: 'CM-1', name: '상업멀티' }],
    '/products/internal/estimate-catalog/components?category=COMMERCIAL_MULTI': [{ componentModelCode: 'CP-1', name: '상업구성품' }],
    '/products/internal/estimate-catalog/products?category=LEGACY': [{ modelCode: 'OLD-1', name: '구형' }],
    '/products/internal/estimate-catalog/quantity-sync-rules?estimateCategory=HOME_MULTI': [{ modelCode: 'HM-1' }],
    '/products/internal/estimate-catalog/odu-recommendations': [{ recommendationType: 'HOME_MULTI', indoorCapacity: 1, outdoorHp: '1HP' }],
    '/products/internal/estimate-catalog/price-baseline': [],
    '/products/internal/price-change-schedule': {},
    '/products/internal/price-change-default-variant': {},
    '/products/internal/estimate-catalog/spec-detail-map': {},
    '/internal/dc-config': {},
  };

  const responseFor = (url) => {
    if (global.__CATALOG_DB_FAILURE__) return Promise.reject(new Error('product-service down'));
    const key = Object.keys(payloads).find((candidate) => url.includes(candidate));
    return Promise.resolve({ status: 200, data: { success: true, data: key ? payloads[key] : [] } });
  };
  const get = jest.fn(responseFor);
  const post = jest.fn(() => Promise.resolve({ status: 200, data: { success: true, data: {} } }));
  return { create: jest.fn(() => ({ get, post })), get, post };
});

const axios = require('axios');
const code = require('../lib/code');

describe('견적 카탈로그 원천 고정', () => {
  afterEach(() => {
    delete process.env.CATALOG_SOURCE;
    delete global.__CATALOG_DB_FAILURE__;
    jest.clearAllMocks();
  });

  test('CATALOG_SOURCE=sheet 이어도 Google Sheets 요청 없이 DB 카탈로그 9종을 로드한다', async () => {
    process.env.CATALOG_SOURCE = 'sheet';

    const bootstrap = await code.bootstrap('test@samhan-air.com');
    const urls = axios.create.mock.results[0].value.get.mock.calls.map(([url]) => url);

    expect(mockSheetReadGrid).not.toHaveBeenCalled();
    expect(urls.filter((url) => url.includes('/products/internal/estimate-catalog/')).length).toBeGreaterThanOrEqual(9);
    expect(JSON.parse(bootstrap.homemulti)).toHaveLength(1);
    expect(JSON.parse(bootstrap.singleSets)).toHaveLength(1);
    expect(JSON.parse(bootstrap.singleParts)).toHaveLength(1);
    expect(JSON.parse(bootstrap.singleMatPrices)).toEqual({ 동관: 100 });
    expect(JSON.parse(bootstrap.commercialMulti)).toHaveLength(1);
    expect(JSON.parse(bootstrap.commercialParts)).toHaveLength(1);
    expect(JSON.parse(bootstrap.oldProducts)).toHaveLength(1);
    expect(JSON.parse(bootstrap.quantitySyncRules)).toHaveLength(1);
    expect(JSON.parse(bootstrap.recommendData).home).toHaveLength(1);
  });

  test('DB 카탈로그 장애 시 시트로 재시도하지 않고 빈 값으로 반환한다', async () => {
    process.env.CATALOG_SOURCE = 'sheet';
    global.__CATALOG_DB_FAILURE__ = true;

    const bootstrap = await code.bootstrap('test@samhan-air.com');

    expect(mockSheetReadGrid).not.toHaveBeenCalled();
    expect(JSON.parse(bootstrap.homemulti)).toEqual([]);
    expect(JSON.parse(bootstrap.singleSets)).toEqual([]);
    expect(JSON.parse(bootstrap.singleParts)).toEqual([]);
    expect(JSON.parse(bootstrap.singleMatPrices)).toEqual({});
    expect(JSON.parse(bootstrap.commercialMulti)).toEqual([]);
    expect(JSON.parse(bootstrap.commercialParts)).toEqual([]);
    expect(JSON.parse(bootstrap.oldProducts)).toEqual([]);
    expect(JSON.parse(bootstrap.quantitySyncRules)).toEqual([]);
    expect(JSON.parse(bootstrap.recommendData)).toEqual({ comm: [], home: [], homeEx: [] });
  });
});
