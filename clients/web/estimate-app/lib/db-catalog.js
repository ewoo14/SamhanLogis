/**
 * #30 — estimate-app 카탈로그 DB 소스 레이어 (Google Sheets 직접 read 치환).
 *
 * 개발책임자 결정(2026-06-09, 옵션C 폐기): 품목/단가/구성품/자재가/추천실외기/구형 등
 * 시트 데이터를 우리 DB(product-service)로 전면 치환. 본 모듈은 product-service 의
 * `/products/internal/estimate-catalog/*` 벌크 endpoint(X-Internal-Token)를 read 해
 * legacy 시트 getter(getHomeMulti/getSingleSets/getCommercialMulti/getSingleParts/
 * getCommercialParts/getOldProducts_/getSingleMatPrices/getRecommendOduData/
 * getPriceIncData_)와 **동일 출력 shape** 으로 변환한다.
 *
 * 분류(catL/M/S)·표시명(disp)·matKey·useK2 등 파생값은 legacy 와 동일하게 응답 데이터를
 * 기반으로 본 모듈(또는 호출자가 주입한 classifier)이 재계산한다 — DB 는 raw 단가/단위/
 * 규격/변동DC 분기만 보유하고, 분류 로직은 estimate-app 의 단일 진실원(code.js)을 따른다.
 *
 * 환경변수:
 *   - PRODUCT_SERVICE_URL : product-service base (기본 http://localhost:8084)
 *   - SAMHAN_INTERNAL_TOKEN : X-Internal-Token (slip/dc-config 와 동일 값)
 */

'use strict';

const axios = require('axios');

const PRODUCT_BASE = process.env.PRODUCT_SERVICE_URL || 'http://localhost:8084';
const DC_CONFIG_BASE =
  process.env.DC_CONFIG_SERVICE_URL ||
  process.env.PARTNER_SERVICE_URL ||
  process.env.SAMHAN_API_BASE_URL ||
  'http://localhost:8089';
const INTERNAL_TOKEN =
  process.env.SAMHAN_INTERNAL_TOKEN ||
  process.env.INTERNAL_AUTH_TOKEN ||
  'CHANGE_ME_LOCAL_ONLY';
const BASE = `${PRODUCT_BASE}/products/internal/estimate-catalog`;

const ax = axios.create({ timeout: 20000, validateStatus: () => true });

async function get(pathAndQuery) {
  const resp = await ax.get(`${BASE}${pathAndQuery}`, {
    headers: { 'X-Internal-Token': INTERNAL_TOKEN },
  });
  if (resp.status !== 200) {
    throw new Error(`estimate-catalog GET ${pathAndQuery} → HTTP ${resp.status}`);
  }
  return (resp.data && resp.data.data) || [];
}

/**
 * 종합견적서가 소비할 HOME_MULTI 수량 동기화 규칙.
 * 규칙은 product-service의 내부 endpoint에서 읽고, 장애 시 호출자가 fallback한다.
 */
async function quantitySyncRules() {
  return get('/quantity-sync-rules?estimateCategory=HOME_MULTI');
}

async function getDcConfig(pathAndQuery) {
  const resp = await ax.get(`${DC_CONFIG_BASE}/internal${pathAndQuery}`, {
    headers: { 'X-Internal-Token': INTERNAL_TOKEN },
  });
  if (resp.status !== 200) {
    throw new Error(`dc-config GET ${pathAndQuery} → HTTP ${resp.status}`);
  }
  return (resp.data && resp.data.data) || {};
}

const num = (v) => (v == null ? 0 : Number(v) || 0);
const numOrNull = (v) => (v == null || v === '' ? 0 : Number(v) || 0);
const statusNote = (status) => ({
  DISCONTINUED: '단종',
  NOT_FOR_SALE: '미판매',
  OUT_OF_STOCK: '품절',
}[String(status || '')] || '');

/**
 * 홈멀티/상업멀티 카탈로그.
 * @param {('HOME_MULTI'|'COMMERCIAL_MULTI')} category
 * @param {(name:string, model:string)=>{catL,catM,catS,disp?}} classify
 */
async function multiCatalog(category, classify) {
  const rows = await get(`/products?category=${category}`);
  return rows.map((r) => {
    const cls = classify(r.name, r.modelCode) || {};
    return {
      name: r.name,
      model: r.modelCode,
      unit: r.unit || '',
      price: num(r.deliveryPrice), // 납품가
      // desktop/dc-config의 HOME·COMM 변동DC 기준가는 출고단가(outboundPrice)다.
      // 구형/미적재 행은 releasePrice로만 내려오는 동안 기존 경로를 유지한다.
      list: num(r.outboundPrice || r.releasePrice),
      formula: '',
      useK2: r.hasVariableDiscount === true,
      capacity: numOrNull(r.capacity),
      spec: r.specText || '',
      catL: cls.catL, catM: cls.catM, catS: cls.catS,
      disp: cls.disp || '',
      panelType: r.panelType || r.panel_type || '',
      remoteType: r.remoteType || r.remote_type || '',
      '고정DC': r.fixedDiscountRate == null ? '' : String(r.fixedDiscountRate),
      note: r.remark || statusNote(r.status),
      maxIndoor: numOrNull(r.maxIndoor),
    };
  });
}

/**
 * 싱글중대형.
 * @param {(s:{name,model})=>{L,M}} classifyLM
 */
async function singleSets(classifyLM, normalizeSize, sanitizeDisp) {
  const rows = await get('/products?category=SINGLE_SET');
  return rows.map((r, idx) => {
    const cls = classifyLM({ name: r.name, model: r.modelCode }) || {};
    const size = normalizeSize(r.pyongSize == null ? '' : String(r.pyongSize));
    const price = num(r.deliveryPrice);
    return {
      id: `${r.name}|${size}|${idx}`,
      name: sanitizeDisp(r.name),
      nameRaw: r.name,
      size,
      sizeText: size || '',
      model: r.modelCode,
      unit: r.unit || 'SET',
      row: idx,
      priceRight: price,
      priceRaw: price,
      price,
      list: num(r.releasePrice),
      matKey: r.materialKey || 'D4',
      catL: cls.L,
      catM: cls.M,
      note: r.remark || statusNote(r.status),
    };
  });
}

/** 구형 — 변동 전 baseline을 함께 주입한다. */
async function oldProducts() {
  const rows = await get('/products?category=LEGACY');
  const baselineRows = await get('/price-baseline');
  const baselineByModel = new Map(
    baselineRows
      .filter((r) => r && r.modelCode)
      .map((r) => [r.modelCode, r]),
  );
  return rows.map((r) => ({
    ...(() => {
      const baseline = baselineByModel.get(r.modelCode);
      return baseline
        ? {
            preChangePrice: num(baseline.releasePrice),
            preChangeSheetPrice: num(baseline.deliveryPrice),
          }
        : {};
    })(),
    name: r.name,
    model: r.modelCode,
    unit: r.unit || '',
    price: num(r.releasePrice), // 구형: 출고가(할인 기준액)
    sheetPrice: num(r.deliveryPrice), // 납품가
    isDisc: r.legacyDiscountFlag === true,
    remarks: r.remark || statusNote(r.status),
    spec: r.specText || '',
  }));
}

/** 싱글/상업 구성품. */
async function components(category, sanitizeDisp) {
  const rows = await get(`/components?category=${category}`);
  return rows.map((r) => ({
    setModel: r.setModelCode,
    refModel: r.setModelCode,
    kind: r.kind || '',
    model: r.componentModelCode,
    unit: r.unit || 'EA',
    price: num(r.deliveryPrice),
    list: num(r.releasePrice),
    name: r.name ? sanitizeDisp(r.name) : '',
    feat: r.variant || '',
    componentShape: r.componentShape || '',
    isDefault: r.isDefault === true,
    qtyMode: r.qtyMode || 'FOLLOW_SET',
    spec: r.specText || '',
    specs: Array.isArray(r.specs) ? r.specs : [],
    qty: r.defaultQty == null ? '1' : String(r.defaultQty),
  }));
}

/** 싱글 자재가격 → { 자재명: 가격 }. */
async function materialPrices() {
  const rows = await get('/material-prices');
  const map = {};
  rows.forEach((m) => {
    const key = String(m.name || '').trim();
    if (key) map[key] = num(m.price);
  });
  return map;
}

/** 추천실외기 → { comm, home, homeEx }. */
async function recommendOduData() {
  const rows = await get('/odu-recommendations');
  const comm = [];
  const home = [];
  rows.forEach((r) => {
    if (r.recommendationType === 'MULTI_HEATING_COOLING') {
      comm.push({ cap: num(r.indoorCapacity), hp: r.outdoorHp });
    } else if (r.recommendationType === 'HOME_MULTI') {
      home.push({ cap: num(r.indoorCapacity), hp: r.outdoorHp });
    }
  });
  // homeEx 는 legacy 시트 별도 컬럼(확장형) — 현 OduRecommendationLookup 이 미분리.
  // home 과 동일 set 로 graceful 반환(빈 배열보다 안전). 분리 필요 시 엔티티 확장 후속.
  return { comm, home, homeEx: home.slice() };
}

/** 변동 전 단가 비교 → { home, comm, single }. */
async function priceIncData() {
  const rows = await get('/price-baseline');
  const out = { home: {}, comm: {}, single: {} };
  rows.forEach((r) => {
    // 단가변동 옵션은 표면의 옵션 상태를 유지하되, 실제 변동DC 기준가는
    // desktop·dc-config와 같은 현행 출고단가를 사용한다.
    const list = num(r.outboundPrice || r.releasePrice);
    const price = num(r.deliveryPrice);
    switch (r.estimateCategory) {
      case 'HOME_MULTI':
        if (list > 0) out.home[r.modelCode] = list;
        break;
      case 'COMMERCIAL_MULTI':
        if (list > 0) out.comm[r.modelCode] = list;
        break;
      case 'SINGLE_SET':
        out.single[r.modelCode] = {};
        if (list > 0) out.single[r.modelCode].list = list;
        if (price > 0) out.single[r.modelCode].price = price;
        break;
      default:
        break;
    }
  });
  return out;
}

/** 카테고리별 단가 변동일 맵. */
async function priceChangeSchedule() {
  const resp = await ax.get(`${PRODUCT_BASE}/products/internal/price-change-schedule`, {
    headers: { 'X-Internal-Token': INTERNAL_TOKEN },
  });
  if (resp.status !== 200) {
    throw new Error(`price-change-schedule GET → HTTP ${resp.status}`);
  }
  return (resp.data && resp.data.data) || {};
}

/** 카테고리별 변동단가 체크박스 기본값 맵 (defaultPreChange 저장값, estimate-app 소비). */
async function priceDefaultVariant() {
  const resp = await ax.get(`${PRODUCT_BASE}/products/internal/price-change-default-variant`, {
    headers: { 'X-Internal-Token': INTERNAL_TOKEN },
  });
  if (resp.status !== 200) {
    throw new Error(`price-change-default-variant GET → HTTP ${resp.status}`);
  }
  return (resp.data && resp.data.data) || {};
}

/** 사양 상세 맵 → getSpecDetailMap_() 동일 shape. */
async function specDetailMap() {
  const map = await get('/spec-detail-map');
  return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
}

/** 종합견적서 전역 가격 파라미터. */
async function estimateConfig() {
  const config = await getDcConfig('/estimate-config');
  return config && typeof config === 'object' && !Array.isArray(config) ? config : {};
}

module.exports = {
  quantitySyncRules,
  multiCatalog,
  singleSets,
  oldProducts,
  components,
  materialPrices,
  recommendOduData,
  priceIncData,
  priceChangeSchedule,
  priceDefaultVariant,
  specDetailMap,
  estimateConfig,
};
