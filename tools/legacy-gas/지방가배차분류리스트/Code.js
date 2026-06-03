// 상수
const NOTION_TOKEN_AUTH        = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_AUTH        = '198a1006d65880ddb510e0d525c5e9da';
const NOTION_TOKEN_SAVE        = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_SAVE        = '328a1006d65880159a82d02ba10d0e8c';

// 시작
function doGet() {
  Logger.log('🚀 시작');
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('삼한공조시스템 지방 가배차 프로그램')
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
      filter: { property: '초대계정(지메일)', email: { equals: email } }
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
      
      return { authorized: true, email: email, managerName: fullName };
    }
  } catch (e) {
    Logger.log('🛑 에러');
    return { authorized: false, email: email, error: String(e) };
  }
  
  Logger.log('⛔ 미등록');
  return { authorized: false, email: email, error: '미등록 계정' };
}

// 기록
function saveHistoryToNotion(dataStr, email, name) {
  Logger.log('🔄 저장');
  var max = 2000;
  var arr1 = [];
  var arr2 = [];

  for (var i = 0; i < dataStr.length; i += max) {
    var chunk = dataStr.substring(i, i + max);
    if (arr1.length < 100) {
      arr1.push({ text: { content: chunk } });
    } else if (arr2.length < 100) {
      arr2.push({ text: { content: chunk } });
    } else {
      break; 
    }
  }

  var payload = {
    parent: { database_id: NOTION_DB_ID_SAVE },
    properties: {
      '작업자': { title: [{ text: { content: name } }] },
      '작업계정': { email: email },
      '프로그램유형': { select: { name: '지방배차분류리스트' } },
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
  
  var res = UrlFetchApp.fetch('https://api.notion.com/v1/pages', options);
  Logger.log(res.getContentText());
}

// 찾기
function getHistoryFromNotion(sDate, eDate) {
  Logger.log('🔄 내역');
  var payload = {
    filter: {
      and: [
        { property: '프로그램유형', select: { equals: '지방배차분류리스트' } },
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
    
    var worker = props['작업자']?.title?.[0]?.plain_text || '';
    var time = row.created_time;
    
    var c1 = props['저장내역1']?.rich_text?.map(t => t.plain_text).join('') || '';
    var c2 = props['저장내역2']?.rich_text?.map(t => t.plain_text).join('') || '';
    
    out.push({ worker: worker, time: time, data: c1 + c2 });
  }
  return out;
}

// 최신
function getLatestHistoryFromNotion() {
  Logger.log('🔄 최신');
  try {
    var payload = {
      filter: { property: '프로그램유형', select: { equals: '지방배차분류리스트' } },
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
      var c1 = props['저장내역1']?.rich_text?.map(t => t.plain_text).join('') || '';
      var c2 = props['저장내역2']?.rich_text?.map(t => t.plain_text).join('') || '';
      return { data: c1 + c2 };
    }
  } catch (e) {}
  return null;
}

// 정리
function cleanValue(v) {
  if (v == null) return '';
  var s = String(v).trim();
  return !s || s.toLowerCase() === 'nan' ? '' : s;
}

// 포맷
function formatComma(n) {
  if (n === '' || n == null) return '';
  var num = Number(String(n).replace(/[^\d.-]/g, ''));
  return isNaN(num) ? '' : num.toLocaleString('ko-KR');
}

// 변환
function sheetToObjectsByHeaderRow(sheet, headerRow) {
  Logger.log('🗂️ 변환');
  var values = sheet.getDataRange().getValues();
  if (!values || values.length < headerRow) return [];
  var headers = values[headerRow - 1].map(function(h){ return String(h).trim(); });
  var out = [];
  for (var r = headerRow; r < values.length; r++) {
    var row = values[r];
    var empty = row.every(function(v){ return String(v).trim() === ''; });
    if (empty) continue;
    var o = {};
    for (var c = 0; c < headers.length; c++) o[headers[c]] = row[c];
    out.push(o);
  }
  return out;
}

// 전역
var region_hierarchy = {};
var region_priority  = [];

// 순서
function get_region_index(sido) {
  var i = region_priority.indexOf(sido);
  return i >= 0 ? i : region_priority.length;
}

// 파싱
function parse_address(addr) {
  var three = String(addr).split(/\s+/).slice(0,3).join(' ');
  for (var g of region_priority) {
    if (/광역시$/.test(g)) {
      var base = g.replace(/광역시$/,'');
      if (String(addr).indexOf(base) > -1) {
        for (var t of (region_hierarchy[g] || [])) {
          if (three.indexOf(t) > -1) return [g, t];
        }
      }
    }
  }
  for (var g2 of region_priority) {
    if (/특별시$/.test(g2) && !/특별자치시$/.test(g2)) {
      for (var t2 of (region_hierarchy[g2] || [])) {
        if (three.indexOf(t2) > -1) return [g2, t2];
      }
    }
  }
  for (var g3 of region_priority) {
    if (/(특별자치시|특별자치도)$/.test(g3)) {
      var base3 = g3.replace(/(특별자치시|특별자치도)$/,'');
      if (three.indexOf(base3) > -1 || three.indexOf(g3) > -1) return [g3, ''];
    }
  }
  for (var g4 of region_priority) {
    if (!/(광역시|특별시|특별자치시|특별자치도)$/.test(g4)) {
      for (var t4 of (region_hierarchy[g4] || [])) {
        if (three.indexOf(t4) > -1) return [g4, t4];
      }
    }
  }
  return ['<미분류>',''];
}

// 분류
function runClassification(ecountData, day) {
  Logger.log('📊 분류');
  try {
    var tempRecs = [];

    ecountData.forEach(function(r) {
      var raw = String(r['배송주소'] || '').trim();
      
      if (raw.indexOf('지방') === 0 || raw.indexOf('지방/') > -1) {
        var cleanAddr = raw.replace(/^지방\s*[/\:]\s*/, '').trim();
        
        var cust = r['거래처'] || '';
        cust = cust.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, '');
        cust = cust.replace(/\s*(주식회사|유한회사|사단법인|재단법인|합자회사|합명회사|협동조합|농업회사법인|㈜|주\)|구\))\s*/g, '');
        cust = cust.replace(/\*/g, '');
        cust = cust.split(/[-–—－]/)[0].trim();
        
        var rawSaleNum = String(cleanValue(r['판매번호'] || r['판매 번호']));
        var dateVal = '';
        var vid = '';
        
        if (rawSaleNum.indexOf('-') > -1) {
          var parts = rawSaleNum.split(/\s*-\s*/);
          dateVal = parts[0].trim();
          vid = parts[1] ? parts[1].trim() : '';
        } else {
          vid = rawSaleNum.trim();
        }
        
        var spec = r['특이사항'] || '';
        var wh = r['출고창고'] || '';
        if (wh === '삼성창고 (초월 무갑)') wh = '초월창고';
        var itemVal = r['품목명'] || r['품목'] || r['품 목'] || '';
        var amt = r['금액'] || r['금 액'];
        if (amt !== '' && amt != null) amt = formatComma(amt);

        tempRecs.push({
          '주소': cleanAddr,
          '업체명': cust,
          '전표번호': vid,
          '특이사항': spec,
          '창고': wh,
          '품목': itemVal,
          '날짜': dateVal,
          '금액': amt || ''
        });
      }
    });

    tempRecs.sort(function(a, b){
      var dateA = String(a['날짜']);
      var dateB = String(b['날짜']);
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      
      var vidA = String(a['전표번호']);
      var vidB = String(b['전표번호']);
      return vidB.localeCompare(vidA);
    });

    var finalOut = [];
    tempRecs.forEach(function(rr){
      finalOut.push({
        '주소': rr['주소'],
        '업체명': rr['업체명'],
        '전표번호': rr['전표번호'],
        '특이사항': rr['특이사항'],
        '창고': rr['창고'],
        '품목': rr['품목'],
        '날짜': rr['날짜'],
        '금액': rr['금액']
      });
    });

    var processedCount = tempRecs.length;
    var stats = {
      total: ecountData.length,
      processed: processedCount
    };

    return { status: 'success', data: finalOut, stats: stats };
  } catch (e) {
    return { status: 'error', message: String(e) };
  }
}