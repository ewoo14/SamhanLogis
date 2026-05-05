/**
 * 1회용 시트 JSON dump 스크립트.
 *
 * 사용법:
 * 1. 마이그 대상 Google Sheet 에서 [확장 프로그램] → [Apps Script] 클릭
 * 2. Code.gs 내용을 본 파일로 교체 → 저장 → [실행] (dumpAllTabsAsJson)
 * 3. 첫 실행 시 OAuth 권한 동의 (시트 읽기 + Drive 파일 생성)
 * 4. 실행 완료 alert 의 URL 클릭 → JSON 파일 다운로드
 * 5. migration/source/sheet/workbook.json 으로 저장 후 commit
 *
 * 왜 xlsx 가 아닌 JSON 인가:
 * - xlsx 는 ARRAYFORMULA / QUERY / IMPORTRANGE 등 Google 전용 함수 깨짐 (#NAME?)
 * - getDisplayValues() 는 수식 결과값을 시트 화면 그대로 — 포맷팅(콤마/통화) 포함
 * - Apps Script 는 시트 엔진 직접 사용 → 모든 함수 결과 정상
 *
 * 출력 JSON 구조:
 * {
 *   "{탭명}": {
 *     "lastRow": <int>,
 *     "lastColumn": <int>,
 *     "hidden": <bool>,
 *     "values": [["A1","B1",...], ["A2","B2",...], ...]
 *   },
 *   ...
 * }
 */
function dumpAllTabsAsJson() {
  const ss = SpreadsheetApp.getActive();
  const result = {};
  ss.getSheets().forEach(sheet => {
    const range = sheet.getDataRange();
    result[sheet.getName()] = {
      lastRow: range.getLastRow(),
      lastColumn: range.getLastColumn(),
      hidden: sheet.isSheetHidden(),
      values: range.getDisplayValues(),
    };
  });
  const ts = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd-HHmmss');
  const blob = Utilities.newBlob(
    JSON.stringify(result, null, 2),
    'application/json',
    'samhan-sheet-dump-' + ts + '.json'
  );
  const file = DriveApp.createFile(blob);
  Logger.log('JSON saved: ' + file.getUrl());
  SpreadsheetApp.getUi().alert(
    'JSON 저장 완료\n파일: ' + file.getName() + '\nURL: ' + file.getUrl()
  );
}
