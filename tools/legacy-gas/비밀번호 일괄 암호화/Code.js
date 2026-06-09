// ⚙️ 환경 설정 (인증 DB)
const NOTION_TOKEN_AUTH = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_AUTH = '2dda1006d6588047b1bbc7c2660203c0';

// 🚀 메인 마이그레이션 함수 (수동으로 1회만 실행)
function migratePasswordsToHash() {
  Logger.log('▶️ 평문 비밀번호 암호화 마이그레이션 시작');
  
  // 1. 인증 DB의 전체 계정 목록 가져오기
  const pages = getAllAuthPages_();
  Logger.log(`총 조회된 계정 수: ${pages.length}개`);
  
  let updateCount = 0;
  
  // 2. 각 계정의 비밀번호 확인 및 암호화
  for (const page of pages) {
    const props = page.properties;
    const bizNo = props['거래처코드']?.title?.[0]?.plain_text || '알수없음';
    const currentPw = props['현재PW']?.rich_text?.[0]?.plain_text || '';
    
    // 비밀번호가 존재하고, 정확히 4자리 숫자(평문)인 경우에만 해시 처리
    if (currentPw && /^\d{4}$/.test(currentPw)) {
      const hashedPw = hashPassword_(currentPw);
      
      try {
        updatePasswordInNotion_(page.id, hashedPw);
        updateCount++;
        Logger.log(`[암호화 완료] 거래처코드: ${bizNo} (평문 -> 해시 변환)`);
      } catch (e) {
        Logger.log(`❌ 업데이트 실패 (${bizNo}): ${e.message}`);
      }
    }
  }
  
  Logger.log(`⏹️ 마이그레이션 완료. 총 ${updateCount}건 암호화됨.`);
}

// 🔐 SHA-256 해시 변환 함수 (기존 프론트엔드와 동일한 로직)
function hashPassword_(pw) {
  const raw = String(pw || '');
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

// 🔍 인증 DB의 모든 페이지 가져오기 (페이지네이션 대응)
function getAllAuthPages_() {
  const pages = [];
  let hasMore = true;
  let nextCursor = null;
  const url = `https://api.notion.com/v1/databases/${NOTION_DB_ID_AUTH}/query`;

  while (hasMore) {
    const payload = { page_size: 100 };
    if (nextCursor) payload.start_cursor = nextCursor;

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

    if (res.getResponseCode() !== 200) {
      Logger.log('❌ 인증 DB 조회 실패: ' + res.getContentText());
      break;
    }

    const json = JSON.parse(res.getContentText());
    pages.push(...json.results);

    hasMore = json.has_more;
    nextCursor = json.next_cursor;
  }
  return pages;
}

// 📝 노션 DB의 '현재PW' 속성 업데이트
function updatePasswordInNotion_(pageId, hashedPw) {
  const url = `https://api.notion.com/v1/pages/${pageId}`;
  const payload = {
    properties: {
      '현재PW': { rich_text: [{ text: { content: hashedPw } }] }
    }
  };

  UrlFetchApp.fetch(url, {
    method: 'patch',
    headers: {
      'Authorization': 'Bearer ' + NOTION_TOKEN_AUTH,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: false
  });
}