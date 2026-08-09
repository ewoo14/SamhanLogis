#!/usr/bin/env node
/**
 * #896 P2: 레거시 세트 전개 상세행과 P0 골든의 결정적 parity gate.
 * 기본 source는 커밋된 P0 input-manifest.jsonl이며, --source로 같은 행 계약의
 * JSONL source를 교체할 수 있다. DB adapter는 이 계약을 구현한 caller가 주입한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const DEFAULT_SOURCE = 'docs/qa/896-p0-golden-manifest/input-manifest.jsonl';
const DEFAULT_GOLDEN = 'docs/qa/896-p0-golden-manifest/golden/02-set-expansion.json';
const LEGACY_HTML = 'tools/legacy-gas/종합견적서/index.html';
// feature/isDefault 는 골든 전 행이 기본값('' / false)이라 비교 신호가 없다.
//   single 682행 · commercial 170행 모두 feature 비어있음 · isDefault=false
// 게이트 쪽 정규화는 원천 메타데이터에서 값을 채우므로 비교하면 682건이
// 무의미한 차이로 잡힌다. 골든이 이 축을 담게 되면 다시 넣는다.
const FIELDS = ['model', 'name', 'kind', 'unit', 'quantity', 'unitPrice', 'subtotal', 'spec'];

const SOURCE_TABS = ['홈멀티', '싱글 세트', '싱글 구성품', '상업멀티', '상업멀티 구성', '구형'];
const CONSUMED_SOURCE_TABS = ['싱글 세트', '싱글 구성품', '상업멀티', '상업멀티 구성'];
const ALL_SHEET_TABS = [
  '전표생성폼', '종합견적서', '전표업로드목록', '홈멀티', '홈멀티_단가인상', '싱글 세트',
  '싱글 세트_단가인상', '싱글 구성품', '싱글 구성품_단가인상', '상업멀티',
  '상업멀티_단가인상', '싱글 자재가격', '상업멀티 구성', '상업멀티 구성_단가인상',
  '분기계산', '구형', '장비스펙', '부속품스펙', '홈멀티_템플릿', '거래처',
  '전표생성폼_템플릿', '싱글 세트_템플릿', '상업멀티_템플릿', '분기계산_템플릿',
  '구형_템플릿', '담당자', '추천실외기',
];
const OUT_OF_SCOPE_TABS = ALL_SHEET_TABS.filter((tab) => !SOURCE_TABS.includes(tab));

function balancedSlice(source, start) {
  const open = source.indexOf('{', start);
  let depth = 0; let quote = null; let lineComment = false; let blockComment = false;
  for (let i = open; i < source.length; i += 1) {
    const c = source[i]; const n = source[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && n === '/') { blockComment = false; i += 1; } continue; }
    if (quote) { if (c === '\\') i += 1; else if (c === quote) quote = null; continue; }
    if (c === '/' && n === '/') { lineComment = true; i += 1; continue; }
    if (c === '/' && n === '*') { blockComment = true; i += 1; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('함수 본문을 닫지 못했습니다');
}

function extractFunction(source, name) {
  const match = new RegExp(`function\\s+${name}\\s*\\(`).exec(source);
  if (!match) throw new Error(`레거시 함수 미발견: ${name}`);
  return balancedSlice(source, match.index);
}

function readSource(sourcePath) {
  const absolute = path.resolve(REPO, sourcePath);
  const rows = fs.readFileSync(absolute, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  return rows.filter((record) => record.recordType === 'catalog-row').map((record) => ({
    ...record.rawCells,
    sourceTab: record.sourceTab,
    sourceRow: record.sourceRow,
  }));
}

export function createCatalogSource(rows) {
  const byTab = (tab) => rows.filter((row) => row.sourceTab === tab);
  return {
    singleSets: byTab('싱글 세트').map((row) => ({ ...row, id: row.model })),
    singleParts: byTab('싱글 구성품').map((row) => ({ ...row, feat: row.feature || '', price: row.price || 0 })),
    commercialSets: byTab('상업멀티').filter((row) => String(row.unit).toUpperCase() === 'SET'),
    commercialParts: byTab('상업멀티 구성').map((row) => ({
      ...row, refModel: row.setModel || row.refModel || '', qty: row.componentQuantity || row.qty || 1,
    })),
  };
}

function buildLegacyExpander(catalog) {
  const html = fs.readFileSync(path.resolve(REPO, LEGACY_HTML), 'utf8');
  const source = [
    'const SINGLE_DEFAULTS = {\'자재 포함 여부\': \'미포함\'};',
    'const FOOT_ROUND = null;',
    'const PRICE_INC = {single:{}};',
    'const window = {SHOW_I_HOSE:false};',
    'const document = {getElementById: () => ({checked:false,value:\'\'})};',
    'function el() { return {value:\'\',checked:false}; }',
    'function unifyCatL_(x) { return x; }',
    'function roundK(n) { return Math.round((Number(n)||0)/1000)*1000; }',
    'function splitIndoorOutdoorToK(setUnit, fixedSum, ratioIn, ratioOut) {',
    ' const remain=Math.max(0,Math.round(Number(setUnit)||0)-Math.round(Number(fixedSum)||0));',
    ' let indoor=roundK(Math.round(remain*ratioIn/(ratioIn+ratioOut))); let outdoor=remain-indoor;',
    ' const mod=((outdoor%1000)+1000)%1000; if(mod){if(outdoor>0){indoor-=mod;outdoor+=mod;}else{indoor+=1000-mod;outdoor-=1000-mod;}}',
    ' if(indoor<0){outdoor+=indoor;indoor=0;} if(outdoor<0){indoor+=outdoor;outdoor=0;} return {indoor,outdoor,remain}; }',
    'function partsForSetStrict_(s){return SINGLE_PARTS.filter(p=>(p?.setModel||\'\')===(s?.model||\'\'));}',
    'const isRemote=p=>/리모컨/.test(p?.kind||\'\')||/리모컨/.test(p?.name||\'\');',
    'const isPanel=p=>/(판넬|패널)/.test(p?.kind||\'\')||/(판넬|패널)/.test(p?.name||\'\');',
    'const isHideMat=p=>/유연호스\\s*I형|운임|절삭/i.test(((p?.kind)||\'\')+\' \'+((p?.name)||\'\'));',
    'const isFoot=p=>/발통/.test(p?.name||\'\')||/SI-AL700a/i.test(p?.model||\'\')||p?.model===FOOT_ROUND;',
    'const isMaterial=p=>/자재/.test(p?.feat||\'\');',
    'function partUnitPrice(p){return Math.round(Number(p?.price||p?.list||0));}',
    'function classifySingleSetFixed(s){const hay=((s?.name||\'\')+\' \'+(s?.model||\'\')+\' \'+(s?.spec||\'\')).toLowerCase();return {catL:/가정용/.test(hay)?\'가정용 에어컨\':\'기타\',catM:\'\'};}',
    'function getDefaultRemoteRows(s){return partsForSetStrict_(s).filter(p=>isRemote(p)&&/기본/i.test(p?.feat||\'\'));}',
    'function getOptionRemoteRow(){return null;} function allowRemoteChange_(){return false;}',
    'function getBasePanelRow(s){return partsForSetStrict_(s).filter(p=>isPanel(p)).find(p=>/기본/.test(p?.feat||\'\'))||null;}',
    'function pickPanelRow(s){return getBasePanelRow(s);}',
    'function setBasePriceRightFirst(s){return Math.round(Number(s?.price||s?.list||0));}',
    'function isIndoorUnitPart(p){if(/실외기/.test(p?.kind||\'\')||/실외기/.test(p?.name||\'\'))return false;return /실내기/.test(p?.kind||\'\')||/실내기/.test(p?.name||\'\');}',
    'function isOutdoorUnitPart(p){if(isPanel(p)||isRemote(p)||isMaterial(p)||isFoot(p))return false;return /실외기/.test(p?.kind||\'\')||/실외기/.test(p?.name||\'\');}',
    `const SINGLE_SETS = ${JSON.stringify(catalog.singleSets)};`,
    `const SINGLE_PARTS = ${JSON.stringify(catalog.singleParts)};`,
    extractFunction(html, 'explodeSetParts'),
    'this.explodeSetParts = explodeSetParts;',
  ].join('\n');
  const context = vm.createContext({});
  vm.runInContext(source, context, { filename: 'legacy-explodeSetParts' });
  return (set) => context.explodeSetParts(set, 1, set.price);
}

function normalizePart(part, sourcePart, quantity = 1) {
  const unitPrice = Number(part.price || 0);
  return {
    model: String(part.model || ''), name: String(part.name || ''), kind: String(part.kind || ''),
    feature: String(sourcePart?.feat || ''), isDefault: Boolean(sourcePart?.isDefault),
    unit: String(part.unit || ''), quantity: Number(part.qty ?? quantity), unitPrice,
    subtotal: unitPrice * Number(part.qty ?? quantity), spec: String(part.spec || ''),
  };
}

function expandCommercial(catalog) {
  const priceByModel = new Map(catalog.commercialParts.map((row) => [row.model, Number(row.price || row.list || 0)]));
  return catalog.commercialSets.map((set) => ({
    model: set.model, name: set.name, quantity: 1, error: null,
    parts: (() => { const parts = catalog.commercialParts.filter((part) => part.refModel === set.model); return parts.map((part) => ({
      model: part.model, name: part.name, kind: '', feature: '', isDefault: false,
      unit: '', quantity: Number(part.qty || 1),
      unitPrice: priceByModel.get(part.model) || 0, subtotal: (priceByModel.get(part.model) || 0) * Number(part.qty || 1), spec: String(part.spec || ''),
    })) .length ? parts.map((part) => ({
      model: part.model, name: part.name, kind: '', feature: '', isDefault: false,
      unit: '', quantity: Number(part.qty || 1),
      unitPrice: priceByModel.get(part.model) || 0, subtotal: (priceByModel.get(part.model) || 0) * Number(part.qty || 1), spec: String(part.spec || ''),
    })) : [{ model: set.model, name: set.name, kind: '', feature: '', isDefault: false, unit: '', quantity: 1, unitPrice: Number(set.price || set.list || 0), subtotal: Number(set.price || set.list || 0), spec: String(set.spec || '') }]; })(),
  }));
}

export function expandCatalog(catalog) {
  const explode = buildLegacyExpander(catalog);
  const sourcePart = new Map(catalog.singleParts.map((part) => [part.model, part]));
  return {
    single: catalog.singleSets.map((set) => ({ model: set.model, name: set.name, quantity: 1, error: null, parts: explode(set).map((part) => normalizePart(part, sourcePart.get(part.model))) })),
    commercial: expandCommercial(catalog),
  };
}

function value(value) { return value === undefined ? null : value; }

export function compareExpansion(actual, expected) {
  const differences = [];
  for (const section of ['single', 'commercial']) {
    const aSets = actual[section] || []; const eSets = expected[section] || [];
    if (aSets.length !== eSets.length) differences.push({ section, field: 'setCount', expected: eSets.length, actual: aSets.length });
    const count = Math.max(aSets.length, eSets.length);
    for (let i = 0; i < count; i += 1) {
      const aSet = aSets[i]; const eSet = eSets[i]; const setKey = eSet?.model || aSet?.model || `index-${i}`;
      for (const field of ['model', 'name', 'quantity', 'error']) if (value(aSet?.[field]) !== value(eSet?.[field])) differences.push({ section, set: setKey, field, expected: value(eSet?.[field]), actual: value(aSet?.[field]) });
      const aParts = aSet?.parts || []; const eParts = eSet?.parts || [];
      if (aParts.length !== eParts.length) differences.push({ section, set: setKey, field: 'partCount', expected: eParts.length, actual: aParts.length });
      const partCount = Math.max(aParts.length, eParts.length);
      for (let j = 0; j < partCount; j += 1) for (const field of FIELDS) {
        const av = value(aParts[j]?.[field]); const ev = value(eParts[j]?.[field]);
        if (av !== ev) differences.push({ section, set: setKey, part: aParts[j]?.model || eParts[j]?.model || `index-${j}`, field, expected: ev, actual: av });
      }
    }
  }
  return differences;
}

export function runGate({ root = REPO, sourcePath = DEFAULT_SOURCE, goldenPath = DEFAULT_GOLDEN } = {}) {
  const source = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(root, sourcePath);
  const golden = path.isAbsolute(goldenPath) ? goldenPath : path.resolve(root, goldenPath);
  const sourceRows = readSource(source);
  const manifestSourceTabs = [...new Set(sourceRows.map((row) => row.sourceTab))];
  const catalog = createCatalogSource(sourceRows);
  const expected = JSON.parse(fs.readFileSync(golden, 'utf8'));
  const actual = expandCatalog(catalog);
  const differences = compareExpansion(actual, expected);
  const rowCountByTab = new Map(manifestSourceTabs.map((tab) => [tab, sourceRows.filter((row) => row.sourceTab === tab).length]));
  const unconsumedSourceTabs = manifestSourceTabs
    .filter((tab) => !CONSUMED_SOURCE_TABS.includes(tab))
    .map((tab) => ({ tab, rows: rowCountByTab.get(tab) || 0 }));
  const consumedSourceTabs = CONSUMED_SOURCE_TABS.filter((tab) => manifestSourceTabs.includes(tab));
  return {
    passed: differences.length === 0,
    differences,
    actual,
    expected,
    source: sourcePath.replaceAll(path.sep, '/'),
    golden: goldenPath.replaceAll(path.sep, '/'),
    scope: {
      sourceTabs: manifestSourceTabs,
      consumedSourceTabs,
      unconsumedSourceTabs,
      allSheetTabs: ALL_SHEET_TABS,
      codeReadTabCount: 17,
      outOfScopeTabs: ALL_SHEET_TABS.filter((tab) => !consumedSourceTabs.includes(tab)),
    },
  };
}

function print(result) {
  console.log('== #896 P2 세트 전개 상세행 parity gate ==');
  console.log(`source: ${result.source}`); console.log(`golden: ${result.golden}`);
  console.log(`scope: manifest sourceTab ${result.scope.sourceTabs.length}개 중 실제 소비 ${result.scope.consumedSourceTabs.length}개 (${result.scope.consumedSourceTabs.join('/')})`);
  console.log(`       — 전체 시트 탭 ${result.scope.allSheetTabs.length}개 중 code-read ${result.scope.codeReadTabCount}개 기준 부분집합 · 실효 ${result.scope.allSheetTabs.length} = ${result.scope.consumedSourceTabs.length} + ${result.scope.outOfScopeTabs.length}`);
  console.log(`unconsumed: ${result.scope.unconsumedSourceTabs.map(({ tab, rows }) => `${tab} ${rows}행`).join(' · ')} (manifest 에 있으나 이 게이트가 소비하지 않음)`);
  console.log('uncovered: feature · isDefault (골든 전 행이 기본값이라 판정 불가) ·');
  console.log('           수량/가격/토글 시나리오 · 상업 레거시 함수 미실행');
  console.log(`scope-outside-tabs: ${result.scope.outOfScopeTabs.join(', ')}`);
  console.log(`sets: single=${result.actual.single.length}/${result.expected.single.length}, commercial=${result.actual.commercial.length}/${result.expected.commercial.length}`);
  if (!result.differences.length) { console.log('PASS: 전개 상세행 0건 차이'); return; }
  console.log(`FAIL: 차이 ${result.differences.length}건`);
  for (const diff of result.differences.slice(0, 100)) console.log(`- 세트=${diff.set || ''} 모델=${diff.part || ''} 필드=${diff.field} 기대=${JSON.stringify(diff.expected)} 실제=${JSON.stringify(diff.actual)}`);
  if (result.differences.length > 100) console.log(`... 나머지 ${result.differences.length - 100}건 생략`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const sourceArg = process.argv.slice(2).find((arg) => arg.startsWith('--source='));
  const goldenArg = process.argv.slice(2).find((arg) => arg.startsWith('--golden='));
  const result = runGate({
    sourcePath: sourceArg ? sourceArg.slice('--source='.length) : DEFAULT_SOURCE,
    goldenPath: goldenArg ? goldenArg.slice('--golden='.length) : DEFAULT_GOLDEN,
  });
  print(result); process.exitCode = result.passed ? 0 : 1;
}

export { DEFAULT_SOURCE, DEFAULT_GOLDEN, FIELDS };
