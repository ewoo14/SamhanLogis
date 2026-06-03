// 상수
const NOTION_TOKEN_DATA = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_CHAT = '34da1006d65880d0bb02e6ac7a2635f6';
const NOTION_DB_ID_BLOCK = '34da1006d658809294c5d2c59942525e';
const NOTION_TOKEN_AUTH = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_AUTH = '198a1006d65880ddb510e0d525c5e9da';
const NOTION_TOKEN_SAVE = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_SAVE = '328a1006d65880159a82d02ba10d0e8c';

// 렌더링
function doGet() {
  Logger.log('🚀 시작');
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('내일자 전표 이미지 생성 프로그램')
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
      const getTitle = (p) => p?.title?.[0]?.plain_text || '';
      const getSelect = (p) => p?.select?.name || '';
      
      const name = getTitle(props['이름']);
      const rank = getSelect(props['직급']);
      const fullName = rank ? name + ' ' + rank : name;
      
      return { 
        authorized: true,
        email: email,
        managerName: fullName
      };
    }
  } catch (e) {
    Logger.log('🛑 에러');
    return { authorized: false, email: email, error: String(e) };
  }
  
  Logger.log('⛔ 미등록');
  return { authorized: false, email: email, error: '미등록계정' };
}

// 매핑
function getMappingData() {
  Logger.log('🗂️조회');
  var map = {};
  var hasMore = true;
  var cursor = null;
  while (hasMore) {
    var payload = {};
    if (cursor) payload.start_cursor = cursor;
    var opts = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + NOTION_TOKEN_DATA,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    try {
      var res = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + NOTION_DB_ID_CHAT + '/query', opts);
      var data = JSON.parse(res.getContentText());
      if (data.results) {
        for (var i = 0; i < data.results.length; i++) {
          var p = data.results[i].properties;
          var n = p['이카운트 사업자명'];
          var r = p['카톡방'];
          var name = n && n.title && n.title.length > 0 ? n.title[0].plain_text.trim() : '';
          var room = r && r.select ? r.select.name.trim() : '';
          if (name) map[name] = room;
        }
      }
      hasMore = data.has_more;
      cursor = data.next_cursor;
    } catch (e) {
      Logger.log('🛑에러');
      hasMore = false;
    }
  }
  return map;
}

// 금지
function getForbiddenData() {
  Logger.log('🚷조회');
  var list = [];
  var hasMore = true;
  var cursor = null;
  while (hasMore) {
    var payload = {};
    if (cursor) payload.start_cursor = cursor;
    var opts = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + NOTION_TOKEN_DATA,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    try {
      var res = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + NOTION_DB_ID_BLOCK + '/query', opts);
      var data = JSON.parse(res.getContentText());
      if (data.results) {
        for (var i = 0; i < data.results.length; i++) {
          var p = data.results[i].properties;
          var n = p['이카운트 사업자명'];
          var name = n && n.title && n.title.length > 0 ? n.title[0].plain_text.trim() : '';
          if (name) list.push(name);
        }
      }
      hasMore = data.has_more;
      cursor = data.next_cursor;
    } catch (e) {
      Logger.log('🛑에러');
      hasMore = false;
    }
  }
  return list;
}

// 로고
function getLogoBase64() {
  Logger.log('🖼️ 로고');
  try {
    const content = HtmlService.createHtmlOutputFromFile('Logo').getContent();
    
    // 추출
    const match = content.match(/logo\s*=\s*['"](.*?)['"]/);
    if (match && match[1]) {
      // 반환
      return match[1];
    }
  } catch(e) {
    Logger.log('🛑 에러');
  }
  
  // 실패
  return null;
}

// 저장
function saveHistoryToNotion(dataStr, email, name) {
  Logger.log('💾 저장');

  // 압축
  var compressedBase64 = dataStr;
  try {
    var blob = Utilities.newBlob(dataStr).setContentType('text/plain');
    var zipped = Utilities.gzip(blob);
    compressedBase64 = Utilities.base64Encode(zipped.getBytes());
  } catch(e) {
    Logger.log('🛑 에러');
  }

  var max = 2000;
  var arr1 = [];
  var arr2 = [];
  
  var mid = Math.ceil(compressedBase64.length / 2);
  var p1 = compressedBase64.substring(0, mid);
  var p2 = compressedBase64.substring(mid);

  for (var i = 0; i < p1.length && arr1.length < 95; i += max) {
    arr1.push({ text: { content: p1.substring(i, i + max) } });
  }
  for (var j = 0; j < p2.length && arr2.length < 95; j += max) {
    arr2.push({ text: { content: p2.substring(j, j + max) } });
  }

  var payload = {
    parent: { database_id: NOTION_DB_ID_SAVE },
    properties: {
      '작업자': { title: [{ text: { content: name } }] },
      '작업계정': { email: email },
      '프로그램유형': { select: { name: '내일전표이미지' } },
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
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    var res = UrlFetchApp.fetch('https://api.notion.com/v1/pages', options);
    if (res.getResponseCode() !== 200) {
      Logger.log('🛑 에러');
    } else {
      Logger.log('✅ 성공');
    }
  } catch(e) {
    Logger.log('🛑 에러');
  }
}

// 조회
function getHistoryFromNotion(sDate, eDate) {
  var payload = {
    filter: {
      and: [
        { property: '프로그램유형', select: { equals: '내일전표이미지' } },
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
    
    var rawData = c1 + c2;

    // 복원
    try {
      var bytes = Utilities.base64Decode(rawData);
      var blob = Utilities.newBlob(bytes, 'application/x-gzip');
      var unzipped = Utilities.ungzip(blob);
      rawData = unzipped.getDataAsString();
    } catch (e) {}

    out.push({
      worker: worker,
      time: time,
      data: rawData
    });
  }
  return out;
}

// 최신
function getLatestHistoryFromNotion() {
  Logger.log('🔄 찾기');
  try {
    var payload = {
      filter: { property: '프로그램유형', select: { equals: '내일전표이미지' } },
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
      
      var rawData = c1 + c2;

      // 복원
      try {
        var bytes = Utilities.base64Decode(rawData);
        var blob = Utilities.newBlob(bytes, 'application/x-gzip');
        var unzipped = Utilities.ungzip(blob);
        rawData = unzipped.getDataAsString();
      } catch (e) {}

      return { data: rawData };
    }
  } catch (e) {}
  return null;
}