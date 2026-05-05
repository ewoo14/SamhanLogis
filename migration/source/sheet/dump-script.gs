/**
 * 1회용 시트 JSON dump 스크립트.
 *
 * 사용법:
 * 1. 마이그 대상 Google Sheet 에서 [확장 프로그램] → [Apps Script] 클릭
 * 2. Code.gs 내용을 본 파일로 교체 → 저장 → [실행] (dumpAllTabsAsJson)
 * 3. 첫 실행 시 OAuth 권한 동의 (시트 읽기 + Drive 파일 생성)
 * 4. 실행 완료 alert (또는 실행 로그 Logger) 의 URL 클릭 → JSON 파일 다운로드
 * 5. migration/source/sheet/workbook.json 으로 저장 후 commit
 *
 * Phase 1.5 (변동DC 룰 검증) 추가 — formulas 별도 dump 필요:
 * 6. dumpAllFormulas() 도 별도 실행 → migration/source/sheet/formulas.json 으로 저장
 *
 * 왜 xlsx 가 아닌 JSON 인가:
 * - xlsx 는 ARRAYFORMULA / QUERY / IMPORTRANGE 등 Google 전용 함수 깨짐 (#NAME?)
 * - getDisplayValues() 는 수식 결과값을 시트 화면 그대로 — 포맷팅(콤마/통화) 포함
 * - getFormulas() 는 수식 자체 보존 ($L$2 같은 절대참조 식별 가능 → 변동DC 룰 검증)
 * - Apps Script 는 시트 엔진 직접 사용 → 모든 함수 결과 정상
 *
 * 출력 JSON 구조 (workbook.json):
 * {
 *   "{탭명}": {
 *     "lastRow": <int>,
 *     "lastColumn": <int>,
 *     "hidden": <bool>,
 *     "values": [["A1","B1",...], ["A2","B2",...], ...]
 *   },
 *   ...
 * }
 *
 * 출력 JSON 구조 (formulas.json):
 * {
 *   "{탭명}": {
 *     "lastRow": <int>,
 *     "lastColumn": <int>,
 *     "formulas": [["=A1*B1","",...], ["",...], ...]   // 빈 셀은 ""
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
  saveJson_(result, 'samhan-sheet-dump-');
}

/**
 * Phase 1.5 — formulas 별도 dump (변동DC 룰 검증용).
 *
 * 변동DC 감지 룰 4종:
 *  - 룰 1: 마스터 시트 단가 셀 수식의 `$L$2` 절대참조 → useK2 (홈/상업 멀티)
 *  - 룰 2: `$D$7` / `$D$8` → matKey (싱글 세트, 자재 미포함/포함)
 *  - 룰 3: F열 수식의 `$I$1` → isDisc (구형 50% 할인)
 *
 * 본 dump 의 formulas 데이터로 위 절대참조 패턴을 spot-check 하여
 * Phase 1 분석문서 (estimate.md / partner-order.md) 의 룰 추출 정확도 검증.
 *
 * Phase 6 구현 시 시드 스크립트가 동일 패턴으로 마이그.
 */
function dumpAllFormulas() {
  const ss = SpreadsheetApp.getActive();
  const result = {};
  ss.getSheets().forEach(sheet => {
    const range = sheet.getDataRange();
    result[sheet.getName()] = {
      lastRow: range.getLastRow(),
      lastColumn: range.getLastColumn(),
      formulas: range.getFormulas(),
    };
  });
  saveJson_(result, 'samhan-sheet-formulas-');
}

function saveJson_(payload, filenamePrefix) {
  const ts = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd-HHmmss');
  const blob = Utilities.newBlob(
    JSON.stringify(payload, null, 2),
    'application/json',
    filenamePrefix + ts + '.json'
  );
  const file = DriveApp.createFile(blob);
  Logger.log('JSON saved: ' + file.getUrl());
  try {
    SpreadsheetApp.getUi().alert(
      'JSON 저장 완료\n파일: ' + file.getName() + '\nURL: ' + file.getUrl()
    );
  } catch (e) {
    // 스크립트 에디터에서 직접 실행 시 getUi() 불가 — Logger 로 안내
    Logger.log('파일은 정상 저장됨. URL 위 로그 참고.');
  }
}
