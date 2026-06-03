function doGet() {
  const t = HtmlService.createTemplateFromFile('index');
  t.config = JSON.stringify({
    srcSheetId: SRC_SHEET_ID,
    sheetNames: { master: MASTER_SHEET, home: HOME_SHEET, single: SINGLE_SHEET, singleParts: SINGLE_PARTS_SHEET },
    managers: getManagers_(),
    customers: getCustomerList_()
  });
  return t.evaluate().setTitle('발주서 이미지 업로드');
}

// 설정
var NOTION_DB_ID     = "193a1006d6588161a02cc8f196d7102b";
var NOTION_TOKEN     = "REDACTED_NOTION_TOKEN";
var NOTION_VER       = "2022-06-28";
var MANAGER_NOTION_DB_ID = "198a1006d65880ddb510e0d525c5e9da";
var MANAGER_NOTION_TOKEN = "REDACTED_NOTION_TOKEN";

// 거래처
const DEFAULT_CUST_CODE = '8428102605';

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

// Vision API 키 반환
function getVisionApiKey_() {
  // 주석 간결
  return 'REDACTED_GOOGLE_API_KEY';
}

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

    // 1. 데이터 소스 메타데이터 확인
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
      // 다중 데이터 소스가 있는 경우 우회 경로 탐색
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
      // 일반 데이터베이스인 경우 기존 방식 사용
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

    const num = function (name) {
      const p = props[name];
      if (!p || p.type !== 'number') return null;
      const v = p.number;
      return typeof v === 'number' ? v : null;
    };

    const bool = function (name) {
      const p = props[name];
      if (!p) return false;
      if (p.type === 'checkbox') return !!p.checkbox;
      return false;
    };

    const sel = function (name) {
      const p = props[name];
      if (!p || p.type !== 'select' || !p.select) return null;
      const v = p.select.name;
      return v ? String(v).trim() : null;
    };

    let homeDc = num('홈멀티DC');
    if (typeof homeDc === 'number') {
      homeDc = homeDc > 1 ? homeDc / 100 : homeDc;
    }

    const disc360    = num('360');
    const disc4way   = num('4way');
    const discStand  = num('스탠드');
    const oneWay     = num('1way');
    const deluxe     = num('디럭스');
    const firstGrade = num('1등급');

    const flexI = bool('유연호스I형');
    const flexL = bool('유연호스L형') || bool('유연호스');

    let flexCode = 'FH-LFHLF';
    if (flexI) {
      flexCode = 'FH-LFHIF';
    } else if (flexL) {
      flexCode = 'FH-LFHLF';
    }

    const unitSel = sel('단위처리');
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
    if (typeof disc360 === 'number')    result.DISCOUNT_360_AMT         = disc360;
    if (typeof disc4way === 'number')   result.DISCOUNT_4WAY_AMT        = disc4way;
    if (typeof discStand === 'number')  result.DISCOUNT_STAND_AMT       = discStand;
    if (typeof oneWay === 'number')     result.ONEWAY_DISCOUNT_AMT      = oneWay;
    if (typeof deluxe === 'number')     result.DELUXE_DISCOUNT_AMT      = deluxe;
    if (typeof firstGrade === 'number') result.FIRSTGRADE_DISCOUNT_AMT  = firstGrade;
    result.FLEX_HOSE_CODE = flexCode;
    if (typeof roundTo === 'number')    result.ROUND_TO                 = roundTo;
    if (roundMode)                      result.ROUND_MODE               = roundMode;

    Logger.log('📥 완료');
    return result;
  } catch (e) {
    Logger.log('🟥 오류');
    return null;
  }
}

// 설정조회
function getPricingConfig_() {
  Logger.log('⚙️ 설정조회');
  const sp    = PropertiesService.getScriptProperties();
  const cache = CacheService.getScriptCache();
  const cKey  = 'PRICING_CFG_J_SYSTEM_V3';

  const hit = cache.get(cKey);
  if (hit) {
    try {
      return JSON.parse(hit);
    } catch (e) {}
  }

  const p = { ...DEFAULT_PRICING };

  // 스크립트 속성 우선 반영
  const KEYS = [
    'CURRENCY',
    'HOME_DISCOUNT_RATE',
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
  ];

  KEYS.forEach(function (k) {
    const v = sp.getProperty('PRICING_' + k);
    if (v == null) return;

    if (k === 'CURRENCY') {
      p[k] = String(v);
    } else if (k === 'ROUND_TO' || k === 'PRICE_DECIMALS' || k.endsWith('_AMT')) {
      p[k] = Number(v) || 0;
    } else if (k === 'ROUND_MODE') {
      const m = String(v || '').toUpperCase();
      if (m === 'CEIL' || m === 'FLOOR' || m === 'ROUND') p.ROUND_MODE = m;
    } else if (k === 'FLEX_HOSE_CODE') {
      p[k] = String(v || '').trim() || p.FLEX_HOSE_CODE;
    } else if (k === 'HOME_DISCOUNT_RATE') {
      const num = Number(v);
      if (!isNaN(num)) p.HOME_DISCOUNT_RATE = (num > 1 ? num / 100 : num);
    } else if (k === 'SURCHARGE_RATE') {
      const num = Number(v);
      if (!isNaN(num)) p.SURCHARGE_RATE = (num > 1 ? num / 100 : num);
    } else {
      const num = Number(v);
      if (!isNaN(num)) p[k] = num;
    }
  });

  // 노션 값
  try {
    const notionCfg = fetchNotionPricingForCustomer_(DEFAULT_CUST_CODE);
    if (notionCfg) {
      if (typeof notionCfg.HOME_DISCOUNT_RATE === 'number')
        p.HOME_DISCOUNT_RATE = notionCfg.HOME_DISCOUNT_RATE;
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
  } catch (e) {
    Logger.log('>> ⚠️ 노션 할인 설정 조회 실패 ' + e);
  }

  cache.put(cKey, JSON.stringify(p), 5 * 60);
  Logger.log('>> 💰 가격 설정 ' + JSON.stringify(p));
  return p;
}

/* step 반올림(ROUND_TO) */
function roundToStep_(value, step, mode) {
  const x = Number(value) || 0;
  const s = Number(step) || 0;
  if (s <= 0) return Math.round(x);

  const m = String(mode || '').toUpperCase();
  if (m === 'CEIL')  return Math.ceil(x / s) * s;
  if (m === 'FLOOR') return Math.floor(x / s) * s;
  return Math.round(x / s) * s;
}

function applyPricing_(basePrice) {
  const cfg = getPricingConfig_();
  const discounted = basePrice * (1 - cfg.HOME_DISCOUNT_RATE) * (1 + cfg.SURCHARGE_RATE);
  const rounded = (cfg.ROUND_TO && cfg.ROUND_TO > 0)
    ? roundToStep_(discounted, cfg.ROUND_TO, cfg.ROUND_MODE)
    : Math.round(discounted);
  return Number(rounded.toFixed(cfg.PRICE_DECIMALS));
}

function applyPricingWithDC_(basePrice, dcRateOrNull) {
  const cfg = getPricingConfig_();
  const dc  = (typeof dcRateOrNull === 'number' && !isNaN(dcRateOrNull))
    ? dcRateOrNull
    : cfg.HOME_DISCOUNT_RATE;
  const discounted = basePrice * (1 - dc) * (1 + cfg.SURCHARGE_RATE);
  const rounded = (cfg.ROUND_TO && cfg.ROUND_TO > 0)
    ? roundToStep_(discounted, cfg.ROUND_TO, cfg.ROUND_MODE)
    : Math.round(discounted);
  return Number(rounded.toFixed(cfg.PRICE_DECIMALS));
}

/* 이카운트 인증 */
function getScriptCreds_() {
  const sp = PropertiesService.getScriptProperties();
  const COM_CODE_D = '174539';
  const USER_ID_D  = '11840720103';
  const KEY_D      = '117d1e405a25f4631a0aef44bee78dd857';
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

// 이카운트 세션
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
function _coerceQtyToken_(tok){
  if (!tok) return 0;
  const t = String(tok).trim();
  const fix = t.replace(/^[ILl]$/, '1').replace(/^O$/, '0');
  const m = fix.match(/^\d{1,3}$/);
  return m ? Number(fix) : 0;
}
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

// 0/O 오인식 보정
function getZeroOKeyCandidates_(key) {
  const base = String(key || '').trim();
  if (!base) return [];
  const list = [base];

  const alt1 = base.replace(/O/g, '0');
  if (alt1 !== base) list.push(alt1);

  const alt2 = base.replace(/0/g, 'O');
  if (alt2 !== base && alt2 !== alt1) list.push(alt2);

  return list;
}

/* 한글/공백 -> 실제 코드 */
const CODE_ALIAS_MAP = {
  // 유연호스는 노션 설정을 우선 사용하므로 여기 값은 예비 값
  '유연호스': 'FH-LFHIF',
  '유연 호스': 'FH-LFHIF',
  '원형발': '발통세트'
};

function aliasModelIfNeeded_(raw) {
  const t   = String(raw || '').trim();
  const key = t.replace(/\s+/g, '');

  if (/받침/.test(t)) {
    if (/[7]/.test(t)) return 'SI-AL700a';
    if (/[5]/.test(t)) return 'SI-AL600a';
  }

  const cfg = getPricingConfig_();
  const flexCode = cfg.FLEX_HOSE_CODE || 'FH-LFHIF';

  const dyn = {
    '유연호스': flexCode,
    '유연 호스': flexCode
  };

  if (dyn[t])   return dyn[t];
  if (dyn[key]) return dyn[key];

  if (CODE_ALIAS_MAP[t])   return CODE_ALIAS_MAP[t];
  if (CODE_ALIAS_MAP[key]) return CODE_ALIAS_MAP[key];

  return t;
}

/* 특정 모델 가격 강제 고정 (VAT 포함 단가) */
function overrideSpecialUnitPrice_(modelRawOrCode, proposedUnitVat){
  const k = normalizeModel_(modelRawOrCode);
  if (k === normalizeModel_('AXJ-YA1509N')) return 45000; // 45,000원 고정
  return proposedUnitVat;
}

function idxByNames_(hdr, names) {
  const H = hdr.map(v => String(v || '').trim());
  const keys = names.map(s => String(s || '').trim().toLowerCase());
  for (let i = 0; i < H.length; i++) {
    if (keys.includes(H[i].toLowerCase())) return i;
  }
  return -1;
}
function getHeaderRowIndex_(sheetName) {
  if (sheetName === HOME_SHEET || sheetName === HOME_SHEET + '_단가인상') return 3;
  if (sheetName === SINGLE_SHEET || sheetName === SINGLE_SHEET + '_단가인상') return 3;
  if (sheetName === SINGLE_PARTS_SHEET || sheetName === SINGLE_PARTS_SHEET + '_단가인상') return 2;
  return 1;
}
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
  const hdr = (vals[0] || []).map(v => String(v || '').trim());
  const rows = vals.slice(1);
  const formulas = frms.slice(1);
  return { hdr, rows, formulas };
}

/* 헤더 정규화 & 찾기 */
function normalizeHeaderText_(s) {
  return String(s || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
      try {
        const hidden = sh.isColumnHiddenByUser ? sh.isColumnHiddenByUser(col) : false;
        Logger.log('>> 🔎 컬럼 "' + keyNorm + '" = C' + col + ' hidden=' + hidden);
      } catch(e){}
      return col;
    }
    for (const k in idxMap){
      if (k.replace(/\s/g,'') === keyNorm.replace(/\s/g,'')) {
        const col = idxMap[k];
        try {
          const hidden = sh.isColumnHiddenByUser ? sh.isColumnHiddenByUser(col) : false;
          Logger.log('>> 🔎 컬럼 "' + keyNorm + '" ≈ "' + k + '" = C' + col + ' hidden=' + hidden);
        } catch(e){}
        return col;
      }
    }
  }
  return null;
}

/// 담당자
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
    { label:'주식회사 제이시스템', code:'8428102605' }
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

/* 모델 순서/스펙 맵 */
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
  const specCol  = (() => {
    const pos = hdr.indexOf('규격');
    if (pos >= 0) return pos + 1;
    return null;
  })();
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

/* 홈멀티 모델/가격 로딩 */
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

function getSingleSetDiscountTotal_(modelKey) {
  const cfg = getPricingConfig_();
  const m = String(modelKey || '');
  if(!/^(AC|AP|AR|AF)/i.test(m)) return 0;
  const flags = getModelFlags(m);
  
  let total = 0;
  if (flags.is360 && cfg.DISCOUNT_360_AMT > 0) total += cfg.DISCOUNT_360_AMT;
  if (flags.is4way && cfg.DISCOUNT_4WAY_AMT > 0) total += cfg.DISCOUNT_4WAY_AMT;
  if (flags.isStand && cfg.DISCOUNT_STAND_AMT > 0) total += cfg.DISCOUNT_STAND_AMT;
  if (flags.is1way && cfg.ONEWAY_DISCOUNT_AMT > 0) total += cfg.ONEWAY_DISCOUNT_AMT;
  if (flags.isDeluxe && cfg.DELUXE_DISCOUNT_AMT > 0) total += cfg.DELUXE_DISCOUNT_AMT;
  if (flags.isGrade1 && cfg.FIRSTGRADE_DISCOUNT_AMT > 0) total += cfg.FIRSTGRADE_DISCOUNT_AMT;
  
  return total;
}

// 할인액 부품들에 분배하여 단가/금액 차감
function applySingleSetDiscount_(setName, parts, setQty) {
  const totalDiscountPerSet = getSingleSetDiscountTotal_(setName);
  const totalDiscount = Math.floor(totalDiscountPerSet * Math.max(1, Number(setQty) || 0));
  if (totalDiscount <= 0) return parts;

  // 자재인데 '포함' 문구 없는 건 할인 제외
  const elig = parts
    .map(function(p, i) { return { i: i, p: p }; })
    .filter(function(x) {
      const p = x.p;
      const isMaterial = /자재/.test(String(p.feature || ''));
      const hasInclude = /포함/.test(String(p.pumName || '')) || /포함/.test(String(p.remark || ''));
      return !(isMaterial && !hasInclude);
    });

  const itemCount = Math.max(1, elig.length);
  const slices    = splitSingleSetDiscount_(totalDiscount, itemCount);

  slices.forEach(function(cut, idx) {
    const info = elig[idx];
    const i    = info.i;
    const p    = info.p;

    const cutPerUnit = Math.floor(cut / Math.max(1, Number(p.qty) || 1));
    const newUnit    = Math.max(0, Math.floor(Number(p.unit) || 0) - cutPerUnit);
    const newLine    = Math.max(0, newUnit * Math.max(1, Number(p.qty) || 1));

    parts[i] = {
      ...p,
      unit: newUnit,
      line: newLine,
      setDiscAmt: cut,
      setDiscType: isOneWaySet_(setName) ? 'ONEWAY' : 'SINGLE'
    };
  });

  return parts;
}

// 옵션
function detectOptionsFromRawName_(rawName) {
  const t = String(rawName || '');
  return {
    hasPanelChange: /판넬\s*변경|패널\s*변경|C\/D\s*판넬/i.test(t),
    is360Panel: /360\s*판넬|360도\s*판넬/i.test(t),
    hasRemote: /리모컨|무선리모컨|유선리모컨/i.test(t),
    excludeIHose: /유연호스\s*제외|유연\s*호스\s*제외/i.test(t),
    excludeBase: /받침대\s*제외|가대\s*제외/i.test(t),
    
    hasBlack: /블랙/i.test(t),
    hasAir: /공청/i.test(t),
    hasLift: /승강/i.test(t),
    hasCircle: /원형/i.test(t),
    hasSquare: /사각/i.test(t),
    
    hasColor: /컬러/i.test(t),
    hasWired: /유선/i.test(t) && !/컬러/i.test(t),
    hasWI: /무선/i.test(t),
    hasWO_RC: /제외/i.test(t),
    
    hasIHoseL: /L형/i.test(t),
    hasIHoseI: /I형/i.test(t)
  };
}

/* 싱글 세트 마스터 맵 로딩 */
function buildSingleSetMap_(isRaised) {
  Logger.log('>> 📚 생성');
  const targetSheet = isRaised ? SINGLE_PARTS_SHEET + '_단가인상' : SINGLE_PARTS_SHEET;
  const ss   = SpreadsheetApp.openById(SRC_SHEET_ID);
  const info = readSheetWithHeader_(ss, targetSheet);
  const hdr  = info.hdr || [];
  const rows = info.rows || [];

  const map = {};
  const setModels = new Set();

  if (!hdr.length || !rows.length) {
    Logger.log('>> 🟥 싱글 구성품 시트 비어있음');
    return { setModels, map };
  }

  // 세트 / 모델 / 수량 기본 인덱스
  const idxSet = Math.max(
    idxByNames_(hdr, ['세트','세트코드','세트 모델','세트명','세트모델','세트모델명','set']),
    hdr.findIndex(h => String(h||'').replace(/\s/g,'') === '세트')
  );
  const idxModel = Math.max(
    idxByNames_(hdr, ['모델명','모델','MODEL']),
    hdr.findIndex(h => /^(모델명|MODEL)$/i.test(String(h||'')))
  );
  const idxQty = Math.max(
    idxByNames_(hdr, ['수량','qty','구성수','수량(EA)']),
    hdr.findIndex(h => /수량/i.test(String(h||'')))
  );
  const idxSpec = Math.max(
    idxByNames_(hdr, ['규격','사양','spec']),
    hdr.findIndex(h => /^(규격|사양|spec)$/i.test(String(h||'')))
  );
  const idxGroup = Math.max(
    idxByNames_(hdr, ['구분','그룹','group','구성']),
    hdr.findIndex(h => /(구분|그룹|group|구성)/i.test(String(h||'')))
  );
  const idxFeat = Math.max(
    idxByNames_(hdr, ['특징','구성품 특징','feature']),
    hdr.findIndex(h => /특징|feature/i.test(String(h||'')))
  );
  const idxPum = Math.max(
    idxByNames_(hdr, ['품명','품목명','품목','품 명','품  명','pum']),
    hdr.findIndex(h => /품\s*명|품\s*목/i.test(String(h||'')))
  );
  
  Logger.log('>> 🔎 품명열 ' + idxPum);
  
  const idxRemark = Math.max(
    idxByNames_(hdr, ['적요','비고','메모']),
    hdr.findIndex(h => /적요|비고|메모/i.test(String(h||'')))
  );

  // 출고가 / 납품가 열 찾기
  const idxOut = Math.max(
    idxByNames_(hdr, ['출고가','출고 금액','출고']),
    hdr.findIndex(h => /출고가|출고금액|출고/i.test(String(h||'')))
  );

  const napCols = [];
  hdr.forEach((h,i) => {
    const t = String(h||'').replace(/\s/g,'');
    if (/납품가/.test(t)) napCols.push(i);
  });
  const idxNap1 = napCols.length >= 1 ? napCols[0] : -1;
  const idxNap2 = napCols.length >= 2 ? napCols[1] : -1;

  if (idxSet < 0 || idxModel < 0 || idxQty < 0) {
    Logger.log('>> 🟥 싱글 구성품 인덱스 실패 set=%s model=%s qty=%s', idxSet, idxModel, idxQty);
    Logger.log('>> 🔎 헤더: ' + JSON.stringify(hdr));
    return { setModels, map };
  }

  const seqBySet = {};

  const toNum = v => Number(String(v||'').replace(/[^\d.\-]/g,'')) || 0;

  rows.forEach(r => {
    const setKeyRaw   = r[idxSet];
    const modelDisp   = String(r[idxModel] || '').trim();
    const setKey      = normalizeModel_(setKeyRaw);
    const modelKey    = normalizeModel_(modelDisp);

    if (!setKey || !modelKey) return;

    const qty        = Math.max(1, toNum(r[idxQty]));
    const spec       = idxSpec   >= 0 ? String(r[idxSpec]   || '').trim() : '';
    const group      = idxGroup  >= 0 ? String(r[idxGroup]  || '').trim() : '';
    const feature    = idxFeat   >= 0 ? String(r[idxFeat]   || '').trim() : '';
    const pumName    = idxPum    >= 0 ? String(r[idxPum]    || '').trim() : '';
    const remark     = idxRemark >= 0 ? String(r[idxRemark] || '').trim() : '';

    const priceOut   = idxOut  >= 0 ? toNum(r[idxOut])   : 0;
    const priceNap1  = idxNap1 >= 0 ? toNum(r[idxNap1])  : 0;
    const priceNap2  = idxNap2 >= 0 ? toNum(r[idxNap2])  : 0;

    // 싱글 세트 납품단가
    const prefPrice  = priceNap2 || priceNap1 || priceOut;

    if (!map[setKey]) {
      map[setKey] = [];
      seqBySet[setKey] = 0;
    }

    map[setKey].push({
      setKey,
      modelKey,
      modelDisplay: modelDisp,
      qty,
      price: prefPrice,
      spec,
      group,
      feature,
      pumName,
      remark,
      seq: seqBySet[setKey]++
    });

    setModels.add(setKey);
  });

  Logger.log('>> 📚 싱글 구성품 맵 set개수=' + setModels.size);
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

  // 추출
  let base = partsAll.filter(p => /기본/i.test(p.feature || ''));

  // 치환
  if (opts.hasBlack || opts.hasAir || opts.hasLift || (opts.hasCircle && opts.hasSquare)) {
    const token = opts.hasBlack ? '블랙' : (opts.hasAir ? '공청' : '승강');
    base = base.map(p => {
      if (!/^PC/i.test(p.modelKey)) return p;
      const want = partsAll.find(x =>
        /^PC/i.test(x.modelKey) &&
        new RegExp(token,'i').test(x.feature||'') &&
        (!opts.hasCircle || /원형/i.test(x.feature||'')) &&
        (!opts.hasSquare || /사각/i.test(x.feature||'')));
      return want ? { ...want, seq: p.seq } : p;
    });
  }

  // 치환
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

  // 제외
  if (opts.hasWO_RC) {
    base = base.filter(p => !/리모컨/i.test(p.pumName || ''));
  }

  // 호스
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

  // 호스
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

  // 치환
  if (opts.hasColor) {
    base = base.map(p => {
      if (!/^AR-/i.test(p.modelDisplay)) return p;
      const cand = partsAll.find(x => normalizeModel_(x.modelDisplay) === normalizeModel_('AWR-WG00N'));
      return cand ? { ...cand, seq: p.seq } : p;
    });
  } else if (opts.hasWired) {
    base = base.map(p => {
      if (!/^AR-/i.test(p.modelDisplay)) return p;
      const cand = partsAll.find(x => normalizeModel_(x.modelDisplay) === normalizeModel_('AWR-WE13N'));
      return cand ? { ...cand, seq: p.seq } : p;
    });
  }

  // 대표
  const primary = base.find(p => /실내기/i.test(p.group || '')) || base[0] || partsAll[0];
  const pumName = primary?.pumName || '';

  // 할인
  const cfg = getPricingConfig_();
  const setDiscTotalPerSet = getSingleSetDiscountTotal_(pumName);

  const flags = getModelFlags(setModelKey);
  const setDiscAmt = getSingleSetDiscountTotal_(setModelKey);

  // 수량
  const baseQty = Math.max(0, Math.floor(Number(setQty) || 0));

  // 제외
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

  // 조건
  const qBase = baseQty;
  if (addBoltong && qBase > 0) {
    const maxSeq = items.reduce((m, x) => Math.max(m, x.seq || 0), -1);
    items.push({
      model: '발통세트',
      norm: normalizeModel_('발통세트'),
      qty: qBase,
      unit: 0,
      line: 0,
      usedFixedDc: false,
      fixedDcRate: null,
      spec: '',
      group: '',
      fromSet: true,
      seq: maxSeq + 1,
      setGroup: setGroupId,
      setDiscType: null,
      setDiscAmt: setDiscAmt
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

// 미리보기 세트 표용 연속 규격 삭제
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

// OCR 전용 이미지 전처리
function preprocessForOcr_(blob) {
  Logger.log('>> 🧩 OCR 전처리 시작 name=' + (blob && blob.getName ? blob.getName() : 'blob'));

  if (!blob) {
    Logger.log('>> 🟥 전처리 대상 blob 없음');
    return null;
  }

  var ct = blob.getContentType() || '';
  if (ct.indexOf('pdf') !== -1) {
    Logger.log('>> 📄 PDF 입력 감지, 전처리 생략');
    return blob;
  }

  var img;
  try {
    img = ImagesService.openImage(blob);
  } catch (e) {
    Logger.log('>> ⚠️ ImagesService.openImage 실패, 원본 사용 ' + e);
    return blob;
  }

  var w = img.getWidth();
  var h = img.getHeight();
  Logger.log('>> 📐 원본 크기 width=' + w + ' height=' + h);

  if (!w || !h) {
    Logger.log('>> ⚠️ 이미지 크기 정보 없음, 원본 사용');
    return blob;
  }

  // 테두리 잘라서 노이즈 제거
  try {
    var margin = Math.round(Math.min(w, h) * 0.02); // 2% 여백
    if (margin > 0 && w - margin * 2 > 100 && h - margin * 2 > 100) {
      img = img.crop(margin, margin, w - margin * 2, h - margin * 2);
      w = img.getWidth();
      h = img.getHeight();
      Logger.log('>> ✂️ 테두리 크롭 후 width=' + w + ' height=' + h);
    }
  } catch (e) {
    Logger.log('>> ⚠️ 크롭 중 오류, 크롭 생략 ' + e);
  }

  // 해상도 통일
  var maxEdge = Math.max(w, h);
  var targetMin = 1800; // 최소 목표
  var targetMax = 2600; // 최대 제한

  var scale = 1;
  if (maxEdge < targetMin) {
    scale = targetMin / maxEdge;
  } else if (maxEdge > targetMax) {
    scale = targetMax / maxEdge;
  }

  if (Math.abs(scale - 1) > 0.05) {
    var newW = Math.round(w * scale);
    var newH = Math.round(h * scale);
    Logger.log('>> 🔍 리사이즈 수행 scale=' + scale.toFixed(2) +
               ' -> width=' + newW + ' height=' + newH);
    try {
      img = img.resize(newW, newH);
      w = newW;
      h = newH;
    } catch (e) {
      Logger.log('>> ⚠️ 리사이즈 실패, 원본 크기 유지 ' + e);
    }
  } else {
    Logger.log('>> ↔ 리사이즈 생략 scale≈1');
  }

  try {
    var out = img.getBlob().getAs('image/png');
    out.setName('pre_' + (blob.getName() || 'order') + '.png');
    Logger.log('>> ✅ 전처리 완료 최종 width=' + w + ' height=' + h);
    return out;
  } catch (e) {
    Logger.log('>> 🟥 전처리 Blob 변환 실패, 원본 사용 ' + e);
    return blob;
  }
}

/* 이미지 → 텍스트 */
function extractDocText_(blob) {
  Logger.log('>> 📥 OCR 이미지 텍스트 추출 시작 name=' + (blob.getName() || 'blob'));
  if (!blob) {
    throw new Error('이미지 Blob 이 없습니다.');
  }

  // 전처리 추가
  var preBlob = preprocessForOcr_(blob);
  if (preBlob) {
    Logger.log('>> 🧩 전처리된 이미지로 OCR 진행');
  } else {
    Logger.log('>> ⚠️ 전처리 실패, 원본 이미지로 OCR 진행');
    preBlob = blob;
  }

  var text = extractViaDriveOcr_(preBlob);  // 무료 구글 OCR로 변경
  if (!text || !text.trim()) {
    Logger.log('>> 🟥 OCR 텍스트 추출 결과가 비어 있습니다.');
    throw new Error('OCR 텍스트 추출 실패');
  }

  Logger.log('>> ✅ OCR 텍스트 추출 완료 length=' + text.length);
  return text;
}

// Drive OCR 호출
function extractViaDriveOcr_(blob) {
  Logger.log('>> 🚀 Drive OCR 업로드 시작');

  if (!blob) throw new Error('Drive OCR blob 없음');

  // 동시 실행 방지
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(60 * 1000);
  } catch (e) {
    Logger.log('>> ⚠️ Drive OCR 락 대기 실패, 그래도 진행 ' + e);
  }

  let tempFile = null;
  let docId = '';
  let lastErr = null;

  // 재시도
  const MAX_RETRY = 6;
  let waitMs = 1500;

  try {
    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      try {
        Logger.log('>> 🧪 Drive OCR 시도 ' + attempt + '/' + MAX_RETRY);

        tempFile = Drive.Files.insert(
          {
            title: (blob.getName() || ('ocr_' + Date.now())),
            mimeType: blob.getContentType()
          },
          blob,
          {
            ocr: true,
            ocrLanguage: 'ko',
            convert: true
          }
        );

        docId = tempFile && tempFile.id;
        if (!docId) throw new Error('docId 없음');

        Logger.log('>> 📄 Drive OCR 변환 완료 docId=' + docId);
        lastErr = null;
        break;

      } catch (e) {
        lastErr = e;
        const msg = String(e && e.message || e);

        // rate limit 계열만 백오프
        const isRate = /rate limit|User rate limit exceeded|quota/i.test(msg);

        Logger.log('>> ⏳ Drive OCR 실패 attempt=' + attempt + ' msg=' + msg);

        if (!isRate || attempt === MAX_RETRY) {
          throw e;
        }

        const jitter = Math.floor(Math.random() * 400);
        const sleepMs = waitMs + jitter;

        Logger.log('>> 💤 Drive OCR 백오프 대기 ' + sleepMs + 'ms');
        Utilities.sleep(sleepMs);

        waitMs = Math.min(waitMs * 2, 20000);
      }
    }

    if (lastErr) {
      Logger.log('>> 🟥 Drive OCR 업로드 실패 최종 ' + lastErr);
      throw new Error('Drive OCR 업로드 실패: ' + lastErr);
    }

    // 변환된 Google Docs 본문 추출
    let text = '';
    try {
      const doc = DocumentApp.openById(docId);
      text = doc.getBody().getText() || '';
      Logger.log('>> ✍️ Drive OCR 텍스트 추출 완료 len=' + text.length);
    } catch (e) {
      Logger.log('>> 🟥 Drive OCR 문서 읽기 실패 ' + e);
      text = '';
    }

    // 임시 파일 정리
    try {
      Drive.Files.trash(docId);
      Logger.log('>> 🧹 Drive OCR 임시 문서 휴지통 이동');
    } catch (e) {
      Logger.log('>> ⚠️ Drive OCR 임시 문서 정리 실패 ' + e);
    }

    return String(text || '');

  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}

/* 텍스트 정리 */
function _stripBars_(s){
  return String(s||'')
    .replace(/^[\s\|\│\┃\┆\¦:·•\-]+/, '')
    .trim();
}
function _cleanOcrLine_(s){
  return String(s||'')
    .replace(/\t+/g, ' ')
    .replace(/[│┃┆¦]/g, '|')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\u00A0|\u3000/g, ' ')
    .replace(/[,\uFF0C](?=\d{3}\b)/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

// 수평 테이블에서 품목 추출
function extractItemsFromTable_(sectionLines, logger){
  const log = typeof logger === 'function' ? logger : null;
  const items = [];
  const fullRowRe  = /^([A-Z0-9가-힣\-]{3,})\s+[A-Z0-9가-힣\-\/]+\s+(\d{1,3})\s+(?=\d{1,3}(?:,\d{3})+)/;
  const shortRowRe = /^([A-Z0-9가-힣\-]{3,})\s+[A-Z0-9가-힣\-\/]+\s+(\d{1,3})(?:\s|$)/;
  const codeQtyRe  = /^([A-Z0-9가-힣\-]{3,})\s+(\d{1,3})\s+(?=\d{1,3}(?:,\d{3})+)/;

  function fixLargeQty_(line, qty){
    if (!line) return qty;
    if (!qty || qty < 100) return qty;

    const tokens = String(line).match(/\d{1,3}/g);
    if (!tokens) return qty;

    const nums = tokens
      .map(function(t){ return Number(t); })
      .filter(function(n){ return n > 0; });

    if (!nums.length) return qty;

    const small = nums.filter(function(n){ return n <= 50; });
    return small.length ? Math.min.apply(null, small) : qty;
  }

  for (let i = 0; i < sectionLines.length; i++){
    let line = sectionLines[i];
    if (!line) continue;

    if (/(품목코드|품목명|품명|수량|단가|공급가액|부가세|적요|합계|총\s*액|VAT)/.test(line)) {
      if (log) log('>> 🧾 헤더 합계 스킵 ' + line);
      continue;
    }

    if (log) log('>> 📄 라인 ' + String(i).padStart(2,'0') + ' ' + line);

    let consumed = 0;
    let matched = false;
    let code = '';
    let qty  = 0;

    function tryMatch(str, extraConsumed){
      if (!str) return false;

      let m = str.match(fullRowRe);
      if (!m) m = str.match(shortRowRe);
      if (!m) m = str.match(codeQtyRe);
      if (!m) return false;

      const c = m[1];
      let q = _coerceQtyToken_(m[2]);
      q = fixLargeQty_(str, q);

      // 수량 인식 실패 시 라인 전체에서 다시 한 번 찾고, 그래도 없으면 1로 처리
      if (!q || q <= 0){
        const picked = pickQtyToken_(str);
        if (picked > 0) {
          q = picked;
        } else {
          q = 1;
          if (log) log('>> ⚠️ 테이블 수량 인식 실패 기본 1 적용 line=' + str);
        }
      }

      if (c && q > 0){
        code = c;
        qty  = q;
        consumed = extraConsumed;
        return true;
      }
      return false;
    }

    if (tryMatch(line, 0)){
      matched = true;
    } else {
      const merged2 = (sectionLines[i] || '') + ' ' + (sectionLines[i+1] || '');
      if (merged2.trim()){
        if (log) log('>> 🔄 2줄 병합 시도 ' + merged2.trim());
        if (tryMatch(merged2.trim(), 1)) matched = true;
      }
    }

    if (!matched && sectionLines[i+2]){
      const merged3 = (sectionLines[i] || '') + ' ' + (sectionLines[i+1] || '') + ' ' + (sectionLines[i+2] || '');
      if (merged3.trim()){
        if (log) log('>> 🔄 3줄 병합 시도 ' + merged3.trim());
        if (tryMatch(merged3.trim(), 2)) matched = true;
      }
    }

    if (matched){
      items.push({ code: code, qty: qty });
      i += consumed;
      continue;
    }

    // 느슨한 행 처리
    const toks = String(line).split(/\s+/).filter(function(v){ return !!v; });
    const codeGuess = toks[0];

    if (/^[A-Z0-9가-힣\-]{3,}$/.test(codeGuess)){
      const lookAhead = (sectionLines[i+1] || '').trim();
      const tail = toks
        .concat(lookAhead.split(/\s+/).filter(function(v){ return !!v; }))
        .slice(0, 12);

      let qtyTok = null;
      for (let k = tail.length - 1; k >= 0; k--){
        const t = tail[k];
        if (/^\d{1,3}$/.test(t) || /^[ILlO]$/.test(t)){
          qtyTok = t;
          break;
        }
      }

      let q = _coerceQtyToken_(qtyTok);
      q = fixLargeQty_(line + ' ' + lookAhead, q);

      if (!q || q <= 0){
        const picked = pickQtyToken_(line + ' ' + lookAhead);
        if (picked > 0){
          q = picked;
        } else {
          q = 1;
          if (log) log('>> ⚠️ 테이블 수량 인식 실패 기본 1 적용(느슨) code=' + codeGuess + ' line=' + (line + ' ' + lookAhead));
        }
      }

      items.push({ code: codeGuess, qty: q });
      if (qtyTok && lookAhead.includes(qtyTok)) i++;
    }
  }
  return items;
}

// 세로형(블록) 품목 추출기
function isLikelyCode_(s){
  const t = String(s||'').trim();
  if (!t) return false;
  if (/^[A-Z0-9가-힣][A-Z0-9가-힣\-]{2,}$/.test(t)) return true;
  const key = t.replace(/\s+/g,'');
  if (CODE_ALIAS_MAP[t] || CODE_ALIAS_MAP[key]) return true;
  return false;
}

// 수량 후보 숫자 중 작은 값을 우선 사용
function pickQtyToken_(s){
  const matches = String(s || '').match(/\d{1,3}/g);
  if (!matches) return 0;

  const nums = matches
    .map(function(t){ return Number(t); })
    .filter(function(n){ return n > 0; });

  if (!nums.length) return 0;

  const small = nums.filter(function(n){ return n <= 50; });
  return small.length ? Math.min.apply(null, small) : nums[0];
}

// 세로형(블록) 품목 추출기
function extractItemsVerticalList_(lines, startIdx, logger){
  const log = typeof logger === 'function' ? logger : null;

  // 시작 지점 이후 텍스트 정리
  const L = lines.slice(startIdx)
    .map(function(s){ return String(s || '').trim(); })
    .filter(function(v){ return !!v; });

  // 합계/총액 이후는 품목 영역 아님
  let end = L.length;
  for (let i = 0; i < L.length; i++){
    if (/(합계|총\s*액|공급가액|VAT|부가세|청구금액|금\s*액|금액\s*합계)/i.test(L[i])) {
      end = i;
      break;
    }
  }
  const S = L.slice(0, end);

  function firstCodeToken_(s){
    const t = String(s || '').trim();
    if (!t) return '';
    return t.split(/\s+/)[0];
  }

  const items = [];

  if (log) log('>> 📦 세로형 블록 파싱 시작 len=' + S.length);

  for (let i = 0; i < S.length; i++){
    const raw = S[i];
    const firstTok = firstCodeToken_(raw);
    const cur = isLikelyCode_(firstTok) ? firstTok : raw;

    // 코드로 보이지 않으면 스킵
    if (!isLikelyCode_(cur)) continue;

    const aliased = aliasModelIfNeeded_(cur);
    const codeNorm = normalizeModel_(aliased);

    // 같은 줄에서 수량 먼저 찾기
    let qty = pickQtyToken_(raw);

    // 같은 품목 “블록” 내부에서만 수량 찾기
    if (!qty || qty <= 0){
      for (let step = 1; step <= 4 && (i + step) < S.length; step++){
        const aheadRaw = S[i + step];
        const aheadFirst = firstCodeToken_(aheadRaw);

        // 다음 품목 코드가 시작되면 여기서 멈춤
        if (isLikelyCode_(aheadFirst)) break;

        const cand = pickQtyToken_(aheadRaw);
        if (cand > 0){
          qty = cand;
          break;
        }
      }
    }

    // 끝까지 못 찾으면 기본값 1
    if (!qty || qty <= 0){
      qty = 1;
    }

    items.push({ code: cur, qty: qty });

    if (log) {
      log(
        '>> ✏ 세로형 품목 인식 code=' +
        codeNorm +
        ' qty=' + qty +
        ' raw=' + raw
      );
    }
  }

  if (log) log('>> ✅ 세로형 블록 파싱 완료 count=' + items.length);
  return items;
}

function extractItemsVerticalList_(lines, startIdx, logger){
  const log = typeof logger === 'function' ? logger : null;
  const L = lines.slice(startIdx)
    .map(function(s){ return String(s || '').trim(); })
    .filter(function(v){ return !!v; });

  let end = L.length;
  for (let i = 0; i < L.length; i++){
    if (/(합계|총\s*액|공급가액|VAT|부가세|청구금액|금\s*액|금액\s*합계)/i.test(L[i])) {
      end = i;
      break;
    }
  }
  const S = L.slice(0, end);

  function firstCodeToken_(s){
    const t = String(s || '').trim();
    if (!t) return '';
    return t.split(/\s+/)[0];
  }

  const items = [];
  for (let i = 0; i < S.length; i++){
    const raw = S[i];
    const firstTok = firstCodeToken_(raw);
    const cur = isLikelyCode_(firstTok) ? firstTok : raw;
    if (!isLikelyCode_(cur)) continue;

    const aliased = aliasModelIfNeeded_(cur);
    const codeNorm = normalizeModel_(aliased);

    let j = i + 1;
    while (j < S.length){
      const nextTok = firstCodeToken_(S[j]);
      if (!nextTok) break;
      const nextNorm = normalizeModel_(aliasModelIfNeeded_(nextTok));
      if (nextNorm === codeNorm) {
        j++;
      } else {
        break;
      }
    }

    let qty = 0;
    let step = 0;
    for (; step < 6 && (j + step) < S.length; step++){
      qty = pickQtyToken_(S[j + step]);
      if (qty > 0) break;
    }

    if (qty > 0){
      items.push({ code: cur, qty: qty });
      i = j + step;
    }
  }
  return items;
}

// 행에서 품목 추출
function extractItemsLooseRow_(lines, startIdx, logger){
  const log = typeof logger === 'function' ? logger : null;
  const items = [];

  for (let i = startIdx; i < lines.length; i++){
    const line = String(lines[i] || '').trim();
    if (!line) continue;
    if (/(합계|총\s*액|공급가액|VAT|부가세|청구금액|금\s*액|금액\s*합계)/i.test(line)) break;

    const toks = line.split(/\s+/).filter(function(v){ return !!v; });
    if (!toks.length) continue;

    const code = toks[0];
    if (!isLikelyCode_(code)) continue;

    let qty = pickQtyToken_(line);

    if (!qty || qty <= 0){
      qty = 1;
      if (log) log('>> ⚠️ 느슨 행 수량 인식 실패 기본 1 적용 ' + line);
    }

    items.push({ code: code, qty: qty });
  }
  return items;
}

/* 시간표현 파서 */
function parseKoreanTimeWindow_(memoText){
  const s = String(memoText||'');
  const m = s.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
  if (!m) return '오전 일찍';
  let h = Number(m[1]);
  const mm = m[2] ? String(Number(m[2])) : '';
  const hasMin = !!m[2];

  let meridiem = '오전';
  if (h >= 12 || (h>=1 && h<=5)) meridiem = '오후';
  if (h>12) h = h-12;
  if (h===0) h = 12;

  return meridiem + ' ' + h + '시' + (hasMin ? (mm + '분') : '');
}

/* 발주서 텍스트 파싱 */
function parseOrderFromText_(text, logger) {
  const log = typeof logger === 'function' ? logger : null;
  if (log) log('>> ⚙️ 파싱시작');

  const raw = String(text||'');
  const lines = raw
    .split(/\r?\n/)
    .map(s=>_cleanOcrLine_(_stripBars_(s)))
    .filter(Boolean);

  let shipDate     = '';
  let receiverTel  = '';
  let deliveryAddr = '';
  let inspAddr     = '';
  let memoRaw      = '';
  let origDayStr   = '';
  let prevDayStr   = '';

  // 날짜계산
  {
    const m = raw.replace(/\s+/g,' ')
                 .match(/납기일자\s*[:\-]?\s*(\d{4})[.\-\/년]?\s*(\d{1,2})[.\-\/월]?\s*(\d{1,2})/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]) - 1;
      const d = Number(m[3]);

      const origDate = new Date(y, mo, d);
      origDayStr = String(origDate.getDate());

      const prevDate = new Date(y, mo, d);
      prevDate.setDate(prevDate.getDate() - 1);
      prevDayStr = String(prevDate.getDate());

      const py = prevDate.getFullYear();
      const pmo = String(prevDate.getMonth() + 1).padStart(2, '0');
      const pd = String(prevDate.getDate()).padStart(2, '0');
      shipDate = `${py}${pmo}${pd}`;
    }
  }

  // 연락처추출
  {
    const flat = String(raw||'').replace(/\s+/g,' ');
    const anchors = ['인도자','인수자'];
    let candidates = [];
    anchors.forEach(a=>{
      const i = flat.indexOf(a);
      if (i >= 0){
        const win = flat.slice(Math.max(0, i - 40), Math.min(flat.length, i + 140));
        const found = win.match(/010[-\s]?\d{3,4}[-\s]?\d{4}/g) || [];
        candidates.push(...found);
      }
    });
    if (!candidates.length){
      candidates = flat.match(/010[-\s]?\d{3,4}[-\s]?\d{4}/g) || [];
    }
    const phones = Array.from(new Set(
      candidates.map(s => normalizeTel_(s)).filter(Boolean)
    ));
    if (phones.length >= 2) receiverTel = `${phones[0]} (부재시:${phones[1]})`;
    else if (phones.length === 1) receiverTel = phones[0];
    else receiverTel = '';
    if (log) log('>> 📞 연락처완료');
  }

  // 인도처추출
  {
    const m = raw.match(/인도처\s*[:\-]?\s*([^]+?)(?:현장주소|현장\s*주소|참조|비고|발주일자|발주일|설치자|현장명)/);
    if (m) deliveryAddr = _stripBars_(m[1].replace(/\s+/g,' '));
  }

  // 현장주소추출
  {
    const m = raw.match(/현장주소\s*[:\-]?\s*([^]+?)(?:참조|비고|발주일자|발주일|설치자|현장명)/);
    if (m) inspAddr = _stripBars_(m[1].replace(/\s+/g,' '));
  }

  // 참조추출
  {
    const m = raw.match(/참조\s*[:\-]?\s*([^]+?)(?:금액|합계|품목코드|품목|품명|단가|수량|비고|현장주소|인도처|\(\s*VAT\s*포함\s*\)|VAT포함)/i);
    if (m) memoRaw = m[1].replace(/\s+/g,' ').trim();
  }

  let start = -1;
  for (let i=0;i<lines.length;i++){
    if (/품\s*목\s*코\s*[드느드]/.test(lines[i])) { start = i; break; }
  }
  if (start < 0){
    const idx = lines.findIndex(s=>/(품목명|품명).*?(수량)/i.test(s));
    if (idx >= 0) start = idx + 1;
  }

  let items = [];
  if (start >= 0){
    const section = lines.slice(start);
    const rowItems = extractItemsFromTable_(section, log);
    if (rowItems && rowItems.length){
      items = rowItems.map(x => ({ code: x.code, qty: x.qty }));
    } else {
      const vertItems = extractItemsVerticalList_(lines, start, log);
      if (vertItems && vertItems.length){
        items = vertItems;
      } else {
        const loose = extractItemsLooseRow_(lines, start, log);
        items = loose;
      }
    }
  }

  // 메모처리
  let memo = parseKoreanTimeWindow_(memoRaw);
  if (!inspAddr) inspAddr = deliveryAddr;

  // 주소변경
  if (deliveryAddr) deliveryAddr = '야적/' + deliveryAddr;
  if (inspAddr) inspAddr = '야적/' + inspAddr;

  // 텍스트변경
  if (origDayStr && prevDayStr) {
    if (memo === '오전 일찍') {
      memo = `${prevDayStr}상${origDayStr}하 오전일찍`;
    } else {
      memo = `${prevDayStr}상${origDayStr}하 ${memo}`;
    }
  }

  if (log) log('>> ✅ 파싱종료');

  return { shipDate, receiverTel, deliveryAddr, inspAddr, memo, items };
}

// 싱글 / 홈멀티 전표 전송용 정렬
function sortItemsForSend_(items) {
  // 원래 순서 보존용 인덱스 부여
  const tagged = (items || []).map((it, idx) => ({ ...it, __idx: idx }));

  const isBolt = (it) => {
    const m = String(it.model || it.code || '').trim();
    const n = String(it.name || '').trim();
    return /발통세트/i.test(m) || /발통세트/i.test(n);
  };

  const classify = (it) => {
    const raw = String(it.model || it.code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (/^AJ\d/.test(raw)) return 0;          // 홈멀티
    if (/^(AC|AP|AR|AF)\d/.test(raw)) return 1; // 싱글 세트
    return 2;                                 // 그 외(발통세트, 유연호스 등)
  };

  tagged.sort((a, b) => {
    const ca = classify(a);
    const cb = classify(b);
    if (ca !== cb) return ca - cb;          // 홈멀티 → 싱글세트 → 기타

    const boltA = isBolt(a);
    const boltB = isBolt(b);
    if (boltA !== boltB) return boltA ? 1 : -1; // 발통세트는 항상 맨 뒤

    // 원래 순서 유지
    return a.__idx - b.__idx;
  });

  return tagged.map(({ __idx, ...rest }) => rest);
}

/* 모델코드 기준으로 중복 품목 병합 */
function mergeSrcItemsByModel_(items, logger){
  var log = (typeof logger === 'function') ? logger : null;
  var dict = Object.create(null);

  (items || []).forEach(function(it, idx){
    var key = String(it.code || '').trim();
    var qty = Number(it.qty || 0) || 0;
    if (!key || qty <= 0) return;

    if (!dict[key]) {
      dict[key] = {
        code: it.code,
        codeRaw: it.codeRaw,
        qty: qty,
        raw: it.raw,
        __idx: idx,
        __count: 1
      };
    } else {
      var cur = dict[key];
      cur.__count++;

      // 수량이 여러 개일 때는 더 큰 값을 채택
      if (qty > cur.qty) {
        cur.qty = qty;
        cur.codeRaw = it.codeRaw;
        cur.raw = it.raw;
      }
    }
  });

  var list = [];
  Object.keys(dict).forEach(function(k){
    list.push(dict[k]);
  });

  // 원래 등장 순서 유지
  list.sort(function(a, b){
    return (a.__idx || 0) - (b.__idx || 0);
  });

  if (log) {
    list.forEach(function(v){
      if (v.__count > 1) {
        log('🔁 중복 품목 병합 code=' + v.code +
            ' count=' + v.__count +
            ' 최종수량=' + v.qty);
      }
    });
  }

  return list.map(function(v){
    return {
      codeRaw: v.codeRaw,
      code: v.code,
      qty: v.qty,
      raw: v.raw
    };
  });
}

/* 이미지 파일 → 미리보기 데이터 */
function parseImageForPreview(file) {
  const logs = [];
  const log = (m)=>logs.push('>> ' + m);

  try {
    log('📥 파일 수신');
    if (!file) throw new Error('파일 없음');

    const mime = file.type || 'image/png';
    const name = file.name || 'order.png';
    const blob = Utilities.newBlob(Utilities.base64Decode(file.data), mime, name);

    let text = '';
    try {
      text = extractDocText_(blob);
      log('📄 이미지 텍스트 추출 완료');
    } catch (ex) {
      log('❌ 텍스트 추출 실패 ' + String(ex && ex.message || ex));
      throw new Error('이미지 텍스트 추출 실패');
    }

    log('🧾 파싱');
    const parsed = parseOrderFromText_(text, m=>log(m));
    log('🧾 완료');

    // 출고일
    const isRaised = parsed.shipDate >= '20260401';
    if (isRaised) log('📈 인상');

    let srcItems = (parsed.items || []).map(it => {
      const aliased = aliasModelIfNeeded_(it.code);
      return {
        codeRaw: it.code,
        code: normalizeModel_(aliased),
        qty: Number(it.qty || 0) || 0,
        raw: it.raw || it.code
      };
    }).filter(it => it.qty > 0 && it.code);

    if (srcItems.length) {
      const merged = mergeSrcItemsByModel_(srcItems, log);
      if (merged.length !== srcItems.length) {
        log('🔁 중복 품목 정리 전=' + srcItems.length + ' 후=' + merged.length);
      }
      srcItems = merged;
    }

    if (!srcItems.length) {
      log('🟥 표에서 코드/수량을 찾지 못함');
    } else {
      srcItems.forEach(it=>log(`✏ 라인 코드=${it.codeRaw} → ${it.code} 수량=${it.qty}`));
    }

    const { map: homeMap } = getHomeModelPriceMap_(isRaised);
    const singleCtx        = buildSingleSetMap_(isRaised);
    const setModels        = singleCtx.setModels || new Set();
    const homeOrder   = getHomeModelOrder_(isRaised);
    const masterOrder = getMasterModelOrder_();
    function orderIndex_(model){
      const k = normalizeModel_(model);
      if (homeOrder[k]   != null) return homeOrder[k];
      if (masterOrder[k] != null) return 100000 + masterOrder[k];
      return 200000;
    }

    // 구분 우선순위 (실내기 → 실외기 → 판넬 → 리모컨 → 자재 → 그 외)
    function groupRank_(row){
      const g = String(row.group || '').trim();
      const m = String(row.model || '');

      // 발통세트 항상 뒤
      if (/발통세트/.test(m)) return 99;

      if (/실내기/.test(g)) return 10;
      if (/실외기/.test(g)) return 20;
      if (/판넬|패널/i.test(g)) return 30;
      if (/리모컨/i.test(g)) return 40;
      if (/자재/.test(g))    return 50;

      // 그 외
      return 90;
    }

    let finalItems   = [];
    let unmatched    = [];
    let expandedSets = [];
    let nextSetGroup = 1;

    srcItems.forEach(it => {
      const keyBase = it.code;
      const keyCandidates = getZeroOKeyCandidates_(keyBase);

      // 싱글 세트 키 찾기
      let setKey = null;
      for (const k of keyCandidates) {
        if (setModels.has(k)) {
          setKey = k;
          break;
        }
      }

      // 싱글 세트
      if (setKey) {
        log('🎯 싱글 세트 인식: ' + it.codeRaw);
        const setGroupId = nextSetGroup++;
        const rawNameForOptions = it.raw || it.codeRaw || it.modelRaw || '';
        const addBoltFlag = (typeof addBolt !== 'undefined') ? addBolt : false;

        const { parts } = expandSingleSetItems_(
          singleCtx,                 // 싱글 구성 맥락
          setKey,                    // 보정된 세트 키
          it.qty,                    // 세트 수량
          rawNameForOptions,         // 원본 이름으로 옵션 파싱 가능하게 전달
          setGroupId,                // 세트 그룹 id
          addBoltFlag                // 발통세트 추가 여부
        );

        if (!parts.length) {
          log('>> 🟥 세트 전개 실패 key=' + keyBase);
          unmatched.push({ model: it.codeRaw, qty: it.qty });
          return;
        }

        const orderedParts = parts.slice().sort((a,b)=>{
          const ra = groupRank_(a);
          const rb = groupRank_(b);
          if (ra !== rb) return ra - rb;

          const sa = Number.isFinite(a.seq) ? a.seq : 9999;
          const sb = Number.isFinite(b.seq) ? b.seq : 9999;
          return sa - sb;
        });

        expandedSets.push({
          setName: it.codeRaw || setKey,
          setQty: it.qty,
          parts: orderedParts.map(p=>({
            model: p.model,
            spec: p.spec || '',
            qty:  p.qty,
            unit: p.unit,
            line: p.line
          }))
        });

        orderedParts.forEach(p => {
          finalItems.push({
            model: p.model,
            qty: p.qty,
            unit: p.unit,
            line: p.line,
            usedFixedDc: p.usedFixedDc,
            fixedDcRate: p.fixedDcRate,
            spec: p.spec || '',
            fromSet: true,
            group: p.group || '',
            seq:   p.seq,
            setGroup: setGroupId,
            setDiscType: p.setDiscType || null,
            setDiscAmt:  (typeof p.setDiscAmt === 'number' ? p.setDiscAmt : 0)
          });
        });
        return;
      }

      // 홈멀티 단품: 0/O 보정 포함 키 탐색
      let row = null;
      let usedKey = keyBase;
      for (const k of keyCandidates) {
        if (homeMap[k]) {
          row = homeMap[k];
          usedKey = k;
          break;
        }
      }

      if (!row) {
        log('⚠️ 가격표 미매칭 모델: ' + it.codeRaw + ' (' + keyBase + ')');
        unmatched.push({ model: it.codeRaw, qty: it.qty });
        return;
      }

      log('🔗 매칭 성공 code=' + it.codeRaw + ' → ' + row.modelRaw + ' (key=' + usedKey + ')');

      let unit = 0;
      let usedFixed = false;

      if (typeof row.fixedDcRate === 'number') {
        unit = applyPricingWithDC_(row.basePrice, row.fixedDcRate);
        usedFixed = true;
      } else if (row.hasL2Ref) {
        unit = applyPricingWithDC_(row.basePrice, null);
      } else {
        unit = Number(row.unitFromSheet) || 0;
        if (!(unit > 0)) unit = applyPricingWithDC_(row.basePrice, null);
      }

      // 특수 단가 강제 적용
      const forcedUnit = overrideSpecialUnitPrice_(row.modelRaw, unit);
      if (forcedUnit !== unit) {
        log('💰 분기관 특수 단가 적용 ' + row.modelRaw + ' ' + unit + ' → ' + forcedUnit);
      }

      const finalUnit = forcedUnit;
      const qty = Number(it.qty || 0) || 0;
      const line = finalUnit * qty;

      finalItems.push({
        model: row.modelRaw,
        qty: it.qty,
        unit: finalUnit,
        line: line,
        usedFixedDc: usedFixed,
        fixedDcRate: row.fixedDcRate,
        spec: row.spec || '',
        fromSet: false,
        group: row.group || '',
        seq:   row.seq,
        setGroup: null,
        setDiscType: null,
        setDiscAmt: 0
      });
    });

    finalItems.sort((a,b)=>{
      const ga = Number.isFinite(a.setGroup) ? a.setGroup : 0;
      const gb = Number.isFinite(b.setGroup) ? b.setGroup : 0;
      if (ga !== gb) return ga - gb;

      // 같은 세트 안에서는 구분(실내기/실외기/판넬/리모컨/자재/발통세트) 순서
      const ra = groupRank_(a);
      const rb = groupRank_(b);
      if (ra !== rb) return ra - rb;

      // 같은 구분 안에서는 종합견적서 순서
      const sa = Number.isFinite(a.seq) ? a.seq : 9999;
      const sb = Number.isFinite(b.seq) ? b.seq : 9999;
      if (sa !== sb) return sa - sb;

      // 홈멀티/싱글 세트 전체 우선순위
      const ia = orderIndex_(a.model);
      const ib = orderIndex_(b.model);
      if (ia !== ib) return ia - ib;
      return 0;
    });

    // 규격 연속 중복 정리
    expandedSets = squashPreviewSets_(expandedSets);
    const finalSquashed = squashConsecutiveSpecs_(finalItems);

    const subtotal = finalSquashed.reduce((acc,x)=>acc + (Number(x.line)||0), 0);
    const hasFixed = finalSquashed.some(x=>x.usedFixedDc);
    const fixedList = finalSquashed
      .filter(x=>x.usedFixedDc && typeof x.fixedDcRate==='number')
      .map(x=>x.fixedDcRate);

    const whInfo = detectWarehouseFromItems_(finalSquashed);
    log(`🚚 물류창고 판정 whCd=${whInfo.whCd} (${whInfo.whName})`);

    log(`✅ 전송 대상 ${finalSquashed.length}건 불일치 ${unmatched.length}건`);

    return {
      ok: true,
      logs,
      preview: {
        due: parsed.shipDate,
        isRaisedPrice: isRaised,
        tel: parsed.receiverTel,
        deliveryAddr: parsed.deliveryAddr,
        memo: parsed.memo,
        inspAddr: parsed.inspAddr,
        currency: getPricingConfig_().CURRENCY,
        whCd: whInfo.whCd,
        whName: whInfo.whName,
        itemsUnmatched: unmatched,
        expandedSets: expandedSets,
        finalItems: finalSquashed,
        totalFormatted: formatCurrency_(subtotal),
        hasFixedDc: hasFixed,
        fixedDcRates: fixedList
      }
    };
  } catch(e){
    log(`❌ 파싱 실패 ${String(e && e.message || e)}`);
    return { ok:false, logs, error:String(e && e.message || e) };
  }
}

/* 퍼센트 포맷 */
function formatPct_(rate){
  if (typeof rate !== 'number' || isNaN(rate)) return '';
  return String(Math.floor(rate*100)) + '%';
}

function formatShortKrwMinus_(amt){
  const n = Math.floor(Math.abs(Number(amt) || 0));
  if (n === 0) return '';
  if (n % 10000 === 0) return '-' + (n/10000) + '만';
  if (n % 1000 === 0)  return '-' + (n/1000)  + '천';
  return '-' + formatCurrency_(n);
}

/* 모델 → 품명 맵 로딩 */
function loadModelNameMaps_(){
  const res = { home: {}, single: {} };
  try {
    const ss = SpreadsheetApp.openById(SRC_SHEET_ID);

    // 헤더에서 컬럼 찾기 유틸
    const findIdx = (header, labels) => {
      const norm = s => String(s || '').replace(/\s+/g, '').toUpperCase();
      const labelNorms = labels.map(norm);
      for (let c = 0; c < header.length; c++) {
        const hNorm = norm(header[c]);
        if (!hNorm) continue;
        if (labelNorms.indexOf(hNorm) >= 0) return c;
      }
      return -1;
    };

    // 공용 로더
    const fillMap = (sheetName, keyName) => {
      const sh = ss.getSheetByName(sheetName);
      if (!sh) return;

      const values = sh.getDataRange().getValues();
      if (!values.length) return;

      // getHeaderRowIndex_ 는 1-based, values 배열은 0-based
      const headerRowIdx = getHeaderRowIndex_(sheetName) - 1;
      if (headerRowIdx < 0 || headerRowIdx >= values.length) return;

      const header = values[headerRowIdx] || [];

      const idxModel = findIdx(header, ['모델명', 'MODEL', '모델']);
      const idxName  = findIdx(header, ['품명', '품목명']);

      if (idxModel < 0 || idxName < 0) {
        Logger.log('⚠️ >> 모델-품명 헤더 찾기 실패 sheet=' + sheetName +
                   ' idxModel=' + idxModel + ' idxName=' + idxName);
        return;
      }

      for (let r = headerRowIdx + 1; r < values.length; r++) {
        const row = values[r] || [];
        const rawModel = String(row[idxModel] || '').trim();
        if (!rawModel) continue;

        const key = normalizeModel_(rawModel);
        if (!key) continue;

        const name = String(row[idxName] || '').trim();
        if (!name) continue;

        if (!res[keyName][key]) {
          res[keyName][key] = name;
        }
      }

      Logger.log('>> 📦 모델-품명 맵 로딩 sheet=' + sheetName +
                 ' count=' + Object.keys(res[keyName]).length);
    };

    // 홈멀티 / 싱글 구성품 각각 로드
    fillMap(HOME_SHEET, 'home');
    fillMap(SINGLE_PARTS_SHEET, 'single');

  } catch(e){
    Logger.log('🛑 >> 모델-품명 맵 로딩 실패 ' + (e && e.message || e));
  }
  return res;
}

/* 품목 목록 기준 물류창고 판정 */
function detectWarehouseFromItems_(items) {
  const src = Array.isArray(items) ? items : [];
  if (!src.length) {
    Logger.log('>> 🏬 품목 없음 → 기본 초월창고');
    return { whCd: '00003', whName: '초월창고' };
  }

  const maps = loadModelNameMaps_();
  const homeMap = maps.home || {};
  const singleMap = maps.single || {};

  const normModel = function(m) {
    return normalizeModel_(String(m || ''));
  };

  // 홈멀티 전표 여부 판단
  const hasHomeMulti = src.some(function(it) {
    if (it.fromSet) return false;
    const key = normModel(it.model);
    return /^AJ\d/i.test(key);
  });

  let whCd = '00003';
  let whName = '초월창고';

  if (hasHomeMulti) {
    // 홈멀티 전표인 경우
    const hasInfinite = src.some(function(it) {
      if (it.fromSet) return false;
      const key = normModel(it.model);
      const name = homeMap[key] || '';
      const spec = String(it.spec || '');
      return /인피니트/i.test(name) || /인피니트/i.test(spec) || /인피니트/i.test(it.model);
    });

    if (hasInfinite) {
      whCd = '2';
      whName = '상일창고';
    }
  } else {
    // 싱글/부품 전표인 경우
    const singlePattern = /(360|냉방전용|1\s*[- ]?\s*way|1\s*웨이|원\s*웨이|1\s*w\b|냉전|비스포크|1등급|벽걸이|가정용\s*에어컨)/i;

    const hasSingleKeyword = src.some(function(it) {
      const key = normModel(it.model);
      const name = singleMap[key] || it.pumName || '';
      const spec = String(it.spec || '');
      const text = name + ' ' + spec + ' ' + it.model;
      return singlePattern.test(text);
    });

    if (hasSingleKeyword) {
      whCd = '2';
      whName = '상일창고';
    }
  }

  Logger.log('>> 🏬 창고 판정 완료 whCd=' + whCd + ' (' + whName + ') / hasHomeMulti=' + hasHomeMulti);
  return { whCd: whCd, whName: whName };
}

// 전송
function sendOrderToEcount_(custCode, managerCode, order, hasFixedDc, fixedDcRates, optUserId, optApiKey) {
  let sessionId, zone;
  try {
    const __sess = getEcountSession(optUserId, optApiKey);
    sessionId = __sess.sessionId;
    zone = __sess.zone;
    Logger.log('🚀 세션성공');
  } catch (e) {
    Logger.log('🛑 세션실패');
    throw new Error('실패');
  }
  const cust = String(custCode||'').trim();
  if (!cust) throw new Error('없음');

  const cfg = getPricingConfig_();
  const ioDate = toYmd_(order.due) || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');

  let whAuto = { whCd: '00003' };
  try {
    if (typeof detectWarehouseFromItems_ === 'function') {
      whAuto = detectWarehouseFromItems_(order.items || []) || { whCd: '00003' };
    }
  } catch (e) {
    Logger.log('⚠️ 창고오류');
    whAuto = { whCd: '00003' };
  }
  const whCd = String(order.whCd || whAuto.whCd || '00003');
  Logger.log('🏬 창고결정');

  const tel = String(order.tel || '').trim();
  const addr = String(order.deliveryAddr||'');
  const memo = String(order.memo||'');
  const empCd = String(managerCode||'').trim() || (getScriptCreds_().EMP_CD) || '';
  const addTxt01 = String(order.inspAddr||'') || addr;
  const addTxt05 = '*';
  const memoFiltered = /단위/i.test(memo) ? '' : memo;

  const cm = lookupCustomerMemos_(cust);
  Logger.log('🧾 메모할당');
  Logger.log('📞 인수자확인');
  Logger.log('📦 배송지확인');
  Logger.log('🗓 일정확인');

  const SaleOrderList = [];
  let lineIndex = 0;

  const normModel_ = (m)=>{
    return String(m||'').replace(/\s+/g,'').toUpperCase();
  };

  const hasHomeModel = (order.items || []).some(it=>{
    const mm = normModel_(it.model);
    return /^AJ\d/.test(mm);
  });

  const hasSingleSetWithDisc = (order.items || []).some(it=>{
    return it.setFlags && (it.setFlags.is360 || it.setFlags.is4way || it.setFlags.isStand || it.setFlags.is1way || it.setFlags.isDeluxe || it.setFlags.isGrade1);
  });

  const formatPct_ = (rate) => {
    if (typeof rate !== 'number' || isNaN(rate)) return '';
    return String(Math.floor(rate * 100)) + '%';
  };
  const globalPct = formatPct_(cfg.HOME_DISCOUNT_RATE);
  const fixedPct = (hasFixedDc && fixedDcRates && fixedDcRates.length)
    ? formatPct_(fixedDcRates[0])
    : '';

  let prevSpec = null;

  const itemsForSend = (order.items || []).slice().sort((a,b)=>{
    const oa = (typeof a.__ord === 'number') ? a.__ord : 0;
    const ob = (typeof b.__ord === 'number') ? b.__ord : 0;
    return oa - ob;
  });

  const metaSetGroup = [];
  const metaSetFlags = [];

  itemsForSend.forEach(it=>{
    const qty = Math.floor(Number(it.qty)||0);
    if (qty <= 0) return;

    const priceVat0 = (typeof it.unit === 'number' && it.unit > 0)
      ? Math.round(it.unit)
      : applyPricing_(Number(it.price || 0));

    const priceVat = overrideSpecialUnitPrice_(it.model, priceVat0);

    const total = priceVat * qty;
    const sup = Math.floor(Math.abs(total)/1.1);
    const vat = Math.abs(total) - sup;
    const supply = total<0 ? -sup : sup;
    const vatAmt = total<0 ? -vat : vat;
    const priceEx = priceVat<0 ? -Math.floor(Math.abs(priceVat)/1.1) : Math.floor(priceVat/1.1);

    let specRaw = String(it.spec || '').trim();
    if (specRaw === '-' || specRaw === '—') specRaw = '';
    let sizeDes = '';
    if (specRaw && specRaw !== prevSpec) { sizeDes = specRaw; prevSpec = specRaw; }

    let remarksVal = '';
    if (lineIndex === 0) {
      remarksVal = addr || '';
    } else if (lineIndex === 1) {
      if (hasHomeModel) {
        remarksVal = hasFixedDc && fixedPct
          ? (globalPct + ' / ' + fixedPct)
          : globalPct;
      } else {
        remarksVal = '';
      }
    }
    lineIndex++;
    
    const g = (typeof it.setGroup === 'number') ? it.setGroup : -1;
    metaSetGroup.push(g);
    metaSetFlags.push(it.setFlags || null);

    SaleOrderList.push({ BulkDatas:{
      IO_DATE: ioDate,
      UPLOAD_SER_NO: "1",
      CUST: cust,
      CUST_DES: "",
      EMP_CD: empCd,
      WH_CD: whCd,
      IO_TYPE: "",
      PJT_CD: "",
      TTL_CTT: "",
      REF_DES: "",
      COLL_TERM: "",
      AGREE_TERM: "",
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
      U_MEMO4: "",
      U_MEMO5: "",

      PROD_CD: String(it.model),
      PROD_DES: "",
      SIZE_DES: sizeDes || "\u200B",
      QTY: String(qty),
      PRICE: String(priceEx),
      USER_PRICE_VAT: String(Math.abs(priceVat)),
      SUPPLY_AMT_F: "0",
      SUPPLY_AMT: String(supply),
      VAT_AMT: String(vatAmt),

      REMARKS: remarksVal
    }});
  });

  if (!SaleOrderList.length) throw new Error('없음');

  if (hasHomeModel) {
    const idxHome = SaleOrderList.findIndex(row =>
      /^AJ\d+/i.test(String(row.BulkDatas.PROD_CD||'')) &&
      !String(row.BulkDatas.REMARKS||'').trim()
    );
    if (idxHome >= 0) {
      const msg = fixedPct ? (globalPct + ' / ' + fixedPct) : globalPct;
      SaleOrderList[idxHome].BulkDatas.REMARKS = msg;
      Logger.log('>> 🧾 홈멀티 DC율 적요 주입 line=' + (idxHome+1) + ' msg=' + msg);
    }
  }

  if (hasSingleSetWithDisc) {
    const fmtMoney = (n)=>{
      const amt = Math.floor(Math.abs(Number(n)||0));
      if (!amt) return '';
      const m = Math.floor(amt / 10000);
      const c = Math.floor((amt % 10000) / 1000);
      return '-' + (m > 0 ? m + '만' : '') + (c > 0 ? c + '천' : '');
    };

    const groupMsg = new Map();
    const firstInfo = new Map();

    order.items.forEach(it=>{
      const g = Number.isFinite(it.setGroup) ? Number(it.setGroup) : -1;
      if (g < 0) return;
      if (it.setFlags) {
        firstInfo.set(g, it.setFlags);
      }
    });

    firstInfo.forEach((flags, g) => {
      const txts = [];
      if (flags.is360 && cfg.DISCOUNT_360_AMT > 0) txts.push(fmtMoney(cfg.DISCOUNT_360_AMT));
      if (flags.is4way && cfg.DISCOUNT_4WAY_AMT > 0) txts.push(fmtMoney(cfg.DISCOUNT_4WAY_AMT));
      if (flags.isStand && cfg.DISCOUNT_STAND_AMT > 0) txts.push(fmtMoney(cfg.DISCOUNT_STAND_AMT));
      if (flags.is1way && cfg.ONEWAY_DISCOUNT_AMT > 0) txts.push(fmtMoney(cfg.ONEWAY_DISCOUNT_AMT));
      if (flags.isDeluxe && cfg.DELUXE_DISCOUNT_AMT > 0) txts.push(fmtMoney(cfg.DELUXE_DISCOUNT_AMT));
      if (flags.isGrade1 && cfg.FIRSTGRADE_DISCOUNT_AMT > 0) txts.push(fmtMoney(cfg.FIRSTGRADE_DISCOUNT_AMT));
      
      if (txts.length > 0) {
        groupMsg.set(g, txts.join(' / '));
      }
    });

    groupMsg.forEach((msg, g) => {
      for (let i = 0; i < SaleOrderList.length; i++) {
        if (metaSetGroup[i] !== g) continue;
        if (!String(SaleOrderList[i].BulkDatas.REMARKS||'').trim()) {
          SaleOrderList[i].BulkDatas.REMARKS = msg;
          Logger.log('🧾 적요삽입');
          break;
        }
      }
    });
  }

  // API 호출
  const url = `http://152.69.228.109:3000/proxy/ecount/saleorder`;
  Logger.log('📦 페이로드확인');
  try {
    Logger.log('📦 페이로드확인');
  } catch(e) {
    Logger.log('⚠️ 직렬화실패');
  }

  let res;
  try {
    res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ SESSION_ID: sessionId, ZONE: zone, payload: { SaleOrderList } }),
      muteHttpExceptions: true
    });
    Logger.log('📬 호출완료');
  } catch (e) {
    Logger.log('🛑 호출실패');
    return { ok: false, error: String(e && e.message || e) };
  }

  const code = res.getResponseCode();
  const txt = res.getContentText();
  let body; try { body = JSON.parse(txt); } catch(e){ body = { raw: txt }; }
  const ok = (code===200) && (body?.Data?.SuccessCnt > 0);

  if (!ok) {
    const msg = body?.Data?.Status?.[0]?.Message || body?.Message || txt;
    Logger.log('❌ 전송실패');
    return { ok:false, status:code, body, error: msg, sentCount: 0 };
  }
  Logger.log('✅ 전송성공');
  return { ok:true, status:code, body, sentCount: SaleOrderList.length };
}

// 미리보기전송
function sendFromPreview(form, preview) {
  const logs = [];

  try {
    Logger.log('🚀 시작');

    if (!preview || !preview.finalItems || !preview.finalItems.length) {
      throw new Error('없음');
    }

    const itemsForSend = squashConsecutiveSpecs_(preview.finalItems || []);

    const order = {
      due: preview.due || '',
      tel: preview.tel || '',
      deliveryAddr: preview.deliveryAddr || '',
      memo: preview.memo || '',
      inspAddr: preview.inspAddr || '',
      whCd: preview.whCd || '',
      items: itemsForSend.map(function(x, idx) {
        return {
          model: x.model,
          qty: Number(x.qty || 0) || 0,
          unit: Number(x.unit || 0) || 0,
          spec: x.spec || '',
          fromSet: !!x.fromSet,
          homeIdx: x.homeIdx,
          seq: x.seq,
          setGroup: x.setGroup,
          setDiscType: x.setDiscType || null,
          setDiscAmt: (typeof x.setDiscAmt === 'number') ? x.setDiscAmt : 0,
          __ord: idx
        };
      })
    };

    Logger.log('📦 준비');

    const result = sendOrderToEcount_(
      String((form && form.custCode) || ''),
      String((form && form.managerCode) || ''),
      order,
      Boolean(preview.hasFixedDc),
      Array.isArray(preview.fixedDcRates) ? preview.fixedDcRates : [],
      form?.ecountId,
      form?.ecountApi
    );

    Logger.log('📬 결과');

    return {
      ok: true,
      logs: logs,
      result: result
    };
  } catch (e) {
    Logger.log('🟥 실패');
    return {
      ok: false,
      logs: logs,
      error: String((e && e.message) || e)
    };
  }
}

/* HTML include */
function include_(name){ return HtmlService.createHtmlOutputFromFile(name).getContent(); }