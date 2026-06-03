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
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('배차안내문자 관리')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 인증
function getUserAuth() {
  var email = Session.getActiveUser().getEmail();
  
  if (!email) {
    return { authorized: false, email: '확인불가', error: '이메일을 가져올 수 없습니다 배포 설정을 확인하세요' };
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
      return { authorized: false, email: email, error: '노션 접근 거부 연결 추가 확인 요망' };
    }
    
    if (data.results && data.results.length > 0) {
      const props = data.results[0].properties;
      const getText = (p) => p?.rich_text?.[0]?.plain_text || '';
      const getTitle = (p) => p?.title?.[0]?.plain_text || '';
      const getSelect = (p) => p?.select?.name || '';
      
      const name = getTitle(props['이름']);
      const rank = getSelect(props['직급']);
      const fullName = rank ? name + ' ' + rank : name;
      
      return { 
        authorized: true,
        email: email,
        ecountId: getText(props['이카운트ID']),
        ecountApi: getText(props['이카운트API']),
        managerCode: getText(props['담당자코드']),
        managerName: fullName
      };
    }
  } catch (e) {
    return { authorized: false, email: email, error: String(e) };
  }
  
  return { authorized: false, email: email, error: 'DB에 등록되지 않은 이메일입니다' };
}

// 아이디
function getIdFromUrl(url) {
  if (!url) throw new Error('오류');
  var m = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) throw new Error('오류');
  return m[1];
}

// 텍스트
function normalizeStr(val) {
  var text = String(val == null ? '' : val).trim();
  try { text = text.normalize('NFKC'); } catch(e) {}
  text = text.replace(/[‐\-‒–—―－]/g, '-');
  text = text.replace(/（/g, '(').replace(/）/g, ')');
  text = text.replace(/[\u200B-\u200F\u202A-\u202E]/g, '');
  return text;
}

// 매칭
function normalizeForMatch(val) {
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
  if (val === null || val === undefined) return '';
  var s = String(val).trim();
  if (!s || s.toLowerCase() === 'nan') return '';
  return s;
}

// 판별
function isAccountingRoom_(name) {
  try {
    var s = String(name || '');
    return /회계/i.test(s);
  } catch(e) {
    return false;
  }
}

// 변환
function sheetToObjects(sheet) {
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

// 실행
function processDispatchData(payloadStr) {
  Logger.log('⚙️실행');
  try {
    var payload = JSON.parse(payloadStr);
    var df_source = payload.source;
    var df_driver = payload.driver;
    var df_ecount = payload.ecount;

    var tz = 'Asia/Seoul';
    var baseDate = new Date();
    
    var chatData = getChatMapData();
    var blockData = getForbiddenData();

    var blocklist = {};
    blockData.forEach(function(name){
      var k = normalizeForMatch(name);
      if (k) blocklist[k] = true;
    });

    var ecountIndex = {};
    df_ecount.forEach(function(row){
      var fullKey = String(row['판매번호'] || '').trim();
      var parts = fullKey.split('-');
      var numKey = parts.length > 1 ? parts[1].trim() : fullKey;
      if (numKey && !ecountIndex[numKey]) ecountIndex[numKey] = row;
    });

    var kakaoIndex = {};
    Object.keys(chatData).forEach(function(name){
      var k = normalizeForMatch(name);
      if (!k) return;
      var room = cleanValue(chatData[name]);
      if (isAccountingRoom_(room)) return;
      if (!kakaoIndex[k]) kakaoIndex[k] = room;
    });

    var driverRows = df_driver.map(function(d){
      return { 업체명: cleanValue(d['업체명']), 연락처: cleanValue(d['배송기사 연락처']) };
    });

    var result_rows = [];
    for (var i = 0; i < df_source.length; i++) {
      var original_text = normalizeStr(cleanValue(df_source[i]['배차요청내역']));
      if (!original_text) continue;

      var parens = original_text.match(/\([^)]*\)/g);
      if (!parens || !parens.length) continue;

      var dispatch_number = '';
      for (var p = 0; p < parens.length; p++) {
        var inner = parens[p].slice(1, -1);
        if (/높이/i.test(inner) && /m/i.test(inner)) continue;
        
        var numMatch = inner.match(/(?:^|[^\d])(\d{1,3})\s*$/);
        if (numMatch) {
          dispatch_number = numMatch[1];
          break;
        }
      }
      if (!dispatch_number) continue;

      var match_row = ecountIndex[dispatch_number];

      if (!match_row) {
        result_rows.push({
          '원본내역': original_text,
          '거래처명': '',
          '전표번호': dispatch_number,
          '배송주소': '',
          '인수자 번호': '',
          '발송멘트': '이카운트 데이터 없음 최신화요망!',
          '단톡방': '',
          '기사번호': '',
          'type_word': '당일배송',
          'override_sun': 'FALSE',
          'is_remote': false
        });
        continue;
      }

      var 거래처_raw = cleanValue(match_row['거래처']);
      var 거래처_norm = normalizeForMatch(거래처_raw);

      if (거래처_norm && blocklist[거래처_norm]) {
        var kakao_room_blk = '';
        if (거래처_norm && kakaoIndex[거래처_norm]) {
          var rblk = kakaoIndex[거래처_norm];
          kakao_room_blk = isAccountingRoom_(rblk) ? '' : rblk;
        }
        result_rows.push({
          '원본내역': original_text,
          '거래처명': 거래처_raw,
          '전표번호': dispatch_number,
          '배송주소': '',
          '인수자 번호': '',
          '발송멘트': '발송금지 업체입니다.',
          '단톡방': kakao_room_blk,
          '기사번호': '',
          'type_word': '당일배송',
          'override_sun': 'FALSE',
          'is_remote': false
        });
        continue;
      }

      var 배송주소 = cleanValue(match_row['배송주소']);
      var is_remote = /^(지방|야적|야상)\s*\//.test(배송주소);
      if (is_remote) 배송주소 = 배송주소.replace(/^(지방|야적|야상)\s*\/\s*/, '');

      var raw_phone = cleanValue(match_row['인수자 번호']);
      var phone_match = raw_phone.match(/(010(?:[-.\s]?\d){8})/);
      var 인수자번호 = '';
      if (phone_match) {
        var digits = phone_match[1].replace(/\D/g, '');
        if (digits.length === 11) 인수자번호 = digits.slice(0,3) + '-' + digits.slice(3,7) + '-' + digits.slice(7);
      }

      var kakao_room = '';
      if (거래처_norm && kakaoIndex[거래처_norm]) {
        var r = kakaoIndex[거래처_norm];
        kakao_room = isAccountingRoom_(r) ? '' : r;
      }

      var driver_phone = '';
      for (var d = 0; d < driverRows.length && !driver_phone; d++) {
        var segs = driverRows[d].업체명.split('/');
        for (var s = 0; s < segs.length; s++) {
          var seg = segs[s].trim();
          var segDigits = seg.replace(/\D/g, '');
          if ((seg.indexOf('-') > -1 && seg.split('-')[1] === dispatch_number) ||
              (/^\d+$/.test(seg) && seg === dispatch_number) ||
              (seg.match(/(\d{1,3})$/) && seg.match(/(\d{1,3})$/)[1] === dispatch_number) ||
              (segDigits === dispatch_number)) {
            driver_phone = driverRows[d].연락처;
            break;
          }
        }
      }

      var fullKeyStr = String(match_row['판매번호'] || '');
      var rowBaseDate = new Date(baseDate.getTime());
      
      var salesDateMatch = fullKeyStr.match(/(\d{4})[-./\s]+(\d{1,2})[-./\s]+(\d{1,2})/);
      if (salesDateMatch) {
        rowBaseDate = new Date(Number(salesDateMatch[1]), Number(salesDateMatch[2]) - 1, Number(salesDateMatch[3]));
      }
      
      var delivery_day = rowBaseDate.getDate();
      var hasSundayWord = false;

      if (is_remote) {
        var special_note = cleanValue(match_row['특이사항']);
        var sangMatch = special_note.match(/(\d{1,2})\s*(?:일\s*)?(?:상|상차|출고)/);
        
        if (sangMatch) {
          delivery_day = Number(sangMatch[1]);
        } else {
          var nums = [];
          var mm2, reNum = /\d+/g;
          while ((mm2 = reNum.exec(special_note)) !== null) nums.push(Number(mm2[0]));
          
          var valid_days = [];
          for (var off = -2; off <= 5; off++) {
            var testDate = new Date(rowBaseDate.getFullYear(), rowBaseDate.getMonth(), rowBaseDate.getDate() + off);
            valid_days.push(testDate.getDate());
          }
          for (var vd = 0; vd < valid_days.length; vd++) {
            if (nums.indexOf(valid_days[vd]) > -1) { delivery_day = valid_days[vd]; break; }
          }
        }
        hasSundayWord = /일요일/.test(special_note);
      }

      var type_word = '당일배송';
      var t_addr = String(match_row['배송주소']).trim();
      if (/^지방\s*\//.test(t_addr)) type_word = '지방배송';
      else if (/^(야적|야상)\s*\//.test(t_addr)) type_word = '야적배송';

      var display_address = cleanValue(match_row['배송주소']).replace(/^(지방|야적|야상)\s*\/\s*/, '');
      var truncated_display = normalizeStr(display_address).split(/\s+/).slice(0, 3).join(' ');

      var 발송멘트_text = driver_phone ? (driver_phone + ' / ' + truncated_display) : '기사번호 없음 확인요망!';

      result_rows.push({
        '원본내역': original_text,
        '거래처명': 거래처_raw,
        '전표번호': dispatch_number,
        '배송주소': 배송주소,
        '인수자 번호': 인수자번호,
        '발송멘트': 발송멘트_text,
        '단톡방': kakao_room,
        '기사번호': driver_phone,
        'type_word': type_word,
        'delivery_year': rowBaseDate.getFullYear(),
        'delivery_month': rowBaseDate.getMonth(),
        'delivery_day': delivery_day,
        'override_sun': (is_remote && hasSundayWord) ? 'TRUE' : 'FALSE',
        'is_remote': is_remote
      });
    }

    var uniqueMap = {};
    result_rows.forEach(function(r){
      var k = r['전표번호'];
      if (!k) return;
      if (!uniqueMap[k]) uniqueMap[k] = r;
      else {
        var hasOld = String(uniqueMap[k]['기사번호'] || '').trim() !== '';
        var hasNew = String(r['기사번호'] || '').trim() !== '';
        if (!hasOld && hasNew) uniqueMap[k] = r;
      }
    });
    var dedup = Object.keys(uniqueMap).map(function(k){ return uniqueMap[k]; });

    function cmp(a, b) {
      function boolKey(x) { return String(x).trim() ? 0 : 1; }
      var aHas = boolKey(a['단톡방']), bHas = boolKey(b['단톡방']);
      if (aHas !== bHas) return aHas - bHas;
      var aKey = aHas === 0 ? normalizeForMatch(a['단톡방']) : '';
      var bKey = bHas === 0 ? normalizeForMatch(b['단톡방']) : '';
      if (aKey !== bKey) return aKey < bKey ? -1 : 1;
      var aNum = aHas === 1 ? a['인수자 번호'] : '';
      var bNum = bHas === 1 ? b['인수자 번호'] : '';
      if (aNum !== bNum) return aNum < bNum ? -1 : 1;
      var aCust = a['거래처명'] || '', bCust = b['거래처명'] || '';
      if (aCust !== bCust) return aCust < bCust ? -1 : 1;
      var aDrv = boolKey(a['기사번호']), bDrv = boolKey(b['기사번호']);
      if (aDrv !== bDrv) return aDrv - bDrv;
      return 0;
    }
    dedup.sort(cmp);

    var error_msgs = {'기사번호 없음 확인요망!': true, '이카운트 데이터 없음 최신화요망!': true, '발송금지 업체입니다.': true};
    var finalData = [];
    var iidx = 0;
    
    while (iidx < dedup.length) {
      var row = dedup[iidx];
      if (error_msgs[row['발송멘트']]) {
        finalData.push({
          '원본내역': row.원본내역, '거래처명': row.거래처명, '전표번호': row.전표번호,
          '배송주소': row.배송주소, '인수자번호': row['인수자 번호'], '발송멘트': row.발송멘트, '단톡방': row.단톡방
        });
        iidx++;
      } else {
        var roomKey = String(row['단톡방'] || '').trim();
        var phoneKey = String(row['인수자 번호'] || '').trim();
        var key = roomKey ? 'R_' + roomKey : (phoneKey ? 'P_' + phoneKey : 'N_' + iidx);

        var j = iidx;
        while (j < dedup.length) {
          var rj = dedup[j];
          if (error_msgs[rj['발송멘트']]) break;
          
          var rjRoom = String(rj['단톡방'] || '').trim();
          var rjPhone = String(rj['인수자 번호'] || '').trim();
          var k2 = rjRoom ? 'R_' + rjRoom : (rjPhone ? 'P_' + rjPhone : 'N_' + j);
          
          if (k2 !== key) break;
          j++;
        }
        var group = dedup.slice(iidx, j);

        var type0 = String(group[0]['type_word'] || '');
        var isRemoteGroup = (type0.indexOf('지방배송') > -1) || (type0.indexOf('야적배송') > -1);
        var head;
        
        var targetDayNum;
        if (isRemoteGroup) {
          var loadDayNum = Number(group[0]['delivery_day']);
          var loadYear = Number(group[0]['delivery_year'] || Number(Utilities.formatDate(baseDate, tz, 'yyyy')));
          var loadMonth = Number(group[0]['delivery_month'] || (Number(Utilities.formatDate(baseDate, tz, 'M')) - 1));
          
          var overrideSun = false;
          for (var gi2 = 0; gi2 < group.length; gi2++) {
            if (String(group[gi2]['override_sun']) === 'TRUE') { overrideSun = true; break; }
          }

          var loadDate = new Date(loadYear, loadMonth, loadDayNum);
          var unloadDate = new Date(loadDate.getTime());
          var dow = loadDate.getDay();
          
          if (dow === 6) {
            unloadDate.setDate(unloadDate.getDate() + (overrideSun ? 1 : 2));
          } else {
            unloadDate.setDate(unloadDate.getDate() + 1);
          }
          
          targetDayNum = Number(Utilities.formatDate(unloadDate, tz, 'd'));
        } else {
          targetDayNum = Number(group[0]['delivery_day']);
        }

        head = [
          'AI 삼성무풍 시스템에어컨 배차실입니다.',
          targetDayNum + '일 하차 건 배송기사님 연락처를 안내드립니다.'
        ].join('\n');

        var lines = group.map(function(g){ return g['발송멘트']; }).filter(function(t){ return t; });
        var mergedText = head + (lines.length ? '\n' + lines.join('\n') : '');
        if (!String(group[0]['단톡방'] || '').trim()) {
          mergedText += '\n\n※출하창고 상황에 따라 지연될 수 있음을 양해 부탁드립니다.';
        }
        
        for (var gi = 0; gi < group.length; gi++) {
          finalData.push({
            '원본내역': group[gi].원본내역,
            '거래처명': group[gi].거래처명,
            '전표번호': group[gi].전표번호,
            '배송주소': group[gi].배송주소,
            '인수자번호': group[gi]['인수자 번호'],
            '발송멘트': mergedText,
            '단톡방': group[gi].단톡방
          });
        }
        
        iidx = j;
      }
    }

    return JSON.stringify({ status: 'success', data: finalData });

  } catch (e) {
    return JSON.stringify({ status: 'error', message: String(e) });
  }
}

// 저장
function saveHistoryToNotion(dataStr, email, name) {
  try {
    var max = 2000;
    var arr1 = [];
    var arr2 = [];
    
    var mid = Math.ceil(dataStr.length / 2);
    var p1 = dataStr.substring(0, mid);
    var p2 = dataStr.substring(mid);

    for (var i = 0; i < p1.length; i += max) {
      if (arr1.length >= 100) break;
      arr1.push({ text: { content: p1.substring(i, i + max) } });
    }
    for (var j = 0; j < p2.length; j += max) {
      if (arr2.length >= 100) break;
      arr2.push({ text: { content: p2.substring(j, j + max) } });
    }

    var payload = {
      parent: { database_id: NOTION_DB_ID_SAVE },
      properties: {
        '작업자': { title: [{ text: { content: name || '알수없음' } }] },
        '작업계정': { email: email || 'unknown@example.com' },
        '프로그램유형': { select: { name: '배차안내문자' } },
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
    
    UrlFetchApp.fetch('https://api.notion.com/v1/pages', options);
  } catch (e) {
  }
}

// 조회
function getHistoryFromNotion(sDate, eDate) {
  var payload = {
    filter: {
      and: [
        { property: '프로그램유형', select: { equals: '배차안내문자' } },
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

// 탐색
function getLatestHistoryFromNotion() {
  Logger.log('🔄 탐색');
  try {
    var payload = {
      filter: { property: '프로그램유형', select: { equals: '배차안내문자' } },
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

// 톡방
function getChatMapData() {
  Logger.log('💬조회');
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