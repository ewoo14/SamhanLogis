// 상수
const NOTION_TOKEN_AUTH = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_AUTH = '198a1006d65880ddb510e0d525c5e9da';
const NOTION_TOKEN_SAVE = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_SAVE = '337a1006d65880a8b633fe6ca44573b2';

// 렌더링
function doGet() {
  Logger.log('🌐시작');
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('품목별 매입기록 비교')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 인증
function getUserAuth() {
  Logger.log('🔐인증');
  var email = Session.getActiveUser().getEmail();
  
  if (!email) {
    return { authorized: false, email: '확인불가', error: '권한설정요망' };
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
    
    if (res.getResponseCode() !== 200) return { authorized: false, email: email, error: '접근거부' };
    
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
    return { authorized: false, email: email, error: '통신오류' };
  }
  
  return { authorized: false, email: email, error: '미등록' };
}

// 압축해제
function compressString(str) {
  return Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(str)).getBytes());
}

function decompressString(b64) {
  try {
    return Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip')).getDataAsString();
  } catch(e) { return ""; }
}

// 저장
function autoSaveToNotion(jsonDataStr, userEmail, userName, topic) {
  Logger.log('💾저장');
  var b64Str = compressString(jsonDataStr);
  
  var payload = {
    parent: { database_id: NOTION_DB_ID_SAVE },
    properties: {
      '작업자': { title: [{ text: { content: userName } }] },
      '작업계정': { email: userEmail },
      '프로그램유형': { select: { name: '품목별 교차검증' } },
      '저장주제': { rich_text: [{ text: { content: topic || '자동저장' } }] }
    }
  };

  var arr1 = [];
  var arr2 = [];
  var chunkSize = 2000;
  
  for (var i = 0; i < b64Str.length; i += chunkSize) {
    var chunk = b64Str.substring(i, i + chunkSize);
    if (arr1.length < 100) {
      arr1.push({ text: { content: chunk } });
    } else if (arr2.length < 100) {
      arr2.push({ text: { content: chunk } });
    }
  }

  if (arr1.length > 0) payload.properties['저장내역1'] = { rich_text: arr1 };
  if (arr2.length > 0) payload.properties['저장내역2'] = { rich_text: arr2 };

  var opts = {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN_SAVE, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload)
  };
  UrlFetchApp.fetch('https://api.notion.com/v1/pages', opts);
  return true;
}

// 목록조회
function getHistoryFromNotion(start, end) {
  Logger.log('📋목록조회');
  var payload = {
    filter: {
      and: [
        { property: '프로그램유형', select: { equals: '품목별 교차검증' } },
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
        worker: p['작업자']?.title?.[0]?.plain_text || '알수없음',
        topic: p['저장주제']?.rich_text?.[0]?.plain_text || ''
      };
    });
  } catch(e) { return []; }
}

// 최신조회
function getLatestHistoryFromNotion() {
  Logger.log('🔄최신조회');
  var payload = {
    filter: { property: '프로그램유형', select: { equals: '품목별 교차검증' } },
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
    if (p['저장내역1'] && p['저장내역1'].rich_text) {
      p['저장내역1'].rich_text.forEach(function(rt) { b64Str += rt.plain_text; });
    }
    if (p['저장내역2'] && p['저장내역2'].rich_text) {
      p['저장내역2'].rich_text.forEach(function(rt) { b64Str += rt.plain_text; });
    }
    
    return { data: decompressString(b64Str) };
  } catch(e) { return null; }
}