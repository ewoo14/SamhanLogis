// 상수
const NOTION_TOKEN_AUTH = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_AUTH = '198a1006d65880ddb510e0d525c5e9da';
const NOTION_TOKEN_SAVE = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_SAVE = '32ca1006d65880058318e83dfabf6682';
const PROGRAM_TYPE = '지출품의서';

// 화면
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('지출품의서 작성')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 인증
function getUserAuth() {
  var email = Session.getActiveUser().getEmail();
  if (!email) {
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
      return { authorized: false, email: email, error: '접근 거부' };
    }
    if (data.results && data.results.length > 0) {
      const props = data.results[0].properties;
      const getTitle = (p) => p?.title?.[0]?.plain_text || '';
      const getSelect = (p) => p?.select?.name || '';
      const name = getTitle(props['이름']);
      const rank = getSelect(props['직급']);
      return { authorized: true, email: email, managerName: rank ? name + ' ' + rank : name };
    }
  } catch (e) {
    return { authorized: false, email: email, error: String(e) };
  }
  return { authorized: false, email: email, error: '미등록 계정' };
}

// 저장
function saveHistoryToNotion(jsonStr, email, name, topic) {
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
      '작업자': { title: [{ text: { content: name || '' } }] },
      '작업계정': { email: email || '' },
      '프로그램유형': { select: { name: PROGRAM_TYPE } },
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
  try {
    var decoded = Utilities.base64Decode(b64Data);
    var blob = Utilities.newBlob(decoded, 'application/x-gzip');
    var unzipped = Utilities.ungzip(blob);
    return unzipped.getDataAsString();
  } catch (e) {
    throw new Error('데이터 파싱 오류');
  }
}

// 조회
function getHistoryFromNotion(sDate, eDate) {
  var payload = {
    filter: {
      and: [
        { property: '프로그램유형', select: { equals: PROGRAM_TYPE } },
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
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var res = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + NOTION_DB_ID_SAVE + '/query', options);
  var data = JSON.parse(res.getContentText());
  var out = [];
  if (!data.results) return out;

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