// 템플릿진입
function doGet() {
  const t = HtmlService.createTemplateFromFile('index');

  t.homemulti       = '[]';
  t.singleSets      = '[]';
  t.singleParts     = '[]';
  t.homeDefaults    = '{}';
  t.singleDefaults  = '{}';
  t.singleMatPrices = '{}';
  t.commercialMulti = '[]';
  t.commercialParts = '[]';
  t.oldProducts     = '[]';
  t.homeInc         = '{}';
  t.commInc         = '{}';
  t.singleInc       = '{}';
  t.singlePartsInc  = '{}';
  t.specDetailMap   = '{}';

  // 로고 이미지 데이터
  t.logoData = getLogoImage();

  // 서버 전역 주입
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
    unitRoundMode: UNIT_ROUND_MODE
  });

  return t.evaluate().setTitle('주문서').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// 초기 데이터 일괄 로드
function getInitialData() {
  Logger.log('🚀 초기 데이터 요청 수신');
  try {
    const out = {
      homemulti:       getHomeMulti(),
      singleSets:      getSingleSets(),
      singleParts:     getSingleParts(),
      homeDefaults:    getHomeDefaults(),
      singleDefaults:  getSingleDefaults(),
      singleMatPrices: getSingleMatPrices(),
      commercialMulti: getCommercialMulti(),
      commercialParts: getCommercialParts(),
      oldProducts:     getOldProducts_(),
      homeInc:         getHomeIncreasePrices_(),
      commInc:         getCommIncreasePrices_(),
      singleInc:       getSingleIncreasePrices_(),
      singlePartsInc:  getSinglePartsIncreasePrices_(),
      specDetailMap:   getSpecDetailMap_()
    };
    Logger.log('✅ 초기 데이터 응답 준비 완료');
    return out;
  } catch (e) {
    Logger.log('❌ 초기 데이터 로드 실패: ' + e);
    throw new Error('초기 데이터 로드 실패: ' + e.message);
  }
}

// 소스 시트
const SRC_SHEET_ID      = '1RJqO3jT-yJTi3NDBhL60o_cZWlVETGTU7UlvIKXuVNQ';
const HOME_NAME         = '홈멀티';
const SINGLE_NAME       = '싱글 세트';
const SINGLE_PARTS_NAME = '싱글 구성품';
const COMM_NAME         = '상업멀티';
const COMM_PARTS_NAME   = '상업멀티 구성';
const CUSTOMERS_NAME    = '거래처';
const MANAGERS_NAME     = '담당자';

/* 가격 전역 설정 */
const DISCOUNT_RATE_HOME = 0.45;   // 홈멀티 전역 할인율
const DISCOUNT_RATE_COMM = 0.45;   // 상업멀티 전역 할인율
const SHOW_I_HOSE             = false; // 유연호스 I형 사용
const DISCOUNT_360_AMT        = 0;     // 360 할인액
const DISCOUNT_4WAY_AMT       = 0;     // 4way 할인액
const DISCOUNT_STAND_AMT      = 0;     // 스탠드 할인액
const ONEWAY_DISCOUNT_AMT     = 0;     // 싱글 1way 할인액
const DELUXE_DISCOUNT_AMT     = 0;     // 디럭스 세트 전용 할인액
const FIRSTGRADE_DISCOUNT_AMT = 0;       // 1등급 세트 기본 할인액
const UNIT_ROUND_TO           = 0;       // 단위처리 단위
const UNIT_ROUND_MODE         = 'ROUND'; // ROUND / CEIL / FLOOR

// 노션 설정
var NOTION_DB_ID = '193a1006d6588161a02cc8f196d7102b';
var NOTION_TOKEN = 'REDACTED_NOTION_TOKEN';
var NOTION_VER   = '2025-09-03';
const NOTION_TOKEN_AUTH = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_AUTH = '2dda1006d6588047b1bbc7c2660203c0';
const NOTION_TOKEN_ORDER = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_ORDER = '2eca1006d65880109d91c2e56fab28f4';
const NOTION_TOKEN_SNAPSHOT = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_SNAPSHOT = '33aa1006d6588087810ffaa7dc7f315c';

// 주문저장
function saveOrderSnapshot(payload) {
  try {
    const fullData = payload.data;
    const imgData = payload.image || '';
    
    const custName = payload.summary.custName || '미지정 거래처';
    const theme = payload.summary.theme || '주제 없음';
    const bizNo = payload.summary.bizNo || ''; 
    const nowStr = Utilities.formatDate(new Date(), "GMT+9", "yyyy-MM-dd'T'HH:mm:ss+09:00");

    const chunks = [];
    for (let i = 0; i < fullData.length; i += 2000) {
      chunks.push({ text: { content: fullData.substring(i, i + 2000) } });
    }

    const imgChunks1 = [];
    const imgChunks2 = [];
    const imgChunks3 = [];

    for (let i = 0; i < imgData.length; i += 2000) {
      const chunk = { text: { content: imgData.substring(i, i + 2000) } };
      if (imgChunks1.length < 100) imgChunks1.push(chunk);
      else if (imgChunks2.length < 100) imgChunks2.push(chunk);
      else if (imgChunks3.length < 100) imgChunks3.push(chunk);
    }

    const props = {
      "거래처명": { title: [{ text: { content: custName } }] },
      "거래처코드": { rich_text: [{ text: { content: bizNo } }] },
      "주제": { rich_text: [{ text: { content: theme } }] },
      "저장일시": { date: { start: nowStr } },
      "데이터": { rich_text: chunks }
    };

    if (imgChunks1.length > 0) props["미리보기1"] = { rich_text: imgChunks1 };
    if (imgChunks2.length > 0) props["미리보기2"] = { rich_text: imgChunks2 };
    if (imgChunks3.length > 0) props["미리보기3"] = { rich_text: imgChunks3 };

    const body = {
      parent: { database_id: NOTION_DB_ID_SNAPSHOT },
      properties: props
    };

    const options = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + NOTION_TOKEN_SNAPSHOT,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      payload: JSON.stringify(body)
    };

    UrlFetchApp.fetch('https://api.notion.com/v1/pages', options);
    Logger.log('💾 주문저장 완료');
    return true;

  } catch (e) {
    Logger.log('❌ 주문저장 실패');
    throw new Error('저장 실패 ' + e.message);
  }
}

// 주문 내역조회
function getOrderSnapshotHistory(bizNo, sDate, eDate) {
  try {
    const filters = [
      { property: "거래처코드", rich_text: { equals: String(bizNo) } }
    ];

    if (sDate) {
      filters.push({ property: '저장일시', date: { on_or_after: sDate } });
    }
    if (eDate) {
      filters.push({ property: '저장일시', date: { on_or_before: eDate } });
    }

    const options = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + NOTION_TOKEN_SNAPSHOT,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      muteHttpExceptions: true
    };

    const url = `https://api.notion.com/v1/databases/${NOTION_DB_ID_SNAPSHOT}/query`;
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

      const themeProps = page.properties['주제'] ? page.properties['주제'].rich_text : [];
      const theme = themeProps.length > 0 ? themeProps[0].text.content : "주제 없음";
      
      const dateProp = page.properties['저장일시'] ? page.properties['저장일시'].date.start : "";

      return {
        id: page.id,
        created: dateProp,
        custName: custName,
        theme: theme,
        data: fullString,
        image: imgString
      };
    });
    Logger.log('📥 내역조회 완료');
    return results;
  } catch (e) {
    Logger.log('❌ 내역조회 실패');
    throw new Error('목록 로드 실패: ' + e.message);
  }
}

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

// 홈 출고가 인상
function getHomeIncreasePrices_() {
  const k = 'HOME_INC_V2';
  const hit = cacheGetJSON_(k);
  if (hit) return hit;
  const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName('홈멀티_단가인상');
  if(!sh) { Logger.log('❌ 홈멀티단가인상 시트없음'); return {}; }
  const vr = sh.getDataRange().getDisplayValues();
  const map = extractIncreasePrices_(vr);
  cachePutJSON_(k, map, 60 * 10);
  return map;
}

// 상업출고가
function getCommIncreasePrices_() {
  const k = 'COMM_INC_V2';
  const hit = cacheGetJSON_(k);
  if (hit) return hit;
  const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName('상업멀티_단가인상');
  if(!sh) { Logger.log('❌ 상업단가인상실패'); return {}; }
  const vr = sh.getDataRange().getDisplayValues();
  const map = extractIncreasePrices_(vr);
  cachePutJSON_(k, map, 60 * 10);
  return map;
}

// 싱글단가추출
function extractSingleIncreasePrices_(vr) {
  if (!vr.length) return {};
  let hdrRow = 0;
  for (let i = 0; i < Math.min(vr.length, 20); i++) {
    const H = (vr[i] || []).map(v => String(v || '').replace(/\s+/g, ''));
    if (H.includes('모델명') && (H.includes('납품가') || H.includes('출고가'))) { hdrRow = i; break; }
  }
  const H = (vr[hdrRow] || []).map(v => String(v || '').replace(/\s+/g, ''));
  const idxModel = findIdx_(H, ['모델명', '모델', '품목코드']);
  const idxPrices = H.map((v, i) => v === '납품가' ? i : -1).filter(i => i >= 0);
  const idxPR = idxPrices.length ? idxPrices[idxPrices.length - 1] : findIdx_(H, ['출고가']);
  
  const map = {};
  if (idxModel >= 0 && idxPR >= 0) {
    for (let r = hdrRow + 1; r < vr.length; r++) {
      const model = String(vr[r][idxModel] || '').trim();
      if (!model) continue;
      const price = parseKRNumber_(vr[r][idxPR]);
      if (price > 0) map[model] = price;
    }
  }
  return map;
}

// 싱글출고가
function getSingleIncreasePrices_() {
  const k = 'SINGLE_INC_V1';
  const hit = cacheGetJSON_(k);
  if (hit) return hit;
  const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName('싱글 세트_단가인상');
  if(!sh) { Logger.log('❌ 싱글단가인상실패'); return {}; }
  const vr = sh.getDataRange().getDisplayValues();
  const map = extractSingleIncreasePrices_(vr);
  cachePutJSON_(k, map, 60 * 10);
  return map;
}

// 싱글구성품
function getSinglePartsIncreasePrices_() {
  const k = 'SINGLE_PARTS_INC_V1';
  const hit = cacheGetJSON_(k);
  if (hit) return hit;
  const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName('싱글 구성품_단가인상');
  if(!sh) { Logger.log('❌ 싱글부품인상실패'); return {}; }
  const vr = sh.getDataRange().getDisplayValues();
  const map = extractSingleIncreasePrices_(vr);
  cachePutJSON_(k, map, 60 * 10);
  return map;
}

// 인상단가추출
function extractIncreasePrices_(vr) {
  if (!vr.length) return {};
  let hdrRow = -1;
  for (let i = 0; i < Math.min(vr.length, 10); i++) {
    const H = (vr[i] || []).map(v => String(v || '').replace(/\s+/g, ''));
    if (H.includes('모델명') && (H.includes('출고가')||H.includes('LIST')||H.includes('리스트'))) {
      hdrRow = i; break;
    }
  }
  if (hdrRow < 0) return {};
  const H = (vr[hdrRow] || []).map(v => String(v || '').replace(/\s+/g, ''));
  const idxModel = findIdx_(H, ['모델명', '모델', '품목코드', '기종']);
  const idxList  = findIdx_(H, ['출고가','LIST','리스트','정가','소비자가']);
  if (idxModel < 0 || idxList < 0) return {};
  const map = {};
  for (let r = hdrRow + 1; r < vr.length; r++) {
    const model = String(vr[r][idxModel] || '').trim();
    if (!model) continue;
    const list = parseKRNumber_(vr[r][idxList]);
    if (list > 0) map[model] = list;
  }
  return map;
}

// 이미지 팝업
function getGateImages() {
  var folderId = '1uGjGXP_2X_VJUP4bU2jCOvFrEeU-HGWT'; 
  
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

    if (!name || !model) continue;
    if (/운임|절삭/i.test(name)) continue;
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
      note
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

    if (!name || !model) continue;
    if (/운임|절삭/i.test(name)) continue;
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
      matKey,
      catL: cls.L,
      catM: cls.M,
      note
    });
  }

  cachePutJSON_(k, out, 60 * 10);
  return out;
}

// 세트 참조행
function extractRowsFromFormula_(formula) {
  if (!formula) return [];
  const f = String(formula);
  const rows = [];
  const re = /'싱글 세트'!\$?[A-Z]\$?(\d+)/ig;
  let m; while ((m = re.exec(f))) rows.push(parseInt(m[1], 10));
  return rows;
}

// 싱글 구성품
function getSingleParts() {
  const k = 'SP_FIX_V13';
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
    const price    = idxPrice >= 0 ? parseKRNumber_(row[idxPrice]) : 0;
    const feat     = (row[idxFeat]    || '').toString().trim();
    const spec     = idxSpec >= 0 ? (row[idxSpec]||'').toString().trim() : '';

    if (!name || !model) continue;
    if (/운임|절삭/i.test(kind + ' ' + name)) continue;

    const isDefault = /기본/.test(feat||'');

    out.push({
      setKey: '',
      linkRows: [],
      setModel, kind, model, unit, price, name, feat, isDefault, spec
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

  // 헤더
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
  const idxList   = findIdx_(H, ['출고가','LIST','리스트','정가','소비자가']);
  const idxFixDc  = findIdx_(H, ['고정DC']);
  const idxSpec   = findIdx_(H, ['규격']);
  const idxCap    = findIdx_(H, ['용량','용량(kW)','용량kW']);
  const idxCatL   = findIdx_(H, ['대분류']);
  const idxNote   = findIdx_(H, ['비고']);

  const out = [];
  for (let r = hdrRow + 1; r < vr.length; r++) {
    const row   = vr[r] || [];
    const name  = (row[idxName]  || '').toString().trim();
    const model = (row[idxModel] || '').toString().trim();
    const unit  = idxUnit  >= 0 ? (row[idxUnit]  || '').toString().trim() : '';
    const price = idxPrice >= 0 ? parseKRNumber_(row[idxPrice]) : 0;
    const list  = idxList  >= 0 ? parseKRNumber_(row[idxList])  : 0;
    const spec  = idxSpec  >= 0 ? String(row[idxSpec]  || '').trim() : '';
    const fixDc = idxFixDc >= 0 ? String(row[idxFixDc] || '').trim() : '';
    const note  = idxNote  >= 0 ? String(row[idxNote]  || '').trim() : '';

    // 용량
    const capRaw = idxCap >= 0 ? row[idxCap] : '';
    const cap    = parseKRFloat_(capRaw);

    // 분류
    const catLFromSheet = idxCatL >= 0 ? String(row[idxCatL] || '').trim() : '';
    const cls = classifyCommercial_(name, model);
    const catL = catLFromSheet || cls.catL;
    const catM = cls.catM;
    const catS = cls.catS;

    if (!name || !model) continue;
    if (/운임|절삭/i.test(name)) continue;
    if (isBlockedByNote_(note)) continue;

    const priceFormula = (idxPrice >= 0 && fr[r] && fr[r][idxPrice]) ? String(fr[r][idxPrice]) : '';
    const useK2 = /\$L\$2/i.test(priceFormula);

    Logger.log('>> 🧭 CM row=%s model=%s cap=%s catL=%s useK2=%s list=%s price=%s fixDC=%s',
               r+1, model, cap, catL, useK2, list, price, fixDc);

    out.push({
      name, model, unit, price,
      list,
      formula: priceFormula,
      useK2,
      capacity: cap,
      spec,
      catL, catM, catS,  // 대분류 우선 적용
      disp: sanitizeDisp_(name),
      '고정DC': fixDc,
      note
    });
  }

  cachePutJSON_(k, out, 60 * 10);
  return out;
}

/* 상업멀티 구성품 */
function getCommercialParts() {
  // 주석 간결
  const k = 'CP_FIX_V6';
  const hit = cacheGetJSON_(k);
  if (hit) return hit;

  // 시트 로드
  const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName(COMM_PARTS_NAME);
  if (!sh) return [];

  const rng = sh.getDataRange();
  const vr  = rng.getDisplayValues();
  if (!vr.length) return [];

  // 헤더 자동 탐지
  let hdrRow = -1;
  for (let i = 0; i < Math.min(vr.length, 10); i++) {
    const row = (vr[i] || []).map(v => String(v || '').trim());
    const H   = row.map(v => v.replace(/\s+/g, ''));
    if (H.includes('세트') && H.includes('모델명')) { hdrRow = i; break; }
  }
  if (hdrRow < 0) hdrRow = 0; // 기본값

  const Hraw = (vr[hdrRow] || []).map(v => String(v || '').trim());
  const H    = Hraw.map(v => v.replace(/\s+/g, ''));

  // 인덱스
  const idxSetName  = findIdx_(H, ['품명','품']);
  const idxModel    = findIdx_(H, ['모델명','모델','품목코드','기종']);
  const idxKind     = findIdx_(H, ['구분']);
  const idxUnit     = findIdx_(H, ['단위']);
  const idxSetModel = findIdx_(H, ['세트']);
  const idxSpec     = findIdx_(H, ['규격','비고']);
  const idxList     = findIdx_(H, ['출고가']);    // 출고가 우선
  const idxPrice    = findIdx_(H, ['납품가']);    // 납품가 보조

  const start = hdrRow + 1;
  const out = [];

  for (let r = start; r < vr.length; r++) {
    const row      = vr[r] || [];
    const setModel = (row[idxSetModel] || '').toString().trim();
    if (!setModel) continue;

    const nameRaw = (row[idxSetName] || '').toString().trim();
    const name    = sanitizeDisp_(nameRaw);
    const model   = (row[idxModel]   || '').toString().trim();
    const kind    = (row[idxKind]    || '').toString().trim();
    const unit    = (row[idxUnit]    || '').toString().trim() || 'EA';

    // 가격은 납품가 우선 없으면 출고가
    const listVal  = idxList  >= 0 ? parseKRNumber_(row[idxList])  : 0;
    const priceVal = idxPrice >= 0 ? parseKRNumber_(row[idxPrice]) : 0;
    const basePrice = priceVal || listVal;

    const spec = idxSpec >= 0 ? (row[idxSpec] || '').toString().trim() : '';

    if (!name || !model) continue;
    if (/운임|절삭/i.test(model)) continue;
    if (isBlockedByNote_(spec)) continue;

    const isDefault = /기본/.test(kind || '');

    out.push({
      setKey: setModel,
      setModel: setModel,
      model: model,
      unit: unit,
      price: basePrice,
      name: name,
      kind: kind,
      isDefault: isDefault,
      spec: spec
    });
  }

  Logger.log('>> 🧱 상업 구성 로드 행 %s 헤더 %s 구성 %s',
             vr.length, hdrRow + 1, out.length);
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

// 장비스펙 데이터 불러오기
function getSpecDetailMap_(){
  const key = 'SPEC_DETAIL_MAP_V14';
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

    const coolCols = [];
    H.forEach((h,i)=>{
      if(h===normH('냉방성능(정격)') || /냉방성능/.test(h)) coolCols.push(i);
    });

    let iCoolKw   = coolCols[0] ?? -1;
    let iCoolKcal = coolCols[1] ?? -1;

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
    const iWeight = idx(H, ['제품중량', '중량', '중량(kg)']);
    const iPackSize = idx(H, ['포장치수', '포장크기', '포장치수(mm)', '포장크기(mm)']);
    const iPackWeight = idx(H, ['포장중량', '포장중량(kg)']);
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
        weight: iWeight >= 0 ? row[iWeight] : '',
        packSize: iPackSize >= 0 ? row[iPackSize] : '',
        packWeight: iPackWeight >= 0 ? row[iPackWeight] : '',
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
  }

  function scanSingle(){
    const sh = ss.getSheetByName(SINGLE_NAME);
    if(!sh) return;

    const vr = sh.getDataRange().getDisplayValues();
    const hr = findHeaderRow(vr);
    if(hr<0) return;

    const H = (vr[hr]||[]).map(normH);

    const iModel = idx(H, ['모델명','모델','품목코드','기종']);
    const iGrade = idx(H, ['등급(냉방/난방)','등급(냉방/난방)']);
    const iPipe  = idx(H, ['배관경']);
    const iPowKw = idx(H, ['소비전력(kW)(최소/정격/최대)','소비전력(kW)(최소/정격/최대)']);
    const iCapKw = idx(H, ['성능(kW)(최소/정격/최대)','성능(kW)(최소/정격/최대)']);
    const iCapKcal = idx(H, ['성능(kcal/h)(최소/정격/최대)','성능(kcal/h)(최소/정격/최대)']);
    const iPowerBrk = idx(H, ['전원(mm²)/차단(A)','전원(mm²)/차단(A)']);
    
    let iInSize = idx(H, ['실내기크기(mm)', '실내기크기']);
    if (iInSize < 0) iInSize = findContains(H, /실내기.*크기/);
    
    let iOutSize= idx(H, ['실외기크기(mm)', '실외기크기']);
    if (iOutSize < 0) iOutSize = findContains(H, /실외기.*크기/);
    
    let iInWeight = idx(H, ['실내기중량(kg)', '실내기중량']);
    if (iInWeight < 0) iInWeight = findContains(H, /실내기.*중량/);
    
    let iOutWeight = idx(H, ['실외기중량(kg)', '실외기중량']);
    if (iOutWeight < 0) iOutWeight = findContains(H, /실외기.*중량/);
    
    let iInPackSize = idx(H, ['실내기포장(mm)', '실내기포장', '실내기포장치수', '실내기포장치수(mm)', '실내기포장크기', '실내기포장크기(mm)']);
    if (iInPackSize < 0) iInPackSize = findContains(H, /실내기.*포장/);
    
    let iOutPackSize = idx(H, ['실외기포장(mm)', '실외기포장', '실외기포장치수', '실외기포장치수(mm)', '실외기포장크기', '실외기포장크기(mm)']);
    if (iOutPackSize < 0) iOutPackSize = findContains(H, /실외기.*포장/);
    
    let iInPackWeight = idx(H, ['실내기포장중량(kg)', '실내기포장중량', '실내기포장무게']);
    if (iInPackWeight < 0) iInPackWeight = findContains(H, /실내기.*포장.*(중량|무게)/);
    
    let iOutPackWeight = idx(H, ['실외기포장중량(kg)', '실외기포장중량', '실외기포장무게']);
    if (iOutPackWeight < 0) iOutPackWeight = findContains(H, /실외기.*포장.*(중량|무게)/);

    const iPipeDrop = idx(H, ['배관길이/고낙차(m)']);
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
        inWeight: iInWeight >= 0 ? row[iInWeight] : '',
        outWeight: iOutWeight >= 0 ? row[iOutWeight] : '',
        inPackSize: iInPackSize >= 0 ? row[iInPackSize] : '',
        outPackSize: iOutPackSize >= 0 ? row[iOutPackSize] : '',
        inPackWeight: iInPackWeight >= 0 ? row[iInPackWeight] : '',
        outPackWeight: iOutPackWeight >= 0 ? row[iOutPackWeight] : '',
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
    const iWeight = idx(H, ['제품중량', '중량', '중량(kg)']);
    const iPackSize = idx(H, ['포장치수', '포장크기', '포장치수(mm)', '포장크기(mm)']);
    const iPackWeight = idx(H, ['포장중량', '포장중량(kg)', '포장무게']);
    const iEff   = idx(H, ['소비효율등급','에너지소비효율등급']);
    const iMaxPipe = idx(H, ['최대장배관','최대장배관','배관길이']);
    const iMaxDrop = idx(H, ['최대고저차','최대고저차','고낙차']);

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
          weight: iWeight >= 0 ? row[iWeight] : '',
          packSize: iPackSize >= 0 ? row[iPackSize] : '',
          packWeight: iPackWeight >= 0 ? row[iPackWeight] : '',
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
        weight: iWeight >= 0 ? row[iWeight] : '',
        packSize: iPackSize >= 0 ? row[iPackSize] : '',
        packWeight: iPackWeight >= 0 ? row[iPackWeight] : '',
        grade: row[iEff]||'',
        maxPipe: row[iMaxPipe]||'',
        maxDrop: row[iMaxDrop]||''
      };
    }
  }

  scanHome();
  scanSingle();
  scanComm();

  cachePutJSON_(key, out, 60*10);
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

// 조회
function callZoneApi(comCode){
  Logger.log('🌐 조회');
  const res = UrlFetchApp.fetch('http://152.69.228.109:3000/proxy/ecount/zone',{
    method:'post', contentType:'application/json',
    payload:JSON.stringify({COM_CODE:comCode}), muteHttpExceptions:true
  });
  if (res.getResponseCode()!==200) throw new Error('실패');
  const zone = (JSON.parse(res.getContentText())||{}).Data?.ZONE;
  if (!zone) throw new Error('값없음');
  return zone;
}

// 로그인
function getEcountSession(){
  Logger.log('🔑 세션발급');
  const { COM_CODE, USER_ID, API_CERT_KEY } = getScriptCreds_();
  if (!COM_CODE||!USER_ID||!API_CERT_KEY) throw new Error('정보누락');
  const key = 'ECOUNT_SESSION_'+COM_CODE+'_'+USER_ID;
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
  if (res.getResponseCode()!==200) throw new Error('실패');
  const sessionId = (JSON.parse(res.getContentText())||{}).Data?.Datas?.SESSION_ID;
  if (!sessionId) throw new Error('값없음');
  cache.put(key, JSON.stringify({sessionId, zone}), 3000);
  return { sessionId, zone };
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

// 주문 전송
function sendOrderFromUi(items, order){
  try{
    const safeNum = s => String(s||'').replace(/[^\d]/g,'');
    const kst = Session.getScriptTimeZone();
    const toYmd = v => toYmd_(v, kst);
    const toMmdd = v => toMmDd_(v, kst);
    if (!Array.isArray(items)||items.length===0) return { ok:false, error:'항목 없음' };

    // 주문 타입 판별
    const isHomeOrder = detectHomeOrder(items, order);
    // SET 단위지만 세트로 보내지 않는 행 제거
    const cleaned = items.filter(it =>
      !(String(it.unit||'').toUpperCase()==='SET' && it.section === 'SET' && it.sendAsSet !== true)
    );
    // 매핑
    const merged = cleaned.map((it, idx) => ({
      ...it,
      qty: Number(it.qty) || 0,
      _last: idx,
      REMARKS: String(it.remarks || it.REMARKS || '')
    }));
    // 거래처 찾기
    let key = safeNum(order?.bizno||'');
    if (!key && order?.custCode) key = String(order.custCode).trim();
    if (!key) return { ok:false, error:'사업자등록번호 없음' };
    const custRec = searchCustomerByBizOrCode(key);
    if (!custRec) return { ok:false, error:'미등록 거래처' };
    const custFinal = custRec.code;

    // 접속 기기 확인
    const deviceTag = order.isMobile ? '(모바일)' : '(PC)';

    // 로그용 정보 설정
    logKey = key;
    logName = custRec.name || '거래처';

    // 주문 전송 시도 알림
    logActionToNotion(logKey, logName, `주문 전송 완료 (총 ${items.length}개 품목) ${deviceTag}`);

    // 이카운트 세션
    const { sessionId, zone } = getEcountSession();
    // 날짜/창고
    const dueYmd = toYmd(order?.due||'') || todayYMD_();
    const ioDate = dueYmd;
    const whCd = decideWarehouseCode_(merged);
    const timeDate = dueYmd;
    const payMMDD = toMmdd(order?.payDue||'');

    // 배송주소/감리주소/전화/비고
    const addrShip  = String(order?.addr||'');
    const addrAudit = String(order?.auditAddr||'').trim() ? String(order.auditAddr).trim() : '-';
    const tel       = normalizeTel_(order?.tel||'');
    const memo      = String(order?.memo||'');

    // 담당자
    const mgrNameFromCust = String(custRec.manager || '').trim();
    let empCdFinal = '';

    if (mgrNameFromCust) {
      const m = findManagerByNameExact_(mgrNameFromCust);
      if (m && m.empCd) empCdFinal = m.empCd;
    }

    // 거래처 담당자 없는 경우
    if (!empCdFinal) {
      empCdFinal = getScriptCreds_().EMP_CD;
    }

    // 규격 매핑
    const specMap = getSpecMap_();
    let prevSpecNorm = null;
    // 싱글 세트 규격 맵(세트모델+구성품모델 기준)
    const singleSpecBySetKey = {};
    const singleSetModelById = {};
    try {
      const ssList = getSingleSets();
      ssList.forEach(function(s){
        if (!s) return;
        const sid = String(s.id || '').trim();
        const sm  = String(s.model || '').trim();
        if (!sid || !sm) return;
        if (!singleSetModelById[sid]) singleSetModelById[sid] = sm;
      });
      const spList = getSingleParts();
      spList.forEach(function(p){
        if (!p) return;
        const setModel = String(p.setModel || '').trim();
        const model    = String(p.model   || '').trim();
        const spec     = String(p.spec    || '').trim();
        if (!setModel || !model || !spec) return;
        const key2 = setModel + '|' + model;
        if (!singleSpecBySetKey[key2]) singleSpecBySetKey[key2] = spec;
      });
    } catch(e) {
      Logger.log('>> ⚠️ 싱글 세트 규격 맵 생성 오류: ' + e);
    }

    // DC 설정(노션 + 기본값)
    const dcCfg = initDcConfigFromNotion(key);
    const homeRate = (order && typeof order.homeRate === 'number')
      ? order.homeRate
      : ((dcCfg && typeof dcCfg.homeDiscount === 'number' && isFinite(dcCfg.homeDiscount))
          ? dcCfg.homeDiscount
          : (typeof DISCOUNT_RATE_HOME === 'number' ? DISCOUNT_RATE_HOME : null));
    const commRate = (order && typeof order.commRate === 'number')
      ? order.commRate
      : ((dcCfg && typeof dcCfg.commDiscount === 'number' && isFinite(dcCfg.commDiscount))
          ? dcCfg.commDiscount
          : (typeof DISCOUNT_RATE_COMM === 'number' ? DISCOUNT_RATE_COMM : null));
    const discountRate =
      (typeof order?.discountRate === 'number' && isFinite(order.discountRate))
        ? order.discountRate
        : (homeRate != null ? homeRate : null);
    const discountPctText = (discountRate!=null && isFinite(discountRate))
      ? `${Math.round(discountRate * 100)}%` : '';
    // 전역 DC/세트 DC 사전 계산
    const hasHome   = merged.some(it => String(it.section||'').toUpperCase()==='HOME');
    const hasComm   = merged.some(it => String(it.section||'').toUpperCase()==='COMM');
    const hasSingle = merged.some(it => String(it.section||'').toUpperCase()==='SINGLE');
    // 전역 DC 텍스트
    let globalDcText = '';
    if (hasHome && hasComm && homeRate!=null && commRate!=null) {
      globalDcText = `${formatPercentLabel_(commRate)} / ${formatPercentLabel_(homeRate)}`;
    } else if (hasHome && homeRate!=null) {
      globalDcText = formatPercentLabel_(homeRate);
    } else if (hasComm && commRate!=null) {
      globalDcText = formatPercentLabel_(commRate);
    }

    // 전역 DC를 넣을 적요 라인(두 번째 줄)
    const globalDcIndex = (globalDcText && merged.length > 1) ? 1 : -1;

    // 세트별 DC 라벨(싱글 세트)
    const singleSetDcBySetId = {};
    if (hasSingle) {
      const d360   = Number((dcCfg && dcCfg.discount360 != null) ? dcCfg.discount360 : (typeof DISCOUNT_360_AMT !== 'undefined' ? DISCOUNT_360_AMT : 0));
      const d4way  = Number((dcCfg && dcCfg.discount4way != null) ? dcCfg.discount4way : (typeof DISCOUNT_4WAY_AMT !== 'undefined' ? DISCOUNT_4WAY_AMT : 0));
      const dStand = Number((dcCfg && dcCfg.discountStand != null) ? dcCfg.discountStand : (typeof DISCOUNT_STAND_AMT !== 'undefined' ? DISCOUNT_STAND_AMT : 0));
      const d1w      = Number((dcCfg && dcCfg.oneWayDiscount != null) ? dcCfg.oneWayDiscount : (typeof ONEWAY_DISCOUNT_AMT    !== 'undefined' ? ONEWAY_DISCOUNT_AMT    : 0));
      const dDeluxe  = Number((dcCfg && dcCfg.deluxeDiscount != null) ? dcCfg.deluxeDiscount : (typeof DELUXE_DISCOUNT_AMT    !== 'undefined' ? DELUXE_DISCOUNT_AMT    : 0));
      const dFirst   = Number((dcCfg && dcCfg.firstGradeDiscount != null) ? dcCfg.firstGradeDiscount : (typeof FIRSTGRADE_DISCOUNT_AMT !== 'undefined' ? FIRSTGRADE_DISCOUNT_AMT : 0));

      merged.forEach((it, idx)=>{
        if (String(it.section||'').toUpperCase()!=='SINGLE') return;
        if (!it.setId || !it.isSetHead) return;

        const labels = [];
        if (it.has360 && d360 > 0) { const t = formatWonDiscountLabel_(d360); if (t) labels.push(t); }
        if (it.has4way && d4way > 0) { const t = formatWonDiscountLabel_(d4way); if (t) labels.push(t); }
        if (it.hasStand && dStand > 0) { const t = formatWonDiscountLabel_(dStand); if (t) labels.push(t); }
        if (it.hasOneWayDc && d1w > 0) { const t = formatWonDiscountLabel_(d1w); if (t) labels.push(t); }
        if (it.hasDeluxeDc && dDeluxe > 0) { const t = formatWonDiscountLabel_(dDeluxe); if (t) labels.push(t); }
        if (it.hasGrade1Dc && dFirst > 0) { const t = formatWonDiscountLabel_(dFirst); if (t) labels.push(t); }
        if (!labels.length) return;

        singleSetDcBySetId[it.setId] = {
          index: idx,
          label: labels.join(' / ')
        };
      });
    }

    const SaleOrderList = [];
    let lineIndex = 0;
    merged.forEach((it)=>{
      const qty = Math.round(Number(it.qty)||0);
      if (qty<=0) return;

      const priceVat = Math.round(Number(it.price)||0);
      const total = priceVat * qty;
      const sup = Math.round(Math.abs(total)/1.1);
      const vat = Math.abs(total) - sup;
      const supply = total<0 ? -sup : sup;
      const vatAmt = total<0 ? -vat : vat;
      const priceEx = priceVat<0 ? -Math.round(Math.abs(priceVat)/1.1) : Math.round(priceVat/1.1);

      const sect = String(it.section || '').toUpperCase();

      // 규격: 싱글 세트는 세트모델+구성품모델 기준 우선
      let rawSpec = '';
      if (sect === 'SINGLE' && it.setId != null) {
        const setIdStr = String(it.setId);
        const setModel = singleSetModelById[setIdStr];
        if (setModel) {
          const key2 = setModel + '|' + String(it.model || '');
          if (singleSpecBySetKey[key2]) {
            rawSpec = String(singleSpecBySetKey[key2]);
          }
        }
      }
      if (!rawSpec) {
        rawSpec = String(specMap[it.model] || '');
      }

      const norm = _normSpec_(rawSpec);
      const sizeDes = (!norm || (prevSpecNorm!==null && norm===prevSpecNorm)) ? "\u200B" : rawSpec;
      if (norm) prevSpecNorm = norm;

      const idx = lineIndex++;
      // 첫 줄 주소, 나머지는 비움
      let remarksVal = '';
      if (idx === 0) {
        remarksVal = addrShip || String(custRec.addr||'');
      }

      // 전역 DC(홈/상업) 한 번만
      if (idx === globalDcIndex && globalDcText) {
        remarksVal = combineRemarks_(remarksVal, globalDcText);
      }

      // 고정DC
      const fixedDcRate = (typeof it.fixedDc === 'number') ? it.fixedDc : null;
      if (fixedDcRate!=null && isFinite(fixedDcRate) && fixedDcRate>0) {
        const fixedPercent = Math.round(fixedDcRate * 100);
        const fixedText = `${fixedPercent}%`;
        if (!remarksVal) {
          remarksVal = fixedText;
        } else {
          remarksVal = combineRemarks_(remarksVal, fixedText);
        }
      }

      // 싱글 세트 DC(-N만)
      if (sect === 'SINGLE' && it.setId && singleSetDcBySetId[it.setId]) {
        const info = singleSetDcBySetId[it.setId];
        if (info.index === idx) {
          remarksVal = combineRemarks_(remarksVal, info.label);
        }
      }

      SaleOrderList.push({ BulkDatas:{
        IO_DATE: ioDate,
        UPLOAD_SER_NO: "1",
        CUST: custFinal,
        CUST_DES: String(custRec.name||''),
        EMP_CD: String(empCdFinal||''),
        WH_CD: whCd,
        IO_TYPE: "",
        PJT_CD: "",
        TTL_CTT: "",
        REF_DES: "",
        COLL_TERM: "",
        AGREE_TERM: "",
        TIME_DATE: timeDate,

        // 거래처 특이사항/배송/감리/인수자/비고/입금예정
        U_TXT1: addrShip,
        ADD_TXT_01_T: addrAudit,
        ADD_TXT_02_T: "",
        ADD_TXT_03_T: tel || String(custRec.tel||''),
        ADD_TXT_04_T: memo,
        ADD_TXT_05_T: payMMDD,

        // 메모 슬롯(전화/주소/대표자)
        U_MEMO1: String(custRec.tel||''),
        U_MEMO2: String(custRec.addr||''),
        U_MEMO3: String(custRec.rep||''),
        U_MEMO4: "",
        U_MEMO5: "",

        // 품목
        PROD_CD: String(it.model),
        PROD_DES: "",
        SIZE_DES: sizeDes,
        QTY: String(qty),
        PRICE: String(priceEx),
        USER_PRICE_VAT: String(Math.abs(priceVat)),
        SUPPLY_AMT_F: "0",
        SUPPLY_AMT: String(supply),
        VAT_AMT: String(vatAmt),

        // 적요
        REMARKS: remarksVal
      }});
    });

    if (!SaleOrderList.length) return { ok:false, error:'항목없음' };

    Logger.log('📤 전송');
    const url = `http://152.69.228.109:3000/proxy/ecount/saleorder`;
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ SESSION_ID: sessionId, ZONE: zone, payload: { SaleOrderList } }),
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    const text = res.getContentText();
    let body; try{ body = JSON.parse(text); } catch(e){ body = { raw:text }; }
    const ok = (code===200) && (body?.Data?.SuccessCnt > 0);

    // 메일알림 및 발송내역 노션 저장
    if (ok) {

      let totalAmt = 0; // 총 합계

      try {
        const mailTo = 'samhan00@daum.net';
        const nowStr = Utilities.formatDate(new Date(), kst, 'yyyy-MM-dd HH:mm:ss');
        const dueStr = (dueYmd && dueYmd.length===8) ? 
          dueYmd.replace(/(\d{4})(\d{2})(\d{2})/, '$1/$2/$3') : dueYmd;
        const cName = String(custRec.name||'거래처');
        
        /* 기본값할당 */
        const finalMgrName = mgrNameFromCust || '미지정';
        const finalAddr = addrShip || String(custRec.addr||'');
        const finalTel = tel || String(custRec.tel||'');
        const finalMemo = memo || '-';
        
        let trs = '';

        merged.forEach(m => {
           const pn = String(m.name||'');
           const md = String(m.model||'');
           const qt = Number(m.qty)||0;
           const pr = Number(m.price)||0;
           const st = qt * pr;
           
           totalAmt += st;

           trs += `
             <tr style="border-bottom:1px solid #eee;">
               <td style="padding:8px;border:1px solid #ddd;">${pn}</td>
               <td style="padding:8px;border:1px solid #ddd;text-align:center;">${md}</td>
               <td style="padding:8px;border:1px solid #ddd;text-align:center;">${qt.toLocaleString()}</td>
               <td style="padding:8px;border:1px solid #ddd;text-align:right;">${pr.toLocaleString()}</td>
               <td style="padding:8px;border:1px solid #ddd;text-align:right;">${st.toLocaleString()}</td>
             </tr>`;
        });

        /* 합계행 */
        trs += `
          <tr style="background:#fafafa; font-weight:bold;">
            <td colspan="4" style="padding:8px;border:1px solid #ddd;text-align:center;">합계</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:right;">${totalAmt.toLocaleString()}</td>
          </tr>`;

        /* 양식조립 */
        const html = `
          <div style="font-family:sans-serif;line-height:1.6;">
            <p><strong>${cName}</strong>님께서 이카운트 주문서를 발송하였습니다.<br>발송시각: ${nowStr}</p>
            
            <table style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #ddd;margin-bottom:15px;">
              <tbody>
                <tr>
                  <th style="padding:8px;border:1px solid #ddd;background:#f8f9fa;width:120px;text-align:center;">삼한영업담당자</th>
                  <td style="padding:8px;border:1px solid #ddd;text-align:center;">${finalMgrName}</td>
                </tr>
                <tr>
                  <th style="padding:8px;border:1px solid #ddd;background:#f8f9fa;text-align:center;">출고요청일</th>
                  <td style="padding:8px;border:1px solid #ddd;text-align:center;">${dueStr}</td>
                </tr>
                <tr>
                  <th style="padding:8px;border:1px solid #ddd;background:#f8f9fa;text-align:center;">배송주소</th>
                  <td style="padding:8px;border:1px solid #ddd;text-align:center;">${finalAddr}</td>
                </tr>
                <tr>
                  <th style="padding:8px;border:1px solid #ddd;background:#f8f9fa;text-align:center;">인수자번호</th>
                  <td style="padding:8px;border:1px solid #ddd;text-align:center;">${finalTel}</td>
                </tr>
                <tr>
                  <th style="padding:8px;border:1px solid #ddd;background:#f8f9fa;text-align:center;">특이사항</th>
                  <td style="padding:8px;border:1px solid #ddd;text-align:center;">${finalMemo}</td>
                </tr>
              </tbody>
            </table>

            <table style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #ddd;">
              <thead style="background:#f8f9fa;">
                <tr>
                  <th style="padding:8px;border:1px solid #ddd;">품목</th>
                  <th style="padding:8px;border:1px solid #ddd;">모델명</th>
                  <th style="padding:8px;border:1px solid #ddd;">수량</th>
                  <th style="padding:8px;border:1px solid #ddd;">단가(VAT포함)</th>
                  <th style="padding:8px;border:1px solid #ddd;">소계</th>
                </tr>
              </thead>
              <tbody>${trs}</tbody>
            </table>
            <br>
            <div style="background:#f5f5f5;padding:15px;font-size:12px;color:#555;">
              <p style="margin:4px 0;"><strong>주문서 확인 경로 :</strong> 이카운트 &gt;&gt; 재고 I &gt;&gt; 주문서 &gt;&gt; 주문서조회</p>
              <p style="margin:4px 0;"><strong>판매전표 생성 방법 :</strong> 해당 주문서 선택 후 하단 "다른전표생성" &gt;&gt; 판매전표 &gt;&gt; 전표라인별 &gt;&gt; 저장 &gt;&gt; "판매조회"에서 전표생성 확인</p>
            </div>
          </div>
        `;

        MailApp.sendEmail({
          to: mailTo,
          subject: `<${cName}>님께서 ${dueStr} 출고요청 주문서를 발송하였습니다.`,
          htmlBody: html
        });
        Logger.log('📧 메일발송성공 ' + mailTo);
      } catch(e) {
        Logger.log('⚠️ 메일발송실패 ' + e);
      }

      try {
        // 이카운트 응답에서 전표번호 추출
        let extractedIoNo = 0;
        if (body && body.Data && body.Data.SlipNos && body.Data.SlipNos.length > 0) {
           const rawSlip = String(body.Data.SlipNos[0] || '');
           Logger.log('>> 🔍 전표번호 원본: ' + rawSlip);

           const parts = rawSlip.split('-'); 
           // 전표번호 추출
           if (parts.length > 1) {
             extractedIoNo = parseInt(parts[1], 10) || 0;
           } else {
             extractedIoNo = parseInt(rawSlip, 10) || 0;
           }
        }
        
        // 날짜 포맷 변환
        const formatDate = (d) => {
          if (!d || d.length !== 8) return d; 
          return d.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
        };

        const notionCommon = {
          bizName: String(custRec.name || ''),    
          bizCode: custFinal,                     
          outDate: formatDate(dueYmd),            
          payDate: order.payDue ? order.payDue : '', 
          addr: addrShip,                         
          siteAddr: addrAudit,                    
          receiver: tel,                          
          note: memo                              
        };

        // 저장 함수 호출
        saveOrderToNotion(notionCommon, merged, extractedIoNo);
        
        Logger.log('>> ✅ 노션 저장 완료 (전표번호: ' + extractedIoNo + ')');

        logActionToNotion(logKey, logName, `주문 성공 ${deviceTag} - 전표번호: ${extractedIoNo}, 금액합계: ${totalAmt.toLocaleString()}원`);
      } catch (e) {
        Logger.log('>> ⚠️ 노션 저장 실패: ' + e);
      }
    } else {
        // 주문 실패
        const errText = body?.Data?.ResultDetails?.[0]?.TotalError || JSON.stringify(body);
        logActionToNotion(logKey, logName, `주문 실패 ${deviceTag} (이카운트 거부): ${errText}`);
    }

    return { ok, status:code, body, sentCount: SaleOrderList.length };
  }catch(e){
    logActionToNotion(logKey, logName, `주문 처리 중 시스템 에러 ${deviceTag}: ` + e);
    return { ok:false, error:String(e?.message||e) };
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
    // 캐시 키
    var cacheKey = 'NOTION_DC_' + raw;
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

    // 텍스트 값 읽기 (주문서PW용)
    var textProp = function (name) {
      var p = props[name];
      if (!p) return null;

      if (p.type === 'title' && Array.isArray(p.title) && p.title.length > 0) {
        var t = String(p.title[0].plain_text || '').trim();
        return t || null;
      }

      if (p.type === 'rich_text' && Array.isArray(p.rich_text) && p.rich_text.length > 0) {
        var joined = p.rich_text.map(function (r) {
          return r && r.plain_text ? r.plain_text : '';
        }).join('');
        joined = String(joined || '').trim();
        return joined || null;
      }

      if (Array.isArray(p.rich_text) && p.rich_text.length > 0) {
        var joined2 = p.rich_text.map(function (r) {
          return r && r.plain_text ? r.plain_text : '';
        }).join('');
        joined2 = String(joined2 || '').trim();
        return joined2 || null;
      }

      return null;
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

// 초기화
function initDcConfigFromNotion(bizno) {
  var raw = String(bizno || '').replace(/[^\d]/g, '');
  var cfg = buildDefaultDcConfig_();
  var cust = searchCustomerByBizOrCode(raw);
  var cName = cust ? cust.name : '미확인';

  if (!raw || raw.length !== 10) {
    Logger.log('>> ⚠️오류 ' + raw);
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

    let logParts = [
      `홈(${Math.round(cfg.homeDiscount * 100)}%)`,
      `상업(${Math.round(cfg.commDiscount * 100)}%)`
    ];
    if (cfg.discount360 > 0) logParts.push(`360(${cfg.discount360.toLocaleString()}원)`);
    if (cfg.discount4way > 0) logParts.push(`4way(${cfg.discount4way.toLocaleString()}원)`);
    if (cfg.oneWayDiscount > 0) logParts.push(`1way(${cfg.oneWayDiscount.toLocaleString()}원)`);
    if (cfg.discountStand > 0) logParts.push(`스탠드(${cfg.discountStand.toLocaleString()}원)`);
    if (cfg.deluxeDiscount > 0) logParts.push(`디럭스(${cfg.deluxeDiscount.toLocaleString()}원)`);
    if (cfg.firstGradeDiscount > 0) logParts.push(`1등급(${cfg.firstGradeDiscount.toLocaleString()}원)`);
    
    const logMsg = '할인율 로드: ' + logParts.join(' / ');
    logActionToNotion(raw, cName, logMsg);
    Logger.log('>> ⚙️적용 ' + raw);
  } else {
    Logger.log('>> ⚠️없음 ' + raw);
    logActionToNotion(raw, cName, '기본할인 적용');
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

// 인증상태확인
function checkAuthStatus(bizNo) {
  const cleanBiz = String(bizNo).replace(/[^\d]/g, '');
  if (!cleanBiz) return { status: 'ERROR', msg: '사업자번호 오류' };

  const sysConfig = fetchNotionDcConfig_(cleanBiz);
  if (!sysConfig) {
    const found = searchCustomerByBizOrCode(cleanBiz);
    if (!found) return { status: 'NOT_FOUND_SYSTEM' }; 
  }

  const authUser = queryAuthDb_(cleanBiz);
  
  if (!authUser) {
    return { status: 'NOT_FOUND_AUTH' }; 
  }

  const state = authUser.status;
  const pw = authUser.pw;
  const hasHistory = (authUser.pw1 || authUser.pw2 || authUser.pw3 || authUser.pw4 || authUser.pw5);

  if (state === '비밀번호 오류') return { status: 'LOCKED' };
  if (state === '장기미발주') return { status: 'LONG_UNUSED' };
  if (state === '접근제한') return { status: 'ACCESS_DENIED' };
  if (state === '미승인') return { status: 'PENDING' };
  
  if (state === '승인') {
    if (!pw) {
      if (hasHistory) return { status: 'PW_EXPIRED' }; 
      return { status: 'NEED_PW_SET' }; 
    }
    return { status: 'NEED_PW_INPUT' };
  }

  return { status: 'ERROR', msg: '알 수 없는 상태' };
}

// 승인 요청 (미승인 -> 요청)
function requestAuthApproval(bizNo, isMobile) {
  const cleanBiz = String(bizNo).replace(/[^\d]/g, '');
  // 거래처명 조회
  const found = searchCustomerByBizOrCode(cleanBiz);
  const name = found ? found.name : '미확인 거래처';
  const deviceTag = isMobile ? '(모바일)' : '(PC)';

  try {
    createAuthRow_(cleanBiz, name);
    logActionToNotion(cleanBiz, name, `최초 승인 요청 (비밀번호 설정 대기) ${deviceTag}`);
    return { status: 'OK' };
  } catch (e) {
    logActionToNotion(cleanBiz, name, `승인 요청 실패 ${deviceTag}: ` + e);
    return { status: 'ERROR', msg: e.message };
  }
}

// 비밀번호 설정
function setAuthPassword(bizNo, newPw, isMobile) {
  const cleanBiz = String(bizNo).replace(/[^\d]/g, '');
  const user = queryAuthDb_(cleanBiz);
  
  // 로그용 정보 및 이름 추출
  const custInfo = searchCustomerByBizOrCode(cleanBiz);
  const bizName = custInfo ? custInfo.name : '미확인 거래처';
  const repName = custInfo ? custInfo.rep : '';
  const deviceTag = isMobile ? '(모바일)' : '(PC)';

  if (!user) {
    logActionToNotion(cleanBiz, bizName, `비밀번호 설정 실패: 사용자 없음 ${deviceTag}`);
    return { status: 'ERROR', msg: '사용자 없음' };
  }

  // 중복 검사
  const pastPwList = [user.pw1, user.pw2, user.pw3, user.pw4, user.pw5];
  const targetPw = String(newPw);
  const base64Pw = Utilities.base64Encode(Utilities.newBlob(targetPw, 'text/plain', 'utf-8').getBytes());
  const hashedPw = hashPassword_(targetPw);

  if (pastPwList.includes(targetPw) || pastPwList.includes(base64Pw) || pastPwList.includes(hashedPw)) {
    logActionToNotion(cleanBiz, bizName, `비밀번호 재사용 시도됨 ${deviceTag}`);
    return { status: 'USED_PW' };
  }

  // 통과 시 진행
  try {
    updateAuthPage_(user.pageId, {
      '현재PW': { rich_text: [{ text: { content: hashedPw } }] }
    });
    logActionToNotion(cleanBiz, bizName, `비밀번호 설정 완료 ${deviceTag}`);
    return { status: 'OK', custName: bizName, repName: repName, tutPc: user.tutPc, tutMo: user.tutMo };
  } catch (e) {
    logActionToNotion(cleanBiz, bizName, `비밀번호 설정 시스템 에러 ${deviceTag}: ` + e);
    return { status: 'ERROR', msg: e.message };
  }
}

// 해시변환
function hashPassword_(pw) {
  const raw = String(pw || '');
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

// 로그인시도
function tryLogin(bizNo, inputPw, isMobile) {
  const cleanBiz = String(bizNo).replace(/[^\d]/g, '');
  const user = queryAuthDb_(cleanBiz);
  
  const custInfo = searchCustomerByBizOrCode(cleanBiz);
  const bizName = custInfo ? custInfo.name : '미확인 거래처';
  const repName = custInfo ? custInfo.rep : '';
  const deviceTag = isMobile ? '(모바일)' : '(PC)';
  
  if (!user) {
    logActionToNotion(cleanBiz, '알수없음', `로그인 실패: 사용자 없음 ${deviceTag}`);
    return { status: 'ERROR', msg: '사용자 없음' };
  }

  if (user.status === '잠김' || user.status === '비밀번호 오류') {
    return { status: 'LOCKED' };
  }
  if (user.status === '장기미사용') {
    return { status: 'LONG_UNUSED' };
  }
  if (user.status === '접근제한') {
    return { status: 'ACCESS_DENIED' };
  }

  const plainPw = String(inputPw);
  const base64Pw = Utilities.base64Encode(Utilities.newBlob(plainPw, 'text/plain', 'utf-8').getBytes());
  const hashedPw = hashPassword_(plainPw);
  const storedPw = String(user.pw);

  let isMatch = false;
  let needsMigration = false;

  if (storedPw === hashedPw) {
    isMatch = true;
  } else if (storedPw === plainPw || storedPw === base64Pw) {
    isMatch = true;
    needsMigration = true;
  }

  if (isMatch) {
    const propsToUpdate = {};
    
    if (user.retry > 0) {
      propsToUpdate['재시도횟수'] = { number: 0 };
    }

    if (needsMigration) {
      propsToUpdate['현재PW'] = { rich_text: [{ text: { content: hashedPw } }] };
    }

    if (Object.keys(propsToUpdate).length > 0) {
      updateAuthPage_(user.pageId, propsToUpdate);
    }

    const config = initDcConfigFromNotion(cleanBiz);
    logActionToNotion(cleanBiz, bizName, `로그인 성공 / 설정 로드됨 ${deviceTag}`);
    return { status: 'OK', config: config, custName: bizName, repName: repName, tutPc: user.tutPc, tutMo: user.tutMo };
  } else {
    const newCount = (user.retry || 0) + 1;
    const props = { '재시도횟수': { number: newCount } };
    
    let status = 'WRONG_PW';
    if (newCount >= 3) {
      props['승인상태'] = { select: { name: '비밀번호 오류' } };
      status = 'LOCKED';
      logActionToNotion(cleanBiz, bizName, `비밀번호 3회 오류로 계정 제한 ${deviceTag}`);
    } else {
      logActionToNotion(cleanBiz, bizName, `로그인 실패 (비밀번호 불일치 ${newCount}회) ${deviceTag}`);
    }
    updateAuthPage_(user.pageId, props);
    return { status: status, count: newCount };
  }
}

// 인증 DB 데이터 조회
function queryAuthDb_(bizNo) {
  const url = `https://api.notion.com/v1/databases/${NOTION_DB_ID_AUTH}/query`;
  const payload = {
    filter: { property: '거래처코드', title: { equals: bizNo } }
  };
  
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + NOTION_TOKEN_AUTH,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  
  const json = JSON.parse(res.getContentText());
  if (!json.results || json.results.length === 0) return null;
  
  const page = json.results[0];
  const props = page.properties;
  
  return {
    pageId: page.id,
    createdTime: page.created_time,
    tempAuthTime: props['임시승인']?.date?.start || '',
    bizNo: props['거래처코드']?.title?.[0]?.plain_text || '',
    status: props['승인상태']?.select?.name || '',
    pw: props['현재PW']?.rich_text?.[0]?.plain_text || '',
    retry: props['재시도횟수']?.number || 0,
    pw1: props['과거1']?.rich_text?.[0]?.plain_text || '',
    pw2: props['과거2']?.rich_text?.[0]?.plain_text || '',
    pw3: props['과거3']?.rich_text?.[0]?.plain_text || '',
    pw4: props['과거4']?.rich_text?.[0]?.plain_text || '',
    pw5: props['과거5']?.rich_text?.[0]?.plain_text || '',
    tutPc: props['PC버전 튜토리얼']?.checkbox || false,
    tutMo: props['모바일버전 튜토리얼']?.checkbox || false
  };
}

// 주문서 사용기한 계산 로직
function getAccessExpiration(bizNo) {
  const cleanBiz = String(bizNo).replace(/[^\d]/g, '');
  const user = queryAuthDb_(cleanBiz);
  if (!user) return { status: 'ERROR' };

  const NOTION_TOKEN_LOG = 'REDACTED_NOTION_TOKEN';
  const NOTION_DB_ID_LOG = '2eda1006d65880d696b3da4a8d281ea2';
  const NOTION_TOKEN_SHIPPING = 'REDACTED_NOTION_TOKEN';
  const NOTION_DB_ID_SHIPPING = '2f8a1006d658803face6fdfe2b175780';

  // 로그 및 출고 내역에서 최신 시점 조회
  const getLatestTime = (dbId, isLog) => {
    const url = `https://api.notion.com/v1/databases/${dbId}/query`;
    const filter = isLog ? {
      and: [
        { property: '거래처코드', number: { equals: Number(cleanBiz) } },
        { property: '로그', rich_text: { contains: '주문 성공' } }
      ]
    } : {
      property: '거래처코드', number: { equals: Number(cleanBiz) }
    };
    
    const payload = { 
      filter: filter, 
      sorts: [{ timestamp: 'created_time', direction: 'descending' }], 
      page_size: 1 
    };
    
    try {
      const res = UrlFetchApp.fetch(url, {
        method: 'post',
        headers: { 
          'Authorization': 'Bearer ' + (isLog ? NOTION_TOKEN_LOG : NOTION_TOKEN_SHIPPING), 
          'Notion-Version': '2022-06-28', 
          'Content-Type': 'application/json' 
        },
        payload: JSON.stringify(payload), 
        muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200) {
        const json = JSON.parse(res.getContentText());
        if (json.results && json.results.length > 0) return new Date(json.results[0].created_time).getTime();
      }
    } catch (e) {
      Logger.log("최신 시간 조회 에러: " + e);
    }
    return 0;
  };

  const logTime = getLatestTime(NOTION_DB_ID_LOG, true);
  const shipTime = getLatestTime(NOTION_DB_ID_SHIPPING, false);
  const createdTime = new Date(user.createdTime).getTime();
  
  // 일반 활동
  const baseTime = Math.max(createdTime, logTime, shipTime);
  const standardExpTime = baseTime + (30 * 24 * 60 * 60 * 1000);

  // 임시 승인
  let tempExpTime = 0;
  if (user.tempAuthTime) {
    const tDate = new Date(user.tempAuthTime);
    const dayOfWeek = tDate.getDay(); // 0: 일요일, 1: 월요일... 6: 토요일
    const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    tempExpTime = tDate.getTime() + (daysToSunday * 24 * 60 * 60 * 1000);
  }

  // 최종 기한
  const finalMaxTime = Math.max(standardExpTime, tempExpTime);

  // KST 포맷팅
  const kstDate = new Date(finalMaxTime + (9 * 60 * 60 * 1000));
  const yyyy = kstDate.getUTCFullYear();
  const mm = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kstDate.getUTCDate()).padStart(2, '0');

  return { status: 'OK', expireDate: `${yyyy}.${mm}.${dd}` };
}

// 튜토리얼저장
function saveTutorialState(bizNo, isMobile) {
  try {
    const cleanBiz = String(bizNo).replace(/[^\d]/g, '');
    const user = queryAuthDb_(cleanBiz);
    if (!user) throw new Error('사용자를 찾을 수 없습니다.');
    
    const props = {};
    if (isMobile) {
      props['모바일버전 튜토리얼'] = { checkbox: true };
    } else {
      props['PC버전 튜토리얼'] = { checkbox: true };
    }
    
    updateAuthPage_(user.pageId, props);
    Logger.log(`🏁 튜토리얼저장 완료: ${cleanBiz} (${isMobile ? '모바일' : 'PC'})`);
    return { success: true };
  } catch (e) {
    Logger.log('❌ 튜토리얼저장 실패: ' + e);
    return { success: false, error: String(e) };
  }
}

// 인증 DB 데이터추가
function createAuthRow_(bizNo, name) {
  const url = 'https://api.notion.com/v1/pages';
  const payload = {
    parent: { database_id: NOTION_DB_ID_AUTH },
    properties: {
      '거래처코드': { title: [{ text: { content: bizNo } }] },
      '거래처명': { rich_text: [{ text: { content: name } }] },
      '승인상태': { select: { name: '미승인' } },
      '재시도횟수': { number: 0 }
    }
  };
  
  UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + NOTION_TOKEN_AUTH,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload)
  });
}

// 인증 DB 데이터 업데이트
function updateAuthPage_(pageId, props) {
  const url = `https://api.notion.com/v1/pages/${pageId}`;
  const res = UrlFetchApp.fetch(url, {
    method: 'patch',
    headers: {
      'Authorization': 'Bearer ' + NOTION_TOKEN_AUTH,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({ properties: props }),
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  if (code !== 200) {
    throw new Error(res.getContentText());
  }
}

function _triggerAuth() {
  var quota = MailApp.getRemainingDailyQuota();
  Logger.log("메일 잔여량: " + quota);
}

function forceAuthCheck() {
  const draft = GmailApp.createDraft("me@example.com", "Auth Test", "Auth Test");
  draft.deleteDraft(); 
  console.log("✅ Gmail 권한 인증 완료!");
}

/* 주문내역가져오기 */
function getOrderHistory(bizNo, dateType, startDate, endDate) {
  const url = `https://api.notion.com/v1/databases/${NOTION_DB_ID_ORDER}/query`;
  
  let sortsConfig = [];
  if (dateType === '주문일시') {
    sortsConfig = [{ timestamp: 'created_time', direction: 'descending' }];
  } else {
    sortsConfig = [{ property: '출고희망일', direction: 'descending' }];
  }

  const options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + NOTION_TOKEN_ORDER,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };

  let rawResults = [];
  let hasMore = true;
  let nextCursor = null;

  try {
    Logger.log('🔍 내역조회');
    while (hasMore) {
      const payloadObj = {
        filter: {
          property: '거래처코드',
          number: { equals: Number(bizNo) }
        },
        sorts: sortsConfig,
        page_size: 100
      };
      if (nextCursor) payloadObj.start_cursor = nextCursor;
      options.payload = JSON.stringify(payloadObj);

      const res = UrlFetchApp.fetch(url, options);
      if (res.getResponseCode() === 200) {
        const data = JSON.parse(res.getContentText());
        rawResults = rawResults.concat(data.results || []);
        hasMore = data.has_more;
        nextCursor = data.next_cursor;
      } else {
        hasMore = false;
        Logger.log('⚠️ 응답실패');
      }
    }

    /* 날짜필터수정 */
    rawResults = rawResults.filter(page => {
      const p = page.properties;
      let targetDate = '';
      
      if (dateType === '주문일시') {
        const utcTime = new Date(page.created_time).getTime();
        targetDate = new Date(utcTime + (9 * 60 * 60 * 1000)).toISOString();
      } else {
        targetDate = p['출고희망일']?.date?.start || '';
      }

      if (!targetDate) return false;
      const ymd = targetDate.slice(0, 10);
      return ymd >= startDate && ymd <= endDate;
    });

    const orders = [];

    // 속성 추출 유틸
    const getText = (p) => p?.rich_text?.[0]?.plain_text || '';
    const getTitle = (p) => p?.title?.[0]?.plain_text || '';
    const getDate = (p) => p?.date?.start || '';
    const getNum = (p) => p?.number || 0;
    const getPhone = (p) => p?.phone_number || '';

    for (const page of rawResults) {
      const p = page.properties;
      const utcTime = new Date(page.created_time).getTime();
      const kstIso = new Date(utcTime + (9 * 60 * 60 * 1000)).toISOString();

      const ioNo = getNum(p['전표번호']);
      const outDate = getDate(p['출고희망일']);
      
      const headerKey = JSON.stringify({
        biz: getNum(p['거래처코드']),
        out: outDate,
        ioNo: ioNo,
        addr: getText(p['배송주소'])
      });

      // 노션 Base64 데이터 읽기
      const dataProps = p['품목데이터']?.rich_text || [];
      const base64Items = dataProps.map(t => t.text.content).join('');
      
      let parsedItems = [];
      try {
        if (base64Items) {
          const decodedStr = Utilities.newBlob(Utilities.base64Decode(base64Items)).getDataAsString();
          parsedItems = JSON.parse(decodedStr);
        }
      } catch(e) {
        Logger.log('💥 에러발생');
      }

      // 프론트엔드 표시에 맞게 배열 매핑 + 역순(.reverse()) 추가
      const mappedItems = parsedItems.reverse().map(it => ({
        name: it.name || '',
        model: it.model || '',
        qty: Number(it.qty) || 0,
        price: Number(it.price) || 0,
        subtotal: (Number(it.qty) || 0) * (Number(it.price) || 0)
      }));

      orders.push({
        key: headerKey,
        orderDate: kstIso,
        bizName: getTitle(p['거래처명']),
        outDate: outDate,
        payDate: getDate(p['결제예정일']),
        addr: getText(p['배송주소']),
        siteAddr: getText(p['현장주소']),
        receiver: getPhone(p['인수자 번호']),
        note: getText(p['특이사항']),
        ioNo: ioNo,
        items: mappedItems
      });
    }

    return orders;

  } catch (e) {
    Logger.log('💥 에러발생');
    return [];
  }
}

// 주문 저장
function saveOrderToNotion(common, items, ioNo) {
  const url = 'https://api.notion.com/v1/pages';
  const headers = {
    'Authorization': 'Bearer ' + NOTION_TOKEN_ORDER,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
  };

  if (!items || !Array.isArray(items) || items.length === 0) return;

  // 1. 품목 배열을 Base64 문자열로 압축
  const jsonString = JSON.stringify(items);
  const itemsString = Utilities.base64Encode(Utilities.newBlob(jsonString).getBytes());

  // 2. 노션 텍스트 길이 제한(2000자) 돌파를 위한 분할
  const chunks = [];
  for (let i = 0; i < itemsString.length; i += 2000) {
    chunks.push({
      text: { content: itemsString.substring(i, i + 2000) }
    });
  }

  // 3. 단일 행 페이로드 구성 (개별 품목열 제거, 품목데이터 추가)
  const payload = {
    parent: { database_id: NOTION_DB_ID_ORDER },
    properties: {
      '거래처명': { title: [{ text: { content: common.bizName || '' } }] },
      '거래처코드': { number: Number(common.bizCode) || 0 },
      '전표번호': { number: Number(ioNo) || 0 },
      '배송주소': { rich_text: [{ text: { content: common.addr || '' } }] },
      '현장주소': { rich_text: [{ text: { content: common.siteAddr || '' } }] },
      '인수자 번호': { phone_number: common.receiver || null },
      '특이사항': { rich_text: [{ text: { content: common.note || '' } }] },
      '품목데이터': { rich_text: chunks } 
    }
  };

  // 날짜 처리
  if (common.outDate && common.outDate.length === 10) {
    payload.properties['출고희망일'] = { date: { start: common.outDate } };
  }
  if (common.payDate && common.payDate.length === 10) {
    payload.properties['결제예정일'] = { date: { start: common.payDate } };
  }

  try {
    UrlFetchApp.fetch(url, {
      method: 'post',
      headers: headers,
      payload: JSON.stringify(payload)
    });
    Logger.log('✅ 노션 주문 압축 저장 완료');
  } catch (e) {
    Logger.log('❌ 노션 저장 에러: ' + e);
  }
}

// 동작 로그 노션 기록
function logActionToNotion(bizCode, bizName, message) {
  const NOTION_TOKEN_LOG = 'REDACTED_NOTION_TOKEN';
  const NOTION_DB_ID_LOG = '2eda1006d65880d696b3da4a8d281ea2';
  
  const url = 'https://api.notion.com/v1/pages';
  const headers = {
    'Authorization': 'Bearer ' + NOTION_TOKEN_LOG,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
  };

  // 데이터 정제
  const safeBizCode = Number(String(bizCode).replace(/[^\d]/g, '')) || 0;
  const safeBizName = String(bizName || '미확인').trim();
  const safeMsg = String(message || '');

  const payload = {
    parent: { database_id: NOTION_DB_ID_LOG },
    properties: {
      '거래처명': { title: [{ text: { content: safeBizName } }] },
      '거래처코드': { number: safeBizCode },
      '로그': { rich_text: [{ text: { content: safeMsg } }] }
    }
  };

  try {
    UrlFetchApp.fetch(url, {
      method: 'post',
      headers: headers,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log('>> ❌ 로그 기록 실패: ' + e);
  }
}

// 프론트엔드 동작 로그 중계
function logFrontEvent(bizNo, action, detail, isMobile) {
  if (!bizNo) return;

  const cleanBiz = String(bizNo).replace(/[^\d]/g, '');

  // 거래처명 찾기
  const cust = searchCustomerByBizOrCode(cleanBiz);
  const name = cust ? cust.name : '미확인';
  const deviceTag = isMobile ? '(모바일)' : '(PC)';

  // 기존 노션 기록 함수 호출
  logActionToNotion(cleanBiz, name, `[${action}] ${detail} ${deviceTag}`);
}

// 네이버 개발자센터 검색 자격증명
const NAVER_SEARCH_ID = 'REDACTED_NAVER_SEARCH_ID';
const NAVER_SEARCH_SECRET = 'REDACTED_NAVER_SEARCH_SECRET';

// 네이버 클라우드 플랫폼 맵스 자격증명
const NAVER_MAP_KEY_ID = 'REDACTED_NAVER_MAP_KEY_ID';
const NAVER_MAP_KEY = 'REDACTED_NAVER_MAP_KEY';

// 도로명주소 API 자격증명 행안부
const ROAD_API_KEY = 'REDACTED_ROAD_API_KEY';
const BUILDING_API_KEY = 'REDACTED_BUILDING_API_KEY';

// 통합 주소 검색 상호 도로명 지오코딩 병렬
function searchNaverAddress(query) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, error: '검색어가 비었습니다.', items: [] };

  const reqs = buildAddressRequests_(q);
  let responses = [];
  try {
    responses = UrlFetchApp.fetchAll(reqs.map(function(r){ return r.req; }));
  } catch (e) {
    return { ok: false, error: '통신 오류 ' + (e && e.message || e), items: [] };
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
        muteHttpExceptions: true
      },
      parse: parseJusoResponse_
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
          'X-Naver-Client-Secret': NAVER_SEARCH_SECRET
        }
      },
      parse: parseNaverLocalResponse_
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
          'x-ncp-apigw-api-key': NAVER_MAP_KEY
        }
      },
      parse: parseNaverGeocodeResponse_
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
        roadAddress: road
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
        roadAddress: strip(it.roadAddress)
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
        roadAddress: road
      };
    });
  } catch (e) { return []; }
}