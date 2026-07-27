'use strict';

/*
 * 가격을 포함하지 않는 모델 참조 fixture다.
 * 모델 코드는 정본 파일의 상수/PUMP_MAP/PANEL_MODELS 또는 저장소의
 * 레거시 라벨 fixture에서만 가져왔다. 가격·재고·새 품목명은 만들지 않는다.
 */

const h = (model, name, extra = {}) => ({ model, name, unit: 'EA', ...extra });
const s = (id, model, name, extra = {}) => ({ id, model, name, unit: 'SET', ...extra });
const c = (model, name, extra = {}) => ({ model, name, unit: 'EA', ...extra });

const homeCatalog = [
  h('AM016BN1PBH2', '실내기 1WAY WIFI 소형'),
  h('AM020BN1PBH1', '실내기 1WAY WIFI 중형'),
  h('AM060BN1PBH1', '실내기 1WAY WIFI 대형'),
  h('AM052BN4DBH1', '실내기 4WAY WIFI'),
  h('AM083BN6PBH1', '실내기 360 CST WIFI'),
  h('AJ020CN1UBC1', '실내기 1WAY 인피니트 중형'),
  h('AJ060CN1UBC1', '실내기 1WAY 인피니트 대형'),
  h('HOME-AIRCOMBO', '에어콤보'),
  h('AJ060MXHNBC1', '실외기 6HP 단배관'),
  h('AJ040MXHNBC1', '실외기 4HP 단배관'),
  h('FH-LFHLF', '유연호스 L형 1WAY'),
  h('FH-LFHIF', '유연호스 I형 1WAY'),
  h('발통세트', '원형발통 세트'),
  h('SI-AL700a', '일자발 SI-AL700a'),
  h('AR-EC05', 'AR-EC05 무선리모컨'),
  h('AR-KH05', 'AR-KH05 무선 360'),
  h('AR-CH01', 'AR-CH01 무선 인피니트'),
  h('AWR-WE13N', 'AWR-WE13N 유선리모컨'),
  h('AWR-WG00N', 'AWR-WG00N 컬러 유선리모컨'),
  h('AIM-A01N', 'AIM-A01N 유선리모컨 키트'),
  h('PC1MWSK3NW', 'PC1MWSK3NW 소형 WIFI판넬'),
  h('PC1NWSK3NW', 'PC1NWSK3NW WIFI판넬'),
  h('PC1BWSK3NW', 'PC1BWSK3NW WIFI판넬'),
  h('PC1MWSK3N', 'PC1MWSK3N 미내장 판넬'),
  h('PC1NWSK3N', 'PC1NWSK3N 미내장 판넬'),
  h('PC1BWSK3N', 'PC1BWSK3N 미내장 판넬'),
  h('PC1MWCK3NW', 'PC1MWCK3NW 공기청정 판넬'),
  h('PC1NWCK3NW', 'PC1NWCK3NW 공기청정 판넬'),
  h('PC1BWCK3NW', 'PC1BWCK3NW 공기청정 판넬'),
  h('PC1MWCK3N', 'PC1MWCK3N 공기청정 미내장 판넬'),
  h('PC1NWCK3N', 'PC1NWCK3N 공기청정 미내장 판넬'),
  h('PC1BWCK3N', 'PC1BWCK3N 공기청정 미내장 판넬'),
  h('PC1YNWK1NW', 'PC1YNWK1NW 인피니트 판넬'),
  h('PC1YNRK1NW', 'PC1YNRK1NW 인피니트 AI 판넬'),
  h('PC1YNCK1NW', 'PC1YNCK1NW 인피니트 공청 판넬'),
  h('PC1ZNSK1NW', 'PC1ZNSK1NW 인피니트 대형 판넬'),
  h('PC1ZNWK1NW', 'PC1ZNWK1NW 인피니트 25년형 판넬'),
  h('PC1ZNRK1NW', 'PC1ZNRK1NW 인피니트 대형 AI 판넬'),
  h('PC1ZNCK1NW', 'PC1ZNCK1NW 인피니트 대형 공청 판넬'),
  h('PC4NUFK1NW', 'PC4NUFK1NW WIFI 4WAY 판넬'),
  h('PC4NUCK4NW', 'PC4NUCK4NW 공기청정 4WAY 판넬'),
  h('PC2NWSK1N', 'PC2NWSK1N 2WAY 판넬'),
  h('PC6NUDK1NW', 'PC6NUDK1NW 360 WIFI 판넬'),
  h('PC6NUCK1NW', 'PC6NUCK1NW 공기청정 360 판넬'),
  h('AXJ-YA2512N', 'AXJ-YA2512N N-분기관'),
  h('AXJ-YA1509N', 'AXJ-YA1509N N-분기관'),
];

const singleCatalog = [
  s('set-round-source', 'AP110RNPPBH1', '싱글 1WAY 세트', { catL: '싱글', components: [{ model: 'AR-EC05', name: '무선리모컨' }] }),
  s('set-flat-source', 'AP230DAPDHH1S', '싱글 스탠드 세트', { catL: '싱글' }),
  s('set-ceiling-source', 'ADP-F075SP', '실링 싱글 세트', { catL: '부자재' }),
  s('set-round-target', '발통세트', '발통세트'),
  s('set-flat-target', 'SI-AL700a', 'SI-AL700a'),
  s('set-1way-source', 'SINGLE-1WAY-REAL', '1WAY 싱글 세트', { catL: '싱글', components: [{ model: 'AR-EH05', name: '무선리모컨' }] }),
];

const commercialCatalog = [
  c('AM052DNLDBH1', '실내기 1WAY WIFI 내장 소형'),
  c('AM072DNMDBH1', '실내기 1WAY WIFI 내장 중형'),
  c('AM083DNMDBH1', '실내기 4WAY WIFI 내장'),
  c('AM100DNMDBH1', '실내기 360 WIFI 내장'),
  c('AM130ANHDBH1', '실내기 덕트'),
  c('AM120AXVHHH1', '실외기 S2 프라임 (8HP)'),
  c('AM140AXVGHH1', '실외기 S2 표준형 (12HP)'),
  c('AM180AXVGHH1', '실외기 가스히트펌프 GHP (8HP)'),
  c('AM035FXMRHC1', '실외기 리뉴얼 필터 대상'),
  c('AM050MXMRBC1', '실외기 리뉴얼 필터 대상'),
  c('AM075FXMRHC1', '실외기 리뉴얼 필터 대상'),
  c('AM072TNCDBH1', '실내기 펌프 대상'),
  c('AM052ANHDBH1', '실내기 펌프 대상'),
  c('AM140AXVGHH1-SET', '실외기 세트 (8HP+12HP)', { model: 'AM140AXVGHH1', unit: 'SET' }),
  c('FH-LFHLF', '유연호스 L형 1WAY'),
  c('FH-LFHIF', '유연호스 I형 1WAY'),
  c('AR-EH05', 'AR-EH05 무선 냉난방'),
  c('AR-CH01', 'AR-CH01 무선 인피니트'),
  c('AWR-VH12N', 'AWR-VH12N ERV 유선리모컨'),
  c('AWR-WE13N', 'AWR-WE13N 유선리모컨'),
  c('AWR-WG00N', 'AWR-WG00N 컬러 유선리모컨'),
  c('MDP-Z075SZED', 'MDP-Z075SZED 드레인펌프'),
  c('ADP-E075SEK3D', 'ADP-E075SEK3D 드레인펌프'),
  c('ADP-M075SGK2D', 'ADP-M075SGK2D 드레인펌프'),
  c('ADP-G075SPK1D', 'ADP-G075SPK1D 드레인펌프'),
  c('ADP-N047SNK1D', 'ADP-N047SNK1D 드레인펌프'),
  c('ADP-F075SP', 'ADP-F075SP 실링용 드레인펌프'),
  c('PC1MWSK3NW', 'PC1MWSK3NW WIFI 판넬'),
  c('PC1NWSK3NW', 'PC1NWSK3NW WIFI 판넬'),
  c('PC1BWSK3NW', 'PC1BWSK3NW WIFI 판넬'),
  c('PC2NWSK1N', 'PC2NWSK1N 2WAY 판넬'),
  c('PC4NUFK1NW', 'PC4NUFK1NW WIFI 4WAY 판넬'),
  c('PC4NUCK4NW', 'PC4NUCK4NW 공기청정 4WAY 판넬'),
  c('PC6NUDK1NW', 'PC6NUDK1NW 360 WIFI 판넬'),
  c('PC6NUCK1NW', 'PC6NUCK1NW 공기청정 360 판넬'),
  // 옵션 분기의 target은 정본의 모델 행렬에 있는 모델 코드만 참조한다.
  c('PC4NBFK1NW', 'PC4NBFK1NW 블랙 WIFI 4WAY 판넬'),
  c('PC4NUXK1NW', 'PC4NUXK1NW 승강 WIFI 4WAY 판넬'),
  c('PC4NBDK1NW', 'PC4NBDK1NW 블랙 사각 4WAY 판넬'),
  c('PC4NUXK1N', 'PC4NUXK1N 승강 4WAY 판넬'),
  c('PC6NUNK1NW', 'PC6NUNK1NW 360 원형 WIFI 판넬'),
  c('PC6NBNK1NW', 'PC6NBNK1NW 360 원형 블랙 판넬'),
  c('PC6EUCK1NW', 'PC6EUCK1NW 360 원형 공청 판넬'),
  c('PC6EUXK1NW', 'PC6EUXK1NW 360 원형 승강 판넬'),
  c('PC6NBDK1NW', 'PC6NBDK1NW 360 사각 블랙 판넬'),
  c('PC6NUXK1NW', 'PC6NUXK1NW 360 사각 승강 판넬'),
  c('SI-AL600a', 'SI-AL600a 방진가대'),
  c('SI-AL700a', 'SI-AL700a 방진가대'),
  c('방진가대S2소', '방진가대S2소'),
  c('방진가대S2중', '방진가대S2중'),
  c('방진가대S2대', '방진가대S2대'),
  c('GHP방진가대', 'GHP방진가대'),
  c('ACL-KORGHP07', 'ACL-KORGHP07'),
  c('AF-R09A', 'AF-R09A 리뉴얼 필터'),
  c('AF-R12A', 'AF-R12A 리뉴얼 필터'),
  c('AXJ-TA3419M', 'AXJ-TA3419M T형 분기관'),
];

const baseHome = {
  home: homeCatalog,
  single: singleCatalog,
  commercial: commercialCatalog,
  priceSnapshot: null,
};

const commonHomeTargets = {
  hose1w: 'FH-LFHLF', hose4w: 'FH-LFHLF', hoseI1w: 'FH-LFHIF', hoseI4w: 'FH-LFHIF',
  footRound: '발통세트', footFlat: 'SI-AL700a',
  remoteWired: 'AWR-WE13N', remoteWiredColor: 'AWR-WG00N', remoteWiredKit: 'AIM-A01N',
  remoteWireless: 'AR-EC05', remoteInfDefault: 'AR-CH01', remoteColorAircombo: '',
  branch2512: 'AXJ-YA2512N', branch1509: 'AXJ-YA1509N', model6HpSingle: 'AJ060MXHNBC1',
};

function homeCase(family, sourceQuantities, options = {}, targets = {}, manualLocks = {}) {
  return {
    family,
    catalog: baseHome,
    sourceQuantities,
    options: { dom: { '#home_panel': '기본', '#home_remote': '기본', ...options }, ...options },
    targets: { ...commonHomeTargets, ...targets },
    manualLocks: { home: manualLocks },
    expected: null,
  };
}

const fixtures = [
  homeCase('H-01', { 'AM020BN1PBH1': 2, 'AM052BN4DBH1': 1, 'AM083BN6PBH1': 1 }),
  homeCase('H-02', { 'AM052BN4DBH1': 2, 'AM083BN6PBH1': 3 }),
  homeCase('H-03', { 'AM016BN1PBH2': 1, 'AM020BN1PBH1': 2, 'AM060BN1PBH1': 3 }),
  homeCase('H-04', { 'AJ020CN1UBC1': 2, 'AJ060CN1UBC1': 1, 'AM052BN4DBH1': 1 }, { '#home_panel': '공청판넬' }),
  homeCase('H-05', { 'AM083BN6PBH1': 2, 'AJ020CN1UBC1': 1, 'AM020BN1PBH1': 3, 'AM052BN4DBH1': 2 }),
  homeCase('H-06', { 'AM020BN1PBH1': 2 }, { '#home_remote': '유선' }),
  homeCase('H-07', { 'HOME-AIRCOMBO': 1, 'AM020BN1PBH1': 1, 'AJ040MXHNBC1': 1 }),
  homeCase('H-08', { 'AJ060MXHNBC1': 2 }, { '#home_foot': true, '#home_no_branch': true }),
  { family: 'S-01', catalog: baseHome, sourceQuantities: { 'set-round-source': 2, 'set-flat-source': 1 }, options: { dom: { '#ss_base': true } }, targets: { footRoundId: 'set-round-target', footFlatId: 'set-flat-target', wiredBoardId: null, ceilingPumpId: null }, manualLocks: { single: {} }, expected: null },
  { family: 'S-02', catalog: baseHome, sourceQuantities: { 'set-1way-source': 3 }, options: { dom: { '#ss_base': false, '#ss_remote_ex': false, '#ss_remote': '유선리모컨' } }, targets: { footRoundId: null, footFlatId: null, wiredBoardId: 'wired-board', ceilingPumpId: null }, manualLocks: { single: {} }, expected: null },
  { family: 'S-03', catalog: baseHome, sourceQuantities: { 'set-ceiling-source': 4 }, options: { dom: { '#ss_base': false } }, targets: { footRoundId: null, footFlatId: null, wiredBoardId: null, ceilingPumpId: 'ceiling-pump' }, manualLocks: { single: {} }, expected: null },
  { family: 'C-01', catalog: baseHome, sourceQuantities: { 'AM052DNLDBH1': 2, 'AM083DNMDBH1': 1 }, options: { dom: { '#comm_panel': '기본판넬', '#comm_p360': '원형' } }, targets: {}, manualLocks: { commercial: {} }, expected: null },
  { family: 'C-02', catalog: baseHome, sourceQuantities: { 'AM052DNLDBH1': 2, 'AM083DNMDBH1': 1, 'AM130ANHDBH1': 1 }, options: { dom: { '#comm_panel': '기본판넬', '#comm_p360': '원형', '#comm_hose_i': false, '#comm_ex_hose': false } }, targets: { hose1w: 'FH-LFHLF', hose4w: 'FH-LFHLF', hoseI1w: 'FH-LFHIF' }, manualLocks: { commercial: {} }, expected: null },
  { family: 'C-03', catalog: baseHome, sourceQuantities: { 'AM052DNLDBH1': 2 }, options: { dom: { '#comm_remote': '유선', '#comm_panel': '판넬제외', '#comm_ex_hose': true } }, targets: {}, manualLocks: { commercial: {} }, expected: null },
  { family: 'C-04', catalog: baseHome, sourceQuantities: { 'AM052DNLDBH1': 2, 'AM072DNMDBH1': 3 }, options: { dom: { '#comm_panel': '판넬제외', '#comm_remote': '제외', '#comm_ex_hose': true } }, targets: {}, manualLocks: { commercial: {} }, expected: null },
  { family: 'C-05', catalog: baseHome, sourceQuantities: { 'AM120AXVHHH1': 1 }, options: { dom: { '#comm_panel': '판넬제외', '#comm_remote': '제외', '#comm_ex_hose': true } }, targets: {}, manualLocks: { commercial: {} }, expected: null },
  { family: 'C-06', catalog: baseHome, sourceQuantities: { 'AM140AXVGHH1': 1 }, options: { dom: { '#comm_panel': '판넬제외', '#comm_remote': '제외', '#comm_ex_hose': true } }, targets: {}, manualLocks: { commercial: {} }, expected: null },
  { family: 'C-07', catalog: baseHome, sourceQuantities: { 'AM035FXMRHC1': 2, 'AM075FXMRHC1': 1 }, options: { dom: { '#comm_panel': '판넬제외', '#comm_remote': '제외', '#comm_ex_hose': true } }, targets: {}, manualLocks: { commercial: {} }, expected: null },
  { family: 'C-08', catalog: baseHome, sourceQuantities: { 'AM180AXVGHH1': 2 }, options: { dom: { '#comm_panel': '판넬제외', '#comm_remote': '제외', '#comm_ex_hose': true } }, targets: {}, manualLocks: { commercial: {} }, expected: null },
  { family: 'C-09', catalog: baseHome, sourceQuantities: {}, options: { branchSlots: [{ cap: 1000 }, { cap: 500 }], outdoorModel: 'AM120AXVHHH1' }, targets: {}, manualLocks: { commercial: {} }, expected: null },
];

function optionCase(id, family, dom, overrides = {}) {
  const base = fixtures.find((fixture) => fixture.family === family);
  return {
    ...base,
    id,
    options: { ...base.options, dom: { ...(base.options?.dom || {}), ...dom } },
    ...overrides,
  };
}

/* 가족별 기본 golden과 별도로, target이 바뀌거나 파생수량이 0이 되는 옵션 갈래를 모두 실행한다. */
const optionFixtures = [
  optionCase('H-01-I', 'H-01', { '#home_hose_i': true }, { sourceQuantities: { 'AM020BN1PBH1': 2 } }),
  optionCase('H-01-NO-HOSE', 'H-01', { '#home_no_hose': true }),
  optionCase('H-02-NO-PANEL', 'H-02', { '#home_panel': '판넬제외' }),
  optionCase('H-03-AIR-PANEL', 'H-03', { '#home_panel': '공청판넬' }),
  optionCase('H-03-NO-PANEL', 'H-03', { '#home_panel': '판넬제외' }),
  optionCase('H-04-25', 'H-04', { '#home_panel': '인피니트 25년형' }),
  optionCase('H-04-AI', 'H-04', { '#home_panel': '인피니트 공청+동작감지 AI' }),
  optionCase('H-05-WIRED', 'H-05', { '#home_remote': '유선' }),
  optionCase('H-05-COLOR', 'H-05', { '#home_remote': '컬러' }),
  optionCase('H-05-NO-REMOTE', 'H-05', { '#home_remote': '제외' }),
  optionCase('H-06-COLOR', 'H-06', { '#home_remote': '컬러' }),
  optionCase('H-06-NO-REMOTE', 'H-06', { '#home_remote': '제외' }),
  optionCase('H-07-NO-BRANCH', 'H-07', { '#home_no_branch': true }),
  optionCase('H-08-NO-FOOT', 'H-08', { '#home_foot': false }),
  optionCase('S-01-NO-BASE', 'S-01', { '#ss_base': false }),
  optionCase('S-01-FLAT-BASE', 'S-01', { '#ss_base': true }, { sourceQuantities: { 'set-round-source': 0, 'set-flat-source': 2 } }),
  optionCase('S-02-COLOR', 'S-02', { '#ss_remote': '컬러유선리모컨' }),
  optionCase('S-02-NO-REMOTE', 'S-02', { '#ss_remote_ex': true }),
  optionCase('C-01-NO-PANEL', 'C-01', { '#comm_panel': '판넬제외' }),
  optionCase('C-01-BLACK-PANEL', 'C-01', { '#comm_panel': '블랙판넬' }),
  optionCase('C-01-LIFT-PANEL', 'C-01', { '#comm_panel': '승강판넬' }),
  optionCase('C-01-AIR-PANEL', 'C-01', { '#comm_panel': '공청판넬' }),
  optionCase('C-01-CIRCLE-360', 'C-01', { '#comm_p360': '원형' }, { sourceQuantities: { 'AM100DNMDBH1': 1 } }),
  optionCase('C-01-SQUARE-360', 'C-01', { '#comm_p360': '사각' }, { sourceQuantities: { 'AM100DNMDBH1': 1 } }),
  optionCase('C-02-I-HOSE', 'C-02', { '#comm_hose_i': true }, { showIHose: true }),
  optionCase('C-02-NO-HOSE', 'C-02', { '#comm_ex_hose': true }),
  optionCase('C-03-WIRELESS', 'C-03', { '#comm_remote': '무선' }),
  optionCase('C-03-WIRED', 'C-03', { '#comm_remote': '유선' }),
  optionCase('C-03-COLOR', 'C-03', { '#comm_remote': '컬러유선' }),
  optionCase('C-03-NO-REMOTE', 'C-03', { '#comm_remote': '제외' }),
  optionCase('C-05-NO-BASE', 'C-05', { '#comm_ex_base': true }),
  optionCase('C-08-NO-BASE', 'C-08', { '#comm_ex_base': true }),
  optionCase('C-09-1509', 'C-09', {}, { options: { branchSlots: [{ cap: 1000 }, { cap: 200 }], outdoorModel: 'AM120AXVHHH1' } }),
  optionCase('C-09-2512', 'C-09', {}, { options: { branchSlots: [{ cap: 1000 }, { cap: 201 }], outdoorModel: 'AM120AXVHHH1' } }),
  optionCase('C-09-2812', 'C-09', {}, { options: { branchSlots: [{ cap: 1000 }, { cap: 1001 }], outdoorModel: 'AM120AXVHHH1' } }),
  optionCase('C-09-2815', 'C-09', {}, { options: { branchSlots: [{ cap: 1000 }, { cap: 1801 }], outdoorModel: 'AM120AXVHHH1' } }),
  optionCase('C-09-3419', 'C-09', {}, { options: { branchSlots: [{ cap: 1000 }, { cap: 2800 }], outdoorModel: 'AM120AXVHHH1' } }),
  optionCase('C-09-4119', 'C-09', {}, { options: { branchSlots: [{ cap: 1000 }, { cap: 2801 }], outdoorModel: 'AM120AXVHHH1' } }),
];

module.exports = { fixtures, optionFixtures, homeCatalog, singleCatalog, commercialCatalog };
