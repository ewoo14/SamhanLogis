// 상수
const NOTION_TOKEN_AUTH = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_AUTH = '198a1006d65880ddb510e0d525c5e9da';
const NOTION_TOKEN_SAVE = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_SAVE = '328a1006d65880159a82d02ba10d0e8c';

// 렌더링
function doGet() {
  Logger.log('🚀 시작');
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('삼한공조시스템 전표리스트')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 인증
function getUserAuth() {
  Logger.log('🔐 인증');
  var email = Session.getActiveUser().getEmail();
  
  if (!email) {
    Logger.log('🛑 불가');
    return { authorized: false, email: '확인불가', error: '이메일 확인 불가 설정 변경 요망' };
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
    
    if (res.getResponseCode() !== 200) {
      Logger.log('🛑 거부');
      return { authorized: false, email: email, error: '노션 접근 거부' };
    }
    
    if (data.results && data.results.length > 0) {
      Logger.log('✅ 승인');
      const props = data.results[0].properties;
      const getTitle = function(p) { return p && p.title && p.title[0] ? p.title[0].plain_text : ''; };
      const getSelect = function(p) { return p && p.select ? p.select.name : ''; };
      
      const name = getTitle(props['이름']);
      const rank = getSelect(props['직급']);
      const fullName = rank ? name + ' ' + rank : name;
      
      return { authorized: true, email: email, managerName: fullName };
    }
  } catch (e) {
    Logger.log('🛑 에러');
    return { authorized: false, email: email, error: String(e) };
  }
  
  Logger.log('⛔ 미등록');
  return { authorized: false, email: email, error: '미등록 계정' };
}

// 아이디
function getIdFromUrl(url) {
  Logger.log('📂 추출');
  if (!url) throw new Error('오류');
  var m = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) throw new Error('오류');
  return m[1];
}

// 시트
function openSheetByUrl(url) {
  Logger.log('📂 시트');
  var id = getIdFromUrl(url);
  return SpreadsheetApp.openById(id);
}

// 텍스트
function normalizeStr(val) {
  Logger.log('📝 텍스트');
  var text = String(val == null ? '' : val).trim();
  try { text = text.normalize('NFKC'); } catch(e) {}
  text = text.replace(/[‐\-‒–—―－]/g, '-');
  text = text.replace(/（/g, '(').replace(/）/g, ')');
  text = text.replace(/[\u200B-\u200F\u202A-\u202E]/g, '');
  return text;
}

// 매칭
function normalizeForMatch(val) {
  Logger.log('🧩 매칭');
  var norm = normalizeStr(val);
  norm = norm.replace(/\s+/g, '').toLowerCase();
  try {
    norm = norm.replace(/[^\p{L}\p{N}]/gu, '');
  } catch(e) {
    norm = norm.replace(/[^A-Za-z0-9가-힣]/g, '');
  }
  return norm;
}

// 정리
function cleanValue(val) {
  Logger.log('🧹 정리');
  if (val === null || val === undefined) return '';
  var s = String(val).trim();
  if (!s || s.toLowerCase() === 'nan') return '';
  return s;
}

// 판별
function isAccountingRoom_(name) {
  Logger.log('🧩 판별');
  try {
    var s = String(name || '');
    return /회계/i.test(s);
  } catch(e) {
    return false;
  }
}

// 변환
function sheetToObjects(sheet) {
  Logger.log('🗂️ 변환');
  var values = sheet.getDataRange().getValues();
  if (!values || values.length < 1) return [];
  var headers = values[0].map(function(h){ return String(h).trim(); });
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var empty = row.every(function(v){ return String(v).trim() === ''; });
    if (empty) continue;
    var o = {};
    for (var c = 0; c < headers.length; c++) o[headers[c]] = row[c];
    out.push(o);
  }
  return out;
}

// 저장
function saveHistoryToNotion(dataStr, email, name) {
  Logger.log('🔄 저장');
  var max = 2000;
  var arr1 = [];
  var arr2 = [];
  
  var mid = Math.ceil(dataStr.length / 2);
  var p1 = dataStr.substring(0, mid);
  var p2 = dataStr.substring(mid);

  for (var i = 0; i < p1.length; i += max) {
    arr1.push({ text: { content: p1.substring(i, i + max) } });
  }
  for (var j = 0; j < p2.length; j += max) {
    arr2.push({ text: { content: p2.substring(j, j + max) } });
  }

  var payload = {
    parent: { database_id: NOTION_DB_ID_SAVE },
    properties: {
      '작업자': { title: [{ text: { content: name } }] },
      '작업계정': { email: email },
      '프로그램유형': { select: { name: '전표리스트' } },
      '저장내역1': { rich_text: arr1 },
      '저장내역2': { rich_text: arr2 }
    }
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
  UrlFetchApp.fetch('https://api.notion.com/v1/pages', options);
}

// 조회
function getHistoryFromNotion(sDate, eDate) {
  Logger.log('🔄 조회');
  var payload = {
    filter: {
      and: [
        { property: '프로그램유형', select: { equals: '전표리스트' } },
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
    var row = data.results[i];
    var props = row.properties;
    
    var worker = '';
    if (props['작업자'] && props['작업자'].title && props['작업자'].title.length > 0) {
      worker = props['작업자'].title[0].plain_text;
    }
    var time = row.created_time;
    
    var c1 = '';
    if (props['저장내역1'] && props['저장내역1'].rich_text) {
      for (var j = 0; j < props['저장내역1'].rich_text.length; j++) {
        c1 += props['저장내역1'].rich_text[j].plain_text;
      }
    }
    var c2 = '';
    if (props['저장내역2'] && props['저장내역2'].rich_text) {
      for (var k = 0; k < props['저장내역2'].rich_text.length; k++) {
        c2 += props['저장내역2'].rich_text[k].plain_text;
      }
    }
    
    out.push({
      worker: worker,
      time: time,
      data: c1 + c2
    });
  }
  return out;
}

// 최신
function getLatestHistoryFromNotion() {
  Logger.log('🔄 찾기');
  try {
    var payload = {
      filter: { property: '프로그램유형', select: { equals: '전표리스트' } },
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      page_size: 1
    };

    var options = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + NOTION_TOKEN_SAVE,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var res = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + NOTION_DB_ID_SAVE + '/query', options);
    if (res.getResponseCode() !== 200) return null;

    var data = JSON.parse(res.getContentText());
    if (data.results && data.results.length > 0) {
      var row = data.results[0];
      var props = row.properties;
      var c1 = props['저장내역1']?.rich_text?.map(function(t){ return t.plain_text; }).join('') || '';
      var c2 = props['저장내역2']?.rich_text?.map(function(t){ return t.plain_text; }).join('') || '';
      return { data: c1 + c2 };
    }
  } catch (e) {}
  return null;
}