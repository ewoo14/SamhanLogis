# 가입고 XLSX → 입고전표 정찰 보고서 (2026-08-15)

> 범위: `tools/legacy-gas/가입고처리`의 실제 코드, 현재 입고전표 생성 경로, 기존 XLSX 업로드 경로, 현재 `inventory_db` 창고 조회만 확인했다. 구현·설계 제안·DB 쓰기는 수행하지 않았다.

## ① 레거시 GAS가 XLSX를 어떻게 읽는가

### 대상 프로그램과 파일 읽기

- 실제 대상은 `tools/legacy-gas/가입고처리/Index.html`과 `Code.js`다. 화면 제목도 “가입고처리 시스템”, 설명도 “DPS 입고 데이터 정제 및 이카운트 전송”으로 명시돼 있다 (`tools/legacy-gas/가입고처리/Index.html:121-125`).
- 업로드 input은 `.xlsx, .xls`를 허용한다 (`tools/legacy-gas/가입고처리/Index.html:154-157`). 브라우저의 SheetJS 0.18.5를 로드한다 (`tools/legacy-gas/가입고처리/Index.html:5`).
- `FileReader.readAsBinaryString` → `XLSX.read(..., {type:'binary', cellDates:true})` 순서로 읽는다. 워크북의 **모든 시트**(`wb.SheetNames`)를 순회하며 각 시트를 `sheet_to_json(..., {header:1, raw:false, dateNF:'yyyy-mm-dd'})`로 2차원 배열화한다 (`tools/legacy-gas/가입고처리/Index.html:343-361`). 특정 시트명을 고정하거나 선택하는 코드는 없다.

### 헤더 위치, 건너뛰는 행, 읽는 열

- 행이 6개 미만인 시트는 통째로 건너뛴다 (`tools/legacy-gas/가입고처리/Index.html:383-385`).
- 각 시트의 원본 **1~5행을 건너뛰고**, 원본 6행과 7행을 2단 헤더로 읽으며, 원본 **8행부터 데이터**로 처리한다 (`tools/legacy-gas/가입고처리/Index.html:383-405`).
- 같은 열의 7행 헤더가 비어 있지 않으면 7행 값을, 비어 있으면 6행 값을 쓴다. 헤더의 줄바꿈과 모든 공백은 제거한다 (`tools/legacy-gas/가입고처리/Index.html:387-401`).
- 코드에 선언된 열 이름 원문은 다음 11개다: `NO`, `고객명`, `모델`, `주문`, `배달예정`, `물류출고`, `진행상태`, `차량번호`, `기사명`, `주문일자`, `주문번호` (`tools/legacy-gas/가입고처리/Index.html:378-381`).
- 선언 배열 이름은 `requiredHdr`지만, 실제 시트 채택 조건은 **`고객명`과 `주문번호` 헤더가 모두 존재하는 것**뿐이다. 둘 중 하나라도 없으면 해당 시트를 조용히 건너뛴다 (`tools/legacy-gas/가입고처리/Index.html:398-403`). 나머지 9개 헤더는 없을 경우 값이 빈 문자열로 들어가므로 코드상 선택 열이다 (`tools/legacy-gas/가입고처리/Index.html:409-414`).
- 데이터 행은 `고객명`에 `삼성`, `초월`, `이화`, `상일`, `신인호`, `삼한` 중 하나가 포함된 경우만 남긴다. 일치하지 않는 고객명과 빈 고객명 행은 조용히 제외한다 (`tools/legacy-gas/가입고처리/Index.html:267`, `tools/legacy-gas/가입고처리/Index.html:404-408`).
- 여러 시트 사이에서 `고객명|모델|주문|차량번호|기사명|주문일자|주문번호`가 같은 행은 `globalUnpaired` 카운터로 서로 상쇄한다. 먼저 나온 시트의 행은 결과에 들어가고, 다음 시트의 같은 행은 카운터를 감소시키며 건너뛴다 (`tools/legacy-gas/가입고처리/Index.html:381`, `tools/legacy-gas/가입고처리/Index.html:404-421`).

### 값 변환 규칙

- 날짜:
  - SheetJS 변환 시 날짜 표시 형식은 `yyyy-mm-dd`다 (`tools/legacy-gas/가입고처리/Index.html:349-357`).
  - `주문일자`는 문자열의 첫 공백 앞부분만 남긴다 (`tools/legacy-gas/가입고처리/Index.html:409-413`).
  - 파일명에서 첫 6자리 숫자를 찾아 `20`을 붙여 `ioDate`에 저장하고, 없으면 실행 당일을 넣지만 (`tools/legacy-gas/가입고처리/Index.html:352-353`), 이후 전표 payload에는 이 변수를 사용하지 않는다. 실제 이카운트 `IO_DATE`는 전송 직전 사용자가 날짜 input에서 고른 값의 `-`를 제거해 넣는다 (`tools/legacy-gas/가입고처리/Index.html:573-590`).
- 품목명/코드:
  - 모델 문자열에서 `[...]`, `(...)`를 제거하고 trim한다. `GHP`가 포함되면 `GHP`를 `가스히트펌프`로 치환한다 (`tools/legacy-gas/가입고처리/Index.html:430-433`).
  - 별도로 저장·복원되는 품목리스트의 `품목코드`, `품목명`을 매핑 원장으로 쓴다 (`tools/legacy-gas/가입고처리/Index.html:202-212`, `tools/legacy-gas/가입고처리/Index.html:713-723`).
  - 매핑 순서는 (1) 정제 품목명 완전일치 또는 코드 완전일치, (2) 품목명 상호 부분포함, (3) 원본 모델의 첫 공백 전 token과 품목코드 일치, (4) 모두 실패 시 정제 모델명을 코드처럼 보존하고 `검색실패` 처리다 (`tools/legacy-gas/가입고처리/Index.html:438-453`).
- 수량:
  - `물류출고`를 `Number`로 변환한다. 빈 값·`undefined`·NaN이면 `주문` 수량으로 대체하고, 그것도 숫자가 아니면 0이다. 마지막에 `Math.round` 후 문자열로 만든다 (`tools/legacy-gas/가입고처리/Index.html:455-460`).
- 금액/단가:
  - 레거시가 만드는 `BulkDatas`에는 금액·단가 필드가 없다. `QTY`만 전달한다 (`tools/legacy-gas/가입고처리/Index.html:480`). 따라서 이 GAS만으로 금액 또는 단가 변환 규칙은 **확인 불가**다.
- 이카운트 payload:
  - `UPLOAD_SER_NO`, 빈 `IO_DATE`, 고정 `CUST: "1248100998"`, 로그인 사용자의 `EMP_CD`, 창고 `WH_CD`, 적요 `U_TXT1`, 매핑한 `PROD_CD`, 정제 모델명 `PROD_DES`, 반올림 수량 `QTY`를 만든다 (`tools/legacy-gas/가입고처리/Index.html:474-480`).
  - `CUST: "1248100998"`가 현재 시스템의 어느 거래처에 대응하는지는 이 코드만으로 **확인 불가**다.
  - 창고별로 `UPLOAD_SER_NO`를 분리한다. 기본 `ALL`이면 한 창고 전체가 한 번호이고, 사용자가 `CUSTOM`과 건수를 고르면 그 건수마다 새 번호를 부여한다 (`tools/legacy-gas/가입고처리/Index.html:138-150`, `tools/legacy-gas/가입고처리/Index.html:375-376`, `tools/legacy-gas/가입고처리/Index.html:427-480`).
- 서버측 GAS는 이 payload를 자체 DB 전표로 만들지 않는다. 이카운트 zone 조회·로그인 후 `/proxy/ecount/purchase`로 `PurchasesList`를 전송한다 (`tools/legacy-gas/가입고처리/Code.js:151-176`, `tools/legacy-gas/가입고처리/Index.html:606-641`).

### 오류 처리

- 없는 거래처:
  - 거래처 마스터 조회는 없다. `고객명`은 위 6개 키워드 필터와 창고 결정에만 쓰고, 이카운트 `CUST`는 모든 행에 고정값을 넣는다 (`tools/legacy-gas/가입고처리/Index.html:267`, `tools/legacy-gas/가입고처리/Index.html:404-408`, `tools/legacy-gas/가입고처리/Index.html:480`).
  - 따라서 “없는 거래처” 오류는 표시하지 않는다. 6개 키워드에 맞지 않는 고객명은 조용히 제외된다.
- 없는 품목:
  - 결과 행을 빨간색 `검색실패`로 표시한다 (`tools/legacy-gas/가입고처리/Index.html:490-508`).
  - 전송 시 경고 모달로 “해당 품목 제외하고 발송” 여부를 묻고, 확인하면 `검색실패` 행만 최종 payload에서 제외한다. 유효 행이 하나도 없으면 전송하지 않는다 (`tools/legacy-gas/가입고처리/Index.html:90-97`, `tools/legacy-gas/가입고처리/Index.html:562-597`).
- 빈 행:
  - 물리적으로 빈 row를 별도 판정하는 코드는 없다. 빈 `고객명`이 키워드 필터에서 탈락하므로 결과적으로 제외된다 (`tools/legacy-gas/가입고처리/Index.html:404-408`).
- 파일/헤더 오류:
  - 파일 파싱 `try/catch`나 사용자 오류 메시지가 없다 (`tools/legacy-gas/가입고처리/Index.html:343-361`).
  - 6행 미만 시트와 `고객명`/`주문번호` 헤더가 없는 시트는 오류 표시 없이 건너뛴다 (`tools/legacy-gas/가입고처리/Index.html:383-385`, `tools/legacy-gas/가입고처리/Index.html:398-403`).
- 이카운트 전송 오류:
  - zone·로그인·전송 HTTP가 200이 아니면 각각 `조회실패`, `로그인실패`, `전송실패`로 반환한다 (`tools/legacy-gas/가입고처리/Code.js:151-176`).
  - 응답 `Status`, `FailCnt`, `ResultDetails[].TotalError`, `Error.Message`를 사용자 모달에 표시한다 (`tools/legacy-gas/가입고처리/Index.html:606-638`).

## ② “창고 2개”가 무엇인가

### 레거시 결정 방식

- 두 창고는 이카운트 창고코드 기준 **`00003` = 초월입고(가입고)**, **`2` = 상일입고(가입고)**다 (`tools/legacy-gas/가입고처리/Index.html:434-436`).
- 사용자가 창고를 고르는 UI는 없다. 파일의 `고객명` 값이 `삼성창고` 또는 `초월창고`와 **정확히 일치**하면 초월(`00003`)이고, `이화창고`·`상일물류`·`상일창고`는 상일(`2`)이다. 그 외 처리 대상 고객명은 상일(`2`)로 떨어진다 (`tools/legacy-gas/가입고처리/Index.html:378`, `tools/legacy-gas/가입고처리/Index.html:434-435`).
- 모델 원문에 `1WAY`가 포함되면 고객명 매핑과 무관하게 상일(`2`)로 강제한다 (`tools/legacy-gas/가입고처리/Index.html:436`).
- UI의 `ALL/CUSTOM`은 창고 선택이 아니라 **한 창고의 품목을 몇 건씩 이카운트 업로드 번호로 나눌지** 정하는 옵션이다 (`tools/legacy-gas/가입고처리/Index.html:138-150`).

### 현재 DB 존재 여부 — READ ONLY 실조회

- 조회 대상은 `inventory_db.warehouses`다. 스키마상 창고 업무코드는 `warehouses.code`이고 활성 코드 unique index가 있다 (`services/inventory-service/src/main/resources/db/migration/V1__init_inventory_service.sql:14-35`). 이카운트 별칭 map은 `staging.ecount_warehouse_map`이다 (`services/inventory-service/src/main/resources/db/migration/V12__add_warehouse_ecount_staging.sql:31`).
- 2026-08-15 현재 실행 중인 `samhan-postgres`에서 다음 형식으로만 조회했다: `BEGIN; SET TRANSACTION READ ONLY; SELECT ...; ROLLBACK;`. 쓰기·commit은 없었다.
- 결과:

| `warehouses.code` | `warehouses.name` | type | 삭제 여부 |
|---|---|---|---|
| `00003` | `초월창고 S18` | `HEADQUARTERS` | 활성 (`false`) |
| `2` | `상일창고 S18` | `HEADQUARTERS` | 활성 (`false`) |

- 따라서 요청의 두 코드는 현재 DB에 실제 활성 창고로 존재한다. 과거 실경로 QA 문서에도 같은 코드·이름·활성 상태가 기록돼 있다 (`docs/qa/1039-provisional-dispatch-s18-real-qa/qa-report.md:55-60`).
- 단, `staging.ecount_warehouse_map`에서 `ecount_code IN ('00003','2')` 및 이름 `초월/상일`로 조회한 결과는 0행이었다. 즉 **창고 마스터에는 존재하지만 이카운트 별칭 map에는 현재 연결이 없다**.

## ③ 지금 시스템의 입고전표 생성 경로

### 화면

- 정식 구매관리 `/purchases` 화면의 “신규 입고전표” 버튼이 `/purchases/new`로 이동한다 (`clients/desktop/src/renderer/routes/purchase-query/PurchaseQueryPage.tsx:416-427`).
- `/purchases/new`는 `SlipFormPage mode="INBOUND"`를 렌더한다 (`clients/desktop/src/renderer/routes/index.tsx:636-642`).
- 입고 폼은 기본 입고구분을 `PURCHASE`로 두고 (`clients/desktop/src/renderer/routes/SlipFormPage.tsx:699-704`), 저장 가능 조건으로 입고 창고와 유효 품목 라인 1개 이상을 요구한다 (`clients/desktop/src/renderer/routes/SlipFormPage.tsx:2046-2066`).

### API와 서비스 계층

- 프런트는 JSON body를 `POST /slips`로 보낸다 (`clients/desktop/src/renderer/api/slip.ts:645-655`).
- `slip-service`의 `SlipController` 기본 경로가 `/slips`이고, `@PostMapping` 생성 endpoint가 `CreateSlipRequest`를 받아 `slipService.create`를 호출한다 (`services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipController.java:88-92`, `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipController.java:342-356`).
- 서비스는 품목 ID를 product-service에서 일괄 조회하고, 날짜 마감 확인·채번 후 `Slip.createInbound`를 호출하며, 라인을 추가하고 `DRAFT` 상태로 저장한다 (`services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:250-320`, `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:372-382`).
- 입고 생성은 `destinationWarehouseId`가 필수이고 `sourceWarehouseId`는 null이다. 거래처 UUID/이름은 생성 시 선택이며, 배송태그가 없으면 `PURCHASE`가 기본값이다 (`services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java:711-737`). 다만 전송 단계에서는 거래처가 없으면 차단된다 (`services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java:1125-1135`).

### 현재 생성 요청 형태와 필수 필드

- 헤더 DTO:
  - 필수: `slipType`.
  - 입고 도메인 필수: `destinationWarehouseId`.
  - 선택: `slipDate`(없으면 서버 오늘), `partnerId`, `partnerName`, `deliveryTag`, `memo` 및 기타 snapshot 필드.
  - `lines`는 빈 배열 금지, 최대 100개다 (`services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/CreateSlipRequest.java:50-93`).
- 라인 DTO 필수:
  - `productId`
  - 양수 `quantity`
  - 0 이상 `unitPrice`
  - `productName`, `modelName`, `specification`, `note` 등은 선택이다 (`services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/CreateSlipRequest.java:95-123`).
- 실제 폼 payload도 `slipType`, 날짜, 창고 UUID, 선택 거래처 UUID/명, 태그와 라인을 같은 `createSlip` 함수로 보낸다. 빈 라인은 제외하고, 단가가 비어 있으면 문자열 `0`, `priceVatInclusive:true`로 보낸다 (`clients/desktop/src/renderer/routes/SlipFormPage.tsx:1952-2024`).

### 기존 파일 업로드 경로

- **입고전표 생성 endpoint 자체에는 XLSX/multipart 입력 경로가 확인되지 않았다.** 생성은 위 JSON `POST /slips` 단일 경로다. slip-service의 별도 multipart endpoint는 이미지/PDF 첨부용이며 허용 형식도 JPEG/PNG/PDF뿐이다 (`services/slip-service/src/main/java/com/samhanair/logis/slip/attachment/web/SlipAttachmentController.java:54-78`).
- 다만 시스템 전체에는 XLSX 업로드 경로가 이미 있다.
  - 가장 가까운 운영 예시는 `/warehouse/dps-compare` 화면이다. `.xlsx` file input을 제공한다 (`clients/desktop/src/renderer/routes/InventoryDpsComparePage.tsx:375-390`).
  - 프런트는 `FormData`에 `file`, `from`, `to`, `groupBy`를 담아 `POST /warehouse/audit/dps-compare`로 전송한다 (`clients/desktop/src/renderer/api/dpsCompareApi.ts:85-113`).
  - inventory-service controller는 `multipart/form-data`와 `MultipartFile`을 받는다 (`services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/DpsCompareController.java:47-80`).
  - 이 경로의 `DpsExcelParser`는 Apache POI `XSSFWorkbook`으로 첫 시트만 읽고 첫 행을 헤더로 사용하며, `품번`·`수량`을 필수로 검사한다 (`services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/DpsExcelParser.java:23-38`, `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/DpsExcelParser.java:56-98`, `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/DpsExcelParser.java:107-147`). 레거시 가입고 XLSX의 “모든 시트, 6·7행 헤더, 8행부터 데이터” 계약과는 다르다.
  - 관리자 거래처 화면도 `.csv,.xls,.xlsx`를 받고 (`clients/desktop/src/renderer/routes/admin/PartnersPage.tsx:398-406`), XLSX면 multipart `POST /admin/partners/imports/ecount-xlsx`로 보낸다 (`clients/desktop/src/renderer/api/partnerImportApi.ts:58-67`, `services/partner-service/src/main/java/com/samhanair/logis/partner/controller/EcountPartnerImportController.java:68-80`).

## ④ 레거시와 지금 시스템 사이의 격차

| 레거시가 하는 일 | 현재 시스템 상태 |
|---|---|
| 사용자가 원본 `.xlsx/.xls`를 올린다. | 입고전표 작성 화면은 수동 폼이며 XLSX input이 없다. `POST /slips`도 JSON 요청만 받는다. |
| 모든 시트의 6·7행을 2단 헤더로 합치고 8행부터 읽는다. | 기존 DPS XLSX 파서는 첫 시트·첫 행 헤더·2행부터 데이터 계약이라 가입고 파일 계약을 처리하지 않는다. |
| `고객명` 6개 키워드만 추리고 여러 시트의 대응 행을 상쇄한다. | 현재 입고전표 생성 경로에는 이 필터·시트 간 상쇄 로직이 없다. |
| 고객명 exact mapping과 `1WAY` 모델 override로 `WH_CD 00003/2`를 자동 결정한다. | 현재 폼은 사용자가 `destinationWarehouseId`를 고른다. 두 창고는 DB에 있지만 가입고 파일에서 자동 선택하는 경로는 없다. |
| 별도 품목리스트를 복원해 모델명 정제, `GHP` 치환, 완전/부분/token 순으로 코드 매핑한다. | 현재 생성 API는 등록 품목의 `productId`를 필수로 받고 product-service에서 검증한다. 레거시 모델 문자열을 현재 `productId`로 변환하는 가입고 경로는 없다. |
| `물류출고`→`주문` fallback, 반올림으로 수량을 정한다. | 현재 API는 이미 확정된 양수 정수 `quantity`를 요구한다. 가입고 열 변환 경로가 없다. |
| 품목 검색 실패를 결과표에 표시하고 사용자의 확인 후 실패 행만 제외해 계속 전송한다. | XLSX 가입고 미리보기·행별 매핑상태·부분 제외 전송 흐름이 없다. 일반 `POST /slips`는 필수 라인 값 검증에 실패하면 요청 오류가 된다. |
| 창고별·사용자 지정 건수별로 `UPLOAD_SER_NO`를 나눠 이카운트 구매전표를 직접 전송한다. | 현재 생성 요청은 최대 100라인의 Samhan Public `Slip(type=INBOUND)` DRAFT 1건을 만든다. 가입고 파일의 창고별/건수별 자동 분할 경로는 없다. |
| 이카운트 `CUST`를 `1248100998`로 고정한다. | 현재 전표는 선택 `partnerId`/`partnerName`을 받고 전송 전에는 거래처가 필수다. 고정 `CUST`가 어느 현재 거래처인지, 가입고 전표가 어느 거래처를 써야 하는지는 **확인 불가**다. |
| 단가·금액 없이 수량만 이카운트로 보낸다. | 현재 라인은 `unitPrice`가 필수다. 가입고 자동생성 시 사용할 단가/금액 규칙은 레거시 GAS와 현재 요구 원문에서 **확인 불가**다. |
| 사용자가 전송일을 고르고 이카운트 구매 API 응답의 전표번호를 표시한다. | 현재 `POST /slips`는 자체 전표번호를 채번해 DRAFT를 생성한다. 가입고 업로드가 DRAFT 생성까지만 할지 이후 상태 전이까지 할지는 요구 원문만으로 **확인 불가**다. |
| 결과·품목리스트를 Notion에 자동/수동 저장하고 복원한다. | 현재 시스템에는 DPS 비교 저장이력은 있으나, 가입고 XLSX 처리 결과의 저장·복원 경로는 없다. |

