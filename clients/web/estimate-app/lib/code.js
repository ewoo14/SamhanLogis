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
// 품목 일부 / 추천실외기 / 단가인상 등 잔여 시트 데이터는 google-sheets-client 직접 read.
// 거래처/담당자는 G2부터 partner-service/user-service directory endpoint 로 치환.
const PARTNER_BASE = process.env.PARTNER_SERVICE_URL || BASE_URL;
const ESTIMATE_BASE = process.env.ESTIMATE_SERVICE_URL || BASE_URL;
// #29: 거래처별 DC 설정 = dc-config-service internal endpoint (X-Internal-Token).
// PARTNER_SERVICE_URL(:8089) 이 dc-config-service 를 가리킨다.
const DC_CONFIG_BASE = process.env.DC_CONFIG_SERVICE_URL || PARTNER_BASE;
const DC_INTERNAL_TOKEN =
  process.env.SAMHAN_INTERNAL_TOKEN ||
  process.env.INTERNAL_AUTH_TOKEN ||
  'dev-internal-token-change-me';
const AUDIT_LOG_URL = process.env.AUDIT_LOG_URL || `${BASE_URL}/api/v1/audit-logs/front`;

// #31 — 라이브(06-09) 주소검색/지오코딩 자격 (legacy Code.js 3014-3025, env 주입).
// 미설정 키는 해당 검색 소스만 제외 (legacy 동작 동일 — if (KEY) 가드).
const NAVER_SEARCH_ID = process.env.NAVER_SEARCH_CLIENT_ID || '';
const NAVER_SEARCH_SECRET = process.env.NAVER_SEARCH_CLIENT_SECRET || '';
const NAVER_MAP_KEY_ID = process.env.NAVER_MAP_KEY_ID || '';
const NAVER_MAP_KEY = process.env.NAVER_MAP_KEY || '';
const ROAD_API_KEY = process.env.JUSO_ROAD_API_KEY || '';
// #31 — 접속 게이트(checkUserAuth) = user-service internal by-email
const USER_SERVICE_BASE = process.env.USER_SERVICE_URL || 'http://localhost:8083';

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
const DEFAULT_ESTIMATE_CONFIG = {
  commonHomeDiscountRate: DISCOUNT_RATE_HOME,
  commonCommercialDiscountRate: DISCOUNT_RATE_COMM,
  oldProductDiscountRate: 0.5,
  vatRate: 0.1,
  cardFeeRate: 0.03,
  advanceDiscountRate: 0,
  comboWarnRate: 0,
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
  footerNotice: [
    '※ 분기관은 임의 산정입니다.',
    '※ 견적 내용 확정 시 재고확인 요청 부탁드립니다.',
    '※ 본 견적은 견적일로부터 30일 이내에만 유효합니다.',
    '※ 공공기관 발주 현장의 경우 본 견적은 무효이며, 별도의 검토가 필요합니다.',
  ].join('\n'),
};

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
  for (let i = 0; i < row.length; i++) if (keys.some((k) => row[i] === k.replace(/\s+/g, ''))) return i;
  return -1;
}

function parseKRNumber_(v) {
  const s = String(v == null ? '' : v).replace(/[^\d.-]/g, '').replace(/^-+/, '-');
  if (!s || s === '-') return 0;
  const n = Number(s);
  return isFinite(n) ? Math.round(n) : 0;
}

function parseKRFloat_(v) {
  const s = String(v == null ? '' : v).replace(/[^\d.+-]/g, '').replace(/^-+/, '-').replace(',', '.');
  if (!s || s === '-') return 0;
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

function toYmd_(v, tz) {
  if (!v) return '';
  const z = tz || Session.getScriptTimeZone();
  if (/^\d{8}$/.test(String(v))) return String(v);
  const d = new Date(v); if (isNaN(d)) return '';
  return Utilities.formatDate(d, z, 'yyyyMMdd');
}

function toMmDd_(v, tz) {
  if (!v) return '';
  const z = tz || Session.getScriptTimeZone();
  const d = /^\d{8}$/.test(String(v)) ? new Date(String(v).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')) : new Date(v);
  if (isNaN(d)) return '';
  return Utilities.formatDate(d, z, 'MMdd');
}

function normalizeTel_(s) {
  const n = String(s || '').replace(/[^\d]/g, '');
  if (!n) return '';
  if (n.length === 11 && n.startsWith('010')) return `010-${n.slice(3, 7)}-${n.slice(7)}`;
  if (n.length === 10 && n.startsWith('010')) return `010-${n.slice(3, 6)}-${n.slice(6)}`;
  return n;
}

function todayYMD_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
}

function _normSpec_(s) {
  return String(s || '').replace(/\s+/g, '').toLowerCase();
}

function sanitizeKoreanParen_(text) {
  let s = String(text || '');
  s = s.replace(/\(([^)]*)\)/g, function (m, inner) { return /[가-힣]/.test(inner) ? m : ''; });
  s = s.replace(/\[([^\]]*)\]/g, function (m, inner) { return /[가-힣]/.test(inner) ? m : ''; });
  s = s.replace(/\{([^}]*)\}/g, function (m, inner) { return /[가-힣]/.test(inner) ? m : ''; });
  s = s.replace(/<([^>]*)>/g, function (m, inner) { return /[가-힣]/.test(inner) ? m : ''; });
  return s;
}

function trimSymbols_(text) {
  return String(text || '').replace(/[~`!@#$%^&*_\-+=\\|/;:'",.<>?·•]/g, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeDisp_(text) {
  return trimSymbols_(sanitizeKoreanParen_(text));
}

// 마력 추출
function hpFromText_(s) {
  const t = String(s || '');
  let m = t.match(/(\d+(?:[.,]\d+)?)\s*hp/i);
  if (!m) m = t.match(/(\d+(?:[.,]\d+)?)\s*마력/i);
  if (!m) return '';
  const num = String(m[1]).replace(',', '.');
  return `${num}HP`;
}

// 미표시 품목
function isBlockedByNote_(note) {
  const s = String(note || '').replace(/\s+/g, '');
  if (!s) return false;
  return /미판매|단종/.test(s);
}

// 품절표시 품목
function isSoldOutByNote_(note) {
  const s = String(note || '').replace(/\s+/g, '');
  if (!s) return false;
  return /품절/.test(s);
}

function unifyCatL_(L) {
  const t = String(L || '').trim();
  return t === '부자재2' ? '부자재' : t;
}

// 헤더 인덱스 찾기 공백 무시
function findHeaderIndex_(headers, key) {
  const norm = (s) => String(s || '').replace(/\s+/g, '').trim();
  const target = norm(key);
  if (!Array.isArray(headers)) return -1;
  for (let i = 0; i < headers.length; i++) {
    if (norm(headers[i]) === target) return i;
  }
  return -1;
}

// 세트참조
function extractRowsFromFormula_(formula) {
  if (!formula) return [];
  const f = String(formula);
  const rows = [];
  const re = /'싱글 세트(?:_단가인상)?'!\$?[A-Z]\$?(\d+)/ig;
  let m; while ((m = re.exec(f))) rows.push(parseInt(m[1], 10));
  return rows;
}

// 금액형 DC 축약
function formatWonDiscountLabel_(amt) {
  const v = Math.round(Number(amt) || 0);
  if (!v) return '';

  const abs = Math.abs(v);
  const man = Math.floor(abs / 10000);
  const chun = Math.round((abs % 10000) / 1000);

  let label = '';
  if (man > 0 && chun > 0) {
    label = `${man}만${chun}천`;
  } else if (man > 0) {
    label = `${man}만`;
  } else {
    label = `${chun}천`;
  }
  // 항상 할인은 '-' 로
  return `-${label}`;
}

// 퍼센트 DC 텍스트
function formatPercentLabel_(rate) {
  const r = Number(rate);
  if (!isFinite(r)) return '';
  return `${Math.round(r * 100)}%`;
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

      const m = String(it.model || '').toUpperCase();
      if (/AJ0|AJ1|AM0|AM1/.test(m)) { return true; }
    }
  }
  return false;
}

// DC 설정 기본값 생성 — legacy 라이브 flat shape (homeDiscount 등 11키)
function normalizeEstimateConfig_(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const num = (key, fallback, alias) => {
    const rawValue = src[key] != null ? src[key] : (alias ? src[alias] : undefined);
    const value = Number(rawValue);
    return Number.isFinite(value) ? value : fallback;
  };
  const bool = (key, fallback) => {
    const rawValue = src[key];
    if (typeof rawValue === 'boolean') return rawValue;
    if (/^(true|TRUE|1|예|Y)$/i.test(String(rawValue || ''))) return true;
    if (/^(false|FALSE|0|아니오|N)$/i.test(String(rawValue || ''))) return false;
    return fallback;
  };
  const str = (key, fallback) => (src[key] == null ? fallback : String(src[key]));
  const amount = (key, fallback) => {
    if (src[key] == null || src[key] === '') return fallback;
    return parseKRNumber_(src[key]);
  };
  return {
    commonHomeDiscountRate: num('commonHomeDiscountRate', DEFAULT_ESTIMATE_CONFIG.commonHomeDiscountRate, 'homeDiscount'),
    commonCommercialDiscountRate: num('commonCommercialDiscountRate', DEFAULT_ESTIMATE_CONFIG.commonCommercialDiscountRate, 'commDiscount'),
    oldProductDiscountRate: num('oldProductDiscountRate', DEFAULT_ESTIMATE_CONFIG.oldProductDiscountRate, 'oldDiscount'),
    vatRate: num('vatRate', DEFAULT_ESTIMATE_CONFIG.vatRate),
    cardFeeRate: num('cardFeeRate', DEFAULT_ESTIMATE_CONFIG.cardFeeRate),
    advanceDiscountRate: num('advanceDiscountRate', DEFAULT_ESTIMATE_CONFIG.advanceDiscountRate),
    comboWarnRate: num('comboWarnRate', DEFAULT_ESTIMATE_CONFIG.comboWarnRate),
    homeNoHose: bool('homeNoHose', DEFAULT_ESTIMATE_CONFIG.homeNoHose),
    homeNoBranch: bool('homeNoBranch', DEFAULT_ESTIMATE_CONFIG.homeNoBranch),
    homeWithFoot: bool('homeWithFoot', DEFAULT_ESTIMATE_CONFIG.homeWithFoot),
    homeDefaultPanel: str('homeDefaultPanel', DEFAULT_ESTIMATE_CONFIG.homeDefaultPanel),
    singleDefaultWiredRemote: str('singleDefaultWiredRemote', DEFAULT_ESTIMATE_CONFIG.singleDefaultWiredRemote),
    singleNoRemote: bool('singleNoRemote', DEFAULT_ESTIMATE_CONFIG.singleNoRemote),
    singleWithBase: bool('singleWithBase', DEFAULT_ESTIMATE_CONFIG.singleWithBase),
    singleDefaultPanel: str('singleDefaultPanel', DEFAULT_ESTIMATE_CONFIG.singleDefaultPanel),
    singlePanelShape: str('singlePanelShape', DEFAULT_ESTIMATE_CONFIG.singlePanelShape),
    singleDiscount: amount('singleDiscount', DEFAULT_ESTIMATE_CONFIG.singleDiscount),
    singleOneWayDiscount: amount('singleOneWayDiscount', DEFAULT_ESTIMATE_CONFIG.singleOneWayDiscount),
    singleMaterialInclusion: str('singleMaterialInclusion', DEFAULT_ESTIMATE_CONFIG.singleMaterialInclusion),
    footerNotice: typeof src.footerNotice === 'string'
      ? src.footerNotice
      : DEFAULT_ESTIMATE_CONFIG.footerNotice,
  };
}

function buildDefaultDcConfig_(estimateConfig) {
  const cfg = normalizeEstimateConfig_(estimateConfig);
  return {
    homeDiscount: cfg.commonHomeDiscountRate,
    commDiscount: cfg.commonCommercialDiscountRate,
    showIHose: SHOW_I_HOSE,
    discount360: DISCOUNT_360_AMT,
    discount4way: DISCOUNT_4WAY_AMT,
    discountStand: DISCOUNT_STAND_AMT,
    oneWayDiscount: ONEWAY_DISCOUNT_AMT,
    deluxeDiscount: DELUXE_DISCOUNT_AMT,
    firstGradeDiscount: FIRSTGRADE_DISCOUNT_AMT,
    unitRoundTo: UNIT_ROUND_TO,
    unitRoundMode: UNIT_ROUND_MODE,
  };
}

function splitVatAmount_(amountVat, estimateConfig) {
  const cfg = normalizeEstimateConfig_(estimateConfig);
  const divisor = 1 + (Number(cfg.vatRate) || 0);
  const abs = Math.abs(Number(amountVat) || 0);
  const supplyAbs = Math.round(abs / divisor);
  const vatAbs = abs - supplyAbs;
  const sign = Number(amountVat) < 0 ? -1 : 1;
  return { supply: supplyAbs * sign, vat: vatAbs * sign };
}

function applyEstimateTotalAdjustments_(rows, estimateConfig, options = {}) {
  if (!Array.isArray(rows)) {
    return { total: 0, adjustment: 0 };
  }
  const cfg = normalizeEstimateConfig_(estimateConfig);
  const baseTotal = rows.reduce((acc, r) => acc + (Number(r.sub) || ((Number(r.price) || 0) * (Number(r.qty) || 0))), 0);
  let adjustment = 0;

  if (options.advance === true && cfg.advanceDiscountRate > 0
      && !rows.some((r) => String(r.name || '').includes('선금할인') || r.advanceDiscount)) {
    const discount = -Math.round(baseTotal * cfg.advanceDiscountRate);
    if (discount !== 0) {
      rows.push({
        section: 'ETC',
        type: 'item',
        name: '선금할인',
        model: '선금할인',
        unit: '식',
        qty: 1,
        price: discount,
        sub: discount,
        remarks: '선금 할인',
        advanceDiscount: discount,
      });
      adjustment += discount;
    }
  }

  return { total: baseTotal + adjustment, adjustment };
}

/**
 * legacy classifyHome_(name) — 홈멀티 분류 (대/중/소 + disp).
 * 라이브 종합견적서 Code.js (line 274) verbatim — 8단계 cascade:
 * 받침대 → 전열교환기 → 인테리어핏 → 제습기 → 실외기(단·다배관, HP disp)
 * → 실내기(1-Way WIFI/인피니트, 4WAY, 360, 벽걸이 + 소중대형 + 평형/무풍 disp)
 * → 판넬(공기청정 WIFI 등) → 부자재(리모컨/분기관/유연호스/기타).
 */
function classifyHome_(rawName) {
  const n = String(rawName || '').trim();
  let catL = ''; let catM = ''; let catS = ''; let disp = '';

  if (/원형\s*발통|발통\s*세트|받침대|일자발|평발|플랫/i.test(n)) {
    catL = '실외기 받침대';
    if (/원형|발통/i.test(n)) catM = '원형발통';
    else if (/일자발|평발|플랫/i.test(n)) catM = '일자발';
    disp = sanitizeDisp_(n.replace(/실외기|원형|발통|세트|받침대|일자발|평발|플랫/gi, ''));
    return { catL: unifyCatL_(catL), catM, catS: '', disp };
  }

  if (/전열\s*교환기|에어콤보|에어콤포/i.test(n)) {
    catL = '전열교환기';
    if (/에어콤보|에어콤포/i.test(n)) catM = '에어콤보';
    disp = sanitizeDisp_(n.replace(/전열\s*교환기|에어콤보|에어콤포/gi, ''));
    return { catL: unifyCatL_(catL), catM, catS: '', disp };
  }

  if (/인테리어\s*핏|인테리어핏/i.test(n)) {
    catL = '인테리어핏';
    disp = sanitizeDisp_(n.replace(/인테리어\s*핏|인테리어핏/gi, ''));
    return { catL: unifyCatL_((catL)), catM: '', catS: '', disp };
  }

  if (/시스템\s*제습기|제습기/i.test(n) && !/가정용/i.test(n)) {
    catL = '시스템제습기';
    disp = sanitizeDisp_(n.replace(/시스템\s*제습기|제습기/gi, ''));
    return { catL: unifyCatL_(catL), catM: '', catS: '', disp };
  }

  if (/^실외기|[\s_\-]실외기/.test(n) || /^실외기/.test(n)) {
    catL = '실외기';
    if (/단배관/i.test(n)) catM = '단배관';
    else if (/다배관/i.test(n)) catM = '다배관';
    const hp = hpFromText_(n);
    disp = hp || sanitizeDisp_(n.replace(/실외기|단배관|다배관/gi, ''));
    return { catL: unifyCatL_(catL), catM, catS: '', disp };
  }

  if (/^실내기|[\s_\-]실내기/.test(n) || /벽걸이/.test(n)) {
    catL = '실내기';
    if (/1\s*-?\s*Way/i.test(n)) {
      if (/WIFI\s*내장/i.test(n)) catM = '1-Way WIFI';
      else if (/인피니트\s*UV/i.test(n)) catM = '1-Way 인피니트UV';
      else if (/인피니트/i.test(n)) catM = '1-Way 인피니트';
      else catM = '1-Way 미내장';
    } else if (/4\s*WAY|4\s*-?\s*Way/i.test(n)) {
      if (/WIFI\s*내장/i.test(n)) catM = '4WAY WIFI';
      else catM = '4WAY 미내장';
    } else if (/360\s*CST/i.test(n)) {
      if (/WIFI/i.test(n)) catM = '360 WIFI';
      else catM = '360 미내장';
    } else if (/벽걸이/i.test(n)) {
      catM = '벽걸이';
    }

    if (/소형/i.test(n)) catS = '소형';
    else if (/중형/i.test(n)) catS = '중형';
    else if (/대형/i.test(n)) catS = '대형';

    const size = n.match(/(\d+(?:\.\d+)?)\s*평형/);
    const hasMupung = /무풍/i.test(n);
    const sizeTxt = size ? `${size[1]}평형` : '';
    disp = sanitizeDisp_(`${hasMupung ? '무풍' : ''} ${sizeTxt}`.trim());
    if (!disp) disp = sanitizeDisp_(n.replace(/실내기|무풍|유풍|소형|중형|대형|WIFI|내장|미내장|1\s*-?\s*Way|4\s*-?\s*Way|4\s*WAY|360\s*CST|인피니트|벽걸이/gi, ''));
    return { catL: unifyCatL_(catL), catM, catS, disp };
  }

  if (/판넬|패널/i.test(n)) {
    catL = '판넬';
    if (/공기청정|공청/i.test(n) && /WIFI/i.test(n)) catM = '공기청정 WIFI';
    else if (/공기청정|공청/i.test(n) && /미내장/i.test(n)) catM = '공기청정 미내장';
    else if (/WIFI/i.test(n)) catM = 'WIFI';
    else if (/미내장/i.test(n)) catM = '미내장';
    else if (/인피니트/i.test(n)) catM = '인피니트';
    disp = sanitizeDisp_(n.replace(/판넬|패널|WIFI|공기청정|공청|미내장|인피니트/gi, ''));
    return { catL: unifyCatL_(catL), catM, catS: '', disp };
  }

  catL = '부자재';
  if (/리모컨|리모콘/i.test(n)) catM = '리모컨';
  else if (/분\s*기\s*관|분기관/i.test(n)) catM = '분기관';
  else if (/유연호스/i.test(n)) catM = '유연호스';
  else catM = '기타';
  disp = sanitizeDisp_(n.replace(/리모컨|리모콘|분\s*기\s*관|드레인펌프|유선보드|분기관|유연호스/gi, ''));
  return { catL: unifyCatL_(catL), catM, catS: '', disp };
}

/**
 * legacy classifySingleSetLM_(s) — 싱글 세트의 L/M 분류.
 * estimate-legacy/lib/code.js 기준 (1:1 포팅) — name+model 텍스트 매칭.
 */
function classifySingleSetLM_(s) {
  const t = String(((s && s.name) || '') + ' ' + ((s && s.model) || '')).toLowerCase();
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

  // 실내기 중분류 키워드
  const inKeys = [
    { re: /\b1\s*-?\s*Way\b|1WAY/i, m: (/WIFI/i.test(n) ? '1-Way WIFI내장' : /인피니트/i.test(n) ? '1-Way 인피니트' : '1WAY 미내장') },
    { re: /\b2\s*Way\b|2Way/i, m: '2Way' },
    { re: /\b4\s*-?\s*Way\b|4Way/i, m: (/UV-?C/i.test(n) && /WIFI/i.test(n) ? '4-Way UV-C WIFI내장'
      : /MINI/i.test(n) && /WIFI/i.test(n) ? 'MINI 4WAY WIFI내장'
      : /WIFI/i.test(n) ? '4-Way WIFI내장'
      : /MINI/i.test(n) ? 'MINI 4WAY 미내장'
      : '4WAY 미내장') },
    { re: /360\s*CST|360CST/i, m: (/WIFI/i.test(n) ? '360CST WIFI내장' : '360CST 미내장') },
    { re: /벽걸이/i, m: '벽걸이' },
    { re: /스탠드|PAC/i, m: '스탠드형(PAC)' },
    { re: /실링/i, m: '실링' },
    { re: /DUCT/i, m: 'DUCT' },
    { re: /전열\s*교환기/i, m: '전열교환기' },
  ];

  // 실외기 우선 탐지
  for (const k of outKeys) if (k.re.test(n)) { catL = '실외기'; catM = k.m; break; }
  // 실내기 탐지
  if (!catM) for (const k of inKeys) if (k.re.test(n)) { catL = '실내기'; catM = k.m; break; }

  // L 보정
  if (!catL) {
    if (isOutdoorByModel || /실외기/i.test(n) || /DVM\s*(S2|ECO)/i.test(n)) catL = '실외기';
    else if (isIndoorByModel || /실내기/i.test(n)) catL = '실내기';
  }

  // 소분류
  if (catM === '1-Way WIFI내장' || catM === '1-Way 인피니트' || catM === '1WAY 미내장') {
    if (/소형/i.test(n)) catS = '소형';
    else if (/대형/i.test(n)) catS = '대형';
    else catS = '중형';
  }
  if (catM === 'DUCT') {
    if (/저정압.*SLIM/i.test(n)) catS = '저정압 SLIM';
    else if (/중정압/i.test(n)) catS = '중정압';
    else if (/고정압/i.test(n)) catS = '고정압';
  }
  if (catM === '전열교환기') {
    if (/상업용/i.test(n)) catS = '상업용';
    else if (/주택용/i.test(n)) catS = '주택용';
  }
  if (catL === '실외기' && /^ECO/i.test(catM || '')) {
    if (/단상형/i.test(n)) catS = '단상형';
    else if (/삼상형/i.test(n)) catS = '삼상형';
    else if (/상부\s*토출형|상부토출형/i.test(n)) catS = '상부토출형';
  }

  // 판넬
  if (!catL && /판넬|패널|panel/i.test(n)) catL = '판넬';

  // 나머지
  if (!catL) catL = '부자재';

  return { catL, catM, catS };
}

/**
 * #30 — 상업멀티 카탈로그용 어댑터: classifyCommercial_ + disp(=sanitizeDisp_(name)).
 * legacy getCommercialMulti 의 disp 규칙(line 851) 정합 — DB 모드에서 multiCatalog 가 사용.
 */
function classifyCommercialDisp_(name, model) {
  const cls = classifyCommercial_(name, model);
  return { catL: cls.catL, catM: cls.catM, catS: cls.catS, disp: sanitizeDisp_(name) };
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
function getHomeDefaults(estimateConfig) {
  if (estimateConfig && typeof estimateConfig === 'object') {
    const cfg = normalizeEstimateConfig_(estimateConfig);
    return {
      '유연호스 제외': !!cfg.homeNoHose,
      '분기관 제외': !!cfg.homeNoBranch,
      '발통포함': !!cfg.homeWithFoot,
      '리모컨': '선택 안함',
      '판넬변경': String(cfg.homeDefaultPanel || ''),
    };
  }

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
function getSingleDefaults(estimateConfig) {
  if (estimateConfig && typeof estimateConfig === 'object') {
    const cfg = normalizeEstimateConfig_(estimateConfig);
    return {
      '유선리모컨': String(cfg.singleDefaultWiredRemote || ''),
      '리모컨 제외': !!cfg.singleNoRemote,
      '실외기 받침대 포함': !!cfg.singleWithBase,
      '판넬변경': String(cfg.singleDefaultPanel || ''),
      '360판넬': String(cfg.singlePanelShape || '원형'),
      '할인': parseKRNumber_(cfg.singleDiscount),
      '1WAY할인': parseKRNumber_(cfg.singleOneWayDiscount),
      '자재 포함 여부': String(cfg.singleMaterialInclusion || '별도'),
    };
  }

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
 * 라이브 종합견적서 Code.js (line 996) verbatim — scanHome(냉방성능 2컬럼 +
 * 포장/최대장배관/고저차) / scanSingle(성능·소비전력 cool|heat splitBar, 전원/차단
 * splitSlash, in/out 크기·중량·포장, 배관길이/고낙차) / scanComm(ERV layout 감지 +
 * joinCols, 냉난방 kcal/kW 4그룹).
 */
function getSpecDetailMap_() {
  const key = 'SPEC_DETAIL_MAP_V10';
  const hit = cacheGetJSON_(key);
  if (hit) return hit;

  const ss = SpreadsheetApp.openById(SRC_SHEET_ID);
  const out = {};

  const normH = (v) => String(v || '').trim().replace(/\s+/g, '');
  const findHeaderRow = (vr) => {
    for (let i = 0; i < Math.min(vr.length, 10); i++) {
      const H = (vr[i] || []).map(normH);
      if (H.includes('모델명') || H.includes('모델') || H.includes('품목코드')) return i;
    }
    return -1;
  };
  const idx = (H, labels) => {
    for (const lb of labels) {
      const i = H.indexOf(normH(lb));
      if (i >= 0) return i;
    }
    return -1;
  };
  const findContains = (H, rx) => {
    for (let i = 0; i < H.length; i++) {
      if (rx.test(H[i])) return i;
    }
    return -1;
  };

  function scanHome() {
    const sh = ss.getSheetByName(HOME_NAME);
    if (!sh) return;

    const vr = sh.getDataRange().getDisplayValues();
    const hr = findHeaderRow(vr);
    if (hr < 0) return;

    const Hraw = (vr[hr] || []);
    const H = Hraw.map(normH);

    const iModel = idx(H, ['모델명', '모델', '품목코드', '기종']);
    const iPipe = idx(H, ['배관경']);

    // 냉방성능(정격) 중복 2개 처리
    const coolCols = [];
    H.forEach((h, i) => {
      if (h === normH('냉방성능(정격)') || /냉방성능/.test(h)) coolCols.push(i);
    });

    let iCoolKw = coolCols[0] ?? -1;
    let iCoolKcal = coolCols[1] ?? -1;

    // 혹시 순서가 뒤바뀐 시트도 대비
    const guessKcal = findContains(Hraw, /kcal/i);
    const guessKw = findContains(Hraw, /kW/i);
    if (iCoolKcal < 0 && guessKcal >= 0) iCoolKcal = guessKcal;
    if (iCoolKw < 0 && guessKw >= 0) iCoolKw = guessKw;

    let iPowKw = idx(H, ['소비전력(정격)']);
    if (iPowKw < 0) iPowKw = findContains(H, /소비전력/);

    let iEff = idx(H, ['에너지소비효율', '에너지소비효율등급']);
    if (iEff < 0) iEff = findContains(H, /에너지소비효율/);

    const iGas = idx(H, ['냉매가스']);
    const iBrk = idx(H, ['차단기']);
    const iLine = idx(H, ['전원선']);
    const iSize = idx(H, ['제품크기']);
    const iWeight = idx(H, ['제품중량']);
    const iPackSize = idx(H, ['포장치수']);
    const iPackWeight = idx(H, ['포장중량']);
    const iMaxPipe = idx(H, ['최대장배관', '최대 장배관']);
    const iMaxDrop = idx(H, ['최대고저차', '최대 고저차']);

    for (let r = hr + 1; r < vr.length; r++) {
      const row = vr[r] || [];
      const model = String(row[iModel] || '').trim();
      if (!model) continue;

      if (!out[model]) out[model] = {};

      const spec = {
        pipeDia: row[iPipe] || '',
        gas: row[iGas] || '',
        breaker: row[iBrk] || '',
        powerLine: row[iLine] || '',
        size: row[iSize] || '',
        weight: row[iWeight] || '',
        packSize: row[iPackSize] || '',
        packWeight: row[iPackWeight] || '',
        maxPipe: row[iMaxPipe] || '',
        maxDrop: row[iMaxDrop] || '',

        cool_kcal: row[iCoolKcal] || '',
        cool_kw: row[iCoolKw] || '',
        cool_power: row[iPowKw] || '',
        effGrade: row[iEff] || '',

        cool_cap_kcal: row[iCoolKcal] || '',
        cool_cap_kw: row[iCoolKw] || '',
        cool_pow_kw: row[iPowKw] || '',
        grade: row[iEff] || '',
      };

      out[model].home = spec;
    }

    Logger.log('>> 🧊 홈멀티 인덱스 iCoolKw=%s iCoolKcal=%s iPowKw=%s iEff=%s coolCols=%s',
      iCoolKw, iCoolKcal, iPowKw, iEff, JSON.stringify(coolCols));
  }

  function scanSingle() {
    const sh = ss.getSheetByName(SINGLE_NAME);
    if (!sh) return;

    const vr = sh.getDataRange().getDisplayValues();
    const hr = findHeaderRow(vr);
    if (hr < 0) return;

    const H = (vr[hr] || []).map(normH);

    const iModel = idx(H, ['모델명', '모델', '품목코드', '기종']);
    const iGrade = idx(H, ['등급(냉방/난방)', '등급 (냉방/난방)']);
    const iPipe = idx(H, ['배관경']);
    const iPowKw = idx(H, ['소비전력(kW)(최소/정격/최대)', '소비전력(kW) (최소 / 정격 / 최대)']);
    const iCapKw = idx(H, ['성능(kW)(최소/정격/최대)', '성능(kW) (최소 / 정격 / 최대)']);
    const iCapKcal = idx(H, ['성능(kcal/h)(최소/정격/최대)', '성능(kcal/h) (최소 / 정격 / 최대)']);
    const iPowerBrk = idx(H, ['전원(mm²)/차단(A)', '전원(mm²) / 차단(A)']);
    const iInSize = idx(H, ['실내기크기(mm)', '실내기 크기(mm)']);
    const iOutSize = idx(H, ['실외기크기(mm)', '실외기 크기(mm)']);
    const iInWeight = idx(H, ['실내기중량(kg)', '실내기 중량(kg)']);
    const iOutWeight = idx(H, ['실외기중량(kg)', '실외기 중량(kg)']);
    const iInPackSize = idx(H, ['실내기포장(mm)', '실내기 포장(mm)']);
    const iOutPackSize = idx(H, ['실외기포장(mm)', '실외기 포장(mm)']);
    const iInPackWeight = idx(H, ['실내기포장중량(kg)', '실내기 포장중량(kg)']);
    const iOutPackWeight = idx(H, ['실외기포장중량(kg)', '실외기 포장중량(kg)']);
    const iPipeDrop = idx(H, ['배관길이/고낙차(m)', '배관길이 / 고낙차(m)']);
    const iGas = idx(H, ['냉매가스']);

    const splitBar = (v) => {
      const s = String(v || '');
      const [a, b] = s.split('|').map((x) => x.trim());
      return { cool: a || '', heat: b || '' };
    };
    const splitSlash = (v) => {
      const s = String(v || '');
      const [a, b] = s.split('/').map((x) => x.trim());
      return { a: a || '', b: b || '' };
    };

    for (let r = hr + 1; r < vr.length; r++) {
      const row = vr[r] || [];
      const model = String(row[iModel] || '').trim();
      if (!model) continue;

      const pow = splitBar(row[iPowKw]);
      const capKw = splitBar(row[iCapKw]);
      const capKcal = splitBar(row[iCapKcal]);
      const pb = splitSlash(row[iPowerBrk]);
      const pd = splitSlash(row[iPipeDrop]);

      if (!out[model]) out[model] = {};
      out[model].single = {
        grade: row[iGrade] || '',
        pipeDia: row[iPipe] || '',
        cool_pow_kw: pow.cool,
        heat_pow_kw: pow.heat,
        cool_cap_kw: capKw.cool,
        heat_cap_kw: capKw.heat,
        cool_cap_kcal: capKcal.cool,
        heat_cap_kcal: capKcal.heat,
        powerLine: pb.a,
        breaker: pb.b,
        inSize: row[iInSize] || '',
        outSize: row[iOutSize] || '',
        inWeight: row[iInWeight] || '',
        outWeight: row[iOutWeight] || '',
        inPackSize: row[iInPackSize] || '',
        outPackSize: row[iOutPackSize] || '',
        inPackWeight: row[iInPackWeight] || '',
        outPackWeight: row[iOutPackWeight] || '',
        pipeLen: pd.a,
        drop: pd.b,
        gas: row[iGas] || '',
      };
    }
  }

  function scanComm() {
    const sh = ss.getSheetByName(COMM_NAME);
    if (!sh) return;

    const vr = sh.getDataRange().getDisplayValues();
    const hr = findHeaderRow(vr);
    if (hr < 0) return;

    const Hraw = vr[hr] || [];
    const H = Hraw.map(normH);

    const iModel = idx(H, ['모델명', '모델', '품목코드', '기종']);
    const iPipe = idx(H, ['배관경']);
    const iGas = idx(H, ['냉매가스']);
    const iBrk = idx(H, ['차단기']);
    const iLine = idx(H, ['전원선']);
    const iSize = idx(H, ['제품크기']);
    const iWeight = idx(H, ['제품중량']);
    const iPackSize = idx(H, ['포장치수']);
    const iPackWeight = idx(H, ['포장중량']);
    const iEff = idx(H, ['소비효율등급', '에너지소비효율등급']);
    const iMaxPipe = idx(H, ['최대장배관', '최대 장배관', '배관길이']);
    const iMaxDrop = idx(H, ['최대고저차', '최대 고저차', '고낙차']);

    const groups = [];
    let cur = null;

    const iDuct = (() => {
      let i = idx(H, ['덕트구경', '덕트 구경']);
      if (i < 0) {
        for (let k = 0; k < Hraw.length; k++) {
          if (/덕트\s*구경/i.test(String(Hraw[k] || ''))) return k;
        }
      }
      return i;
    })();

    for (let i = 0; i < Hraw.length; i++) {
      const h = String(Hraw[i] || '');
      let type = null;
      if (/냉방\s*성능/.test(h)) type = 'coolCap';
      else if (/난방\s*성능/.test(h)) type = 'heatCap';
      else if (/소비\s*전력/.test(h)) type = 'power';

      if (type) {
        if (!cur || cur.type !== type) {
          cur = { type: type, cols: [] };
          groups.push(cur);
        }
        cur.cols.push(i);
      } else {
        cur = null;
      }
    }

    const coolCapCols = groups[0]?.cols || [];
    const coolPowCols = groups[1]?.cols || [];
    const heatCapCols = groups[2]?.cols || [];
    const heatPowCols = groups[3]?.cols || [];

    const joinCols = (row, cols) =>
      cols.map((i) => String(row[i] || '').trim()).filter(Boolean).join(' / ');

    const subRow = vr[hr + 1] || [];
    const hasTurboStrongWeak = coolCapCols.concat(coolPowCols, heatCapCols, heatPowCols)
      .some((i) => /터보|강|약/.test(String(subRow[i] || '')));

    const isErvLayout3 =
      hasTurboStrongWeak &&
      coolCapCols.length === 3 &&
      coolPowCols.length === 3 &&
      heatCapCols.length === 3 &&
      heatPowCols.length === 3;

    const isErvLayout2 =
      !hasTurboStrongWeak &&
      coolCapCols.length === 2 &&
      coolPowCols.length === 1 &&
      heatCapCols.length === 2 &&
      heatPowCols.length === 1;

    const isErvLayout = isErvLayout3 || isErvLayout2;

    const coolCols = [];
    const heatCols = [];
    const powCols = [];
    Hraw.forEach((h, i) => {
      const t = String(h || '');
      if (/냉방\s*성능/.test(t)) coolCols.push(i);
      if (/난방\s*성능/.test(t)) heatCols.push(i);
      if (/소비\s*전력/.test(t)) powCols.push(i);
    });

    const iCoolKcal = coolCols[0] ?? -1;
    const iCoolKw = (coolCols.length >= 2) ? coolCols[1] : (iCoolKcal >= 0 ? iCoolKcal + 1 : -1);
    const iHeatKcal = heatCols[0] ?? -1;
    const iHeatKw = (heatCols.length >= 2) ? heatCols[1] : (iHeatKcal >= 0 ? iHeatKcal + 1 : -1);

    const iPowCool = powCols[0] ?? -1;
    const iPowHeat = (powCols.length >= 2) ? powCols[powCols.length - 1] : (iPowCool >= 0 ? iPowCool + 1 : -1);

    for (let r = hr + 1; r < vr.length; r++) {
      const row = vr[r] || [];
      const model = String(row[iModel] || '').trim();
      if (!model) continue;

      if (!out[model]) out[model] = {};

      if (isErvLayout) {
        out[model].comm = {
          gas: row[iDuct] || '',
          cool_kcal: joinCols(row, coolCapCols),
          cool_power: joinCols(row, coolPowCols),
          heat_kcal: joinCols(row, heatCapCols),
          heat_power: joinCols(row, heatPowCols),
          pipeDia: '',
          cool_kw: '',
          heat_kw: '',
          cool_cap_kcal: '',
          cool_cap_kw: '',
          heat_cap_kcal: '',
          heat_cap_kw: '',
          cool_pow_kw: '',
          heat_pow_kw: '',
          breaker: row[iBrk] || '',
          powerLine: row[iLine] || '',
          size: row[iSize] || '',
          weight: row[iWeight] || '',
          packSize: row[iPackSize] || '',
          packWeight: row[iPackWeight] || '',
          grade: row[iEff] || '',
          maxPipe: row[iMaxPipe] || '',
          maxDrop: row[iMaxDrop] || '',
        };
        continue;
      }

      out[model].comm = {
        pipeDia: row[iPipe] || '',
        gas: row[iGas] || '',
        cool_cap_kcal: row[iCoolKcal] || '',
        cool_cap_kw: row[iCoolKw] || '',
        heat_cap_kcal: row[iHeatKcal] || '',
        heat_cap_kw: row[iHeatKw] || '',
        cool_pow_kw: row[iPowCool] || '',
        heat_pow_kw: row[iPowHeat] || '',
        breaker: row[iBrk] || '',
        powerLine: row[iLine] || '',
        size: row[iSize] || '',
        weight: row[iWeight] || '',
        packSize: row[iPackSize] || '',
        packWeight: row[iPackWeight] || '',
        grade: row[iEff] || '',
        maxPipe: row[iMaxPipe] || '',
        maxDrop: row[iMaxDrop] || '',
      };
    }

    Logger.log('>> 🔥 상업멀티 ERV=%s coolCols=%s heatCols=%s powCols=%s groups=%s',
      isErvLayout, JSON.stringify(coolCols), JSON.stringify(heatCols), JSON.stringify(powCols), JSON.stringify(groups.map((g) => g.cols)));
  }

  scanHome();
  scanSingle();
  scanComm();

  cachePutJSON_(key, out, 60 * 10);
  Logger.log('>> 📌 스펙상세맵 생성 완료 count=%s', Object.keys(out).length);
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
 * Node.js 에서는 sheet/internal read 가 비동기. 따라서 사전에 preloadSheets 와
 * directory prefetch 로 필요한 데이터를 in-memory/cache 로 채운 뒤 legacy 동기 함수들이
 * 즉시 read 가능.
 *
 * Service Account 키 미설정 시 preloadSheets 가 모두 reject → 동기 getter 들이
 * 빈 sheet 반환 → 카탈로그 빈 배열 (legacy 동작과 동등 graceful).
 *
 * @param {string} userEmail — Session.getActiveUser().getEmail() 대체 (인증용)
 * @returns {Promise<object>} EJS render 데이터 (legacy doGet 가 t.* 로 채우는 항목)
 */
async function bootstrap(userEmail) {
  // #30: 카탈로그 소스 — 기본 db(product-service 벌크 endpoint), 시트는 CATALOG_SOURCE=sheet 명시 opt-out.
  // 거래처/담당자는 G2부터 partner-service/user-service directory cache 로 치환.
  // DB 카탈로그는 가격/단위/규격/구성품/자재/추천/baseline/pyong + 홈·싱글·구형
  // 변동DC 까지 시트 동등 검증 완료. 백엔드 미도달 운영 환경은 CATALOG_SOURCE=sheet override 로 보호한다.
  const useDb = String(process.env.CATALOG_SOURCE || 'db').toLowerCase() === 'db';

  // legacy 가 read 하는 전 탭 prefetch (병렬). 누락 탭은 빈 sheet 반환.
  // DB 모드에서는 카탈로그/spec/default 모두 DB endpoint 에서 주입하므로 시트 prefetch 를 생략한다.
  const sheetsToPreload = useDb
    ? []
    : [
      HOME_NAME, SINGLE_NAME, SINGLE_PARTS_NAME, COMM_NAME, COMM_PARTS_NAME,
      '싱글 자재가격', '구형', '추천실외기',
      '홈멀티', '상업멀티', '상업멀티 구성', '싱글 세트', '싱글 구성품',
    ];
  if (sheetsToPreload.length > 0) {
    try {
      await preloadSheets(SRC_SHEET_ID, sheetsToPreload);
    } catch (e) {
      Logger.log('[bootstrap] preloadSheets 실패: ' + (e && e.message));
    }
  }
  try {
    await preloadDirectoryCache_();
  } catch (e) {
    Logger.log('[bootstrap] directory preload 실패: ' + (e && e.message));
  }

  const email = userEmail || Session.getActiveUser().getEmail();
  const t = {};
  t.userEmail = email;
  try { t.authData = JSON.stringify(await checkUserAuth(email)); } catch (_) { t.authData = '{}'; }

  let dbCatalog = null;
  let estimateConfig = normalizeEstimateConfig_(null);
  if (useDb) {
    // #30 — 카탈로그 9종을 product-service 벌크 endpoint 에서 read (시트 직접 read 폐기).
    dbCatalog = require('./db-catalog');
    try { estimateConfig = normalizeEstimateConfig_(await dbCatalog.estimateConfig()); } catch (e) { Logger.log('[bootstrap] db estimateConfig: ' + e.message); }
    try { t.homemulti = JSON.stringify(await dbCatalog.multiCatalog('HOME_MULTI', classifyHome_)); } catch (e) { Logger.log('[bootstrap] db homemulti: ' + e.message); t.homemulti = '[]'; }
    try { t.singleSets = JSON.stringify(await dbCatalog.singleSets(classifySingleSetLM_, normalizeSize_, sanitizeDisp_)); } catch (e) { Logger.log('[bootstrap] db singleSets: ' + e.message); t.singleSets = '[]'; }
    try { t.singleParts = JSON.stringify(await dbCatalog.components('SINGLE_SET', sanitizeDisp_)); } catch (e) { Logger.log('[bootstrap] db singleParts: ' + e.message); t.singleParts = '[]'; }
    try { t.singleMatPrices = JSON.stringify(await dbCatalog.materialPrices()); } catch (e) { Logger.log('[bootstrap] db matPrices: ' + e.message); t.singleMatPrices = '{}'; }
    try { t.commercialMulti = JSON.stringify(await dbCatalog.multiCatalog('COMMERCIAL_MULTI', classifyCommercialDisp_)); } catch (e) { Logger.log('[bootstrap] db commMulti: ' + e.message); t.commercialMulti = '[]'; }
    try { t.commercialParts = JSON.stringify(await dbCatalog.components('COMMERCIAL_MULTI', sanitizeDisp_)); } catch (e) { Logger.log('[bootstrap] db commParts: ' + e.message); t.commercialParts = '[]'; }
    try { t.oldProducts = JSON.stringify(await dbCatalog.oldProducts()); } catch (e) { Logger.log('[bootstrap] db old: ' + e.message); t.oldProducts = '[]'; }
    try { t.quantitySyncRules = JSON.stringify(await dbCatalog.quantitySyncRules()); } catch (e) { Logger.log('[bootstrap] db quantitySyncRules: ' + e.message); t.quantitySyncRules = '[]'; }
    try { t.recommendData = JSON.stringify(await dbCatalog.recommendOduData()); } catch (e) { Logger.log('[bootstrap] db recommend: ' + e.message); t.recommendData = '{"comm":[],"home":[],"homeEx":[]}'; }
    try { t.priceInc = JSON.stringify(await dbCatalog.priceIncData()); } catch (e) { Logger.log('[bootstrap] db priceInc: ' + e.message); t.priceInc = '{"home":{},"comm":{},"single":{}}'; }
    try { t.priceChangeSchedule = JSON.stringify(await dbCatalog.priceChangeSchedule()); } catch (e) { Logger.log('[bootstrap] db priceChangeSchedule: ' + e.message); t.priceChangeSchedule = '{}'; }
    try { t.priceDefaultVariant = JSON.stringify(await dbCatalog.priceDefaultVariant()); } catch (e) { Logger.log('[bootstrap] db priceDefaultVariant: ' + e.message); t.priceDefaultVariant = '{}'; }
  } else {
    try { t.homemulti = JSON.stringify(getHomeMulti()); } catch (_) { t.homemulti = '[]'; }
    try { t.singleSets = JSON.stringify(getSingleSets()); } catch (_) { t.singleSets = '[]'; }
    try { t.singleParts = JSON.stringify(getSingleParts()); } catch (_) { t.singleParts = '[]'; }
    try { t.singleMatPrices = JSON.stringify(getSingleMatPrices()); } catch (_) { t.singleMatPrices = '{}'; }
    try { t.commercialMulti = JSON.stringify(getCommercialMulti()); } catch (_) { t.commercialMulti = '[]'; }
    try { t.commercialParts = JSON.stringify(getCommercialParts()); } catch (_) { t.commercialParts = '[]'; }
    try { t.oldProducts = JSON.stringify(getOldProducts_()); } catch (_) { t.oldProducts = '[]'; }
    t.quantitySyncRules = '[]';
    try { t.recommendData = JSON.stringify(getRecommendOduData()); } catch (_) { t.recommendData = '{"comm":[],"home":[],"homeEx":[]}'; }
    try { t.priceInc = JSON.stringify(getPriceIncData_()); } catch (_) { t.priceInc = '{"home":{},"comm":{},"single":{}}'; }
    t.priceChangeSchedule = '{}';
    t.priceDefaultVariant = '{}';
  }

  try { t.homeDefaults = JSON.stringify(useDb ? getHomeDefaults(estimateConfig) : getHomeDefaults()); } catch (_) { t.homeDefaults = '{}'; }
  try { t.singleDefaults = JSON.stringify(useDb ? getSingleDefaults(estimateConfig) : getSingleDefaults()); } catch (_) { t.singleDefaults = '{}'; }
  if (useDb && dbCatalog) {
    try { t.specDetailMap = JSON.stringify(await dbCatalog.specDetailMap()); } catch (e) { Logger.log('[bootstrap] db specDetailMap: ' + e.message); t.specDetailMap = '{}'; }
  } else {
    try { t.specDetailMap = JSON.stringify(getSpecDetailMap_()); } catch (_) { t.specDetailMap = '{}'; }
  }
  try { t.logoData = getLogoImage(); } catch (_) { t.logoData = ''; }
  t.config = JSON.stringify({
    homeDiscount: estimateConfig.commonHomeDiscountRate,
    commDiscount: estimateConfig.commonCommercialDiscountRate,
    showIHose: SHOW_I_HOSE,
    discount360: DISCOUNT_360_AMT,
    discount4way: DISCOUNT_4WAY_AMT,
    discountStand: DISCOUNT_STAND_AMT,
    oneWayDiscount: ONEWAY_DISCOUNT_AMT,
    deluxeDiscount: DELUXE_DISCOUNT_AMT,
    firstGradeDiscount: FIRSTGRADE_DISCOUNT_AMT,
    oldDiscount: estimateConfig.oldProductDiscountRate,
    vatRate: estimateConfig.vatRate,
    cardFeeRate: estimateConfig.cardFeeRate,
    advanceDiscountRate: estimateConfig.advanceDiscountRate,
    comboWarnRate: estimateConfig.comboWarnRate,
    footerNotice: estimateConfig.footerNotice,
    unitRoundTo: UNIT_ROUND_TO,
    unitRoundMode: UNIT_ROUND_MODE,
  });
  return t;
}

/**
 * 거래처/담당자 directory prefetch.
 *
 * <p>기존 getCustomers_()/getManagers_() 호출자는 동기 함수에 의존한다. HTTP directory 조회는
 * 비동기이므로 bootstrap/getCustomerDataAsync 의 async 구간에서 CUS_V6/MGR_V1 캐시에 먼저 채우고,
 * 동기 getter 는 캐시만 읽도록 유지한다.
 *
 * @param {boolean=} forceRefresh 캐시를 지우고 다시 조회할지 여부
 */
async function preloadDirectoryCache_(forceRefresh) {
  const directory = require('./directory');
  if (forceRefresh === true) {
    cacheRemoveJSON_('CUS_V6');
    cacheRemoveJSON_('MGR_V1');
  }
  const tasks = [];
  if (!cacheGetJSON_('CUS_V6')) {
    // 빈 결과(서비스 다운 등)는 캐싱하지 않는다 — 다음 호출이 재시도해 복구 후 즉시 반영(10분 공백 방지).
    tasks.push(directory.fetchPartners('').then((rows) => {
      if (Array.isArray(rows) && rows.length) cachePutJSON_('CUS_V6', rows, 60 * 10);
    }));
  }
  if (!cacheGetJSON_('MGR_V1')) {
    tasks.push(directory.fetchManagers('').then((rows) => {
      if (Array.isArray(rows) && rows.length) cachePutJSON_('MGR_V1', rows, 60 * 10);
    }));
  }
  await Promise.all(tasks);
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
 * legacy getAllNotionDcConfigs_(forceRefresh) — 거래처코드별 DC 설정 전체 맵 (#31).
 *
 * <p>라이브(06-09) 는 Notion 거래처별 DC리스트를 페이지네이션 일괄 조회했다.
 * 우리는 dc-config-service `GET /internal/partner-dc-configs` (X-Internal-Token) 벌크로
 * 치환 — DcConfigResponse 목록을 legacy flat 키 맵 { partnerCode: dc } 로 변환.
 * 캐시 키/TTL 은 라이브 동일(NOTION_DC_MAP_V1, 10분).
 */
async function getAllNotionDcConfigs_(forceRefresh) {
  const cacheKey = 'NOTION_DC_MAP_V1';
  if (forceRefresh === true) {
    cacheRemoveJSON_(cacheKey);
  } else {
    const cached = cacheGetJSON_(cacheKey);
    if (cached) return cached;
  }

  const map = {};
  try {
    const resp = await ax.get(`${DC_CONFIG_BASE}/internal/partner-dc-configs`, {
      headers: { 'X-Internal-Token': DC_INTERNAL_TOKEN },
    });
    if (resp.status !== 200) {
      Logger.log(`[getAllNotionDcConfigs_] dc-config 벌크 ${resp.status} → 빈 맵`);
      return map;
    }
    const list = (resp.data && resp.data.data) || [];
    const num = (v) => (v == null ? null : Number(v));
    list.forEach((dc) => {
      const key = String(dc.partnerCode || '').replace(/[^\d]/g, '');
      if (!key) return;
      map[key] = {
        homeDiscount: num(dc.homeDiscountRate),
        commDiscount: num(dc.commercialDiscountRate),
        discount360: num(dc.discount360Amount),
        discount4way: num(dc.discount4WayAmount),
        discountStand: num(dc.discountStandAmount),
        oneWayDiscount: num(dc.discount1WayAmount),
        deluxeDiscount: num(dc.discountDeluxeAmount),
        firstGradeDiscount: num(dc.discountFirstGradeAmount),
        showIHose: dc.showIHose === true,
        unitRoundTo: num(dc.unitRoundTo),
        unitRoundMode: dc.unitRoundMode || null,
      };
    });
    cachePutJSON_(cacheKey, map, 60 * 10);
  } catch (e) {
    Logger.log(`[getAllNotionDcConfigs_] 벌크 조회 예외 → 빈 맵 (${e.message})`);
  }
  return map;
}

/**
 * legacy getCustomerDataAsync(forceRefresh) — 거래처 목록 + DC 설정 매칭 (#31 라이브 verbatim).
 *
 * <p>라이브(06-09): 거래처마다 사업자번호(없으면 거래처코드 숫자) 키로 DC 맵 매칭 → `dc` 부착.
 * 프론트 initCustomerSearch 가 거래처 선택 시 applyCustomerDiscounts(c.dc) 자동 적용.
 */
async function getCustomerDataAsync(forceRefresh) {
  await preloadDirectoryCache_(forceRefresh === true);
  const raw = getCustomers_();

  // 노션 거래처별 할인설정 맵 사업자번호 기준 매칭 (우리 DB 벌크 치환)
  const dcMap = await getAllNotionDcConfigs_(forceRefresh === true);
  const pickDc = (c) => {
    const byBiz = c.bizno ? dcMap[String(c.bizno).replace(/[^\d]/g, '')] : null;
    if (byBiz) return byBiz;
    const codeKey = String(c.code || '').replace(/[^\d]/g, '');
    return codeKey ? (dcMap[codeKey] || null) : null;
  };

  return raw.map((c) => ({
    code: c.code, name: c.name, bizno: c.bizno, rep: c.rep, tel: c.tel,
    addr: c.addr, group: c.group, note: c.note, dc: pickDc(c),
  }));
}

/**
 * legacy getCustomers_() — 거래처 directory cache read.
 */
function getCustomers_() {
  return cacheGetJSON_('CUS_V6') || [];
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
 * legacy getManagers_() — 담당자 directory cache read.
 */
function getManagers_() {
  return cacheGetJSON_('MGR_V1') || [];
}

async function getAllManagers(forceRefresh) {
  await preloadDirectoryCache_(forceRefresh === true);
  return getManagers_();
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
  const cfg = buildDefaultDcConfig_();
  if (!biznoDigits || biznoDigits.length !== 10) {
    Logger.log(`[initDcConfigFromNotion] DC 설정 기본값 사용 (유효하지 않은 사업자번호) ${biznoDigits}`);
    return cfg;
  }

  // G2: searchCustomerByBizOrCode는 CUS_V6 캐시 read 전용이라 독립 RPC 진입 시 캐시가 비었거나 TTL
  // 만료일 수 있다. customer 첨부 정확성을 위해 prefetch로 캐시를 보장한다(이미 warm이면 no-op).
  await preloadDirectoryCache_();
  const cust = searchCustomerByBizOrCode(biznoDigits);
  let notion = null;
  try {
    // #29 (개발책임자 결정 ③): partnerCode = 사업자번호 '-' 제외 동일값 — bizNo 키로
    // dc-config-service internal 조회 (legacy Notion 거래처별 DC리스트 → 우리 DB 대체).
    const resp = await ax.get(
      `${DC_CONFIG_BASE}/internal/partners/by-bizno/${biznoDigits}`,
      { headers: { 'X-Internal-Token': DC_INTERNAL_TOKEN } },
    );
    if (resp.status === 200) {
      const payload = (resp.data && resp.data.data) || resp.data || {};
      const dc = payload.dcConfig;
      if (dc) {
        // DcConfigResponse → legacy Notion flat 키 매핑 (merge 가드는 아래 공통 로직)
        const num = (v) => (v == null ? null : Number(v));
        notion = {
          homeDiscount: num(dc.homeDiscountRate),
          commDiscount: num(dc.commercialDiscountRate),
          showIHose: typeof dc.showIHose === 'boolean' ? dc.showIHose : null,
          discount360: num(dc.discount360Amount),
          discount4way: num(dc.discount4WayAmount),
          discountStand: num(dc.discountStandAmount),
          oneWayDiscount: num(dc.discount1WayAmount),
          deluxeDiscount: num(dc.discountDeluxeAmount),
          firstGradeDiscount: num(dc.discountFirstGradeAmount),
          unitRoundTo: num(dc.unitRoundTo),
          unitRoundMode: dc.unitRoundMode || null,
        };
      }
    } else if (resp.status === 404) {
      Logger.log(`[initDcConfigFromNotion] 미등록 거래처(bizNo=${biznoDigits}) → default 환원`);
    } else {
      Logger.log(`[initDcConfigFromNotion] dc-config 조회 ${resp.status} → default 환원`);
    }
  } catch (e) {
    Logger.log(`[initDcConfigFromNotion] dc-config 조회 실패 → default 환원 (${e.message})`);
  }

  // legacy 라이브 merge 시맨틱 — homeDiscount/commDiscount 는 number && ≠0 일 때만,
  // 나머지는 type 가드 통과 시에만 override (blanket Object.assign 금지: null/0 오염 방지)
  if (notion) {
    if (typeof notion.homeDiscount === 'number' && notion.homeDiscount !== 0) cfg.homeDiscount = notion.homeDiscount;
    if (typeof notion.commDiscount === 'number' && notion.commDiscount !== 0) cfg.commDiscount = notion.commDiscount;
    if (typeof notion.discount360 === 'number') cfg.discount360 = notion.discount360;
    if (typeof notion.discount4way === 'number') cfg.discount4way = notion.discount4way;
    if (typeof notion.discountStand === 'number') cfg.discountStand = notion.discountStand;
    if (typeof notion.oneWayDiscount === 'number') cfg.oneWayDiscount = notion.oneWayDiscount;
    if (typeof notion.deluxeDiscount === 'number') cfg.deluxeDiscount = notion.deluxeDiscount;
    if (typeof notion.firstGradeDiscount === 'number') cfg.firstGradeDiscount = notion.firstGradeDiscount;
    if (typeof notion.showIHose === 'boolean') cfg.showIHose = notion.showIHose;
    if (typeof notion.unitRoundTo === 'number') cfg.unitRoundTo = notion.unitRoundTo;
    if (notion.unitRoundMode) cfg.unitRoundMode = notion.unitRoundMode;
  }

  return Object.assign(cfg, { customer: cust });
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

/**
 * legacy decideWarehouseCode_(items) — 출고 창고 결정.
 * 라이브 종합견적서 Code.js (line 1639) verbatim — 기본 '00003'.
 * HOME×인피니트 또는 SINGLE×(360/1등급/냉방전용/1way/덕트/냉전/비스포크/벽걸이/
 * 가정용 에어컨) hit 시에만 '2'.
 */
function decideWarehouseCode_(items) {
  if (!Array.isArray(items) || !items.length) return '00003';

  // 원본 품명 후보 추출
  function getOrigName_(it) {
    if (!it) return '';
    const cand = it.nameRaw || it.rawName || it.nameOrig || it.name || it.pname || '';
    return String(cand || '');
  }

  function getSection_(it) {
    return String(it.section || '').toUpperCase();
  }

  // 홈멀티: 인피니트
  const homeHit = items.some(function (it) {
    if (getSection_(it) !== 'HOME') return false;
    const nm = getOrigName_(it);
    return /인피니트/.test(nm);
  });

  // 싱글 세트: 360, 1등급, 냉방전용, 1way, 덕트, 냉전, 비스포크, 벽걸이, 가정용 에어컨
  const singleHit = items.some(function (it) {
    if (getSection_(it) !== 'SINGLE') return false;
    const nm = getOrigName_(it);
    if (!nm) return false;
    if (/360/i.test(nm)) return true;
    if (/1등급/.test(nm)) return true;
    if (/냉방전용/.test(nm)) return true;
    if (/1\s*way/i.test(nm)) return true;
    if (/덕트/.test(nm)) return true;
    if (/냉전/.test(nm)) return true;
    if (/비스포크/.test(nm)) return true;
    if (/벽걸이/.test(nm)) return true;
    if (/가정용\s*에어컨/.test(nm)) return true;
    return false;
  });

  return (homeHit || singleHit) ? '2' : '00003';
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
    const estimateConfig = normalizeEstimateConfig_(order.estimateConfig || order.config);
    applyEstimateTotalAdjustments_(merged, estimateConfig, {
      advance: order?.payDue === '선결제',
    });

    // G2: getCustomers_()는 캐시 read 전용(시트 self-heal 제거)이라, 페이지를 오래 열어둔 뒤 제출해
    // CUS_V6 TTL(10분)이 만료되면 등록 거래처가 빈 캐시로 누락("미등록거래처")될 수 있다. 제출 직전
    // prefetch(이미 warm이면 no-op)로 캐시를 보장한다.
    await preloadDirectoryCache_();
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

    // G2: 거래처 시트 담당자명 컬럼 제거(custRec.manager 항상 빈값)로 거래처→담당자 역참조 폐기.
    // 선택 담당자가 있으면 전표/eCount 담당자로 우선 사용하고, 미선택 시 로그인 사용자로 fallback.
    let empCdFinal = order.managerCode || authInfo.managerCode || getScriptCreds_().EMP_CD;
    order.manager = String(order.manager || authInfo.managerName || '').trim();

    const SaleList = [];

    merged.forEach((it) => {
      const qty = Math.round(Number(it.qty) || 0);
      if (qty === 0) return;

      const priceVat = Math.round(Number(it.price) || 0);
      const total = priceVat * qty;
      const split = splitVatAmount_(total, estimateConfig);
      const unitSplit = splitVatAmount_(priceVat, estimateConfig);
      const supply = split.supply;
      const vatAmt = split.vat;
      const priceEx = unitSplit.supply;

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

// P0-A 하드닝(2026-06-10): 견적 snapshot 은 /internal/estimates/snapshots + X-Internal-Token
// (결정 ②, slip-bridge·dc-config 와 동일 server-to-server 토큰 게이트). 기존 무인증 폐기.
const SNAPSHOT_BASE = `${ESTIMATE_BASE}/internal/estimates/snapshots`;
const SNAPSHOT_HEADERS = { 'X-Internal-Token': DC_INTERNAL_TOKEN };

function unwrapList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

/**
 * legacy saveQuoteSnapshot(payload) (line 2614).
 * SamhanLogis: POST /internal/estimates/snapshots (X-Internal-Token)
 */
async function saveQuoteSnapshot(payload, authenticatedEmail) {
  const email = String(authenticatedEmail || Session.getActiveUser().getEmail() || '').trim();
  const snapshotId = payload && payload.snapshotId;
  const body = {
    createdAt: new Date().toISOString(),
    ...payload,
    userEmail: email,
  };
  delete body.snapshotId;
  const resp = snapshotId
    ? await ax.put(`${SNAPSHOT_BASE}/${encodeURIComponent(snapshotId)}`, body, { headers: SNAPSHOT_HEADERS })
    : await ax.post(SNAPSHOT_BASE, body, { headers: SNAPSHOT_HEADERS });
  if (resp.status < 200 || resp.status >= 300) {
    const error = new Error(`snapshot save failed: HTTP ${resp.status}`);
    error.statusCode = resp.status;
    throw error;
  }
  return (resp.data && resp.data.data) || resp.data;
}

/**
 * legacy getQuoteHistory(startDate, endDate) (line 2681).
 * SamhanLogis: GET /internal/estimates/snapshots?startDate=&endDate= (X-Internal-Token)
 */
async function getQuoteHistory(startDate, endDate) {
  const resp = await ax.get(SNAPSHOT_BASE, {
    params: { startDate, endDate },
    headers: SNAPSHOT_HEADERS,
  });
  if (resp.status < 200 || resp.status >= 300) {
    Logger.log(`[getQuoteHistory] ${resp.status} → 빈 목록`);
    return [];
  }
  // ApiResponse 봉투 {success, data:[...]} 언래핑(미언래핑 시 목록 항상 빈값 회귀).
  return unwrapList(resp.data);
}

/**
 * legacy getQuoteHistoryByCustomer(custName) — 거래처명 부분검색 최근 30건 (#31).
 * SamhanLogis: GET /internal/estimates/snapshots/by-customer?custName= (X-Internal-Token)
 */
async function getQuoteHistoryByCustomer(custName) {
  const resp = await ax.get(`${SNAPSHOT_BASE}/by-customer`, {
    params: { custName: String(custName || '').trim() },
    headers: SNAPSHOT_HEADERS,
  });
  if (resp.status < 200 || resp.status >= 300) {
    Logger.log(`[getQuoteHistoryByCustomer] ${resp.status} → 빈 목록`);
    return [];
  }
  return unwrapList(resp.data);
}

/* ════════════════════════════════════════════════════════════════════════
 * §9b 주소검색 — 라이브(06-09) 신규 8함수 verbatim (legacy Code.js 3028-3204)
 * Juso 도로명 + 네이버 지역검색 + NCP 지오코딩 병렬, UrlFetchApp.fetchAll(shim) 사용
 * ═══════════════════════════════════════════════════════════════════════ */

// 통합 주소 검색 상호 도로명 지오코딩 병렬
async function searchNaverAddress(query) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, error: '검색어가 비었습니다.', items: [] };

  const reqs = buildAddressRequests_(q);
  if (!reqs.length) {
    return { ok: false, error: '주소검색 자격(env) 미설정입니다.', items: [] };
  }
  let responses = [];
  try {
    responses = await UrlFetchApp.fetchAll(reqs.map(function (r) { return r.req; }));
  } catch (e) {
    return { ok: false, error: '통신 오류 ' + ((e && e.message) || e), items: [] };
  }

  const items = [];
  const seen = {};
  const pushUnique = function (row) {
    const key = (row.roadAddress || row.address || '') + '|' + (row.title || '');
    if (!key.trim() || seen[key]) return;
    seen[key] = 1;
    items.push(row);
  };

  reqs.forEach(function (r, i) {
    const parsed = r.parse(responses[i]);
    parsed.forEach(pushUnique);
  });

  if (!items.length) {
    return { ok: false, error: '검색 결과가 없습니다.', items: [] };
  }
  return { ok: true, items: items };
}

// 호출 묶음 만들기
function buildAddressRequests_(q) {
  const list = [];

  // 도로명주소 우선
  if (ROAD_API_KEY) {
    list.push({
      req: {
        url: 'https://business.juso.go.kr/addrlink/addrLinkApi.do'
          + '?currentPage=1&countPerPage=10&resultType=json'
          + '&confmKey=' + encodeURIComponent(ROAD_API_KEY)
          + '&keyword=' + encodeURIComponent(q),
        method: 'get',
        muteHttpExceptions: true,
      },
      parse: parseJusoResponse_,
    });
  }

  // 네이버 지역 검색 상호
  if (NAVER_SEARCH_ID && NAVER_SEARCH_SECRET) {
    list.push({
      req: {
        url: 'https://openapi.naver.com/v1/search/local.json'
          + '?query=' + encodeURIComponent(q)
          + '&display=5&start=1&sort=random',
        method: 'get',
        muteHttpExceptions: true,
        headers: {
          'X-Naver-Client-Id': NAVER_SEARCH_ID,
          'X-Naver-Client-Secret': NAVER_SEARCH_SECRET,
        },
      },
      parse: parseNaverLocalResponse_,
    });
  }

  // NCP 지오코딩
  if (NAVER_MAP_KEY_ID && NAVER_MAP_KEY) {
    list.push({
      req: {
        url: 'https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=' + encodeURIComponent(q),
        method: 'get',
        muteHttpExceptions: true,
        headers: {
          'x-ncp-apigw-api-key-id': NAVER_MAP_KEY_ID,
          'x-ncp-apigw-api-key': NAVER_MAP_KEY,
        },
      },
      parse: parseNaverGeocodeResponse_,
    });
  }

  return list;
}

// 도로명주소 응답 파싱
function parseJusoResponse_(res) {
  try {
    if (!res || res.getResponseCode() !== 200) return [];
    const json = JSON.parse(res.getContentText());
    const arr = json && json.results && json.results.juso ? json.results.juso : [];
    return arr.map(function (it) {
      const road = String(it.roadAddrPart1 || it.roadAddr || '').replace(/[()（）]/g, '').trim();
      const bdName = cleanBdNm_(it.bdNm);
      const jibun = stripTrailingName_(String(it.jibunAddr || '').trim(), bdName);
      return {
        source: 'juso',
        title: bdName,
        category: '',
        address: jibun,
        roadAddress: road,
      };
    });
  } catch (e) { return []; }
}

// 건물명 정리 괄호 제거 후 동 리 가 토큰 제외
function cleanBdNm_(raw) {
  if (!raw) return '';
  const s = String(raw).replace(/[()（）]/g, '').trim();
  if (!s) return '';
  const parts = s.split(/[,，]/).map(function (p) { return p.trim(); }).filter(Boolean);
  const filtered = parts.filter(function (part) {
    return !/^[가-힣]+(동|리|가)$/.test(part);
  });
  return filtered.join(' ');
}

// 정규식 이스케이프
function escapeRegex_(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 주소 끝에 붙은 토큰 제거
function stripTrailingName_(addr, name) {
  const a = String(addr || '').trim();
  const n = String(name || '').trim();
  if (!a || !n) return a;
  const re = new RegExp('\\s*' + escapeRegex_(n) + '\\s*$');
  return a.replace(re, '').trim();
}

// 네이버 지역검색 응답 파싱
function parseNaverLocalResponse_(res) {
  try {
    if (!res || res.getResponseCode() !== 200) return [];
    const json = JSON.parse(res.getContentText());
    const strip = function (s) { return String(s || '').replace(/<[^>]+>/g, ''); };
    return (json.items || []).map(function (it) {
      return {
        source: 'local',
        title: strip(it.title),
        category: strip(it.category),
        address: strip(it.address),
        roadAddress: strip(it.roadAddress),
      };
    });
  } catch (e) { return []; }
}

// 지오코딩 응답 파싱
function parseNaverGeocodeResponse_(res) {
  try {
    if (!res || res.getResponseCode() !== 200) return [];
    const json = JSON.parse(res.getContentText());
    if (json.status && json.status !== 'OK') return [];
    const pickBuilding = function (els) {
      const f = (els || []).find(function (e) { return (e.types || []).indexOf('BUILDING_NAME') >= 0; });
      return f ? String(f.longName || '') : '';
    };
    return (json.addresses || []).map(function (it) {
      const building = pickBuilding(it.addressElements);
      const road = stripTrailingName_(String(it.roadAddress || ''), building);
      const jibun = stripTrailingName_(String(it.jibunAddress || ''), building);
      return {
        source: 'geo',
        title: building,
        category: '',
        address: jibun,
        roadAddress: road,
      };
    });
  } catch (e) { return []; }
}

/* ════════════════════════════════════════════════════════════════════════
 * §10 인증 & 로그
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * legacy checkUserAuth(email) — 접속 승인 게이트 (#31 재배선).
 *
 * <p>legacy 는 Notion AUTH DB 에서 email 승인 여부를 조회했다. 기존 매핑
 * (`/api/v1/auth/me?email=`) 은 JWT(X-User-Id) 계약과 불일치해 실 스택에서 상시
 * 미승인 → 페이지 차단 회귀였다(#31 실 QA 적발). 치환 = user-service
 * `GET /internal/users/by-email` (X-Internal-Token) — 사용자 마스터 존재 = 승인.
 * UI 소비 필드: authorized + managerName (ecount* 는 폐기 유산 — 빈 값 유지).
 */
async function checkUserAuth(email) {
  const em = String(email || Session.getActiveUser().getEmail() || '').trim();
  if (!em) return { authorized: false };
  try {
    const resp = await ax.get(`${USER_SERVICE_BASE}/internal/users/by-email`, {
      params: { email: em },
      headers: { 'X-Internal-Token': DC_INTERNAL_TOKEN },
    });
    if (resp.status === 200) {
      const u = (resp.data && resp.data.data) || {};
      return {
        authorized: true,
        managerName: u.fullName || '',
        managerCode: u.loginId || '',
        ecountId: '',
        ecountApi: '',
      };
    }
    if (resp.status !== 404) {
      Logger.log(`[checkUserAuth] by-email ${resp.status} → 미승인 처리`);
    }
    return { authorized: false };
  } catch (e) {
    Logger.log(`[checkUserAuth] 조회 실패 → 미승인 처리 (${e.message})`);
    return { authorized: false };
  }
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
  normalizeEstimateConfig_, splitVatAmount_, applyEstimateTotalAdjustments_,
  // §3 부트스트랩
  getHomeMulti, getSingleSets, getSingleParts, getSingleMatPrices,
  getCommercialMulti, getCommercialParts, getOldProducts_,
  getHomeDefaults, getSingleDefaults, getRecommendOduData,
  getSpecDetailMap_, getPriceIncData_, getLogoImage, getGateImages,
  // §4 doGet
  doGet, bootstrap, clearSheetCache,
  // §5 거래처/담당자
  getCustomerDataAsync, getCustomers_, searchCustomerByBizOrCode,
  searchCustomerByBizno, getManagers_, getAllManagers, searchManagersByName_,
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
  saveQuoteSnapshot, getQuoteHistory, getQuoteHistoryByCustomer,
  // §9b 주소검색 (#31 라이브)
  searchNaverAddress, buildAddressRequests_, parseJusoResponse_, cleanBdNm_,
  escapeRegex_, stripTrailingName_, parseNaverLocalResponse_, parseNaverGeocodeResponse_,
  // §5b DC 벌크 (#31 라이브)
  getAllNotionDcConfigs_,
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
