'use strict';

/*
 * 가격을 포함하지 않는 모델 참조 fixture다.
 * 모델 코드는 정본 파일의 상수/PUMP_MAP/PANEL_MODELS 또는 저장소의
 * 레거시 라벨 fixture에서만 가져왔다. 가격·재고·새 품목명은 만들지 않는다.
 *
 * target 모델(HOSE_*, FOOT_*, REMOTE_*, BRANCH_*, MODEL_6HP_SINGLE, SS_*_ID)은 이 파일이
 * 주입하지 않는다 — legacyQuantityBoundary.js가 정본의 derivationPreambleSource를 그대로
 * 실행해 이 카탈로그에서 도출한다. 이 파일은 오직 카탈로그 snapshot과 원수량·옵션·수동잠금
 * 입력만 선언한다.
 *
 * 'FH-LFHLF4W'/'FH-LFHIF4W'(유연호스 4WAY, L형/I형)와 'wired-board'/'ceiling-pump'
 * (SS_WIRED_BOARD_ID/SS_CEILING_PUMP_ID target row)는 저장소 어디에도 실제 코드가
 * 확인되지 않아 새로 채운 카탈로그 자리다. 정본은 이 두 target 상수가 반드시 존재한다고
 * 가정하고 계산하므로(HOSE_I_4W, SS_WIRED_BOARD_ID 등), 카탈로그에 대응 행이 없으면 그
 * 계산 갈래 자체가 검증되지 않는다. 명명은 저장소에 이미 있는 인접 코드의 규칙을
 * 그대로 따랐다(예: FH-LFHLF의 4WAY 대응 → FH-LFHLF4W). PM 확인 필요.
 */

const h = (model, name, extra = {}) => ({ model, name, unit: 'EA', ...extra });
const s = (id, model, name, extra = {}) => ({ id, model, name, unit: 'SET', ...extra });
const c = (model, name, extra = {}) => ({ model, name, unit: 'EA', ...extra });
const p = (setModel, model, name, extra = {}) => ({ setModel, model, name, kind: '', feat: '', ...extra });

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
  h('FH-LFHLF4W', '유연호스 L형 4WAY'),
  h('FH-LFHIF', '유연호스 I형 1WAY'),
  h('FH-LFHIF4W', '유연호스 I형 4WAY'),
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
  s('set-round-source', 'AP110RNPPBH1', '싱글 1WAY 세트', { catL: '싱글' }),
  s('set-flat-source', 'AP230DAPDHH1S', '싱글 스탠드 세트', { catL: '싱글' }),
  s('set-ceiling-source', 'ADP-F075SP', '실링 싱글 세트', { catL: '부자재' }),
  s('set-round-target', '발통세트', '발통세트'),
  s('set-flat-target', 'SI-AL700a', 'SI-AL700a'),
  s('set-1way-source', 'SINGLE-1WAY-REAL', '1WAY 싱글 세트', { catL: '싱글' }),
  // allowRemoteChange_의 거짓 갈래(D-4)를 실제로 도달시키기 위한 세트 —
  // 기본 리모컨이 AR-CH01(인피니트)이면 정본 정규식(/^(AR-?EH05|AR-?EC05|AR-?KH05)$/i)에
  // 걸리지 않아 유선 변경이 허용되지 않는다.
  s('set-1way-inf-source', 'SINGLE-1WAY-INF-REAL', '1WAY 인피니트 싱글 세트', { catL: '싱글' }),
  // SS_WIRED_BOARD_ID/SS_CEILING_PUMP_ID가 정본 정규식으로 실제 도출되려면 그 정규식에
  // 걸리는 target 행이 카탈로그에 있어야 한다(위 파일 헤더 주석 참조).
  s('wired-board', 'AIM-A01N', '유선보드', { catL: '부자재' }),
  s('ceiling-pump', 'ADP-F075SP', '실링용 드레인펌프', { catL: '부자재' }),
];

// SINGLE_PARTS: 정본이 partsForSetStrict_(s) = SINGLE_PARTS.filter(p => p.setModel === s.model)로
// 참조하는 세트별 구성품 카탈로그. 이전 fixture는 SINGLE_SETS 행에 직접 components 필드를 얹었지만
// 정본은 그 필드를 전혀 읽지 않는다(D-4) — 세트의 model로 SINGLE_PARTS를 필터링할 뿐이다.
const singlePartsCatalog = [
  p('AP110RNPPBH1', 'AR-EC05', '무선리모컨', { kind: '리모컨', feat: '기본' }),
  p('SINGLE-1WAY-REAL', 'AR-EH05', '무선 냉난방 리모컨', { kind: '리모컨', feat: '기본' }),
  p('SINGLE-1WAY-INF-REAL', 'AR-CH01', '무선 인피니트 리모컨', { kind: '리모컨', feat: '기본' }),
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
  c('FH-LFHLF4W', '유연호스 L형 4WAY'),
  c('FH-LFHIF', '유연호스 I형 1WAY'),
  c('FH-LFHIF4W', '유연호스 I형 4WAY'),
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
  singleParts: singlePartsCatalog,
  commercial: commercialCatalog,
  priceSnapshot: null,
};

function homeCase(family, sourceQuantities, options = {}, manualLocks = {}) {
  return {
    family,
    catalog: baseHome,
    sourceQuantities,
    options: { dom: { '#home_panel': '기본', '#home_remote': '기본', ...options }, ...options },
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
  { family: 'S-01', catalog: baseHome, sourceQuantities: { 'set-round-source': 2, 'set-flat-source': 1 }, options: { dom: { '#ss_base': true } }, manualLocks: { single: {} }, expected: null },
  { family: 'S-02', catalog: baseHome, sourceQuantities: { 'set-1way-source': 3 }, options: { dom: { '#ss_base': false, '#ss_remote_ex': false, '#ss_remote': '유선리모컨' } }, manualLocks: { single: {} }, expected: null },
  { family: 'S-03', catalog: baseHome, sourceQuantities: { 'set-ceiling-source': 4 }, options: { dom: { '#ss_base': false } }, manualLocks: { single: {} }, expected: null },
  { family: 'C-01', catalog: baseHome, sourceQuantities: { 'AM052DNLDBH1': 2, 'AM083DNMDBH1': 1 }, options: { dom: { '#comm_panel': '기본판넬', '#comm_p360': '원형' } }, manualLocks: { commercial: {} }, expected: null },
  { family: 'C-02', catalog: baseHome, sourceQuantities: { 'AM052DNLDBH1': 2, 'AM083DNMDBH1': 1, 'AM130ANHDBH1': 1 }, options: { dom: { '#comm_panel': '기본판넬', '#comm_p360': '원형', '#comm_hose_i': false, '#comm_ex_hose': false } }, manualLocks: { commercial: {} }, expected: null },
  { family: 'C-03', catalog: baseHome, sourceQuantities: { 'AM052DNLDBH1': 2 }, options: { dom: { '#comm_remote': '유선', '#comm_panel': '판넬제외', '#comm_ex_hose': true } }, manualLocks: { commercial: {} }, expected: null },
  { family: 'C-04', catalog: baseHome, sourceQuantities: { 'AM052DNLDBH1': 2, 'AM072DNMDBH1': 3 }, options: { dom: { '#comm_panel': '판넬제외', '#comm_remote': '제외', '#comm_ex_hose': true } }, manualLocks: { commercial: {} }, expected: null },
  { family: 'C-05', catalog: baseHome, sourceQuantities: { 'AM120AXVHHH1': 1 }, options: { dom: { '#comm_panel': '판넬제외', '#comm_remote': '제외', '#comm_ex_hose': true } }, manualLocks: { commercial: {} }, expected: null },
  { family: 'C-06', catalog: baseHome, sourceQuantities: { 'AM140AXVGHH1': 1 }, options: { dom: { '#comm_panel': '판넬제외', '#comm_remote': '제외', '#comm_ex_hose': true } }, manualLocks: { commercial: {} }, expected: null },
  { family: 'C-07', catalog: baseHome, sourceQuantities: { 'AM035FXMRHC1': 2, 'AM075FXMRHC1': 1 }, options: { dom: { '#comm_panel': '판넬제외', '#comm_remote': '제외', '#comm_ex_hose': true } }, manualLocks: { commercial: {} }, expected: null },
  { family: 'C-08', catalog: baseHome, sourceQuantities: { 'AM180AXVGHH1': 2 }, options: { dom: { '#comm_panel': '판넬제외', '#comm_remote': '제외', '#comm_ex_hose': true } }, manualLocks: { commercial: {} }, expected: null },
  {
    family: 'C-09',
    catalog: baseHome,
    sourceQuantities: {},
    // 2-슬롯: 첫 슬롯은 항상 '-'이고, 마지막(2번째) 슬롯은 누적합 코드가 계산된 직후
    // 실외기 HP 강제표(codeByOutdoorHP)로 즉시 덮어써진다 — hp=120(AM120AXVHHH1)은
    // 항상 유효하므로(>0) 이 fixture는 강제표가 실제로 개입함을 보여준다.
    options: { branchSlots: [{ cap: 1000 }, { cap: 500 }], outdoorModel: 'AM120AXVHHH1' },
    manualLocks: { commercial: {} },
    expected: null,
  },
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
  // 홈 I형 호스는 두 앱이 서로 다른 스위치를 본다(§4 드리프트: 견적=#home_hose_i DOM,
  // 주문=window.SHOW_I_HOSE). 이전 fixture는 showIHose를 fixture 최상위에 얹어
  // commonContextScript가 읽는 options.showIHose에 도달하지 못했다 — 주문 쪽은 이
  // 스위치가 유일한 진입점이라 그 상태로는 I형 갈래가 전혀 실행되지 않았다. 둘 다
  // 명시적으로 켜서 각 앱이 자신의 실제 스위치로 I형 갈래에 도달하게 한다.
  {
    id: 'H-01-I',
    family: 'H-01',
    catalog: baseHome,
    sourceQuantities: { 'AM020BN1PBH1': 2 },
    options: { dom: { '#home_panel': '기본', '#home_remote': '기본', '#home_hose_i': true }, showIHose: true },
    manualLocks: { home: {} },
    expected: null,
  },
  optionCase('H-01-NO-HOSE', 'H-01', { '#home_no_hose': true }),
  optionCase('H-02-NO-PANEL', 'H-02', { '#home_panel': '판넬제외' }),
  optionCase('H-03-AIR-PANEL', 'H-03', { '#home_panel': '공청판넬' }),
  optionCase('H-03-NO-PANEL', 'H-03', { '#home_panel': '판넬제외' }),
  // 수동 잠금 축(§ D-2 불변식 6) — 정본 정규식이 요구하는 target 입력이 아니라, 실제
  // 사용자가 판넬 수량을 손으로 고친 뒤 잠근 상태를 재현한다. HOME_MANUAL_PANEL에 없으면
  // recomputeHomePanels의 초기화/재계산 두 지점 모두 이 모델을 건드리지 않아야 한다.
  optionCase('H-03-PANEL-LOCK', 'H-03', {}, { sourceQuantities: { AM016BN1PBH2: 1, AM020BN1PBH1: 2, AM060BN1PBH1: 3, PC1MWSK3NW: 9 }, manualLocks: { home: { panel: ['PC1MWSK3NW'] } } }),
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
  // D-4 — allowRemoteChange_의 거짓 갈래를 실제로 실행한다. set-1way-source(기본 리모컨
  // AR-EH05)는 유선 변경이 허용되지만, set-1way-inf-source(기본 리모컨 AR-CH01)는
  // 정본 정규식(/^(AR-?EH05|AR-?EC05|AR-?KH05)$/i)에 걸리지 않아 허용되지 않는다 —
  // 스텁이었다면(항상 true) wired-board가 5(3+2)로 나왔을 것이다.
  {
    id: 'S-02-REMOTE-CHANGE-GATE',
    family: 'S-02',
    catalog: baseHome,
    sourceQuantities: { 'set-1way-source': 3, 'set-1way-inf-source': 2 },
    options: { dom: { '#ss_base': false, '#ss_remote_ex': false, '#ss_remote': '유선리모컨' } },
    manualLocks: { single: {} },
    expected: null,
  },
  optionCase('C-01-NO-PANEL', 'C-01', { '#comm_panel': '판넬제외' }),
  optionCase('C-01-BLACK-PANEL', 'C-01', { '#comm_panel': '블랙판넬' }),
  optionCase('C-01-LIFT-PANEL', 'C-01', { '#comm_panel': '승강판넬' }),
  optionCase('C-01-AIR-PANEL', 'C-01', { '#comm_panel': '공청판넬' }),
  optionCase('C-01-CIRCLE-360', 'C-01', { '#comm_p360': '원형' }, { sourceQuantities: { 'AM100DNMDBH1': 1 } }),
  optionCase('C-01-SQUARE-360', 'C-01', { '#comm_p360': '사각' }, { sourceQuantities: { 'AM100DNMDBH1': 1 } }),
  // 상업 I형 호스도 같은 함정이었다: 주문 앱은 #comm_hose_i DOM을 아예 읽지 않고
  // window.SHOW_I_HOSE(pickHoseModel 전용)로만 1way/4way 호스 모델을 고른다
  // (order-app/index.html:5349-5350) — showIHose를 options 밖에 두면 주문 쪽은
  // I형 갈래를 전혀 타지 않는다. 견적은 #comm_hose_i DOM이 1way target을 정하고
  // pickHoseModel의 window.SHOW_I_HOSE가 4way target을 정하므로, 두 스위치를 함께
  // 켜야 1way·4way 모두 I형으로 일관되게 나온다.
  optionCase('C-02-I-HOSE', 'C-02', { '#comm_hose_i': true }, { options: { dom: { '#comm_panel': '기본판넬', '#comm_p360': '원형', '#comm_hose_i': true, '#comm_ex_hose': false }, showIHose: true } }),
  optionCase('C-02-NO-HOSE', 'C-02', { '#comm_ex_hose': true }),
  optionCase('C-03-WIRELESS', 'C-03', { '#comm_remote': '무선' }),
  optionCase('C-03-WIRED', 'C-03', { '#comm_remote': '유선' }),
  optionCase('C-03-COLOR', 'C-03', { '#comm_remote': '컬러유선' }),
  optionCase('C-03-NO-REMOTE', 'C-03', { '#comm_remote': '제외' }),
  optionCase('C-05-NO-BASE', 'C-05', { '#comm_ex_base': true }),
  // 수동 잠금 축(상업) — 방진가대S2소를 COMM_MANUAL_BASE로 잠그면 recomputeCommDerived
  // 마지막 apply 단계(index.ejs:8508)가 그 모델에 대해 want→commQty 반영 자체를 건너뛴다.
  // C-05의 자동 계산값(1)이 전혀 적용되지 않아 방진가대S2소가 결과에서 사라진다.
  optionCase('C-05-BASE-LOCK', 'C-05', {}, { manualLocks: { commercial: { base: ['방진가대S2소'] } } }),
  optionCase('C-08-NO-BASE', 'C-08', { '#comm_ex_base': true }),
  // C-09 누적합 6개 버킷 — 실제 임계값 150/406/464/696/986(index.ejs:12592-12598)에 맞춘
  // 3-슬롯 fixture. 2-슬롯이면 마지막(=유일한 둘째) 슬롯이 항상 실외기 HP 강제표로
  // 덮어써져 누적합 코드가 결과에 드러나지 않는다(위 base C-09 참조) — 그래서 여기서는
  // 3번째 슬롯(cap=1)을 필러로 추가해, 강제 덮어쓰기가 "마지막"인 3번째 슬롯에만
  // 적용되고 2번째 슬롯의 누적합 코드는 그대로 남도록 했다. outdoorModel은 fixture 간
  // 유일한 변수(branchSlots)만 바뀌도록 base C-09와 동일하게 AM120AXVHHH1(hp=120→
  // 강제 코드 2812)로 고정했다 — 그래서 2812 버킷 fixture만 총 2개(둘째+셋째 슬롯 모두
  // 2812)이고 나머지는 버킷 코드 1개 + 강제 2812 코드 1개가 함께 나온다.
  optionCase('C-09-1509', 'C-09', {}, { options: { branchSlots: [{ cap: 1 }, { cap: 148 }, { cap: 1 }], outdoorModel: 'AM120AXVHHH1' } }),
  optionCase('C-09-2512', 'C-09', {}, { options: { branchSlots: [{ cap: 1 }, { cap: 149 }, { cap: 1 }], outdoorModel: 'AM120AXVHHH1' } }),
  optionCase('C-09-2812', 'C-09', {}, { options: { branchSlots: [{ cap: 1 }, { cap: 405 }, { cap: 1 }], outdoorModel: 'AM120AXVHHH1' } }),
  optionCase('C-09-2815', 'C-09', {}, { options: { branchSlots: [{ cap: 1 }, { cap: 463 }, { cap: 1 }], outdoorModel: 'AM120AXVHHH1' } }),
  optionCase('C-09-3419', 'C-09', {}, { options: { branchSlots: [{ cap: 1 }, { cap: 695 }, { cap: 1 }], outdoorModel: 'AM120AXVHHH1' } }),
  optionCase('C-09-4119', 'C-09', {}, { options: { branchSlots: [{ cap: 1 }, { cap: 985 }, { cap: 1 }], outdoorModel: 'AM120AXVHHH1' } }),
  // 실외기 HP 강제표(codeByOutdoorHP) 자체의 버킷 변화를 독립적으로 증명한다 — 누적합은
  // 4119 버킷(2000)에 깊숙이 있는데, 실외기를 AM035FXMRHC1(hp=35)로 바꾸면 마지막 슬롯의
  // 강제 코드가 1509로 바뀐다(hp<=50). 다른 fixture는 전부 hp=120→2812로 고정돼 있어
  // 이 표의 다른 버킷은 이 fixture가 아니면 전혀 실행되지 않는다.
  optionCase('C-09-HP-1509', 'C-09', {}, { options: { branchSlots: [{ cap: 1 }, { cap: 1999 }, { cap: 1 }], outdoorModel: 'AM035FXMRHC1' } }),
];

module.exports = { fixtures, optionFixtures, homeCatalog, singleCatalog, singlePartsCatalog, commercialCatalog };
