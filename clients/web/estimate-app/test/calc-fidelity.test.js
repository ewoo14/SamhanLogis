/**
 * P0-C 계산 6함수 충실 복원 검증 (라이브 종합견적서 Code.js 06-09 기준).
 *
 * 기준 소스 = tools/legacy-gas/종합견적서/Code.js (clasp 라이브 스냅샷).
 * 시트 데이터는 apps-script-shim.injectSheet(values, formulas) 로 주입해
 * GAS getFormulas() 수식분기 (useK2/$L$2, matKey/$D$7·$D$8, isDisc/$I$1) 까지 검증한다.
 */

'use strict';

process.env.DEFAULT_USER_EMAIL = 'test@samhan-air.com';

jest.mock('axios', () => {
  const ok = (data) => Promise.resolve({ status: 200, data });
  const get = jest.fn().mockImplementation((url) => {
    // #29 — dc-config-service internal by-bizno (ApiResponse 봉투 + nested dcConfig)
    if (/\/internal\/partners\/by-bizno\/9876543210$/.test(url)) {
      return ok({
        success: true,
        data: {
          partner: { partnerCode: '9876543210', name: 'DC테스트거래처' },
          dcConfig: {
            partnerCode: '9876543210',
            homeDiscountRate: 0.46,
            commercialDiscountRate: 0.47,
            showIHose: true,
            discount360Amount: 20000.0,
            discount4WayAmount: 25000.0,
            discount1WayAmount: 30000.0,
            discountStandAmount: 10000.0,
            discountDeluxeAmount: null,
            discountFirstGradeAmount: 0,
            unitRoundTo: 100,
            unitRoundMode: 'ROUND',
          },
        },
      });
    }
    if (/\/internal\/partners\/by-bizno\/5555555555$/.test(url)) {
      // DC 설정 미존재 거래처 — dcConfig null
      return ok({ success: true, data: { partner: { partnerCode: '5555555555' }, dcConfig: null } });
    }
    if (/\/internal\/partners\/by-bizno\/4044040440$/.test(url)) {
      return Promise.resolve({ status: 404, data: { success: false, error: '거래처를 찾을 수 없습니다' } });
    }
    // #31 — DC 벌크 (legacy getAllNotionDcConfigs_ 대체)
    if (/\/internal\/partner-dc-configs$/.test(url)) {
      return ok({
        success: true,
        data: [
          { partnerCode: '9876543210', homeDiscountRate: 0.46, commercialDiscountRate: 0.47, showIHose: true, discount360Amount: 20000, unitRoundTo: 100, unitRoundMode: 'ROUND' },
          { partnerCode: '1112223334', homeDiscountRate: 0.5, commercialDiscountRate: null, showIHose: false },
        ],
      });
    }
    // #31 — 거래처별 견적 이력
    if (/\/internal\/estimates\/snapshots\/by-customer/.test(url)) {
      return ok({ success: true, data: [{ id: 'snap-1', custName: '삼한공조', data: 'YmxvYg==', created: '2026-06-10T10:00:00' }] });
    }
    return ok({});
  });
  const post = jest.fn().mockImplementation(() => ok({ ok: true }));
  return { create: jest.fn(() => ({ get, post })), get, post };
});

const shim = require('../lib/apps-script-shim');
const code = require('../lib/code');
const directory = require('../lib/directory');
const axios = require('axios');

const SHEET_ID = code._constants.SRC_SHEET_ID;
const HOME_NAME = '홈멀티_단가인상';
const SINGLE_NAME = '싱글 세트_단가인상';
const COMM_NAME = '상업멀티_단가인상';

/* ════════════════════════════════════════════════════════════════════════
 * 1. classifyHome_ — 라이브 8단계 cascade
 * ═══════════════════════════════════════════════════════════════════════ */
describe('classifyHome_ — 라이브 8단계 cascade verbatim', () => {
  test('실외기 받침대 (원형발통/일자발)', () => {
    expect(code.classifyHome_('실외기 원형발통 세트')).toEqual(
      expect.objectContaining({ catL: '실외기 받침대', catM: '원형발통' }),
    );
    expect(code.classifyHome_('실외기 받침대 일자발')).toEqual(
      expect.objectContaining({ catL: '실외기 받침대', catM: '일자발' }),
    );
  });

  test('전열교환기 (에어콤보)', () => {
    expect(code.classifyHome_('전열교환기 에어콤보 350')).toEqual(
      expect.objectContaining({ catL: '전열교환기', catM: '에어콤보' }),
    );
  });

  test('인테리어핏 / 시스템제습기', () => {
    expect(code.classifyHome_('인테리어핏 4WAY').catL).toBe('인테리어핏');
    expect(code.classifyHome_('시스템제습기 30평형').catL).toBe('시스템제습기');
    // 가정용 제습기는 제습기 분기 제외
    expect(code.classifyHome_('가정용 제습기').catL).not.toBe('시스템제습기');
  });

  test('실외기 — 단·다배관 catM + HP disp', () => {
    const r = code.classifyHome_('실외기 단배관 3마력');
    expect(r.catL).toBe('실외기');
    expect(r.catM).toBe('단배관');
    expect(r.disp).toBe('3HP');
    expect(code.classifyHome_('실외기 다배관 5.5HP').catM).toBe('다배관');
  });

  test('실내기 — 1-Way WIFI/인피니트UV 세분 + 소중대형 catS + 평형/무풍 disp', () => {
    const wifi = code.classifyHome_('실내기 1-Way WIFI내장 중형 10평형');
    expect(wifi.catM).toBe('1-Way WIFI');
    expect(wifi.catS).toBe('중형');
    expect(wifi.disp).toBe('10평형');

    expect(code.classifyHome_('실내기 1Way 인피니트 UV 소형').catM).toBe('1-Way 인피니트UV');
    expect(code.classifyHome_('실내기 1Way 인피니트 소형').catM).toBe('1-Way 인피니트');
    expect(code.classifyHome_('실내기 1-Way 대형').catM).toBe('1-Way 미내장');
    expect(code.classifyHome_('실내기 4WAY WIFI내장').catM).toBe('4WAY WIFI');
    expect(code.classifyHome_('실내기 360 CST WIFI').catM).toBe('360 WIFI');
    expect(code.classifyHome_('무풍 벽걸이 13평형').catM).toBe('벽걸이');
    expect(code.classifyHome_('실내기 무풍 4Way 18평형').disp).toBe('무풍 18평형');
  });

  test('판넬 — 공기청정 WIFI 조합', () => {
    expect(code.classifyHome_('판넬 공기청정 WIFI').catM).toBe('공기청정 WIFI');
    expect(code.classifyHome_('패널 공청 미내장').catM).toBe('공기청정 미내장');
    expect(code.classifyHome_('판넬 WIFI').catM).toBe('WIFI');
    expect(code.classifyHome_('판넬 인피니트').catM).toBe('인피니트');
  });

  test('부자재 — 리모컨/분기관/유연호스/기타', () => {
    expect(code.classifyHome_('유선 리모콘').catM).toBe('리모컨');
    expect(code.classifyHome_('Y 분기관').catM).toBe('분기관');
    expect(code.classifyHome_('유연호스 1m').catM).toBe('유연호스');
    expect(code.classifyHome_('드레인 펌프').catM).toBe('기타');
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * 2. classifyCommercial_ — outKeys 우선 + inKeys 세분 + catS 4블록
 * ═══════════════════════════════════════════════════════════════════════ */
describe('classifyCommercial_ — 라이브 verbatim', () => {
  test('분기관 단락', () => {
    expect(code.classifyCommercial_('Y 분기관', '')).toEqual({ catL: '부자재', catM: '분기관', catS: '' });
  });

  test('실외기 outKeys 우선 (프라임/ECO 냉난방 + ECO 소분류)', () => {
    expect(code.classifyCommercial_('프라임 실외기 10마력', 'AM100AXVGH')).toEqual(
      expect.objectContaining({ catL: '실외기', catM: '프라임' }),
    );
    const eco = code.classifyCommercial_('ECO 냉난방 단상형 8마력', 'AM080AXVGH');
    expect(eco.catM).toBe('ECO 냉난방');
    expect(eco.catS).toBe('단상형');
    expect(code.classifyCommercial_('ECO 냉난방 상부 토출형', '').catS).toBe('상부토출형');
  });

  test('실내기 inKeys 세분 — 4-Way UV-C/MINI/WIFI 조합 + 360CST', () => {
    expect(code.classifyCommercial_('4Way 카세트 UV-C WIFI', 'AM060PN').catM).toBe('4-Way UV-C WIFI내장');
    expect(code.classifyCommercial_('MINI 4Way WIFI', 'AM045PN').catM).toBe('MINI 4WAY WIFI내장');
    expect(code.classifyCommercial_('4Way WIFI', 'AM071PN').catM).toBe('4-Way WIFI내장');
    expect(code.classifyCommercial_('MINI 4Way', 'AM045PN').catM).toBe('MINI 4WAY 미내장');
    expect(code.classifyCommercial_('360CST WIFI 카세트', 'AM060PN').catM).toBe('360CST WIFI내장');
    expect(code.classifyCommercial_('스탠드 PAC', 'AM072PN').catM).toBe('스탠드형(PAC)');
  });

  test('1Way catS — 소형/대형/기본 중형', () => {
    expect(code.classifyCommercial_('1Way 소형', 'AM022PN').catS).toBe('소형');
    expect(code.classifyCommercial_('1Way 대형', 'AM060PN').catS).toBe('대형');
    expect(code.classifyCommercial_('1Way WIFI', 'AM028PN').catS).toBe('중형');
  });

  test('DUCT catS — 저정압 SLIM/중정압/고정압', () => {
    expect(code.classifyCommercial_('저정압 SLIM DUCT', 'AM045BN').catS).toBe('저정압 SLIM');
    expect(code.classifyCommercial_('중정압 DUCT', 'AM071BN').catS).toBe('중정압');
    expect(code.classifyCommercial_('고정압 DUCT', 'AM128BN').catS).toBe('고정압');
  });

  test('전열교환기 catS — 상업용/주택용', () => {
    expect(code.classifyCommercial_('전열교환기 상업용 800', '').catS).toBe('상업용');
    expect(code.classifyCommercial_('전열 교환기 주택용 350', '').catS).toBe('주택용');
  });

  test('L 보정 — 모델 패턴/DVM + 판넬/부자재 fallthrough', () => {
    expect(code.classifyCommercial_('DVM S2 패키지', '').catL).toBe('실외기');
    expect(code.classifyCommercial_('카세트', 'AM060AXVGH').catL).toBe('실외기');
    expect(code.classifyCommercial_('카세트', 'AM060PN').catL).toBe('실내기');
    expect(code.classifyCommercial_('판넬 사각', '').catL).toBe('판넬');
    expect(code.classifyCommercial_('기타 자재', '').catL).toBe('부자재');
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * 3. getFormulas 수식분기 — useK2($L$2) / matKey($D$7·$D$8) / isDisc($I$1)
 * ═══════════════════════════════════════════════════════════════════════ */
describe('수식분기 — shim getFormulas 실 수식 전달', () => {
  test('getHomeMulti useK2 — 납품가 수식 $L$2 참조 감지', () => {
    code.cacheRemoveJSON_('HM_FIX_V13');
    const header = ['품명', '모델명', '단위', '납품가', '용량', '규격', '출고가', '고정DC', '비고', '최대 연결 실내기 대수'];
    const values = [
      header,
      ['실내기 1-Way WIFI내장 10평형', 'AM022', 'EA', '1,100,000', '2.2', '규격A', '2,000,000', '', '', '5'],
      ['실외기 단배관 3마력', 'AM060', 'EA', '3,300,000', '6.0', '', '4,000,000', '', '', '8'],
    ];
    const formulas = [
      header.map(() => ''),
      ['', '', '', '=ROUND(G2*$L$2,0)', '', '', '', '', '', ''],
      header.map(() => ''),
    ];
    shim.injectSheet(SHEET_ID, HOME_NAME, values, formulas);

    const out = code.getHomeMulti();
    expect(out).toHaveLength(2);
    expect(out[0].useK2).toBe(true);
    expect(out[0].formula).toBe('=ROUND(G2*$L$2,0)');
    expect(out[1].useK2).toBe(false);
    // findIdx_ 키 공백 정규화 — '최대 연결 실내기 대수' 매칭 복원
    expect(out[0].maxIndoor).toBe(5);
    expect(out[0].price).toBe(1100000);
    expect(out[0].list).toBe(2000000);
  });

  test('getSingleSets matKey — 납품가 수식 $D$7/$D$8 → D7/D8, 무수식 → D4', () => {
    code.cacheRemoveJSON_('SS_FIX_V16');
    const header = ['품명', '평형', '모델명', '단위', '비고', '출고가', '납품가', '납품가'];
    const values = [
      ['', '', '', '', '', '', '', ''],
      header,
      ['무풍 갤러리 세트', '18', 'AR060', 'SET', '', '3,000,000', '2,000,000', '2,200,000'],
      ['1등급 세트', '13', 'AR040', 'SET', '', '2,500,000', '1,800,000', '1,900,000'],
      ['일반 세트', '15', 'AR050', 'SET', '', '2,000,000', '1,500,000', '1,600,000'],
    ];
    const formulas = [
      header.map(() => ''),
      header.map(() => ''),
      ['', '', '', '', '', '', '', '=G3+$D$7'],
      ['', '', '', '', '', '', '', '=G4+$D$8'],
      header.map(() => ''),
    ];
    shim.injectSheet(SHEET_ID, SINGLE_NAME, values, formulas);

    const out = code.getSingleSets();
    expect(out).toHaveLength(3);
    expect(out[0].matKey).toBe('D7');
    expect(out[1].matKey).toBe('D8');
    expect(out[2].matKey).toBe('D4');
    expect(out[0].price).toBe(2200000); // 우측 납품가 확정
  });

  test('ragged rows — 값 행이 절단되어도 수식 인덱스 보존 (P1 fix)', () => {
    code.cacheRemoveJSON_('HM_FIX_V13');
    const header = ['품명', '모델명', '단위', '납품가', '용량', '규격', '출고가', '고정DC', '비고', '최대 연결 실내기 대수'];
    // Sheets API 가 trailing 빈 셀을 절단한 값 행(4셀) — 납품가 수식은 존재
    const values = [
      header,
      ['실내기 4WAY WIFI내장', 'AM071', 'EA', ''],
    ];
    const formulas = [
      [],
      ['', '', '', '=ROUND(G2*$L$2,0)'],
    ];
    shim.injectSheet(SHEET_ID, HOME_NAME, values, formulas);

    const out = code.getHomeMulti();
    expect(out).toHaveLength(1);
    expect(out[0].useK2).toBe(true); // 절단된 값 행에서도 수식분기 생존
  });

  test('getSingleSets 헤더 0행 — 레거시 GAS quirk 박제 (hdrRow===0 → 2 강제)', () => {
    // 라이브 GAS 는 hdrRow 초기값 0 + `if (hdrRow === 0) hdrRow = 2` 로
    // 헤더가 0행에 있으면 2행을 헤더로 오인한다. 충실 복원 = 동일 quirk 유지.
    code.cacheRemoveJSON_('SS_FIX_V16');
    const header = ['품명', '평형', '모델명', '단위', '비고', '출고가', '납품가', '납품가'];
    const values = [
      header,
      ['세트A', '18', 'AR060', 'SET', '', '3,000,000', '2,000,000', '2,200,000'],
      ['세트B', '13', 'AR040', 'SET', '', '2,500,000', '1,800,000', '1,900,000'],
      ['세트C', '15', 'AR050', 'SET', '', '2,000,000', '1,500,000', '1,600,000'],
    ];
    shim.injectSheet(SHEET_ID, SINGLE_NAME, values);

    const out = code.getSingleSets();
    // hdrRow 가 2(데이터 행)로 강제 → 컬럼 헤더 미발견 → 전 행 skip = 빈 결과.
    // 라이브 GAS 와 동일한 quirk (실 시트는 헤더가 2행 이후라 미발현).
    expect(out).toHaveLength(0);
  });

  test('getOldProducts_ isDisc — F열 수식 $I$1 참조 감지', () => {
    const values = [
      ['품명', '모델', '단위', '출고가', '', '납품가', '', '적요', '규격'],
      ['구형A', 'OLD1', 'EA', 1000000, '', 700000, '', '구형할인', '규격A'],
      ['구형B', 'OLD2', 'EA', 900000, '', 650000, '', '', ''],
    ];
    const formulas = [
      values[0].map(() => ''),
      ['', '', '', '', '', '=D2*$I$1', '', '', ''],
      values[0].map(() => ''),
    ];
    shim.injectSheet(SHEET_ID, '구형', values, formulas);

    const out = code.getOldProducts_();
    expect(out).toHaveLength(2);
    expect(out[0].isDisc).toBe(true);
    expect(out[0].price).toBe(1000000);
    expect(out[0].sheetPrice).toBe(700000);
    expect(out[1].isDisc).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * 4. getSpecDetailMap_ — scanHome / scanSingle / scanComm (비ERV + ERV)
 * ═══════════════════════════════════════════════════════════════════════ */
describe('getSpecDetailMap_ — 라이브 3-scan verbatim', () => {
  // product-service EstimateCatalogInternalController *_SPEC_FIELDS 는 이 필드셋의 거울이다.
  // getSpecDetailMap_ 출력 필드명을 바꾸면 BE reshape 필드셋도 함께 갱신해야 한다.
  const HOME_SPEC_FIELDS = [
    'pipeDia', 'gas', 'breaker', 'powerLine', 'size', 'weight', 'packSize', 'packWeight',
    'maxPipe', 'maxDrop', 'cool_kcal', 'cool_kw', 'cool_power', 'effGrade',
    'cool_cap_kcal', 'cool_cap_kw', 'cool_pow_kw', 'grade',
  ];
  const SINGLE_SPEC_FIELDS = [
    'grade', 'pipeDia', 'cool_pow_kw', 'heat_pow_kw', 'cool_cap_kw', 'heat_cap_kw',
    'cool_cap_kcal', 'heat_cap_kcal', 'powerLine', 'breaker', 'inSize', 'outSize',
    'inWeight', 'outWeight', 'inPackSize', 'outPackSize', 'inPackWeight', 'outPackWeight',
    'pipeLen', 'drop', 'gas',
  ];
  const COMM_SPEC_FIELDS = [
    'pipeDia', 'gas', 'cool_cap_kcal', 'cool_cap_kw', 'heat_cap_kcal', 'heat_cap_kw',
    'cool_pow_kw', 'heat_pow_kw', 'breaker', 'powerLine', 'size', 'weight',
    'packSize', 'packWeight', 'grade', 'maxPipe', 'maxDrop',
  ];
  const COMM_ERV_SPEC_FIELDS = [
    'gas', 'cool_kcal', 'cool_power', 'heat_kcal', 'heat_power', 'pipeDia',
    'cool_kw', 'heat_kw', 'cool_cap_kcal', 'cool_cap_kw', 'heat_cap_kcal',
    'heat_cap_kw', 'cool_pow_kw', 'heat_pow_kw', 'breaker', 'powerLine',
    'size', 'weight', 'packSize', 'packWeight', 'grade', 'maxPipe', 'maxDrop',
  ];

  function injectHome() {
    const header = ['모델명', '배관경', '냉매가스', '차단기', '전원선', '제품크기', '제품중량',
      '포장치수', '포장중량', '최대장배관', '최대고저차', '냉방성능(정격) kW', '냉방성능(정격) kcal',
      '소비전력(정격)', '에너지소비효율'];
    const values = [
      header,
      ['AM022', 'Φ6.35', 'R32', '15A', '2.5sq', '820x300', '10kg', '900x350', '12kg', '30m', '15m',
        '2.2', '1,892', '0.65', '1등급'],
    ];
    shim.injectSheet(SHEET_ID, HOME_NAME, values);
  }

  function injectSingle() {
    const header = ['모델명', '등급(냉방/난방)', '배관경', '소비전력(kW)(최소/정격/최대)',
      '성능(kW)(최소/정격/최대)', '성능(kcal/h)(최소/정격/최대)', '전원(mm²)/차단(A)',
      '실내기크기(mm)', '실외기크기(mm)', '실내기중량(kg)', '실외기중량(kg)',
      '실내기포장(mm)', '실외기포장(mm)', '실내기포장중량(kg)', '실외기포장중량(kg)',
      '배관길이/고낙차(m)', '냉매가스'];
    const values = [
      header,
      ['AR060', '1등급/2등급', 'Φ9.52', '0.5/1.8/2.5 | 0.4/1.6/2.2', '2.0/6.0/7.0 | 1.8/5.5/6.5',
        '1720/5160/6020 | 1548/4730/5590', '2.5 / 20', '1100x300', '900x800', '14', '45',
        '1200x350', '950x850', '16', '48', '30 / 15', 'R32'],
    ];
    shim.injectSheet(SHEET_ID, SINGLE_NAME, values);
  }

  test('scanHome — 냉방성능 2컬럼 + 포장/최대장배관/고저차 + 효율등급', () => {
    code.cacheRemoveJSON_('SPEC_DETAIL_MAP_V10');
    injectHome();
    injectSingle();
    shim.injectSheet(SHEET_ID, COMM_NAME, [[]]);

    const map = code.getSpecDetailMap_();
    const h = map.AM022.home;
    expect(Object.keys(h)).toEqual(HOME_SPEC_FIELDS);
    expect(h.pipeDia).toBe('Φ6.35');
    expect(h.gas).toBe('R32');
    expect(h.cool_kw).toBe('2.2');
    expect(h.cool_kcal).toBe('1,892');
    expect(h.cool_power).toBe('0.65');
    expect(h.effGrade).toBe('1등급');
    expect(h.grade).toBe('1등급');
    expect(h.packSize).toBe('900x350');
    expect(h.packWeight).toBe('12kg');
    expect(h.maxPipe).toBe('30m');
    expect(h.maxDrop).toBe('15m');
  });

  test('scanSingle — splitBar(냉|난방) + splitSlash(전원/차단, 배관길이/고낙차)', () => {
    code.cacheRemoveJSON_('SPEC_DETAIL_MAP_V10');
    injectHome();
    injectSingle();
    shim.injectSheet(SHEET_ID, COMM_NAME, [[]]);

    const map = code.getSpecDetailMap_();
    const s = map.AR060.single;
    expect(Object.keys(s)).toEqual(SINGLE_SPEC_FIELDS);
    expect(s.grade).toBe('1등급/2등급');
    expect(s.cool_pow_kw).toBe('0.5/1.8/2.5');
    expect(s.heat_pow_kw).toBe('0.4/1.6/2.2');
    expect(s.cool_cap_kw).toBe('2.0/6.0/7.0');
    expect(s.heat_cap_kcal).toBe('1548/4730/5590');
    expect(s.powerLine).toBe('2.5');
    expect(s.breaker).toBe('20');
    expect(s.pipeLen).toBe('30');
    expect(s.drop).toBe('15');
    expect(s.inPackSize).toBe('1200x350');
    expect(s.outWeight).toBe('45');
  });

  test('scanComm 비ERV — 냉난방 kcal/kW + 소비전력 냉/난방 분리', () => {
    code.cacheRemoveJSON_('SPEC_DETAIL_MAP_V10');
    injectHome();
    injectSingle();
    const header = ['모델명', '배관경', '냉매가스', '냉방성능(kcal/h)', '냉방성능(kW)',
      '소비전력(냉방)', '소비전력(난방)', '난방성능(kcal/h)', '난방성능(kW)',
      '차단기', '전원선', '제품크기', '제품중량', '포장치수', '포장중량', '소비효율등급',
      '최대장배관', '최대고저차'];
    const values = [
      header,
      ['AM100AXVGH', 'Φ19.05', 'R410A', '24,080', '28.0', '7.5', '8.2', '27,520', '32.0',
        '60A', '10sq', '1295x1805', '230kg', '1350x1900', '245kg', '3등급', '200m', '110m'],
    ];
    shim.injectSheet(SHEET_ID, COMM_NAME, values);

    const map = code.getSpecDetailMap_();
    const c = map.AM100AXVGH.comm;
    expect(Object.keys(c)).toEqual(COMM_SPEC_FIELDS);
    expect(c.cool_cap_kcal).toBe('24,080');
    expect(c.cool_cap_kw).toBe('28.0');
    expect(c.heat_cap_kcal).toBe('27,520');
    expect(c.heat_cap_kw).toBe('32.0');
    expect(c.cool_pow_kw).toBe('7.5');
    expect(c.heat_pow_kw).toBe('8.2');
    expect(c.grade).toBe('3등급');
    expect(c.maxPipe).toBe('200m');
    expect(c.maxDrop).toBe('110m');
  });

  test('scanComm ERV layout2 — 그룹 2/1/2/1 감지 + joinCols + 덕트구경→gas', () => {
    code.cacheRemoveJSON_('SPEC_DETAIL_MAP_V10');
    injectHome();
    injectSingle();
    // 그룹 시퀀스: 냉방성능 2연속 → (단절) 소비전력 1 → (단절) 난방성능 2연속 → (단절) 소비전력 1
    const header = ['모델명', '덕트구경', '냉방성능(kcal/h)', '냉방성능(kW)', '소비전력(냉방)',
      '난방성능(kcal/h)', '난방성능(kW)', '소비전력(난방)', '차단기', '전원선',
      '제품크기', '제품중량', '포장치수', '포장중량', '소비효율등급'];
    const values = [
      header,
      ['ERV800', 'Φ250', '688', '0.8', '0.25', '602', '0.7', '0.22', '15A', '2.5sq',
        '1000x270', '32kg', '1100x300', '35kg', ''],
    ];
    shim.injectSheet(SHEET_ID, COMM_NAME, values);

    const map = code.getSpecDetailMap_();
    const c = map.ERV800.comm;
    // ERV layout: gas ← 덕트구경, joinCols 로 합쳐진 성능 문자열
    expect(Object.keys(c)).toEqual(COMM_ERV_SPEC_FIELDS);
    expect(c.gas).toBe('Φ250');
    expect(c.cool_kcal).toBe('688 / 0.8');
    expect(c.cool_power).toBe('0.25');
    expect(c.heat_kcal).toBe('602 / 0.7');
    expect(c.heat_power).toBe('0.22');
    expect(c.pipeDia).toBe('');
    expect(c.cool_cap_kcal).toBe('');
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * 5. 표시명/라벨 helper — 라이브 동작
 * ═══════════════════════════════════════════════════════════════════════ */
describe('표시명/라벨 helper — 라이브 verbatim', () => {
  test('sanitizeKoreanParen_ — 한글 없는 괄호류만 제거', () => {
    expect(code.sanitizeKoreanParen_('무풍 갤러리 (스탠드형)')).toBe('무풍 갤러리 (스탠드형)');
    expect(code.sanitizeKoreanParen_('AR060 (AR-060X)')).toBe('AR060 ');
    expect(code.sanitizeKoreanParen_('모델 [V2] {한글}')).toBe('모델  {한글}');
  });

  test('trimSymbols_ — 기호 → 공백 정규화', () => {
    expect(code.trimSymbols_('무풍/갤러리_세트')).toBe('무풍 갤러리 세트');
    expect(code.trimSymbols_('  a,,b  ')).toBe('a b');
  });

  test('formatWonDiscountLabel_ — -N만N천 축약', () => {
    expect(code.formatWonDiscountLabel_(35000)).toBe('-3만5천');
    expect(code.formatWonDiscountLabel_(30000)).toBe('-3만');
    expect(code.formatWonDiscountLabel_(5000)).toBe('-5천');
    expect(code.formatWonDiscountLabel_(0)).toBe('');
  });

  test('formatPercentLabel_ — N%', () => {
    expect(code.formatPercentLabel_(0.45)).toBe('45%');
    expect(code.formatPercentLabel_(0.5)).toBe('50%');
    expect(code.formatPercentLabel_('abc')).toBe('');
  });

  test('extractRowsFromFormula_ — 싱글 세트 참조 행 추출', () => {
    expect(code.extractRowsFromFormula_("='싱글 세트'!$G$12+'싱글 세트_단가인상'!$G$34")).toEqual([12, 34]);
    expect(code.extractRowsFromFormula_('')).toEqual([]);
  });

  test('normalizeTel_ — 010 dash 포맷', () => {
    expect(code.normalizeTel_('01012345678')).toBe('010-1234-5678');
    expect(code.normalizeTel_('0101234567')).toBe('010-123-4567');
    expect(code.normalizeTel_('021234567')).toBe('021234567');
  });

  test('isBlockedByNote_ — 공백 제거 후 판정', () => {
    expect(code.isBlockedByNote_('미 판 매')).toBe(true);
    expect(code.isBlockedByNote_('단 종')).toBe(true);
    expect(code.isBlockedByNote_('')).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * 6. initDcConfigFromNotion — 라이브 merge 시맨틱 (null/0 오염 방지)
 * ═══════════════════════════════════════════════════════════════════════ */
describe('initDcConfigFromNotion — 필드별 가드 merge', () => {
  test('비유효 사업자번호 → flat default', async () => {
    const cfg = await code.initDcConfigFromNotion('123');
    expect(cfg.homeDiscount).toBe(0.45);
    expect(cfg.commDiscount).toBe(0.45);
    expect(cfg.customer).toBeUndefined();
  });

  test('endpoint null 응답 → default 유지 (0/null 오염 없음)', async () => {
    const cfg = await code.initDcConfigFromNotion('123-45-67890');
    expect(cfg.homeDiscount).toBe(0.45);
    expect(cfg.unitRoundMode).toBe('ROUND');
  });

  test('#29 dc-config-service by-bizno — DcConfigResponse → legacy flat 매핑 + 가드 merge', async () => {
    const cfg = await code.initDcConfigFromNotion('987-65-43210');
    expect(cfg.homeDiscount).toBe(0.46);
    expect(cfg.commDiscount).toBe(0.47);
    expect(cfg.showIHose).toBe(true);
    expect(cfg.discount360).toBe(20000);
    expect(cfg.discount4way).toBe(25000);
    expect(cfg.oneWayDiscount).toBe(30000); // discount1WayAmount → oneWayDiscount
    expect(cfg.discountStand).toBe(10000);
    expect(cfg.deluxeDiscount).toBe(0); // null → 가드로 default(0) 유지
    expect(cfg.firstGradeDiscount).toBe(0); // 0 도 number 라 override (legacy 시맨틱)
    expect(cfg.unitRoundTo).toBe(100);
    expect(cfg.unitRoundMode).toBe('ROUND');
  });

  test('#29 dcConfig null (DC 미설정 거래처) → default 유지', async () => {
    const cfg = await code.initDcConfigFromNotion('555-55-55555');
    expect(cfg.homeDiscount).toBe(0.45);
    expect(cfg.commDiscount).toBe(0.45);
    expect(cfg.unitRoundTo).toBe(0);
  });

  test('할인율 조회 404 → 임의 기본값 없이 미확정 상태로 반환', async () => {
    const cfg = await code.initDcConfigFromNotion('404-40-40440');
    expect(cfg.dcConfigUnavailable).toBe(true);
    expect(cfg.dcConfigError).toEqual(expect.objectContaining({ status: 404 }));
    expect(cfg.homeDiscount).toBeNull();
    expect(cfg.commDiscount).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * 7. #31 라이브 신규 — DC 벌크 / 거래처 dc 부착 / by-customer / 주소검색 파서
 * ═══════════════════════════════════════════════════════════════════════ */
describe('#31 getAllNotionDcConfigs_ / getCustomerDataAsync dc 부착', () => {
  test('벌크 → legacy flat 맵 {partnerCode: dc} + 캐시', async () => {
    code.cacheRemoveJSON_('NOTION_DC_MAP_V1');
    const map = await code.getAllNotionDcConfigs_(true);
    expect(Object.keys(map).sort()).toEqual(['1112223334', '9876543210']);
    expect(map['9876543210'].homeDiscount).toBe(0.46);
    expect(map['9876543210'].discount360).toBe(20000);
    expect(map['9876543210'].showIHose).toBe(true);
    expect(map['9876543210'].unitRoundTo).toBe(100);
    expect(map['1112223334'].commDiscount).toBeNull();
    // 캐시 재사용 (라이브 NOTION_DC_MAP_V1 동일)
    expect(code.cacheGetJSON_('NOTION_DC_MAP_V1')).not.toBeNull();
  });

  test('getCustomerDataAsync — 라이브 verbatim: bizno 우선, 없으면 거래처코드 숫자키 매칭', async () => {
    code.cacheRemoveJSON_('CUS_V6');
    code.cacheRemoveJSON_('NOTION_DC_MAP_V1');
    const fetchPartnersSpy = jest.spyOn(directory, 'fetchPartners').mockResolvedValue([
      { code: 'C-001', name: 'DC있는거래처', bizno: '9876543210', manager: '', managerTel: '', rep: '', addr: '', tel: '', note: '', group: '', singleDiscount: 0 },
      { code: '1112223334', name: '코드키거래처', bizno: '', manager: '', managerTel: '', rep: '', addr: '', tel: '', note: '', group: '', singleDiscount: 0 },
      { code: 'C-003', name: 'DC없는거래처', bizno: '1231212345', manager: '', managerTel: '', rep: '', addr: '', tel: '', note: '', group: '', singleDiscount: 0 },
    ]);

    try {
      const out = await code.getCustomerDataAsync(true);
      expect(out).toHaveLength(3);
      expect(out[0].dc.homeDiscount).toBe(0.46); // bizno 매칭
      expect(out[1].dc.homeDiscount).toBe(0.5); // 거래처코드 숫자키 매칭
      expect(out[2].dc).toEqual(expect.objectContaining({ dcConfigUnavailable: true })); // 미등록 → 미확정
      expect(out[0].bizno).toBe('9876543210');
    } finally {
      fetchPartnersSpy.mockRestore();
    }
  });

  test('벌크 DC 응답에 거래처가 없으면 기본 45%가 아닌 미확정 상태로 반환', async () => {
    const fetchPartnersSpy = jest.spyOn(directory, 'fetchPartners').mockResolvedValue([
      { code: 'C-404', name: 'DC누락거래처', bizno: '4044040440', manager: '', managerTel: '', rep: '', addr: '', tel: '', note: '', group: '', singleDiscount: 0 },
    ]);
    axios.get.mockImplementationOnce(async () => ({
      status: 200,
      data: { success: true, data: [] },
    }));

    try {
      const customers = await code.getCustomerDataAsync(true);
      expect(customers[0].dc).toEqual(expect.objectContaining({
        dcConfigUnavailable: true,
      }));
      expect(customers[0].dc.homeDiscount).toBeNull();
      expect(customers[0].dc.commDiscount).toBeNull();
    } finally {
      fetchPartnersSpy.mockRestore();
    }
  });
});

describe('#31 getQuoteHistoryByCustomer', () => {
  test('by-customer endpoint 봉투 언래핑 + 배열 반환', async () => {
    const rows = await code.getQuoteHistoryByCustomer('삼한');
    expect(rows).toHaveLength(1);
    expect(rows[0].custName).toBe('삼한공조');
    expect(rows[0].data).toBe('YmxvYg==');
  });
});

describe('#31 주소검색 파서 — 라이브 verbatim', () => {
  const wrap = (code200, body) => ({
    getResponseCode: () => code200,
    getContentText: () => JSON.stringify(body),
  });

  test('parseJusoResponse_ — 건물명 정리 + 지번 끝 건물명 제거', () => {
    const res = wrap(200, {
      results: { juso: [{ roadAddrPart1: '서울 강남구 테헤란로 1 (역삼동)', jibunAddr: '서울 강남구 역삼동 1-1 삼한빌딩', bdNm: '삼한빌딩, 역삼동' }] },
    });
    const out = code.parseJusoResponse_(res);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('juso');
    expect(out[0].title).toBe('삼한빌딩'); // 콤마 분리 후 '역삼동'(동 토큰) 제외
    expect(out[0].roadAddress).toBe('서울 강남구 테헤란로 1 역삼동');
    expect(out[0].address).toBe('서울 강남구 역삼동 1-1'); // 끝 건물명 제거
  });

  test('parseNaverLocalResponse_ — HTML 태그 strip', () => {
    const res = wrap(200, { items: [{ title: '<b>삼한</b>공조', category: '에어컨', address: '지번A', roadAddress: '도로A' }] });
    const out = code.parseNaverLocalResponse_(res);
    expect(out[0].title).toBe('삼한공조');
    expect(out[0].source).toBe('local');
  });

  test('parseNaverGeocodeResponse_ — BUILDING_NAME 추출 + 주소 끝 건물명 제거', () => {
    const res = wrap(200, {
      status: 'OK',
      addresses: [{
        roadAddress: '서울 송파구 올림픽로 1 한빛타워',
        jibunAddress: '서울 송파구 방이동 2-2 한빛타워',
        addressElements: [{ types: ['BUILDING_NAME'], longName: '한빛타워' }],
      }],
    });
    const out = code.parseNaverGeocodeResponse_(res);
    expect(out[0].title).toBe('한빛타워');
    expect(out[0].roadAddress).toBe('서울 송파구 올림픽로 1');
    expect(out[0].address).toBe('서울 송파구 방이동 2-2');
  });

  test('비200/비OK 응답 → 빈 배열 graceful', () => {
    expect(code.parseJusoResponse_(wrap(500, {}))).toEqual([]);
    expect(code.parseNaverGeocodeResponse_(wrap(200, { status: 'INVALID_REQUEST' }))).toEqual([]);
    expect(code.parseNaverLocalResponse_(null)).toEqual([]);
  });

  test('cleanBdNm_ / stripTrailingName_ / escapeRegex_', () => {
    expect(code.cleanBdNm_('(주)타워, 신천동')).toBe('주타워');
    expect(code.stripTrailingName_('서울 어딘가 1-1 별관(A)', '별관(A)')).toBe('서울 어딘가 1-1');
    expect(code.escapeRegex_('a+b(c)')).toBe('a\\+b\\(c\\)');
  });

  test('searchNaverAddress — 키 전무 시 자격 미설정 graceful', async () => {
    // 테스트 env 에는 NAVER/JUSO 키 미설정 → 요청 0건 경로
    const r = await code.searchNaverAddress('테헤란로');
    expect(r.ok).toBe(false);
    expect(r.items).toEqual([]);
  });
});
