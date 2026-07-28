// 상수
const NOTION_TOKEN_REGION      = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_REGION      = '34ea1006d658808ba38ed69d60a56c38';
const NOTION_TOKEN_AUTH        = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_AUTH        = '198a1006d65880ddb510e0d525c5e9da';
const NOTION_TOKEN_SAVE        = 'REDACTED_NOTION_TOKEN';
const NOTION_DB_ID_SAVE        = '328a1006d65880159a82d02ba10d0e8c';

// 렌더링
function doGet() {
  Logger.log('🚀 시작');
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('삼한공조시스템 가배차분류리스트')
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
      
      return { authorized: true, email: email, managerName: fullName };
    }
  } catch (e) {
    Logger.log('🛑 에러');
    return { authorized: false, email: email, error: String(e) };
  }
  
  Logger.log('⛔ 미등록');
  return { authorized: false, email: email, error: '미등록 계정' };
}

// 저장
function saveHistoryToNotion(dataStr, email, name) {
  Logger.log('🔄 기록');
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
      '프로그램유형': { select: { name: '가배차분류리스트' } },
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
  Logger.log('🔄 찾기');
  var payload = {
    filter: {
      and: [
        { property: '프로그램유형', select: { equals: '가배차분류리스트' } },
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

// 최신 (오류 방지)
function getLatestHistoryFromNotion() {
  Logger.log('🔄 찾기');
  try {
    var payload = {
      filter: { property: '프로그램유형', select: { equals: '가배차분류리스트' } },
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
  Logger.log('📝 정리');
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

// 분류조회
function getRegionFromNotion() {
  Logger.log('🌐 조회');
  var payload = {
    sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
    page_size: 100
  };
  
  var options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + NOTION_TOKEN_REGION,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var res = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + NOTION_DB_ID_REGION + '/query', options);
  if (res.getResponseCode() !== 200) return [];
  
  var data = JSON.parse(res.getContentText());
  var out = [];
  
  data.results.forEach(function(row) {
    var props = row.properties;
    
    var titleKey = Object.keys(props).find(function(k) { return props[k].type === 'title'; });
    var g = '';
    if (titleKey && props[titleKey].title.length > 0) {
      g = props[titleKey].title.map(function(t){ return t.plain_text; }).join('');
    }
    
    var s = '';
    if (props['검색어'] && props['검색어'].rich_text) {
      s = props['검색어'].rich_text.map(function(t){ return t.plain_text; }).join('');
    }
    
    if (g) out.push({ '분류 그룹': g, '검색어': s });
  });
  
  return out;
}

// 전역
var region_hierarchy = {};
var region_priority  = [];
var counters;

// 순서
function get_region_index(sido) {
  var i = region_priority.indexOf(sido);
  return i >= 0 ? i : region_priority.length;
}

// 초기화
function resetCounters() {
  counters = { skip:0, kyungdong:0, logen:0, yajeok:0, jibang:0, returns:0, borrow:0, self:0, warehouse:0 };
}

// 스킵
function skip_warehouse_filter(addr) {
  counters.skip++; counters.warehouse++;
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
  var best = null;
  for (var g4 of region_priority) {
    if (!/(광역시|특별시|특별자치시|특별자치도)$/.test(g4)) {
      for (var t4 of (region_hierarchy[g4] || [])) {
        var pos = three.indexOf(t4);
        if (pos > -1 && (best === null || pos < best.pos)) best = { g: g4, t: t4, pos: pos };
      }
    }
  }
  if (best) return [best.g, best.t];
  return ['<미분류>',''];
}

// 지방제외처리
function process_address_for_search(addr) {
  var o = String(addr).trim();
  var pre = o.substring(0, 10);
  if (pre.indexOf('회수')>-1 || pre.indexOf('회차')>-1) { counters.skip++; counters.returns++; return ['', true]; }
  if (pre.indexOf('차용')>-1 || pre.indexOf('대여')>-1 || pre.indexOf('반납')>-1) { counters.skip++; counters.borrow++; return ['', true]; }
  if (pre.indexOf('자가')>-1) { counters.skip++; counters.self++; return ['', true]; }
  if (/경동.*[\/:]/.test(o)) { counters.skip++; counters.kyungdong++; return ['', true]; }
  if (/로젠.*[\/:]/.test(o)) { counters.skip++; counters.logen++; return ['', true]; }
  if (/지방.*[\/:]/.test(o)) { counters.skip++; counters.jibang++; return ['', true]; }
  return [o.replace(/^(야적|야상)\s*\/\s*/,'').trim(), false];
}

// 지방포함처리
function process_address_for_search_local(addr) {
  var o = String(addr).trim();
  var pre = o.substring(0, 10);
  if (pre.indexOf('회수')>-1 || pre.indexOf('회차')>-1) { counters.skip++; counters.returns++; return ['', true]; }
  if (pre.indexOf('차용')>-1 || pre.indexOf('대여')>-1 || pre.indexOf('반납')>-1) { counters.skip++; counters.borrow++; return ['', true]; }
  if (pre.indexOf('자가')>-1) { counters.skip++; counters.self++; return ['', true]; }
  if (/경동.*[\/:]/.test(o)) { counters.skip++; counters.kyungdong++; return ['', true]; }
  if (/로젠.*[\/:]/.test(o)) { counters.skip++; counters.logen++; return ['', true]; }
  if (/지방.*[\/:]/.test(o)) { counters.jibang++; }
  return [o.replace(/^(야적|야상|지방)\s*[/\:]\s*/,'').trim(), false];
}

function build_classification_item(ft, cust, voucher, spec) {
  return ft + '(' + cust + '-' + voucher + ')' + clean_special_spec(spec);
}

// 특이사항정리
function clean_special_spec(spec) {
  var c = String(spec);
  c = c.replace(/\d+상.*?\d+하/g, '')
       .replace(/\d{1,2}\/\d{1,2}상차\s*\d{1,2}\/\d{1,2}/g, '')
       .replace(/\d{1,2}\/\d{1,2}상차/g, '')
       .replace(/\d{1,2}\/\d{1,2}/g, '')
       .replace(/\d+일?\s*상차/g, '')
       .replace(/\d+일\s*/g, '')
       .replace(/하차/g, '');
  return c.replace(/\//g, '').replace(/[()]/g, '').trim();
}

// 거래처정리
function cleanCustomerName(name) {
  var s = String(name || '');
  s = s.replace(/\(.*?\)/g, '');
  s = s.replace(/[-‐-‒–—−].*$/, '');
  s = s.replace(/\s*(주식회사|유한회사|사단법인|재단법인|합자회사|합명회사|협동조합|농업회사법인|\(주\)|㈜|주\)|구\)|\(|\))\s*/g, '').replace(/\*/g, '');
  return s.replace(/\s+/g, ' ').trim().slice(0, 7);
}

// 야적추출
function extract_yajek_item(raw, r) {
  if (String(raw).indexOf('야적') > -1 && String(raw).indexOf('/') > -1) {
    counters.yajeok++;
    var a = String(raw).replace(/(야적|\/)/g,'').trim();
    var ref = parse_address(a);
    var vid = String(cleanValue(r['판매번호'] || r['판매 번호'])).split('-').pop().trim();
    var cust = cleanCustomerName(r['거래처']);
    var ft = a.split(/\s+/).slice(0,3).join(' ').replace(/[()]/g,'').trim().replace(/[.,]+$/,'');
    return {
      '시도': ref[0], '시군': ref[1], '전표번호': vid, '출고창고': r['출고창고'],
      '거래처': r['거래처'], '배송주소': raw, '특이사항': r['특이사항'],
      '금액': r['금액'] || r['금 액'], '인수자 번호': cleanValue(r['인수자번호'] || r['인수자 번호']),
      '분류항목': build_classification_item(ft, cust, vid, r['특이사항'])
    };
  }
  return null;
}

// 일반추출
function extract_item(raw, r, addr) {
  var ref = parse_address(addr);
  var vid = String(cleanValue(r['판매번호'] || r['판매 번호'])).split('-').pop().trim();
  var cust = cleanCustomerName(r['거래처']);
  var ft = String(addr).split(/\s+/).slice(0,3).join(' ').replace(/[()]/g,'').trim().replace(/[.,]+$/,'');
  return {
    '시도': ref[0], '시군': ref[1], '전표번호': vid, '출고창고': r['출고창고'],
    '거래처': r['거래처'], '배송주소': raw, '특이사항': r['특이사항'],
    '금액': r['금액'] || r['금 액'], '인수자 번호': cleanValue(r['인수자번호'] || r['인수자 번호']),
    '분류항목': build_classification_item(ft, cust, vid, r['특이사항'])
  };
}

// 상일초월지방제외
function sangil_chowol_except_region(rows, day) {
  var recs_s = [], recs_c = [], recs_y = [];
  rows.forEach(function(r){
    var raw = r['배송주소']; 
    var y = extract_yajek_item(raw, r); if (y) { recs_y.push(y); return; }
    var pr = process_address_for_search(raw); if (pr[1]) return;
    var wh = r['출고창고'] || ''; if (wh.indexOf('상일')<0 && wh.indexOf('초월')<0) { skip_warehouse_filter(raw); return; }
    var itm = extract_item(raw, r, pr[0]); if (wh.indexOf('상일')>-1) recs_s.push(itm); if (wh.indexOf('초월')>-1) recs_c.push(itm);
  });
  return process_pd_to_final(recs_s, recs_c, recs_y, day, day + '일 배차(지방제외)');
}

// 초월지방제외
function chowol_except_region(rows, day) {
  var recs_c = [], recs_y = [];
  rows.forEach(function(r){
    var raw = r['배송주소']; 
    var y = extract_yajek_item(raw, r); if (y) { recs_y.push(y); return; }
    var pr = process_address_for_search(raw); if (pr[1]) return;
    if (String(r['출고창고'] || '').indexOf('초월')<0) { skip_warehouse_filter(raw); return; }
    recs_c.push(extract_item(raw, r, pr[0]));
  });
  return process_pd_to_final([], recs_c, recs_y, day, day + '일 배차(지방제외)');
}

// 상일지방제외
function sangil_except_region(rows, day) {
  var recs_s = [], recs_y = [];
  rows.forEach(function(r){
    var raw = r['배송주소']; 
    var y = extract_yajek_item(raw, r); if (y) { recs_y.push(y); return; }
    var pr = process_address_for_search(raw); if (pr[1]) return;
    if (String(r['출고창고'] || '').indexOf('상일')<0) { skip_warehouse_filter(raw); return; }
    recs_s.push(extract_item(raw, r, pr[0]));
  });
  return process_pd_to_final(recs_s, [], recs_y, day, day + '일 배차(지방제외)');
}

// 야적전용
function yajeok_only(rows, day) {
  var recs_s = [], recs_c = [];
  rows.forEach(function(r){
    var raw = r['배송주소']; 
    var pr = process_address_for_search(raw); if (pr[1]) return;
    var y = extract_yajek_item(raw, r); if (!y) { counters.skip++; return; }
    var wh = r['출고창고'] || ''; if (wh.indexOf('상일')<0 && wh.indexOf('초월')<0) { skip_warehouse_filter(raw); return; }
    if (wh.indexOf('상일')>-1) recs_s.push(y); if (wh.indexOf('초월')>-1) recs_c.push(y);
  });
  return process_pd_to_final(recs_s, recs_c, [], day, day + '일 야적배차');
}

// 지방전용
function region_only(rows, day) {
  var recs_s = [], recs_c = [];
  rows.forEach(function(r){
    var raw = r['배송주소']; 
    if (String(raw).lastIndexOf('야적',0) === 0) { counters.skip++; counters.yajeok++; return; }
    var pr = process_address_for_search_local(raw); if (pr[1]) return;
    if (String(raw).lastIndexOf('지방',0) !== 0) { counters.skip++; return; }
    var a = String(raw).replace(/^지방\s*\/?\s*/,'').trim();
    var item = extract_item(raw, r, a);
    var wh = r['출고창고'] || ''; if (wh.indexOf('상일')<0 && wh.indexOf('초월')<0) { skip_warehouse_filter(raw); return; }
    if (wh.indexOf('상일')>-1) recs_s.push(item); if (wh.indexOf('초월')>-1) recs_c.push(item);
  });
  return process_pd_to_final(recs_s, recs_c, [], day, day + '일 지방배차');
}

// 상일초월지방포함
function sangil_chowol_with_region(rows, day) {
  var recs_s = [], recs_c = [], recs_y = [];
  rows.forEach(function(r){
    var raw = r['배송주소']; 
    var y = extract_yajek_item(raw, r); if (y) { recs_y.push(y); return; }
    var pr = process_address_for_search_local(raw); if (pr[1]) return;
    var wh = r['출고창고'] || ''; if (wh.indexOf('상일')<0 && wh.indexOf('초월')<0) { skip_warehouse_filter(raw); return; }
    var item = extract_item(raw, r, pr[0]);
    if (wh.indexOf('상일')>-1) recs_s.push(item); if (wh.indexOf('초월')>-1) recs_c.push(item);
  });
  return process_pd_to_final(recs_s, recs_c, recs_y, day, day + '일 배차(지방포함)');
}

// 초월지방포함
function chowol_with_region(rows, day) {
  var recs_c = [], recs_y = [];
  rows.forEach(function(r){
    var raw = r['배송주소']; 
    var y = extract_yajek_item(raw, r); if (y) { recs_y.push(y); return; }
    var pr = process_address_for_search_local(raw); if (pr[1]) return;
    if (String(r['출고창고'] || '').indexOf('초월')<0) { skip_warehouse_filter(raw); return; }
    recs_c.push(extract_item(raw, r, pr[0]));
  });
  return process_pd_to_final([], recs_c, recs_y, day, day + '일 배차(지방포함)');
}

// 상일지방포함
function sangil_with_region(rows, day) {
  var recs_s = [], recs_y = [];
  rows.forEach(function(r){
    var raw = r['배송주소']; 
    var y = extract_yajek_item(raw, r); if (y) { recs_y.push(y); return; }
    var pr = process_address_for_search_local(raw); if (pr[1]) return;
    if (String(r['출고창고'] || '').indexOf('상일')<0) { skip_warehouse_filter(raw); return; }
    recs_s.push(extract_item(raw, r, pr[0]));
  });
  return process_pd_to_final(recs_s, [], recs_y, day, day + '일 배차(지방포함)');
}

// 종합
function process_pd_to_final(recs_s, recs_c, recs_y, day, header_title) {
  function addOrder(list) {
    list.forEach(function(o){ o['순서'] = get_region_index(o['시도']); });
    list.sort(function(a,b){
      if (a['순서'] !== b['순서']) return a['순서'] - b['순서'];
      return String(a['시도']).localeCompare(String(b['시도']));
    });
    return list;
  }
  var df_s = recs_s.length ? addOrder(recs_s.slice()) : [];
  var df_c = recs_c.length ? addOrder(recs_c.slice()) : [];
  var df_y = recs_y.slice();

  var cols = ['분류항목','전표번호','출고창고','특이사항','금액'];
  var blank = cols.reduce(function(a,k){ a[k]=''; return a; }, {});
  var final = [];

  function pushGrouped(df, title) {
    if (!df.length) return;
    final.push(Object.assign({}, blank, {'분류항목': title}));
    final.push(Object.assign({}, blank));
    region_priority.forEach(function(sido){
      if (/광역시$/.test(sido)) {
        var grp = df.filter(function(x){ return x['시도']===sido; });
        if (!grp.length) return;
        grp.forEach(function(rr){
          final.push({'분류항목': '-' + rr['분류항목'],'전표번호': rr['전표번호'],'출고창고': rr['출고창고'],'특이사항': rr['특이사항'],'금액': rr['금액']});
        });
        final.push(Object.assign({}, blank));
      } else {
        var grp0 = df.filter(function(x){ return x['시도']===sido && !x['시군']; });
        if (grp0.length) {
          grp0.forEach(function(rr){
            final.push({'분류항목': '-' + rr['분류항목'],'전표번호': rr['전표번호'],'출고창고': rr['출고창고'],'특이사항': rr['특이사항'],'금액': rr['금액']});
          });
          final.push(Object.assign({}, blank));
        }
        var terms = region_hierarchy[sido] || [];
        terms.forEach(function(term){
          var grp = df.filter(function(x){ return x['시도']===sido && x['시군']===term; });
          if (!grp.length) return;
          grp.forEach(function(rr){
            final.push({'분류항목': '-' + rr['분류항목'],'전표번호': rr['전표번호'],'출고창고': rr['출고창고'],'특이사항': rr['특이사항'],'금액': rr['금액']});
          });
          final.push(Object.assign({}, blank));
        });
      }
    });
  }

  pushGrouped(df_s, '상일상차');
  pushGrouped(df_c, '초월상차');

  var uncls = df_s.concat(df_c).filter(function(x){ return x['시도']==='<미분류>'; });
  if (uncls.length) {
    final.push(Object.assign({}, blank, {'분류항목': '<미분류>'}));
    uncls.forEach(function(rr){
      final.push({'분류항목': '-' + rr['분류항목'],'전표번호': rr['전표번호'],'출고창고': rr['출고창고'],'특이사항': rr['특이사항'],'금액': rr['금액']});
    });
    final.push(Object.assign({}, blank));
  }

  if (df_y.length) {
    final.push(Object.assign({}, blank, {'분류항목': '<기존 야적>'}));
    df_y.forEach(function(rr){
      final.push({'분류항목': '-' + rr['분류항목'],'전표번호': rr['전표번호'],'출고창고': rr['출고창고'],'특이사항': rr['특이사항'],'금액': rr['금액']});
    });
    final.push(Object.assign({}, blank));
  }

  final.forEach(function(r){ if (r['금액']!=='' && r['금액']!=null) r['금액'] = formatComma(r['금액']); });
  return final;
}

// 실행
function runClassification(ecountData, methodCode, day) {
  Logger.log('🔄 변환');
  try {
    var records = getRegionFromNotion();
    region_hierarchy = {}; region_priority = [];
    records.forEach(function(row){
      var g = cleanValue(row['분류 그룹'] || row['분류그룹'] || row['그룹']);
      if (!g) return;
      if (region_priority.indexOf(g) === -1) region_priority.push(g);
      // 구분자추가
      region_hierarchy[g] = String(row['검색어'] || '').split(/,|\n/).map(function(s){ return s.trim(); }).filter(Boolean);
    });

    resetCounters();
    var out;
    switch (String(methodCode)) {
      case '1': out = sangil_chowol_except_region(ecountData, day); break;
      case '2': out = chowol_except_region(ecountData, day); break;
      case '3': out = sangil_except_region(ecountData, day); break;
      case '4': out = yajeok_only(ecountData, day); break;
      case '5': out = region_only(ecountData, day); break;
      case '6': out = sangil_chowol_with_region(ecountData, day); break;
      case '7': out = chowol_with_region(ecountData, day); break;
      case '8': out = sangil_with_region(ecountData, day); break;
      default: return { status:'error', message:'잘못된 분류방식' };
    }

    var processedCount = out.filter(function(r){ return String(r['분류항목']).indexOf('-') === 0; }).length;
    var stats = {
      total: ecountData.length,
      skip: counters.skip,
      processed: processedCount,
      yajeok: counters.yajeok,
      jibang: counters.jibang,
      kyungdong: counters.kyungdong,
      logen: counters.logen,
      returns: counters.returns,
      borrow: counters.borrow,
      self: counters.self,
      warehouse: counters.warehouse
    };

    Logger.log('✅ 완료');
    return { status:'success', data: out, stats: stats };
  } catch (e) {
    Logger.log('⚠️ 에러');
    return { status:'error', message:String(e) };
  }
}