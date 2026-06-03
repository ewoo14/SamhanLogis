// 환경변수
const NOTION_TOKEN_AUTH = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_AUTH = '198a1006d65880ddb510e0d525c5e9da';
const NOTION_TOKEN_SAVE = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_SAVE = '34aa1006d65880cea4a5cdf55cccb1b4';
const NOTION_TOKEN_DATA = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_DATA = '1a0a1006d65880e69e97e0a00c8d998c';

// 렌더링
function doGet() {
  Logger.log('🌐화면출력');
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('영업 문자 발송 통합 시스템')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 사용자접근
function getUserAuth() {
  Logger.log('🔐권한확인');
  var email = Session.getActiveUser().getEmail();
  
  if (!email) {
    return { authorized: false, email: '알수없음', error: '권한확인불가' };
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
    
    if (res.getResponseCode() !== 200) return { authorized: false, email: email, error: '통신거부' };
    
    if (data.results && data.results.length > 0) {
      const props = data.results[0].properties;
      const getTitle = (p) => p?.title?.[0]?.plain_text || '';
      const getSelect = (p) => p?.select?.name || '';
      
      const name = getTitle(props['이름']);
      const rank = getSelect(props['직급']);
      
      return { 
        authorized: true,
        email: email,
        managerName: rank ? name + ' ' + rank : name
      };
    }
  } catch (e) {
    return { authorized: false, email: email, error: '통신장애' };
  }
  
  return { authorized: false, email: email, error: '미등록계정' };
}

// 문자열압축
function compressString(str) {
  return Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(str)).getBytes());
}

// 문자열해제
function decompressString(b64) {
  try {
    return Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip')).getDataAsString();
  } catch(e) { return ""; }
}

// 작업이력저장
function autoSaveToNotion(jsonDataStr, userEmail, userName, topic) {
  Logger.log('💾이력저장');
  var b64Str = compressString(jsonDataStr);
  
  var payload = {
    parent: { database_id: NOTION_DB_ID_SAVE },
    properties: {
      '작업자': { title: [{ text: { content: userName } }] },
      '작업계정': { email: userEmail },
      '프로그램유형': { select: { name: '문자발송' } },
      '저장주제': { rich_text: [{ text: { content: topic || '수동저장' } }] }
    }
  };

  var arrOne = [];
  var arrTwo = [];
  var chunkSize = 2000;
  
  for (var i = 0; i < b64Str.length; i += chunkSize) {
    var chunk = b64Str.substring(i, i + chunkSize);
    if (arrOne.length < 100) {
      arrOne.push({ text: { content: chunk } });
    } else if (arrTwo.length < 100) {
      arrTwo.push({ text: { content: chunk } });
    }
  }

  if (arrOne.length > 0) payload.properties['저장내역1'] = { rich_text: arrOne };
  if (arrTwo.length > 0) payload.properties['저장내역2'] = { rich_text: arrTwo };

  var opts = {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN_SAVE, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload)
  };
  UrlFetchApp.fetch('https://api.notion.com/v1/pages', opts);
  return true;
}

// 이력조회
function getHistoryFromNotion(start, end) {
  Logger.log('📋목록검색');
  var payload = {
    filter: {
      and: [
        { property: '프로그램유형', select: { equals: '문자발송' } },
        { timestamp: 'created_time', created_time: { on_or_after: start + 'T00:00:00Z' } },
        { timestamp: 'created_time', created_time: { on_or_before: end + 'T23:59:59Z' } }
      ]
    },
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    page_size: 50
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
    if (!data.results) return [];
    
    return data.results.map(row => {
      var p = row.properties;
      return {
        id: row.id,
        time: row.created_time,
        worker: p['작업자']?.title?.[0]?.plain_text || '작업자없음',
        topic: p['저장주제']?.rich_text?.[0]?.plain_text || ''
      };
    });
  } catch(e) { return []; }
}

// 상세이력
function getSpecificHistory(pageId) {
  var opts = {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN_SAVE, 'Notion-Version': '2022-06-28' },
    muteHttpExceptions: true
  };
  try {
    var res = UrlFetchApp.fetch('https://api.api.notion.com/v1/pages/' + pageId, opts);
    var p = JSON.parse(res.getContentText()).properties;
    
    var b64Str = "";
    if (p['저장내역1'] && p['저장내역1'].rich_text) {
      p['저장내역1'].rich_text.forEach(function(rt) { b64Str += rt.plain_text; });
    }
    if (p['저장내역2'] && p['저장내역2'].rich_text) {
      p['저장내역2'].rich_text.forEach(function(rt) { b64Str += rt.plain_text; });
    }
    return decompressString(b64Str);
  } catch(e) { return null; }
}

// 외부데이터호출
function fetchExternalData() {
  Logger.log('🔄자료수집');
  var resultData = { notion: [], sheets: [] };
  
  var notionUrl = 'https://api.notion.com/v1/databases/' + NOTION_DB_ID_DATA + '/query';
  var hasMore = true;
  var cursor = null;
  
  while (hasMore) {
    var payload = { page_size: 100 };
    if (cursor) payload.start_cursor = cursor;
    
    var res = UrlFetchApp.fetch(notionUrl, {
      method: 'post',
      headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN_DATA, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    if (res.getResponseCode() === 200) {
      var data = JSON.parse(res.getContentText());
      
      data.results.forEach(function(page) {
        var props = page.properties;
        var getPlain = (p) => p?.rich_text?.map(r=>r.plain_text).join(' ') || '';
        var getTitle = (p) => p?.title?.map(r=>r.plain_text).join(' ') || '';
        
        var name = getTitle(props['거래처명']) || getPlain(props['거래처명']);
        var phone = getPlain(props['전화번호']);
        var addr = getPlain(props['주소']);
        var manager = props['담당자명']?.select?.name || '';
        
        if (manager && (manager.includes('신용정보') || manager.includes('전자소송') || manager.includes('보류') || manager.includes('폐업'))) {
          return;
        }
        
        if (phone && addr) {
          resultData.notion.push({ name: name, phone: phone, addr: addr });
        }
      });
      hasMore = data.has_more;
      cursor = data.next_cursor;
    } else {
      hasMore = false;
    }
  }

  try {
    var ssId = '1YVJZxMRLEDBfa_BdzetXdFJXE_WR_v2V09nbkqIX7cI';
    var sheetIds = [ {name: '114On', gid: '1005069153'}, {name: '네이버', gid: '1985957420'}, {name: '자재상', gid: '785590967'} ];
    var ss = SpreadsheetApp.openById(ssId);
    
    sheetIds.forEach(function(sInfo) {
      var sheets = ss.getSheets();
      var targetSheet = null;
      for (var i = 0; i < sheets.length; i++) {
        if (sheets[i].getSheetId() == sInfo.gid) { targetSheet = sheets[i]; break; }
      }
      
      if (targetSheet) {
        var vals = targetSheet.getDataRange().getValues();
        if (vals.length > 1) {
          var head = vals[0];
          var cNameIdx = head.indexOf('회사명');
          var cPhoneIdx = head.indexOf('연락처');
          var cAddrIdx = head.indexOf('주소');
          
          for (var r = 1; r < vals.length; r++) {
            var row = vals[r];
            var p = row[cPhoneIdx];
            var a = row[cAddrIdx];
            var n = row[cNameIdx];
            if (p && a) {
              resultData.sheets.push({ name: '(' + sInfo.name + ')' + n, phone: String(p), addr: String(a) });
            }
          }
        }
      }
    });
  } catch(e) { }

  return resultData;
}

// 드라이브저장
function uploadCsvToDrive(filename, csvContent, folderId) {
  Logger.log('📁파일생성');
  try {
    var folder = DriveApp.getFolderById(folderId);
    var files = folder.searchFiles('title = "' + filename + '" and trashed = false');
    
    if (files.hasNext()) {
      var file = files.next();
      file.setContent(csvContent);
    } else {
      var blob = Utilities.newBlob(csvContent, 'text/csv', filename);
      folder.createFile(blob);
    }
    return true;
  } catch(e) {
    return false;
  }
}

// 담당확인
function processManagerJS(managerName, tradeName) {
  Logger.log('👤담당확인');
  managerName = String(managerName || '').trim();
  tradeName = String(tradeName || '').trim();
  if (tradeName.includes('폐업')) return '폐업';
  if (!managerName) return '미지정';
  let keywords = [];
  if (managerName.includes('새한신용정보')) keywords.push('새한신용정보');
  if (managerName.includes('전자소송')) keywords.push('전자소송');
  return keywords.length > 0 ? keywords.join(' ') : managerName;
}

// 번호정리
function normalizePhoneJS(phoneStr) {
  Logger.log('📱번호정리');
  if (!phoneStr) return "";
  phoneStr = String(phoneStr).trim();
  let numbers = [];

  function formatPrefix(digits) {
    if (digits.length === 8) return digits.substring(0,4) + '-' + digits.substring(4);
    const rules = { "010":11, "011":11, "016":10, "017":10, "018":10, "019":10, "070":11, "080":11 };
    for (let p in rules) {
      if (digits.startsWith(p) && digits.length === rules[p]) {
        if (p === "010" || p === "011" || p === "070" || p === "080") return digits.substring(0,3) + '-' + digits.substring(3,7) + '-' + digits.substring(7);
        return digits.substring(0,3) + '-' + digits.substring(3,6) + '-' + digits.substring(6);
      }
    }
    if (digits.startsWith("02")) {
      if (digits.length === 9) return digits.substring(0,2) + '-' + digits.substring(2,5) + '-' + digits.substring(5);
      if (digits.length === 10) return digits.substring(0,2) + '-' + digits.substring(2,6) + '-' + digits.substring(6);
    }
    if (digits.length === 10) return digits.substring(0,3) + '-' + digits.substring(3,6) + '-' + digits.substring(6);
    if (digits.length === 11) return digits.substring(0,3) + '-' + digits.substring(3,7) + '-' + digits.substring(7);
    return digits;
  }

  function extractNumbers(s) {
    let res = [];
    let mobileRegex = /(010\d{8}|070\d{8}|080\d{8}|011\d{10}|016\d{7}|017\d{7}|018\d{7}|019\d{7})/g;
    let match;
    while ((match = mobileRegex.exec(s)) !== null) {
      res.push(formatPrefix(match[0]));
      s = s.replace(match[0], '');
    }
    let rem = s.replace(/\D/g, '');
    if (rem) {
      while(rem.length > 0) {
        let found = false;
        const rules = { "010":11, "011":11, "016":10, "017":10, "018":10, "019":10, "070":11, "080":11 };
        for (let p in rules) {
          if (rem.startsWith(p) && rem.length >= rules[p]) {
            res.push(formatPrefix(rem.substring(0, rules[p])));
            rem = rem.substring(rules[p]);
            found = true; break;
          }
        }
        if (found) continue;
        if (rem.startsWith("02")) {
          if (rem.length >= 10) { res.push(formatPrefix(rem.substring(0,10))); rem = rem.substring(10); }
          else if (rem.length >= 9) { res.push(formatPrefix(rem.substring(0,9))); rem = rem.substring(9); }
          else { res.push(formatPrefix(rem)); rem = ""; }
        } else {
          if (rem.length >= 11) { res.push(formatPrefix(rem.substring(0,11))); rem = rem.substring(11); }
          else if (rem.length >= 10) { res.push(formatPrefix(rem.substring(0,10))); rem = rem.substring(10); }
          else { res.push(formatPrefix(rem)); rem = ""; }
        }
      }
    }
    return res;
  }

  if (phoneStr.includes('/') || /\D{2,}/.test(phoneStr)) {
    let parts = phoneStr.split(/[/]|(?:\D{2,})/);
    parts.forEach(part => {
      part = part.trim();
      if (!part) return;
      let digits = part.replace(/\D/g, '');
      if (digits) {
        if (digits.length > 11) numbers = numbers.concat(extractNumbers(digits));
        else numbers.push(formatPrefix(digits));
      }
    });
  } else {
    let digits = phoneStr.replace(/\D/g, '');
    numbers = extractNumbers(digits);
  }

  const mobileOrder = { "010": 0, "011": 1, "016": 2, "017": 3, "018": 4, "019": 5, "070": 6, "080": 7 };
  numbers.sort((a, b) => {
    let pA = a.split('-')[0]; let pB = b.split('-')[0];
    let vA = mobileOrder[pA] !== undefined ? mobileOrder[pA] : 99;
    let vB = mobileOrder[pB] !== undefined ? mobileOrder[pB] : 99;
    if (vA !== vB) return vA - vB;
    return a.localeCompare(b);
  });

  return numbers.map(num => /^\d{8}$/.test(num) ? num.substring(0,4)+'-'+num.substring(4) : num).join('\n');
}

// 노션요청 안전호출기
function safeNotionRequest(url, method, payload, maxRetries = 5) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    let options = {
      method: method,
      headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN_DATA, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      muteHttpExceptions: true
    };
    if (payload) options.payload = JSON.stringify(payload);

    try {
      let res = UrlFetchApp.fetch(url, options);
      let code = res.getResponseCode();
      
      if (code === 429) {
        let headers = res.getHeaders();
        let wait = parseInt(headers['Retry-After'] || headers['retry-after'] || '2');
        Utilities.sleep((wait * 1000) + 500);
        attempt++;
        continue;
      }
      
      if (code >= 500 && code < 600) {
        let backoff = Math.min(Math.pow(2, attempt) * 1000, 20000);
        Utilities.sleep(backoff);
        attempt++;
        continue;
      }
      
      return res;
    } catch(e) {
      attempt++;
      Utilities.sleep(Math.min(Math.pow(2, attempt) * 1000, 20000));
    }
  }
  return null;
}

// 부분동기화
function syncEcountChunk(chunk) {
  Logger.log('🚀부분동기화');
  let codes = chunk.map(r => String(r['거래처코드'] || '').trim()).filter(c => c);
  if (codes.length === 0) return { added: 0, updated: 0, unchanged: 0, failed: 0 };

  let filterConditions = codes.map(c => ({ property: '거래처코드', title: { equals: c } }));
  let existingPages = {};

  let notionUrl = 'https://api.notion.com/v1/databases/' + NOTION_DB_ID_DATA + '/query';
  let payload = { filter: { or: filterConditions }, page_size: 100 };
  let res = safeNotionRequest(notionUrl, 'post', payload);

  if (res && res.getResponseCode() === 200) {
    let data = JSON.parse(res.getContentText());
    data.results.forEach(page => {
      let props = page.properties;
      let getPlain = (p) => p?.rich_text?.map(r=>r.plain_text).join('') || '';
      let getTitle = (p) => p?.title?.map(r=>r.plain_text).join('') || '';
      let getSelect = (p) => p?.select?.name || '';

      let code = getTitle(props['거래처코드']);
      if (code) {
        existingPages[code] = {
          page_id: page.id,
          manager: getSelect(props['담당자명']),
          tradeName: getTitle(props['거래처명']) || getPlain(props['거래처명']),
          ownerName: getPlain(props['대표자명']),
          address: getPlain(props['주소']),
          memo: getPlain(props['비고']),
          phone: getPlain(props['전화번호'])
        };
      }
    });
  }

  let added = 0, updated = 0, unchanged = 0, failed = 0;

  chunk.forEach(row => {
    let code = String(row['거래처코드'] || '').trim();
    if(!code) return;

    let newManager = processManagerJS(row['담당자명'], row['거래처명']);
    let newTradeName = String(row['거래처명'] || '').trim();
    let newOwnerName = String(row['대표자명'] || '').trim();
    let newAddress = String(row['주소'] || '').trim();
    let newMemo = String(row['비고'] || '').trim();
    let newPhone = normalizePhoneJS(row['전화번호']);

    let isStrike = (newManager === '새한신용정보' || newManager === '전자소송');

    let payloadProps = {
      "거래처코드": { "title": [{ "text": { "content": code } }] },
      "거래처명": { "rich_text": [{ "text": { "content": newTradeName }, "annotations": { "strikethrough": isStrike } }] },
      "대표자명": { "rich_text": [{ "text": { "content": newOwnerName } }] },
      "주소": { "rich_text": [{ "text": { "content": newAddress } }] },
      "전화번호": { "rich_text": [{ "text": { "content": newPhone } }] },
      "비고": { "rich_text": [{ "text": { "content": newMemo } }] },
      "담당자명": { "select": { "name": newManager } }
    };

    if (existingPages[code]) {
      let ext = existingPages[code];
      if (ext.manager !== newManager || ext.tradeName !== newTradeName || ext.ownerName !== newOwnerName || ext.address !== newAddress || ext.memo !== newMemo || ext.phone !== newPhone) {
        let pRes = safeNotionRequest('https://api.notion.com/v1/pages/' + ext.page_id, 'patch', { properties: payloadProps });
        if (pRes && pRes.getResponseCode() >= 200 && pRes.getResponseCode() < 300) {
          updated++;
          Utilities.sleep(100);
        } else {
          failed++;
        }
      } else {
        unchanged++;
      }
    } else {
      let pRes = safeNotionRequest('https://api.notion.com/v1/pages', 'post', { parent: { database_id: NOTION_DB_ID_DATA }, properties: payloadProps });
      if (pRes && pRes.getResponseCode() >= 200 && pRes.getResponseCode() < 300) {
        added++;
        Utilities.sleep(100);
      } else {
        failed++;
      }
    }
  });

  return { added: added, updated: updated, unchanged: unchanged, failed: failed };
}