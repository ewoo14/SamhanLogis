// 환경설정
const NOTION_TOKEN_LOG = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_LOG = '2eda1006d65880d696b3da4a8d281ea2';

const NOTION_TOKEN_AUTH = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_AUTH = '2dda1006d6588047b1bbc7c2660203c0';

const NOTION_TOKEN_SHIPPING = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_SHIPPING = '2f8a1006d658803face6fdfe2b175780';

// 일괄처리
function processLongTermUnusedClientsFast() {
  Logger.log('▶️ 처리시작');
  
  const now = new Date();
  const dayOfWeek = now.getDay();
  const isMonday = (dayOfWeek === 1);
  
  const thresholdDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
  const thresholdIso = thresholdDate.toISOString();
  
  const activeBizNos = new Set();
  
  // 최근 30일 내 활동 데이터 조회
  getActiveBizNosFromLog_(thresholdIso, activeBizNos);
  getActiveBizNosFromShipping_(thresholdIso, activeBizNos);

  // 대상 업체 조회
  const targetClients = getTargetClients_();

  for (const client of targetClients) {
    const numBizNo = Number(String(client.bizNo).replace(/[^\d]/g, ''));
    if (!numBizNo) continue;

    const isActive = activeBizNos.has(numBizNo);

    // 승인 -> 장기미발주 전환 (월요일 자정에만 체크)
    if (client.status === '승인' && isMonday) {
      if (!isActive && client.createdTime < thresholdDate) {
        try {
          updateClientStatus_(client.pageId, '장기미발주');
          Logger.log(`✅ 장기미발주전환`);
        } catch (e) {
          Logger.log(`❌ 전환실패`);
        }
      }
    } 
    // 장기미발주 -> 승인 복구 (매일 체크)
    else if (client.status === '장기미발주') {
      if (isActive) {
        try {
          updateClientStatus_(client.pageId, '승인');
          Logger.log(`✅ 승인복구`);
        } catch (e) {
          Logger.log(`❌ 복구실패`);
        }
      }
    }
  }

  Logger.log(`⏹️ 처리완료 (월요일여부: ${isMonday})`);
}

// 로그조회
function getActiveBizNosFromLog_(thresholdIso, activeSet) {
  let hasMore = true;
  let nextCursor = null;
  const url = `https://api.notion.com/v1/databases/${NOTION_DB_ID_LOG}/query`;

  while (hasMore) {
    const payload = {
      filter: {
        and: [
          { timestamp: 'created_time', created_time: { on_or_after: thresholdIso } },
          { property: '로그', rich_text: { contains: '주문 성공' } }
        ]
      },
      page_size: 100
    };
    if (nextCursor) payload.start_cursor = nextCursor;

    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + NOTION_TOKEN_LOG,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    if (res.getResponseCode() !== 200) {
      Logger.log(`❌ 로그조회실패`);
      break;
    }

    const json = JSON.parse(res.getContentText());
    json.results.forEach(page => {
      const numBizNo = page.properties['거래처코드']?.number;
      if (numBizNo) activeSet.add(numBizNo);
    });

    hasMore = json.has_more;
    nextCursor = json.next_cursor;
  }
}

// 출고조회
function getActiveBizNosFromShipping_(thresholdIso, activeSet) {
  let hasMore = true;
  let nextCursor = null;
  const url = `https://api.notion.com/v1/databases/${NOTION_DB_ID_SHIPPING}/query`;

  while (hasMore) {
    const payload = {
      filter: {
        or: [
          {
            timestamp: 'created_time',
            created_time: { on_or_after: thresholdIso }
          },
          {
            property: '출고일',
            date: { on_or_after: thresholdIso }
          }
        ]
      },
      page_size: 100
    };
    if (nextCursor) payload.start_cursor = nextCursor;

    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + NOTION_TOKEN_SHIPPING,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    if (res.getResponseCode() !== 200) {
      Logger.log(`❌ 출고조회실패`);
      break;
    }

    const json = JSON.parse(res.getContentText());
    json.results.forEach(page => {
      const numBizNo = page.properties['거래처코드']?.number;
      if (numBizNo) activeSet.add(numBizNo);
    });

    hasMore = json.has_more;
    nextCursor = json.next_cursor;
  }
}

// 대상조회
function getTargetClients_() {
  const clients = [];
  let hasMore = true;
  let nextCursor = null;
  const url = `https://api.notion.com/v1/databases/${NOTION_DB_ID_AUTH}/query`;

  while (hasMore) {
    const payload = {
      filter: {
        or: [
          { property: '승인상태', select: { equals: '승인' } },
          { property: '승인상태', select: { equals: '장기미발주' } }
        ]
      },
      page_size: 100
    };
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
      Logger.log(`❌ 대상조회실패`);
      break;
    }

    const json = JSON.parse(res.getContentText());
    json.results.forEach(page => {
      const bizNo = page.properties['거래처코드']?.title?.[0]?.plain_text || '';
      const status = page.properties['승인상태']?.select?.name || '';
      clients.push({
        pageId: page.id,
        bizNo: bizNo,
        status: status,
        createdTime: new Date(page.created_time)
      });
    });

    hasMore = json.has_more;
    nextCursor = json.next_cursor;
  }
  return clients;
}

// 상태변경
function updateClientStatus_(pageId, newStatus) {
  const url = `https://api.notion.com/v1/pages/${pageId}`;
  const payload = {
    properties: {
      '승인상태': { select: { name: newStatus } }
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
    muteHttpExceptions: true
  });
}