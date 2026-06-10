/**
 * lib/code.js 함수 단위 단위테스트.
 *
 * Apps Script 시절에는 `Logger.log` 만으로 verify 했으나,
 * Node.js 포팅 후에는 jest 로 logic 보존을 검증한다.
 *
 * Phase 6 backend (PR #76) 머지 후 USE_MOCK_FALLBACK silent fallback 은 폐기되어
 * RPC 가 실 endpoint 를 호출하므로, 본 테스트는 axios 를 mock 해 endpoint 응답을
 * 직접 주입한다. 순수 utility / 캐시 / RPC dispatch 인벤토리는 endpoint 와
 * 무관하므로 그대로 동작한다.
 */

'use strict';

process.env.DEFAULT_USER_EMAIL = 'test@samhan-air.com';

// axios mock — 실 endpoint 호출을 가로채 200/임의 페이로드로 응답.
// (USE_MOCK_FALLBACK silent fallback 폐기 후 RPC fallback 응답 대체용)
jest.mock('axios', () => {
  const ok = (data) => Promise.resolve({ status: 200, data });
  const get = jest.fn().mockImplementation((url) => {
    if (/\/internal\/users\/by-email/.test(url)) {
      // #31 — user-service by-email (ApiResponse 봉투)
      return ok({ success: true, data: { fullName: '테스트담당자', loginId: 'TST-001' } });
    }
    if (/\/api\/v1\/partner-orders($|\?|\/$)/.test(url)) return ok([]);
    if (/\/internal\/estimates\/snapshots/.test(url)) return ok([]); // P0-A 하드닝
    if (/\/dc-config$/.test(url)) return ok(null);
    return ok({});
  });
  const post = jest.fn().mockImplementation((url) => {
    if (/\/internal\/slips\/from-estimate$/.test(url)) {
      // slip-service ApiResponse 봉투 (P0-B InternalSlipPublishController)
      return Promise.resolve({ status: 201, data: { success: true, data: { slipNo: 'TEST-SLIP-1', slipId: 'id-1' } } });
    }
    if (/\/internal\/estimates\/snapshots/.test(url)) { // P0-A 하드닝
      return ok({ success: true, data: { id: 'TEST-SNAP-1', custName: '삼한' } });
    }
    if (/\/api\/v1\/audit-logs\/front/.test(url)) return ok({ ok: true });
    return ok({ ok: true });
  });
  return {
    create: jest.fn(() => ({ get, post })),
    get,
    post,
  };
});

const code = require('../lib/code');
const slipBridge = require('../lib/slip-bridge');

describe('순수 유틸 (Apps Script 호환)', () => {
  test('parseKRNumber_ 한국식 콤마 파싱', () => {
    expect(code.parseKRNumber_('1,234,567')).toBe(1234567);
    expect(code.parseKRNumber_('1,000원')).toBe(1000);
    expect(code.parseKRNumber_('')).toBe(0);
    expect(code.parseKRNumber_(null)).toBe(0);
    expect(code.parseKRNumber_('-500')).toBe(-500);
  });

  test('normalizeSize_ 비숫자 제거', () => {
    expect(code.normalizeSize_('18평')).toBe('18');
    expect(code.normalizeSize_('  25.5HP  ')).toBe('25.5');
    expect(code.normalizeSize_('AAA')).toBe('');
  });

  test('isBlockedByNote_ 미판매/단종 감지', () => {
    expect(code.isBlockedByNote_('미판매')).toBe(true);
    expect(code.isBlockedByNote_('단종 예정')).toBe(true);
    expect(code.isBlockedByNote_('재고 충분')).toBe(false);
  });

  test('hpFromText_ HP/마력 추출 — 라이브 GAS 동작 (NHP 문자열)', () => {
    expect(code.hpFromText_('실외기 18HP')).toBe('18HP');
    expect(code.hpFromText_('실외기 5.5HP 상업용')).toBe('5.5HP');
    expect(code.hpFromText_('실외기 3마력')).toBe('3HP');
    expect(code.hpFromText_('패널')).toBe('');
  });

  test('classifyHome_ 대분류 (라이브 GAS verbatim)', () => {
    // 라이브 시그니처: { catL, catM, catS, disp } — 8단계 cascade
    expect(code.classifyHome_('실외기 18HP').catL).toBe('실외기');
    expect(code.classifyHome_('실내기 4WAY WIFI내장').catL).toBe('실내기');
    expect(code.classifyHome_('리모컨').catL).toBe('부자재');
    expect(code.classifyHome_('리모컨').catM).toBe('리모컨');
    expect(code.classifyHome_('판넬 정사각형').catL).toBe('판넬');
    expect(code.classifyHome_('기타 부품').catL).toBe('부자재');
  });

  test('classifySingleSetLM_ L/M 분류 (estimate-legacy 1:1 포팅)', () => {
    // estimate-legacy 시그니처: { L, M } — 텍스트 키워드 매칭 (모델 prefix 가 아님)
    expect(code.classifySingleSetLM_({ name: '4WAY 천장형', model: 'AC181' }).L).toBe('4w');
    expect(code.classifySingleSetLM_({ name: '1WAY 천장형', model: 'AP200' }).L).toBe('1w');
    expect(code.classifySingleSetLM_({ name: '벽걸이형', model: 'XX' }).L).toBe('wall');
    expect(code.classifySingleSetLM_({ name: '리모컨', model: 'YY' }).L).toBe('acc');
    expect(code.classifySingleSetLM_({ name: '냉방전용', model: 'ZZ' }).M).toBe('cool');
  });

  test('decideWarehouseCode_ — 라이브 GAS: 기본 00003, 키워드 hit 시에만 2', () => {
    // 기본값 = '00003' (빈 배열 포함)
    expect(code.decideWarehouseCode_([])).toBe('00003');
    expect(code.decideWarehouseCode_([{ section: 'SINGLE', name: '일반 세트' }])).toBe('00003');
    expect(code.decideWarehouseCode_([{ section: 'HOME', name: '실내기 4WAY' }])).toBe('00003');
    // HOME × 인피니트 → '2'
    expect(code.decideWarehouseCode_([{ section: 'HOME', name: '실내기 1-Way 인피니트' }])).toBe('2');
    // SINGLE × 360/1등급/벽걸이 등 → '2'
    expect(code.decideWarehouseCode_([{ section: 'SINGLE', name: '360CST 세트' }])).toBe('2');
    expect(code.decideWarehouseCode_([{ section: 'SINGLE', name: '1등급 세트' }])).toBe('2');
    expect(code.decideWarehouseCode_([{ section: 'SINGLE', name: '벽걸이 세트' }])).toBe('2');
    // nameRaw 우선 추출
    expect(code.decideWarehouseCode_([{ section: 'SINGLE', nameRaw: '비스포크 세트', name: '일반' }])).toBe('2');
    // 섹션 비매칭 시 키워드 무시
    expect(code.decideWarehouseCode_([{ section: 'COMM', name: '360CST' }])).toBe('00003');
  });

  test('detectHomeOrder home/HM 시그너처', () => {
    expect(code.detectHomeOrder([{ section: 'HOME' }], {})).toBe(true);
    expect(code.detectHomeOrder([], { type: 'home-multi' })).toBe(true);
    expect(code.detectHomeOrder([{ section: 'COMM' }], {})).toBe(false);
  });

  test('buildDefaultDcConfig_ — 라이브 GAS flat 11키', () => {
    const cfg = code.buildDefaultDcConfig_();
    expect(cfg.homeDiscount).toBe(0.45);
    expect(cfg.commDiscount).toBe(0.45);
    expect(cfg.showIHose).toBe(false);
    expect(cfg.discount360).toBe(0);
    expect(cfg.discount4way).toBe(0);
    expect(cfg.discountStand).toBe(0);
    expect(cfg.oneWayDiscount).toBe(0);
    expect(cfg.deluxeDiscount).toBe(0);
    expect(cfg.firstGradeDiscount).toBe(0);
    expect(cfg.unitRoundTo).toBe(0);
    expect(cfg.unitRoundMode).toBe('ROUND');
  });

  test('detectHomeOrder 모델 prefix (AJ0/AJ1/AM0/AM1) — 라이브 분기 복원', () => {
    expect(code.detectHomeOrder([{ section: 'COMM', model: 'AJ050TXJ3CH' }], {})).toBe(true);
    expect(code.detectHomeOrder([{ section: 'COMM', model: 'AC145' }], {})).toBe(false);
  });
});

describe('캐시 유틸', () => {
  test('cachePutJSON_/cacheGetJSON_ round-trip', () => {
    code.cachePutJSON_('TEST_KEY', { x: 1, y: '한글' }, 60);
    expect(code.cacheGetJSON_('TEST_KEY')).toEqual({ x: 1, y: '한글' });
    code.cacheRemoveJSON_('TEST_KEY');
    expect(code.cacheGetJSON_('TEST_KEY')).toBeNull();
  });
});

describe('부트스트랩 (axios mock — 실 endpoint 응답 stub)', () => {
  test('bootstrap 빈 카탈로그 반환', async () => {
    const bs = await code.bootstrap('test@samhan-air.com');
    expect(bs.userEmail).toBe('test@samhan-air.com');
    expect(JSON.parse(bs.homemulti)).toEqual([]);
    expect(JSON.parse(bs.singleSets)).toEqual([]);
    expect(JSON.parse(bs.config).homeDiscount).toBe(0.45);
  }, 15000);

  test('checkUserAuth — user-service by-email 매핑 (#31)', async () => {
    const auth = await code.checkUserAuth('test@samhan-air.com');
    expect(auth.authorized).toBe(true);
    expect(auth.managerName).toBe('테스트담당자');
    expect(auth.managerCode).toBe('TST-001');
  });

  test('checkUserAuth — 이메일 미전달 시 세션 이메일 fallback (#31)', async () => {
    const auth = await code.checkUserAuth('');
    expect(auth.authorized).toBe(true); // DEFAULT_USER_EMAIL fallback → by-email 매칭
  });
});

describe('slip-bridge — 견적 finalize → slip-service POST', () => {
  test('buildSlipRequest 매핑', () => {
    const order = { estimateNumber: 'EST-1' };
    const saleList = [{
      BulkDatas: {
        IO_DATE: '20250505', CUST: 'C1', CUST_DES: '거래처1',
        EMP_CD: '250102', WH_CD: '00003', IO_TYPE: '10',
        PROD_CD: 'AC181', QTY: '2', PRICE: '500000',
        USER_PRICE_VAT: '550000', SUPPLY_AMT: '1000000', VAT_AMT: '100000',
        SIZE_DES: '18평', REMARKS: 'r1',
        U_TXT1: '주소', ADD_TXT_01_T: '감리', ADD_TXT_03_T: '010-1', ADD_TXT_04_T: '메모', ADD_TXT_05_T: '0530',
      },
    }];
    const body = slipBridge.buildSlipRequest(order, saleList);
    expect(body.estimateNumber).toBe('EST-1');
    expect(body.partnerCode).toBe('C1');
    expect(body.warehouseCode).toBe('00003');
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0].productCode).toBe('AC181');
    expect(body.lines[0].qty).toBe('2'); // PublishLineRequest.qty String 계약
    expect(body.lines[0].unitPriceVat).toBe(550000);
  });

  test('buildSlipRequest estimateNumber 미전달 시 WEB- 고유 식별자 생성 (@NotBlank 계약)', () => {
    const saleList = [{ BulkDatas: { IO_DATE: '20260610', CUST: 'C1', PROD_CD: 'AC1', QTY: '1', PRICE: '100', USER_PRICE_VAT: '110' } }];
    const body = slipBridge.buildSlipRequest({}, saleList);
    expect(body.estimateNumber).toMatch(/^WEB-20260610-\d+$/);
  });

  test('postSlip — slip-service 200 응답 시 slipNo 반환 (axios mock)', async () => {
    const order = { estimateNumber: 'EST-2' };
    const saleList = [{ BulkDatas: { CUST: 'C1', PROD_CD: 'AC1', QTY: '1', PRICE: '100', USER_PRICE_VAT: '110' } }];
    const r = await slipBridge.postSlip(order, saleList);
    expect(r.ok).toBe(true);
    expect(r.slipNo).toBe('TEST-SLIP-1');
  });
});

describe('sendOrderFromUi — legacy 1762 logic 보존', () => {
  test('빈 items → 항목없음', async () => {
    const r = await code.sendOrderFromUi({ items: [] });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('항목없음');
  });

  test('미등록 거래처 → 미등록거래처', async () => {
    const r = await code.sendOrderFromUi({
      bizno: '999-99-99999',
      items: [{ model: 'X', qty: 1, price: 100 }],
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('미등록거래처');
  });
});

describe('RPC dispatch 호환성 — 76 함수 inventory', () => {
  test('inventory export 완전성', () => {
    const required = [
      'cachePutJSON_', 'cacheGetJSON_', 'cacheRemoveJSON_',
      'getGateImages', 'getLogoImage',
      'normalizeSize_', 'findIdx_', 'parseKRNumber_', 'parseKRFloat_',
      'toYmd_', 'toMmDd_', 'normalizeTel_', 'todayYMD_', '_normSpec_',
      'sanitizeKoreanParen_', 'trimSymbols_', 'sanitizeDisp_', 'hpFromText_',
      'isBlockedByNote_', 'isSoldOutByNote_', 'unifyCatL_', 'classifyHome_',
      'getHomeMulti', 'classifySingleSetLM_', 'findHeaderIndex_',
      'getSingleSets', 'extractRowsFromFormula_', 'getSingleParts',
      'getSingleMatPrices', 'classifyCommercial_', 'getCommercialMulti',
      'getCommercialParts', 'getSpecMap_', 'getSpecDetailMap_',
      'getHomeDefaults', 'getSingleDefaults',
      'getCustomerDataAsync', 'getCustomers_', 'searchCustomerByBizOrCode',
      'getManagers_', 'searchManagersByName_', 'findManagerByNameExact_',
      'getScriptCreds_', 'callZoneApi', 'getEcountSession',
      'getRecommendOduData', 'decideWarehouseCode_',
      'formatWonDiscountLabel_', 'formatPercentLabel_', 'combineRemarks_',
      'getOldProducts_', 'sendOrderFromUi', 'detectHomeOrder',
      'buildDefaultDcConfig_', 'fetchNotionDcConfig_', 'initDcConfigFromNotion',
      'searchCustomerByBizno', 'getManagersForInput', 'forceAuth',
      'saveOrderToNotion', 'getNotionHistory', 'logFrontEvent',
      'checkUserAuth', 'getInventoryTableHtml', 'getInventoryTable',
      'include', 'saveQuoteSnapshot', 'getQuoteHistory', 'getPriceIncData_',
      'doGet', 'bootstrap',
    ];
    const missing = required.filter((n) => typeof code[n] !== 'function');
    expect(missing).toEqual([]);
  });
});
