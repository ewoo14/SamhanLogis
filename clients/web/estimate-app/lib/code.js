/**
 * legacy estimate Code.js (2837 라인) Node.js 1:1 포팅.
 *
 * 원본: migration/source/scripts/estimate/Code.js (Google Apps Script)
 * 대상: Node.js 20 + Express 4 + EJS (B2 옵션 — Apps Script 와 가장 가까운 환경)
 *
 * 포팅 원칙 (DECISIONS Phase 6 v4 후속 정정 §):
 *  1. **logic 100% 보존** — 함수 시그니처, 반환 객체 shape, 에러 메시지 동일
 *  2. **Google API 폐기** — SpreadsheetApp/DriveApp/UrlFetchApp → apps-script-shim 경유
 *     실 데이터 출처는 SamhanLogis MSA endpoint (axios)
 *  3. **e-Count + Notion 외부 호출 폐기** — slip-bridge.js 가 slip-service POST 로 흡수
 *  4. **inventory 76 함수 모두 export** — RPC dispatch (`code[fnName]`) 호환
 *
 * 함수 인벤토리 (migration/analysis/01-script-analysis-estimate.md §1.1 76개):
 *  - 부트스트랩: doGet, getHomeMulti, getSingleSets, getSingleParts, getSingleMatPrices,
 *    getCommercialMulti, getCommercialParts, getOldProducts_, getHomeDefaults,
 *    getSingleDefaults, getRecommendOduData, getSpecDetailMap_, getPriceIncData_,
 *    getLogoImage
 *  - RPC: getCustomerDataAsync, getQuoteHistory, saveQuoteSnapshot, sendOrderFromUi,
 *    getNotionHistory, logFrontEvent, getGateImages, checkUserAuth, getInventoryTable,
 *    getManagersForInput, initDcConfigFromNotion, searchCustomerByBizno
 *  - 캐시: cachePutJSON_, cacheGetJSON_, cacheRemoveJSON_
 *  - 유틸 (pure): normalizeSize_, findIdx_, parseKRNumber_, parseKRFloat_, toYmd_, toMmDd_,
 *    normalizeTel_, todayYMD_, _normSpec_, sanitizeKoreanParen_, trimSymbols_, sanitizeDisp_,
 *    hpFromText_, isBlockedByNote_, isSoldOutByNote_, unifyCatL_, classifyHome_,
 *    classifySingleSetLM_, findHeaderIndex_, extractRowsFromFormula_, classifyCommercial_,
 *    decideWarehouseCode_, formatWonDiscountLabel_, formatPercentLabel_, combineRemarks_,
 *    detectHomeOrder, buildDefaultDcConfig_, include
 *  - e-Count (폐기 → slip-bridge): getScriptCreds_, callZoneApi, getEcountSession,
 *    getInventoryTableHtml
 *  - Notion (폐기 → MS DB): saveOrderToNotion, fetchNotionDcConfig_,
 *    searchCustomerByBizOrCode (+ searchCustomerByBizno),
 *    getCustomers_, getManagers_, searchManagersByName_, findManagerByNameExact_,
 *    forceAuth, getSpecMap_
 */

'use strict';

const axios = require('axios');
const shim = require('./apps-script-shim');
const slipBridge = require('./slip-bridge');

const {
  Logger,
  Utilities,
  Session,
  CacheService,
  PropertiesService,
  UrlFetchApp,
  SpreadsheetApp,
  DriveApp,
  HtmlService,
  preloadSheets,
  clearSheetCache: _clearSheetCacheShim,
} = shim;

const BASE_URL = process.env.SAMHAN_API_BASE_URL || 'http://localhost:8080';
// 비-품목 데이터 (인증 / snapshot / partner / 감사로그) 만 SamhanLogis MS 위임.
// 품목 / 거래처 / 담당자 / 추천실외기 / 단가인상 등 시트 데이터는 google-sheets-client
// 직접 read (개발책임자 결정 2026-05-05 — 옵션 C).
const PARTNER_BASE = process.env.PARTNER_SERVICE_URL || BASE_URL;
const ESTIMATE_BASE = process.env.ESTIMATE_SERVICE_URL || BASE_URL;
const AUDIT_LOG_URL = process.env.AUDIT_LOG_URL || `${BASE_URL}/api/v1/audit-logs/front`;

const ax = axios.create({ timeout: 15000, validateStatus: () => true });

/**
 * SamhanLogis MS GET — 공통 helper. 실패 시 throw (silent fallback 폐기).
 *
 * Phase 6 backend (PR #76: M2 partner-auth / M3 dc-config / M4 partner-order /
 * M5 slip-service + product-service google sheets sync) 머지 후 실 endpoint
 * 가용성이 보장되므로 USE_MOCK_FALLBACK 분기를 완전 제거한다. silent fallback
 * 회귀 위험 (잘못된 mock 데이터로 진행) 차단을 위함.
 *
 * @param {string} url   호출 URL
 * @param {object} [params] query string
 * @param {*} [_unused]  legacy 시그니처 호환용 — 무시
 */
async function _msGet(url, params, _unused) {
  void _unused;
  try {
    const resp = await ax.get(url, { params });
    if (resp.status >= 200 && resp.status < 300) return resp.data;
    Logger.log(`[ms] GET ${url} → ${resp.status}`);
    throw new Error(`SamhanLogis MS GET 실패: ${url} (HTTP ${resp.status})`);
  } catch (e) {
    if (e && e.message && e.message.startsWith('SamhanLogis MS GET 실패')) throw e;
    Logger.log(`[ms] GET ${url} error: ${e.message}`);
    throw new Error(`SamhanLogis MS GET 실패: ${url} (${e.message})`);
  }
}

async function _msPost(url, body, _unused) {
  void _unused;
  try {
    const resp = await ax.post(url, body);
    if (resp.status >= 200 && resp.status < 300) return resp.data;
    Logger.log(`[ms] POST ${url} → ${resp.status}`);
    throw new Error(`SamhanLogis MS POST 실패: ${url} (HTTP ${resp.status})`);
  } catch (e) {
    if (e && e.message && e.message.startsWith('SamhanLogis MS POST 실패')) throw e;
    Logger.log(`[ms] POST ${url} error: ${e.message}`);
    throw new Error(`SamhanLogis MS POST 실패: ${url} (${e.message})`);
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * §0 상수 (legacy lines 59-86)
 * ═══════════════════════════════════════════════════════════════════════ */

const SRC_SHEET_ID = '1RJqO3jT-yJTi3NDBhL60o_cZWlVETGTU7UlvIKXuVNQ';
const HOME_NAME = '홈멀티_단가인상';
const SINGLE_NAME = '싱글 세트_단가인상';
const SINGLE_PARTS_NAME = '싱글 구성품_단가인상';
const COMM_NAME = '상업멀티_단가인상';
const COMM_PARTS_NAME = '상업멀티 구성_단가인상';
const CUSTOMERS_NAME = '거래처';
const MANAGERS_NAME = '담당자';

const DISCOUNT_RATE_HOME = 0.45;
const DISCOUNT_RATE_COMM = 0.45;
const SHOW_I_HOSE = false;
const DISCOUNT_360_AMT = 0;
const DISCOUNT_4WAY_AMT = 0;
const DISCOUNT_STAND_AMT = 0;
const ONEWAY_DISCOUNT_AMT = 0;
const DELUXE_DISCOUNT_AMT = 0;
const FIRSTGRADE_DISCOUNT_AMT = 0;
const UNIT_ROUND_TO = 0;
const UNIT_ROUND_MODE = 'ROUND';

/* ════════════════════════════════════════════════════════════════════════
 * §1 캐시 유틸 (legacy lines 90-123) — apps-script-shim CacheService 위임
 * ═══════════════════════════════════════════════════════════════════════ */

const CACHE_CHUNK_BYTES = 90000;

function cachePutJSON_(key, obj, ttlSec) {
  const cache = CacheService.getScriptCache();
  const str = JSON.stringify(obj);
  const ttl = ttlSec || 1800;
  if (str.length <= CACHE_CHUNK_BYTES) { cache.put(key, str, ttl); return true; }
  const n = Math.ceil(str.length / CACHE_CHUNK_BYTES);
  cache.put(key + '#count', String(n), ttl);
  for (let i = 0; i < n; i++) cache.put(`${key}#${i}`, str.slice(i * CACHE_CHUNK_BYTES, (i + 1) * CACHE_CHUNK_BYTES), ttl);
  return true;
}

function cacheGetJSON_(key) {
  const cache = CacheService.getScriptCache();
  const cnt = cache.get(key + '#count');
  if (cnt) {
    const n = parseInt(cnt, 10);
    let buf = '';
    for (let i = 0; i < n; i++) { const part = cache.get(`${key}#${i}`); if (!part) return null; buf += part; }
    try { return JSON.parse(buf); } catch (e) { return null; }
  }
  const hit = cache.get(key); if (!hit) return null;
  try { return JSON.parse(hit); } catch (e) { return null; }
}

function cacheRemoveJSON_(key) {
  const cache = CacheService.getScriptCache();
  const cnt = cache.get(key + '#count');
  if (cnt) {
    const n = parseInt(cnt, 10);
    for (let i = 0; i < n; i++) cache.remove(`${key}#${i}`);
    cache.remove(key + '#count');
  }
  cache.remove(key);
}

/* ════════════════════════════════════════════════════════════════════════
 * §2 순수 유틸 (legacy lines 197-282) — verbatim 포팅
 * ═══════════════════════════════════════════════════════════════════════ */

function normalizeSize_(v) {
  const t = String(v == null ? '' : v).trim();
  const n = t.replace(/[^\d.+]/g, '');
  return n || '';
}

function findIdx_(row, keys) {
  for (let k = 0; k < keys.length; k++) { const i = row.indexOf(keys[k]); if (i >= 0) return i; }
  return -1;
}

function parseKRNumber_(v) {
  if (v == null || v === '') return 0;
  const s = String(v).replace(/[^\d.\-]/g, '');
  return Math.round(parseFloat(s) || 0);
}

function parseKRFloat_(v) {
  if (v == null || v === '') return 0;
  const s = String(v).replace(/[^\d.\-]/g, '');
  return parseFloat(s) || 0;
}

function toYmd_(v, tz) {
  if (!v) return '';
  return Utilities.formatDate(new Date(v), tz || 'Asia/Seoul', 'yyyyMMdd');
}

function toMmDd_(v, tz) {
  if (!v) return '';
  return Utilities.formatDate(new Date(v), tz || 'Asia/Seoul', 'MMdd');
}

function normalizeTel_(s) {
  return String(s || '').replace(/[^\d]/g, '');
}

function todayYMD_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
}

function _normSpec_(s) {
  return String(s || '').replace(/\s+/g, '').toLowerCase();
}

function sanitizeKoreanParen_(text) {
  return String(text || '')
    .replace(/[(]/g, '(')
    .replace(/[)]/g, ')');
}

function trimSymbols_(text) {
  return String(text || '').trim();
}

function sanitizeDisp_(text) {
  return trimSymbols_(sanitizeKoreanParen_(text));
}

function hpFromText_(s) {
  const t = String(s || '');
  const m = t.match(/(\d+(\.\d+)?)\s*HP/i);
  if (m) return parseFloat(m[1]);
  return 0;
}

function isBlockedByNote_(note) {
  return /미판매|단종/.test(String(note || ''));
}

function isSoldOutByNote_(note) {
  return /품절/.test(String(note || ''));
}

function unifyCatL_(L) {
  const t = String(L || '').trim();
  return t === '부자재2' ? '부자재' : t;
}

function findHeaderIndex_(headers, key) {
  if (!Array.isArray(headers)) return -1;
  return headers.indexOf(key);
}

function extractRowsFromFormula_(formula) {
  const out = [];
  const re = /\$([A-Z]+)\$(\d+)/g;
  let m;
  while ((m = re.exec(String(formula || '')))) out.push({ col: m[1], row: parseInt(m[2], 10) });
  return out;
}

function formatWonDiscountLabel_(amt) {
  const n = Number(amt) || 0;
  if (n === 0) return '';
  return `(${n.toLocaleString('ko-KR')}원 할인)`;
}

function formatPercentLabel_(rate) {
  const r = Number(rate) || 0;
  if (r === 0) return '';
  return `(${(r * 100).toFixed(1)}%)`;
}

function combineRemarks_(base, extra) {
  const parts = [];
  if (base) parts.push(String(base).trim());
  if (extra) parts.push(String(extra).trim());
  return parts.filter(Boolean).join(' / ');
}

function detectHomeOrder(items, order) {
  const tCand = [order?.type, order?.mode, order?.orderType, order?.kind, order?.category]
    .map((x) => String(x || '').toLowerCase());
  if (tCand.some((x) => /(home|home-multi|homemulti|hm)/.test(x))) return true;

  if (Array.isArray(items)) {
    for (const it of items) {
      const U = (v) => String(v || '').toUpperCase();
      const scopes = [U(it.section), U(it.group), U(it.kind), U(it.category), U(it.tags)];
      if (scopes.some((s) => /HOME|HOME-MULTI|HOMEMULTI|HM/.test(s))) return true;
    }
  }
  return false;
}

function buildDefaultDcConfig_() {
  return {
    home: { rate: DISCOUNT_RATE_HOME, fixed: 0 },
    comm: { rate: DISCOUNT_RATE_COMM, fixed: 0 },
    single: { rate: 0, fixed: 0 },
    old: { rate: 0.5, fixed: 0 },
  };
}

/**
 * legacy classifyHome_(name) — 홈멀티 분류 (대/중/소 + disp).
 * estimate-legacy/lib/code.js 기준 (1:1 포팅).
 */
function classifyHome_(rawName) {
  const s0 = String(rawName || '');
  const s = sanitizeDisp_(s0);
  let catL = '', catM = '', catS = '', disp = '';
  if (/실외기/.test(s)) {
    catL = '실외기';
    if (/프레스티지/.test(s)) catM = '프레스티지';
    else if (/프리미엄/.test(s)) catM = '프리미엄';
    else if (/스탠다드/.test(s)) catM = '스탠다드';
  } else if (/실내기/.test(s)) {
    catL = '실내기';
    if (/4\s*WAY|4WAY/i.test(s)) catM = '4WAY';
    else if (/1\s*WAY|1WAY/i.test(s)) catM = '1WAY';
    else if (/360/.test(s)) catM = '360CST';
    else if (/덕트/.test(s)) catM = '덕트';
    else if (/스탠드/.test(s)) catM = '스탠드';
    else if (/벽걸이/.test(s)) catM = '벽걸이';
  } else if (/리모컨/.test(s)) {
    catL = '리모컨';
  } else if (/판넬|패널/.test(s)) {
    catL = '판넬';
  } else if (/배관|호스/.test(s)) {
    catL = '부자재';
    catM = '배관';
  } else {
    catL = '부자재';
  }
  disp = sanitizeDisp_(s0);
  return { catL, catM, catS, disp };
}

/**
 * legacy classifySingleSetLM_(s) — 싱글 세트의 L/M 분류.
 * estimate-legacy/lib/code.js 기준 (1:1 포팅) — name+model 텍스트 매칭.
 */
function classifySingleSetLM_(s) {
  const t = String((s && s.name) || (s && s.model) || s || '').toLowerCase();
  let L = 'acc';
  if (/360\s*cst|360cst|360/.test(t)) L = '360';
  else if (/4\s*way|4way/.test(t)) L = '4w';
  else if (/1\s*way|1way/.test(t)) L = '1w';
  else if (/덕트/.test(t)) L = 'duct';
  else if (/실링/.test(t)) L = 'ceiling';
  else if (/스탠드/.test(t)) L = 'stand';
  else if (/벽걸이/.test(t)) L = 'wall';
  else if (/가정용|하우스|집/.test(t)) L = 'house';
  else if (/보드|키트|자재|부자재|리모컨/.test(t)) L = 'acc';

  let M = '';
  if (/프레스티지.*프리미엄/.test(t)) M = 'prestige';
  else if (/프레스티지/.test(t)) M = 'prestige';
  else if (/프리미엄|디럭스/.test(t)) M = 'premium';
  else if (/1\s*등급/.test(t)) M = 'grade1';
  else if (/냉방전용|냉전/.test(t)) M = 'cool';
  else if (/냉난방/.test(t)) M = 'heatcool';
  else if (/무풍/.test(t)) M = 'mupung';
  else if (/유풍/.test(t)) M = 'yupung';
  else if (/갤러리/.test(t)) M = 'gallery';
  else if (/비스포크/.test(t)) M = 'bespoke';

  return { L, M };
}

/**
 * legacy classifyCommercial_(name, model) — 상업멀티 대/중/소 분류.
 * estimate-legacy/lib/code.js 기준 (1:1 포팅).
 */
function classifyCommercial_(name, model) {
  const n = String(name || '').trim();
  const m = String(model || '').trim();

  if (n.includes('분기관')) {
    return { catL: '부자재', catM: '분기관', catS: '' };
  }

  let catL = '', catM = '', catS = '';

  // 실외기 후보
  const isOutdoorByModel = /AM\d{3}A[XVH]/i.test(m) || /AXV|AXH|AXX/i.test(m);
  const isIndoorByModel  = /AM\d{3}(BN|CN|PB|PH|PN)/i.test(m);

  // 실외기 중분류 키워드
  const outKeys = [
    { re: /프\s*라임|프라임/i, m: '프라임' },
    { re: /고효율.*한랭지/i, m: '고효율한랭지' },
    { re: /표준형/i, m: '표준형' },
    { re: /ECO.*냉난방/i, m: 'ECO 냉난방' },
    { re: /ECO.*냉방전용/i, m: 'ECO 냉방전용' },
    { re: /리뉴얼/i, m: 'ECO 리뉴얼' },
    { re: /냉방전용/i, m: '냉방전용' },
  ];
  if (isOutdoorByModel || /실외기/.test(n)) {
    catL = '실외기';
    for (const k of outKeys) { if (k.re.test(n)) { catM = k.m; break; } }
  } else if (isIndoorByModel || /실내기/.test(n)) {
    catL = '실내기';
    if (/4\s*WAY|4WAY/i.test(n)) catM = '4WAY';
    else if (/1\s*WAY|1WAY/i.test(n)) catM = '1WAY';
    else if (/360/.test(n)) catM = '360CST';
    else if (/덕트/.test(n)) catM = '덕트';
    else if (/스탠드/.test(n)) catM = '스탠드';
    else if (/벽걸이/.test(n)) catM = '벽걸이';
  } else if (/리모컨/.test(n)) {
    catL = '리모컨';
  } else if (/판넬|패널|panel/i.test(n)) {
    catL = '판넬';
  } else {
    catL = '부자재';
  }

  return { catL, catM, catS };
}

/* ════════════════════════════════════════════════════════════════════════
 * §3 부트스트랩 데이터 — google-sheets-client 직접 read
 *
 * 개발책임자 결정 (2026-05-05):
 *   "견적서와 주문서의 경우에만 기존 구글 스크립트처럼 구글 스프레드 시트에서
 *    그대로 가져오는 것으로 하자"
 *
 * 옵션 C 채택: estimate-app v2 frontend 가 시트 직접 read (Service Account).
 * - bootstrap() 가 preloadSheets() 로 사전 prefetch → 동기 getter 호출 가능.
 * - parsing logic 은 estimate-legacy/lib/code.js (PR #67) 와 1:1 동등.
 * - cache TTL 5분 (legacy 동작과 동일).
 * - SamhanLogis MS 위임은 인증 / snapshot / partner / 감사로그 만 유지.
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * legacy getHomeMulti() — 홈멀티 카탈로그.
 * estimate-legacy/lib/code.js (line 408) 1:1 포팅.
 */
function getHomeMulti() {
  const k = 'HM_FIX_V13';
  const hit = cacheGetJSON_(k);
  if (hit) return hit;

  const ss = SpreadsheetApp.openById(SRC_SHEET_ID);
  const sh = ss.getSheetByName(HOME_NAME);
  if (!sh) return [];

  const rng = sh.getDataRange();
  const vr = rng.getDisplayValues();
  const fr = rng.getFormulas();
  if (!vr.length) return [];

  let hdrRow = -1;
  for (let i = 0; i < Math.min(vr.length, 10); i++) {
    const row = (vr[i] || []).map((v) => String(v || '').trim());
    const H = row.map((v) => v.replace(/\s+/g, ''));
    const ok = H.includes('모델명') && H.includes('납품가') && (H.includes('품명') || H.includes('품') || H.includes('품목'));
    if (ok) { hdrRow = i; break; }
  }
  if (hdrRow < 0) hdrRow = 3;

  const Hraw = (vr[hdrRow] || []).map((v) => String(v || '').trim());
  const H = Hraw.map((v) => v.replace(/\s+/g, ''));
  const idxName = findIdx_(H, ['품명', '품', '품목', '항목']);
  const idxModel = findIdx_(H, ['모델명', '모델', '품목코드', '기종']);
  const idxUnit = findIdx_(H, ['단위']);
  const idxPrices = H.map((v, i) => v === '납품가' ? i : -1).filter((i) => i >= 0);
  const idxPrice = idxPrices.length ? idxPrices[idxPrices.length - 1] : -1;
  const idxCap = findIdx_(H, ['용량']);
  const idxSpec = findIdx_(H, ['규격']);
  const idxList = findIdx_(H, ['출고가', 'LIST', '리스트', '정가', '소비자가']);
  const idxFixDc = findIdx_(H, ['고정DC']);
  const idxNote = findIdx_(H, ['비고']);
  const idxMaxIn = findIdx_(H, ['최대 연결 실내기 대수']);

  const out = [];
  for (let r = hdrRow + 1; r < vr.length; r++) {
    const row = vr[r] || [];
    const name = (row[idxName] || '').toString().trim();
    const model = (row[idxModel] || '').toString().trim();
    const unit = idxUnit >= 0 ? (row[idxUnit] || '').toString().trim() : '';
    const price = idxPrice >= 0 ? parseKRNumber_(row[idxPrice]) : 0;
    const list = idxList >= 0 ? parseKRNumber_(row[idxList]) : 0;
    const capRaw = idxCap >= 0 ? row[idxCap] : '';
    const spec = idxSpec >= 0 ? String(row[idxSpec] || '').trim() : '';
    const fixDc = idxFixDc >= 0 ? String(row[idxFixDc] || '').trim() : '';
    const note = idxNote >= 0 ? String(row[idxNote] || '').trim() : '';
    const maxIn = idxMaxIn >= 0 ? parseKRNumber_(row[idxMaxIn]) : 0;

    if (!name || !model) continue;
    if (isBlockedByNote_(note)) continue;

    const priceFormula = (idxPrice >= 0 && fr[r] && fr[r][idxPrice]) ? String(fr[r][idxPrice]) : '';
    const useK2 = /\$L\$2/i.test(priceFormula);
    const cap = parseKRFloat_(capRaw);
    const cls = classifyHome_(name);
    const disp = cls.disp ? cls.disp : sanitizeDisp_(name);

    out.push({
      name, model, unit, price,
      list,
      formula: priceFormula,
      useK2,
      capacity: cap,
      spec,
      catL: cls.catL, catM: cls.catM, catS: cls.catS,
      disp,
      '고정DC': fixDc,
      note,
      maxIndoor: maxIn,
    });
  }

  cachePutJSON_(k, out, 60 * 10);
  return out;
}

/**
 * legacy getSingleSets() — 싱글 세트.
 * estimate-legacy/lib/code.js (line 532) 1:1 포팅.
 */
function getSingleSets() {
  const k = 'SS_FIX_V16';
  const hit = cacheGetJSON_(k);
  if (hit) return hit;

  const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName(SINGLE_NAME);
  if (!sh) return [];

  const vr = sh.getDataRange().getDisplayValues();
  const fr = sh.getDataRange().getFormulas();
  if (!vr.length) return [];

  let hdrRow = 0;
  for (let i = 0; i < Math.min(vr.length, 20); i++) {
    const row = vr[i].map((v) => String(v || '').trim());
    const rowNoSpace = row.map((v) => v.replace(/\s+/g, ''));
    if (rowNoSpace.includes('모델명') && rowNoSpace.includes('납품가') && rowNoSpace.includes('품명')) { hdrRow = i; break; }
  }
  if (hdrRow === 0) hdrRow = 2;

  const Hraw = vr[hdrRow].map((v) => String(v || '').trim());
  const H = Hraw.map((v) => v.replace(/\s+/g, ''));
  const idxName = findIdx_(H, ['품명', '품']);
  const idxSize = H.indexOf('평형');
  const idxModel = H.indexOf('모델명');
  const idxUnit = H.indexOf('단위');
  const idxNote = H.indexOf('비고');
  const idxList = H.indexOf('출고가');
  const idxPrices = H.map((v, i) => v === '납품가' ? i : -1).filter((i) => i >= 0);
  const idxPL = idxPrices.length ? idxPrices[0] : (H.indexOf('납품가') > -1 ? H.indexOf('납품가') : 6);
  const idxPR = idxPrices.length ? idxPrices[idxPrices.length - 1] : (idxPL + 1);

  const out = [];
  for (let r = hdrRow + 1; r < vr.length; r++) {
    const row = vr[r];
    const name0 = (row[idxName] || '').toString().trim();
    const name = sanitizeDisp_(name0);
    const size0 = (row[idxSize] || '').toString().trim();
    const size = normalizeSize_(size0);
    const model = (row[idxModel] || '').toString().trim();
    const unit = (row[idxUnit] || '').toString().trim() || 'SET';
    const note = idxNote >= 0 ? String(row[idxNote] || '').trim() : '';
    const priceLeft = parseKRNumber_(row[idxPL]);
    const priceRight = parseKRNumber_(row[idxPR]);

    let listPrice = 0;
    if (idxList >= 0) listPrice = parseKRNumber_(row[idxList]);

    if (!name || !model) continue;
    if (isBlockedByNote_(note)) continue;

    const sheetRow = r + 1;
    let matKey = 'D4';
    const fH = (fr[r] && fr[r][idxPR]) || '';
    if (/\$D\$7/.test(fH)) matKey = 'D7';
    else if (/\$D\$8/.test(fH)) matKey = 'D8';

    const cls = classifySingleSetLM_({ name, model });
    const sizeText = size ? size : '';

    const priceRaw = Number(priceRight) || 0;
    const price = priceRaw;
    const nameRaw = String(name0 || '');

    out.push({
      id: name + '|' + size + '|' + sheetRow,
      name: sanitizeDisp_(name0),
      nameRaw,
      size,
      sizeText,
      model,
      unit,
      row: sheetRow,
      priceRight,
      priceRaw,
      price,
      list: listPrice,
      matKey,
      catL: cls.L,
      catM: cls.M,
      note,
    });
  }

  cachePutJSON_(k, out, 60 * 10);
  return out;
}

/**
 * legacy getSingleParts() — 싱글 구성품.
 * estimate-legacy/lib/code.js (line 644) 1:1 포팅.
 */
function getSingleParts() {
  const k = 'SP_FIX_V14';
  const hit = cacheGetJSON_(k);
  if (hit) return hit;

  const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName(SINGLE_PARTS_NAME);
  if (!sh) return [];

  const rng = sh.getDataRange();
  const vr = rng.getDisplayValues();
  if (!vr.length) return [];

  const Hraw = (vr[1] || []).map((v) => String(v || '').trim());
  const H = Hraw.map((v) => v.replace(/\s+/g, ''));

  const idxSetName = findIdx_(H, ['품명', '품']);
  const idxModel = findIdx_(H, ['모델명', '모델', '품목코드', '기종']);
  const idxKind = findIdx_(H, ['구분']);
  const idxUnit = findIdx_(H, ['단위']);
  const idxPrices = H.map((v, i) => v === '납품가' ? i : -1).filter((i) => i >= 0);
  const idxPrice = idxPrices.length ? idxPrices[idxPrices.length - 1] : -1;
  const idxList = H.indexOf('출고가');
  const idxSetModel = findIdx_(H, ['세트']);
  const idxFeat = findIdx_(H, ['구성품특징', '특징']);
  const idxSpec = findIdx_(H, ['규격']);

  const out = [];
  for (let r = 2; r < vr.length; r++) {
    const row = vr[r] || [];
    const setModel = (row[idxSetModel] || '').toString().trim();
    if (!setModel) continue;

    const nameRaw = (row[idxSetName] || '').toString().trim();
    const name = sanitizeDisp_(nameRaw);
    const model = (row[idxModel] || '').toString().trim();
    const kind = (row[idxKind] || '').toString().trim();
    const unit = (row[idxUnit] || '').toString().trim() || 'EA';
    const price = idxPrice >= 0 ? parseKRNumber_(row[idxPrice]) : 0;
    const listPrice = idxList >= 0 ? parseKRNumber_(row[idxList]) : 0;
    const feat = (row[idxFeat] || '').toString().trim();
    const spec = idxSpec >= 0 ? (row[idxSpec] || '').toString().trim() : '';

    if (!name || !model) continue;

    const isDefault = /기본/.test(feat || '');

    out.push({
      setKey: '',
      linkRows: [],
      setModel,
      kind,
      model,
      unit,
      price,
      list: listPrice,
      name,
      feat,
      isDefault,
      spec,
    });
  }

  cachePutJSON_(k, out, 60 * 10);
  return out;
}

/**
 * legacy getSingleMatPrices() — 싱글 자재가.
 * estimate-legacy/lib/code.js (line 717) 1:1 포팅.
 */
function getSingleMatPrices() {
  const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName('싱글 자재가격');
  if (!sh) return {};
  const last = sh.getLastRow();
  const vals = sh.getRange(2, 1, Math.max(0, last - 1), 2).getDisplayValues();
  const map = {};
  vals.forEach(([name, price]) => {
    const key = String(name || '').trim();
    if (!key) return;
    map[key] = parseKRNumber_(price);
  });
  return map;
}

/**
 * legacy getCommercialMulti() — 상업멀티.
 * estimate-legacy/lib/code.js (line 812) 1:1 포팅.
 */
function getCommercialMulti() {
  const k = 'CM_FIX_V9';
  const hit = cacheGetJSON_(k);
  if (hit) return hit;

  const ss = SpreadsheetApp.openById(SRC_SHEET_ID);
  const sh = ss.getSheetByName(COMM_NAME);
  if (!sh) return [];

  const rng = sh.getDataRange();
  const vr = rng.getDisplayValues();
  const fr = rng.getFormulas();
  if (!vr.length) return [];

  let hdrRow = -1;
  for (let i = 0; i < Math.min(vr.length, 10); i++) {
    const row = (vr[i] || []).map((v) => String(v || '').trim());
    const H = row.map((v) => v.replace(/\s+/g, ''));
    const ok = H.includes('모델명') && H.includes('납품가') && (H.includes('품명') || H.includes('품') || H.includes('품목'));
    if (ok) { hdrRow = i; break; }
  }
  if (hdrRow < 0) hdrRow = 3;

  const Hraw = (vr[hdrRow] || []).map((v) => String(v || '').trim());
  const H = Hraw.map((v) => v.replace(/\s+/g, ''));

  const idxName = findIdx_(H, ['품명', '품', '품목', '항목']);
  const idxModel = findIdx_(H, ['모델명', '모델', '품목코드', '기종']);
  const idxUnit = findIdx_(H, ['단위']);
  const idxPrices = H.map((v, i) => v === '납품가' ? i : -1).filter((i) => i >= 0);
  const idxPrice = idxPrices.length ? idxPrices[idxPrices.length - 1] : -1;
  const idxList = findIdx_(H, ['출고가', 'LIST', '리스트', '정가', '소비자가']);
  const idxFixDc = findIdx_(H, ['고정DC']);
  const idxSpec = findIdx_(H, ['규격']);
  const idxCap = findIdx_(H, ['용량', '용량(kW)', '용량kW']);
  const idxCatL = findIdx_(H, ['대분류']);
  const idxNote = findIdx_(H, ['비고']);
  const idxMaxIn = findIdx_(H, ['최대 연결 실내기 대수']);

  const out = [];
  for (let r = hdrRow + 1; r < vr.length; r++) {
    const row = vr[r] || [];
    const name = (row[idxName] || '').toString().trim();
    const model = (row[idxModel] || '').toString().trim();
    const unit = idxUnit >= 0 ? (row[idxUnit] || '').toString().trim() : '';
    const price = idxPrice >= 0 ? parseKRNumber_(row[idxPrice]) : 0;
    const list = idxList >= 0 ? parseKRNumber_(row[idxList]) : 0;
    const spec = idxSpec >= 0 ? String(row[idxSpec] || '').trim() : '';
    const fixDc = idxFixDc >= 0 ? String(row[idxFixDc] || '').trim() : '';
    const note = idxNote >= 0 ? String(row[idxNote] || '').trim() : '';
    const maxIn = idxMaxIn >= 0 ? parseKRNumber_(row[idxMaxIn]) : 0;

    const capRaw = idxCap >= 0 ? row[idxCap] : '';
    const cap = parseKRFloat_(capRaw);

    const catLFromSheet = idxCatL >= 0 ? String(row[idxCatL] || '').trim() : '';
    const cls = classifyCommercial_(name, model);
    const catL = catLFromSheet || cls.catL;
    const catM = cls.catM;
    const catS = cls.catS;

    if (!name || !model) continue;
    if (isBlockedByNote_(note)) continue;

    const priceFormula = (idxPrice >= 0 && fr[r] && fr[r][idxPrice]) ? String(fr[r][idxPrice]) : '';
    const useK2 = /\$L\$2/i.test(priceFormula);

    out.push({
      name, model, unit, price,
      list,
      formula: priceFormula,
      useK2,
      capacity: cap,
      spec,
      catL, catM, catS,
      disp: sanitizeDisp_(name),
      '고정DC': fixDc,
      note,
      maxIndoor: maxIn,
    });
  }

  cachePutJSON_(k, out, 60 * 10);
  return out;
}

/**
 * legacy getCommercialParts() — 상업멀티 구성품.
 * estimate-legacy/lib/code.js (line 907) 1:1 포팅.
 */
function getCommercialParts() {
  const k = 'CP_FIX_V9';
  const hit = cacheGetJSON_(k);
  if (hit) return hit;

  const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName(COMM_PARTS_NAME);
  if (!sh) return [];

  const rng = sh.getDataRange();
  const vr = rng.getDisplayValues();
  if (!vr.length) return [];

  let hdrRow = -1;
  for (let i = 0; i < Math.min(vr.length, 10); i++) {
    const row = (vr[i] || []).map((v) => String(v || '').trim());
    const H = row.map((v) => v.replace(/\s+/g, ''));
    if (H.includes('세트') && H.includes('모델명')) { hdrRow = i; break; }
  }
  if (hdrRow < 0) hdrRow = 0;

  const Hraw = (vr[hdrRow] || []).map((v) => String(v || '').trim());
  const H = Hraw.map((v) => v.replace(/\s+/g, ''));

  const idxSetName = findIdx_(H, ['품명', '품']);
  const idxModel = findIdx_(H, ['모델명', '모델', '품목코드', '기종']);
  const idxKind = findIdx_(H, ['구분']);
  const idxUnit = findIdx_(H, ['단위']);
  const idxSetModel = findIdx_(H, ['세트']);
  const idxSpec = findIdx_(H, ['규격', '비고']);
  const idxList = findIdx_(H, ['출고가']);
  const idxPrice = findIdx_(H, ['납품가']);
  const idxQty = findIdx_(H, ['수량']);

  const start = hdrRow + 1;
  const out = [];

  for (let r = start; r < vr.length; r++) {
    const row = vr[r] || [];
    const setModel = (row[idxSetModel] || '').toString().trim();
    const nameRaw = (row[idxSetName] || '').toString().trim();
    const name = sanitizeDisp_(nameRaw);
    const model = (row[idxModel] || '').toString().trim();
    const kind = (row[idxKind] || '').toString().trim();
    const unit = (row[idxUnit] || '').toString().trim() || 'EA';
    const qty = idxQty >= 0 ? (row[idxQty] || '').toString().trim() : '1';
    const listVal = idxList >= 0 ? parseKRNumber_(row[idxList]) : 0;
    const priceVal = idxPrice >= 0 ? parseKRNumber_(row[idxPrice]) : 0;
    const basePrice = priceVal || listVal;
    const spec = idxSpec >= 0 ? (row[idxSpec] || '').toString().trim() : '';

    if (!name || !model) continue;
    if (isBlockedByNote_(spec)) continue;

    const isDefault = /기본/.test(kind || '');

    out.push({
      refModel: setModel,
      setKey: setModel,
      setModel,
      model,
      unit,
      price: basePrice,
      list: listVal,
      name,
      kind,
      isDefault,
      spec,
      qty,
    });
  }

  cachePutJSON_(k, out, 60 * 10);
  return out;
}

/**
 * legacy getOldProducts_() — 구품목 (단종/대체) 카탈로그.
 * estimate-legacy/lib/code.js (line 1753) 1:1 포팅.
 */
function getOldProducts_() {
  const ss = SpreadsheetApp.openById(SRC_SHEET_ID);
  const sheet = ss.getSheetByName('구형');
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const range = sheet.getRange(2, 1, lastRow - 1, 9);
  const values = range.getValues();
  const formulas = range.getFormulas();

  const result = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const form = formulas[i] || [];
    if (!row[0]) continue;

    let hasRef = false;
    if (form[5] && String(form[5]).indexOf('$I$1') > -1) hasRef = true;

    result.push({
      name: row[0],
      model: row[1],
      unit: row[2],
      price: row[3],
      sheetPrice: row[5],
      isDisc: hasRef,
      remarks: row[7],
      spec: row[8],
    });
  }
  return result;
}

/**
 * legacy getHomeDefaults() — 홈멀티 시트 상단 (1~2행) 기본값.
 * estimate-legacy/lib/code.js (line 1401) 1:1 포팅.
 */
function getHomeDefaults() {
  const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName(HOME_NAME);
  if (!sh) return {};
  const H = sh.getRange(1, 1, 2, 24).getDisplayValues();
  const nameRow = (H[0] || []).map((v) => String(v || '').trim());
  const valRow = (H[1] || []).map((v) => String(v || '').trim());

  const pick = (label, def) => {
    const i = nameRow.indexOf(label);
    if (i < 0) return def;
    const v = valRow[i];
    if (v === '' && typeof def === 'string') return def;
    if (/^(true|TRUE|1|예|Y)$/i.test(v)) return true;
    if (/^(false|FALSE|0|아니오|N)$/i.test(v)) return false;
    return v;
  };

  return {
    '유연호스 제외': !!pick('유연호스 제외', false),
    '분기관 제외': !!pick('분기관 제외', false),
    '발통포함': !!pick('발통포함', false),
    '리모컨': '선택 안함',
    '판넬변경': String(pick('판넬변경', '')),
  };
}

/**
 * legacy getSingleDefaults() — 싱글 시트 상단 기본값.
 * estimate-legacy/lib/code.js (line 1426) 1:1 포팅.
 */
function getSingleDefaults() {
  const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName(SINGLE_NAME);
  if (!sh) return {};
  const H = sh.getRange(1, 1, 2, 24).getDisplayValues();
  const nameRow = (H[0] || []).map((v) => String(v || '').trim());
  const valRow = (H[1] || []).map((v) => String(v || '').trim());

  const pick = (label, def) => {
    const i = nameRow.indexOf(label);
    if (i < 0) return def;
    const v = valRow[i];
    if (v === '' && typeof def === 'string') return def;
    if (/^(true|TRUE|1|예|Y)$/i.test(v)) return true;
    if (/^(false|FALSE|0|아니오|N)$/i.test(v)) return false;
    return v;
  };

  return {
    '유선리모컨': String(pick('유선리모컨', '')),
    '리모컨 제외': !!pick('리모컨 제외', false),
    '실외기 받침대 포함': !!pick('실외기 받침대 포함', false),
    '판넬변경': String(pick('판넬변경', '')),
    '360판넬': String(pick('360판넬', '원형')),
    '할인': parseKRNumber_(pick('할인', 0)),
    '1WAY할인': parseKRNumber_(pick('1WAY할인', 0)),
    '자재 포함 여부': String(pick('자재 포함 여부', '별도')),
  };
}

/**
 * legacy getRecommendOduData() — 추천실외기.
 * estimate-legacy/lib/code.js (line 1644) 1:1 포팅.
 */
function getRecommendOduData() {
  const sheet = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName('추천실외기');
  if (!sheet) return { comm: [], home: [], homeEx: [] };
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return { comm: [], home: [], homeEx: [] };

  const data = sheet.getRange(3, 1, Math.max(0, lastRow - 2), 5).getValues();
  const comm = [];
  const home = [];
  const homeEx = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] !== '' && data[i][0] != null) comm.push({ cap: Number(data[i][0]), hp: data[i][1] });
    if (data[i][2] !== '' && data[i][2] != null) home.push({ cap: Number(data[i][2]), hp: data[i][4] });
    if (data[i][3] !== '' && data[i][3] != null) homeEx.push({ cap: Number(data[i][3]), hp: data[i][4] });
  }
  return { comm, home, homeEx };
}

/**
 * legacy getSpecMap_() — 모델 → 규격 텍스트 단순 맵.
 * estimate-legacy/lib/code.js (line 989) 1:1 포팅.
 */
function getSpecMap_() {
  const key = 'SPEC_MAP_V4';
  const hit = cacheGetJSON_(key);
  if (hit) return hit;

  const ss = SpreadsheetApp.openById(SRC_SHEET_ID);
  const sheets = [HOME_NAME, SINGLE_PARTS_NAME, SINGLE_NAME, COMM_NAME, COMM_PARTS_NAME];
  const specMap = {};

  function scan(sheetName) {
    const sh = ss.getSheetByName(sheetName);
    if (!sh) return;
    const vr = sh.getDataRange().getDisplayValues();
    if (!vr.length) return;

    let hdrRow = -1;
    for (let i = 0; i < Math.min(vr.length, 10); i++) {
      const Hraw = (vr[i] || []).map((v) => String(v || '').trim());
      const H = Hraw.map((v) => v.replace(/\s+/g, ''));
      const iModel = findIdx_(H, ['모델명', '모델', '품목코드', '기종']);
      const iSpec = (sheetName === COMM_PARTS_NAME)
        ? findIdx_(H, ['비고', '규격'])
        : findIdx_(H, ['규격']);
      if (iModel >= 0 && iSpec >= 0) { hdrRow = i; break; }
    }
    if (hdrRow < 0) return;

    const Hraw = (vr[hdrRow] || []).map((v) => String(v || '').trim());
    const H = Hraw.map((v) => v.replace(/\s+/g, ''));
    const idxModel = findIdx_(H, ['모델명', '모델', '품목코드', '기종']);
    const idxSpec = (sheetName === COMM_PARTS_NAME)
      ? findIdx_(H, ['비고', '규격'])
      : findIdx_(H, ['규격']);
    if (idxModel < 0 || idxSpec < 0) return;

    for (let r = hdrRow + 1; r < vr.length; r++) {
      const row = vr[r] || [];
      const model = String(row[idxModel] || '').trim();
      const spec = String(row[idxSpec] || '').trim();
      if (!model) continue;
      if (spec && specMap[model] == null) specMap[model] = spec;
    }
  }

  sheets.forEach(scan);
  cachePutJSON_(key, specMap, 60 * 10);
  return specMap;
}

/**
 * legacy getSpecDetailMap_() — 모델별 상세 spec 맵 (홈 / 싱글 / 상업).
 * estimate-legacy/lib/code.js (line 1040) 의 핵심 logic 만 컴팩트하게 포팅.
 *
 * 본 PR scope: legacy 1:1 환원의 최소 골격 (모델 키 존재 보장 + home/single/comm 슬롯).
 * 상세 spec 필드 맵핑은 후속 PR (estimate-legacy 의 scanHome/scanSingle/scanComm 1100라인 별도 적용).
 */
function getSpecDetailMap_() {
  const key = 'SPEC_DETAIL_MAP_V10';
  const hit = cacheGetJSON_(key);
  if (hit) return hit;

  const ss = SpreadsheetApp.openById(SRC_SHEET_ID);
  const out = {};
  const normH = (v) => String(v || '').trim().replace(/\s+/g, '');

  function findHeaderRow(vr) {
    for (let i = 0; i < Math.min(vr.length, 10); i++) {
      const H = (vr[i] || []).map(normH);
      if (H.includes('모델명') || H.includes('모델') || H.includes('품목코드')) return i;
    }
    return -1;
  }

  function scanSlot(sheetName, slot) {
    const sh = ss.getSheetByName(sheetName);
    if (!sh) return;
    const vr = sh.getDataRange().getDisplayValues();
    const hr = findHeaderRow(vr);
    if (hr < 0) return;
    const H = (vr[hr] || []).map(normH);
    const iModel = findIdx_(H, ['모델명', '모델', '품목코드', '기종']);
    const iPipe = findIdx_(H, ['배관경']);
    const iGas = findIdx_(H, ['냉매가스']);
    const iBrk = findIdx_(H, ['차단기']);
    const iLine = findIdx_(H, ['전원선']);
    const iSize = findIdx_(H, ['제품크기']);
    const iWeight = findIdx_(H, ['제품중량']);
    if (iModel < 0) return;
    for (let r = hr + 1; r < vr.length; r++) {
      const row = vr[r] || [];
      const model = String(row[iModel] || '').trim();
      if (!model) continue;
      if (!out[model]) out[model] = {};
      out[model][slot] = {
        pipeDia: iPipe >= 0 ? row[iPipe] || '' : '',
        gas: iGas >= 0 ? row[iGas] || '' : '',
        breaker: iBrk >= 0 ? row[iBrk] || '' : '',
        powerLine: iLine >= 0 ? row[iLine] || '' : '',
        size: iSize >= 0 ? row[iSize] || '' : '',
        weight: iWeight >= 0 ? row[iWeight] || '' : '',
      };
    }
  }

  scanSlot(HOME_NAME, 'home');
  scanSlot(SINGLE_NAME, 'single');
  scanSlot(COMM_NAME, 'comm');

  cachePutJSON_(key, out, 60 * 10);
  return out;
}

/**
 * legacy getPriceIncData_() — 인상 전 단가 비교 데이터 (홈멀티/상업멀티/싱글).
 * estimate-legacy/lib/code.js (line 2803) 1:1 포팅.
 */
function getPriceIncData_() {
  const k = 'PRICE_INC_CACHE_V3';
  const hit = cacheGetJSON_(k);
  if (hit) return hit;

  const ss = SpreadsheetApp.openById(SRC_SHEET_ID);
  const out = { home: {}, comm: {}, single: {} };

  const readSheetTab = (sheetName, targetObj, isSingle) => {
    const sh = ss.getSheetByName(sheetName);
    if (!sh) return;
    const vr = sh.getDataRange().getValues();
    if (vr.length < 2) return;

    let hdrRow = -1;
    for (let i = 0; i < Math.min(vr.length, 10); i++) {
      const row = (vr[i] || []).map((v) => String(v || '').trim().replace(/\s+/g, ''));
      const hasModel = row.some((x) => ['모델명', '모델', '품목코드', '기종'].includes(x));
      const hasPrice = row.some((x) => ['출고가', '납품가'].includes(x));
      if (hasModel && hasPrice) { hdrRow = i; break; }
    }
    if (hdrRow < 0) return;

    const H = (vr[hdrRow] || []).map((v) => String(v || '').trim().replace(/\s+/g, ''));
    const idxModel = findIdx_(H, ['모델명', '모델', '품목코드', '기종']);
    const idxList = findIdx_(H, ['출고가', 'list', '리스트', '소비자가']);
    const idxPrices = H.map((v, i) => v === '납품가' ? i : -1).filter((i) => i >= 0);
    const idxPrice = idxPrices.length ? idxPrices[idxPrices.length - 1] : findIdx_(H, ['납품가']);
    if (idxModel < 0) return;

    for (let r = hdrRow + 1; r < vr.length; r++) {
      const model = String(vr[r][idxModel] || '').trim();
      if (!model) continue;
      if (isSingle) {
        if (!targetObj[model]) targetObj[model] = {};
        if (idxList >= 0) {
          const lPrice = parseKRNumber_(vr[r][idxList]);
          if (lPrice > 0) targetObj[model].list = lPrice;
        }
        if (idxPrice >= 0) {
          const pPrice = parseKRNumber_(vr[r][idxPrice]);
          if (pPrice > 0) targetObj[model].price = pPrice;
        }
      } else if (idxList >= 0) {
        const price = parseKRNumber_(vr[r][idxList]);
        if (price > 0) targetObj[model] = price;
      }
    }
  };

  readSheetTab('홈멀티', out.home, false);
  readSheetTab('상업멀티', out.comm, false);
  readSheetTab('상업멀티 구성', out.comm, false);
  readSheetTab('싱글 세트', out.single, true);
  readSheetTab('싱글 구성품', out.single, true);

  cachePutJSON_(k, out, 600);
  return out;
}

/**
 * legacy getLogoImage() — 로고 이미지.
 *
 * 본 PR 정책: 시트 데이터는 직접 read 환원, 그러나 Drive 이미지는 본 scope 외.
 * legacy DriveApp.getFolderById 흐름은 noop (apps-script-shim warn). 빈 string 반환.
 * 후속 PR 후보: drive-client.js 추가 또는 public/assets/logo.png 위임.
 */
function getLogoImage() {
  return '';
}

/**
 * legacy getGateImages() — 게이트 이미지.
 * 본 PR scope: 시트 데이터 직접 read 환원만. Drive 이미지는 빈 배열 반환.
 */
function getGateImages() {
  return [];
}

/* ════════════════════════════════════════════════════════════════════════
 * §4 doGet → bootstrap() — Express GET / 가 호출
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Express GET / 진입 시 호출 — legacy doGet() 1:1 호환 bootstrap.
 *
 * Apps Script doGet 은 SpreadsheetApp.openById 가 동기인 환경을 가정하지만
 * Node.js 에서는 sheet read 가 비동기. 따라서 사전에 preloadSheets 로 모든
 * 탭 (홈멀티 / 싱글 세트 / 싱글 구성품 / 상업멀티 / 상업멀티 구성 / 거래처 /
 * 담당자 등) 을 in-memory 로 채운 뒤 legacy 동기 함수들이 즉시 read 가능.
 *
 * Service Account 키 미설정 시 preloadSheets 가 모두 reject → 동기 getter 들이
 * 빈 sheet 반환 → 카탈로그 빈 배열 (legacy 동작과 동등 graceful).
 *
 * @param {string} userEmail — Session.getActiveUser().getEmail() 대체 (인증용)
 * @returns {Promise<object>} EJS render 데이터 (legacy doGet 가 t.* 로 채우는 항목)
 */
async function bootstrap(userEmail) {
  // legacy 가 read 하는 전 탭 prefetch (병렬). 누락 탭은 빈 sheet 반환.
  const sheetsToPreload = [
    HOME_NAME,
    SINGLE_NAME,
    SINGLE_PARTS_NAME,
    COMM_NAME,
    COMM_PARTS_NAME,
    CUSTOMERS_NAME,
    MANAGERS_NAME,
    '싱글 자재가격',
    '구형',
    '추천실외기',
    '홈멀티',
    '상업멀티',
    '상업멀티 구성',
    '싱글 세트',
    '싱글 구성품',
  ];
  try {
    await preloadSheets(SRC_SHEET_ID, sheetsToPreload);
  } catch (e) {
    Logger.log('[bootstrap] preloadSheets 실패: ' + (e && e.message));
  }

  const email = userEmail || Session.getActiveUser().getEmail();
  const t = {};
  t.userEmail = email;
  try { t.authData = JSON.stringify(await checkUserAuth(email)); } catch (_) { t.authData = '{}'; }
  try { t.homemulti = JSON.stringify(getHomeMulti()); } catch (_) { t.homemulti = '[]'; }
  try { t.singleSets = JSON.stringify(getSingleSets()); } catch (_) { t.singleSets = '[]'; }
  try { t.singleParts = JSON.stringify(getSingleParts()); } catch (_) { t.singleParts = '[]'; }
  try { t.homeDefaults = JSON.stringify(getHomeDefaults()); } catch (_) { t.homeDefaults = '{}'; }
  try { t.singleDefaults = JSON.stringify(getSingleDefaults()); } catch (_) { t.singleDefaults = '{}'; }
  try { t.singleMatPrices = JSON.stringify(getSingleMatPrices()); } catch (_) { t.singleMatPrices = '{}'; }
  try { t.commercialMulti = JSON.stringify(getCommercialMulti()); } catch (_) { t.commercialMulti = '[]'; }
  try { t.commercialParts = JSON.stringify(getCommercialParts()); } catch (_) { t.commercialParts = '[]'; }
  try { t.oldProducts = JSON.stringify(getOldProducts_()); } catch (_) { t.oldProducts = '[]'; }
  try { t.recommendData = JSON.stringify(getRecommendOduData()); } catch (_) { t.recommendData = '{"comm":[],"home":[],"homeEx":[]}'; }
  try { t.specDetailMap = JSON.stringify(getSpecDetailMap_()); } catch (_) { t.specDetailMap = '{}'; }
  try { t.priceInc = JSON.stringify(getPriceIncData_()); } catch (_) { t.priceInc = '{"home":{},"comm":{},"single":{}}'; }
  try { t.logoData = getLogoImage(); } catch (_) { t.logoData = ''; }
  t.config = JSON.stringify({
    homeDiscount: DISCOUNT_RATE_HOME,
    commDiscount: DISCOUNT_RATE_COMM,
    showIHose: SHOW_I_HOSE,
    discount360: DISCOUNT_360_AMT,
    discount4way: DISCOUNT_4WAY_AMT,
    discountStand: DISCOUNT_STAND_AMT,
    oneWayDiscount: ONEWAY_DISCOUNT_AMT,
    deluxeDiscount: DELUXE_DISCOUNT_AMT,
    firstGradeDiscount: FIRSTGRADE_DISCOUNT_AMT,
    oldDiscount: 0.5,
    unitRoundTo: UNIT_ROUND_TO,
    unitRoundMode: UNIT_ROUND_MODE,
  });
  return t;
}

/**
 * 시트 캐시 강제 무효화 — POST /rpc/clearSheetCache.
 */
function clearSheetCache() {
  if (typeof _clearSheetCacheShim === 'function') _clearSheetCacheShim();
  return { ok: true };
}

/* ════════════════════════════════════════════════════════════════════════
 * §5 거래처 / 담당자 — partner-service 위임
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * legacy getCustomerDataAsync(forceRefresh) — 거래처 목록 (시트 직접 read).
 * estimate-legacy/lib/code.js (line 1454) 1:1 포팅.
 */
function getCustomerDataAsync(forceRefresh) {
  if (forceRefresh) cacheRemoveJSON_('CUS_V6');
  const raw = getCustomers_();
  return raw.map((c) => ({
    code: c.code, name: c.name, rep: c.rep, tel: c.tel, addr: c.addr, group: c.group, note: c.note,
  }));
}

/**
 * legacy getCustomers_() — 거래처 시트 read.
 * estimate-legacy/lib/code.js (line 1463) 1:1 포팅.
 */
function getCustomers_() {
  const key = 'CUS_V6';
  const hit = cacheGetJSON_(key);
  if (hit) return hit;

  const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName(CUSTOMERS_NAME);
  if (!sh) return [];
  const vr = sh.getDataRange().getDisplayValues();
  if (!vr.length) return [];

  const H = vr[0].map((v) => String(v || '').trim());
  const idx = (n) => H.indexOf(n);
  const idxCode = idx('거래처코드');
  const idxMgr = idx('담당자명');
  const idxName = idx('거래처명');
  const idxRep = idx('대표자명');
  const idxAddr = idx('주소');
  const idxTel = idx('전화번호');
  const idxSpec = idx('특이사항');
  const idxGroup = idx('그룹');
  const idxDisc = idx('싱글 할인');
  const idxBiz = idx('사업자등록번호');
  const idxMgrTel = idx('담당자연락처');

  const out = [];
  for (let r = 1; r < vr.length; r++) {
    const row = vr[r] || [];
    const code = String(row[idxCode] || '').trim();
    const name = String(row[idxName] || '').trim();
    const biz = idxBiz >= 0 ? String(row[idxBiz] || '').replace(/[^\d]/g, '') : '';
    if (!code && !biz) continue;
    out.push({
      code,
      name,
      bizno: biz,
      manager: String(row[idxMgr] || '').trim(),
      managerTel: idxMgrTel >= 0 ? String(row[idxMgrTel] || '').trim() : '',
      rep: String(row[idxRep] || '').trim(),
      addr: String(row[idxAddr] || '').trim(),
      tel: String(row[idxTel] || '').trim(),
      note: String(row[idxSpec] || '').trim(),
      group: String(row[idxGroup] || '').trim(),
      singleDiscount: parseKRNumber_(row[idxDisc]),
    });
  }

  cachePutJSON_(key, out, 60 * 10);
  return out;
}

/**
 * legacy searchCustomerByBizOrCode(input) — 사업자번호 / 거래처코드 검색.
 * estimate-legacy/lib/code.js (line 1514) 1:1 포팅.
 */
function searchCustomerByBizOrCode(input) {
  const n = String(input || '').replace(/[^\d]/g, '');
  const c = String(input || '').trim();
  const list = getCustomers_();

  if (n) {
    const f1 = list.find((x) => x.bizno && x.bizno === n);
    if (f1) return f1;
    const f2 = list.find((x) => String(x.code || '').replace(/[^\d]/g, '') === n);
    if (f2) return f2;
  }
  if (c) {
    const f3 = list.find((x) => x.code === c);
    if (f3) return f3;
  }
  return null;
}

function searchCustomerByBizno(bizno) {
  return searchCustomerByBizOrCode(bizno);
}

/**
 * legacy getManagers_() — 담당자 시트 read.
 * estimate-legacy/lib/code.js (line 1533) 1:1 포팅.
 */
function getManagers_() {
  const key = 'MGR_V1';
  const hit = cacheGetJSON_(key);
  if (hit) return hit;

  const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName(MANAGERS_NAME);
  if (!sh) return [];
  const vr = sh.getDataRange().getDisplayValues();
  if (vr.length < 2) return [];

  const H = (vr[0] || []).map((v) => String(v || '').trim());
  const iName = H.indexOf('담당자명');
  const iCode = H.indexOf('담당자코드');
  if (iName < 0 || iCode < 0) return [];

  const out = [];
  for (let r = 1; r < vr.length; r++) {
    const row = vr[r] || [];
    const name = String(row[iName] || '').trim();
    const code = String(row[iCode] || '').trim();
    if (!name || !code) continue;
    out.push({
      '담당자명': name,
      '담당자코드': code,
      manager: name,
      empCd: code,
    });
  }
  cachePutJSON_(key, out, 60 * 10);
  return out;
}

function searchManagersByName_(query) {
  const q = String(query || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!q) return [];
  const list = getManagers_();
  return list.filter((r) => String(r['담당자명'] || '').toLowerCase().replace(/\s+/g, '').includes(q));
}

function findManagerByNameExact_(name) {
  const n = String(name || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!n) return null;
  const list = getManagers_();
  const f = list.find((r) => String(r['담당자명'] || '').toLowerCase().replace(/\s+/g, '') === n);
  return f ? { name: f['담당자명'], empCd: f['담당자코드'] } : null;
}

function getManagersForInput(input) {
  return searchManagersByName_(input);
}

/**
 * legacy initDcConfigFromNotion(bizno) — 거래처별 DC config 로드.
 *
 * Phase 6 M3 (dc-config-service) 가용성 가정. endpoint 호출 실패 (네트워크 / 5xx / 404)
 * 는 default DC config 환원 — DC config 미설정 거래처는 default 율로 진행하는 것이
 * legacy 동작이다 (silent mock fallback 이 아닌 정상 비즈니스 로직).
 */
async function initDcConfigFromNotion(bizno) {
  const biznoDigits = String(bizno || '').replace(/[^\d]/g, '');
  if (!biznoDigits) return buildDefaultDcConfig_();

  const cust = searchCustomerByBizOrCode(biznoDigits);
  let data = null;
  try {
    data = await _msGet(
      `${PARTNER_BASE}/api/v1/partners/${biznoDigits}/dc-config`,
      null,
    );
  } catch (e) {
    Logger.log(`[initDcConfigFromNotion] dc-config 조회 실패 → default 환원 (${e.message})`);
  }
  if (!data) return Object.assign(buildDefaultDcConfig_(), { customer: cust });
  return Object.assign(buildDefaultDcConfig_(), data, { customer: cust });
}

async function fetchNotionDcConfig_(biznoDigits) {
  return initDcConfigFromNotion(biznoDigits);
}

/* ════════════════════════════════════════════════════════════════════════
 * §6 e-Count session — DEPRECATED (slip-bridge 가 흡수)
 * 호환성을 위해 stub 유지 — getInventoryTable 만 mock 응답
 * ═══════════════════════════════════════════════════════════════════════ */

function getScriptCreds_() {
  const sp = PropertiesService.getScriptProperties();
  return {
    COM_CODE: sp.getProperty('COM_CODE') || '174539',
    USER_ID: sp.getProperty('USER_ID') || '11840720103',
    API_CERT_KEY: sp.getProperty('API_CERT_KEY') || 'REDACTED',
    EMP_CD: sp.getProperty('EMP_CD') || '250102',
  };
}

async function callZoneApi(_comCode) {
  Logger.log('[deprecated] callZoneApi → noop (e-Count 폐기)');
  return 'CB';
}

async function getEcountSession(_authInfo) {
  Logger.log('[deprecated] getEcountSession → noop (e-Count 폐기, slip-bridge 사용)');
  return { sessionId: 'DEPRECATED', zone: 'CB' };
}

async function getInventoryTableHtml(_baseDate, _itemCodes) {
  Logger.log('[deprecated] getInventoryTableHtml → mock (e-Count 폐기)');
  return '<table><tr><td>재고 조회 endpoint 미구현 (M1a 후속)</td></tr></table>';
}

async function getInventoryTable(dateVal, itemCodes) {
  return getInventoryTableHtml(dateVal, itemCodes);
}

/* ════════════════════════════════════════════════════════════════════════
 * §7 출고전표 — sendOrderFromUi → slip-bridge.postSlip
 * legacy line 1762-1967 의 e-Count proxy 호출을 slip-service 로 대체
 * ═══════════════════════════════════════════════════════════════════════ */

function decideWarehouseCode_(items) {
  function getOrigName_(it) { return String(it.origName || it.name || it.model || ''); }
  function getSection_(it) { return String(it.section || '').toUpperCase(); }
  if (!Array.isArray(items)) return '2';
  for (const it of items) {
    const sec = getSection_(it);
    const nm = getOrigName_(it);
    if (sec === 'SINGLE' || /^A[CPRF]/.test(nm)) return '00003';
  }
  return '2';
}

/**
 * legacy sendOrderFromUi(data) (line 1762-1967) — 견적 finalize → 출고전표 생성.
 *
 * legacy 흐름: SaleList 조립 → e-Count `/proxy/ecount/sale` POST → Notion saveOrderToNotion
 * 신 흐름: SaleList 조립 (legacy logic 그대로) → slip-bridge.postSlip (slip-service POST)
 *          Notion 저장 폐기 (slip-service 가 entity 영속화)
 */
async function sendOrderFromUi(data) {
  try {
    let items = [];
    if (data && data.items) {
      items = (typeof data.items === 'string') ? JSON.parse(data.items) : data.items;
    }
    const order = data;
    const authInfo = order.auth || {};
    const safeNum = (s) => String(s || '').replace(/[^\d]/g, '');
    const kst = Session.getScriptTimeZone();
    const toYmd = (v) => v
      ? Utilities.formatDate(new Date(v), kst, 'yyyyMMdd')
      : Utilities.formatDate(new Date(), kst, 'yyyyMMdd');

    if (!Array.isArray(items) || items.length === 0) return { ok: false, error: '항목없음' };

    const cleaned = items.filter((it) =>
      !(String(it.unit || '').toUpperCase() === 'SET' && it.section === 'SET' && it.sendAsSet !== true),
    );

    const merged = cleaned.map((it, idx) => ({
      ...it,
      qty: Number(it.qty) || 0,
      _last: idx,
      REMARKS: String(it.remarks || it.REMARKS || ''),
    }));

    let key = safeNum(order?.bizno || '');
    if (!key && order?.custCode) key = String(order.custCode).trim();
    const custRec = await searchCustomerByBizOrCode(key);
    if (!custRec) return { ok: false, error: '미등록거래처' };
    const custFinal = custRec.code;

    const ioDate = toYmd(order?.due || '');
    const timeDate = ioDate;

    let payMMDD = '';
    if (order?.payDue === '카드결제') {
      payMMDD = '카드결제';
    } else if (order?.payDue) {
      const pd = new Date(order.payDue);
      if (!isNaN(pd)) payMMDD = Utilities.formatDate(pd, kst, 'MMdd');
      else payMMDD = order.payDue;
    }

    const whCd = (order && order.whCode) ? order.whCode : decideWarehouseCode_(merged);

    let empCdFinal = authInfo.managerCode;
    if (!empCdFinal) {
      if (custRec.manager) {
        const m = await findManagerByNameExact_(custRec.manager);
        if (m) empCdFinal = m.empCd;
      }
      if (!empCdFinal) empCdFinal = getScriptCreds_().EMP_CD;
    }

    const SaleList = [];

    merged.forEach((it) => {
      const qty = Math.round(Number(it.qty) || 0);
      if (qty === 0) return;

      const priceVat = Math.round(Number(it.price) || 0);
      const total = priceVat * qty;
      const sup = Math.round(Math.abs(total) / 1.1);
      const vat = Math.abs(total) - sup;
      const supply = total < 0 ? -sup : sup;
      const vatAmt = total < 0 ? -vat : vat;
      const priceEx = priceVat < 0
        ? -Math.round(Math.abs(priceVat) / 1.1)
        : Math.round(priceVat / 1.1);

      let rawSpec = String(it.spec || '').trim();
      if (/경동.*[\/:]/.test(String(order?.addr || ''))) {
        Logger.log(`[경동] 모델:${it.model} / list:${it.list} / 전체:${JSON.stringify(it)}`);
        rawSpec = String(it.list || 0);
      }
      const sizeDes = rawSpec === '' ? '​' : rawSpec;

      SaleList.push({
        BulkDatas: {
          IO_DATE: ioDate,
          UPLOAD_SER_NO: '1',
          CUST: custFinal,
          CUST_DES: custRec.name || '',
          EMP_CD: empCdFinal || '',
          WH_CD: whCd || '100',
          IO_TYPE: '10',
          PJT_CD: '',
          TTL_CTT: '',
          REF_DES: '',
          COLL_TERM: '',
          AGREE_TERM: '',
          TIME_DATE: timeDate,
          U_MEMO1: String(custRec.tel || ''),
          U_MEMO2: String(custRec.addr || ''),
          U_MEMO3: String(custRec.rep || ''),
          U_TXT1: String(order?.addr || ''),
          ADD_TXT_01_T: String(order?.auditAddr || ''),
          ADD_TXT_03_T: String(order?.tel || ''),
          ADD_TXT_04_T: String(order?.memo || ''),
          ADD_TXT_05_T: payMMDD,
          ADD_TXT_06_T: String(order?.dcInfo || ''),
          PROD_CD: String(it.model),
          PROD_DES: '',
          SIZE_DES: sizeDes,
          QTY: String(qty),
          PRICE: String(priceEx),
          USER_PRICE_VAT: String(Math.abs(priceVat)),
          SUPPLY_AMT_F: '0',
          SUPPLY_AMT: String(supply),
          VAT_AMT: String(vatAmt),
          REMARKS: String(it.REMARKS || ''),
        },
      });
    });

    if (SaleList.length === 0) return { ok: false, error: '유효수량없음' };

    Logger.log('📤 slip-service POST 시작');
    const result = await slipBridge.postSlip(order, SaleList);
    if (!result.ok) {
      Logger.log(`[slip-bridge] 실패: ${result.error || ''}`);
      return { ok: false, error: result.error || 'slip-service 실패', body: result.body };
    }
    return { ok: true, slipNo: result.slipNo, body: result.body };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

/**
 * legacy saveOrderToNotion(info, items, slipNo) (line 2233) — 폐기 (slip-service 가 entity 영속화).
 * 시그니처 보존 — RPC dispatch 호환성용 stub.
 */
async function saveOrderToNotion(_info, _items, _slipNo) {
  Logger.log('[deprecated] saveOrderToNotion → noop (slip-service 가 영속화)');
  return { ok: true, deprecated: true };
}

/* ════════════════════════════════════════════════════════════════════════
 * §8 Notion 이력 조회 — SamhanLogis MS 위임
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * legacy getNotionHistory(startDate, endDate) (line 2308) — 출고 이력.
 * SamhanLogis: GET /api/v1/partner-orders?startDate=&endDate=
 */
async function getNotionHistory(startDate, endDate) {
  const email = Session.getActiveUser().getEmail();
  const data = await _msGet(
    `${BASE_URL}/api/v1/partner-orders`,
    { startDate, endDate, userEmail: email },
  );
  return Array.isArray(data) ? data : data?.items || [];
}

/* ════════════════════════════════════════════════════════════════════════
 * §9 견적 snapshot — estimate-service 위임
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * legacy saveQuoteSnapshot(payload) (line 2614).
 * SamhanLogis: POST /api/v1/estimates/snapshots
 */
async function saveQuoteSnapshot(payload) {
  const email = Session.getActiveUser().getEmail();
  const body = {
    userEmail: email,
    createdAt: new Date().toISOString(),
    ...payload,
  };
  const result = await _msPost(
    `${ESTIMATE_BASE}/api/v1/estimates/snapshots`,
    body,
  );
  return result;
}

/**
 * legacy getQuoteHistory(startDate, endDate) (line 2681).
 * SamhanLogis: GET /api/v1/estimates/snapshots?startDate=&endDate=
 */
async function getQuoteHistory(startDate, endDate) {
  const email = Session.getActiveUser().getEmail();
  const data = await _msGet(
    `${ESTIMATE_BASE}/api/v1/estimates/snapshots`,
    { startDate, endDate, userEmail: email },
  );
  // SamhanLogis ApiResponse 봉투 {success, data:[...]} / raw 배열 / {items} 모두 허용.
  // 봉투의 .data 미언래핑 시 목록이 항상 비어 복원 불가(legacy 노션 대체 회귀 방지).
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

/* ════════════════════════════════════════════════════════════════════════
 * §10 인증 & 로그
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * legacy checkUserAuth(email) (line 2442).
 * SamhanLogis: GET /api/v1/auth/me?email=
 */
async function checkUserAuth(email) {
  const data = await _msGet(
    `${BASE_URL}/api/v1/auth/me`,
    { email: email || Session.getActiveUser().getEmail() },
  );
  return data;
}

async function forceAuth() {
  Logger.log('[deprecated] forceAuth → noop (Drive 권한 부여 폐기)');
  return { ok: true };
}

/**
 * legacy logFrontEvent(group, msg, isMobile, mgrName) (line 2410).
 * SamhanLogis: POST /api/v1/audit-logs/front
 */
async function logFrontEvent(group, msg, isMobile, mgrName) {
  const email = Session.getActiveUser().getEmail();
  const body = {
    group, message: msg, device: isMobile ? '모바일' : 'PC',
    managerName: mgrName, userEmail: email, occurredAt: new Date().toISOString(),
  };
  // 감사 로그 전송 실패는 swallow — 사용자 흐름 차단 회피 (legacy sendLog 동작 보존).
  try {
    await _msPost(AUDIT_LOG_URL, body);
  } catch (e) {
    Logger.log(`[logFrontEvent] audit-log 전송 실패 (무시): ${e.message}`);
  }
  return { ok: true };
}

/* ════════════════════════════════════════════════════════════════════════
 * §11 spec map (sendOrderFromUi 보조)
 *
 * §3 의 getSpecMap_() 시트 직접 read 버전이 단일 진실원 (single source of truth).
 * 본 섹션은 stub 만 유지 (legacy doc 보존용).
 * ═══════════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════════════
 * §12 include — Apps Script 의 server-side template include 호환
 * Express 환경에서는 EJS partials 가 처리하므로 stub.
 * ═══════════════════════════════════════════════════════════════════════ */

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ════════════════════════════════════════════════════════════════════════
 * §13 doGet stub — Express 가 직접 라우팅하므로 호환성 stub 만 유지
 * ═══════════════════════════════════════════════════════════════════════ */

async function doGet() {
  Logger.log('[shim] doGet → Express 가 routes/index.js 에서 처리');
  return await bootstrap();
}

/* ════════════════════════════════════════════════════════════════════════
 * 외부 노출 — 76 함수 inventory 모두
 * ═══════════════════════════════════════════════════════════════════════ */

module.exports = {
  // §1 캐시
  cachePutJSON_, cacheGetJSON_, cacheRemoveJSON_,
  // §2 유틸
  normalizeSize_, findIdx_, parseKRNumber_, parseKRFloat_,
  toYmd_, toMmDd_, normalizeTel_, todayYMD_, _normSpec_,
  sanitizeKoreanParen_, trimSymbols_, sanitizeDisp_, hpFromText_,
  isBlockedByNote_, isSoldOutByNote_, unifyCatL_,
  classifyHome_, classifySingleSetLM_, findHeaderIndex_,
  extractRowsFromFormula_, classifyCommercial_,
  formatWonDiscountLabel_, formatPercentLabel_, combineRemarks_,
  detectHomeOrder, buildDefaultDcConfig_, decideWarehouseCode_,
  // §3 부트스트랩
  getHomeMulti, getSingleSets, getSingleParts, getSingleMatPrices,
  getCommercialMulti, getCommercialParts, getOldProducts_,
  getHomeDefaults, getSingleDefaults, getRecommendOduData,
  getSpecDetailMap_, getPriceIncData_, getLogoImage, getGateImages,
  // §4 doGet
  doGet, bootstrap, clearSheetCache,
  // §5 거래처/담당자
  getCustomerDataAsync, getCustomers_, searchCustomerByBizOrCode,
  searchCustomerByBizno, getManagers_, searchManagersByName_,
  findManagerByNameExact_, getManagersForInput,
  initDcConfigFromNotion, fetchNotionDcConfig_,
  // §6 e-Count (deprecated stub)
  getScriptCreds_, callZoneApi, getEcountSession,
  getInventoryTableHtml, getInventoryTable,
  // §7 출고전표
  sendOrderFromUi, saveOrderToNotion,
  // §8 Notion 이력
  getNotionHistory,
  // §9 snapshot
  saveQuoteSnapshot, getQuoteHistory,
  // §10 인증 / 로그
  checkUserAuth, forceAuth, logFrontEvent,
  // §11 spec map
  getSpecMap_,
  // §12 include
  include,

  // 공개 상수 (테스트용)
  _constants: {
    SRC_SHEET_ID, HOME_NAME, SINGLE_NAME, SINGLE_PARTS_NAME,
    COMM_NAME, COMM_PARTS_NAME, CUSTOMERS_NAME, MANAGERS_NAME,
    DISCOUNT_RATE_HOME, DISCOUNT_RATE_COMM, SHOW_I_HOSE,
    UNIT_ROUND_TO, UNIT_ROUND_MODE,
  },
};
