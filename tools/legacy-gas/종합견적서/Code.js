// 노션 인증 데이터베이스
const AUTH_TOKEN = 'REDACTED_NOTION_TOKEN';
const AUTH_DB_ID = '198a1006d65880ddb510e0d525c5e9da';

// 템플릿 진입 (이메일만 동기 주입, 인증/로고/데이터는 모두 비동기 로드)
function doGet() {
  const t = HtmlService.createTemplateFromFile('index');

  // 이메일만 주입 (인증은 클라이언트 startAuth에서 비동기 처리)
  t.userEmail = Session.getActiveUser().getEmail();
  t.authData = '{}';

  return t.evaluate().setTitle('종합견적서').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// 비동기 일괄 데이터 로드
function getInitialData() {
  return {
    homemulti: getHomeMulti(),
    singleSets: getSingleSets(),
    singleParts: getSingleParts(),
    homeDefaults: getHomeDefaults(),
    singleDefaults: getSingleDefaults(),
    singleMatPrices: getSingleMatPrices(),
    commercialMulti: getCommercialMulti(),
    commercialParts: getCommercialParts(),
    oldProducts: getOldProducts_(),
    recommendData: getRecommendOduData(),
    specDetailMap: getSpecDetailMap_(),
    priceInc: getPriceIncData_(),
    config: {
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
      unitRoundMode: UNIT_ROUND_MODE
    }
  };
}

// 상수
const SRC_SHEET_ID      = '1RJqO3jT-yJTi3NDBhL60o_cZWlVETGTU7UlvIKXuVNQ';
const HOME_NAME         = '홈멀티_단가인상';
const SINGLE_NAME       = '싱글 세트_단가인상';
const SINGLE_PARTS_NAME = '싱글 구성품_단가인상';
const COMM_NAME         = '상업멀티_단가인상';
const COMM_PARTS_NAME   = '상업멀티 구성_단가인상';
const CUSTOMERS_NAME    = '거래처';
const MANAGERS_NAME     = '담당자';

/* 가격 전역 설정 */
const DISCOUNT_RATE_HOME = 0.45;   // 홈멀티 전역 할인율 (기본값)
const DISCOUNT_RATE_COMM = 0.45;   // 상업멀티 전역 할인율 (기본값)
const SHOW_I_HOSE             = false; // 유연호스 I형 사용
const DISCOUNT_360_AMT        = 0;     // 360 할인액
const DISCOUNT_4WAY_AMT       = 0;     // 4way 할인액
const DISCOUNT_STAND_AMT      = 0;     // 스탠드 할인액
const ONEWAY_DISCOUNT_AMT     = 0;     // 싱글 1way 할인액
const DELUXE_DISCOUNT_AMT     = 0;     // 디럭스 세트 전용 할인액
const FIRSTGRADE_DISCOUNT_AMT = 0;       // 1등급 세트 기본 할인액
const UNIT_ROUND_TO           = 0;       // 0이면 단위 처리 없음, 그 외 10/100/1000
const UNIT_ROUND_MODE         = 'ROUND'; // ROUND / CEIL / FLOOR

// 노션 설정
var NOTION_DB_ID = '193a1006d6588161a02cc8f196d7102b';
var NOTION_TOKEN = 'REDACTED_NOTION_TOKEN';
var NOTION_VER   = '2025-09-03';
const NOTION_TOKEN_ORDER = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_ORDER = '2eca1006d65880109d91c2e56fab28f4';

// 캐시 유틸
const CACHE_CHUNK_BYTES = 90000;
function cachePutJSON_(key, obj, ttlSec) {
  const cache = CacheService.getScriptCache();
  const str = JSON.stringify(obj);
  const ttl = ttlSec || 1800;
  if (str.length <= CACHE_CHUNK_BYTES) { cache.put(key, str, ttl); return true; }
  const n = Math.ceil(str.length / CACHE_CHUNK_BYTES);
  cache.put(key + '#count', String(n), ttl);
  for (let i = 0; i < n; i++) cache.put(`${key}#${i}`, str.slice(i*CACHE_CHUNK_BYTES, (i+1)*CACHE_CHUNK_BYTES), ttl);
  return true;
}
function cacheGetJSON_(key) {
  const cache = CacheService.getScriptCache();
  const cnt = cache.get(key + '#count');
  if (cnt) {
    const n = parseInt(cnt, 10);
    let buf = '';
    for (let i = 0; i < n; i++) { const part = cache.get(`${key}#${i}`); if (!part) return null; buf += part; }
    try { return JSON.parse(buf); } catch(e) { return null; }
  }
  const hit = cache.get(key); if (!hit) return null;
  try { return JSON.parse(hit); } catch(e) { return null; }
}

// 캐시삭제
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

// 이미지 팝업
function getGateImages() {
  var folderId = '1v89fQvf5MBMFgwaGSvc-JlqpA4OTMCKs'; 
  
  try {
    var folder = DriveApp.getFolderById(folderId);
    var files = folder.getFiles();
    var images = [];
    
    while (files.hasNext()) {
      var file = files.next();
      var mime = file.getMimeType();
      
      // 이미지 파일(jpeg, png, gif 등)만 처리
      if (mime.startsWith('image/')) {
        // Base64 인코딩
        var bytes = file.getBlob().getBytes();
        var b64 = Utilities.base64Encode(bytes);
        images.push('data:' + mime + ';base64,' + b64);
      }
    }
    return images;
  } catch (e) {
    Logger.log('>> ⚠️ 이미지 가져오기 실패: ' + e);
    return [];
  }
}

// 로고 이미지
function getLogoImage() {
  // ⚙️설정
  var folderId = '1zHDxAzCFgr6draLkohwNqgQ03ud5KfsN'; // 여기에 폴더ID 고정

  Logger.log('🚀 로고함수시작');
  try {
    // 폴더접근
    var folder = DriveApp.getFolderById(folderId);
    Logger.log('📂 폴더찾기성공: ' + folder.getName());

    var files = folder.getFiles();
    
    // 파일순회
    while (files.hasNext()) {
      var file = files.next();
      var mime = file.getMimeType();
      var name = file.getName();
      
      Logger.log('📄 파일검사: ' + name + ' (' + mime + ')');

      // 이미지체크
      if (mime.startsWith('image/')) {
        Logger.log('✨ 이미지발견: ' + name);
        
        var blob = file.getBlob();
        var b64 = Utilities.base64Encode(blob.getBytes());
        var result = 'data:' + mime + ';base64,' + b64;
        
        Logger.log('✅ 변환완료');
        return result; // 첫번째 이미지 반환 후 종료
      }
    }

    Logger.log('⚠️ 이미지없음');
    return "";

  } catch (e) {
    Logger.log('💥 에러발생: ' + e);
    return "";
  }
}

// 공통 유틸
function normalizeSize_(v) {
  const t = String(v == null ? '' : v).trim();
  const n = t.replace(/[^\d.+]/g, '');
  return n || '';
}
function findIdx_(row, keys) {
  for (let i = 0; i < row.length; i++) if (keys.some(k => row[i] === k.replace(/\s+/g, ''))) return i;
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
function todayYMD_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd'); }
function _normSpec_(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }

// 표시명 유틸
function sanitizeKoreanParen_(text) {
  let s = String(text || '');
  s = s.replace(/\(([^)]*)\)/g, function(m, inner){ return /[가-힣]/.test(inner) ? m : ''; });
  s = s.replace(/\[([^\]]*)\]/g, function(m, inner){ return /[가-힣]/.test(inner) ? m : ''; });
  s = s.replace(/\{([^}]*)\}/g, function(m, inner){ return /[가-힣]/.test(inner) ? m : ''; });
  s = s.replace(/<([^>]*)>/g,  function(m, inner){ return /[가-힣]/.test(inner) ? m : ''; });
  return s;
}
function trimSymbols_(text) {
  return String(text||'').replace(/[~`!@#$%^&*_\-+=\\|/;:'",.<>?·•]/g, ' ').replace(/\s+/g,' ').trim();
}
function sanitizeDisp_(text) { return trimSymbols_(sanitizeKoreanParen_(text)); }

// 마력 추출
function hpFromText_(s) {
  const t = String(s||'');
  let m = t.match(/(\d+(?:[.,]\d+)?)\s*hp/i);
  if (!m) m = t.match(/(\d+(?:[.,]\d+)?)\s*마력/i);
  if (!m) return '';
  const num = String(m[1]).replace(',', '.');
  return `${num}HP`;
}

// 미표시 품목
function isBlockedByNote_(note){
  const s = String(note || '').replace(/\s+/g,'');
  if(!s) return false;
  return /미판매|단종/.test(s);
}

// 품절표시 품목
function isSoldOutByNote_(note){
  const s = String(note || '').replace(/\s+/g,'');
  if(!s) return false;
  return /품절/.test(s);
}

// 대분류 통일
function unifyCatL_(L){ const t = String(L||'').trim(); return t === '부자재2' ? '부자재' : t; }

// 홈멀티 분류
function classifyHome_(rawName) {
  const n = String(rawName || '').trim();
  let catL = ''; let catM = ''; let catS = ''; let disp = '';

  if (/원형\s*발통|발통\s*세트|받침대|일자발|평발|플랫/i.test(n)) {
    catL = '실외기 받침대';
    if (/원형|발통/i.test(n)) catM = '원형발통';
    else if (/일자발|평발|플랫/i.test(n)) catM = '일자발';
    disp = sanitizeDisp_(n.replace(/실외기|원형|발통|세트|받침대|일자발|평발|플랫/gi, ''));
    return { catL:unifyCatL_(catL), catM, catS: '', disp };
  }

  if (/전열\s*교환기|에어콤보|에어콤포/i.test(n)) {
    catL = '전열교환기';
    if (/에어콤보|에어콤포/i.test(n)) catM = '에어콤보';
    disp = sanitizeDisp_(n.replace(/전열\s*교환기|에어콤보|에어콤포/gi, ''));
    return { catL:unifyCatL_(catL), catM, catS: '', disp };
  }

  if (/인테리어\s*핏|인테리어핏/i.test(n)) {
    catL = '인테리어핏';
    disp = sanitizeDisp_(n.replace(/인테리어\s*핏|인테리어핏/gi, ''));
    return { catL:unifyCatL_((catL)), catM: '', catS: '', disp };
  }

  if (/시스템\s*제습기|제습기/i.test(n) && !/가정용/i.test(n)) {
    catL = '시스템제습기';
    disp = sanitizeDisp_(n.replace(/시스템\s*제습기|제습기/gi, ''));
    return { catL:unifyCatL_(catL), catM: '', catS: '', disp };
  }

  if (/^실외기|[\s_\-]실외기/.test(n) || /^실외기/.test(n)) {
    catL = '실외기';
    if (/단배관/i.test(n)) catM = '단배관';
    else if (/다배관/i.test(n)) catM = '다배관';
    const hp = hpFromText_(n);
    disp = hp || sanitizeDisp_(n.replace(/실외기|단배관|다배관/gi, ''));
    return { catL:unifyCatL_(catL), catM, catS: '', disp };
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
    return { catL:unifyCatL_(catL), catM, catS, disp };
  }

  if (/판넬|패널/i.test(n)) {
    catL = '판넬';
    if (/공기청정|공청/i.test(n) && /WIFI/i.test(n)) catM = '공기청정 WIFI';
    else if (/공기청정|공청/i.test(n) && /미내장/i.test(n)) catM = '공기청정 미내장';
    else if (/WIFI/i.test(n)) catM = 'WIFI';
    else if (/미내장/i.test(n)) catM = '미내장';
    else if (/인피니트/i.test(n)) catM = '인피니트';
    disp = sanitizeDisp_(n.replace(/판넬|패널|WIFI|공기청정|공청|미내장|인피니트/gi, ''));
    return { catL:unifyCatL_(catL), catM, catS: '', disp };
  }

  catL = '부자재';
  if (/리모컨|리모콘/i.test(n)) catM = '리모컨';
  else if (/분\s*기\s*관|분기관/i.test(n)) catM = '분기관';
  else if (/유연호스/i.test(n)) catM = '유연호스';
  else catM = '기타';
  disp = sanitizeDisp_(n.replace(/리모컨|리모콘|분\s*기\s*관|드레인펌프|유선보드|분기관|유연호스/gi, ''));
  return { catL:unifyCatL_(catL), catM, catS: '', disp };
}

// 홈멀티 데이터
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
    const row = (vr[i] || []).map(v => String(v || '').trim());
    const H = row.map(v => v.replace(/\s+/g, ''));
    const ok = H.includes('모델명') && H.includes('납품가') && (H.includes('품명') || H.includes('품') || H.includes('품목'));
    if (ok) { hdrRow = i; break; }
  }
  if (hdrRow < 0) hdrRow = 3;

  const Hraw = (vr[hdrRow] || []).map(v => String(v || '').trim());
  const H = Hraw.map(v => v.replace(/\s+/g, ''));
  const idxName   = findIdx_(H, ['품명', '품', '품목', '항목']);
  const idxModel  = findIdx_(H, ['모델명', '모델', '품목코드', '기종']);
  const idxUnit   = findIdx_(H, ['단위']);
  const idxPrices = H.map((v,i)=>v==='납품가'?i:-1).filter(i=>i>=0);
  const idxPrice  = idxPrices.length ? idxPrices[idxPrices.length - 1] : -1;
  const idxCap    = findIdx_(H, ['용량']);
  const idxSpec   = findIdx_(H, ['규격']);
  const idxList   = findIdx_(H, ['출고가','LIST','리스트','정가','소비자가']);
  const idxFixDc  = findIdx_(H, ['고정DC']);
  const idxNote   = findIdx_(H, ['비고']);
  const idxMaxIn  = findIdx_(H, ['최대 연결 실내기 대수']);

  const out = [];
  for (let r = hdrRow + 1; r < vr.length; r++) {
    const row = vr[r] || [];
    const name   = (row[idxName]  || '').toString().trim();
    const model  = (row[idxModel] || '').toString().trim();
    const unit   = idxUnit  >= 0 ? (row[idxUnit]  || '').toString().trim() : '';
    const price  = idxPrice >= 0 ? parseKRNumber_(row[idxPrice]) : 0;   // 시트 납품가 값
    const list   = idxList  >= 0 ? parseKRNumber_(row[idxList])  : 0;   // 출고가
    const capRaw = idxCap   >= 0 ? row[idxCap] : '';
    const spec   = idxSpec  >= 0 ? String(row[idxSpec] || '').trim() : '';
    const fixDc  = idxFixDc >= 0 ? String(row[idxFixDc] || '').trim() : '';
    const note   = idxNote  >= 0 ? String(row[idxNote]  || '').trim() : '';
    const maxIn  = idxMaxIn >= 0 ? parseKRNumber_(row[idxMaxIn]) : 0;

    if (!name || !model) continue;
    if (isBlockedByNote_(note)) continue;

    const priceFormula = (idxPrice >= 0 && fr[r] && fr[r][idxPrice]) ? String(fr[r][idxPrice]) : '';
    const useK2 = /\$L\$2/i.test(priceFormula);
    const cap = parseKRFloat_(capRaw);
    const cls = classifyHome_(name);
    const disp = cls.disp ? cls.disp : sanitizeDisp_(name);

    // 로그
    Logger.log('>> 🔎 HM row=%s model=%s useK2=%s list=%s price=%s fixDC=%s f=%s',
               r+1, model, useK2, list, price, fixDc, priceFormula ? priceFormula.slice(0,80)+'...' : '');

    out.push({
      name, model, unit, price,
      list,
      formula: priceFormula,
      useK2,
      capacity: cap,
      spec,
      catL: cls.catL, catM: cls.catM, catS: cls.catS,
      disp: disp,
      '고정DC': fixDc,
      note,
      maxIndoor: maxIn
    });
  }

  cachePutJSON_(k, out, 60 * 10);
  return out;
}

// 싱글 세트 분류
function classifySingleSetLM_(s) {
  const t = String((s?.name||'') + ' ' + (s?.model||'')).toLowerCase();
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

// 헤더 인덱스 찾기 공백 무시
function findHeaderIndex_(headers, key){
  // 헤더 정규화
  const norm = s => String(s||'').replace(/\s+/g,'').trim();
  const target = norm(key);
  for (let i=0;i<headers.length;i++){
    if (norm(headers[i]) === target) return i;
  }
  return -1;
}

// 싱글 세트
function getSingleSets() {
  const k = 'SS_FIX_V16';

  const hit = cacheGetJSON_(k);
  if (hit) return hit;

  const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName(SINGLE_NAME);
  if (!sh) return [];

  const vr = sh.getDataRange().getDisplayValues();
  const fr = sh.getDataRange().getFormulas();
  if (!vr.length) return [];

  // 헤더 행 탐색
  let hdrRow = 0;
  for (let i = 0; i < Math.min(vr.length, 20); i++) {
    const row = vr[i].map(v => String(v || '').trim());
    const rowNoSpace = row.map(v => v.replace(/\s+/g, ''));
    if (rowNoSpace.includes('모델명') && rowNoSpace.includes('납품가') && rowNoSpace.includes('품명')) { hdrRow = i; break; }
  }
  if (hdrRow === 0) hdrRow = 2;

  const Hraw = vr[hdrRow].map(v => String(v || '').trim());
  const H = Hraw.map(v => v.replace(/\s+/g, ''));
  const idxName  = findIdx_(H, ['품명', '품']);
  const idxSize  = H.indexOf('평형');
  const idxModel = H.indexOf('모델명');
  const idxUnit  = H.indexOf('단위');
  const idxNote  = H.indexOf('비고');
  const idxList  = H.indexOf('출고가');
  const idxPrices= H.map((v,i)=>v==='납품가'?i:-1).filter(i=>i>=0);
  const idxPL    = idxPrices.length? idxPrices[0] : (H.indexOf('납품가')>-1 ? H.indexOf('납품가'):6);
  const idxPR    = idxPrices.length? idxPrices[idxPrices.length-1] : (idxPL+1);

  const out = [];
  for (let r = hdrRow + 1; r < vr.length; r++) {
    const row = vr[r];

    // 원본 시트 열에서 읽기
    const name0  = (row[idxName]  || '').toString().trim();   // 원본 품명
    const name   = sanitizeDisp_(name0);
    const size0  = (row[idxSize]  || '').toString().trim();
    const size   = normalizeSize_(size0);
    const model  = (row[idxModel] || '').toString().trim();
    const unit   = (row[idxUnit]  || '').toString().trim() || 'SET';
    const note   = idxNote >= 0 ? String(row[idxNote] || '').trim() : '';
    const priceLeft  = parseKRNumber_(row[idxPL]);
    const priceRight = parseKRNumber_(row[idxPR]);

    let listPrice = 0;
    if (idxList >= 0) {
      listPrice = parseKRNumber_(row[idxList]);
    }

    if (!name || !model) continue;
    if (isBlockedByNote_(note)) continue;

    const sheetRow = r + 1;
    let matKey = 'D4';
    const fH = (fr[r] && fr[r][idxPR]) || '';
    if (/\$D\$7/.test(fH)) matKey = 'D7';
    else if (/\$D\$8/.test(fH)) matKey = 'D8';

    const cls = classifySingleSetLM_({ name, model });
    const sizeText = size ? size : '';

    // 원본 납품가 확정
    const priceRaw = Number(priceRight) || 0;
    const price    = priceRaw;
    Logger.log('>> 📦 싱글 원본 납품가 확정 ' + model + ' ' + price);

    // 원본 품명 보존
    const nameRaw = String(name0 || '');

    if (isBlockedByNote_(note)) continue;

    // 결과 푸시
    out.push({
      id: name + '|' + size + '|' + sheetRow,
      name: sanitizeDisp_(name0),
      nameRaw: nameRaw,
      size,
      sizeText,
      model,
      unit,
      row: sheetRow,
      priceRight: priceRight,
      priceRaw: priceRaw,
      price: price,
      list: listPrice,
      matKey,
      catL: cls.L,
      catM: cls.M,
      note
    });
  }

  cachePutJSON_(k, out, 60 * 10);
  return out;
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

// 싱글 구성품
function getSingleParts() {
  const k = 'SP_FIX_V14'; // 캐시 키 갱신
  const hit = cacheGetJSON_(k);
  if (hit) return hit;

  const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName(SINGLE_PARTS_NAME);
  if (!sh) return [];

  const rng = sh.getDataRange();
  const vr = rng.getDisplayValues();
  if (!vr.length) return [];

  const Hraw = (vr[1]||[]).map(v => String(v || '').trim());
  const H = Hraw.map(v => v.replace(/\s+/g, ''));
  
  const idxSetName  = findIdx_(H, ['품명','품']);
  const idxModel    = findIdx_(H, ['모델명','모델','품목코드','기종']);
  const idxKind     = findIdx_(H, ['구분']);
  const idxUnit     = findIdx_(H, ['단위']);
  
  const idxPrices   = H.map((v,i)=>v==='납품가'?i:-1).filter(i=>i>=0);
  const idxPrice    = idxPrices.length ? idxPrices[idxPrices.length - 1] : -1;
  
  const idxList     = H.indexOf('출고가');

  const idxSetModel = findIdx_(H, ['세트']);
  const idxFeat     = findIdx_(H, ['구성품특징','특징']);
  const idxSpec     = findIdx_(H, ['규격']);

  const out = [];
  for (let r = 2; r < vr.length; r++) {
    const row      = vr[r] || [];
    const setModel = (row[idxSetModel]||'').toString().trim();
    if (!setModel) continue;

    const nameRaw  = (row[idxSetName] || '').toString().trim();
    const name     = sanitizeDisp_(nameRaw);
    const model    = (row[idxModel]   || '').toString().trim();
    const kind     = (row[idxKind]    || '').toString().trim();
    const unit     = (row[idxUnit]    || '').toString().trim() || 'EA';
    
    // 납품가 및 출고가 파싱
    const price    = idxPrice >= 0 ? parseKRNumber_(row[idxPrice]) : 0;
    const listPrice = idxList >= 0 ? parseKRNumber_(row[idxList]) : 0;

    const feat     = (row[idxFeat]    || '').toString().trim();
    const spec     = idxSpec >= 0 ? (row[idxSpec]||'').toString().trim() : '';

    if (!name || !model) continue;

    const isDefault = /기본/.test(feat||'');

    out.push({
      setKey: '',
      linkRows: [],
      setModel, 
      kind, 
      model, 
      unit, 
      price, 
      list: listPrice, // 출고가 데이터 추가
      name, 
      feat, 
      isDefault, 
      spec
    });
  }

  cachePutJSON_(k, out, 60 * 10);
  return out;
}

// 자재가
function getSingleMatPrices() {
  const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName('싱글 자재가격');
  if (!sh) return {};
  const last = sh.getLastRow();
  const vals = sh.getRange(2, 1, Math.max(0,last-1), 2).getDisplayValues();
  const map = {};
  vals.forEach(([name, price]) => { const key = String(name || '').trim(); if (!key) return; map[key] = parseKRNumber_(price); });
  return map;
}

// 상업 분류기
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
    {re:/프\s*라임|프라임/i, m:'프라임'},
    {re:/고효율.*한랭지/i,     m:'고효율한랭지'},
    {re:/표준형/i,             m:'표준형'},
    {re:/ECO.*냉난방/i,        m:'ECO 냉난방'},
    {re:/ECO.*냉방전용/i,      m:'ECO 냉방전용'},
    {re:/리뉴얼/i,             m:'ECO 리뉴얼'},
    {re:/냉방전용/i,           m:'냉방전용'}
  ];

  // 실내기 중분류 키워드
  const inKeys = [
    {re:/\b1\s*-?\s*Way\b|1WAY/i, m: ( /WIFI/i.test(n) ? '1-Way WIFI내장' : /인피니트/i.test(n) ? '1-Way 인피니트' : '1WAY 미내장' )},
    {re:/\b2\s*Way\b|2Way/i,     m:'2Way'},
    {re:/\b4\s*-?\s*Way\b|4Way/i,m: ( /UV-?C/i.test(n)&&/WIFI/i.test(n) ? '4-Way UV-C WIFI내장'
                                     : /MINI/i.test(n)&&/WIFI/i.test(n) ? 'MINI 4WAY WIFI내장'
                                     : /WIFI/i.test(n) ? '4-Way WIFI내장'
                                     : /MINI/i.test(n) ? 'MINI 4WAY 미내장'
                                     : '4WAY 미내장')},
    {re:/360\s*CST|360CST/i,     m: ( /WIFI/i.test(n) ? '360CST WIFI내장' : '360CST 미내장' )},
    {re:/벽걸이/i,               m:'벽걸이'},
    {re:/스탠드|PAC/i,           m:'스탠드형(PAC)'},
    {re:/실링/i,                 m:'실링'},
    {re:/DUCT/i,                 m:'DUCT'},
    {re:/전열\s*교환기/i,        m:'전열교환기'}
  ];

  // 실외기 우선 탐지
  for (const k of outKeys) if (k.re.test(n)) { catL='실외기'; catM=k.m; break; }
  // 실내기 탐지
  if (!catM) for (const k of inKeys) if (k.re.test(n)) { catL='실내기'; catM=k.m; break; }

  // L 보정
  if (!catL) {
    if (isOutdoorByModel || /실외기/i.test(n) || /DVM\s*(S2|ECO)/i.test(n)) catL='실외기';
    else if (isIndoorByModel || /실내기/i.test(n)) catL='실내기';
  }

  // 소분류
  if (catM==='1-Way WIFI내장' || catM==='1-Way 인피니트' || catM==='1WAY 미내장') {
    if (/소형/i.test(n)) catS='소형';
    else if (/대형/i.test(n)) catS='대형';
    else catS='중형';
  }
  if (catM==='DUCT') {
    if (/저정압.*SLIM/i.test(n)) catS='저정압 SLIM';
    else if (/중정압/i.test(n))   catS='중정압';
    else if (/고정압/i.test(n))   catS='고정압';
  }
  if (catM==='전열교환기') {
    if (/상업용/i.test(n)) catS='상업용';
    else if (/주택용/i.test(n)) catS='주택용';
  }
  if (catL === '실외기' && /^ECO/i.test(catM || '')) {
    if (/단상형/i.test(n))            catS = '단상형';
    else if (/삼상형/i.test(n))       catS = '삼상형';
    else if (/상부\s*토출형|상부토출형/i.test(n)) catS = '상부토출형';
  }

  // 판넬
  if (!catL && /판넬|패널|panel/i.test(n)) catL='판넬';

  // 나머지
  if (!catL) catL='부자재';

  return { catL, catM, catS };
}

/* 상업멀티 데이터 */
function getCommercialMulti() {
  const k = 'CM_FIX_V9';
  const hit = cacheGetJSON_(k);
  if (hit) return hit;

  const ss = SpreadsheetApp.openById(SRC_SHEET_ID);
  const sh = ss.getSheetByName(COMM_NAME);
  if (!sh) return [];

  const rng = sh.getDataRange();
  const vr  = rng.getDisplayValues();
  const fr  = rng.getFormulas();
  if (!vr.length) return [];

  // 헤더 탐색
  let hdrRow = -1;
  for (let i = 0; i < Math.min(vr.length, 10); i++) {
    const row = (vr[i] || []).map(v => String(v || '').trim());
    const H = row.map(v => v.replace(/\s+/g, ''));
    const ok = H.includes('모델명') && H.includes('납품가') && (H.includes('품명') || H.includes('품') || H.includes('품목'));
    if (ok) { hdrRow = i; break; }
  }
  if (hdrRow < 0) hdrRow = 3;

  const Hraw = (vr[hdrRow] || []).map(v => String(v || '').trim());
  const H = Hraw.map(v => v.replace(/\s+/g, ''));

  // 컬럼 인덱스
  const idxName   = findIdx_(H, ['품명','품','품목','항목']);
  const idxModel  = findIdx_(H, ['모델명','모델','품목코드','기종']);
  const idxUnit   = findIdx_(H, ['단위']);
  
  const idxPrices = H.map((v,i)=>v==='납품가'?i:-1).filter(i=>i>=0);
  const idxPrice  = idxPrices.length ? idxPrices[idxPrices.length - 1] : -1;
  
  // 출고가
  const idxList   = findIdx_(H, ['출고가','LIST','리스트','정가','소비자가']);
  
  const idxFixDc  = findIdx_(H, ['고정DC']);
  const idxSpec   = findIdx_(H, ['규격']);
  const idxCap    = findIdx_(H, ['용량','용량(kW)','용량kW']);
  const idxCatL   = findIdx_(H, ['대분류']);
  const idxNote   = findIdx_(H, ['비고']);
  const idxMaxIn  = findIdx_(H, ['최대 연결 실내기 대수']);

  const out = [];
  for (let r = hdrRow + 1; r < vr.length; r++) {
    const row   = vr[r] || [];
    const name  = (row[idxName]   || '').toString().trim();
    const model = (row[idxModel]  || '').toString().trim();
    const unit  = idxUnit  >= 0 ? (row[idxUnit]   || '').toString().trim() : '';
    
    const price = idxPrice >= 0 ? parseKRNumber_(row[idxPrice]) : 0;
    const list  = idxList  >= 0 ? parseKRNumber_(row[idxList])  : 0; // 출고가
    
    const spec  = idxSpec  >= 0 ? String(row[idxSpec]  || '').trim() : '';
    const fixDc = idxFixDc >= 0 ? String(row[idxFixDc] || '').trim() : '';
    const note  = idxNote  >= 0 ? String(row[idxNote]  || '').trim() : '';
    const maxIn = idxMaxIn >= 0 ? parseKRNumber_(row[idxMaxIn]) : 0;

    const capRaw = idxCap >= 0 ? row[idxCap] : '';
    const cap    = parseKRFloat_(capRaw);

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
      list, // 출고가 저장
      formula: priceFormula,
      useK2,
      capacity: cap,
      spec,
      catL, catM, catS,
      disp: sanitizeDisp_(name),
      '고정DC': fixDc,
      note,
      maxIndoor: maxIn
    });
  }

  cachePutJSON_(k, out, 60 * 10);
  return out;
}

/* 상업멀티 구성품 */
function getCommercialParts() {
  const k = 'CP_FIX_V9';
  const hit = cacheGetJSON_(k);
  if (hit) return hit;

  const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName(COMM_PARTS_NAME);
  if (!sh) return [];

  const rng = sh.getDataRange();
  const vr  = rng.getDisplayValues();
  if (!vr.length) return [];

  // 헤더 탐색
  let hdrRow = -1;
  for (let i = 0; i < Math.min(vr.length, 10); i++) {
    const row = (vr[i] || []).map(v => String(v || '').trim());
    const H   = row.map(v => v.replace(/\s+/g, ''));
    if (H.includes('세트') && H.includes('모델명')) { hdrRow = i; break; }
  }
  if (hdrRow < 0) hdrRow = 0;

  const Hraw = (vr[hdrRow] || []).map(v => String(v || '').trim());
  const H    = Hraw.map(v => v.replace(/\s+/g, ''));

  const idxSetName  = findIdx_(H, ['품명','품']);
  const idxModel    = findIdx_(H, ['모델명','모델','품목코드','기종']);
  const idxKind     = findIdx_(H, ['구분']);
  const idxUnit     = findIdx_(H, ['단위']);
  const idxSetModel = findIdx_(H, ['세트']);
  const idxSpec     = findIdx_(H, ['규격','비고']);
  
  const idxList     = findIdx_(H, ['출고가']);
  const idxPrice    = findIdx_(H, ['납품가']);
  const idxQty      = findIdx_(H, ['수량']);

  const start = hdrRow + 1;
  const out = [];

  for (let r = start; r < vr.length; r++) {
    const row      = vr[r] || [];
    const setModel = (row[idxSetModel] || '').toString().trim();

    const nameRaw = (row[idxSetName] || '').toString().trim();
    const name    = sanitizeDisp_(nameRaw);
    const model   = (row[idxModel]   || '').toString().trim();
    const kind    = (row[idxKind]    || '').toString().trim();
    const unit    = (row[idxUnit]    || '').toString().trim() || 'EA';
    const qty     = idxQty >= 0 ? (row[idxQty] || '').toString().trim() : '1';

    const listVal  = idxList  >= 0 ? parseKRNumber_(row[idxList])  : 0; // 출고가
    const priceVal = idxPrice >= 0 ? parseKRNumber_(row[idxPrice]) : 0; // 납품가
    const basePrice = priceVal || listVal; // 납품가 우선, 없으면 출고가 (혹은 로직에 따라 조정)

    const spec = idxSpec >= 0 ? (row[idxSpec] || '').toString().trim() : '';

    if (!name || !model) continue;
    if (isBlockedByNote_(spec)) continue;

    const isDefault = /기본/.test(kind || '');

    out.push({
      refModel: setModel,
      setKey: setModel,
      setModel: setModel,
      model: model,
      unit: unit,
      price: basePrice,
      list: listVal,
      name: name,
      kind: kind,
      isDefault: isDefault,
      spec: spec,
      qty: qty
    });
  }

  Logger.log('>> 🧱 상업 구성 로드 V9 완료: %s 개', out.length);
  cachePutJSON_(k, out, 60 * 10);
  return out;
}

// 규격 맵
function getSpecMap_() {
  // 캐시 키 갱신
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
      const Hraw = (vr[i]||[]).map(v=>String(v||'').trim());
      const H = Hraw.map(v=>v.replace(/\s+/g,''));
      const iModel = findIdx_(H, ['모델명','모델','품목코드','기종']);
      const iSpec  = (sheetName === COMM_PARTS_NAME)
        ? findIdx_(H, ['비고','규격'])
        : findIdx_(H, ['규격']);
      if (iModel>=0 && iSpec>=0) { hdrRow=i; break; }
    }
    if (hdrRow<0) return;

    const Hraw = (vr[hdrRow]||[]).map(v=>String(v||'').trim());
    const H = Hraw.map(v=>v.replace(/\s+/g,''));
    const idxModel = findIdx_(H, ['모델명','모델','품목코드','기종']);
    const idxSpec  = (sheetName === COMM_PARTS_NAME)
      ? findIdx_(H, ['비고','규격'])
      : findIdx_(H, ['규격']);
    if (idxModel<0 || idxSpec<0) return;

    for (let r = hdrRow+1; r < vr.length; r++) {
      const row = vr[r]||[];
      const model = String(row[idxModel]||'').trim();
      const spec  = String(row[idxSpec] ||'').trim();
      if (!model) continue;
      if (spec && specMap[model]==null) specMap[model]=spec;
    }
  }

  sheets.forEach(scan);
  cachePutJSON_(key, specMap, 60*10);
  Logger.log('>> 🧭 규격맵 업데이트 V4 완료 항목 %s', Object.keys(specMap).length); // 로그
  return specMap;
}

function getSpecDetailMap_(){
  const key = 'SPEC_DETAIL_MAP_V10';
  const hit = cacheGetJSON_(key);
  if(hit) return hit;

  const ss = SpreadsheetApp.openById(SRC_SHEET_ID);
  const out = {};

  const normH = v => String(v||'').trim().replace(/\s+/g,'');
  const findHeaderRow = vr => {
    for(let i=0;i<Math.min(vr.length,10);i++){
      const H = (vr[i]||[]).map(normH);
      if(H.includes('모델명') || H.includes('모델') || H.includes('품목코드')) return i;
    }
    return -1;
  };
  const idx = (H, labels) => {
    for(const lb of labels){
      const i = H.indexOf(normH(lb));
      if(i>=0) return i;
    }
    return -1;
  };
  const findContains = (H, rx) => {
    for(let i=0;i<H.length;i++){
      if(rx.test(H[i])) return i;
    }
    return -1;
  };

  function scanHome(){
    const sh = ss.getSheetByName(HOME_NAME);
    if(!sh) return;

    const vr = sh.getDataRange().getDisplayValues();
    const hr = findHeaderRow(vr);
    if(hr<0) return;

    const Hraw = (vr[hr]||[]);
    const H = Hraw.map(normH);

    const iModel = idx(H, ['모델명','모델','품목코드','기종']);
    const iPipe  = idx(H, ['배관경']);

    // 냉방성능(정격) 중복 2개 처리
    const coolCols = [];
    H.forEach((h,i)=>{
      if(h===normH('냉방성능(정격)') || /냉방성능/.test(h)) coolCols.push(i);
    });

    let iCoolKw   = coolCols[0] ?? -1;
    let iCoolKcal = coolCols[1] ?? -1;

    // 혹시 순서가 뒤바뀐 시트도 대비
    const guessKcal = findContains(Hraw, /kcal/i);
    const guessKw   = findContains(Hraw, /kW/i);
    if(iCoolKcal<0 && guessKcal>=0) iCoolKcal = guessKcal;
    if(iCoolKw<0   && guessKw>=0)   iCoolKw   = guessKw;

    let iPowKw = idx(H, ['소비전력(정격)']);
    if(iPowKw<0) iPowKw = findContains(H, /소비전력/);

    let iEff = idx(H, ['에너지소비효율','에너지소비효율등급']);
    if(iEff<0) iEff = findContains(H, /에너지소비효율/);

    const iGas   = idx(H, ['냉매가스']);
    const iBrk   = idx(H, ['차단기']);
    const iLine  = idx(H, ['전원선']);
    const iSize  = idx(H, ['제품크기']);
    const iWeight = idx(H, ['제품중량']);
    const iPackSize = idx(H, ['포장치수']);
    const iPackWeight = idx(H, ['포장중량']);
    const iMaxPipe = idx(H, ['최대장배관','최대 장배관']);
    const iMaxDrop = idx(H, ['최대고저차','최대 고저차']);

    for(let r=hr+1;r<vr.length;r++){
      const row = vr[r]||[];
      const model = String(row[iModel]||'').trim();
      if(!model) continue;

      if(!out[model]) out[model]={};

      const spec = {
        pipeDia: row[iPipe]||'',
        gas: row[iGas]||'',
        breaker: row[iBrk]||'',
        powerLine: row[iLine]||'',
        size: row[iSize]||'',
        weight: row[iWeight]||'',
        packSize: row[iPackSize]||'',
        packWeight: row[iPackWeight]||'',
        maxPipe: row[iMaxPipe]||'',
        maxDrop: row[iMaxDrop]||'',

        cool_kcal: row[iCoolKcal]||'',
        cool_kw: row[iCoolKw]||'',
        cool_power: row[iPowKw]||'',
        effGrade: row[iEff]||'',

        cool_cap_kcal: row[iCoolKcal]||'',
        cool_cap_kw: row[iCoolKw]||'',
        cool_pow_kw: row[iPowKw]||'',
        grade: row[iEff]||''
      };

      out[model].home = spec;
    }

    Logger.log('>> 🧊 홈멀티 인덱스 iCoolKw=%s iCoolKcal=%s iPowKw=%s iEff=%s coolCols=%s',
              iCoolKw, iCoolKcal, iPowKw, iEff, JSON.stringify(coolCols));
  }

  function scanSingle(){
    const sh = ss.getSheetByName(SINGLE_NAME);
    if(!sh) return;

    const vr = sh.getDataRange().getDisplayValues();
    const hr = findHeaderRow(vr);
    if(hr<0) return;

    const H = (vr[hr]||[]).map(normH);

    const iModel = idx(H, ['모델명','모델','품목코드','기종']);
    const iGrade = idx(H, ['등급(냉방/난방)','등급 (냉방/난방)']);
    const iPipe  = idx(H, ['배관경']);
    const iPowKw = idx(H, ['소비전력(kW)(최소/정격/최대)','소비전력(kW) (최소 / 정격 / 최대)']);
    const iCapKw = idx(H, ['성능(kW)(최소/정격/최대)','성능(kW) (최소 / 정격 / 최대)']);
    const iCapKcal = idx(H, ['성능(kcal/h)(최소/정격/최대)','성능(kcal/h) (최소 / 정격 / 최대)']);
    const iPowerBrk = idx(H, ['전원(mm²)/차단(A)','전원(mm²) / 차단(A)']);
    const iInSize = idx(H, ['실내기크기(mm)','실내기 크기(mm)']);
    const iOutSize= idx(H, ['실외기크기(mm)','실외기 크기(mm)']);
    const iInWeight = idx(H, ['실내기중량(kg)', '실내기 중량(kg)']);
    const iOutWeight = idx(H, ['실외기중량(kg)', '실외기 중량(kg)']);
    const iInPackSize = idx(H, ['실내기포장(mm)', '실내기 포장(mm)']);
    const iOutPackSize = idx(H, ['실외기포장(mm)', '실외기 포장(mm)']);
    const iInPackWeight = idx(H, ['실내기포장중량(kg)', '실내기 포장중량(kg)']);
    const iOutPackWeight = idx(H, ['실외기포장중량(kg)', '실외기 포장중량(kg)']);
    const iPipeDrop = idx(H, ['배관길이/고낙차(m)','배관길이 / 고낙차(m)']);
    const iGas   = idx(H, ['냉매가스']);

    const splitBar = v => {
      const s = String(v||'');
      const [a,b] = s.split('|').map(x=>x.trim());
      return {cool:a||'', heat:b||''};
    };
    const splitSlash = v => {
      const s = String(v||'');
      const [a,b] = s.split('/').map(x=>x.trim());
      return {a:a||'', b:b||''};
    };

    for(let r=hr+1;r<vr.length;r++){
      const row = vr[r]||[];
      const model = String(row[iModel]||'').trim();
      if(!model) continue;

      const pow = splitBar(row[iPowKw]);
      const capKw = splitBar(row[iCapKw]);
      const capKcal = splitBar(row[iCapKcal]);
      const pb = splitSlash(row[iPowerBrk]);
      const pd = splitSlash(row[iPipeDrop]);

      if(!out[model]) out[model]={};
      out[model].single = {
        grade: row[iGrade]||'',
        pipeDia: row[iPipe]||'',
        cool_pow_kw: pow.cool,
        heat_pow_kw: pow.heat,
        cool_cap_kw: capKw.cool,
        heat_cap_kw: capKw.heat,
        cool_cap_kcal: capKcal.cool,
        heat_cap_kcal: capKcal.heat,
        powerLine: pb.a,
        breaker: pb.b,
        inSize: row[iInSize]||'',
        outSize: row[iOutSize]||'',
        inWeight: row[iInWeight]||'',
        outWeight: row[iOutWeight]||'',
        inPackSize: row[iInPackSize]||'',
        outPackSize: row[iOutPackSize]||'',
        inPackWeight: row[iInPackWeight]||'',
        outPackWeight: row[iOutPackWeight]||'',
        pipeLen: pd.a,
        drop: pd.b,
        gas: row[iGas]||''
      };
    }
  }

  function scanComm(){
    const sh = ss.getSheetByName(COMM_NAME);
    if(!sh) return;

    const vr = sh.getDataRange().getDisplayValues();
    const hr = findHeaderRow(vr);
    if(hr<0) return;

    const Hraw = vr[hr] || [];
    const H = Hraw.map(normH);

    const iModel = idx(H, ['모델명','모델','품목코드','기종']);
    const iPipe  = idx(H, ['배관경']);
    const iGas   = idx(H, ['냉매가스']);
    const iBrk   = idx(H, ['차단기']);
    const iLine  = idx(H, ['전원선']);
    const iSize  = idx(H, ['제품크기']);
    const iWeight = idx(H, ['제품중량']);
    const iPackSize = idx(H, ['포장치수']);
    const iPackWeight = idx(H, ['포장중량']);
    const iEff   = idx(H, ['소비효율등급','에너지소비효율등급']);
    const iMaxPipe = idx(H, ['최대장배관','최대 장배관','배관길이']);
    const iMaxDrop = idx(H, ['최대고저차','최대 고저차','고낙차']);

    const groups = [];
    let cur = null;

    const iDuct = (() => {
      let i = idx(H, ['덕트구경','덕트 구경']);
      if(i < 0){
        for(let k=0;k<Hraw.length;k++){
          if(/덕트\s*구경/i.test(String(Hraw[k]||''))) return k;
        }
      }
      return i;
    })();

    for(let i=0;i<Hraw.length;i++){
      const h = String(Hraw[i]||'');
      let type = null;
      if(/냉방\s*성능/.test(h)) type = 'coolCap';
      else if(/난방\s*성능/.test(h)) type = 'heatCap';
      else if(/소비\s*전력/.test(h)) type = 'power';

      if(type){
        if(!cur || cur.type !== type){
          cur = { type:type, cols:[] };
          groups.push(cur);
        }
        cur.cols.push(i);
      }else{
        cur = null;
      }
    }

    const coolCapCols = groups[0]?.cols || [];
    const coolPowCols = groups[1]?.cols || [];
    const heatCapCols = groups[2]?.cols || [];
    const heatPowCols = groups[3]?.cols || [];

    const joinCols = (row, cols) =>
      cols.map(i=>String(row[i]||'').trim()).filter(Boolean).join(' / ');

    const subRow = vr[hr+1] || [];
    const hasTurboStrongWeak = coolCapCols.concat(coolPowCols, heatCapCols, heatPowCols)
      .some(i => /터보|강|약/.test(String(subRow[i]||'')));

    const isErvLayout3 =
      hasTurboStrongWeak &&
      coolCapCols.length===3 &&
      coolPowCols.length===3 &&
      heatCapCols.length===3 &&
      heatPowCols.length===3;

    const isErvLayout2 =
      !hasTurboStrongWeak &&
      coolCapCols.length===2 &&
      coolPowCols.length===1 &&
      heatCapCols.length===2 &&
      heatPowCols.length===1;

    const isErvLayout = isErvLayout3 || isErvLayout2;

    const coolCols = [];
    const heatCols = [];
    const powCols  = [];
    Hraw.forEach((h,i)=>{
      const t = String(h||'');
      if(/냉방\s*성능/.test(t)) coolCols.push(i);
      if(/난방\s*성능/.test(t)) heatCols.push(i);
      if(/소비\s*전력/.test(t)) powCols.push(i);
    });

    const iCoolKcal = coolCols[0] ?? -1;
    const iCoolKw   = (coolCols.length>=2) ? coolCols[1] : (iCoolKcal>=0 ? iCoolKcal+1 : -1);
    const iHeatKcal = heatCols[0] ?? -1;
    const iHeatKw   = (heatCols.length>=2) ? heatCols[1] : (iHeatKcal>=0 ? iHeatKcal+1 : -1);

    const iPowCool  = powCols[0] ?? -1;
    const iPowHeat  = (powCols.length>=2) ? powCols[powCols.length-1] : (iPowCool>=0 ? iPowCool+1 : -1);

    for(let r=hr+1;r<vr.length;r++){
      const row = vr[r]||[];
      const model = String(row[iModel]||'').trim();
      if(!model) continue;

      if(!out[model]) out[model]={};

      if(isErvLayout){
        out[model].comm = {
          gas: row[iDuct] || '',
          cool_kcal:   joinCols(row, coolCapCols),
          cool_power:  joinCols(row, coolPowCols),
          heat_kcal:   joinCols(row, heatCapCols),
          heat_power:  joinCols(row, heatPowCols),
          pipeDia: '',
          cool_kw: '',
          heat_kw: '',
          cool_cap_kcal: '',
          cool_cap_kw: '',
          heat_cap_kcal: '',
          heat_cap_kw: '',
          cool_pow_kw: '',
          heat_pow_kw: '',
          breaker: row[iBrk]||'',
          powerLine: row[iLine]||'',
          size: row[iSize]||'',
          weight: row[iWeight]||'',
          packSize: row[iPackSize]||'',
          packWeight: row[iPackWeight]||'',
          grade: row[iEff]||'',
          maxPipe: row[iMaxPipe]||'',
          maxDrop: row[iMaxDrop]||''
        };
        continue;
      }

      out[model].comm = {
        pipeDia: row[iPipe]||'',
        gas: row[iGas]||'',
        cool_cap_kcal: row[iCoolKcal]||'',
        cool_cap_kw: row[iCoolKw]||'',
        heat_cap_kcal: row[iHeatKcal]||'',
        heat_cap_kw: row[iHeatKw]||'',
        cool_pow_kw: row[iPowCool]||'',
        heat_pow_kw: row[iPowHeat]||'',
        breaker: row[iBrk]||'',
        powerLine: row[iLine]||'',
        size: row[iSize]||'',
        weight: row[iWeight]||'',
        packSize: row[iPackSize]||'',
        packWeight: row[iPackWeight]||'',
        grade: row[iEff]||'',
        maxPipe: row[iMaxPipe]||'',
        maxDrop: row[iMaxDrop]||''
      };
    }

    Logger.log('>> 🔥 상업멀티 ERV=%s coolCols=%s heatCols=%s powCols=%s groups=%s',
      isErvLayout, JSON.stringify(coolCols), JSON.stringify(heatCols), JSON.stringify(powCols), JSON.stringify(groups.map(g=>g.cols)));
  }

  scanHome();
  scanSingle();
  scanComm();

  cachePutJSON_(key, out, 60*10);
  Logger.log('>> 📌 스펙상세맵 생성 완료 count=%s', Object.keys(out).length);
  return out;
}

// 홈 기본값
function getHomeDefaults() {
  const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName(HOME_NAME);
  const H = sh.getRange(1, 1, 2, 24).getDisplayValues();
  const nameRow = H[0].map(v => String(v || '').trim());
  const valRow  = H[1].map(v => String(v || '').trim());

  const pick = (label, def) => {
    const i = nameRow.indexOf(label); if (i < 0) return def;
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
    '판넬변경': String(pick('판넬변경', ''))
  };
}

// 싱글 기본값
function getSingleDefaults() {
  const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName(SINGLE_NAME);
  const H = sh.getRange(1, 1, 2, 24).getDisplayValues();
  const nameRow = H[0].map(v => String(v || '').trim());
  const valRow  = H[1].map(v => String(v || '').trim());

  const pick = (label, def) => {
    const i = nameRow.indexOf(label); if (i < 0) return def;
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
    '자재 포함 여부': String(pick('자재 포함 여부', '별도'))
  };
}

// 거래처조회
function getCustomerDataAsync(forceRefresh) { 
  if (forceRefresh) {
    cacheRemoveJSON_('CUS_V6');
  }
  const raw = getCustomers_(); 
  return raw.map(c => ({ code: c.code, name: c.name, rep: c.rep, tel: c.tel, addr: c.addr, group: c.group, note: c.note })); 
}

// 거래처 목록
function getCustomers_() {
  const key = 'CUS_V6';
  const hit = cacheGetJSON_(key);
  if (hit) return hit;

  const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName(CUSTOMERS_NAME);
  if (!sh) return [];
  const vr = sh.getDataRange().getDisplayValues();
  if (!vr.length) return [];

  const H = vr[0].map(v => String(v||'').trim());
  const idx = n => H.indexOf(n);
  const idxCode   = idx('거래처코드');
  const idxMgr    = idx('담당자명');
  const idxName   = idx('거래처명');
  const idxRep    = idx('대표자명');
  const idxAddr   = idx('주소');
  const idxTel    = idx('전화번호');
  const idxSpec   = idx('특이사항');
  const idxGroup  = idx('그룹');
  const idxDisc   = idx('싱글 할인');
  const idxBiz    = idx('사업자등록번호');
  const idxMgrTel = idx('담당자연락처');

  const out = [];
  for (let r=1; r<vr.length; r++){
    const row = vr[r] || [];
    const code = String(row[idxCode]||'').trim();
    const name = String(row[idxName]||'').trim();
    const biz  = idxBiz>=0 ? String(row[idxBiz]||'').replace(/[^\d]/g,'') : '';
    if (!code && !biz) continue;
    out.push({
      code,
      name,
      bizno: biz,
      manager: String(row[idxMgr]||'').trim(),
      managerTel: idxMgrTel>=0 ? String(row[idxMgrTel]||'').trim() : '',
      rep: String(row[idxRep]||'').trim(),
      addr: String(row[idxAddr]||'').trim(),
      tel: String(row[idxTel]||'').trim(),
      note: String(row[idxSpec]||'').trim(),
      group: String(row[idxGroup]||'').trim(),
      singleDiscount: parseKRNumber_(row[idxDisc])
    });
  }

  cachePutJSON_(key, out, 60*10);
  return out;
}

// 거래처 검색
function searchCustomerByBizOrCode(input){
  const n = String(input||'').replace(/[^\d]/g,'');
  const c = String(input||'').trim();
  const list = getCustomers_();

  if (n){
    const f1 = list.find(x=>x.bizno && x.bizno===n);
    if (f1) return f1;
    const f2 = list.find(x=> String(x.code||'').replace(/[^\d]/g,'') === n );
    if (f2) return f2;
  }
  if (c){
    const f3 = list.find(x=> x.code === c);
    if (f3) return f3;
  }
  return null;
}

// 담당자 시트 로드
function getManagers_(){
  const key = 'MGR_V1';
  const hit = cacheGetJSON_(key);
  if (hit) return hit;

  const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName(MANAGERS_NAME);
  if (!sh) return [];
  const vr = sh.getDataRange().getDisplayValues();
  if (vr.length < 2) return [];

  const H = (vr[0]||[]).map(v=>String(v||'').trim());
  const iName = H.indexOf('담당자명');
  const iCode = H.indexOf('담당자코드');
  if (iName < 0 || iCode < 0) return [];

  const out = [];
  for (let r = 1; r < vr.length; r++){
    const row = vr[r] || [];
    const name = String(row[iName]||'').trim();
    const code = String(row[iCode]||'').trim();
    if (!name || !code) continue;
    out.push({
      '담당자명': name,
      '담당자코드': code,
      manager: name,
      empCd: code
    });
  }
  cachePutJSON_(key, out, 60*10);
  return out;
}

// 담당자 서치
function searchManagersByName_(query){
  const q = String(query||'').trim().toLowerCase().replace(/\s+/g,'');
  if (!q) return [];
  const list = getManagers_();
  return list.filter(r => String(r['담당자명']||'').toLowerCase().replace(/\s+/g,'').includes(q));
}

// 담당자 정확 일치
function findManagerByNameExact_(name){
  const n = String(name||'').trim().toLowerCase().replace(/\s+/g,'');
  if (!n) return null;
  const list = getManagers_();
  const f = list.find(r => String(r['담당자명']||'').toLowerCase().replace(/\s+/g,'') === n);
  return f ? { name: f['담당자명'], empCd: f['담당자코드'] } : null;
}

// 이카운트 인증
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

// 존조회
function callZoneApi(comCode){
  Logger.log('🌐 조회시작');
  const res = UrlFetchApp.fetch('http://152.69.228.109:3000/proxy/ecount/zone',{
    method:'post', contentType:'application/json',
    payload:JSON.stringify({COM_CODE:comCode}), muteHttpExceptions:true
  });
  if (res.getResponseCode()!==200) throw new Error('조회실패');
  const zone = (JSON.parse(res.getContentText())||{}).Data?.ZONE;
  if (!zone) throw new Error('값없음');
  return zone;
}

// 로그인
function getEcountSession(authInfo){
  Logger.log('🔑 세션생성');
  const creds = getScriptCreds_();
  const COM_CODE = creds.COM_CODE;
  const USER_ID = (authInfo && authInfo.ecountId) ? authInfo.ecountId : creds.USER_ID;
  const API_CERT_KEY = (authInfo && authInfo.ecountApi) ? authInfo.ecountApi : creds.API_CERT_KEY;

  if (!COM_CODE||!USER_ID||!API_CERT_KEY) throw new Error('정보누락');

  const key = 'ECOUNT_SESSION_' + COM_CODE + '_' + USER_ID;
  const cache = CacheService.getScriptCache();
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  const zoneRaw = callZoneApi(COM_CODE);
  const zone = String(zoneRaw).toLowerCase();

  const res = UrlFetchApp.fetch('http://152.69.228.109:3000/proxy/ecount/login',{
    method:'post', contentType:'application/json',
    payload:JSON.stringify({COM_CODE,USER_ID,API_CERT_KEY,LAN_TYPE:'ko-KR',ZONE:zoneRaw}),
    muteHttpExceptions:true
  });
  
  if (res.getResponseCode()!==200) throw new Error('로그인실패');
  
  const body = JSON.parse(res.getContentText());
  const sessionId = body?.Data?.Datas?.SESSION_ID;
  
  if (!sessionId) throw new Error('발급실패');
  
  cache.put(key, JSON.stringify({sessionId, zone}), 3000);
  return { sessionId, zone };
}

function getRecommendOduData() { 
  // 시트
  var sheet = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName("추천실외기");
  if(!sheet) return { comm: [], home: [], homeEx: [] };
  
  // 행
  var lastRow = sheet.getLastRow();
  if(lastRow < 3) return { comm: [], home: [], homeEx: [] };
  
  // 범위
  var data = sheet.getRange("A3:E" + lastRow).getValues();
  
  // 배열
  var comm = [];
  var home = [];
  var homeEx = [];
  
  // 반복
  for(var i = 0; i < data.length; i++) {
     if(data[i][0] !== "") comm.push({ cap: Number(data[i][0]), hp: data[i][1] });
     if(data[i][2] !== "") home.push({ cap: Number(data[i][2]), hp: data[i][4] });
     if(data[i][3] !== "") homeEx.push({ cap: Number(data[i][3]), hp: data[i][4] });
  }
  
  // 반환
  return { comm: comm, home: home, homeEx: homeEx };
}

// 창고 코드 결정
function decideWarehouseCode_(items){
  // 주석 간결
  if (!Array.isArray(items) || !items.length) return '00003';

  // 원본 품명 후보 추출
  function getOrigName_(it){
    if (!it) return '';
    var cand = it.nameRaw || it.rawName || it.nameOrig || it.name || it.pname || '';
    return String(cand || '');
  }

  function getSection_(it){
    return String(it.section || '').toUpperCase();
  }

  // 홈멀티: 인피니트
  var homeHit = items.some(function(it){
    if (getSection_(it) !== 'HOME') return false;
    var nm = getOrigName_(it);
    return /인피니트/.test(nm);
  });

  // 싱글 세트: 360, 1등급, 냉방전용, 1way, 덕트, 냉전, 비스포크, 벽걸이, 가정용 에어컨
  var singleHit = items.some(function(it){
    if (getSection_(it) !== 'SINGLE') return false;
    var nm = getOrigName_(it);
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

// 금액형 DC 축약
function formatWonDiscountLabel_(amt){
  const v = Math.round(Number(amt)||0);
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
function formatPercentLabel_(rate){
  const r = Number(rate);
  if (!isFinite(r)) return '';
  return `${Math.round(r * 100)}%`;
}

// 적요 조합: 기존 문자열에 새 문자열을 '/' 로 붙임
function combineRemarks_(base, extra){
  const a = String(base || '').trim();
  const b = String(extra || '').trim();
  if (!b) return a;
  if (!a) return b;
  return `${a} / ${b}`;
}

// 구형조회
function getOldProducts_() {
  const ss = SpreadsheetApp.openById(SRC_SHEET_ID);
  const sheet = ss.getSheetByName('구형');
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // A열~I열 데이터 및 수식 가져오기
  const range = sheet.getRange(2, 1, lastRow - 1, 9);
  const values = range.getValues();
  const formulas = range.getFormulas(); // 수식 가져오기 필수

  const result = [];

  for (var i = 0; i < values.length; i++) {
    const row = values[i];
    const form = formulas[i]; // 해당 행의 수식 배열
    
    if (!row[0]) continue;

    // F열(인덱스 5) 수식에 '$I$1'이 포함되어 있는지 검사
    var hasRef = false;
    if (form[5] && String(form[5]).indexOf('$I$1') > -1) {
      hasRef = true;
    }

    result.push({
      name: row[0],
      model: row[1],
      unit: row[2],
      price: row[3],       // D열: 출고가 (할인 기준액)
      sheetPrice: row[5],  // F열: 납품가 (할인 아닐 때 쓸 금액)
      isDisc: hasRef,      // $I$1 포함 여부
      remarks: row[7],
      spec: row[8]
    });
  }

  return result;
}

// 주문전송
function sendOrderFromUi(data) {
  try {
    let items = [];
    if (data && data.items) {
      items = (typeof data.items === 'string') ? JSON.parse(data.items) : data.items;
    }
    const order = data;
    const authInfo = order.auth || {}
    const safeNum = s => String(s || '').replace(/[^\d]/g, '');
    const kst = Session.getScriptTimeZone();
    const toYmd = (v) => v ? Utilities.formatDate(new Date(v), kst, 'yyyyMMdd') : Utilities.formatDate(new Date(), kst, 'yyyyMMdd');

    if (!Array.isArray(items) || items.length === 0) return { ok: false, error: '항목없음' };

    const cleaned = items.filter(it =>
      !(String(it.unit || '').toUpperCase() === 'SET' && it.section === 'SET' && it.sendAsSet !== true)
    );

    // 매핑
    const merged = cleaned.map((it, idx) => ({
      ...it,
      qty: Number(it.qty) || 0,
      _last: idx,
      REMARKS: String(it.remarks || it.REMARKS || '')
    }));

    let key = safeNum(order?.bizno || '');
    if (!key && order?.custCode) key = String(order.custCode).trim();
    const custRec = searchCustomerByBizOrCode(key);
    if (!custRec) return { ok: false, error: '미등록거래처' };
    const custFinal = custRec.code;
    
    const { sessionId, zone } = getEcountSession(authInfo);
    const ioDate = toYmd(order?.due || '');
    const timeDate = ioDate;
    
    // 거래처확인
    const isStar = String(custRec.name || '').trim().startsWith('*');
    let payMMDD = '';
    let notionPayDate = '';

    // 결제일할당
    if (order?.payDue === '카드결제') {
      payMMDD = '카드결제';
      notionPayDate = '카드결제';
    } else if (order?.payDue) {
      const pd = new Date(order.payDue);
      if (!isNaN(pd)) {
        payMMDD = Utilities.formatDate(pd, kst, 'MMdd');
        notionPayDate = Utilities.formatDate(pd, kst, 'MMdd');
      } else {
        payMMDD = order.payDue;
        notionPayDate = order.payDue;
      }
    }

    const whCd = (order && order.whCode) ? order.whCode : decideWarehouseCode_(merged);
    
    let empCdFinal = authInfo.managerCode;
    if (!empCdFinal) { 
       if (custRec.manager) {
          const m = findManagerByNameExact_(custRec.manager);
          if(m) empCdFinal = m.empCd;
       }
       if (!empCdFinal) empCdFinal = getScriptCreds_().EMP_CD;
    }

    const whNameMap = {
      '00003': '초월창고',
      '2': '상일물류',
      '14': '온라인창고',
      '1': '서초창고'
    };

    const whName = whNameMap[whCd] || whCd || '미지정';
    const mgrName = authInfo.managerName || custRec.manager || '미지정';
    
    const specMap = getSpecMap_();
    
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
      const priceEx = priceVat < 0 ? -Math.round(Math.abs(priceVat) / 1.1) : Math.round(priceVat / 1.1);

      let rawSpec = String(it.spec).trim();

      if (/경동.*[\/:]/.test(String(order?.addr || ''))) {
        Logger.log('[경동] 모델:' + it.model + ' / list:' + it.list + ' / 전체:' + JSON.stringify(it));
        rawSpec = String(it.list || 0);
      }
      
      let sizeDes = rawSpec === "" ? "\u200B" : rawSpec;

      SaleList.push({
        BulkDatas: {
          IO_DATE: ioDate,
          UPLOAD_SER_NO: "1",
          CUST: custFinal,
          CUST_DES: custRec.name || '',
          EMP_CD: empCdFinal || '',
          WH_CD: whCd || '100',
          IO_TYPE: "10",
          PJT_CD: "",
          TTL_CTT: "",
          REF_DES: "",
          COLL_TERM: "",
          AGREE_TERM: "",
          TIME_DATE: timeDate,

          U_MEMO1: String(custRec.tel||''),
          U_MEMO2: String(custRec.addr||''),
          U_MEMO3: String(custRec.rep||''),

          U_TXT1: String(order?.addr || ''),
          ADD_TXT_01_T: String(order?.auditAddr || ''),
          ADD_TXT_03_T: String(order?.tel || ''),
          ADD_TXT_04_T: String(order?.memo || ''),
          ADD_TXT_05_T: payMMDD,
          ADD_TXT_06_T: String(order?.dcInfo || ''),

          PROD_CD: String(it.model),
          PROD_DES: "",
          SIZE_DES: sizeDes,
          QTY: String(qty),
          PRICE: String(priceEx),
          USER_PRICE_VAT: String(Math.abs(priceVat)),
          SUPPLY_AMT_F: "0",
          SUPPLY_AMT: String(supply),
          VAT_AMT: String(vatAmt),
          
          REMARKS: String(it.REMARKS || '') 
        }
      });
    });

    if (SaleList.length === 0) return { ok: false, error: '유효수량없음' };

    const payload = { SaleList: SaleList };
    Logger.log("📤 데이터전송");

    const url = `http://152.69.228.109:3000/proxy/ecount/sale`;
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ SESSION_ID: sessionId, ZONE: zone, payload: payload }),
      muteHttpExceptions: true
    });
    
    const text = res.getContentText();
    let body; try { body = JSON.parse(text); } catch (e) { body = { raw: text }; }
    
    const ok = (res.getResponseCode() === 200) && (body?.Data?.SuccessCnt > 0);
    
    let finalSlipNo = '';
    if (ok && body?.Data?.SlipNos?.length > 0) {
      finalSlipNo = String(body.Data.SlipNos[0]);
    }

    if(ok) {
       try {
        let extractedIoNo = 0;
        if (finalSlipNo) {
           const parts = finalSlipNo.split('-'); 
           if (parts.length > 1) extractedIoNo = parseInt(parts[1], 10) || 0;
           else extractedIoNo = parseInt(finalSlipNo, 10) || 0;
        }
        
        const formatDate = (d) => { if (!d || d.length !== 8) return d; return d.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'); };

        const notionCommon = {
          bizName: String(custRec.name || ''),
          bizCode: custFinal,
          outDate: formatDate(ioDate),
          payDate: notionPayDate,
          addr: order.addr,
          siteAddr: order.auditAddr,
          receiver: order.tel,
          note: String(order.memo || ''),
          manager: mgrName,
          warehouse: whName,
          custTel: String(order.custTel || custRec.tel || ''),
          custAddr: String(order.custAddr || custRec.addr || '')
        };
        saveOrderToNotion(notionCommon, merged, extractedIoNo);
      } catch (e) {
        Logger.log('🚫 에러기록');
      }
    } else {
       const errText = body?.Data?.ResultDetails?.[0]?.TotalError || JSON.stringify(body);
       Logger.log('🚫 에러기록');
    }
    return { ok, slipNo: finalSlipNo, body };

  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

// 홈멀티 주문 여부 판별
function detectHomeOrder(items, order){
  const tCand = [
    order?.type, order?.mode, order?.orderType, order?.kind, order?.category
  ].map(x => String(x||'').toLowerCase());
  if (tCand.some(x => /(home|home\-multi|homemulti|hm)/.test(x))) return true;

  if (Array.isArray(items)) {
    for (const it of items) {
      const U = v => String(v||'').toUpperCase();
      const scopes = [U(it.section), U(it.group), U(it.kind), U(it.category), U(it.tags)];
      if (scopes.some(s => /HOME|HOME\-MULTI|HOMEMULTI|HM/.test(s))) return true;

      const m = String(it.model||'').toUpperCase();
      if (/AJ0|AJ1|AM0|AM1/.test(m)) { return true; }
    }
  }
  return false;
}

// DC 설정 기본값 생성
function buildDefaultDcConfig_() {
  return {
    homeDiscount:       DISCOUNT_RATE_HOME,
    commDiscount:       DISCOUNT_RATE_COMM,
    showIHose:          SHOW_I_HOSE,
    discount360:        DISCOUNT_360_AMT,
    discount4way:       DISCOUNT_4WAY_AMT,
    discountStand:      DISCOUNT_STAND_AMT,
    oneWayDiscount:     ONEWAY_DISCOUNT_AMT,
    deluxeDiscount:     DELUXE_DISCOUNT_AMT,
    firstGradeDiscount: FIRSTGRADE_DISCOUNT_AMT,
    unitRoundTo:        UNIT_ROUND_TO,
    unitRoundMode:      UNIT_ROUND_MODE
  };
}

// 노션에서 거래처별 DC 설정 조회
function fetchNotionDcConfig_(biznoDigits, forceRefresh) {
  // 숫자만 남김
  var raw = String(biznoDigits || '').replace(/[^\d]/g, '');
  if (!raw) return null;

  try {
    // 캐시 키 갱신
    var cacheKey = 'NOTION_DC_V2_' + raw;
    var skipCache = (forceRefresh === true);

    // 캐시 조회
    if (!skipCache) {
      var cached = cacheGetJSON_(cacheKey);
      if (cached) {
        Logger.log('>> 📦 노션 DC 캐시 사용 ' + raw);
        return cached;
      }
    }

    Logger.log('>> 📡 노션 DC 조회 시작 ' + raw + (skipCache ? ' (강제 새로고침)' : ''));

    // 공통 헤더
    var headers = {
      Authorization: 'Bearer ' + NOTION_TOKEN,
      'Notion-Version': NOTION_VER,
      'Content-Type': 'application/json'
    };

    // 노션 최신버전
    var dataSourceId = null;
    if (NOTION_VER === '2025-09-03') {
      try {
        var dbUrl = 'https://api.notion.com/v1/databases/' + NOTION_DB_ID;
        var dbRes = UrlFetchApp.fetch(dbUrl, {
          method: 'get',
          headers: headers,
          muteHttpExceptions: true
        });

        var dbCode = dbRes.getResponseCode();
        var dbText = dbRes.getContentText();
        if (dbCode === 200) {
          var dbBody = JSON.parse(dbText || '{}');
          var sources = dbBody.data_sources || [];
          if (sources.length > 0 && sources[0].id) {
            dataSourceId = sources[0].id;
            Logger.log('>> 🗂️ 노션 data_source 선택 ' + dataSourceId);
          } else {
            Logger.log('>> ⚠️ 노션 data_source 없음, /databases 쿼리로 폴백 ' + raw);
          }
        } else {
          Logger.log('>> ⚠️ 노션 DB 조회 실패 ' + dbCode + ' / ' + dbText);
        }
      } catch (e1) {
        Logger.log('>> ⚠️ 노션 DB 조회 예외 ' + e1);
      }
    }

    // 쿼리 URL 결정
    var url;
    if (dataSourceId) {
      // 2025-09-03 방식
      url = 'https://api.notion.com/v1/data_sources/' + dataSourceId + '/query';
    } else {
      // 구버전 또는 폴백
      url = 'https://api.notion.com/v1/databases/' + NOTION_DB_ID + '/query';
    }

    // 사업자등록번호 기준 필터
    var payload = {
      filter: {
        property: '거래처코드',
        number: { equals: Number(raw) }
      }
    };

    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: headers,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var code = res.getResponseCode();
    var text = res.getContentText();
    if (code !== 200) {
      Logger.log('>> 🟥 노션 응답 코드 ' + code + ' / ' + text);
      return null;
    }

    var body = JSON.parse(text);
    var first = (body.results || [])[0];
    if (!first || !first.properties) {
      Logger.log('>> ⚠️ 노션 결과 없음 ' + raw);
      return null;
    }
    var props = first.properties;

    // 숫자/체크박스 추출 유틸
    var num = function (name) {
      return (props[name] && typeof props[name].number === 'number')
        ? props[name].number
        : null;
    };
    var chk = function (name) {
      return props[name] && props[name].checkbox === true;
    };

    // select 값 읽기
    var sel = function (name) {
      var p = props[name];
      if (!p || p.type !== 'select' || !p.select) return null;
      return String(p.select.name || '').trim();
    };

    // 단위처리 해석
    var unitSel   = sel('단위처리');
    var roundTo   = null;
    var roundMode = null;

    if (unitSel) {
      var m = unitSel.match(/(\d+)\s*원?/);
      if (m) roundTo = Number(m[1]);
      if (/반올림/.test(unitSel)) roundMode = 'ROUND';
      else if (/올림/.test(unitSel)) roundMode = 'CEIL';
      else if (/내림/.test(unitSel)) roundMode = 'FLOOR';
    }

    // DC 설정 매핑
    var out = {
      homeDiscount:       num('홈멀티DC'),
      commDiscount:       num('상업멀티DC'),
      showIHose:          chk('유연호스I형'),
      discount360:        num('360'),
      discount4way:       num('4way'),
      discountStand:      num('스탠드'),
      oneWayDiscount:     num('1way'),
      deluxeDiscount:     num('디럭스'),
      firstGradeDiscount: num('1등급'),
      unitRoundTo:        roundTo,
      unitRoundMode:      roundMode,
    };

    // 캐시 저장
    if (!skipCache) {
      cachePutJSON_(cacheKey, out, 60 * 10);
      Logger.log('>> 💾 노션 DC 캐시 저장 ' + raw);
    }

    Logger.log('>> ✅ 노션 DC 조회 완료 ' + raw + ' ' + JSON.stringify(out));
    return out;

  } catch (e) {
    Logger.log('>> 🟥 노션 DC 조회 예외 ' + e);
    return null;
  }
}

// 프론트용 사업자번호 기준 DC 설정 초기화
function initDcConfigFromNotion(bizno) {
  var raw = String(bizno || '').replace(/[^\d]/g, '');
  var cfg = buildDefaultDcConfig_();
  var cust = searchCustomerByBizOrCode(raw);
  var cName = cust ? cust.name : '미확인';

  if (!raw || raw.length !== 10) {
    Logger.log('>> ⚠️ DC 설정 기본값 사용 (유효하지 않은 사업자번호) ' + raw);
    return cfg;
  }

  var notion = fetchNotionDcConfig_(raw);
  if (notion) {
    if (typeof notion.homeDiscount === 'number' && notion.homeDiscount !== 0) 
       cfg.homeDiscount = notion.homeDiscount;
       
    if (typeof notion.commDiscount === 'number' && notion.commDiscount !== 0) 
       cfg.commDiscount = notion.commDiscount;
       
    if (typeof notion.discount360 === 'number')        cfg.discount360        = notion.discount360;
    if (typeof notion.discount4way === 'number')       cfg.discount4way       = notion.discount4way;
    if (typeof notion.discountStand === 'number')      cfg.discountStand      = notion.discountStand;
    if (typeof notion.oneWayDiscount === 'number')     cfg.oneWayDiscount     = notion.oneWayDiscount;
    if (typeof notion.deluxeDiscount === 'number')     cfg.deluxeDiscount     = notion.deluxeDiscount;
    if (typeof notion.firstGradeDiscount === 'number') cfg.firstGradeDiscount = notion.firstGradeDiscount;
    if (typeof notion.showIHose === 'boolean')         cfg.showIHose          = notion.showIHose;
    if (typeof notion.unitRoundTo === 'number')        cfg.unitRoundTo        = notion.unitRoundTo;
    if (notion.unitRoundMode)                          cfg.unitRoundMode      = notion.unitRoundMode;

    Logger.log('⚙️ 할인조회');
  } else {
    Logger.log('🚫 에러기록');
  }

  return cfg;
}

// 프론트 조회용 거래처
function searchCustomerByBizno(bizno){
  const r = searchCustomerByBizOrCode(bizno);
  return r ? { code:r.code, name:r.name, bizno:r.bizno, manager:r.manager, managerTel:r.managerTel || r.tel || '' } : null;
}

// 프론트 담당자 목록
function getManagersForInput(input) {
  const arr = searchManagersByName_(input);
  return arr.map(r => ({
    '담당자명': r['담당자명'],
    '담당자코드': r['담당자코드'],
    manager: r['담당자명'],
    empCd: r['담당자코드'],
    custName: '',
    tel: ''
  }));
}

// 드라이브 권한 강제 요청
function forceAuth() {
  DriveApp.getRootFolder();
  console.log("권한 인증 완료!");
}

// 전표발송 내역 Notion
const NOTION_KEY_SEND = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_SEND = '2f8a1006d658803face6fdfe2b175780';

// 노션전송
function saveOrderToNotion(info, items, slipNo) {
  Logger.log('[전송] 노션 주문 전송 실행');
  const userEmail = Session.getActiveUser().getEmail();

  if (!items || !Array.isArray(items)) {
    Logger.log('[전송] 노션 전송 실패: items 데이터 없음');
    return;
  }

  const safeDate = info.outDate || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  Logger.log('[전송] 거래처: ' + info.bizName);

  // 압축
  const jsonString = JSON.stringify(items);
  const itemsString = Utilities.base64Encode(Utilities.newBlob(jsonString).getBytes());

  // 분할
  const chunks = [];
  for (let i = 0; i < itemsString.length; i += 2000) {
    chunks.push({
      text: { content: itemsString.substring(i, i + 2000) }
    });
  }

  // 이름 추출
  const pureManagerName = (info.manager && info.manager !== '미지정') ? info.manager.split(' ')[0] : '미지정';

  // 페이로드
  const payload = {
    parent: { database_id: NOTION_DB_SEND },
    properties: {
      '출고일': { date: { start: safeDate } },
      '전표번호': { number: Number(slipNo) },
      '거래처코드': { number: Number(info.bizCode) || 0 },
      '거래처명': { title: [{ text: { content: info.bizName || '미지정' } }] },
      '담당자': { select: { name: pureManagerName.substring(0, 100) } },
      '출고창고': { select: { name: (info.warehouse || '미지정').substring(0, 100) } }, 
      '배송주소': { rich_text: [{ text: { content: info.addr || '' } }] },
      '감리주소': { rich_text: [{ text: { content: info.siteAddr || '' } }] },
      '사업자주소': { rich_text: [{ text: { content: info.custAddr || '' } }] },
      '대표번호': { rich_text: [{ text: { content: info.custTel || '' } }] },
      '인수자 번호': { phone_number: info.receiver || null },
      '특이사항': { rich_text: [{ text: { content: info.note || '' } }] },
      '결제예정일': { rich_text: [{ text: { content: info.payDate || safeDate } }] },
      '사용자계정': { email: userEmail },
      '생성날짜': { date: { start: new Date().toISOString() } },
      '품목데이터': { rich_text: chunks }
    }
  };

  const options = {
    method: 'post',
    headers: {
      'Authorization': `Bearer ${NOTION_KEY_SEND}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  // 전송
  try {
    const res = UrlFetchApp.fetch('https://api.notion.com/v1/pages', options);
    if (res.getResponseCode() !== 200) {
      Logger.log('[전송] 실패: ' + res.getContentText());
    } else {
      Logger.log('[전송] 압축저장 완료');
    }
  } catch (e) {
    Logger.log('[전송] 노션 API 오류: ' + e);
  }
}

// 이력조회
function getNotionHistory(startDate, endDate) {
  Logger.log('🚀 발송조회');
  const userEmail = Session.getActiveUser().getEmail();

  const filters = [
    { property: '사용자계정', email: { equals: userEmail } }
  ];

  if (startDate) {
    filters.push({ property: '출고일', date: { on_or_after: startDate } });
  }
  if (endDate) {
    filters.push({ property: '출고일', date: { on_or_before: endDate } });
  }

  const url = `https://api.notion.com/v1/databases/${NOTION_DB_SEND}/query`;
  const options = {
    method: 'post',
    headers: {
      'Authorization': `Bearer ${NOTION_KEY_SEND}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    muteHttpExceptions: true
  };

  let rows = [];
  let hasMore = true;
  let nextCursor = null;

  while (hasMore) {
    const payloadObj = {
      filter: { and: filters },
      sorts: [{ property: '출고일', direction: 'descending' }],
      page_size: 100
    };
    if (nextCursor) payloadObj.start_cursor = nextCursor;
    options.payload = JSON.stringify(payloadObj);

    try {
      const res = UrlFetchApp.fetch(url, options);
      if (res.getResponseCode() === 200) {
        const data = JSON.parse(res.getContentText());
        rows = rows.concat(data.results);
        hasMore = data.has_more;
        nextCursor = data.next_cursor;
      } else {
        hasMore = false;
        Logger.log('⚠️ 응답실패');
      }
    } catch (e) {
      Logger.log('💥 에러발생');
      hasMore = false;
    }
  }

  const historyList = [];

  rows.forEach(r => {
    const p = r.properties;
    const slipNo = p['전표번호']?.number || 0;
    const date = p['출고일']?.date?.start || '';
    if (!slipNo || !date) return;

    const dataProps = p['품목데이터']?.rich_text || [];
    const base64Items = dataProps.map(t => t.text.content).join('');

    let parsedItems = [];
    try {
      if (base64Items) {
        const decodedStr = Utilities.newBlob(Utilities.base64Decode(base64Items)).getDataAsString();
        parsedItems = JSON.parse(decodedStr);
      }
    } catch(e) {}

    historyList.push({
      key: `${date}_${slipNo}`,
      date: date,
      slipNo: slipNo,
      custName: p['거래처명']?.title[0]?.plain_text || '미지정',
      bizAddr: p['사업자주소']?.rich_text[0]?.plain_text || '', 
      repPhone: p['대표번호']?.rich_text[0]?.plain_text || '',
      manager: p['담당자']?.select?.name || '',
      warehouse: p['출고창고']?.select?.name || '',
      addrShip: p['배송주소']?.rich_text[0]?.plain_text || '',
      receiverPhone: p['인수자 번호']?.phone_number || '',
      remarks: p['특이사항']?.rich_text[0]?.plain_text || '',
      payDate: p['결제예정일']?.rich_text?.[0]?.plain_text || '',
      items: parsedItems.reverse().map(it => ({
        model: it.model || '',
        qty: it.qty || 0,
        spec: it.spec || '',
        unitPrice: it.price || 0
      }))
    });
  });

  Logger.log('✅ 조회완료');
  return historyList;
}

// 동작 로그 노션 기록
function logFrontEvent(group, msg, isMobile, mgrName) {
  Logger.log('📝 프론트로그');
  var email = Session.getActiveUser().getEmail();
  var device = isMobile ? '모바일' : 'PC';
  var fullMsg = '[' + group + '] ' + msg + ' (' + device + ')';

  var payload = {
    parent: { database_id: '32ba1006d65880c4beb4fa1bdf65b676' },
    properties: {
      '담당자 이메일': { email: email },
      '담당자명': { title: [{ text: { content: mgrName } }] },
      '로그': { rich_text: [{ text: { content: fullMsg } }] }
    }
  };

  try {
    UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
      method: 'post',
      headers: {
        'Authorization': 'Bearer REDACTED_NOTION_TOKEN',
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log('🚫 에러기록');
  }
}

// 인증체크
function checkUserAuth(email) {
  Logger.log('[접속] 사용자 인증 확인 시작: ' + email);
  const url = `https://api.notion.com/v1/databases/${AUTH_DB_ID}/query`;
  const options = {
    method: 'post',
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({
      filter: {
        property: '초대계정(지메일)',
        email: { equals: email }
      }
    }),
    muteHttpExceptions: true
  };

  try {
    const res = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(res.getContentText());
    
    if (data.results && data.results.length > 0) {
      const props = data.results[0].properties;
      const getText = (p) => p?.rich_text?.[0]?.plain_text || '';
      const getTitle = (p) => p?.title?.[0]?.plain_text || '';
      const getSelect = (p) => p?.select?.name || '';
      
      Logger.log('[접속] 인증 성공: ' + email);
      
      const name = getTitle(props['이름']);
      const rank = getSelect(props['직급']);
      const fullName = rank ? name + ' ' + rank : name;
      
      return { 
        authorized: true,
        ecountId: getText(props['이카운트ID']),
        ecountApi: getText(props['이카운트API']),
        managerCode: getText(props['담당자코드']),
        managerName: fullName
      };
    }
  } catch (e) {
    Logger.log('[접속] 인증 조회 실패: ' + e);
  }
  
  Logger.log('[접속] 미등록 계정: ' + email);
  return { authorized: false };
}

// 재고테이블생성
function getInventoryTableHtml(baseDate, itemCodes) {
  
  try {
    // 세션획득
    const session = getEcountSession(); 
    const sessionId = session.sessionId;
    const zone = session.zone;

    // 창고매핑
    const whMap = {
      '초월창고': '00003',
      '상일물류': '2',
      '온라인창고': '14',
      '서초창고': '1'
    };
    const whNames = Object.keys(whMap);
    const codeToName = {};
    whNames.forEach(n => { codeToName[whMap[n]] = n; });

    // 품목확인
    const items = itemCodes || [];
    if (items.length === 0) return '<div style="padding:20px; text-align:center; color:red;">⚠️ 조회할 품목이 없습니다.</div>';

    // 초기화
    const matrix = {};
    items.forEach(c => {
      matrix[c] = {};
      whNames.forEach(w => matrix[c][w] = 0);
    });

    // 요청
    const payload = {
      BASE_DATE: baseDate,
      PROD_CD: items.join('∬'),
      ZERO_FLAG: 'Y',
      BAL_FLAG: 'N',
      DEL_GUBUN: 'N',
      SAFE_FLAG: 'N'
    };

    const url = `http://152.69.228.109:3000/proxy/ecount/inventory`;
    const res = UrlFetchApp.fetch(url, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify({ SESSION_ID: sessionId, ZONE: zone, payload: payload }),
      muteHttpExceptions: true
    });

    const code = res.getResponseCode();
    
    // 에러처리
    if (code === 412) return '<div style="padding:20px; text-align:center; color:red;">⚠️ 요청 과다 (412) - 잠시 후 다시 시도하세요.</div>';
    if (code !== 200) return `<div style="padding:20px; text-align:center; color:red;">⚠️ API 오류 (${code})</div>`;

    // 파싱
    let data;
    try {
      data = JSON.parse(res.getContentText());
    } catch (e) {
      return `<div style="padding:20px; text-align:center; color:red;">⚠️ 응답 파싱 실패</div>`;
    }

    const result = data.Data?.Result || [];

    // 매핑
    result.forEach(r => {
      const pCode = String(r.PROD_CD || '').trim();
      const wCode = String(r.WH_CD || '').trim();
      const wName = codeToName[wCode] || r.WH_DES || wCode;
      const qty = parseFloat(r.BAL_QTY) || 0;

      if (matrix[pCode] && matrix[pCode][wName] !== undefined) {
        matrix[pCode][wName] = qty;
      }
    });

    // HTML생성
    let html = '<table border="1" style="border-collapse:collapse; text-align:center; width:100%;">';
    
    // 헤더
    html += '<thead><tr><th class="item-col" style="background:#f3f4f6; position:sticky; top:0;">품목</th>';
    whNames.forEach(w => html += `<th style="background:#f3f4f6; position:sticky; top:0;">${w}</th>`);
    html += '</tr></thead><tbody>';

    // 본문
    items.forEach(p => {
      html += `<tr><td class="item-col" style="text-align:left; padding-left:10px;">${p}</td>`;
      whNames.forEach(w => {
        const q = matrix[p][w];
        const style = q < 0 ? 'color:red; font-weight:bold;' : '';
        html += `<td style="${style}">${q.toLocaleString()}</td>`;
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    return html;

  } catch (e) {
    console.error('🔥 재고조회오류', e);
    return `<div style="padding:20px; text-align:center; color:red;">⚠️ 서버 오류: ${e.message}</div>`;
  }
}

// 날짜변경조회
function getInventoryTable(dateVal, itemCodes) {
  console.log('🔄 재고조회요청', { 날짜: dateVal, 품목수: itemCodes ? itemCodes.length : 0 });
  return getInventoryTableHtml(dateVal, itemCodes);
}

// 파일포함
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* 노션 설정 */
const NOTION_TOKEN_QUOTE = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_QUOTE = '2fca1006d65880058f8af352f254bc67';

// 견적저장
function saveQuoteSnapshot(payload) {
  try {
    const email = Session.getActiveUser().getEmail();
    const fullData = payload.data;
    const imgData = payload.image || '';
    const custName = payload.summary.custName || '미지정';
    const nowStr = Utilities.formatDate(new Date(), "GMT+9", "yyyy-MM-dd'T'HH:mm:ss+09:00");

    const chunks = [];
    for (let i = 0; i < fullData.length; i += 2000) {
      chunks.push({
        text: { content: fullData.substring(i, i + 2000) }
      });
    }

    const imgChunks1 = [];
    const imgChunks2 = [];
    const imgChunks3 = [];

    for (let i = 0; i < imgData.length; i += 2000) {
      const chunk = { text: { content: imgData.substring(i, i + 2000) } };
      if (imgChunks1.length < 100) {
        imgChunks1.push(chunk);
      } else if (imgChunks2.length < 100) {
        imgChunks2.push(chunk);
      } else if (imgChunks3.length < 100) {
        imgChunks3.push(chunk);
      }
    }

    const props = {
      "거래처명": { title: [{ text: { content: custName } }] },
      "담당자 계정": { email: email },
      "저장일시": { date: { start: nowStr } },
      "데이터": { rich_text: chunks }
    };

    if (imgChunks1.length > 0) props["미리보기1"] = { rich_text: imgChunks1 };
    if (imgChunks2.length > 0) props["미리보기2"] = { rich_text: imgChunks2 };
    if (imgChunks3.length > 0) props["미리보기3"] = { rich_text: imgChunks3 };

    const body = {
      parent: { database_id: NOTION_DB_QUOTE },
      properties: props
    };

    const options = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + NOTION_TOKEN_QUOTE,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      payload: JSON.stringify(body)
    };

    UrlFetchApp.fetch('https://api.notion.com/v1/pages', options);
    Logger.log('저장완료 ✅');
    return true;

  } catch (e) {
    Logger.log('저장실패 ❌');
    throw new Error('저장 실패 ' + e.message);
  }
}

// 목록조회
function getQuoteHistory(startDate, endDate) {
  Logger.log('🚀 저장조회');
  try {
    const userEmail = Session.getActiveUser().getEmail();

    const filters = [
      { property: "담당자 계정", email: { equals: userEmail } }
    ];

    if (startDate) {
      filters.push({ property: '저장일시', date: { on_or_after: startDate } });
    }
    if (endDate) {
      filters.push({ property: '저장일시', date: { on_or_before: endDate } });
    }

    const options = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + NOTION_TOKEN_QUOTE,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      muteHttpExceptions: true
    };

    const url = `https://api.notion.com/v1/databases/${NOTION_DB_QUOTE}/query`;
    
    let allPages = [];
    let hasMore = true;
    let nextCursor = null;

    while (hasMore) {
      const payloadObj = {
        filter: { and: filters },
        sorts: [{ property: "저장일시", direction: "descending" }],
        page_size: 100
      };
      if (nextCursor) payloadObj.start_cursor = nextCursor;
      options.payload = JSON.stringify(payloadObj);

      const res = UrlFetchApp.fetch(url, options);
      if (res.getResponseCode() === 200) {
        const json = JSON.parse(res.getContentText());
        allPages = allPages.concat(json.results);
        hasMore = json.has_more;
        nextCursor = json.next_cursor;
      } else {
        hasMore = false;
        Logger.log('⚠️ 응답실패');
      }
    }

    const results = allPages.map(page => {
      const dataProps = page.properties['데이터'] ? page.properties['데이터'].rich_text : [];
      const fullString = dataProps.map(t => t.text.content).join('');
      
      const imgProps1 = page.properties['미리보기1'] ? page.properties['미리보기1'].rich_text : [];
      const imgProps2 = page.properties['미리보기2'] ? page.properties['미리보기2'].rich_text : [];
      const imgProps3 = page.properties['미리보기3'] ? page.properties['미리보기3'].rich_text : [];
      
      const imgString = imgProps1.map(t => t.text.content).join('') +
                        imgProps2.map(t => t.text.content).join('') +
                        imgProps3.map(t => t.text.content).join('');
      
      const custProps = page.properties['거래처명'] ? page.properties['거래처명'].title : [];
      const custName = custProps.length > 0 ? custProps[0].text.content : "미지정";
      
      const dateProp = page.properties['저장일시'] ? page.properties['저장일시'].date.start : "";

      return {
        id: page.id,
        created: dateProp,
        custName: custName,
        data: fullString,
        image: imgString
      };
    });
    
    Logger.log('✅ 조회완료');
    return results;
  } catch (e) {
    Logger.log('💥 에러발생');
    throw new Error('목록 로드 실패: ' + e.message);
  }
}

// 단가로드
function getPriceIncData_() {
  Logger.log('🚀 인상전단가');
  const k = 'PRICE_INC_CACHE_V3'; 
  const hit = cacheGetJSON_(k);
  if (hit) return hit;

  const ss = SpreadsheetApp.openById(SRC_SHEET_ID);
  const out = { home: {}, comm: {}, single: {} };

  const readSheet = (sheetName, targetObj, isSingle) => {
    Logger.log('📂 탭읽기: ' + sheetName);
    const sh = ss.getSheetByName(sheetName);
    if (!sh) return;
    const vr = sh.getDataRange().getValues();
    if (vr.length < 2) return;
    
    let hdrRow = -1;
    for (let i = 0; i < Math.min(vr.length, 10); i++) {
      const row = (vr[i] || []).map(v => String(v || '').trim().replace(/\s+/g, ''));
      const hasModel = row.some(x => ['모델명','모델','품목코드','기종'].includes(x));
      const hasPrice = row.some(x => ['출고가','납품가'].includes(x));
      if (hasModel && hasPrice) {
        hdrRow = i; break;
      }
    }
    if (hdrRow < 0) return;
    
    const H = (vr[hdrRow] || []).map(v => String(v || '').trim().replace(/\s+/g, ''));
    
    const idxModel = findIdx_(H, ['모델명','모델','품목코드','기종']);
    const idxList = findIdx_(H, ['출고가','list','리스트','소비자가']);
    
    const idxPrices = H.map((v,i) => v === '납품가' ? i : -1).filter(i => i >= 0);
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
      } else {
        if (idxList >= 0) {
          const price = parseKRNumber_(vr[r][idxList]);
          if (price > 0) targetObj[model] = price;
        }
      }
    }
  };

  readSheet('홈멀티', out.home, false);
  readSheet('상업멀티', out.comm, false);
  readSheet('상업멀티 구성', out.comm, false);
  
  readSheet('싱글 세트', out.single, true);
  readSheet('싱글 구성품', out.single, true);

  cachePutJSON_(k, out, 600);
  return out;
}