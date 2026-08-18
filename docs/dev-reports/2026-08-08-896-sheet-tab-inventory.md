# #896 Google Sheets 탭 전수 인벤토리 및 추가 수집

- 수집일: 2026-08-08 (Asia/Seoul)
- 작업 성격: 읽기 전용 수집 라운드
- 주 스프레드시트 ID: `<SHEET_ID>`
- 주 스프레드시트 제목: `종합 견적서`
- 인증: 저장소 밖 서비스 계정 키 경로를 `GOOGLE_SERVICE_ACCOUNT_KEY`로만 주입했다. 키 내용은 출력·복사하지 않았다.
- 금지사항 준수: Sheets 쓰기, DB 쓰기, 애플리케이션 코드 수정, Git 명령, Docker 작업을 하지 않았다.

## 결론

주 스프레드시트의 실제 탭은 27개다. 그중 저장소 코드가 명시적 또는 계산 가능한 동적 이름으로 읽는 실제 탭은 17개이며, 이번 라운드 종료 시 17개 모두 CSV가 확보됐다. 이번에 새로 받은 주 시트 탭은 `거래처`, `담당자`, `추천실외기`, `구형_템플릿`이다.

다만 주문서 인식기 두 곳은 실제로 존재하지 않는 `종합 견적서`(공백 포함) 탭을 참조한다. 실제 탭 `종합견적서`(공백 없음)와 이름이 다르므로 이 참조는 수집할 수 없다. 또한 런타임 변수로 여는 일부 외부 스프레드시트는 저장소만으로 ID를 확정할 수 없다.

`싱글 할인`은 표본 0이 아니다. 주 `거래처` 탭 7,253개 데이터 행 중 300개 행에 자유 텍스트가 있다. 반면 `싱글 세트`/`싱글 세트_단가인상` 상단 설정의 `할인`과 `1WAY할인` 값 셀은 모두 빈칸으로, 두 설정의 실제 입력값은 0건이다.

## 조사 방법과 행·열 수 기준

1. 저장소의 `SpreadsheetApp.openById`, `openByUrl`, `getSheetByName`, Node `google-sheets-client`, Java `GoogleSheetsClient` 호출과 설정 range를 정적 검색했다.
2. Sheets API `spreadsheets.get(includeGridData=false)`로 탭 이름과 `gridProperties.rowCount/columnCount`만 먼저 조회했다.
3. 이미 받은 CSV 이름과 대조한 뒤, 코드가 읽지만 없던 탭만 `spreadsheets.values.get`의 `UNFORMATTED_VALUE`로 읽어 저장했다.
4. 아래 표의 행·열 수는 모든 탭에 동일하게 적용할 수 있는 **시트 grid 할당 크기**다. 코드가 읽지 않는 탭은 값 본문을 받지 않았으므로 실제 마지막 비어 있지 않은 셀 수를 뜻하지 않는다. 이번에 받은 네 탭은 API used range가 grid 크기와 같았다.

## 주 스프레드시트 탭 전수 대조표

| 탭 이름 | 코드가 읽는가 (대표 `파일:줄`) | 이미 받았는가 | 행·열 수 |
|---|---|---|---:|
| 전표생성폼 | 아니오 — runtime read 제외가 명시됨 (`services/partner-order-service/src/main/resources/application.yml:95-98`) | 아니오(의도적으로 미수집) | 19 × 4 |
| 종합견적서 | 아니오 — 출력 양식이며 runtime read 제외 (`services/partner-order-service/src/main/resources/application.yml:95-98`) | 아니오(의도적으로 미수집) | 100 × 8 |
| 전표업로드목록 | 아니오 — 출력 양식이며 runtime read 제외 (`services/partner-order-service/src/main/resources/application.yml:95-98`) | 아니오(의도적으로 미수집) | 100 × 10 |
| 홈멀티 | 예 (`clients/web/estimate-app/lib/code.js:1795`, `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:109`) | 예 — 기존 `live_sheet`, `live_sheet_h0` | 126 × 33 |
| 홈멀티_단가인상 | 예 (`clients/web/estimate-app/lib/code.js:129,749-750`) | 예 — 기존 `live_sheet_inc` | 126 × 33 |
| 싱글 세트 | 예 (`clients/web/estimate-app/lib/code.js:1798`, `ProductSheetSyncService.java:112`) | 예 — 기존 `live_sheet`, `live_sheet_h0` | 291 × 27 |
| 싱글 세트_단가인상 | 예 (`clients/web/estimate-app/lib/code.js:130,832`) | 예 — 기존 `live_sheet_inc` | 291 × 27 |
| 싱글 구성품 | 예 (`clients/web/estimate-app/lib/code.js:1799`, `ProductSheetSyncService.java:115`) | 예 — 기존 `live_sheet`, `live_sheet_h0` | 1,737 × 14 |
| 싱글 구성품_단가인상 | 예 (`clients/web/estimate-app/lib/code.js:131,924`) | 예 — 기존 `live_sheet_inc` | 1,737 × 14 |
| 상업멀티 | 예 (`clients/web/estimate-app/lib/code.js:1796`, `ProductSheetSyncService.java:118`) | 예 — 기존 `live_sheet`, `live_sheet_h0` | 421 × 30 |
| 상업멀티_단가인상 | 예 (`clients/web/estimate-app/lib/code.js:132,1012-1013`) | 예 — 기존 `live_sheet_inc` | 421 × 30 |
| 싱글 자재가격 | 예 (`clients/web/estimate-app/lib/code.js:990`, `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductLookupSheetSyncService.java:52,122`) | 예 — 기존 `live_sheet_h0` | 29 × 4 |
| 상업멀티 구성 | 예 (`clients/web/estimate-app/lib/code.js:1797`, `ProductSheetSyncService.java:121`) | 예 — 기존 `live_sheet`, `live_sheet_h0` | 517 × 10 |
| 상업멀티 구성_단가인상 | 예 (`clients/web/estimate-app/lib/code.js:133,1102`) | 예 — 기존 `live_sheet_inc` | 517 × 10 |
| 분기계산 | 예 (`ProductLookupSheetSyncService.java:54,244`) | 예 — 기존 `live_sheet_h0` | 100 × 105 |
| 구형 | 예 (`clients/web/estimate-app/lib/code.js:1177-1178`, `ProductSheetSyncService.java:124`) | 예 — 기존 `live_sheet`, `live_sheet_h0` | 43 × 9 |
| 장비스펙 | 아니오 — 화면 명칭은 존재하나 이 탭 직접 read 없음 | 아니오(의도적으로 미수집) | 28 × 26 |
| 부속품스펙 | 아니오 | 아니오(의도적으로 미수집) | 8 × 26 |
| 홈멀티_템플릿 | 아니오 | 아니오(의도적으로 미수집) | 122 × 30 |
| 거래처 | 예 (`tools/legacy-gas/종합견적서/Code.js:1434-1436`; 현재 Node 앱은 directory API로 치환) | **예 — 이번 라운드** `live_sheet_more/거래처.csv` | 7,254 × 10 |
| 전표생성폼_템플릿 | 아니오 | 아니오(의도적으로 미수집) | 19 × 4 |
| 싱글 세트_템플릿 | 아니오 | 아니오(의도적으로 미수집) | 219 × 21 |
| 상업멀티_템플릿 | 아니오 | 아니오(의도적으로 미수집) | 416 × 27 |
| 분기계산_템플릿 | 아니오 | 아니오(의도적으로 미수집) | 100 × 105 |
| 구형_템플릿 | **예 — `getSheets()` 순회 후 이름에 `구형` 포함 시 본문 read** (`tools/legacy-gas/일마감 프로그램/Code.js:275-279`) | **예 — 이번 라운드** `live_sheet_more/구형_템플릿.csv` | 44 × 9 |
| 담당자 | 예 (`tools/legacy-gas/종합견적서/Code.js:1504`) | **예 — 이번 라운드** `live_sheet_more/담당자.csv` | 20 × 2 |
| 추천실외기 | 예 (`clients/web/estimate-app/lib/code.js:1304`, `ProductLookupSheetSyncService.java:53,184`) | **예 — 이번 라운드** `live_sheet_more/추천실외기.csv` | 26 × 5 |

### 코드가 참조하지만 실제 탭 목록에 없는 이름

| 참조 탭 | 코드 위치 | 결과 |
|---|---|---|
| `종합 견적서` (공백 포함) | `tools/legacy-gas/제이시스템 전용 주문서 인식/Code.js:24,665,706`; `tools/legacy-gas/에어디자이너 전용 주문서 인식/Code.js:24,717,763` | 실제 탭은 `종합견적서`(공백 없음)뿐이다. `getSheetByName` 일치 실패이므로 수집 불가 |

## 다른 스프레드시트 및 동적 대상

| 대상 | 여는 코드 | 실측/판정 |
|---|---|---|
| `<SHEET_ID>` / `종합 견적서` | 웹 견적 앱, product-service, partner-order-service, 여러 legacy GAS, 일마감 프로그램 | 이번 전수 인벤토리의 주 대상, 27탭 |
| `<SHEET_ID>` / `견적서 사용자리스트` | `tools/legacy-gas/거래처 업데이트 프로그램/Code.js:1,136,182,214,385` | 접근 성공. 38탭: `사용자리스트` 1개(17 × 8) + `_UPLOAD_TMP_*` 37개. 코드는 `사용자리스트`와 Script Properties가 가리키는 현재 임시 탭만 읽는다. 오래된 임시 탭 37개를 무차별 수집하지 않았다. |
| `사용자리스트`가 지정한 동적 마스터 URL 1개 | `거래처 업데이트 프로그램/Code.js:384-417,426-433` | 접근 성공. 비공개 동적 ID는 보고서에 기록하지 않았다. `거래처` 탭은 주 대상의 `거래처`와 크기·SHA-256이 동일했다. 이 탭은 업데이트 코드의 read 원천이 아니라 write 대상이므로 중복 CSV는 남기지 않았다. |
| 런타임 `id` | `tools/legacy-gas/미배차리스트/Code.js:91`, `tools/legacy-gas/전표정리리스트/Code.js:85` | ID가 Script Properties/호출 인자에서 결정되어 저장소만으로 열거 불가 |
| 런타임 `ssId` | `tools/legacy-gas/알리고 자동 업로드/Code.js:231` | 호출 시 전달되어 저장소만으로 열거 불가 |
| 업로드 임시 파일 `tempFile.id` | `tools/legacy-gas/입출고 내역/code.js:27` | 실행 중 생성되는 임시 스프레드시트라 현재 대상 확정 불가 |

환경변수 `GOOGLE_SHEETS_SHEET_ID`, `BOOTSTRAP_SHEET_ID`, `INTEGRATED_QUOTE_SHEET_ID`로 운영 시트 ID를 override할 수 있다. 이번 라운드는 저장소 기본값과 사용자 지시 ID만 확정했다.

## 세 필드 실측

### 1. `싱글 할인` — `거래처!J`

헤더는 1행, 데이터는 2~7,254행이다. 이 열은 숫자 열이 아니라 Notion 병합 결과를 넣는 자유 텍스트다 (`거래처 업데이트 프로그램/Code.js:599-647`). 따라서 원문 분포와 레거시 숫자 변환 결과를 분리했다.

| 기준 | 전체 | 빈칸 | 0 | 양수 | 음수 | 숫자 아닌 텍스트 | 설정 거래처 수 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 원문 셀 | 7,253 | 6,953 | 0 | 0 | 0 | **300** | **300** |
| 레거시 `parseKRNumber_` 적용 후 (`종합견적서/Code.js:196-200,1471`) | 7,253 | 해당 없음 | **7,006** | **247** | 0 | 해당 없음 | **247**(0이 아닌 변환값) |

주의: 자유 텍스트 300건에는 여러 퍼센트·정액 조건·메모가 한 셀에 함께 들어갈 수 있다. `parseKRNumber_`는 숫자가 아닌 문자를 제거한 뒤 하나의 숫자로 강제 변환하므로, 원문 300건과 실제 유효 숫자 247건이 다르다. 이 라운드는 이 동작을 수정하지 않고 실측만 했다.

### 2. `할인`, `1WAY할인` — 싱글 전역 기본값

이 둘은 거래처별 열이 아니라 `싱글 세트` 계열 탭 1행의 설정 키이고 실제 값은 같은 열의 2행이다 (`종합견적서/Code.js:1382-1405`). `싱글 세트`와 `싱글 세트_단가인상`을 각각 직접 확인했다.

| 필드 | 확인한 값 셀 | 값 있음 | 빈칸 | 0 | 양수 | 음수 | 거래처 수 |
|---|---|---:|---:|---:|---:|---:|---:|
| 할인 | `싱글 세트!R2`, `싱글 세트_단가인상!R2` | **0** | **2** | 0 | 0 | 0 | 해당 없음(전역 설정) |
| 1WAY할인 | `싱글 세트!S2`, `싱글 세트_단가인상!S2` | **0** | **2** | 0 | 0 | 0 | 해당 없음(전역 설정) |

두 필드 모두 `pick(..., 0)`과 `parseKRNumber_`를 거치므로 런타임 유효값은 0이다. 즉 이 두 전역 설정에 대해서는 **표본 0이 아니라, 실제 셀을 확인한 결과 입력값 0건/유효값 0**으로 확정할 수 있다.

## 이번 라운드 수집 파일

저장 루트:

`C:\Users\user\AppData\Local\Temp\claude\C--dev-Samhan-Public\cdbb83c4-61fe-4c24-ba6f-7688e70e25fa\scratchpad\live_sheet_more`

| 파일 | 바이트 | SHA-256 |
|---|---:|---|
| `거래처.csv` | 1,134,441 | `62A391497DEC57550139325D0D5DECE1866D937E3895EB791780DAA7ED370739` |
| `구형_템플릿.csv` | 4,127 | `C901EA8065662578D0F9A3FD59A03F418A9B03D81887414E2FC04A79DFA6032E` |
| `담당자.csv` | 413 | `84396282DA82C48673D8D675CD836F52D4BE167DF6279476C95BB0B99982EEEE` |
| `추천실외기.csv` | 435 | `AA0CB40DC5B91C59A4EC23AA1C039E4047D48C10F6B525D50B2ADDBCAD95F4A4` |

동적 마스터의 `거래처`는 수집 중 주 대상 `거래처.csv`와 SHA-256까지 동일함을 확인했다. 중복 파일은 남기지 않았다. 위 네 파일은 UTF-8 BOM CSV이며 Sheets API의 `UNFORMATTED_VALUE` 결과를 저장했다.

## 코드가 읽는데 못 받은 탭

- **주 스프레드시트의 실제 존재 탭 기준: 없음.** 코드가 읽는 실제 17탭은 모두 확보됐다.
- **코드 참조 이름 기준: `종합 견적서` 1건.** 실제 탭 목록에 없으므로 받을 수 없었다. 공백 없는 `종합견적서`를 대신 받으면 다른 탭을 임의 대체하는 것이 되어 수집하지 않았다.
- 런타임 변수로 열리는 외부 스프레드시트들은 대상 ID가 저장소에 없으므로, 그 안의 탭 수집 여부를 확정할 수 없다.

## 확정하지 못한 것

1. `미배차리스트`, `전표정리리스트`, `알리고 자동 업로드`, `입출고 내역`이 실행 시 받는 동적 스프레드시트 ID와 탭 목록은 Script Properties/호출 인자/임시 업로드 파일 없이는 확정할 수 없다.
2. `견적서 사용자리스트`의 37개 `_UPLOAD_TMP_*` 중 현재 Script Properties가 가리키는 탭은 서비스 계정 Sheets API만으로 알 수 없다. 코드가 읽지 않는 과거 임시 탭까지 받지 말라는 조건 때문에 목록 확인만 하고 CSV는 만들지 않았다.
3. 저장소의 코드 스냅샷과 현재 배포된 GAS가 완전히 같은지는 이번 라운드 범위에서 재검증하지 않았다. 대조표의 `파일:줄`은 현재 작업 디렉터리 코드 기준이다.
4. 코드가 읽지 않는 10개 탭은 본문 값을 받지 않았으므로, 표의 행·열은 grid 할당 크기만 확정한다.
