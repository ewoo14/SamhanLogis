// 웹앱 진입점
function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('삼한공조 입출고내역')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 차트 데이터 생성
function getChartData() {
  console.log('데이터 조회 시작');
  
  var db = {};
  var fileName = '이카운트입출고내역.xlsx';
  
  try {
    var files = DriveApp.getFilesByName(fileName);
    if (!files.hasNext()) throw new Error('파일을 찾을 수 없습니다: ' + fileName);
    
    // 엑셀 -> 스프레드시트 임시 변환
    var blob = files.next().getBlob();
    var config = {
      title: 'Temp_' + new Date().getTime(),
      mimeType: MimeType.GOOGLE_SHEETS
    };
    var tempFile = Drive.Files.insert(config, blob);
    var ss = SpreadsheetApp.openById(tempFile.id);
    var sheet = ss.getSheets()[0];
    
    var lastRow = sheet.getLastRow();
    
    // 데이터 파싱
    if (lastRow >= 3) {
      var headers = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
      
      var colName = headers.indexOf('품목명');
      var colDate = headers.indexOf('일자');
      var colIn = headers.indexOf('입고수량');
      var colOut = headers.indexOf('출고수량');
      
      if (colName > -1 && colDate > -1) {
        var data = sheet.getRange(3, 1, lastRow - 2, sheet.getLastColumn()).getValues();
        
        data.forEach(row => {
          var rawName = String(row[colName]);
          var rawDate = String(row[colDate]).trim();
          var qtyIn = (colIn > -1) ? (Number(row[colIn]) || 0) : 0;
          var qtyOut = (colOut > -1) ? (Number(row[colOut]) || 0) : 0;
          
          if (/^\d{4}\/\d{2}/.test(rawDate)) {
            
            // 전처리
            var cleanName = rawName.replace(/[\(\[\{].*?[\)\]\}]/g, '').trim();
            var upperName = cleanName.toUpperCase();
            
            // 필터링
            var hasUsage = cleanName.includes('사용');
            var isKoreanOnly = /^[가-힣\s]+$/.test(cleanName);
            var startsWithL = upperName.indexOf('L-') === 0;

            if (cleanName && !hasUsage && !isKoreanOnly && !startsWithL) {
              
              var keyDate = rawDate.replace('/', '').substring(0, 6);
              
              if (!db[cleanName]) {
                db[cleanName] = { input: {}, output: {} };
              }
              
              if (qtyIn !== 0) db[cleanName].input[keyDate] = (db[cleanName].input[keyDate] || 0) + qtyIn;
              if (qtyOut !== 0) db[cleanName].output[keyDate] = (db[cleanName].output[keyDate] || 0) + qtyOut;
            }
          }
        });
      }
    }
    
    // 임시 파일 삭제
    DriveApp.getFileById(tempFile.id).setTrashed(true);
    
  } catch (e) {
    console.error('오류 발생', e);
    throw e;
  }

  return db;
}