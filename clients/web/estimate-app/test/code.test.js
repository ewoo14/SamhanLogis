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

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
    if (/\/internal\/users\/employees/.test(url)) {
      return ok({
        success: true,
        data: [
          { fullName: '선택담당자', ecountCode: 'EMP-SEL' },
          { fullName: '로그인담당자', ecountCode: 'EMP-AUTH' },
        ],
      });
    }
    if (/\/api\/v1\/partner-orders($|\?|\/$)/.test(url)) return ok([]);
    if (/\/internal\/estimates\/snapshots/.test(url)) return ok([]); // P0-A 하드닝
    if (/\/products\/internal\/estimate-catalog\//.test(url)) return ok({ success: true, data: [] });
    if (/\/internal\/estimate-config$/.test(url)) {
      return ok({
        success: true,
        data: global.__ESTIMATE_CONFIG_PAYLOAD__ || {
          commonHomeDiscountRate: 0.42,
          commonCommercialDiscountRate: 0.43,
          oldProductDiscountRate: 0.55,
          vatRate: 0.1,
          cardFeeRate: 0.03,
          advanceDiscountRate: 0.02,
          comboWarnRate: 0.8,
          homeNoHose: false,
          homeNoBranch: false,
          homeWithFoot: false,
          homeDefaultPanel: '',
          singleDefaultWiredRemote: '',
          singleNoRemote: false,
          singleWithBase: false,
          singleDefaultPanel: '',
          singlePanelShape: '원형',
          singleDiscount: 0,
          singleOneWayDiscount: 0,
          singleMaterialInclusion: '별도',
          footerNotice: '테스트 안내',
        },
      });
    }
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
const axios = require('axios');

describe('estimate snapshot author authentication boundary (#1009)', () => {
  test('uses the authenticated saver email instead of the server default email', async () => {
    axios.post.mockClear();

    await code.saveQuoteSnapshot({
      data: { lines: [] },
      summary: { custName: 'author boundary RED' },
    }, 'dev_master@samhan-air.com');

    const snapshotPost = axios.post.mock.calls.find(([url]) => /\/internal\/estimates\/snapshots$/.test(url));
    expect(snapshotPost).toBeTruthy();
    expect(snapshotPost[1].userEmail).toBe('dev_master@samhan-air.com');
  });
});

function extractNamedFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`${name} not found`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} body not closed`);
}

function loadEstimateViewFunctionFromSource(source, name, contextOverrides = {}) {
  const context = {
    window: {},
    document: {
      getElementById: jest.fn(() => null),
      querySelector: jest.fn(() => null),
    },
    Number,
    Math,
    String,
    Array,
    ...contextOverrides,
  };
  vm.createContext(context);
  vm.runInContext(extractNamedFunction(source, name), context);
  return context;
}

function loadCurrentEstimateViewFunction(name, contextOverrides = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../views/index.ejs'), 'utf8');
  return loadEstimateViewFunctionFromSource(source, name, contextOverrides);
}

describe('전표 생성 UI 응답 계약', () => {
  test('ok:true 이고 전표번호가 있을 때만 성공으로 판정한다', () => {
    const context = loadCurrentEstimateViewFunction('isSlipPublishSuccess');

    expect(context.isSlipPublishSuccess({ ok: true, slipNo: 'SLIP-1' })).toBe(true);
    expect(context.isSlipPublishSuccess({ ok: false, error: 'slip-service 실패' })).toBe(false);
    expect(context.isSlipPublishSuccess({ ok: true })).toBe(false);
    expect(context.isSlipPublishSuccess({ ok: false, slipNo: 'SHOULD-NOT-SUCCEED' })).toBe(false);
    expect(context.isSlipPublishSuccess({ ok: true, slipNo: '' })).toBe(false);
  });

  test('두 전표 생성 콜백 모두 공통 성공 판정을 사용한다', () => {
    const source = fs.readFileSync(path.join(__dirname, '../views/index.ejs'), 'utf8');
    const callbackCount = (source.match(/!isSlipPublishSuccess\(res\)/g) || []).length;
    expect(callbackCount).toBe(2);
  });
});

function runCardFeeCase(loadFn, rows, checked = true) {
  const chkCard = { checked };
  const context = loadFn('applyCardFeeLogic', {
    document: { getElementById: jest.fn((id) => (id === 'chkCardPay' ? chkCard : null)) },
    getCardFeeRate: () => 0.03,
  });
  const clonedRows = JSON.parse(JSON.stringify(rows));
  context.applyCardFeeLogic(clonedRows);
  return {
    rows: clonedRows,
    currentCardFee: context.window.CURRENT_CARD_FEE,
  };
}

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

  test('buildDefaultDcConfig_ — estimateConfig 전역 DC 기본율 주입', () => {
    const cfg = code.buildDefaultDcConfig_({
      commonHomeDiscountRate: 0.42,
      commonCommercialDiscountRate: 0.43,
    });
    expect(cfg.homeDiscount).toBe(0.42);
    expect(cfg.commDiscount).toBe(0.43);
    expect(cfg.showIHose).toBe(false);
  });

  test('getHomeDefaults — DB estimateConfig를 legacy 한글 키 shape로 변환한다', () => {
    expect(code.getHomeDefaults({
      homeNoHose: true,
      homeNoBranch: false,
      homeWithFoot: true,
      homeDefaultPanel: '공청판넬',
    })).toEqual({
      '유연호스 제외': true,
      '분기관 제외': false,
      '발통포함': true,
      '리모컨': '선택 안함',
      '판넬변경': '공청판넬',
    });
  });

  test('getSingleDefaults — DB estimateConfig를 legacy 한글 키 shape로 변환한다', () => {
    expect(code.getSingleDefaults({
      singleDefaultWiredRemote: '컬러유선리모컨',
      singleNoRemote: true,
      singleWithBase: true,
      singleDefaultPanel: '블랙판넬',
      singlePanelShape: '사각',
      singleDiscount: 12345,
      singleOneWayDiscount: 6789,
      singleMaterialInclusion: '포함',
    })).toEqual({
      '유선리모컨': '컬러유선리모컨',
      '리모컨 제외': true,
      '실외기 받침대 포함': true,
      '판넬변경': '블랙판넬',
      '360판넬': '사각',
      '할인': 12345,
      '1WAY할인': 6789,
      '자재 포함 여부': '포함',
    });
  });

  test('splitVatAmount_ — 기본 VAT 10%는 기존 1.1 하드코딩과 동일', () => {
    expect(code.splitVatAmount_(110000, { vatRate: 0.1 })).toEqual({
      supply: 100000,
      vat: 10000,
    });
    expect(code.splitVatAmount_(-110000, { vatRate: 0.1 })).toEqual({
      supply: -100000,
      vat: -10000,
    });
  });

  test('splitVatAmount_ — VAT 설정 변경 시 1+vatRate로 분리한다', () => {
    expect(code.splitVatAmount_(120000, { vatRate: 0.2 })).toEqual({
      supply: 100000,
      vat: 20000,
    });
  });

  test('applyEstimateTotalAdjustments_ — 선금 기본 0은 총액 무변경 parity', () => {
    const rows = [{ name: 'A', qty: 1, price: 110000, sub: 110000 }];
    const result = code.applyEstimateTotalAdjustments_(rows, {
      advanceDiscountRate: 0,
    }, { advance: true });
    expect(result.total).toBe(110000);
    expect(result.adjustment).toBe(0);
    expect(rows).toEqual([{ name: 'A', qty: 1, price: 110000, sub: 110000 }]);
  });

  test('applyEstimateTotalAdjustments_ — 선금할인은 VAT 포함 총액에서 차감한다', () => {
    const rows = [{ name: 'A', qty: 1, price: 110000, sub: 110000 }];
    const result = code.applyEstimateTotalAdjustments_(rows, {
      advanceDiscountRate: 0.02,
    }, { advance: true });
    expect(result.total).toBe(107800);
    expect(result.adjustment).toBe(-2200);
    expect(rows.at(-1)).toEqual(expect.objectContaining({
      name: '선금할인',
      price: -2200,
      sub: -2200,
    }));
  });

  test('applyCardFeeLogic(view) — origin/main frozen ground-truth 출력과 동일', () => {
    // 기대값 = origin/main(머지 base) applyCardFeeLogic 의 verbatim 출력(동결 ground-truth).
    // 재생성: `git show origin/main:clients/web/estimate-app/views/index.ejs` 의
    // applyCardFeeLogic 을 동일 입력으로 실행. 테스트 런타임은 CI shallow checkout 호환을 위해 git 비의존.
    const cases = [
      {
        name: '다중행 + qty=1 타깃 합산 + floor 경계',
        checked: true,
        rows: [
          { name: '세트헤드', type: 'set-head', qty: 1, price: 100000, sub: 100000 },
          { name: '실내기', type: 'item', qty: 2, price: 33333, sub: 66666 },
          { name: '설치비', type: 'item', qty: 1, price: 1000, sub: 1000 },
        ],
        expected: {
          currentCardFee: 5029,
          rows: [
            { name: '세트헤드', type: 'set-head', qty: 1, price: 100000, sub: 100000 },
            { name: '실내기', type: 'item', qty: 2, price: 33333, sub: 66666 },
            { name: '설치비', type: 'item', qty: 1, price: 6029, sub: 6029 },
          ],
        },
      },
      {
        name: '타깃 없음 → 카드수수료 별도행',
        checked: true,
        rows: [
          { name: '세트헤드', type: 'set-head', qty: 2, price: 100000, sub: 200000 },
          { name: '실내기', type: 'item', qty: 2, price: 100000, sub: 200000 },
        ],
        expected: {
          currentCardFee: 12000,
          rows: [
            { name: '세트헤드', type: 'set-head', qty: 2, price: 100000, sub: 200000 },
            { name: '실내기', type: 'item', qty: 2, price: 100000, sub: 200000 },
            {
              name: '카드수수료',
              model: '카드수수료',
              unit: '식',
              qty: 1,
              price: 12000,
              sub: 12000,
              remarks: '',
              cat: '기타',
              cardFee: 12000,
            },
          ],
        },
      },
      {
        name: '체크 off → no-op',
        checked: false,
        rows: [
          { name: '설치비', type: 'item', qty: 1, price: 1000, sub: 1000 },
        ],
        expected: {
          currentCardFee: 0,
          rows: [
            { name: '설치비', type: 'item', qty: 1, price: 1000, sub: 1000 },
          ],
        },
      },
      {
        name: '기존 수수료 remarks → no-op',
        checked: true,
        rows: [
          { name: '설치비', type: 'item', qty: 1, price: 1000, sub: 1000, remarks: '수수료 포함' },
          { name: '실내기', type: 'item', qty: 1, price: 2000, sub: 2000 },
        ],
        expected: {
          currentCardFee: 0,
          rows: [
            { name: '설치비', type: 'item', qty: 1, price: 1000, sub: 1000, remarks: '수수료 포함' },
            { name: '실내기', type: 'item', qty: 1, price: 2000, sub: 2000 },
          ],
        },
      },
    ];

    cases.forEach((c) => {
      const actual = runCardFeeCase(loadCurrentEstimateViewFunction, c.rows, c.checked);
      expect(actual).toEqual(c.expected);
    });
  });

  test('single option controls(view) — 360판넬 초기값은 SINGLE_DEFAULTS를 사용한다', () => {
    const source = fs.readFileSync(path.join(__dirname, '../views/index.ejs'), 'utf8');
    expect(source).toContain(
      "sel('360판넬',['원형','사각'],SINGLE_DEFAULTS['360판넬']||'원형','ss_p360')",
    );
    expect(source).toContain(
      "if (el('#ss_p360')) el('#ss_p360').value = SINGLE_DEFAULTS['360판넬']||'원형';",
    );
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
  afterEach(() => {
    delete global.__ESTIMATE_CONFIG_PAYLOAD__;
    delete process.env.CATALOG_SOURCE;
  });

  test('bootstrap CATALOG_SOURCE 미설정 시 DB 기본으로 빈 카탈로그 반환', async () => {
    const bs = await code.bootstrap('test@samhan-air.com');
    expect(bs.userEmail).toBe('test@samhan-air.com');
    expect(JSON.parse(bs.homemulti)).toEqual([]);
    expect(JSON.parse(bs.singleSets)).toEqual([]);
    expect(JSON.parse(bs.config).homeDiscount).toBe(0.42);
    expect(JSON.parse(bs.config).cardFeeRate).toBe(0.03);
    expect(JSON.parse(bs.config).advanceDiscountRate).toBe(0.02);
    expect(JSON.parse(bs.config).vatRate).toBe(0.1);
  }, 15000);

  test('bootstrap DB 모드는 estimateConfig default를 homeDefaults/singleDefaults에 주입한다', async () => {
    process.env.CATALOG_SOURCE = 'db';
    global.__ESTIMATE_CONFIG_PAYLOAD__ = {
      commonHomeDiscountRate: 0.42,
      commonCommercialDiscountRate: 0.43,
      oldProductDiscountRate: 0.55,
      vatRate: 0.1,
      cardFeeRate: 0.03,
      advanceDiscountRate: 0.02,
      comboWarnRate: 0.8,
      homeNoHose: true,
      homeNoBranch: false,
      homeWithFoot: true,
      homeDefaultPanel: '공청판넬',
      singleDefaultWiredRemote: '유선리모컨',
      singleNoRemote: true,
      singleWithBase: true,
      singleDefaultPanel: '승강판넬',
      singlePanelShape: '사각',
      singleDiscount: 1111,
      singleOneWayDiscount: 2222,
      singleMaterialInclusion: '포함',
      footerNotice: '테스트 안내',
    };

    const bs = await code.bootstrap('test@samhan-air.com');

    expect(JSON.parse(bs.homeDefaults)).toEqual({
      '유연호스 제외': true,
      '분기관 제외': false,
      '발통포함': true,
      '리모컨': '선택 안함',
      '판넬변경': '공청판넬',
    });
    expect(JSON.parse(bs.singleDefaults)).toEqual({
      '유선리모컨': '유선리모컨',
      '리모컨 제외': true,
      '실외기 받침대 포함': true,
      '판넬변경': '승강판넬',
      '360판넬': '사각',
      '할인': 1111,
      '1WAY할인': 2222,
      '자재 포함 여부': '포함',
    });
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
  beforeEach(() => {
    code.cacheRemoveJSON_('CUS_V6');
    code.cacheRemoveJSON_('MGR_V1');
    axios.post.mockClear();
  });

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

  test('선결제 + advanceDiscountRate > 0 → 선금할인 행을 slip-service 전송 body에 포함한다', async () => {
    code.cachePutJSON_('CUS_V6', [
      { code: 'C1', name: '거래처1', bizno: '1234567890', tel: '010', addr: '대구' },
    ], 60);
    code.cachePutJSON_('MGR_V1', [], 60);

    const r = await code.sendOrderFromUi({
      estimateNumber: 'EST-ADV-1',
      bizno: '123-45-67890',
      custName: '거래처1',
      due: '2026-06-18',
      payDue: '선결제',
      addr: '대구',
      estimateConfig: { advanceDiscountRate: 0.02 },
      items: [{ section: 'HOME', name: '실내기', model: 'AC181', unit: 'EA', qty: 1, price: 110000, sub: 110000 }],
    });

    expect(r.ok).toBe(true);
    const slipPost = axios.post.mock.calls.find(([url]) => /\/internal\/slips\/from-estimate$/.test(url));
    expect(slipPost).toBeTruthy();
    const body = slipPost[1];
    const advanceLine = body.lines.find((line) => line.productCode === '선금할인');
    expect(advanceLine).toEqual(expect.objectContaining({
      qty: '1',
      unitPriceVat: 2200,
      supplyAmount: -2000,
      vatAmount: -200,
      remarks: '',
    }));
  });

  test('선택 담당자가 있으면 로그인자보다 우선해 전표 EMP_CD와 표시 담당자에 반영한다', async () => {
    code.cachePutJSON_('CUS_V6', [
      { code: 'C1', name: '거래처1', bizno: '1234567890', tel: '010', addr: '대구' },
    ], 60);
    code.cachePutJSON_('MGR_V1', [
      { '담당자명': '선택담당자', '담당자코드': 'EMP-SEL', manager: '선택담당자', empCd: 'EMP-SEL' },
    ], 60);

    const r = await code.sendOrderFromUi({
      estimateNumber: 'EST-MGR-1',
      bizno: '123-45-67890',
      custName: '거래처1',
      due: '2026-06-18',
      addr: '대구',
      manager: '선택담당자',
      managerCode: 'EMP-SEL',
      auth: { managerName: '로그인담당자', managerCode: 'EMP-AUTH' },
      items: [{ section: 'HOME', name: '실내기', model: 'AC181', unit: 'EA', qty: 1, price: 110000, sub: 110000 }],
    });

    expect(r.ok).toBe(true);
    const slipPost = axios.post.mock.calls.find(([url]) => /\/internal\/slips\/from-estimate$/.test(url));
    expect(slipPost).toBeTruthy();
    const body = slipPost[1];
    expect(body.employeeCode).toBe('EMP-SEL');
    expect(body.manager).toBe('선택담당자');
  });
});

describe('담당자 RPC', () => {
  beforeEach(() => {
    code.cacheRemoveJSON_('MGR_V1');
    axios.get.mockClear();
  });

  test('getManagersForInput 빈 쿼리는 기존 계약대로 빈 배열을 유지한다', () => {
    code.cachePutJSON_('MGR_V1', [
      { '담당자명': '선택담당자', '담당자코드': 'EMP-SEL' },
    ], 60);

    expect(code.getManagersForInput('')).toEqual([]);
  });

  test('getAllManagers는 전체 담당자 캐시를 반환해 FE 초기 적재에 사용된다', async () => {
    await code.getCustomerDataAsync(true);

    await expect(code.getAllManagers()).resolves.toEqual([
      { '담당자명': '선택담당자', '담당자코드': 'EMP-SEL', manager: '선택담당자', empCd: 'EMP-SEL' },
      { '담당자명': '로그인담당자', '담당자코드': 'EMP-AUTH', manager: '로그인담당자', empCd: 'EMP-AUTH' },
    ]);
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
      'searchCustomerByBizno', 'getManagersForInput', 'getAllManagers', 'forceAuth',
      'saveOrderToNotion', 'getNotionHistory', 'logFrontEvent',
      'checkUserAuth', 'getInventoryTableHtml', 'getInventoryTable',
      'include', 'saveQuoteSnapshot', 'getQuoteHistory', 'getPriceIncData_',
      'doGet', 'bootstrap',
    ];
    const missing = required.filter((n) => typeof code[n] !== 'function');
    expect(missing).toEqual([]);
  });
});
