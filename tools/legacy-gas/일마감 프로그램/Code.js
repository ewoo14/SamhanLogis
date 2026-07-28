// 상수
const NOTION_TOKEN_AUTH = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_AUTH = '198a1006d65880ddb510e0d525c5e9da';
const NOTION_TOKEN_DATA = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_DATA = '193a1006d6588161a02cc8f196d7102b';
const NOTION_TOKEN_SAVE = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_SAVE = '32ca1006d65880058318e83dfabf6682';
const SOURCE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1RJqO3jT-yJTi3NDBhL60o_cZWlVETGTU7UlvIKXuVNQ/edit';

// 헤더
const FINAL_HEADERS = [
  'DC','일자','번호','창고명','품목명','수량','단가(VAT포함)','공급가액','부가세','합계',
  '거래처명','거래처코드','출고가','할인율','총계','확인','회계반영일자'
];

// 화면
function doGet() {
  Logger.log('🚀 시작');
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('삼한공조시스템 일마감 프로그램')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 인증
function getUserAuth() {
  Logger.log('🔐 인증');
  var email = Session.getActiveUser().getEmail();
  if (!email) {
    Logger.log('🛑 불가');
    return { authorized: false, email: '확인불가', error: '이메일 확인 불가' };
  }

  const url = `https://api.notion.com/v1/databases/${NOTION_DB_ID_AUTH}/query`;
  const options = {
    method: 'post',
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN_AUTH}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({
      filter: { property: '초대계정(지메일)', email: { equals: email } }
    }),
    muteHttpExceptions: true
  };

  try {
    const res = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(res.getContentText());
    if (res.getResponseCode() !== 200) {
      Logger.log('🛑 거부');
      return { authorized: false, email: email, error: '접근 거부' };
    }
    if (data.results && data.results.length > 0) {
      Logger.log('✅ 승인');
      const props = data.results[0].properties;
      const getTitle = (p) => p?.title?.[0]?.plain_text || '';
      const getSelect = (p) => p?.select?.name || '';
      const name = getTitle(props['이름']);
      const rank = getSelect(props['직급']);
      return { authorized: true, email: email, managerName: rank ? name + ' ' + rank : name };
    }
  } catch (e) {
    Logger.log('🛑 에러');
    return { authorized: false, email: email, error: String(e) };
  }
  Logger.log('⛔ 미등록');
  return { authorized: false, email: email, error: '미등록 계정' };
}

// 통신
function notionRequest_(path, method, payload, token, ver) {
  var url = 'https://api.notion.com' + path;
  var opts = {
    method: method || 'get',
    muteHttpExceptions: true,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Notion-Version': ver || '2022-06-28',
      'Content-Type': 'application/json'
    }
  };
  if (payload) opts.payload = JSON.stringify(payload);

  var attempts = 0;
  while (true) {
    attempts++;
    Logger.log('🔁 통신');
    var res = UrlFetchApp.fetch(url, opts);
    var code = res.getResponseCode();
    if (code === 429 || code >= 500) {
      Utilities.sleep(Math.min(15000, 500 * Math.pow(2, attempts)));
      if (attempts < 6) continue;
    }
    try { return { code: code, json: JSON.parse(res.getContentText()) }; } 
    catch (e) { return { code: code, json: null }; }
  }
}

// 매핑
function preload_notion_map_(dbId, token) {
  Logger.log('🌐 매핑 (데이터 소스 우회)');
  var mapping = {};
  
  // 데이터베이스 메타데이터 확인
  var meta = notionRequest_('/v1/databases/' + dbId, 'get', null, token, '2025-09-03');
  var dsList = (((meta || {}).json || {}).data_sources) || [];

  if (dsList && dsList.length > 0) {
    // 다중 데이터 소스가 있는 경우 우회 경로로 데이터 요청
    for (var i = 0; i < dsList.length; i++) {
      var cursor = null;
      while (true) {
        var payload = { page_size: 100 };
        if (cursor) payload.start_cursor = cursor;
        var q = notionRequest_('/v1/data_sources/' + dsList[i].id + '/query', 'post', payload, token, '2025-09-03');
        if (q.code >= 400) break;
        
        var results = (q.json && q.json.results) || [];
        for (var r = 0; r < results.length; r++) {
          var props = results[r].properties || {};
          var numVal = props['거래처코드']?.number;
          if (numVal != null && !isNaN(numVal)) mapping[String(Math.round(numVal))] = props;
        }
        if (!(q.json && q.json.has_more)) break;
        cursor = q.json.next_cursor;
      }
    }
  } else {
    // 일반 데이터베이스인 경우 기존 방식 사용
    var cursor2 = null;
    while (true) {
      var payload2 = { page_size: 100 };
      if (cursor2) payload2.start_cursor = cursor2;
      var q2 = notionRequest_('/v1/databases/' + dbId + '/query', 'post', payload2, token, '2022-06-28');
      if (q2.code >= 400) break;
      
      var results2 = (q2.json && q2.json.results) || [];
      for (var r2 = 0; r2 < results2.length; r2++) {
        var props2 = results2[r2].properties || {};
        var numVal2 = props2['거래처코드']?.number;
        if (numVal2 != null && !isNaN(numVal2)) mapping[String(Math.round(numVal2))] = props2;
      }
      if (!(q2.json && q2.json.has_more)) break;
      cursor2 = q2.json.next_cursor;
    }
  }
  Logger.log('✅ 완료');
  return mapping;
}

// 변환
function money_to_int_(x) {
  var s = String(x || '').trim().replace(/[^\d\.\-]/g, '');
  if (!s) return 0;
  var n = Number(s);
  return isNaN(n) ? 0 : Math.round(n);
}

// 정제
function clean_item_name_(name) {
  if (name == null) return "";
  return String(name).replace(/\[.*?\]|\(.*?\)|\{.*?\}/g, '').trim();
}

// 추출
function extractModelToken_(name) {
  if (!name) return "";
  var u = String(clean_item_name_(name)).toUpperCase();
  var m = u.match(/\b(AC|AP|AR|AF|AM|AJ|AXJ|PC|AWR|ARR)[A-Z0-9\-]{4,}\b/);
  if (m) return m[0];
  if (u.indexOf('AR-') === 0 || u.indexOf('ARR-') === 0) return u.split(' ')[0];
  return u;
}

// 싱글대상
function isTargetModelCode_(code) {
  if (!code) return false;
  var u = String(code).toUpperCase();
  if (/^A[CP]\d{3}/.test(u)) return true;
  if (/^AF\d{2}/.test(u)) return true;
  if (/^AR\d{2}/.test(u)) return true;
  return false;
}

// 분류
function classifyComp(m) {
  if (!m) return 'UNKNOWN';
  var u = String(m).toUpperCase();
  if (/^PC/.test(u)) return 'PANEL';
  if (/^AWR-/.test(u) || /^AR-/.test(u)) return 'REMOTE';
  if (/^A[CP]\d{3}/.test(u)) {
    if (u.length >= 7) {
      if (u[6] === 'N') return 'INDOOR';
      if (u[6] === 'X') return 'OUTDOOR';
    }
  }
  if (/^AR\d{2}/.test(u)) {
    if (u.length >= 12 && u.indexOf('-') === -1) {
      if (u[11] === 'N') return 'INDOOR';
      if (u[11] === 'X') return 'OUTDOOR';
      if (u[11] === 'Q') return 'SUB_INDOOR';
    }
  }
  if (/^AF\d{2}/.test(u)) {
    if (u.length >= 12) {
      if (u[11] === 'N') return 'INDOOR';
      if (u[11] === 'X') return 'OUTDOOR';
    }
  }
  return 'MATERIAL';
}

// 목록
function loadSingleSetCatalog(suffix) {
  Logger.log('🔗 구성품');
  var ss = SpreadsheetApp.openByUrl(SOURCE_SHEET_URL);
  var targetName = '싱글 구성품' + (suffix || '');
  var sh = ss.getSheetByName(targetName) || ss.getSheetByName('싱글 구성품');
  if (!sh) return null;
  var data = sh.getDataRange().getValues();
  var header = data[1].map(function(h) { return String(h || '').trim().replace(/\s+/g, ''); });
  
  var mIdx = header.indexOf('모델명');
  var sIdx = header.findIndex(function(h) { return /^세트$|^Set/i.test(h); });
  var cIdx = header.indexOf('구분');
  var pCols = [];
  for (var i = 0; i < header.length; i++) {
    if (header[i].indexOf('납품가') > -1) pCols.push(i);
  }
  var pIdx = pCols.length > 1 ? pCols[1] : (pCols[0] || 8);

  var setToComps = {};
  var indoorToSets = {};
  var itemClassMap = {};

  for (var i = 2; i < data.length; i++) {
    var rawName = data[i][mIdx];
    var token = extractModelToken_(rawName) || String(clean_item_name_(rawName)).toUpperCase();
    if (!token) continue;
    
    var setName = String(data[i][sIdx] || '').trim();
    var price = money_to_int_(data[i][pIdx]);
    
    var rawClass = cIdx > -1 ? String(data[i][cIdx] || '').trim() : '';
    var cls = 'MATERIAL';
    if (rawClass === '실내기') cls = 'INDOOR';
    else if (rawClass === '실외기') cls = 'OUTDOOR';
    else if (rawClass === '판넬') cls = 'PANEL';
    else if (rawClass === '리모컨') cls = 'REMOTE';
    else if (rawClass === '자재') cls = 'MATERIAL';
    else cls = classifyComp(token);
    
    itemClassMap[token] = cls;

    if (setName) {
      if (!setToComps[setName]) setToComps[setName] = [];
      setToComps[setName].push({ token: token, class: cls, price: price, raw: rawName });
      
      if (cls === 'INDOOR') {
        if (!indoorToSets[token]) indoorToSets[token] = [];
        if (indoorToSets[token].indexOf(setName) === -1) indoorToSets[token].push(setName);
      }
    }
  }
  return { setToComps: setToComps, indoorToSets: indoorToSets, itemClassMap: itemClassMap };
}

// 단가
function loadPriceMap_(suffix) {
  Logger.log('📊 단가');
  var ss = SpreadsheetApp.openByUrl(SOURCE_SHEET_URL);
  var map = { 'OLD': {}, 'HOME_MULTI': {}, 'COMM_MULTI': {}, 'SINGLE': {}, 'UNKNOWN': {} };
  
  var allSheets = ss.getSheets();
  allSheets.forEach(function(sh) {
    var sn = sh.getName();
    if (sn.indexOf('구형') > -1) {
      var data = sh.getDataRange().getValues();
      if (data.length < 4) return;
      var heads = data[2].map(function(h) { return String(h || '').replace(/\s+/g, '').toLowerCase(); });
      var mIdx = heads.indexOf('모델명');
      var nmIdx = heads.indexOf('품명');
      var pIdx = heads.indexOf('출고가');
      var dIdx = heads.indexOf('납품가');
      
      if (pIdx === -1 && dIdx > -1) pIdx = dIdx;

      if (mIdx > -1 && pIdx > -1) {
        for (var j = 3; j < data.length; j++) {
          var mStr = String(data[j][mIdx] || '').trim().toUpperCase();
          var price = money_to_int_(data[j][pIdx]);
          var delivery = dIdx > -1 ? money_to_int_(data[j][dIdx]) : 0;
          if (price > 0) {
            map['OLD'][mStr] = { price: price, deliveryPrice: delivery, isOld: true, nm: nmIdx > -1 ? String(data[j][nmIdx]).toUpperCase() : '' };
          }
        }
      }
    }
  });

  var suf = suffix || '';
  var sInfo = [
    { n: '홈멀티' + suf, r: 3, z: 'HOME_MULTI' },
    { n: '상업멀티' + suf, r: 3, z: 'COMM_MULTI' },
    { n: '상업멀티 구성' + suf, r: 1, z: 'COMM_MULTI' },
    { n: '싱글 세트' + suf, r: 3, z: 'SINGLE' },
    { n: '싱글 구성품' + suf, r: 2, z: 'SINGLE' }
  ];
  for (var i = 0; i < sInfo.length; i++) {
    var info = sInfo[i];
    var sh = ss.getSheetByName(info.n) || ss.getSheetByName(info.n.replace(suf, ''));
    if (!sh) continue;
    var data = sh.getDataRange().getValues();
    if (data.length < info.r) continue;
    var heads = data[info.r - 1].map(function(h) { return String(h || '').replace(/\s+/g, '').toLowerCase(); });
    var mIdx = heads.indexOf('모델명');
    var nmIdx = heads.indexOf('품명');
    var pIdx = heads.indexOf('출고가');
    var dIdx = heads.indexOf('납품가');
    var fIdx = heads.indexOf('고정dc');
    
    if (pIdx === -1 && dIdx > -1) pIdx = dIdx;
    
    if ((mIdx > -1 || nmIdx > -1) && pIdx > -1) {
      for (var j = info.r; j < data.length; j++) {
        var mStr = mIdx > -1 ? String(data[j][mIdx] || '').trim().toUpperCase() : '';
        var nmStr = nmIdx > -1 ? String(data[j][nmIdx] || '').trim().toUpperCase() : '';
        var price = money_to_int_(data[j][pIdx]);
        var delivery = dIdx > -1 ? money_to_int_(data[j][dIdx]) : 0;
        var fixedDc = null;
        if (fIdx > -1) {
          var fVal = data[j][fIdx];
          if (fVal !== '' && fVal != null && !isNaN(fVal)) fixedDc = Number(fVal);
        }
        if (price > 0) {
          var obj = { price: price, deliveryPrice: delivery, fixedDc: fixedDc, nm: nmStr };
          if (mStr) {
            if (!map[info.z][mStr]) map[info.z][mStr] = obj;
            else if (delivery > 0) map[info.z][mStr].deliveryPrice = delivery;
            
            if (!map['UNKNOWN'][mStr]) map['UNKNOWN'][mStr] = obj;
            else if (delivery > 0) map['UNKNOWN'][mStr].deliveryPrice = delivery;
          }
          if (nmStr) {
            if (!map['UNKNOWN'][nmStr]) map['UNKNOWN'][nmStr] = obj;
            else if (delivery > 0) map['UNKNOWN'][nmStr].deliveryPrice = delivery;
          }
        }
      }
    }
  }
  return map;
}

// 서식
function notion_extract_dc_(props) {
  var homeRate = props['홈멀티DC']?.number;
  var commRate = props['상업멀티DC']?.number;
  var hoseI = props['유연호스I형']?.checkbox === true;
  
  var dc360 = props['360']?.number;
  var dc4way = props['4way']?.number;
  var dc1way = props['1way']?.number;
  var stand = props['스탠드']?.number;
  var deluxe = props['디럭스']?.number;
  var grade1 = props['1등급']?.number;

  var unitSel = props['단위처리']?.select?.name || '';
  var special = (props['특이사항']?.rich_text || []).map(function(t){ return t.plain_text; }).join('').trim();

  var segments = [];
  var hcPart = '';
  
  if (homeRate) hcPart += '홈' + Math.round(homeRate * 100) + '%';
  if (commRate) {
    if (hcPart) hcPart += '&';
    hcPart += '상업' + Math.round(commRate * 100) + '%';
  }
  if (hcPart) segments.push(hcPart);
  if (hoseI) segments.push('유연호스I형');

  function fmtMinusUnit(n) {
    var v = Math.abs(n);
    if (v % 10000 === 0) return '-' + (v/10000) + '만';
    if (v % 1000 === 0) return '-' + (v/1000) + '천';
    return '-' + v;
  }

  if (dc360) segments.push('360 ' + fmtMinusUnit(dc360));
  if (dc4way) segments.push('4way ' + fmtMinusUnit(dc4way));
  if (dc1way) segments.push('1way ' + fmtMinusUnit(dc1way));
  if (stand) segments.push('스탠드 ' + fmtMinusUnit(stand));
  if (deluxe) segments.push('디럭스 ' + fmtMinusUnit(deluxe));
  if (grade1) segments.push('1등급 ' + fmtMinusUnit(grade1));
  if (unitSel) segments.push(unitSel);
  if (special) segments.push(special);

  return segments.join(' / ');
}

// 정보
function extractDiscountNumbers(props) {
  function num(p) { var v = props[p]?.number; return v == null ? 0 : Number(v); }
  function names(p) { return (props[p]?.multi_select || []).map(function(o) { return String(o.name).toUpperCase(); }); }
  return {
    homeRate: num('홈멀티DC'),
    commRate: num('상업멀티DC'),
    dc360: num('360'),
    dc4way: num('4way'),
    dc1way: num('1way'),
    stand: num('스탠드'),
    deluxe: num('디럭스'),
    grade1: num('1등급'),
    excl: names('할인제외 품목')
  };
}

// 연산
function processDailyData(ecountData, isMultiApplied, isBeforeHike) {
  Logger.log('⚙️ 연산');
  try {
    var suffix = '';
    if (ecountData && ecountData.length > 0 && !isBeforeHike) {
      for (var i = 0; i < Math.min(ecountData.length, 5); i++) {
        var rawDate = String(ecountData[i]['일자'] || '').trim();
        var dateNum = 0;
        var dMatch = rawDate.match(/(\d{4})[^\d]*(\d{1,2})[^\d]*(\d{1,2})/);

        if (dMatch) {
          dateNum = parseInt(dMatch[1] + dMatch[2].padStart(2, '0') + dMatch[3].padStart(2, '0'), 10);
        } else {
          var numOnly = rawDate.replace(/[^\d]/g, '');
          if (numOnly.length >= 8) dateNum = parseInt(numOnly.substring(0, 8), 10);
        }

        if (dateNum > 0) {
          if (dateNum >= 20260701) suffix = '_단가인상';
          break;
        }
      }
    }

    var pendingData = getPendingFromNotion();
    var dynamicNoSalesMap = {};
    if (pendingData && pendingData.length > 0) {
      pendingData.forEach(function(item) {
        var cleanCode = String(item.code || '').replace(/[^\d]/g, '');
        if (cleanCode) dynamicNoSalesMap[cleanCode] = item.date;
      });
    }

    var notionMap = preload_notion_map_(NOTION_DB_ID_DATA, NOTION_TOKEN_DATA);
    var priceMap = loadPriceMap_(suffix);
    var catalog = loadSingleSetCatalog(suffix);
    var main = [], pre = [];

    var ecountDataMapped = ecountData.map(function(r, i) {
      var obj = { _ri: i };
      FINAL_HEADERS.forEach(function(h) { obj[h] = r[h] || ''; });
      
      var codeKey = String(obj['거래처코드']).replace(/[^\d]/g, '');
      var hasDate = /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(String(obj['회계반영일자']).trim());
      
      if (dynamicNoSalesMap[codeKey] && !hasDate) {
        obj['회계반영일자'] = '매출전표X - ' + dynamicNoSalesMap[codeKey];
      }
      if (codeKey && notionMap[codeKey]) obj['DC'] = notion_extract_dc_(notionMap[codeKey]);
      
      return obj;
    });

    var invoiceGroups = {};
    ecountDataMapped.forEach(function(row) {
      var key = row['일자'] + '_' + row['번호'];
      if (!invoiceGroups[key]) invoiceGroups[key] = [];
      invoiceGroups[key].push(row);
    });

    Object.keys(invoiceGroups).forEach(function(groupKey) {
      var items = invoiceGroups[groupKey];
      
      var currentZone = 'UNKNOWN';
      var hasSingleMain = false;
      
      items.forEach(function(item) {
        var t = extractModelToken_(item['품목명']) || clean_item_name_(item['품목명']).toUpperCase();
        var cls = (catalog && catalog.itemClassMap && catalog.itemClassMap[t]) ? catalog.itemClassMap[t] : classifyComp(t);
        
        if (/^AM/.test(t) && t.length >= 7 && (t[6] === 'X' || t[6] === 'N')) {
          currentZone = 'COMM_MULTI';
        } else if (/^AJ/.test(t) && t.length >= 7 && (t[6] === 'X' || t[6] === 'N')) {
          currentZone = 'HOME_MULTI';
        } else if (isTargetModelCode_(t) && (cls === 'INDOOR' || cls === 'OUTDOOR' || cls === 'SUB_INDOOR')) {
          currentZone = 'SINGLE';
          hasSingleMain = true;
        }
        item._zone = currentZone;
        item._token = t;
        item._cls = cls;

        var rawName = String(item['품목명']).toUpperCase();
        var isAccSearch = false;
        var accKeywords = [];
        
        if (rawName.indexOf('유연호스') > -1) {
            isAccSearch = true;
            if (rawName.indexOf('1WAY') > -1) accKeywords = ['유연호스', '1WAY'];
            else if (rawName.indexOf('4WAY') > -1) accKeywords = ['유연호스', '4WAY'];
            else if (rawName.indexOf('I형') > -1 || rawName.indexOf('I') > -1) accKeywords = ['유연호스', 'I형'];
            else accKeywords = ['유연호스'];
        } else if (rawName.indexOf('방진가대') > -1) {
            isAccSearch = true;
            if (rawName.indexOf('소') > -1) accKeywords = ['방진가대', '소'];
            else if (rawName.indexOf('중') > -1) accKeywords = ['방진가대', '중'];
            else accKeywords = ['방진가대']; 
        }
        
        var pData = priceMap['OLD'][t];
        if (pData) item._isOld = true;
        
        var searchZone = /^AXJ/.test(t) ? 'COMM_MULTI' : currentZone;
        
        if (!pData) {
          if (isAccSearch) {
              for (var key in priceMap['UNKNOWN']) {
                  var keyU = key.toUpperCase();
                  var match = true;
                  for (var k = 0; k < accKeywords.length; k++) {
                      if (keyU.indexOf(accKeywords[k]) === -1) { match = false; break; }
                  }
                  if (match && accKeywords.length === 1 && accKeywords[0] === '방진가대') {
                      if (keyU.indexOf('소') > -1 || keyU.indexOf('중') > -1) match = false;
                  }
                  if (match) {
                      pData = priceMap['UNKNOWN'][key];
                      break;
                  }
              }
          }
        }
        
        if (!pData) pData = priceMap[searchZone] && priceMap[searchZone][t];
        if (!pData) pData = priceMap['UNKNOWN'][t];
        if (!pData) pData = { price: 0, deliveryPrice: 0, fixedDc: null };

        if (!pData.deliveryPrice && priceMap['UNKNOWN'][t] && priceMap['UNKNOWN'][t].deliveryPrice) {
            pData.deliveryPrice = priceMap['UNKNOWN'][t].deliveryPrice;
        }

        var price = pData.price;
        var delivery = pData.deliveryPrice || price;
        var unit = money_to_int_(item['단가(VAT포함)']);
        var qty = money_to_int_(item['수량']);

        item['출고가'] = price;
        item._deliveryPrice = delivery;
        item._fixedDc = pData.fixedDc;
        var rate = price ? (1 - (unit / price)) : 0;
        item['할인율'] = rate;
        item['총계'] = unit * qty;
      });

      var codeKey = String(items[0]['거래처코드']).replace(/[^\d]/g, '');
      var discInfo = { homeRate: 0, commRate: 0, dc360: 0, dc4way: 0, dc1way: 0, stand: 0, deluxe: 0, grade1: 0, excl: [] };
      if (codeKey && notionMap[codeKey]) discInfo = extractDiscountNumbers(notionMap[codeKey]);

      var pool = [];
      items.forEach(function(item) {
        if (item._zone === 'SINGLE') {
          var qty = money_to_int_(item['수량']) || 1;
          var loopQty = Math.abs(qty);
          for (var q = 0; q < loopQty; q++) {
            pool.push({
              ri: item._ri,
              token: item._token,
              class: item._cls,
              unitPrice: money_to_int_(item['단가(VAT포함)']),
              used: false
            });
          }
        }
      });

      var indoors = pool.filter(function(p) { return !p.used && p.class === 'INDOOR'; });
      indoors.forEach(function(ind) {
        var cands = catalog.indoorToSets[ind.token] || [];
        cands.sort(function(a, b) { return catalog.setToComps[b].length - catalog.setToComps[a].length; });

        for (var c = 0; c < cands.length; c++) {
          var setName = cands[c];
          var reqComps = catalog.setToComps[setName];
          
          var reqOut = reqComps.find(function(rc) { return rc.class === 'OUTDOOR'; });
          if (!reqOut) continue;

          var outIdx = pool.findIndex(function(p) { return !p.used && p.class === 'OUTDOOR' && p.token === reqOut.token; });
          if (outIdx === -1) continue;

          var matchedPoolIdxs = [pool.indexOf(ind), outIdx];
          var expectedPriceSum = reqComps.find(function(rc) { return rc.class === 'INDOOR' && rc.token === ind.token; }).price + reqOut.price;
          
          var isExcl = false;
          reqComps.forEach(function(rc) {
             var nm = rc.raw.toUpperCase();
             if (discInfo.excl.some(function(ex) { return nm.indexOf(ex) > -1; })) isExcl = true;
          });

          reqComps.forEach(function(rc) {
            if (rc.class !== 'INDOOR' && rc.class !== 'OUTDOOR') {
              var optIdx = pool.findIndex(function(p) { return !p.used && p.token === rc.token && !matchedPoolIdxs.includes(pool.indexOf(p)); });
              if (optIdx > -1) {
                matchedPoolIdxs.push(optIdx);
                expectedPriceSum += rc.price;
              }
            }
          });

          var discount = 0;
          if (!isExcl) {
            var setU = setName.toUpperCase();
            var isExcludedSet = (setU.indexOf('AR') === 0 && /S$/.test(setU)) || (setU.indexOf('AF') === 0 && /S$/.test(setU));
            
            if (!isExcludedSet) {
              var isStand = false;
              if (setU.indexOf('AP230') === 0 || setU.indexOf('AP290') === 0) {
                isStand = true;
              } else if (setU.indexOf('AP') === 0 && setU.length >= 9 && setU[8] === 'P') {
                isStand = true;
              } else if (setU.indexOf('AP') === 0 && setU.length >= 11 && setU[10] === 'C' && setU[8] === 'D') {
                isStand = true;
              }

              if (setU.indexOf('AC') === 0 && setU.length >= 9 && setU[7] === '6' && setU[8] === 'P') {
                discount = discInfo.dc360 ? Math.abs(discInfo.dc360) : 0;
              } else if (setU.indexOf('AC') === 0 && setU.length >= 9 && setU[7] === '4' && (setU[8] === 'P' || setU[8] === 'D')) {
                discount = discInfo.dc4way ? Math.abs(discInfo.dc4way) : 0;
              } else if (setU.indexOf('AC') === 0 && setU.length >= 9 && setU[7] === '1' && (setU[8] === 'P' || setU[8] === 'D')) {
                discount = discInfo.dc1way ? Math.abs(discInfo.dc1way) : 0;
              } else if (isStand) {
                discount = discInfo.stand ? Math.abs(discInfo.stand) : 0;
              } else if (setU.indexOf('AP') === 0 && setU.length >= 11 && setU[8] === 'D' && setU[10] === 'H') {
                discount = discInfo.deluxe ? Math.abs(discInfo.deluxe) : 0;
              } else if ((setU.indexOf('AC') === 0 || setU.indexOf('AP') === 0) && setU.length >= 9 && setU[8] === 'F') {
                discount = discInfo.grade1 ? Math.abs(discInfo.grade1) : 0;
              }
            }
          }
          
          var finalExpectedPrice = expectedPriceSum - discount;
          var invoicePriceSum = 0;
          matchedPoolIdxs.forEach(function(idx) { invoicePriceSum += pool[idx].unitPrice; });

          if (Math.abs(invoicePriceSum) === Math.abs(finalExpectedPrice)) {
            matchedPoolIdxs.forEach(function(idx) { pool[idx].used = true; });
            break; 
          }
        }
      });

      var riUsage = {};
      pool.forEach(function(p) {
        if (!riUsage[p.ri]) riUsage[p.ri] = { total: 0, used: 0 };
        riUsage[p.ri].total++;
        if (p.used) riUsage[p.ri].used++;
      });

      items.forEach(function(item) {
        if (/(운임|절삭)/.test(item['품목명'])) {
          item['확인'] = true;
        } else if (item._isOld) {
          if (isMultiApplied === false) {
            item['확인'] = true;
          } else {
            var actualRate = Math.round((item['할인율'] || 0) * 100);
            if (/^(AM|NJ|NS|AVX)/.test(item._token)) {
              item['확인'] = (actualRate === 50);
            } else {
              var unitPrice = money_to_int_(item['단가(VAT포함)']);
              item['확인'] = (unitPrice === item._deliveryPrice);
            }
          }
        } else if (/(유연호스|발통세트|일자발|방진가대)/.test(item['품목명']) || /^AXJ/.test(item._token)) {
          if (isMultiApplied === false) {
            item['확인'] = true;
          } else {
            var unitPrice = money_to_int_(item['단가(VAT포함)']);
            item['확인'] = (unitPrice === item._deliveryPrice);
          }
        } else if (item._zone === 'SINGLE') {
          if (!hasSingleMain && (item._cls === 'PANEL' || item._cls === 'REMOTE' || item._cls === 'MATERIAL')) {
            item['확인'] = true;
          } else if (item._cls === 'PANEL' || item._cls === 'REMOTE' || item._cls === 'MATERIAL') {
             var isUsed = (riUsage[item._ri] && riUsage[item._ri].used === riUsage[item._ri].total);
             var unitPrice = money_to_int_(item['단가(VAT포함)']);
             
             var hasFailedMain = items.some(function(it) {
               return (it._cls === 'INDOOR' || it._cls === 'OUTDOOR') && 
                      (!riUsage[it._ri] || riUsage[it._ri].used !== riUsage[it._ri].total);
             });
             
             if (isUsed) {
               item['확인'] = true;
             } else if (hasFailedMain) {
               item['확인'] = false;
             } else {
               item['확인'] = (unitPrice === item._deliveryPrice);
             }
          } else if (item._cls === 'INDOOR' || item._cls === 'OUTDOOR' || item._cls === 'SUB_INDOOR') {
             item['확인'] = (riUsage[item._ri] && riUsage[item._ri].used === riUsage[item._ri].total);
          } else {
             item['확인'] = true;
          }
        } else if (item._zone === 'COMM_MULTI' || item._zone === 'HOME_MULTI' || /(멀티|MULTI)/i.test(item['품목명'])) {
          if (isMultiApplied === false) {
             item['확인'] = true;
          } else {
             var actualRate = Math.round((item['할인율'] || 0) * 100);
             var expectRate = null;
             
             if (item._fixedDc != null) {
               expectRate = Math.round(item._fixedDc * 100);
             } else if (item._zone === 'COMM_MULTI') {
               expectRate = Math.round((discInfo.commRate || 0.45) * 100);
             } else if (item._zone === 'HOME_MULTI') {
               expectRate = Math.round((discInfo.homeRate || 0.45) * 100);
             } else {
               expectRate = 45; 
             }
             
             item['확인'] = (actualRate === expectRate);
          }
        } else {
          item['확인'] = true;
        }
        
        var datePattern = /\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/;
        if (datePattern.test(String(item['회계반영일자']).trim())) pre.push(item);
        else main.push(item);
      });
    });

    Logger.log('✅ 완료');
    return { status: 'success', main: main, pre: pre, sum: main.concat(pre) };
  } catch (e) {
    Logger.log('❌ 에러');
    return { status: 'error', message: String(e) };
  }
}

// 기록
function saveHistoryToNotion(jsonStr, email, name, topic) {
  Logger.log('💾 기록');
  var blob = Utilities.newBlob(jsonStr, 'text/plain');
  var zipped = Utilities.gzip(blob);
  var dataStr = Utilities.base64Encode(zipped.getBytes());
  
  var max = 2000;
  var arrs = [[], []];
  var blocks = [];
  
  for (var i = 0; i < dataStr.length; i += max) {
    blocks.push({ text: { content: dataStr.substring(i, i + max) } });
  }
  for (var j = 0; j < blocks.length; j++) {
    var bucket = Math.floor(j / 90); 
    if (bucket > 1) break; 
    arrs[bucket].push(blocks[j]);
  }

  var payload1 = {
    parent: { database_id: NOTION_DB_ID_SAVE },
    properties: {
      '작업자': { title: [{ text: { content: name } }] },
      '작업계정': { email: email },
      '프로그램유형': { select: { name: '일마감' } },
      '저장주제': { rich_text: [{ text: { content: topic || '' } }] },
      '저장내역1': { rich_text: arrs[0] || [] }
    }
  };

  var options1 = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + NOTION_TOKEN_SAVE,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload1),
    muteHttpExceptions: true
  };
  
  var res1 = UrlFetchApp.fetch('https://api.notion.com/v1/pages', options1);
  var code1 = res1.getResponseCode();
  if (code1 >= 400) throw new Error('Notion API POST 오류: ' + res1.getContentText());
  
  var pageData = JSON.parse(res1.getContentText());
  var pageId = pageData.id;

  for (var k = 1; k < 2; k++) {
    if (arrs[k] && arrs[k].length > 0) {
      var patchProps = {};
      patchProps['저장내역' + (k + 1)] = { rich_text: arrs[k] };
      var patchOptions = {
        method: 'patch',
        headers: {
          'Authorization': 'Bearer ' + NOTION_TOKEN_SAVE,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify({ properties: patchProps }),
        muteHttpExceptions: true
      };
      UrlFetchApp.fetch('https://api.notion.com/v1/pages/' + pageId, patchOptions);
      Utilities.sleep(300);
    }
  }
  return true;
}

// 해제
function decompressData(b64Data) {
  Logger.log('📦 해제');
  try {
    var decoded = Utilities.base64Decode(b64Data);
    var blob = Utilities.newBlob(decoded, 'application/x-gzip');
    var unzipped = Utilities.ungzip(blob);
    return unzipped.getDataAsString();
  } catch(e) {
    throw new Error('데이터 파싱 오류');
  }
}

// 저장
function savePendingToNotion(data, email, name) {
  Logger.log('💾 특이사항');
  var jsonStr = JSON.stringify(data);
  var b64Data = Utilities.base64Encode(Utilities.newBlob(jsonStr).getBytes());
  
  var max = 2000;
  var arrs = [[], []];
  var blocks = [];
  
  for (var i = 0; i < b64Data.length; i += max) {
    blocks.push({ text: { content: b64Data.substring(i, i + max) } });
  }
  for (var j = 0; j < blocks.length; j++) {
    var bucket = Math.floor(j / 90); 
    if (bucket > 1) break; 
    arrs[bucket].push(blocks[j]);
  }

  var payload = {
    parent: { database_id: NOTION_DB_ID_SAVE },
    properties: {
      '작업자': { title: [{ text: { content: name || '' } }] },
      '작업계정': { email: email || '' },
      '프로그램유형': { select: { name: '일마감(특이사항)' } },
      '저장주제': { rich_text: [{ text: { content: '특이사항' } }] },
      '저장내역1': { rich_text: arrs[0] || [] }
    }
  };

  if (arrs[1] && arrs[1].length > 0) {
    payload.properties['저장내역2'] = { rich_text: arrs[1] };
  }

  var opts = {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN_SAVE, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload)
  };
  UrlFetchApp.fetch('https://api.notion.com/v1/pages', opts);
  return true;
}

// 탐색
function getPendingFromNotion() {
  Logger.log('🔎 특이사항');
  var payload = {
    filter: { property: '프로그램유형', select: { equals: '일마감(특이사항)' } },
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    page_size: 1
  };
  var opts = {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN_SAVE, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload)
  };
  var res = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + NOTION_DB_ID_SAVE + '/query', opts);
  var data = JSON.parse(res.getContentText());
  if (!data.results || data.results.length === 0) return [];
  
  var props = data.results[0].properties;
  var b64Data = '';
  [1, 2].forEach(function(num) {
    var rText = props['저장내역' + num]?.rich_text;
    if (rText) {
      rText.forEach(function(t) { b64Data += t.plain_text; });
    }
  });
  
  if (!b64Data) return [];
  
  try {
    var decoded = Utilities.base64Decode(b64Data);
    var jsonStr = Utilities.newBlob(decoded).getDataAsString();
    return JSON.parse(jsonStr);
  } catch(e) {
    try { return JSON.parse(b64Data); } catch(e2) { return []; }
  }
}

// 탐색
function getHistoryFromNotion(sDate, eDate) {
  Logger.log('🔎 탐색');
  var payload = {
    filter: {
      and: [
        { property: '프로그램유형', select: { equals: '일마감' } },
        { timestamp: 'created_time', created_time: { on_or_after: sDate } },
        { timestamp: 'created_time', created_time: { on_or_before: eDate + 'T23:59:59.999Z' } }
      ]
    },
    sorts: [{ timestamp: 'created_time', direction: 'descending' }]
  };

  var options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + NOTION_TOKEN_SAVE,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload)
  };

  var res = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + NOTION_DB_ID_SAVE + '/query', options);
  var data = JSON.parse(res.getContentText());
  var out = [];
  
  for (var i = 0; i < data.results.length; i++) {
    var props = data.results[i].properties;
    var worker = props['작업자']?.title?.[0]?.plain_text || '';
    var time = data.results[i].created_time;
    var topic = props['저장주제']?.rich_text?.[0]?.plain_text || '';
    var fullText = '';
    [1, 2].forEach(num => {
      var rText = props['저장내역' + num]?.rich_text;
      if (rText) rText.forEach(function(t) { fullText += t.plain_text; });
    });
    out.push({ worker: worker, time: time, topic: topic, data: fullText });
  }
  return out;
}

// 최신
function getLatestHistoryFromNotion() {
  Logger.log('🔄 최신');
  var payload = {
    filter: { property: '프로그램유형', select: { equals: '일마감' } },
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    page_size: 1
  };
  
  var opts = {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN_SAVE, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    var res = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + NOTION_DB_ID_SAVE + '/query', opts);
    var data = JSON.parse(res.getContentText());
    if (!data.results || data.results.length === 0) return null;
    
    var p = data.results[0].properties;
    var b64Str = "";
    [1, 2].forEach(num => {
      var rText = p['저장내역' + num]?.rich_text;
      if (rText) rText.forEach(function(t) { b64Str += t.plain_text; });
    });
    return { data: decompressData(b64Str) }; 
  } catch(e) { return null; }
}

// 자동저장
function autoSaveToNotion(jsonStr, email, name, topic) {
  Logger.log('💾 자동저장');
  return saveHistoryToNotion(jsonStr, email, name, topic);
}

function testNotionAPI() {
  // 여기에 테스트할 버전을 입력하세요. 
  // 예: '2022-06-28' 또는 '2025-09-03'
  var TEST_VERSION = '2022-06-28'; 
  
  Logger.log('🧪 [' + TEST_VERSION + '] 버전으로 노션 DB 통신 테스트 시작');
  
  var url = 'https://api.notion.com/v1/databases/' + NOTION_DB_ID_DATA + '/query';
  var options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + NOTION_TOKEN_DATA,
      'Notion-Version': TEST_VERSION,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({ page_size: 1 }),
    muteHttpExceptions: true
  };
  
  try {
    var res = UrlFetchApp.fetch(url, options);
    var code = res.getResponseCode();
    var jsonText = res.getContentText();
    
    if (code === 200) {
      Logger.log('✅ 통신 성공! 데이터를 정상적으로 읽어옵니다.');
      // 데이터가 비어있는지 확인
      var parsed = JSON.parse(jsonText);
      if (parsed.results && parsed.results.length > 0) {
        Logger.log('📦 가져온 데이터 건수: ' + parsed.results.length + '건');
      } else {
        Logger.log('⚠️ 통신은 성공했지만 데이터가 0건입니다. (매핑 실패 또는 데이터 없음)');
      }
    } else {
      Logger.log('🛑 통신 에러 발생 (상태 코드: ' + code + ')');
      Logger.log('에러 상세 내용: ' + jsonText);
    }
  } catch (e) {
    Logger.log('💥 스크립트 실행 자체 에러: ' + e.toString());
  }
}