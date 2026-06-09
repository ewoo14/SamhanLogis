// 상수
const NOTION_TOKEN_AUTH = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_AUTH = '198a1006d65880ddb510e0d525c5e9da';
const NOTION_TOKEN_SAVE = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_SAVE = '337a1006d65880a8b633fe6ca44573b2';

// 시작
function doGet() {
  Logger.log('🚀시작');
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('가입고처리 프로그램')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 인증
function getUserAuth() {
  Logger.log('🔐인증');
  const email = Session.getActiveUser().getEmail();
  if (!email) return { authorized: false, email: '확인불가', error: '권한필요' };

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
      const getRichText = (p) => p?.rich_text?.[0]?.plain_text || '';
      
      const name = props['이름']?.title?.[0]?.plain_text || '관리자';
      const rank = props['직급']?.select?.name || '';
      const fullName = rank ? name + ' ' + rank : name;

      return { 
        authorized: true, email: email, 
        managerName: fullName,
        ecountId: getRichText(props['이카운트ID']),
        empCode: getRichText(props['담당자코드']),
        ecountApi: getRichText(props['이카운트API'])
      };
    }
  } catch (e) { return { authorized: false, email: email, error: '통신오류' }; }
  return { authorized: false, email: email, error: '미등록' };
}

// 압축
function compressString(str) {
  return Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(str)).getBytes());
}

// 해제
function decompressString(b64) {
  try { return Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip')).getDataAsString(); }
  catch(e) { return ""; }
}

// 저장
function autoSaveToNotion(jsonDataStr, email, name, progType, topic) {
  Logger.log('💾저장');
  const b64Str = compressString(jsonDataStr);
  const payload = {
    parent: { database_id: NOTION_DB_ID_SAVE },
    properties: {
      '작업자': { title: [{ text: { content: name } }] },
      '작업계정': { email: email },
      '프로그램유형': { select: { name: progType } },
      '저장주제': { rich_text: [{ text: { content: topic } }] }
    }
  };

  const chunks = [];
  for (let i = 0; i < b64Str.length; i += 2000) chunks.push(b64Str.substring(i, i + 2000));
  if (chunks.length > 0) payload.properties['저장내역1'] = { rich_text: chunks.slice(0, 100).map(c => ({ text: { content: c } })) };
  if (chunks.length > 100) payload.properties['저장내역2'] = { rich_text: chunks.slice(100, 200).map(c => ({ text: { content: c } })) };

  UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN_SAVE, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload)
  });
  return true;
}

// 조회
function getHistoryFromNotion(start, end, progType) {
  Logger.log('📋조회');
  const payload = {
    filter: {
      and: [
        { property: '프로그램유형', select: { equals: progType } },
        { timestamp: 'created_time', created_time: { on_or_after: start + 'T00:00:00Z' } },
        { timestamp: 'created_time', created_time: { on_or_before: end + 'T23:59:59Z' } }
      ]
    },
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    page_size: 50
  };
  const res = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID_SAVE}/query`, {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN_SAVE, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload)
  });
  const data = JSON.parse(res.getContentText());
  return (data.results || []).map(row => ({
    id: row.id, time: row.created_time, topic: row.properties['저장주제']?.rich_text?.[0]?.plain_text || '', worker: row.properties['작업자']?.title?.[0]?.plain_text || ''
  }));
}

// 상세
function getSpecificHistory(pageId) {
  Logger.log('🔍검색');
  const res = UrlFetchApp.fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'get', headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN_SAVE, 'Notion-Version': '2022-06-28' }
  });
  const p = JSON.parse(res.getContentText()).properties;
  let b64 = "";
  [1, 2].forEach(n => { (p['저장내역' + n]?.rich_text || []).forEach(rt => b64 += rt.plain_text); });
  return decompressString(b64);
}

// 최신
function getLatestHistoryFromNotion(progType) {
  Logger.log('🔄최신');
  const payload = { filter: { property: '프로그램유형', select: { equals: progType } }, sorts: [{ timestamp: 'created_time', direction: 'descending' }], page_size: 1 };
  const res = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID_SAVE}/query`, {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN_SAVE, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload)
  });
  const data = JSON.parse(res.getContentText());
  if (!data.results?.length) return null;
  let b64 = "";
  [1, 2].forEach(n => { (data.results[0].properties['저장내역' + n]?.rich_text || []).forEach(rt => b64 += rt.plain_text); });
  return { data: decompressString(b64) };
}

// 전송
function sendToEcountAPI(payloadStr, auth) {
  Logger.log('📡전송');
  try {
    const COM_CODE = "174539";
    
    // 존조회
    const zoneRes = UrlFetchApp.fetch("http://152.69.228.109:3000/proxy/ecount/zone", { method: 'post', contentType: 'application/json', payload: JSON.stringify({ COM_CODE }), muteHttpExceptions: true });
    if (zoneRes.getResponseCode() !== 200) throw new Error('조회실패');
    const zone = JSON.parse(zoneRes.getContentText()).Data?.ZONE?.toLowerCase();
    
    // 로그인
    const loginRes = UrlFetchApp.fetch("http://152.69.228.109:3000/proxy/ecount/login", {
      method: 'post', contentType: 'application/json', payload: JSON.stringify({ COM_CODE, USER_ID: auth.ecountId, API_CERT_KEY: auth.ecountApi, LAN_TYPE: "ko-KR", ZONE: zone }), muteHttpExceptions: true
    });
    if (loginRes.getResponseCode() !== 200) throw new Error('로그인실패');
    const sessionId = JSON.parse(loginRes.getContentText()).Data?.Datas?.SESSION_ID;
    
    // 구매전표
    const payloadObj = typeof payloadStr === 'string' ? JSON.parse(payloadStr) : payloadStr;
    const saveRes = UrlFetchApp.fetch("http://152.69.228.109:3000/proxy/ecount/purchase", { 
      method: 'post', contentType: 'application/json', payload: JSON.stringify({ SESSION_ID: sessionId, ZONE: zone, payload: payloadObj }), muteHttpExceptions: true 
    });
    if (saveRes.getResponseCode() !== 200) throw new Error('전송실패');
    return { success: true, response: saveRes.getContentText() };
  } catch(e) { return { success: false, error: String(e.message || e) }; }
}