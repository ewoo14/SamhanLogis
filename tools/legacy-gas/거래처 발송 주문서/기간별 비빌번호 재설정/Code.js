/** 비밀번호 로테이션 */
function rotatePasswordsMonthly() {
  const NOTION_TOKEN_AUTH = 'REDACTED_NOTION_TOKEN';
  const NOTION_DB_ID_AUTH = '2dda1006d6588047b1bbc7c2660203c0';

  const dbId = NOTION_DB_ID_AUTH;
  const headers = {
    'Authorization': 'Bearer ' + NOTION_TOKEN_AUTH,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
  };

  Logger.log('>> 🔄 [월간작업] 비밀번호 로테이션 시작...');

  // 전체 사용자 페이지 조회
  let pages = [];
  let cursor = undefined;
  
  try {
    do {
      const url = `https://api.notion.com/v1/databases/${dbId}/query`;
      const payload = cursor ? { start_cursor: cursor } : {};
      
      const res = UrlFetchApp.fetch(url, {
        method: 'post',
        headers: headers,
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      
      const json = JSON.parse(res.getContentText());
      if (json.results) {
        pages = pages.concat(json.results);
      }
      cursor = json.next_cursor;
    } while (cursor);
  } catch (e) {
    Logger.log('>> 🚨 사용자 목록 조회 실패: ' + e);
    return; // 목록을 못 가져오면 중단
  }

  Logger.log(`>> 👥 총 ${pages.length}개의 계정 처리 예정`);

  // 각 페이지별 데이터 이동 및 업데이트
  for (const page of pages) {
    try {
      const props = page.properties;
      const valCurrent = getSafeText_(props, '현재PW');
      const val1 = getSafeText_(props, '과거1');
      const val2 = getSafeText_(props, '과거2');
      const val3 = getSafeText_(props, '과거3');
      const val4 = getSafeText_(props, '과거4');

      if (!valCurrent && !val1 && !val2 && !val3 && !val4) {
        continue; 
      }

      // 한 칸씩 뒤로 밀어서 업데이트 페이로드 구성
      const updateProps = {
        '과거5': makeRichText_(val4),      // 과거4 -> 과거5
        '과거4': makeRichText_(val3),      // 과거3 -> 과거4
        '과거3': makeRichText_(val2),      // 과거2 -> 과거3
        '과거2': makeRichText_(val1),      // 과거1 -> 과거2
        '과거1': makeRichText_(valCurrent),// 현재PW -> 과거1
        '현재PW': makeRichText_('')        // 현재PW -> 초기화(삭제)
      };

      // 노션 업데이트 전송
      const updateUrl = `https://api.notion.com/v1/pages/${page.id}`;
      UrlFetchApp.fetch(updateUrl, {
        method: 'patch',
        headers: headers,
        payload: JSON.stringify({ properties: updateProps }),
        muteHttpExceptions: true
      });
      
      // 노션 API 속도 제한 고려
      Utilities.sleep(200); 

    } catch (e) {
      Logger.log(`>> ⚠️ [개별실패] Page ID(${page.id}): ${e}`);
    }
  }
  
  Logger.log('>> ✅ [월간작업] 비밀번호 로테이션 완료');
}

// 노션 속성에서 텍스트 안전하게 추출
function getSafeText_(props, key) {
  if (!props[key] || !props[key].rich_text || props[key].rich_text.length === 0) {
    return '';
  }
  return props[key].rich_text[0].plain_text;
}

// 노션 업데이트용 텍스트 객체 생성
function makeRichText_(txt) {
  const content = (txt === null || txt === undefined) ? '' : String(txt);
  return {
    rich_text: [{ text: { content: content } }]
  };
}