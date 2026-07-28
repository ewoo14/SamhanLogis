function doGet() {
  const t = HtmlService.createTemplateFromFile('index');
  t.config = JSON.stringify({
    srcSheetId: SRC_SHEET_ID,
    sheetNames: { master: MASTER_SHEET, home: HOME_SHEET, single: SINGLE_SHEET, singleParts: SINGLE_PARTS_SHEET },
    managers: getManagers_(),
    customers: getCustomerList_()
  });
  return t.evaluate().setTitle('발주서 PDF 업로드');
}

// 설정
var NOTION_DB_ID = "193a1006d6588161a02cc8f196d7102b";
var NOTION_TOKEN = "REDACTED_NOTION_TOKEN";
var NOTION_VER   = "2022-06-28";
var MANAGER_NOTION_DB_ID = "198a1006d65880ddb510e0d525c5e9da";
var MANAGER_NOTION_TOKEN = "REDACTED_NOTION_TOKEN";

// 캐시
let CURRENT_CUST_CODE = null;

/* 스프레드시트 설정 */
const SRC_SHEET_ID        = '1RJqO3jT-yJTi3NDBhL60o_cZWlVETGTU7UlvIKXuVNQ';
const MASTER_SHEET        = '종합 견적서';
const HOME_SHEET          = '홈멀티';
const SINGLE_SHEET        = '싱글 세트';
const SINGLE_PARTS_SHEET  = '싱글 구성품';
const MANAGER_SHEET       = '담당자';

/* 가격 전역 설정 */
const DEFAULT_PRICING = {
  CURRENCY: 'KRW',
  HOME_DISCOUNT_RATE: 0.45,
  SURCHARGE_RATE: 0.0,
  ROUND_TO: 0,
  ROUND_MODE: 'ROUND',
  PRICE_DECIMALS: 0,
  DISCOUNT_360_AMT: 0,
  DISCOUNT_4WAY_AMT: 0,
  DISCOUNT_STAND_AMT: 0,
  ONEWAY_DISCOUNT_AMT: 0,
  DELUXE_DISCOUNT_AMT: 0,
  FIRSTGRADE_DISCOUNT_AMT: 0,
  FLEX_HOSE_CODE: 'FH-LFHIF'
};

// 설정조회
function fetchNotionPricingForCustomer_(custCode) {
  try {
    const numCode = Number(String(custCode || '').replace(/[^\d]/g, ''));
    if (!numCode) return null;

    let dbId = String(NOTION_DB_ID || '').replace(/[^a-zA-Z0-9]/g, '');
    if (dbId.length === 32) {
      dbId = dbId.slice(0, 8) + '-' + dbId.slice(8, 12) + '-' + dbId.slice(12, 16) + '-' + dbId.slice(16, 20) + '-' + dbId.slice(20);
    }
    
    if (!dbId) {
      Logger.log('🟥 누락');
      return null;
    }

    // 확인
    let dsList = [];
    try {
      const metaRes = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + dbId, {
        method: 'get',
        headers: {
          'Authorization': 'Bearer ' + NOTION_TOKEN,
          'Notion-Version': '2025-09-03'
        },
        muteHttpExceptions: true
      });
      if (metaRes.getResponseCode() === 200) {
        const metaJson = JSON.parse(metaRes.getContentText());
        dsList = metaJson.data_sources || [];
      }
    } catch(e) {}

    const payload = {
      filter: {
        property: '거래처코드',
        number: { equals: numCode }
      },
      page_size: 1
    };

    let results = [];

    if (dsList.length > 0) {
      // 우회
      for (let i = 0; i < dsList.length; i++) {
        const res = UrlFetchApp.fetch('https://api.notion.com/v1/data_sources/' + dsList[i].id + '/query', {
          method: 'post',
          headers: {
            'Authorization': 'Bearer ' + NOTION_TOKEN,
            'Notion-Version': '2025-09-03',
            'Content-Type': 'application/json'
          },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });
        if (res.getResponseCode() === 200) {
          const body = JSON.parse(res.getContentText());
          if (body.results && body.results.length > 0) {
            results = body.results;
            break;
          }
        }
      }
    } else {
      // 기본
      const res = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + dbId + '/query', {
        method: 'post',
        headers: {
          'Authorization': 'Bearer ' + NOTION_TOKEN,
          'Notion-Version': NOTION_VER,
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200) {
        const body = JSON.parse(res.getContentText());
        results = body.results || [];
      }
    }

    if (!results.length) {
      Logger.log('⚠️ 결과없음');
      return null;
    }

    const row   = results[0];
    const props = row.properties || {};

    function num(name) {
      const p = props[name];
      if (!p || p.type !== 'number') return null;
      const v = p.number;
      return typeof v === 'number' ? v : null;
    }
    function bool(name) {
      const p = props[name];
      if (!p || p.type !== 'checkbox') return false;
      return !!p.checkbox;
    }
    function sel(name) {
      const p = props[name];
      if (!p || p.type !== 'select' || !p.select) return null;
      const v = p.select.name;
      return v ? String(v).trim() : null;
    }

    let homeDc = num('홈멀티DC');
    if (typeof homeDc === 'number') {
      homeDc = homeDc > 1 ? homeDc / 100 : homeDc;
    }

    let commDc = num('상업멀티DC');
    if (typeof commDc === 'number') {
      commDc = commDc > 1 ? commDc / 100 : commDc;
    }

    const disc360    = num('360');
    const disc4way   = num('4way');
    const discStand  = num('스탠드');
    const oneWay     = num('1way');
    const deluxe     = num('디럭스');
    const firstGrade = num('1등급');
    const flexOn     = bool('유연호스');
    const unitSel    = sel('단위처리');

    let roundTo   = null;
    let roundMode = null;

    if (unitSel) {
      const m = unitSel.match(/(\d+)\s*원?/);
      if (m) roundTo = Number(m[1]);

      if (/반올림/.test(unitSel)) {
        roundMode = 'ROUND';
      } else if (/올림/.test(unitSel)) {
        roundMode = 'CEIL';
      } else if (/내림/.test(unitSel)) {
        roundMode = 'FLOOR';
      }
    }

    const result = {};
    if (typeof homeDc === 'number')     result.HOME_DISCOUNT_RATE       = homeDc;
    if (typeof commDc === 'number')     result.COMM_DISCOUNT_RATE       = commDc;
    if (typeof disc360 === 'number')    result.DISCOUNT_360_AMT         = disc360;
    if (typeof disc4way === 'number')   result.DISCOUNT_4WAY_AMT        = disc4way;
    if (typeof discStand === 'number')  result.DISCOUNT_STAND_AMT       = discStand;
    if (typeof oneWay === 'number')     result.ONEWAY_DISCOUNT_AMT      = oneWay;
    if (typeof deluxe === 'number')     result.DELUXE_DISCOUNT_AMT      = deluxe;
    if (typeof firstGrade === 'number') result.FIRSTGRADE_DISCOUNT_AMT  = firstGrade;
    result.FLEX_HOSE_CODE = flexOn ? 'FH-LFHIF' : 'FH-LFHLF';
    if (typeof roundTo === 'number')    result.ROUND_TO                 = roundTo;
    if (roundMode)                      result.ROUND_MODE               = roundMode;

    Logger.log('📥 완료');
    return result;
  } catch (e) {
    Logger.log('🟥 오류');
    return null;
  }
}

// 가격 설정 읽기 (거래처별)
function getPricingConfig_(custCodeOpt) {
  const sp    = PropertiesService.getScriptProperties();
  const cache = CacheService.getScriptCache();

  const rawCust  = (typeof custCodeOpt !== 'undefined' && custCodeOpt !== null)
    ? custCodeOpt
    : CURRENT_CUST_CODE;

  const numCode  = Number(String(rawCust || '').replace(/[^\d]/g, ''));
  const keySuffix = numCode ? String(numCode) : 'DEFAULT';
  const cKey     = 'PRICING_CFG_AIRDESIGNER_V2_' + keySuffix; // V2 적용

  const hit = cache.get(cKey);
  if (hit) {
    try {
      return JSON.parse(hit);
    } catch (e) {}
  }

  const p = { ...DEFAULT_PRICING };

  // 스크립트 속성 우선 반영
  [
    'CURRENCY',
    'HOME_DISCOUNT_RATE',
    'COMM_DISCOUNT_RATE',
    'DISCOUNT_RATE',
    'SURCHARGE_RATE',
    'ROUND_TO',
    'ROUND_MODE',
    'PRICE_DECIMALS',
    'DISCOUNT_360_AMT',
    'DISCOUNT_4WAY_AMT',
    'DISCOUNT_STAND_AMT',
    'ONEWAY_DISCOUNT_AMT',
    'DELUXE_DISCOUNT_AMT',
    'FIRSTGRADE_DISCOUNT_AMT',
    'FLEX_HOSE_CODE'
  ].forEach(function(k){
    const v = sp.getProperty('PRICING_' + k);
    if (v == null) return;

    if (k === 'CURRENCY') {
      p.CURRENCY = String(v);
    } else if (k === 'ROUND_MODE') {
      const m = String(v).toUpperCase();
      if (m === 'ROUND' || m === 'CEIL' || m === 'FLOOR') p.ROUND_MODE = m;
    } else if (k === 'FLEX_HOSE_CODE') {
      p.FLEX_HOSE_CODE = String(v).trim() || p.FLEX_HOSE_CODE;
    } else if (k === 'HOME_DISCOUNT_RATE' || k === 'COMM_DISCOUNT_RATE' || k === 'DISCOUNT_RATE') {
      const num = Number(v);
      if (!isNaN(num)) {
        const frac = (num > 1 ? num / 100 : num);
        if (k === 'HOME_DISCOUNT_RATE' || k === 'DISCOUNT_RATE') {
          p.HOME_DISCOUNT_RATE = frac;
        }
        if (k === 'COMM_DISCOUNT_RATE') {
          p.COMM_DISCOUNT_RATE = frac;
        }
      }
    } else if (k === 'SURCHARGE_RATE') {
      const num = Number(v);
      if (!isNaN(num)) p.SURCHARGE_RATE = (num > 1 ? num / 100 : num);
    } else if (k === 'ROUND_TO') {
      const num = Number(v);
      if (!isNaN(num) && num >= 0) p.ROUND_TO = num;
    } else if (k === 'PRICE_DECIMALS') {
      const num = Number(v);
      if (!isNaN(num) && num >= 0) p.PRICE_DECIMALS = num;
    } else {
      const num = Number(v);
      if (!isNaN(num)) p[k] = num;
    }
  });

  // 노션 설정 덮어쓰기 (거래처별)
  try {
    if (numCode) {
      const notionCfg = fetchNotionPricingForCustomer_(numCode);
      if (notionCfg) {
        if (typeof notionCfg.HOME_DISCOUNT_RATE === 'number')
          p.HOME_DISCOUNT_RATE = notionCfg.HOME_DISCOUNT_RATE;
        if (typeof notionCfg.COMM_DISCOUNT_RATE === 'number')
          p.COMM_DISCOUNT_RATE = notionCfg.COMM_DISCOUNT_RATE;
        if (typeof notionCfg.DISCOUNT_360_AMT === 'number')
          p.DISCOUNT_360_AMT = notionCfg.DISCOUNT_360_AMT;
        if (typeof notionCfg.DISCOUNT_4WAY_AMT === 'number')
          p.DISCOUNT_4WAY_AMT = notionCfg.DISCOUNT_4WAY_AMT;
        if (typeof notionCfg.DISCOUNT_STAND_AMT === 'number')
          p.DISCOUNT_STAND_AMT = notionCfg.DISCOUNT_STAND_AMT;
        if (typeof notionCfg.ONEWAY_DISCOUNT_AMT === 'number')
          p.ONEWAY_DISCOUNT_AMT = notionCfg.ONEWAY_DISCOUNT_AMT;
        if (typeof notionCfg.DELUXE_DISCOUNT_AMT === 'number')
          p.DELUXE_DISCOUNT_AMT = notionCfg.DELUXE_DISCOUNT_AMT;
        if (typeof notionCfg.FIRSTGRADE_DISCOUNT_AMT === 'number')
          p.FIRSTGRADE_DISCOUNT_AMT = notionCfg.FIRSTGRADE_DISCOUNT_AMT;
        if (typeof notionCfg.ROUND_TO === 'number')
          p.ROUND_TO = notionCfg.ROUND_TO;
        if (notionCfg.ROUND_MODE)
          p.ROUND_MODE = notionCfg.ROUND_MODE;
        if (notionCfg.FLEX_HOSE_CODE)
          p.FLEX_HOSE_CODE = notionCfg.FLEX_HOSE_CODE;
      }
    }
  } catch (e) {
    Logger.log('>> ⚠️ 노션 할인 설정 조회 실패 ' + e);
  }

  // COMM_DISCOUNT_RATE가 비어 있으면 기본적으로 HOME_DISCOUNT_RATE와 동일하게 맞춤
  if (typeof p.COMM_DISCOUNT_RATE !== 'number') {
    p.COMM_DISCOUNT_RATE = p.HOME_DISCOUNT_RATE;
  }

  // 호환성: DISCOUNT_RATE = HOME_DISCOUNT_RATE 로 사용
  p.DISCOUNT_RATE = (typeof p.HOME_DISCOUNT_RATE === 'number')
    ? p.HOME_DISCOUNT_RATE
    : (typeof p.DISCOUNT_RATE === 'number' ? p.DISCOUNT_RATE : 0.47);

  cache.put(cKey, JSON.stringify(p), 5 * 60);
  Logger.log('>> 💰 가격 설정 cust=' + keySuffix + ' ' + JSON.stringify(p));
  return p;
}

/* step 반올림(ROUND_TO) */
function roundToStep_(value, step, mode) {
  const s = Number(step || 0);
  const m = (mode || 'FLOOR').toUpperCase();
  if (!isFinite(value)) return 0;
  if (!s || s <= 0) {
    if (m === 'ROUND') return Math.round(value);
    if (m === 'CEIL')  return Math.ceil(value);
    return Math.floor(value);
  }
  const q = value / s;
  let r;
  if (m === 'ROUND') r = Math.round(q);
  else if (m === 'CEIL') r = Math.ceil(q);
  else r = Math.floor(q);
  return r * s;
}

// 기본 할인 적용
function applyPricing_(basePrice) {
  const cfg = getPricingConfig_();
  const dc  = (typeof cfg.DISCOUNT_RATE === 'number') ? cfg.DISCOUNT_RATE : 0;
  const discounted = basePrice * (1 - dc) * (1 + (cfg.SURCHARGE_RATE || 0));
  const step = Number(cfg.ROUND_TO || 0);
  const mode = cfg.ROUND_MODE || 'FLOOR';
  const rounded = roundToStep_(discounted, step, mode);
  return Number(rounded.toFixed(cfg.PRICE_DECIMALS || 0));
}

// 특정 할인율(고정 DC 등) 적용
function applyPricingWithDC_(basePrice, dcRateOrNull) {
  const cfg = getPricingConfig_();
  const dc  = (typeof dcRateOrNull === 'number' && !isNaN(dcRateOrNull))
    ? dcRateOrNull
    : (typeof cfg.DISCOUNT_RATE === 'number' ? cfg.DISCOUNT_RATE : 0);
  const discounted = basePrice * (1 - dc) * (1 + (cfg.SURCHARGE_RATE || 0));
  const step = Number(cfg.ROUND_TO || 0);
  const mode = cfg.ROUND_MODE || 'FLOOR';
  const rounded = roundToStep_(discounted, step, mode);
  return Number(rounded.toFixed(cfg.PRICE_DECIMALS || 0));
}

/* 이카운트 인증 */
function getScriptCreds_() {
  const sp = PropertiesService.getScriptProperties();
  const COM_CODE_D = '174539';
  const USER_ID_D  = '11840720103';
  const KEY_D      = 'REDACTED_ECOUNT_API_CERT_KEY';
  return {
    COM_CODE:     (sp.getProperty('COM_CODE')     || COM_CODE_D).trim(),
    USER_ID:      (sp.getProperty('USER_ID')      || USER_ID_D ).trim(),
    API_CERT_KEY: (sp.getProperty('API_CERT_KEY') || KEY_D     ).trim(),
    EMP_CD:       (sp.getProperty('EMP_CD')       || '250102').trim()
  };
}

function callZoneApi(comCode){
  const res = UrlFetchApp.fetch('http://152.69.228.109:3000/proxy/ecount/zone', {
    method:'post', contentType:'application/json',
    payload:JSON.stringify({ COM_CODE: comCode }),
    muteHttpExceptions:true
  });
  if (res.getResponseCode() !== 200) throw new Error('조회실패');
  const zone = (JSON.parse(res.getContentText())||{}).Data?.ZONE;
  if (!zone) throw new Error('값없음');
  return zone;
}

// 세션
function getEcountSession(optUserId, optApiKey){
  const creds = getScriptCreds_();
  const COM_CODE = creds.COM_CODE;
  const USER_ID = optUserId || creds.USER_ID;
  const API_CERT_KEY = optApiKey || creds.API_CERT_KEY;
  if (!COM_CODE || !USER_ID || !API_CERT_KEY) throw new Error('정보누락');

  const key = 'ECOUNT_SESSION_'+COM_CODE+'_'+USER_ID;
  const cache = CacheService.getScriptCache();
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  const zoneRaw = callZoneApi(COM_CODE);
  const zone = String(zoneRaw).toLowerCase();

  const res = UrlFetchApp.fetch('http://152.69.228.109:3000/proxy/ecount/login', {
    method:'post', contentType:'application/json',
    payload:JSON.stringify({ COM_CODE, USER_ID, API_CERT_KEY, LAN_TYPE:'ko-KR', ZONE:zoneRaw }),
    muteHttpExceptions:true
  });
  if (res.getResponseCode() !== 200) throw new Error('로그인실패');
  const sessionId = (JSON.parse(res.getContentText())||{}).Data?.Datas?.SESSION_ID;
  if (!sessionId) throw new Error('값없음');

  cache.put(key, JSON.stringify({ sessionId, zone }), 3000);
  return { sessionId, zone };
}

/* 유틸 */
function normalizeTel_(s) {
  const n = String(s || '').replace(/[^\d]/g, '');
  if (!n) return '';
  if (n.length === 11 && n.startsWith('010')) return `010-${n.slice(3,7)}-${n.slice(7)}`;
  if (n.length === 10 && n.startsWith('010')) return `010-${n.slice(3,6)}-${n.slice(6)}`;
  return n;
}
function toYmd_(v) {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return String(v).replace(/-/g,'');
  if (/^\d{8}$/.test(String(v))) return String(v);
  const d = new Date(v);
  if (isNaN(d)) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyyMMdd');
}
function formatCurrency_(n){
  return String(Math.floor(Number(n)||0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function normalizeModel_(s) {
  if (!s) return '';
  let x = String(s).trim();
  x = x.split('/')[0];
  x = x.replace(/\s+/g, '');
  x = x.replace(/[-_]/g, '');
  x = x.replace(/[\uff01-\uff5e]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  x = x.toUpperCase();
  return x;
}
function idxByNames_(hdr, names) {
  const H = hdr.map(v => String(v || '').trim());
  const keys = names.map(s => String(s || '').trim().toLowerCase());
  for (let i = 0; i < H.length; i++) {
    if (keys.includes(H[i].toLowerCase())) return i;
  }
  return -1;
}

// 창고 코드 결정
function decideWarehouseFromItems_(items) {
  const src = Array.isArray(items) ? items : [];
  if (!src.length) {
    Logger.log('>> 🏬 기본 초월창고');
    return { code: '00003', name: '초월창고' };
  }

  const maps = loadModelNameMaps_();
  const homeMap = maps.home || {};
  const singleMap = maps.single || {};

  const normModel = function(m) {
    return normalizeModel_(String(m || ''));
  };

  const hasHomeMulti = src.some(function(it) {
    if (it.fromSet) return false;
    const key = normModel(it.model);
    return /^AJ\d/i.test(key);
  });

  let whCode = '00003';
  let whName = '초월창고';

  if (hasHomeMulti) {
    const hasInfinite = src.some(function(it) {
      if (it.fromSet) return false;
      const key = normModel(it.model);
      const name = homeMap[key] || '';
      const spec = String(it.spec || '');
      return /인피니트/i.test(name) || /인피니트/i.test(spec) || /인피니트/i.test(it.model);
    });

    if (hasInfinite) {
      whCode = '2';
      whName = '상일창고';
    }
  } else {
    const singlePattern = /(360|냉방전용|1\s*[- ]?\s*way|1\s*웨이|원\s*웨이|1\s*w\b|냉전|비스포크|1등급|벽걸이|가정용\s*에어컨)/i;

    const hasSingleKeyword = src.some(function(it) {
      const key = normModel(it.model);
      const name = singleMap[key] || it.pumName || '';
      const spec = String(it.spec || '');
      const text = name + ' ' + spec + ' ' + it.model;
      if (singlePattern.test(text)) return true;
      const flags = getModelFlags(String(it.model || ''));
      return flags.is360 || flags.is1way || flags.isGrade1;
    });

    if (hasSingleKeyword) {
      whCode = '2';
      whName = '상일창고';
    }
  }

  Logger.log('>> 🏬 창고 판정 완료 code=' + whCode + ' (' + whName + ')');
  return { code: whCode, name: whName };
}

// 모델 코드 접두로 홈멀티/싱글 판별
function isHomeMultiCode_(code){ 
  return /^AJ\d+/i.test(String(code||'')); 
}
function isSingleCode_(code){
  return /^(AC|AP|AR|AF)\d+/i.test(String(code||'')); 
}

/* 헤더 행 감지 강화 */
function getHeaderRowIndex_(sheetName) {
  if (sheetName === HOME_SHEET || sheetName === HOME_SHEET + '_단가인상') return 3;
  if (sheetName === SINGLE_SHEET || sheetName === SINGLE_SHEET + '_단가인상') return 3;

  // 탐색
  if (sheetName === SINGLE_PARTS_SHEET || sheetName === SINGLE_PARTS_SHEET + '_단가인상') {
    const ss = SpreadsheetApp.openById(SRC_SHEET_ID);
    const sh = ss.getSheetByName(sheetName);
    if (!sh) return 2;
    const maxProbe = Math.min(4, sh.getLastRow());
    for (let r = 1; r <= maxProbe; r++) {
      const row = sh.getRange(r, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(v => String(v||'').trim());
      const hasSet   = row.some(t => t.replace(/\s/g,'') === '세트');
      const hasModel = row.some(t => /^(모델명|MODEL)$/i.test(t.replace(/\s/g,'')));
      if (hasSet && hasModel) return r;
    }
    return 2;
  }
  return 1;
}

/* 시트 읽기 보정 */
function readSheetWithHeader_(ss, sheetName) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return { hdr: [], rows: [], formulas: [] };
  const headerRow = getHeaderRowIndex_(sheetName);
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < headerRow || lastCol < 1) return { hdr: [], rows: [], formulas: [] };
  const rng = sh.getRange(headerRow, 1, lastRow - headerRow + 1, lastCol);
  const vals = rng.getDisplayValues();
  const frms = rng.getFormulas();
  if (!vals.length) return { hdr: [], rows: [], formulas: [] };

  let hdr = (vals[0] || []).map(v => String(v || '').trim());
  let body = vals.slice(1);
  let bodyFrm = frms.slice(1);
  if (!hdr.some(x=>x)) {
    if (vals.length >= 2) {
      hdr = (vals[1] || []).map(v => String(v || '').trim());
      body = vals.slice(2);
      bodyFrm = frms.slice(2);
    }
  }
  return { hdr, rows: body, formulas: bodyFrm };
}
function normalizeHeaderText_(s) {
  return String(s || '').replace(/\u00A0/g, ' ').replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
}
function getHeaderIndexMapAllCols_(sh, headerRow) {
  const maxCol = sh.getMaxColumns();
  const row = sh.getRange(headerRow, 1, 1, maxCol).getDisplayValues()[0] || [];
  const map = {};
  for (let c = 0; c < row.length; c++) {
    const t = normalizeHeaderText_(row[c]);
    if (!t) continue;
    if (map[t] == null) map[t] = c + 1;
  }
  return map;
}
function findByLabels_(sh, idxMap, labels) {
  for (let i=0;i<labels.length;i++){
    const keyNorm = normalizeHeaderText_((labels[i]));
    if (idxMap[keyNorm] != null) {
      const col = idxMap[keyNorm];
      try { const hidden = sh.isColumnHiddenByUser ? sh.isColumnHiddenByUser(col) : false;
        Logger.log('>> 🔎 컬럼 ' + keyNorm + ' = C' + col + ' hidden=' + hidden);
      } catch(e){}
      return col;
    }
    for (const k in idxMap){
      if (k.replace(/\s/g,'') === keyNorm.replace(/\s/g,'')) {
        const col = idxMap[k];
        try { const hidden = sh.isColumnHiddenByUser ? sh.isColumnHiddenByUser(col) : false;
          Logger.log('>> 🔎 컬럼 ' + keyNorm + ' ≈ ' + k + ' = C' + col + ' hidden=' + hidden);
        } catch(e){}
        return col;
      }
    }
  }
  return null;
}

// 담당자
function getManagers_() {
  let dbId = String(MANAGER_NOTION_DB_ID || '').replace(/[^a-zA-Z0-9]/g, '');
  if (dbId.length === 32) {
    dbId = dbId.slice(0, 8) + '-' + dbId.slice(8, 12) + '-' + dbId.slice(12, 16) + '-' + dbId.slice(16, 20) + '-' + dbId.slice(20);
  }

  if (!dbId) {
    Logger.log('🟥 누락');
    return [];
  }

  const url = 'https://api.notion.com/v1/databases/' + dbId + '/query';
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + MANAGER_NOTION_TOKEN,
      'Notion-Version': NOTION_VER,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({}),
    muteHttpExceptions: true
  });
  
  const code = res.getResponseCode();
  if (code !== 200) {
    Logger.log('🟥 실패');
    return [];
  }
  
  const data = JSON.parse(res.getContentText());
  const results = data.results || [];
  const list = [];
  
  for (let i = 0; i < results.length; i++) {
    const props = results[i].properties;
    
    const nameArr = props['이름'] ? props['이름'].title : [];
    const name = nameArr.length > 0 ? nameArr[0].plain_text : '';
    
    const codeArr = props['담당자코드'] ? props['담당자코드'].rich_text : [];
    const mgrCode = codeArr.length > 0 ? codeArr[0].plain_text : '';
    
    const idArr = props['이카운트ID'] ? props['이카운트ID'].rich_text : [];
    const ecountId = idArr.length > 0 ? idArr[0].plain_text : '';
    
    const apiArr = props['이카운트API'] ? props['이카운트API'].rich_text : [];
    const ecountApi = apiArr.length > 0 ? apiArr[0].plain_text : '';
    
    if (name && mgrCode) {
      list.push({ name: name, code: mgrCode, ecountId: ecountId, ecountApi: ecountApi });
    }
  }
  
  Logger.log('👥 완료');
  return list;
}

// 거래처
function getCustomerList_(){
  return [
    { label:'에어디자이너 주식회사', code:'6568702893' },
    { label:'공기를디자인하는사람들 주식회사', code:'6508103591' }
  ];
}

/* 거래처 메모 조회 */
function lookupCustomerMemos_(custCode) {
  try {
    const ss = SpreadsheetApp.openById(SRC_SHEET_ID);
    const sh = ss.getSheetByName('거래처');
    if (!sh) return { U_MEMO1:'', U_MEMO2:'', U_MEMO3:'' };
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return { U_MEMO1:'', U_MEMO2:'', U_MEMO3:'' };
    const rows = sh.getRange(2, 1, lastRow - 1, 6).getValues();
    const key = String(custCode || '').trim();
    for (let i = 0; i < rows.length; i++) {
      const code = String(rows[i][0] || '').trim();
      if (!code || code !== key) continue;
      const ceo   = String(rows[i][3] || '').trim();
      const addr  = String(rows[i][4] || '').trim();
      const phone = String(rows[i][5] || '').trim();
      Logger.log('>> 🧾 거래처 메모 조회 성공 code=' + code);
      return { U_MEMO1: phone, U_MEMO2: addr, U_MEMO3: ceo };
    }
  } catch (e) {
    Logger.log('>> ❗ 거래처 메모 조회 실패 ' + e);
  }
  return { U_MEMO1:'', U_MEMO2:'', U_MEMO3:'' };
}

/* 순서/규격 맵 */
function getMasterModelOrder_(){
  const ss = SpreadsheetApp.openById(SRC_SHEET_ID);
  const sh = ss.getSheetByName(MASTER_SHEET);
  if (!sh) return {};
  const vr = sh.getDataRange().getDisplayValues();
  if (!vr.length) return {};
  const hdr = vr[0].map(v=>String(v||'').trim());
  const idxModel = idxByNames_(hdr, ['모델명','model','모델']);
  if (idxModel<0) return {};
  const order = {};
  let seq = 0;
  for (let r=1;r<vr.length;r++){
    const m = normalizeModel_(vr[r][idxModel]);
    if (!m) continue;
    if (order[m]==null) { order[m]=seq; seq++; }
  }
  return order;
}

// 홈멀티 순서 정렬
function getHomeModelOrder_(isRaised){
  const targetSheet = isRaised ? HOME_SHEET + '_단가인상' : HOME_SHEET;
  const ss = SpreadsheetApp.openById(SRC_SHEET_ID);
  const sh = ss.getSheetByName(targetSheet);
  if (!sh) return {};
  const headerRow = getHeaderRowIndex_(targetSheet);
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < headerRow + 1 || lastCol < 1) return {};

  const rng = sh.getRange(headerRow, 1, lastRow - headerRow + 1, lastCol);
  const vals = rng.getDisplayValues();
  const hdr  = vals[0].map(v=>String(v||'').trim());
  const idxModel = hdr.indexOf('모델명') >= 0 ? hdr.indexOf('모델명') : idxByNames_(hdr, ['모델명','model','모델']);

  if (idxModel < 0) return {};
  const order = {};
  let seq = 0;
  for (let r=1; r<vals.length; r++){
    const m = normalizeModel_(vals[r][idxModel]);
    if (!m) continue;
    if (order[m] == null){ order[m] = seq; seq++; }
  }
  return order;
}

function getMasterSpecMap_() {
  const ss = SpreadsheetApp.openById(SRC_SHEET_ID);
  const sh = ss.getSheetByName(MASTER_SHEET);
  if (!sh) return {};
  const headerRow = getHeaderRowIndex_(MASTER_SHEET);
  const lastRow = sh.getLastRow();
  const maxCol = sh.getMaxColumns();
  if (lastRow < headerRow + 1) return {};
  const head = sh.getRange(headerRow, 1, 1, maxCol).getDisplayValues()[0] || [];
  const hdr  = head.map(v => normalizeHeaderText_(v));
  const idxModel = idxByNames_(hdr, ['모델명','model','모델']);
  const specCol  = (() => { const pos = hdr.indexOf('규격'); return pos >= 0 ? pos + 1 : null; })();
  const map = {};
  if (idxModel >= 0 && specCol) {
    const specVals = sh.getRange(headerRow + 1, specCol, lastRow - headerRow, 1).getValues();
    const allVals  = sh.getRange(headerRow + 1, 1, lastRow - headerRow, maxCol).getValues();
    for (let i=0;i<allVals.length;i++){
      const m = normalizeModel_(allVals[i][idxModel]);
      if (!m) continue;
      const spec = String((specVals[i] && specVals[i][0]) || '').trim();
      if (spec && map[m] == null) map[m] = spec;
    }
  }
  Logger.log('>> 🗺️ 마스터 규격 맵 크기=' + Object.keys(map).length);
  return map;
}

/* 홈멀티 */
function parseDcRate_(s) {
  if (s == null) return null;
  const raw = String(s).trim();
  if (!raw || raw === '-' ) return null;
  const m = raw.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const num = Number(m[0]);
  if (isNaN(num)) return null;
  if (raw.includes('%')) return Math.min(Math.max(num/100, 0), 1);
  if (num > 1) return Math.min(Math.max(num/100, 0), 1);
  if (num < 0) return null;
  return Math.min(Math.max(num, 0), 1);
}
function getHomeModelPriceMap_(isRaised) {
  const targetSheet = isRaised ? HOME_SHEET + '_단가인상' : HOME_SHEET;
  const ss = SpreadsheetApp.openById(SRC_SHEET_ID);
  const sh = ss.getSheetByName(targetSheet);
  if (!sh) return { map:{}, count:0 };
  const headerRow = getHeaderRowIndex_(targetSheet);
  const lastRow = sh.getLastRow();
  if (lastRow < headerRow+1) return { map:{}, count:0 };

  const headMap = getHeaderIndexMapAllCols_(sh, headerRow);
  const colModel   = findByLabels_(sh, headMap, ['모델명','model','모델']);
  const colBase    = findByLabels_(sh, headMap, ['출고가','출고 가격','출고']);
  const colPrice   = findByLabels_(sh, headMap, ['납품가','납품 가격','납품']);
  const colFixedDC = findByLabels_(sh, headMap, ['고정DC','고정 DC','DC','할인율']);
  const colSpec    = findByLabels_(sh, headMap, ['규격','사양','스펙']);

  const rowCount = lastRow - headerRow;
  const getColVals = (c)=> c ? sh.getRange(headerRow+1, c, rowCount, 1).getValues()    : Array.from({length:rowCount},()=>['']);
  const getColFrms = (c)=> c ? sh.getRange(headerRow+1, c, rowCount, 1).getFormulas() : Array.from({length:rowCount},()=>['']);

  const V_MODEL = getColVals(colModel);
  const V_BASE  = getColVals(colBase);
  const V_PRICE = getColVals(colPrice);
  const F_PRICE = getColFrms(colPrice);
  const V_FDC   = getColVals(colFixedDC);
  const V_SPEC  = getColVals(colSpec);

  const masterSpec = getMasterSpecMap_();

  const map = {};
  for (let i=0;i<rowCount;i++){
    const modelRaw = String(V_MODEL[i][0]||'').trim();
    if (!modelRaw) continue;
    const key = normalizeModel_(modelRaw);
    const base = Number(String(V_BASE[i][0]||'').replace(/[^\d.\-]/g,''))||0;
    const priceSheet = Number(String(V_PRICE[i][0]||'').replace(/[^\d.\-]/g,''))||0;
    const dc = parseDcRate_(V_FDC[i][0]);
    const frm = String(F_PRICE[i][0]||'');
    const hasL2 = /\$L\$2/i.test(frm);

    let specVal = String(V_SPEC[i][0]||'').trim();
    if (!specVal && masterSpec[key]) specVal = String(masterSpec[key]).trim();
    if (specVal === '-' || specVal === '—') specVal = '';

    map[key] = {
      modelRaw,
      basePrice: base,
      unitFromSheet: priceSheet,
      hasL2Ref: hasL2,
      fixedDcRate: dc,
      spec: specVal
    };
  }
  Logger.log('>> 📦 홈멀티 맵 구성 완료 count=' + Object.keys(map).length);
  return { map, count:Object.keys(map).length };
}

/* 공통 */
function findRightmostHeaderIndex_(hdr, labels){
  const H = hdr.map(v=>String(v||'').trim());
  let pos = -1;
  for (let i=H.length-1;i>=0;i--){
    const t = H[i];
    for (let j=0;j<labels.length;j++){
      if (t.replace(/\s/g,'') === String(labels[j]).replace(/\s/g,'')) { pos = i; break; }
    }
    if (pos>=0) break;
  }
  return pos;
}

// 금액배분
function distributeSetPrice_(targetTotal, fixedSum, isAF) {
  Logger.log('🧮 배분');
  const remain = Math.max(0, targetTotal - fixedSum);
  const ratioIn = isAF ? 6 : 4;
  const ratioOut = isAF ? 4 : 6;
  const indoorTotal = Math.round((remain * ratioIn) / (ratioIn + ratioOut));
  let indoor = Math.floor(indoorTotal / 1000) * 1000;
  let outdoor = remain - indoor;
  const mod = ((outdoor % 1000) + 1000) % 1000;
  if (mod !== 0) {
    if (outdoor > 0) { indoor -= mod; outdoor += mod; }
    else { indoor += (1000 - mod); outdoor -= (1000 - mod); }
  }
  return { indoor, outdoor };
}

// 플래그판별
function getModelFlags(model) {
  const m = String(model || '').toUpperCase();
  let is360 = false, is4way = false, is1way = false, isStand = false, isDeluxe = false, isGrade1 = false;
  
  if (m.startsWith('AC') && m.length >= 9) {
      if (m[7] === '6' && m[8] === 'P') is360 = true;
      if (m[7] === '4' && (m[8] === 'P' || m[8] === 'D')) is4way = true;
      if (m[7] === '1' && (m[8] === 'P' || m[8] === 'D')) is1way = true;
  }
  if (m.startsWith('AP') && m.length >= 9) {
      if (m.length >= 11 && m[10] === 'C') {
          if (m[8] === 'D') isStand = true;
      } else {
          if (m[8] === 'P') isStand = true;
      }
      if (m.length >= 11 && m[8] === 'D' && m[10] === 'H') isDeluxe = true;

      if (m.startsWith('AP230') || m.startsWith('AP290')) {
          isStand = true;
          isDeluxe = false;
      }

      // 예외처리
      if (isDeluxe) {
          isStand = false;
      }
  }
  if ((m.startsWith('AC') || m.startsWith('AP')) && m.length >= 9 && m[8] === 'F') {
      isGrade1 = true;
  }
  
  return { is360, is4way, is1way, isStand, isDeluxe, isGrade1 };
}

// 싱글 세트 할인 총액 산출
function getSingleSetDiscountTotal_(modelKey) {
  const cfg = getPricingConfig_();
  const m = String(modelKey || '');
  
  if(!/^(AC|AP|AR|AF)/i.test(m)) return 0;
  
  const flags = getModelFlags(m);
  
  const d360    = Number(cfg.DISCOUNT_360_AMT || 0);
  const d4way   = Number(cfg.DISCOUNT_4WAY_AMT || 0);
  const dStand  = Number(cfg.DISCOUNT_STAND_AMT || 0);
  const d1w     = Number(cfg.ONEWAY_DISCOUNT_AMT || 0);
  const dDeluxe = Number(cfg.DELUXE_DISCOUNT_AMT || 0);
  const dFirst  = Number(cfg.FIRSTGRADE_DISCOUNT_AMT || 0);
  
  let total = 0;
  if (flags.is360 && d360 > 0) total += d360;
  if (flags.is4way && d4way > 0) total += d4way;
  if (flags.isStand && dStand > 0) total += dStand;
  if (flags.is1way && d1w > 0) total += d1w;
  if (flags.isDeluxe && dDeluxe > 0) total += dDeluxe;
  if (flags.isGrade1 && dFirst > 0) total += dFirst;
  
  return total;
}

function detectOptionsFromRawName_(rawName){
  const s = String(rawName||'');
  const hasBlack = /블랙/i.test(s);
  const hasAir   = /공청/i.test(s);
  const hasLift  = /승강/i.test(s);
  const hasCircle= /원형/i.test(s);
  const hasSquare= /사각/i.test(s);
  
  // 리모컨
  const hasColor = /컬러/i.test(s);
  const hasWired = /유선/i.test(s) && !hasColor;
  const hasWI    = /무선/i.test(s);
  const hasWO_RC = /제외/i.test(s);

  // 호스
  const hasIHoseL= /L형/i.test(s);
  const hasIHoseI= /I형/i.test(s);

  return { hasBlack, hasAir, hasLift, hasCircle, hasSquare, hasColor, hasWired, hasWI, hasWO_RC, hasIHoseL, hasIHoseI };
}

/* 싱글 구성품 맵 */
function buildSingleSetMap_(isRaised) {
  const targetSheet = isRaised ? SINGLE_PARTS_SHEET + '_단가인상' : SINGLE_PARTS_SHEET;
  const ss = SpreadsheetApp.openById(SRC_SHEET_ID);
  const { hdr, rows } = readSheetWithHeader_(ss, targetSheet);
  const map = {};
  const setModels = new Set();
  if (!hdr.length || !rows.length) {
    Logger.log('>> 🟥 싱글 구성품 시트 비어있음');
    return { setModels, map };
  }

  const idxSet    = Math.max(
    idxByNames_(hdr, ['세트','세트코드','세트 모델','세트명','세트모델','세트모델명','set']),
    hdr.findIndex(h=>h.replace(/\s/g,'')==='세트')
  );
  const idxModel  = Math.max(idxByNames_(hdr, ['모델명','모델','MODEL']), hdr.findIndex(h=>/^(모델명|MODEL)$/i.test(h)));
  const idxQty    = Math.max(idxByNames_(hdr, ['수량','qty','구성수','수량(EA)']), hdr.findIndex(h=>/수량/i.test(h)));
  const idxSpec   = Math.max(idxByNames_(hdr, ['규격','사양','spec']), hdr.findIndex(h=>/^(규격|사양|spec)$/i.test(h)));
  const idxGroup  = Math.max(idxByNames_(hdr, ['구분']), hdr.findIndex(h=>/구분/.test(h)));
  const idxFeat   = Math.max(idxByNames_(hdr, ['구성품 특징','특징','feature']), hdr.findIndex(h=>/특징/.test(h)));
  const idxPum    = Math.max(idxByNames_(hdr, ['품    명','품명','품 목','품  명', '품 명']), hdr.findIndex(h=>/품\s*명/.test(h)));

  let idxPrice = -1;
  for (let i = hdr.length - 1; i >= 0; i--) {
    const t = String(hdr[i]||'').replace(/\s/g,'');
    if (/^납품가$/i.test(t)) { idxPrice = i; break; }
  }

  const requiredOk = (idxSet>=0 && idxModel>=0 && idxQty>=0 && idxPrice>=0);
  if (!requiredOk) {
    Logger.log('>> 🟥 싱글 구성품 인덱스 실패 set=%s model=%s qty=%s price=%s', idxSet, idxModel, idxQty, idxPrice);
    Logger.log('>> 🔎 헤더: ' + JSON.stringify(hdr));
    return { setModels, map };
  }

  const seqBySet = {};

  for (let i=0;i<rows.length;i++){
    const r = rows[i];
    const setKey      = normalizeModel_(r[idxSet]);
    const modelDisplay= String(r[idxModel]||'').trim();
    const modelKey    = normalizeModel_(modelDisplay);
    if (!setKey || !modelKey) continue;

    const qty     = Number(String(r[idxQty]||'').replace(/[^\d.\-]/g,''))||1;
    const spec    = idxSpec>=0 ? String(r[idxSpec]||'').trim() : '';
    const group   = idxGroup>=0 ? String(r[idxGroup]||'').trim() : '';
    const feature = idxFeat>=0 ? String(r[idxFeat]||'').trim() : '';
    const pumName = idxPum>=0 ? String(r[idxPum]||'').trim() : '';
    const price   = Number(String(r[idxPrice]||'').replace(/[^\d.\-]/g,''))||0;

    if (!map[setKey]) { map[setKey] = []; seqBySet[setKey]=0; }

    map[setKey].push({
      modelKey,           // 정규화 키
      modelDisplay,       // 화면/전송용 원문(하이픈 보존)
      qty, price, spec, group, feature, pumName,
      seq: seqBySet[setKey]++   // 🔹 세트 내 시트 순서
    });
    setModels.add(setKey);
  }

  Logger.log('>> 📚 싱글 구성품 맵 set개수=%s 예시=%s',
    setModels.size,
    JSON.stringify(Array.from(setModels).slice(0,10))
  );
  return { setModels, map };
}

// 전개
function expandSingleSetItems_(singleCtx, setModelKey, setQty, rawNameForOptions, setGroupId, addBoltong) {
  Logger.log('💥 전개');

  const partsAll = singleCtx.map[setModelKey] || [];
  if (!partsAll.length) {
    Logger.log('🟥 실패');
    return { parts: [], pumName: '' };
  }

  const opts = detectOptionsFromRawName_(rawNameForOptions || '');

  let base = partsAll.filter(p => /기본/i.test(p.feature || ''));

  if (opts.hasBlack || opts.hasAir || opts.hasLift || (opts.hasCircle && opts.hasSquare)) {
    const token = opts.hasBlack ? '블랙' : (opts.hasAir ? '공청' : '승강');
    base = base.map(p => {
      if (!/^PC/i.test(p.modelKey)) return p;
      const want = partsAll.find(x =>
        /^PC/i.test(x.modelKey) &&
        String(x.pumName || '').indexOf(token) >= 0
      );
      return want ? { ...want, seq: p.seq } : p;
    });
  }

  if (opts.hasWI) {
    base = base.map(p => {
      if (!/무선리모컨/i.test(p.pumName || '')) return p;
      const token = '와이어리스';
      const want = partsAll.find(x =>
        /리모컨/i.test(x.pumName || '') &&
        String(x.pumName || '').indexOf(token) >= 0
      );
      return want ? { ...want, seq: p.seq } : p;
    });
  }

  if (opts.hasWO_RC) {
    base = base.filter(p => !/리모컨/i.test(p.pumName || ''));
  }

  if (opts.hasIHoseL) {
    base = base.map(p => {
      if (!/유연호스/i.test(p.pumName || '')) return p;
      const want = partsAll.find(x =>
        /유연호스/i.test(x.pumName || '') &&
        /L형/i.test(x.pumName || '')
      );
      return want ? { ...want, seq: p.seq } : p;
    });
  }

  if (opts.hasIHoseI) {
    base = base.map(p => {
      if (!/유연호스/i.test(p.pumName || '')) return p;
      const want = partsAll.find(x =>
        /유연호스/i.test(x.pumName || '') &&
        /I형/i.test(x.pumName || '')
      );
      return want ? { ...want, seq: p.seq } : p;
    });
  }

  if (opts.hasColor) {
    base = base.map(p => {
      if (!/리모컨/i.test(p.pumName || '')) return p;
      const cand = partsAll.find(x => normalizeModel_(x.modelDisplay) === normalizeModel_('AWR-WG00N'));
      return cand ? { ...cand, seq: p.seq } : p;
    });
  } else if (opts.hasWired) {
    base = base.map(p => {
      if (!/리모컨/i.test(p.pumName || '')) return p;
      const cand = partsAll.find(x => normalizeModel_(x.modelDisplay) === normalizeModel_('AWR-WE13N'));
      return cand ? { ...cand, seq: p.seq } : p;
    });
  }

  const allPartsText = partsAll.map(p => 
    [p.pumName, p.spec, p.group, p.feature].join(' ')
  ).join(' ');
  const judgeText = (allPartsText + ' ' + String(rawNameForOptions||'')).trim();

  const primary  = base.find(p => /실내기/i.test(p.group || '')) || base[0] || partsAll[0];
  const pumName  = primary?.pumName || '';
  const specText = primary?.spec || '';

  const cfg = getPricingConfig_();
  const setDiscAmt = getSingleSetDiscountTotal_(setModelKey);
  const flags = getModelFlags(setModelKey);

  Logger.log('🔍 설정');

  const baseQty = Math.max(0, Math.floor(Number(setQty) || 0));

  let items = base
    .filter(p => {
      const isMaterial = /자재/.test(String(p.feature || ''));
      if (!isMaterial) return true;
      const name = String(p.pumName || '');
      const remark = String(p.remark || '');
      const hasIncludeWord = /포함/.test(name) || /포함/.test(remark);
      if (!hasIncludeWord) {
        Logger.log('↩️ 제외');
        return false;
      }
      return true;
    })
    .map(p => {
      const q = Math.floor((Number(p.qty) || 1) * baseQty);
      const unit = Math.floor(Number(p.price) || 0);
      return {
        model: p.modelDisplay,
        norm: p.modelKey,
        qty: q,
        unit,
        line: unit * q,
        usedFixedDc: false,
        fixedDcRate: null,
        spec: p.spec || '',
        group: p.group || '',
        pumName: p.pumName || '',
        fromSet: true,
        seq: p.seq || 9999,
        setGroup: setGroupId,
        setFlags: flags,
        setDiscAmt: setDiscAmt
      };
    });

  const qBase = baseQty;
  if (addBoltong && qBase > 0) {
    const maxSeq = items.reduce((m, x) => Math.max(m, x.seq || 0), 0);
    items.push({
      model: '발통세트',
      norm: '볼트세트',
      qty: qBase,
      unit: 0,
      line: 0,
      usedFixedDc: false,
      fixedDcRate: null,
      spec: '',
      group: '',
      pumName: '',
      fromSet: true,
      seq: maxSeq + 1,
      setGroup: setGroupId,
      setDiscAmt
    });
    Logger.log('🧩 추가');
  } else {
    Logger.log('↪ 생략');
  }

  const originalTotal = items.reduce((acc, x) => acc + x.unit, 0);
  const targetTotal = Math.max(0, originalTotal - setDiscAmt);

  const indoorParts = items.filter(x => /실내기/.test(x.group || '') || /실내기/.test(x.pumName || ''));
  const outdoorParts = items.filter(x => /실외기/.test(x.group || '') || /실외기/.test(x.pumName || ''));
  const fixedParts = items.filter(x => !indoorParts.includes(x) && !outdoorParts.includes(x));

  const fixedSum = fixedParts.reduce((acc, x) => acc + x.unit, 0);

  if (indoorParts.length > 0 && outdoorParts.length > 0) {
    const isAF = /^AF/i.test(setModelKey);
    const dist = distributeSetPrice_(targetTotal, fixedSum, isAF);

    const sumInBase = indoorParts.reduce((acc, x) => acc + x.unit, 0) || indoorParts.length;
    const sumOutBase = outdoorParts.reduce((acc, x) => acc + x.unit, 0) || outdoorParts.length;

    let accIn = 0;
    indoorParts.forEach((x, i) => {
      if (i < indoorParts.length - 1) {
        const v = Math.round((dist.indoor * (x.unit || 1)) / sumInBase / 1000) * 1000;
        x.unit = v; accIn += v;
      } else {
        x.unit = dist.indoor - accIn;
      }
    });

    let accOut = 0;
    outdoorParts.forEach((x, i) => {
      if (i < outdoorParts.length - 1) {
        const v = Math.round((dist.outdoor * (x.unit || 1)) / sumOutBase / 1000) * 1000;
        x.unit = v; accOut += v;
      } else {
        x.unit = dist.outdoor - accOut;
      }
    });
  }

  items = items.map(x => ({ ...x, line: x.unit * x.qty }));

  Logger.log('✅ 완료');

  return { parts: items, pumName };
}

/* PDF → 텍스트 */
function extractPdfText_(blob) {
  try {
    if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.insert) {
      return extractViaAdvancedDrive_(blob);
    }
  } catch(e) {}
  return extractViaHttpUpload_(blob);
}
function extractViaAdvancedDrive_(blob){
  const temp = DriveApp.createFile(blob);
  let docId = null, docId2 = null;
  try {
    try {
      const gd = Drive.Files.insert(
        { title: blob.getName() || 'order.pdf', mimeType: 'application/vnd.google-apps.document' },
        temp.getBlob(),
        { convert: true, ocr: true, ocrLanguage: 'ko', supportsAllDrives: true }
      );
      docId = gd.id;
      const t1 = waitAndReadDocText_(docId, 7, 1200);
      if (t1 && t1.replace(/\s+/g,'').length > 20) return t1;
    } catch(e1){}
    try {
      const cp = Drive.Files.copy(
        { title: blob.getName() || 'order.pdf', mimeType: 'application/vnd.google-apps.document' },
        temp.getId(),
        { ocr: true, ocrLanguage: 'ko', supportsAllDrives: true }
      );
      docId2 = cp.id;
      const t2 = waitAndReadDocText_(docId2, 7, 1200);
      if (t2 && t2.replace(/\s+/g,'').length > 10) return t2;
    } catch(e2){}
    throw new Error('PDF 텍스트 추출 실패');
  } finally {
    try { if (docId) DriveApp.getFileById(docId).setTrashed(true); } catch(e){}
    try { if (docId2) DriveApp.getFileById(docId2).setTrashed(true); } catch(e){}
    try { temp.setTrashed(true); } catch(e){}
  }
}
function extractViaHttpUpload_(blob){
  const token = ScriptApp.getOAuthToken();
  const boundary = 'foo_bar_' + Date.now();
  const meta = { title: blob.getName() || 'order.pdf', mimeType: 'application/vnd.google-apps.document' };
  const delimiter = '--' + boundary + '\r\n';
  const closeDelim = '\r\n--' + boundary + '--';
  const payload =
    Utilities.newBlob(
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(meta) + '\r\n' +
      delimiter +
      'Content-Type: application/pdf\r\n' +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      Utilities.base64Encode(blob.getBytes()) +
      closeDelim
    ).getBytes();
  const url = 'https://www.googleapis.com/upload/drive/v2/files?uploadType=multipart&convert=true&ocr=true&ocrLanguage=ko';
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'multipart/related; boundary=' + boundary,
    payload: payload,
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) {
    throw new Error('HTTP 업로드 실패 ' + res.getResponseCode() + ' ' + res.getContentText());
  }
  const body = JSON.parse(res.getContentText());
  const docId = body && body.id;
  if (!docId) throw new Error('문서 ID 없음');
  try {
    const txt = waitAndReadDocText_(docId, 7, 1200);
    if (txt && txt.trim()) return txt.trim();
    throw new Error('문서 본문 비어 있음');
  } finally { try { DriveApp.getFileById(docId).setTrashed(true); } catch(e){} }
}
function waitAndReadDocText_(docId, tries, delayMs) {
  for (let i=0;i<tries;i++){
    try {
      const body = DocumentApp.openById(docId).getBody();
      const txt = body ? body.getText() : '';
      if (txt && txt.trim()) return txt.trim();
    } catch (e) {}
    Utilities.sleep(delayMs);
  }
  return '';
}

/* 발주서 텍스트 파싱 */
function parseOrderFromText_(text) {
  const raw = String(text||'').replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim();
  const lines = String(text||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);

  let shipDate = '';
  let receiverTel = '';
  let siteAddr = '';
  let memo = '';

  {
    const m1 = raw.match(/배송\s*일자\s*(\d{4})[.\-\/년]?\s*(\d{1,2})[.\-\/월]?\s*(\d{1,2})/);
    if (m1) { const y=m1[1], mo=('0'+m1[2]).slice(-2), d=('0'+m1[3]).slice(-2); shipDate = `${y}${mo}${d}`; }
  }
  {
    const flat = String(raw || '').replace(/\s+/g, ' ');
    const anchors = ['인수자', '인도자'];
    let candidates = [];

    anchors.forEach(a => {
      const i = flat.indexOf(a);
      if (i >= 0) {
        const win = flat.slice(Math.max(0, i - 40), Math.min(flat.length, i + 140));
        const found = win.match(/010[-\s]?\d{3,4}[-\s]?\d{4}/g) || [];
        candidates.push(...found);
      }
    });

    if (!candidates.length) {
      candidates = flat.match(/010[-\s]?\d{3,4}[-\s]?\d{4}/g) || [];
    }

    const phones = Array.from(new Set(
      candidates.map(s => normalizeTel_(s)).filter(Boolean)
    ));

    if (phones.length >= 2) {
      receiverTel = `${phones[0]}(부재시:${phones[1]})`;
    } else if (phones.length === 1) {
      receiverTel = phones[0];
    } else {
      receiverTel = '';
    }
  }
  {
    const m4 = raw.match(/현장\s*주소\s*([^]+?)(설명|\(단위|No\.|품명|품목)/);
    if (m4) siteAddr = m4[1].replace(/\s+/g,' ').trim(); else {
      const m5 = raw.match(/주소\s*([^]+?)(설명|\(단위|No\.|품명|품목)/);
      if (m5) siteAddr = m5[1].replace(/\s+/g,' ').trim();
    }
  }
  {
    const reTail = /(\(단위|No\.|품명|품목)/;
    let m = raw.match(new RegExp('특이사항\\s*([^]+?)' + reTail.source));
    if (m) {
      memo = m[1].replace(/\s+/g,' ').trim();
    } else {
      m = raw.match(new RegExp('설명\\s*([^]+?)' + reTail.source));
      if (m) {
        memo = m[1].replace(/\s+/g,' ').trim();
      } else {
        m = raw.match(new RegExp('비고\\s*([^]+?)' + reTail.source));
        if (m) memo = m[1].replace(/\s+/g,' ').trim();
      }
    }
  }

  let start = -1;
  for (let i=0;i<lines.length;i++){
    const s = lines[i];
    if (/(No\.|\bNO\b)/i.test(s) && /(품명|품목)/.test(s)) { start = i+1; break; }
    if (/(품명|품목)/.test(s)) {
      const win = lines.slice(i, i+3).join(' ');
      if (/(수량|QTY|수 량)/i.test(win)) { start = i+1; break; }
    }
    if (/\(단위/.test(s)) { start = i+1; break; }
  }
  if (start < 0) {
    const idx = lines.findIndex(s=>/(품명|품목).*?(수량)/i.test(s));
    if (idx >= 0) start = idx+1;
  }

  let end = lines.length;
  if (start >= 0) {
    for (let i=start;i<lines.length;i++){
      const s = lines[i];
      if (/(합계|총\s*액|공급가액|VAT|부가세|청구금액|계\W|비고$)/i.test(s)) { end = i; break; }
    }
  }

  const items = [];
  if (start >= 0) {
    let buf = '';
    for (let i=start;i<end;i++){
      const s = lines[i];
      if (/(No\.|\bNO\b|\(단위|품명|품목|규격|수량|단가|금액|비고)/i.test(s)) continue;
      
      if (/(에어디자이너|공기를\s*디자인|년\s*\d+월\s*\d+일|PAGE|The\s*following\s*table|대표이사|사업자번호|주소|TEL|FAX|EMAIL)/i.test(s)) continue;
      if (!s) continue;

      let mm = s.match(/^\s*(?:\d+[\.\)]\s*)?(.+?)\s+([0-9,]+)\s*(?:EA|개|세트|SET)?\s*$/i);
      if (!mm) {
        buf = buf ? (buf + ' ' + s) : s;
        const mb = buf.match(/^(.*\S)\s+([0-9,]+)\s*(?:EA|개|세트|SET)?\s*$/i);
        if (mb) {
          const nameRaw = mb[1].trim();
          const qty = parseInt(mb[2].replace(/,/g,''),10) || 0;
          if (qty > 0) {
            const model = nameRaw.split('/')[0].trim();
            if (model) items.push({ model, qty, raw:nameRaw });
          }
          buf = '';
        }
        continue;
      }
      const nameRaw = mm[1].trim();
      const qty = parseInt((mm[2]||'0').replace(/,/g,''),10) || 0;
      if (qty <= 0) continue;
      const model = nameRaw.split('/')[0].trim();
      if (!model) continue;
      items.push({ model, qty, raw:nameRaw });
    }

    const validLines = lines.slice(Math.max(0,start-1), end).filter(s => {
      if (/(에어디자이너|공기를\s*디자인|년\s*\d+월\s*\d+일|PAGE|The\s*following\s*table|대표이사|사업자번호|주소|TEL|FAX|EMAIL)/i.test(s)) return false;
      return true;
    });

    const segment = validLines.join(' ')
      .replace(/No\.\s*품명\s*수량/i, ' ')
      .replace(/\(단위\s*:[^)]+\)/i, ' ');
      
    const re = /(\d+)\s+(.+?)\s+([0-9,]+)\s*(?:EA|개|세트|SET)?(?=\s+\d+\s+|$)/g;
    let m;
    while ((m = re.exec(segment)) !== null) {
      const nameRaw = m[2].trim();
      const qty = parseInt(m[3].replace(/,/g,''),10) || 0;
      if (qty <= 0) continue;
      const model = nameRaw.split('/')[0].trim();
      if (!model) continue;
      const hit = items.find(x=>x.model===model);
      if (hit) hit.qty += qty; else items.push({ model, qty, raw:nameRaw });
    }
  }

  return { shipDate, receiverTel, siteAddr, memo, items };
}

// 발주서 수량으로 구성품 보정
function buildOrderQtyMap_(srcItems){
  const m = new Map();
  (srcItems||[]).forEach(it=>{
    const k = normalizeModel_(it.model || it.modelRaw);
    if (!k) return;
    m.set(k, (m.get(k)||0) + (Number(it.qty)||0));
  });
  return m;
}

// 발주서에 명시된 수량만큼만 남기고 초과분 제거
function capQtyToOrder_(items, orderQtyMap){
  if (!orderQtyMap || !orderQtyMap.size) return items || [];
  const remain = new Map(orderQtyMap);
  const out = [];
  (items||[]).forEach(x=>{
    const nm = String(x.model || '');
    if (/발통세트/.test(nm) || normalizeModel_(nm) === '볼트세트') { out.push(x); return; }
    const k = normalizeModel_(nm);
    if (!remain.has(k)) return;
    const budget = Number(remain.get(k)) || 0;
    if (budget <= 0) return;
    const q = Math.min(Math.floor(Number(x.qty)||0), budget);
    if (q <= 0) return;
    remain.set(k, budget - q);
    out.push({ ...x, qty: q, line: (Number(x.unit)||0) * q });
  });
  return out;
}

/* 모델+단가 */
function mergeKeepLastScoped_(items){
  // 홈멀티(전표 전체 스코프)
  const lastPosHome = new Map();
  const sumQtyHome  = new Map();
  const keyHome = (x)=> `${String(x.model)}|${Number(x.unit)||0}`;

  // 싱글(세트 스코프)
  const lastPosByG = new Map();   // key: g|model|unit
  const sumQtyByG  = new Map();
  const keyG = (x)=> `${Number.isFinite(x.setGroup)?x.setGroup:-1}|${String(x.model)}|${Number(x.unit)||0}`;

  // 마지막 위치와 수량 합계를 먼저 모음
  items.forEach((x, i)=>{
    if (!x.fromSet) {
      const k = keyHome(x);
      lastPosHome.set(k, i);
      sumQtyHome.set(k, (sumQtyHome.get(k)||0) + (Number(x.qty)||0));
    } else {
      const k = keyG(x);
      lastPosByG.set(k, i);
      sumQtyByG.set(k, (sumQtyByG.get(k)||0) + (Number(x.qty)||0));
    }
  });

  const out = [];
  // 원본을 처음부터 끝까지 스캔하면서 "마지막 등장 인덱스"에서만 출력
  items.forEach((x, i)=>{
    if (!x.fromSet) {
      const k = keyHome(x);
      if (lastPosHome.get(k) === i) {
        const q = sumQtyHome.get(k)||0;
        out.push({ ...x, qty: q, line: (Number(x.unit)||0) * q });
      }
    } else {
      const k = keyG(x);
      if (lastPosByG.get(k) === i) {
        const q = sumQtyByG.get(k)||0;
        out.push({ ...x, qty: q, line: (Number(x.unit)||0) * q });
      }
    }
  });
  return out;
}

// 연속 규격 삭제
function squashConsecutiveSpecs_(items) {
  Logger.log('🧾 시작');

  const out = [];
  let lastKey = null;
  let lastSpec = '';

  for (const it of items || []) {
    const key = it.fromSet ? ('S' + String(it.setGroup ?? -1)) : 'H';
    if (key !== lastKey) {
      lastKey = key;
      lastSpec = '';
    }

    const cur = String(it.spec || '').trim();
    const specOut = (cur && cur === lastSpec) ? '' : cur;

    out.push({ ...it, spec: specOut });
    if (cur) lastSpec = cur;
  }
  Logger.log('🧾 완료');
  return out;
}

// 미리보기 세트 표 연속 규격 삭제
function squashPreviewSets_(expandedSets) {
  return (expandedSets || []).map(set => {
    let lastSpec = '';
    const parts = (set.parts || []).map(row => {
      const cur = String(row.spec || '').trim();
      const specOut = cur && cur === lastSpec ? '' : cur;
      if (cur) lastSpec = cur;
      return { ...row, spec: specOut };
    });
    return { ...set, parts };
  });
}

// 메모 분석 및 거래처 시간 결정
function processMemoAndCustomer_(rawMemo) {
  const memo = String(rawMemo || '').trim();
  
  // 거래처 결정
  let custCode = '6568702893';
  let custName = '에어디자이너 주식회사';
  
  if (/공기/.test(memo)) {
    custCode = '6508103591';
    custName = '공기를디자인하는사람들 주식회사';
  }

  // 시간/메모 변환
  let finalMemo = '오전 일찍';

  if (/(바로|지금)/.test(memo)) {
    finalMemo = '바로착';
  } else {
    const amMatch = memo.match(/\b(7|8|9|10|11)\s*시/);
    const pmMatch = memo.match(/\b(1|2|3|4|5)\s*시/);

    if (amMatch) {
      finalMemo = '오전 ' + amMatch[1] + '시';
    } else if (pmMatch) {
      finalMemo = '오후 ' + pmMatch[1] + '시';
    }
  }

  return { custCode, custName, finalMemo };
}

/* 미리보기 */
function parsePdfForPreview(file) {
  const logs = [];
  function log(m){ logs.push(`>> ${m}`); }

  try {
    log('📥 파일 수신');
    if (!file) throw new Error('파일 없음');

    const blob = Utilities.newBlob(Utilities.base64Decode(file.data), file.type || 'application/pdf', file.name || 'upload.pdf');

    let text = '';
    try {
      text = extractPdfText_(blob);
      log('📄 텍스트 추출 완료');
    } catch (ex) {
      throw new Error('PDF 텍스트 추출 실패');
    }

    const parsed = parseOrderFromText_(text);
    const processed = processMemoAndCustomer_(parsed.memo);
    
    CURRENT_CUST_CODE = processed.custCode;
    const determinedMemo = processed.finalMemo;
    const determinedCustName = processed.custName;

    log(`🏢 거래처: ${determinedCustName}, 시간: ${determinedMemo}`);
    
    // 출고일
    const isRaised = parsed.shipDate >= '20260401';
    if (isRaised) log('📈 단가인상');

    const addBolt = /육각|발통/i.test(String(parsed.memo||''));
    if (addBolt) log('🧷 육각/발통 감지 → 발통세트 추가 모드 활성화');

    const srcItems = (parsed.items||[]).map(it => {
      const raw = it.raw || it.model;
      let modelDisp = it.model;
      if (/(유연\s*호[\s\-]*[스수])|(^LFHIF$)|(^FH[-_]?LFHIF$)/i.test(String(raw))) {
        modelDisp = 'FH-LFHIF';
      } else {
        const norm = normalizeModel_(it.model);
        if (/^(AXJYA?1509M|AXJ1509M)$/i.test(norm)) modelDisp = 'AXJ-YA1509N';
        else if (/^(AXJYA?2512M|AXJ2512M)$/i.test(norm)) modelDisp = 'AXJ-YA2512N';
        else if (/^PC1YNSK1NW$/i.test(norm)) modelDisp = 'PC1YNWK1NW';
      }
      return { modelRaw: modelDisp, model: normalizeModel_(modelDisp), qty: it.qty, raw };
    });

    let finalItems = [];
    let unmatched = [];
    let expandedSets = [];

    const homeOrder   = getHomeModelOrder_(isRaised);
    const masterOrder = getMasterModelOrder_();
    function homeIdx_(model){
      const k = normalizeModel_(model);
      if (homeOrder[k]   != null) return homeOrder[k];
      if (masterOrder[k] != null) return 100000 + masterOrder[k];
      return 200000;
    }

    const { map: homeMap } = getHomeModelPriceMap_(isRaised); 
    const singleCtx = buildSingleSetMap_(isRaised);

    let ord = 0, nextSetGroup = 0;

    srcItems.forEach(it=>{
      const key = it.model;

      if (singleCtx.setModels.has(key)) {
        const setGroupId = nextSetGroup++;
        const { parts } = expandSingleSetItems_(singleCtx, key, it.qty, it.raw, setGroupId, addBolt);
        if (!parts.length){
          unmatched.push({ model: it.modelRaw, qty: it.qty });
          return;
        }
        expandedSets.push({
          setName: it.modelRaw || key,
          setQty: it.qty,
          parts: parts.map(p=>({ model: p.model, spec: p.spec || '', qty: p.qty, unit: p.unit, line: p.line }))
        });
        parts.forEach(p=> finalItems.push({ ...p, ord: ord++ }));
        return;
      }

      const row = homeMap[key];
      if (!row) { unmatched.push({ model: it.modelRaw, qty: it.qty }); return; }

      let unit = 0;
      let usedFixed = false;
      if (typeof row.fixedDcRate === 'number') {
        unit = applyPricingWithDC_(row.basePrice, row.fixedDcRate);
        usedFixed = true;
      } else if (row.hasL2Ref) {
        unit = applyPricingWithDC_(row.basePrice, null);
      } else {
        unit = Number(row.unitFromSheet)||0;
        if (!(unit>0)) unit = applyPricingWithDC_(row.basePrice, null);
      }

      finalItems.push({
        model: row.modelRaw || it.modelRaw,
        qty: it.qty,
        unit: unit,
        line: unit * it.qty,
        usedFixedDc: usedFixed,
        fixedDcRate: row.fixedDcRate,
        spec: row.spec || '',
        fromSet: false,
        homeIdx: homeIdx_(row.modelRaw || it.modelRaw),
        ord: ord++
      });
    });

    // 실외기(MX/RX) 수량 기반 발통세트 추가
    if (addBolt) {
      let outdoorQty = 0;
      finalItems.forEach(item => {
        if (/MX|RX/i.test(item.model)) {
          outdoorQty += Number(item.qty || 0);
        }
      });

      if (outdoorQty > 0) {
        finalItems.push({
          model: '발통세트',
          qty: outdoorQty,
          unit: 0,
          line: 0,
          spec: '',
          fromSet: false,
          homeIdx: 999999,
          ord: 999999
        });
        log(`➕ 실외기(MX/RX) 감지 → 발통세트 ${outdoorQty}개 추가`);
      }
    }

    finalItems.sort((a,b)=>{
      const aH = a.fromSet ? 1 : 0, bH = b.fromSet ? 1 : 0;
      if (aH !== bH) return aH - bH;
      if (!a.fromSet && !b.fromSet) {
        if ((a.homeIdx||0) !== (b.homeIdx||0)) return (a.homeIdx||0) - (b.homeIdx||0);
        return String(a.model).localeCompare(String(b.model));
      }
      if ((a.setGroup ?? -1) !== (b.setGroup ?? -1)) return (a.setGroup ?? 0) - (b.setGroup ?? 0);
      if ((a.seq ?? 0) !== (b.seq ?? 0)) return (a.seq ?? 0) - (b.seq ?? 0);
      return (a.ord||0) - (b.ord||0);
    });

    finalItems = mergeKeepLastScoped_(finalItems);
      const whItems = finalItems.slice();
    finalItems = capQtyToOrder_(finalItems, buildOrderQtyMap_(srcItems));
    const finalSquashed = squashConsecutiveSpecs_(finalItems);
    const expandedSetsSquashed = squashPreviewSets_(expandedSets);

    const subtotal = finalItems.reduce((acc,x)=> acc + (x.unit||0)*(x.qty||0), 0);
    const hasFixed = finalItems.some(x=>x.usedFixedDc);
    const fixedList = finalItems.filter(x=>x.usedFixedDc && typeof x.fixedDcRate==='number').map(x=>x.fixedDcRate);
    const wh = decideWarehouseFromItems_(whItems);

    return { ok:true, logs, preview:{
      due: parsed.shipDate,
      isRaisedPrice: isRaised,
      tel: parsed.receiverTel,
      addr: parsed.siteAddr,
      memo: determinedMemo,
      custCode: processed.custCode,
      custName: processed.custName,
      currency: getPricingConfig_().CURRENCY,
      itemsUnmatched: unmatched,
      expandedSets: expandedSetsSquashed,
      finalItems: finalSquashed.map(({norm, group, ...rest})=>rest),
      totalFormatted: formatCurrency_(subtotal),
      hasFixedDc: hasFixed,
      fixedDcRates: fixedList,
      warehouseCode: wh.code,
      warehouseName: wh.name
    }};
  } catch(e){
    log(`❌ 파싱 실패 ${String(e && e.message || e)}`);
    return { ok:false, logs, error:String(e && e.message || e) };
  }
}

/* 프리뷰(세트 표) 순서 그대로 전송 */
function buildItemsInPreviewOrder_(preview) {
  try {
    if (Array.isArray(preview?.expandedSets) && preview.expandedSets.length) {
      const pool = (preview.finalItems || []).map((x,i) => ({ ...x, __i: i }));
      const norm = (m) => normalizeModel_(m);

      function takeOne(model, qty, unit) {
        const key = norm(model);
        let idx = pool.findIndex(x => norm(x.model) === key &&
                                      Number(x.qty)  === Number(qty) &&
                                      Number(x.unit) === Number(unit));
        if (idx < 0) idx = pool.findIndex(x => norm(x.model) === key);
        if (idx >= 0) return pool.splice(idx, 1)[0];
        return { model, qty, unit, spec: '' };
      }

      const ordered = [];
      preview.expandedSets.forEach(set => {
        (set.parts || []).forEach(p => {
          const it = takeOne(p.model, p.qty, p.unit);
          ordered.push({
            model: it.model,
            qty: it.qty,
            unit: it.unit,
            spec: it.spec || p.spec || '',
            fromSet: true,
            setGroup: it.setGroup,
            seq: it.seq,
            setFlags: it.setFlags || null,
            setDiscAmt: Number(it.setDiscAmt || 0)
          });
        });
      });

      // 세트 외(예: 홈멀티 단품 등) 잔여 항목은 본래 순서대로 뒤에 부착
      pool.forEach(x => {
        ordered.push({
          model: x.model, qty: x.qty, unit: x.unit, spec: x.spec || '',
          fromSet: !!x.fromSet, homeIdx: x.homeIdx, seq: x.seq, setGroup: x.setGroup,
          setDiscType: x.setDiscType || null, setDiscAmt: Number(x.setDiscAmt || 0)
        });
      });

      Logger.log('>> 🔁 프리뷰 정렬 기반 전송 준비 size=' + ordered.length);
      return ordered;
    }
  } catch(e) {
    Logger.log('>> ❗ buildItemsInPreviewOrder_ 오류 ' + e);
  }
  return (preview?.finalItems || []).map(x => ({ ...x }));
}

// 일괄파싱
function parsePdfForPreviewBatch(files){
  const results = [];
  const masterOrder = getMasterModelOrder_();
  
  // 캐싱
  const homeOrderNormal = getHomeModelOrder_(false);
  const homeOrderRaised = getHomeModelOrder_(true);
  const homeCtxNormal = getHomeModelPriceMap_(false);
  const homeCtxRaised = getHomeModelPriceMap_(true);
  const singleCtxNormal = buildSingleSetMap_(false);
  const singleCtxRaised = buildSingleSetMap_(true);

  for (let i=0;i<files.length;i++){
    const file = files[i];
    const logs = [];
    const log = (m)=>logs.push(`>> ${m}`);
    try{
      log('📥 수신');
      const blob = Utilities.newBlob(Utilities.base64Decode(file.data), file.type || 'application/pdf', file.name || ('order_'+(i+1)+'.pdf'));
      const text = extractPdfText_(blob);
      log('📄 완료');

      const parsed = parseOrderFromText_(text);
      const processed = processMemoAndCustomer_(parsed.memo);
      CURRENT_CUST_CODE = processed.custCode;

      // 출고일
      const isRaised = parsed.shipDate >= '20260401';
      if (isRaised) log('📈 인상');

      const addBolt = /육각|발통/i.test(String(parsed.memo||''));
      if (addBolt) log('🧷 발통');

      const currentHomeOrder = isRaised ? homeOrderRaised : homeOrderNormal;
      function homeIdx_(model){
        const k = normalizeModel_(model);
        if (currentHomeOrder[k] != null) return currentHomeOrder[k];
        if (masterOrder[k] != null) return 100000 + masterOrder[k];
        return 200000;
      }

      const homeContext = isRaised ? homeCtxRaised : homeCtxNormal;
      const singleCtx = isRaised ? singleCtxRaised : singleCtxNormal;

      const srcItems = (parsed.items||[]).map(it=>{
        const raw = it.raw || it.model;
        let modelDisp = it.model;
        if (/(유연\s*호[\s\-]*[스수])|(^LFHIF$)|(^FH[-_]?LFHIF$)/i.test(String(raw))) {
          modelDisp = 'FH-LFHIF';
        } else {
           const norm = normalizeModel_(it.model);
           if (/^(AXJYA?1509M|AXJ1509M)$/i.test(norm)) modelDisp = 'AXJ-YA1509N';
           else if (/^(AXJYA?2512M|AXJ2512M)$/i.test(norm)) modelDisp = 'AXJ-YA2512N';
           else if (/^PC1YNSK1NW$/i.test(norm)) modelDisp = 'PC1YNWK1NW';
        }
        return { modelRaw: modelDisp, model: normalizeModel_(modelDisp), qty: it.qty, raw };
      });

      let finalItems=[], unmatched=[], expandedSets=[];
      const homeMap = homeContext.map || {};

      let ord=0, nextSetGroup=0;

      srcItems.forEach(it=>{
        const key = it.model;

        if (singleCtx.setModels.has(key)) {
          const setGroupId = nextSetGroup++;
          const { parts } = expandSingleSetItems_(singleCtx, key, it.qty, it.raw, setGroupId, addBolt);
          if (!parts.length){
            unmatched.push({ model: it.modelRaw, qty: it.qty });
            log('🟥 실패');
            return;
          }
          expandedSets.push({
            setName: it.modelRaw || key,
            setQty: it.qty,
            parts: parts.map(p=>({ model: p.model, spec: '', qty: p.qty, unit: p.unit, line: p.line }))
          });
          parts.forEach(p=> finalItems.push({ ...p, ord: ord++ }));
          return;
        }

        const row = homeMap[key];
        if (!row) { unmatched.push({ model: it.modelRaw, qty: it.qty }); return; }

        let unit = 0;
        let usedFixed = false;
        if (typeof row.fixedDcRate === 'number') {
          unit = applyPricingWithDC_(row.basePrice, row.fixedDcRate);
          usedFixed = true;
        } else if (row.hasL2Ref) {
          unit = applyPricingWithDC_(row.basePrice, null);
        } else {
          unit = Number(row.unitFromSheet)||0;
          if (!(unit>0)) unit = applyPricingWithDC_(row.basePrice, null);
        }

        finalItems.push({
          model: row.modelRaw || it.modelRaw,
          qty: it.qty,
          unit: unit,
          line: unit * it.qty,
          usedFixedDc: usedFixed,
          fixedDcRate: row.fixedDcRate,
          spec: row.spec || '',
          fromSet: false,
          homeIdx: homeIdx_(row.modelRaw || it.modelRaw),
          ord: ord++
        });
      });

      if (addBolt) {
        let outdoorQty = 0;
        finalItems.forEach(item => {
          if (/MX|RX/i.test(item.model)) {
            outdoorQty += Number(item.qty || 0);
          }
        });

        if (outdoorQty > 0) {
          finalItems.push({
            model: '발통세트',
            qty: outdoorQty,
            unit: 0,
            line: 0,
            spec: '',
            fromSet: false,
            homeIdx: 999999,
            ord: 999999
          });
        }
      }

      finalItems.sort((a,b)=>{
        const aH = a.fromSet ? 1 : 0, bH = b.fromSet ? 1 : 0;
        if (aH !== bH) return aH - bH;
        if (!a.fromSet && !b.fromSet) {
          if ((a.homeIdx||0) !== (b.homeIdx||0)) return (a.homeIdx||0) - (b.homeIdx||0);
          return String(a.model).localeCompare(String(b.model));
        }
        if ((a.setGroup ?? -1) !== (b.setGroup ?? -1)) return (a.setGroup ?? 0) - (b.setGroup ?? 0);
        if ((a.seq ?? 0) !== (b.seq ?? 0)) return (a.seq ?? 0) - (b.seq ?? 0);
        return (a.ord||0) - (b.ord||0);
      });

      finalItems = mergeKeepLastScoped_(finalItems);
      const whItems = finalItems.slice();
      finalItems = capQtyToOrder_(finalItems, buildOrderQtyMap_(srcItems));

      const finalSquashed = squashConsecutiveSpecs_(finalItems);
      const expandedSetsSquashed = squashPreviewSets_(expandedSets);

      const subtotal = finalItems.reduce((acc,x)=> acc + (x.unit||0)*(x.qty||0), 0);
      const hasFixed = finalItems.some(x=>x.usedFixedDc);
      const fixedList = finalItems.filter(x=>x.usedFixedDc && typeof x.fixedDcRate==='number').map(x=>x.fixedDcRate);
      const wh = decideWarehouseFromItems_(whItems);

      results.push({ ok:true, logs, preview:{
        due: parsed.shipDate,
        isRaisedPrice: isRaised,
        tel: parsed.receiverTel,
        addr: parsed.siteAddr,
        memo: processed.finalMemo,
        custCode: processed.custCode,
        custName: processed.custName,
        currency: getPricingConfig_().CURRENCY,
        itemsUnmatched: unmatched,
        expandedSets: expandedSetsSquashed,
        finalItems: finalSquashed.map(({norm, group, ...rest})=>rest),
        totalFormatted: formatCurrency_(subtotal),
        hasFixedDc: hasFixed,
        fixedDcRates: fixedList,
        warehouseCode: wh.code,
        warehouseName: wh.name
      }});
    }catch(e){
      results.push({ ok:false, logs, error: String(e && e.message || e) });
    }
  }
  return { ok:true, results };
}

/* 퍼센트 포맷 */
function formatPct_(rate){
  if (typeof rate !== 'number' || isNaN(rate)) return '';
  return String(Math.floor(rate*100)) + '%';
}

/* 금액 한글표기 */
function formatShortKrwMinus_(amt){
  const n = Math.floor(Math.abs(Number(amt)||0));
  if (n === 0) return '';
  if (n % 10000 === 0) return '-' + (n/10000) + '만';
  if (n % 1000 === 0)  return '-' + (n/1000)  + '천';
  return '-' + formatCurrency_(n);
}

// 전송
function sendOrderToEcount_(custCode, managerCode, order, hasFixedDc, fixedDcRates, optUserId, optApiKey) {
  const { sessionId, zone } = getEcountSession(optUserId, optApiKey);
  const cust = String(custCode||'').trim();
  if (!cust) throw new Error('거래처 식별값 없음');

  // 전표에서 사용할 거래처 코드
  CURRENT_CUST_CODE = cust;
  Logger.log('>> 🧾 전표 전송용 거래처코드=' + CURRENT_CUST_CODE);

  const cfg = getPricingConfig_(cust);
  const ioDate = toYmd_(order.due) || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  const whCd = String(order.whCd || '00003');
  const tel = String(order.tel || '').trim();
  const addr = String(order.addr||'');
  const memo = String(order.memo||'');
  const empCd = String(managerCode||'').trim() || (getScriptCreds_().EMP_CD) || '';
  const addTxt01 = addr;
  const addTxt05 = '*';
  let memoFiltered = /단위/i.test(memo) ? '오전 일찍' : memo;
  if (memoFiltered === '오전 일찍') Logger.log('>> 📝 특이사항 단위 감지 → 오전 일찍 치환');

  const cm = lookupCustomerMemos_(cust);
  Logger.log('>> 📞 인수자 ADD_TXT_03_T=' + tel);

  const SaleOrderList = [];
  const metaSetGroup = [];
  let lineIndex = 0;

  // 받은 순서 그대로 라인 생성
  for (const it of order.items) {
    const qty = Math.floor(Number(it.qty)||0);
    if (qty <= 0) continue;

    const priceVat = (typeof it.unit === 'number' && it.unit > 0)
      ? Math.floor(it.unit)
      : applyPricing_(Number(it.price || 0));

    const total = priceVat * qty;
    const sup = Math.floor(Math.abs(total)/1.1);
    const vat = Math.abs(total) - sup;
    const supply = total<0 ? -sup : sup;
    const vatAmt = total<0 ? -vat : vat;
    const priceEx = priceVat<0 ? -Math.floor(Math.abs(priceVat)/1.1) : Math.floor(priceVat/1.1);

    // 첫 라인에는 주소만 넣음
    let remarksVal = '';
    if (lineIndex === 0) {
      remarksVal = addr || '';
    }
    lineIndex++;

    SaleOrderList.push({ BulkDatas:{
      IO_DATE: ioDate,
      UPLOAD_SER_NO: "1",
      CUST: cust,
      EMP_CD: empCd,
      WH_CD: whCd,
      TIME_DATE: ioDate,

      U_TXT1: addr,
      ADD_TXT_01_T: addTxt01,
      ADD_TXT_02_T: "",
      ADD_TXT_03_T: tel,
      ADD_TXT_04_T: memoFiltered,
      ADD_TXT_05_T: addTxt05,

      U_MEMO1: cm.U_MEMO1,
      U_MEMO2: cm.U_MEMO2,
      U_MEMO3: cm.U_MEMO3,

      PROD_CD: String(it.model),
      PROD_DES: "",
      SIZE_DES: String(it.spec || '').trim() || "\u200B",
      QTY: String(qty),
      PRICE: String(priceEx),
      USER_PRICE_VAT: String(Math.abs(priceVat)),
      SUPPLY_AMT_F: "0",
      SUPPLY_AMT: String(supply),
      VAT_AMT: String(vatAmt),

      REMARKS: remarksVal
    }});

    metaSetGroup.push(Number.isFinite(it.setGroup) ? Number(it.setGroup) : -1);
  }

  if (!SaleOrderList.length) throw new Error('유효 품목 없음');

  // 홈멀티(AJ로 시작) 있는 경우에만 글로벌 DC율 적요
  const hasHome = SaleOrderList.some(row => /^AJ\d+/i.test(String(row.BulkDatas.PROD_CD||'')));
  if (hasHome) {
    const globalPct = formatPct_(cfg.DISCOUNT_RATE);
    const fixedPct = (hasFixedDc && fixedDcRates && fixedDcRates.length) ? formatPct_(fixedDcRates[0]) : '';
    const msg = fixedPct ? (globalPct + ' / ' + fixedPct) : globalPct;

    const idxHome = SaleOrderList.findIndex(row =>
      /^AJ\d+/i.test(String(row.BulkDatas.PROD_CD||'')) &&
      !String(row.BulkDatas.REMARKS||'').trim()
    );
    if (idxHome >= 0) {
      SaleOrderList[idxHome].BulkDatas.REMARKS = msg;
      Logger.log('>> 🧾 홈멀티 DC율 적요 주입 line=' + (idxHome+1) + ' msg=' + msg);
    }
  } else {
    Logger.log('>> 🧾 홈멀티 없음 DC율 미주입');
  }

  // 세트별 할인 문구 산출
  const groupMsg = new Map();
  const groupFlags = new Map();
  
  order.items.forEach(it=>{
    const g = Number.isFinite(it.setGroup) ? Number(it.setGroup) : -1;
    if (g < 0) return;
    if (it.setFlags) {
      groupFlags.set(g, it.setFlags);
    }
  });

  groupFlags.forEach((flags, g) => {
    const txts = [];
    if (flags.is360 && cfg.DISCOUNT_360_AMT > 0) txts.push(formatShortKrwMinus_(cfg.DISCOUNT_360_AMT));
    if (flags.is4way && cfg.DISCOUNT_4WAY_AMT > 0) txts.push(formatShortKrwMinus_(cfg.DISCOUNT_4WAY_AMT));
    if (flags.isStand && cfg.DISCOUNT_STAND_AMT > 0) txts.push(formatShortKrwMinus_(cfg.DISCOUNT_STAND_AMT));
    if (flags.is1way && cfg.ONEWAY_DISCOUNT_AMT > 0) txts.push(formatShortKrwMinus_(cfg.ONEWAY_DISCOUNT_AMT));
    if (flags.isDeluxe && cfg.DELUXE_DISCOUNT_AMT > 0) txts.push(formatShortKrwMinus_(cfg.DELUXE_DISCOUNT_AMT));
    if (flags.isGrade1 && cfg.FIRSTGRADE_DISCOUNT_AMT > 0) txts.push(formatShortKrwMinus_(cfg.FIRSTGRADE_DISCOUNT_AMT));
    
    if (txts.length > 0) {
      groupMsg.set(g, txts.join(' / '));
    }
  });

  // 세트별 첫 빈 적요에만 주입
  groupMsg.forEach((msg, g)=>{
    for (let i=0;i<SaleOrderList.length;i++){
      if (metaSetGroup[i] !== g) continue;
      const cur = SaleOrderList[i].BulkDatas.REMARKS || '';
      if (!String(cur).trim()){
        SaleOrderList[i].BulkDatas.REMARKS = msg;
        Logger.log('>> 🧾 세트 할인 적요 주입 group=' + g + ' line=' + (i+1) + ' msg=' + msg);
        break;
      }
    }
  });

  // API 호출
  const url = `http://152.69.228.109:3000/proxy/ecount/saleorder`;
  Logger.log('>> 📤 전송 품목수=' + SaleOrderList.length);
  const res = UrlFetchApp.fetch(url, {
    method:'post', contentType:'application/json',
    payload:JSON.stringify({ SESSION_ID: sessionId, ZONE: zone, payload: { SaleOrderList } }),
    muteHttpExceptions:true
  });

  const code = res.getResponseCode();
  const txt = res.getContentText();
  let body; try { body = JSON.parse(txt); } catch(e){ body = { raw: txt }; }
  const ok = (code===200) && (body?.Data?.SuccessCnt > 0);
  if (!ok) Logger.log('>> ❌ SaveSaleOrder 실패 HTTP=' + code + ' body=' + txt);
  else Logger.log('>> ✅ SaveSaleOrder 성공 건수=' + body?.Data?.SuccessCnt);
  return { ok, status:code, body, sentCount: SaleOrderList.length };
}

// 전송
function sendFromPreview(form, preview) {
  const logs = [];

  try {
    Logger.log('>> 🚀 시작');
    if (!preview || !preview.finalItems || !preview.finalItems.length) {
      throw new Error('없음');
    }

    const itemsForSend = squashConsecutiveSpecs_(preview.finalItems);

    const order = {
      due: preview.due,
      tel: preview.tel,
      addr: preview.addr,
      memo: preview.memo,
      whCd: String(preview.warehouseCode || '00003'),
      items: itemsForSend.map(x=>({
        model: x.model,
        qty: x.qty,
        unit: x.unit,
        spec: (x.spec||''),
        fromSet: !!x.fromSet,
        homeIdx: x.homeIdx,
        seq: x.seq,
        setGroup: x.setGroup,
        setFlags: x.setFlags || null,
        setDiscAmt: Number(x.setDiscAmt || 0)
      }))
    };

    const targetCustCode = preview.custCode || form?.custCode || '6568702893';

    const result = sendOrderToEcount_(
      String(targetCustCode),
      String(form?.managerCode||''),
      order,
      Boolean(preview.hasFixedDc),
      Array.isArray(preview.fixedDcRates) ? preview.fixedDcRates : [],
      form?.ecountId,
      form?.ecountApi
    );

    if (!result.ok) {
      Logger.log('>> ❌ 실패');
      return { ok:false, logs, result };
    }
    Logger.log('>> 🎉 성공');
    return { ok:true, logs, result };
  } catch(e){
    Logger.log('>> ❌ 오류');
    return { ok:false, logs, error:String(e && e.message || e) };
  }
}

/* 모델 → 품명 맵 로딩 */
function loadModelNameMaps_(){
  const res = { home: {}, single: {} };
  try {
    const ss = SpreadsheetApp.openById(SRC_SHEET_ID);

    const findIdx = (header, labels) => {
      const norm = s => String(s || '').replace(/\s+/g, '').toUpperCase();
      const labelNorms = labels.map(norm);
      for (let c = 0; c < header.length; c++) {
        const hNorm = norm(header[c]);
        if (hNorm && labelNorms.indexOf(hNorm) >= 0) return c;
      }
      for (let c = 0; c < header.length; c++) {
        const hNorm = norm(header[c]);
        if (hNorm && labelNorms.some(l => hNorm.indexOf(l) >= 0)) return c;
      }
      return -1;
    };

    const fillMap = (sheetName, keyName) => {
      const sh = ss.getSheetByName(sheetName);
      if (!sh) return;
      const values = sh.getDataRange().getValues();
      if (!values.length) return;

      const headerRowIdx = getHeaderRowIndex_(sheetName) - 1;
      if (headerRowIdx < 0 || headerRowIdx >= values.length) return;

      const header = values[headerRowIdx] || [];
      const idxModel = findIdx(header, ['모델명', 'MODEL', '모델']);
      const idxName  = findIdx(header, ['품명', '품목명', '품 명', '품  명']);

      if (idxModel < 0 || idxName < 0) return;

      for (let r = headerRowIdx + 1; r < values.length; r++) {
        const row = values[r] || [];
        const rawModel = String(row[idxModel] || '').trim();
        if (!rawModel) continue;
        const key = normalizeModel_(rawModel);
        if (!key) continue;
        const name = String(row[idxName] || '').trim();
        if (!name) continue;
        if (!res[keyName][key]) res[keyName][key] = name;
      }
    };

    fillMap(HOME_SHEET, 'home');
    fillMap(SINGLE_PARTS_SHEET, 'single');
  } catch(e){
    Logger.log('>> 🛑 오류 ' + e);
  }
  return res;
}

/* HTML include */
function include_(name){ return HtmlService.createHtmlOutputFromFile(name).getContent(); }
