// 변수
var OUT_FOLDER_ID = '1wOgLkp-CHTF3aMsP_KvLj8MK7waDBPXA';
var IN_FOLDER_ID = '1BKz2j5cFafNJyW2B5rjyKQoeQqgrXKAN';

function doGet() {
  console.log('🚀 웹앱실행');
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('수요예측시스템')
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getDashboardData(forceRefresh) {
  console.log('🚀 수집시작');
  
  try {
    var cache = CacheService.getScriptCache();
    var cacheKey = 'dash_csv_v1';
    
    // 캐시확인
    if (!forceRefresh) {
      var keyInfo = cache.get(cacheKey + '_meta');
      if (keyInfo) {
        var keys = JSON.parse(keyInfo);
        var fullStr = '';
        var isValid = true;
        
        for (var i = 0; i < keys.length; i++) {
          var chunk = cache.get(keys[i]);
          if (!chunk) {
            isValid = false;
            break;
          }
          fullStr += chunk;
        }
        
        if (isValid) {
          console.log('⚡ 캐시반환');
          var parsed = JSON.parse(fullStr);
          if (parsed && parsed.out) {
            return parsed;
          }
        }
      }
    }
    
    var outRaw = fetchCsvData(OUT_FOLDER_ID);
    console.log('📦 출고원본', outRaw.length);
    
    var inRaw = fetchCsvData(IN_FOLDER_ID);
    console.log('📦 입고원본', inRaw.length);
    
    var outData = processModelData(outRaw);
    console.log('🛠️ 정제출고', outData.length);
    
    var inData = processModelData(inRaw);
    console.log('🛠️ 정제입고', inData.length);
    
    var result = { out: outData, in: inData };
    
    // 캐시저장
    if (result.out.length > 0 || result.in.length > 0) {
      var str = JSON.stringify(result);
      var chunkSize = 90000;
      var chunks = Math.ceil(str.length / chunkSize);
      var savedKeys = [];
      
      for (var j = 0; j < chunks; j++) {
        var cKey = cacheKey + '_c' + j;
        cache.put(cKey, str.substring(j * chunkSize, (j + 1) * chunkSize), 3600);
        savedKeys.push(cKey);
      }
      
      cache.put(cacheKey + '_meta', JSON.stringify(savedKeys), 3600);
      console.log('💾 캐시저장');
    }
    
    console.log('✅ 수집완료');
    return result;
  } catch (e) {
    console.log('❌ 에러발생', e.message);
    return { error: e.message };
  }
}

function fetchCsvData(folderId) {
  console.log('📁 CSV탐색');
  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFiles();
  var rows = [];
  
  while (files.hasNext()) {
    var file = files.next();
    var fileName = file.getName().toLowerCase();
    
    // CSV검사
    if (fileName.indexOf('.csv') === -1 && file.getMimeType() !== MimeType.CSV) {
      continue;
    }
    
    console.log('📄 파일확인', fileName);
    var parsed = [];
    
    try {
      var blob = file.getBlob();
      var content = blob.getDataAsString('UTF-8');
      
      // 한글깨짐방지
      if (content.indexOf('품목명') === -1 && content.indexOf('수량') === -1) {
        content = blob.getDataAsString('euc-kr');
      }
      parsed = Utilities.parseCsv(content);
    } catch (e) {
      console.log('❌ 파싱오류', fileName);
      continue;
    }
    
    var nameIdx = -1;
    var qtyIdx = -1;
    var dateIdx = -1;
    
    // 행반복
    for (var r = 0; r < parsed.length; r++) {
      var row = parsed[r];
      var isHeader = false;
      
      for (var c = 0; c < row.length; c++) {
        var cell = String(row[c]).replace(/\s+/g, '');
        if (cell.indexOf('품목명') !== -1) {
          nameIdx = c;
          isHeader = true;
        }
        if (cell.indexOf('수량') !== -1) qtyIdx = c;
        if (cell.indexOf('일자') !== -1) dateIdx = c;
      }
      
      if (isHeader) continue;
      
      if (nameIdx === -1 || qtyIdx === -1) continue;
      if (row.length <= Math.max(nameIdx, qtyIdx)) continue;
      
      var cellName = String(row[nameIdx]).trim();
      var cellQty = String(row[qtyIdx]).trim();
      var cellDate = (dateIdx !== -1) ? row[dateIdx] : row[0];
      
      if (!cellName || !cellQty) continue;
      if (cellName.indexOf('회사명') !== -1) continue;
      if (cellQty === '0') continue;
      
      var dateVal = String(cellDate);
      if (!/\d/.test(dateVal)) continue;
      
      rows.push([dateVal, cellName, cellQty]);
    }
  }
  
  console.log('🏁 병합완료', rows.length);
  return rows;
}

function processModelData(rawData) {
  console.log('🔍 모델정제');
  var result = [];
  
  for (var i = 0; i < rawData.length; i++) {
    var row = rawData[i];
    if (row.length < 3) continue;
    
    var dateStr = row[0] ? String(row[0]).split(' ')[0] : '';
    var rawItemName = row[1];
    var qtyStr = row[2] ? String(row[2]).replace(/,/g, '') : '0';
    var quantity = parseInt(qtyStr, 10) || 0;
    
    if (!rawItemName || !dateStr || quantity <= 0) continue;
    
    var parts = dateStr.split('/');
    if (parts.length < 2) continue;
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    
    // 정제
    var cleanName = String(rawItemName).replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/\{[^}]*\}/g, '');
    cleanName = cleanName.replace(/[\s\u00A0]+/g, '');
    
    var prefix = cleanName.substring(0, 2);
    var validPrefixes = ['AJ', 'AM', 'AC', 'AP', 'AR', 'AF'];
    if (validPrefixes.indexOf(prefix) === -1) continue;
    
    // 길이확인
    if (prefix === 'AR') {
      if (cleanName.length >= 14) cleanName = cleanName.substring(0, 14);
      else if (cleanName.length >= 12) cleanName = cleanName.substring(0, 12);
      else continue;
    } else {
      if (cleanName.length >= 12) cleanName = cleanName.substring(0, 12);
      else continue;
    }
    
    var category = '';
    var isIndoor = false;
    
    // 분류
    if (prefix === 'AJ') {
      category = '홈멀티';
      isIndoor = (cleanName.charAt(6) === 'N');
    } else if (prefix === 'AM') {
      category = '상업멀티';
      isIndoor = (cleanName.charAt(6) === 'N');
    } else if (['AC', 'AP', 'AR', 'AF'].indexOf(prefix) !== -1) {
      category = '싱글중대형';
      if (prefix === 'AR' || prefix === 'AF') {
        isIndoor = (cleanName.charAt(11) === 'N');
      } else {
        isIndoor = (cleanName.charAt(6) === 'N');
      }
      
      // 제외
      if (!isIndoor) continue;
    }
    
    result.push({
      model: cleanName,
      category: category,
      year: year,
      month: month,
      quantity: quantity
    });
  }
  
  console.log('✨ 정제완료', result.length);
  return result;
}