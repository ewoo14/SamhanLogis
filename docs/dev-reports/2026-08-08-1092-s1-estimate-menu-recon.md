# #1092 견적서 메뉴 정본 재정의 — S1 정찰 보고서

작성일: 2026-08-08  
대상 브랜치: `feat/1092-estimate-menu-canon`  
기준 커밋: `06e780a39`  
범위: 사실 수집만. 코드·마이그레이션·DB 데이터 변경 없음.

## 조사 전제와 용어

요청에 적힌 `tools/legacy-gas/종합견적서`는 실제 경로와 일치한다. 반면 literal `tools/legacy-gas/주문서` 디렉터리는 존재하지 않는다. 저장·불러오기 기능을 가진 주문서 GAS는 실제 경로 `tools/legacy-gas/거래처 발송 주문서`였으므로 이 보고서의 “주문서 계열”은 그 디렉터리를 뜻한다. `에어디자이너 전용 주문서 인식`, `제이시스템 전용 주문서 인식`은 저장·복원 화면이 아니어서 제외했다.

DB 질의는 실행 중인 `samhan-postgres`에 `SELECT`/정보 스키마 조회만 수행했다. 행 수는 기본적으로 `is_deleted=false` 활성 행이다. 비밀번호·토큰은 기록하지 않았다.

## A. 레거시 GAS 실측

### A-1. 저장 경로

| 계열 | 견적/주문 snapshot 저장 | 저장 직후 서버 경로 | 별도 전표/출고 이력 저장 |
|---|---|---|---|
| 종합견적서 | `index.html:17057` `handleSaveSnapshot()` → `google.script.run.saveQuoteSnapshot({data, summary, image})` (`index.html:17331`) | `Code.js:2724` `saveQuoteSnapshot()` → Notion `NOTION_DB_QUOTE` (`Code.js:2720-2780`) | 견적 확정/전송 흐름에서 `Code.js:1954` 호출 → `Code.js:2340` `saveOrderToNotion()` |
| 주문서 | `index.html:8840` `handleSaveSnapshot()` → `google.script.run.saveOrderSnapshot({data, summary, image})` (`index.html:8984`) | `Code.js:105` `saveOrderSnapshot()` → Notion `NOTION_DB_ID_SNAPSHOT` (`Code.js:101-158`) | 주문 처리 성공 흐름에서 `Code.js:2385` 호출 → `Code.js:3222` `saveOrderToNotion()` |

따라서 “저장”을 작성 중 snapshot으로 한정하면 각 1개이고, 전표/출고 완료 후 이력 기록까지 포함하면 각 계열에 두 번째 저장 경로가 있다. 두 번째 경로는 복구 가능한 견적 snapshot이 아니라 출고/전표 이력이다.

### A-2. 저장 필드 전체

아래의 `form`, `branch`, `core`는 `takeSnapshot()`이 저장하는 구조이고, `summary`/`image`는 Notion page 속성으로 저장되는 envelope이다. `<input>` 전체를 동적으로 순회하므로 form 내부의 개별 DOM 키는 고정 컬럼 목록이 아니라 당시 화면의 `id` 또는 `name` 전체다.

| 의미/저장 키 | 종합견적서 | 주문서 | 판정 |
|---|---|---|---|
| 저장 envelope | `data`, `summary.custName`, `image` (`index.html:17073-17085`, `Code.js:2727-2758`) | `data`, `summary.custName`, `summary.bizNo`, `summary.theme`, `image` (`index.html:8866-8874`, `Code.js:107-141`) | 주문서만 `bizNo`, `theme` 추가 |
| 거래처 표시 | `custName` | `custName` | 같은 뜻, 종합견적서 Notion title `거래처명` / 주문서도 `거래처명` |
| 외부 식별자 | 없음 | `bizNo`/`거래처코드` | 주문서만 사업자번호/거래처코드 |
| 저장 제목 | 없음(저장내역 표시는 거래처명) | `theme`/`주제` | 주문서만 사용자가 입력한 주제 |
| 저장 시각 | `timestamp`(state), `저장일시` | `timestamp`(state), `저장일시` | 같은 뜻 |
| 폼 값 | `form[id 또는 name]`; checkbox는 boolean, radio는 선택값, 기타는 `{v: value, l: style.color}` | `form[id 또는 name]`; checkbox는 boolean, radio는 선택값, 기타는 value 문자열 | 종합견적서만 입력 글자색 `l` 보존 |
| 분기 상태 | `branch` = `snapshotBranchState()` 결과, `GLOBAL_BRANCH_STATE` | `branch` = `GLOBAL_BRANCH_STATE` 복사 | 같은 개념, 종합견적서는 분기 grid 내용까지 조건부 보존 |
| 수량 core | `homeQty`, `singleQty`, `commQty`, `oldQty` | `homeQty`, `singleQty`, `commQty`, `oldQty` | 같은 뜻 |
| 가격 core | `homePrices`, `singlePrices`, `commPrices`, `oldPrices` | 없음 | 종합견적서만 사용자 단가 map |
| 출고/표시가 core | `homeListPrices`, `singleListPrices`, `commListPrices`, `oldListPrices` | 없음 | 종합견적서만 |
| 규격 core | `homeSpecs`, `commSpecs`, `oldSpecs` | 없음 | 종합견적서만 |
| 세트 구성품 수량 | `singlePartQtys`, `commPartQtys` | 없음 | 종합견적서만 |
| 수동 선택 집합 | `homeManualPanel`, `homeManualHose`, `homeManualRemote`, `homeManualBranch`, `homeManualFoot`, `commManualPanel`, `commManualHose`, `commManualRemote`, `commManualPump`, `commManualBase` | 없음 | 종합견적서만 |
| 절대 잠금 | `absoluteLock` | `absoluteLock` | 같은 뜻 |
| 할인/설정 | `homeDc`, `commDc` | 없음 | 종합견적서만 |
| 사용자 추가 행 | `customRows.home`, `.single`, `.comm`, `.old`; 행별 `name`, `model`, `list`, `spec`, `qty`, `price`, `fixDc`, `varDc` | 없음 | 종합견적서만 |
| 사용자 정렬/해시 | `customFinalOrder`, `customFinalHash` | 없음 | 종합견적서만 |
| 이미지 미리보기 | Notion `미리보기1/2/3`, 각 rich_text 2,000자 chunk, 최대 3×100 chunks (`Code.js:2739-2763`) | 동일한 `미리보기1/2/3` 구조 (`Code.js:120-141`) | 같은 뜻, 이미지 자체는 복구 state가 아님 |

종합견적서의 snapshot 구조 원문 근거는 `index.html:16240-16424`, 주문서의 구조는 `index.html:8769-8801`이다. 종합견적서의 full state에는 단순 품목 배열보다 가격·규격·할인·수동선택·커스텀행 등 계산 상태가 더 많이 들어간다.

전표/출고 이력의 별도 필드는 다음과 같다.

| 종합견적서 `Code.js:2368-2387` | 주문서 `Code.js:3245-3265` |
|---|---|
| `출고일`, `전표번호`, `거래처코드`, `거래처명`, `담당자`, `출고창고`, `배송주소`, `감리주소`, `사업자주소`, `대표번호`, `인수자 번호`, `특이사항`, `결제예정일`, `사용자계정`, `생성날짜`, `품목데이터` | `거래처명`, `거래처코드`, `전표번호`, `배송주소`, `현장주소`, `인수자 번호`, `특이사항`, 선택적 `출고희망일`, 선택적 `결제예정일`, `품목데이터` |

### A-3. 불러오기·미리보기

- 종합견적서 저장내역 진입은 `index.html:16965` `goSnapshotPage()`, 날짜 조회는 `index.html:16996-17028` `loadSnapshotHistory()` → `Code.js:2791` `getQuoteHistory()`, 거래처명 조회는 `index.html:17032-17053` → `Code.js:2879` `getQuoteHistoryByCustomer()`다. `getQuoteHistory()`는 `담당자 계정 = Session.getActiveUser().getEmail()`로 필터링한다(`Code.js:2794-2798`). 복원은 `index.html:17457` 이후 `restoreSnapshot()` → `decodeBase64()` → `applySnapshot()`이며, 미리보기는 저장된 image를 overlay로 표시한다(`index.html:17449` 호출부 및 `showSnapshotPreview` 주변).
- 종합견적서 작성 중 견적서 미리보기는 `index.html:10396` `goPreview()` → `renderPreviewContent()`이며, 기본/세트상세 버튼은 `index.html:1296-1297`, 저장 snapshot 미리보기는 별도 이미지다.
- 주문서 저장내역 진입은 `index.html:9127` `goSnapshotPage()`, 조회는 `index.html:9164-9197` → `Code.js:169` `getOrderSnapshotHistory()`, 복원은 `index.html:9235-9239` `decodeBase64()` → `applySnapshot()`, 저장 image 미리보기는 `index.html:9241` `showSnapshotPreview()`다. 작성 화면 미리보기는 UI의 `#btnPreview`와 `goPreview` 계열이다.
- 주문서의 Notion 과거 전표/주문 이력은 `index.html:8442` → `Code.js:3084` `getOrderHistory()`다. 이것은 snapshot 복원이 아니라 품목데이터를 decode해 표시용 행으로 만드는 이력 조회다(`Code.js:3175-3210`).

### A-4. 담당자

레거시에는 담당자 개념이 있다.

- 종합견적서에는 `getManagersForInput()`이 `담당자명`/`담당자코드`를 반환한다(`Code.js:2316-2326`). 거래처 검색 결과도 `manager`, `managerTel`을 반환한다(`Code.js:2310-2313`). 전표/출고 Notion 저장 시 `info.manager`를 공백 전 첫 토큰으로 잘라 `담당자` select에 넣는다(`Code.js:2364-2376`). 견적 snapshot 자체에는 별도 담당자 필드가 없고, 목록 권한 축은 `Session.getActiveUser().getEmail()`을 `담당자 계정` property로 기록·필터링한다(`Code.js:2754-2758`, `2794-2798`). 즉 사람 이름/사번과 계정 이메일이 서로 다른 축으로 존재한다.
- 주문서 입력 처리에는 거래처 담당자명에서 담당자 시트의 `empCd`를 찾고, 없으면 script credential의 `EMP_CD`로 보완하는 로직이 있다(`Code.js:2008-2020`). 그러나 주문 snapshot page에는 `담당자`/`empCd` property가 저장되지 않는다(`Code.js:131-141`). 주문서 전표/출고 Notion 저장에도 snapshot envelope의 담당자 필드는 없고, 별도 전송 payload에서는 `common`에 있는 거래처/배송 정보 중심이다(`Code.js:3245-3265`).

### A-5. 운임·절삭

종합견적서 `handleFreightInput()`은 금액 입력값을 `priceMap`에 저장하고, 0이 아니면 `qtyMap.set(model, 1, true)`로 수량 1을 자동 부여한다(`index.html:2698-2715`). 절삭은 항상 `-Math.abs(val)`로 음수화한다(`index.html:2703-2705`). 이후 `buildSendRows()`가 저장 직전 품목행을 구성한다(`index.html:9075`), snapshot에서는 해당 상태가 `form` 및 `core` map에 들어가며, 전표/출고용 `items` 배열에는 품목행의 `name/model/qty/price` 계열로 포함된다(`Code.js:2352-2386`).

즉 운임·절삭은 저장에서 제외되는 표시용 행이 아니라 “금액을 먼저 넣으면 수량 1이 생성되는” 일반 행과 반대 방향의 입력 규칙을 가진 실제 금액 행이다. 절삭은 음수 금액이다. 종합견적서 미리보기 구성 코드도 `index.html:7004-7006`, `10881`, `11079` 등에서 운임·절삭을 특수 행으로 다루지만, 저장 시 제거한다는 근거는 없다.

### A-6. Notion/압축에서 추출되는 업무 규칙

계승할 업무 규칙으로 확인되는 것은 다음이다.

1. 작성 상태를 나중에 다시 불러올 수 있어야 한다. 단순 헤더가 아니라 수량·가격·규격·할인·분기·커스텀행 등 화면 계산 상태가 복원 대상이다.
2. 저장내역에는 저장 시각과 거래처 식별 정보가 있어야 하고, 종합견적서 레거시는 현재 로그인한 계정의 저장내역만 조회했다.
3. 저장된 렌더 결과를 미리보기로 확인할 수 있다.
4. 주문서 계열은 사업자번호/거래처코드와 사용자가 붙인 주제로 저장내역을 찾는다.
5. 종합견적서 운임·절삭은 금액 행으로 저장·복원되어야 하며 절삭 부호와 수량 1 규칙을 보존해야 한다.
6. 저장 시점의 거래처명·주소·담당자 등 문서 snapshot은 당시 문서를 재현하기 위한 값이다.

Notion database, rich_text 2,000자 분할, base64, image chunk, Notion 계정/토큰은 저장 수단이지 업무 규칙이 아니다. 새 정본에서 그대로 계승해야 한다는 근거는 없다.

## B. 현행 코드 실측

### B-1. 현재 “견적서” 메뉴

내부 데스크톱의 `/#/sales/estimates`는 `clients/desktop/src/renderer/routes/index.tsx:490-498`에서 `EstimateListPage`로 라우팅되고, `PermissionGuard(pageCode="estimates.list", action="view")`가 감싼다. 화면은 `clients/desktop/src/renderer/routes/EstimateListPage.tsx:75-127`에서 `listEstimates()`를 호출한다. 표시 컬럼은 `estimateNo`, `partnerBusinessNo`, `partnerName`, `estimateDate`, `validUntil`, `totalAmount`, 상태이며(`EstimateListPage.tsx:129-277`), 삭제 행 복원도 지원한다.

호출 API는 `clients/desktop/src/renderer/api/estimateApi.ts:226-246`의 `GET /slips/estimates`다. 현재 목록 필터는 status, partnerId, startDate, endDate, includeDeleted, page, size이고, 거래처명 부분검색은 화면에서 후처리한다(`EstimateListPage.tsx:96-127`). 이 메뉴는 주문서 목록을 합쳐 표시하지 않는다. 주문서는 별도 `/#/sales/partner-orders` 라우트(`index.tsx:502-515`)와 `SalesPartnerOrderListPage`다.

### B-2. 현행 estimates 계열 스키마와 담당 축

`slip_db.estimates` 전체 컬럼은 다음과 같다.

| # | 컬럼 | 타입 | null |
|---:|---|---|---|
|1|id|uuid|NO|
|2|estimate_no|varchar(30)|NO|
|3|estimate_date|date|NO|
|4|seq_no|integer|NO|
|5|status|varchar(20)|NO|
|6|partner_id|uuid|YES|
|7|partner_name|varchar(100)|YES|
|8|partner_business_no|varchar(20)|YES|
|9|partner_address|varchar(200)|YES|
|10|valid_until|date|YES|
|11|total_supply|numeric|NO|
|12|total_vat|numeric|NO|
|13|total_amount|numeric|NO|
|14|converted_slip_id|uuid|YES|
|15|sent_at|timestamp|YES|
|16|accepted_at|timestamp|YES|
|17|rejected_at|timestamp|YES|
|18|converted_at|timestamp|YES|
|19|memo|varchar(1000)|YES|
|20|requester_id|varchar(50)|NO|
|21|version|bigint|NO|
|22|created_at|timestamp|NO|
|23|created_by|varchar(50)|NO|
|24|modified_at|timestamp|YES|
|25|modified_by|varchar(50)|YES|
|26|deleted_at|timestamp|YES|
|27|deleted_by|varchar(50)|YES|
|28|is_deleted|boolean|NO|
|29|deleted_by_name|varchar(100)|YES|

작성자/담당 후보로 보이는 `requester_id`, `created_by`, `modified_by`는 있으나 이름 그대로 “담당자”를 뜻하는 전용 `assignee`/`manager` 컬럼은 없다. 코드 주석도 `requesterId`를 작성자 user-id로 정의한다(`services/slip-service/.../Estimate.java:146`, `EstimateService.java:180`). `EstimateDocumentCollaborationPort`는 결재자/배차 담당자 개념이 없다고 명시한다.

### B-3. 종합견적서와 주문서 테이블 관계

다른 DB·다른 테이블이다.

- 종합견적서 도메인: `slip_db.estimates` + `slip_db.estimate_lines`.
- 주문서 도메인: `partner_order_db.partner_orders` + `partner_order_db.partner_order_lines`.
- 주문서에는 `source_estimate_id`가 있으나 이는 주문서가 어떤 estimate에서 생성됐는지 가리키는 nullable 참조이고, 두 계열을 같은 테이블로 통합하지 않는다(`partner_orders` schema column 23).
- 외부 종합견적서 legacy snapshot의 현행 저장은 별도 `slip_db.quote_snapshots`이며 `estimates`와도 별도 테이블이다. 외부 주문서 임시 저장은 `partner_order_db.partner_order_drafts`다.

### B-4. 판매전표 전환 경로

현행에는 이미 세 경로가 있다.

- 종합견적서 단건 전환: `services/slip-service/.../estimate/web/EstimateController.java:178-185`, `POST /slips/estimates/{id}/convert`; `EstimateToSlipConverter`가 `converted_slip_id`/`converted_at`을 기록한다.
- 견적에서 판매전표 발행 공개 API: `services/slip-service/.../web/SlipPublishController.java:89-101`, `POST /api/v1/slips/from-estimate`, 권한 `slip.publish.from-estimate:CREATE`.
- 주문서에서 판매전표 발행: `SlipPublishController.java:124-132`, `POST /api/v1/slips/from-partner-order`; 주문서 자체 컨트롤러에도 단건/병합 전환 `services/partner-order-service/.../PartnerOrderConvertController.java:59-87`, `POST /api/v1/partner-orders/{id}/convert-to-slip`, `POST /api/v1/partner-orders/convert-to-slip-merge`가 있다.
- 종합견적서에서 주문서 생성: `PartnerOrderFromEstimateController.java:35-42`, `POST /api/v1/partner-orders/from-estimate/{estimateId}`.

다만 외부 estimate-app의 `sendOrderFromUi`는 현재 `clients/desktop/src/preload/samhanApi.ts:263-271`에서 `/api/v1/estimates/finalize`로 매핑되고, `clients/web/estimate-app/lib/slip-bridge.js`가 실제 bridge를 담당한다. 따라서 “외부 웹에서 기존 저장 견적을 불러와 종합견적서/주문서 생성”은 기존 내부 API가 전부 같은 사용자 흐름으로 연결돼 있다고 볼 수 없다.

### B-5. 외부 거래처용 웹 진입점·인증·권한

- 종합견적서 외부 웹 진입점: `clients/web/estimate-app/server.js:84-85`가 `/`와 `/rpc/:fnName` 라우터를 등록하고, `routes/index.js:22-35`의 `GET /`가 `estimate-app` EJS 화면을 렌더한다. 세션 cookie가 있으면 그 이메일을 쓰고, 없으면 query `email`, 환경변수 default, dev default 순으로 bootstrap한다(`routes/index.js:24-31`). authorized이면 `estimate_auth` cookie를 발급한다.
- snapshot 저장 RPC는 `routes/rpc.js:40-47`에서 `saveQuoteSnapshot`만 identity-bound로 묶어 cookie 세션 이메일이 없으면 401이다. 저장 함수는 전달된 이메일이 아니라 authenticated email을 저장한다(`lib/code.js:2471-2484`).
- 종합견적서 외부 웹의 legacy 접근 게이트는 `checkUserAuth` → partner/directory backend 승인 조회이며 `lib/code.js:2716-2748`에 확인된다. 현재 외부 웹은 내부 데스크톱 `estimates` 목록 API와 동일한 목록/권한 표면이 아니다.
- 주문서 외부 웹 진입점: `clients/web/order-app`이다. `partner-auth-service`의 `POST /api/v1/auth/partner-login`으로 사업자번호+4자리 PIN 인증하고 JWT를 받는다(`clients/web/order-app/README.md:52-54`, `src/samhanApi.ts:43-49, 266-306`). 이후 `partner-order-service`의 draft/history/confirm API는 PARTNER 인증 또는 본사 admin 권한을 요구한다(`services/partner-order-service/README.md:140-151`). 주문서 목록·draft 조회는 `X-Partner-Code`와 JWT 기반 범위가 함께 쓰인다(`PartnerOrderListController.java:38-84`, `PartnerOrderDraftController.java:34-89`).

외부 거래처 인증의 현재 실체는 사람(직원) 계정이 아니라 사업자번호 기반 거래처 계정이다. 반대로 내부 estimates API의 기본 설명은 인증 사용자 조회/SALES·MANAGER·MASTER 작성·전이 권한이며, “자신의 requester만 조회” 규칙은 현재 API 계약에서 확인되지 않는다.

## C. 실 데이터 카운트 및 원문 표본

측정 시각: 2026-08-08, `samhan-postgres` dev DB. 아래 활성 수치는 `WHERE is_deleted=false`다.

### C-1. 건수

| 계열 | DB/테이블 | 전체 | 활성 | soft-delete |
|---|---|---:|---:|---:|
| 종합견적서/내부 견적 | `slip_db.estimates` | 2,036 | 43 | 1,993 |
| 외부 종합견적 snapshot | `slip_db.quote_snapshots` | 1 | 1 | 0 |
| 주문서/확정·작성 주문 | `partner_order_db.partner_orders` | 2,025 | 4 | 2,021 |
| 외부 주문서 임시 저장 | `partner_order_db.partner_order_drafts` | 2,005 | 11 | 1,994 |

정본 정의의 “웹에서 저장한 견적서”를 그대로 보면 현재 `quote_snapshots` 표본은 1건뿐이고, 내부 `estimates` 43건과 동일 테이블이 아니다. 주문서도 확정/작성 주문 4건과 외부 draft 11건이 별도 표면이다.

### C-2. 담당 후보 컬럼 충전율

활성 행 기준으로 실행한 `COUNT(*) FILTER (WHERE col IS NOT NULL AND col <> '')` 등가 질의 결과다. UUID 값은 화면 노출 제안이 아니라 내부 조인/실측용이다.

| 관계 | 후보 컬럼 | 채움 | 전체 | 충전율 | 현재 의미 근거 |
|---|---|---:|---:|---:|---|
| `slip_db.estimates` | `requester_id` | 43 | 43 | 100% | 작성자 user-id |
|  | `created_by` | 43 | 43 | 100% | 생성 actor |
|  | `modified_by` | 43 | 43 | 100% | 수정 actor |
|  | `partner_id` | 37 | 43 | 86.05% | 거래처 UUID, 담당자 아님 |
|  | `partner_name` | 43 | 43 | 100% | 거래처명, 담당자 아님 |
| `partner_order_db.partner_orders` | `created_by` | 4 | 4 | 100% | 생성 actor |
|  | `modified_by` | 4 | 4 | 100% | 수정 actor |
|  | `partner_id` | 2 | 4 | 50% | 거래처 UUID, 담당자 아님 |
|  | `partner_code` | 4 | 4 | 100% | 외부 거래처 코드 |
|  | `biz_code` | 4 | 4 | 100% | 사업자/거래처 코드 |

결론적으로 조인 키로 쓸 수 있는 후보 중 `requester_id`는 100% 채워져 있지만 코드 정의상 “담당자”가 아니라 “작성자”다. `created_by`/`modified_by`도 actor이며, 거래처 UUID/코드와 사람 담당자를 혼동하면 안 된다. 현재 실 데이터에는 담당 전용 축이 없다.

### C-3. 활성 원문 2건씩

요청대로 요약 라벨을 붙이지 않고 DB row 전체를 JSON 원문으로 출력했다. 순서는 `created_at, id` 오름차순이며, UUID는 데이터 원문 보존을 위한 내부 증거로만 기재한다.

#### `slip_db.estimates`

```json
{"id":"58020cdc-1c28-48f3-b6c0-983ba22db776","estimate_no":"2026/07/16-1","estimate_date":"2026-07-16","seq_no":1,"status":"QUOTE_DRAFT","partner_id":"1021fcf7-f63d-3fcd-9769-6518ab4c27c9","partner_name":"전주에어시스템","partner_business_no":null,"partner_address":null,"valid_until":null,"total_supply":210000.00,"total_vat":21000.00,"total_amount":231000.00,"converted_slip_id":null,"sent_at":null,"accepted_at":null,"rejected_at":null,"converted_at":null,"memo":"R5 BUNDLE 무수정 편집 오염 실서버 QA","requester_id":"a0000000-0000-0000-0000-000000000003","version":0,"created_at":"2026-07-16T00:33:11.150853","created_by":"a0000000-0000-0000-0000-000000000003","modified_at":"2026-07-16T00:33:11.150853","modified_by":"a0000000-0000-0000-0000-000000000003","deleted_at":null,"deleted_by":null,"is_deleted":false,"deleted_by_name":null}
{"id":"97217ed1-062e-4555-af57-ccae21772bc9","estimate_no":"2026/07/16-6","estimate_date":"2026-07-16","seq_no":6,"status":"QUOTE_DRAFT","partner_id":"1021fcf7-f63d-3fcd-9769-6518ab4c27c9","partner_name":"전주에어시스템","partner_business_no":"373-47-10651","partner_address":null,"valid_until":"2026-08-15","total_supply":210000.00,"total_vat":21000.00,"total_amount":231000.00,"converted_slip_id":null,"sent_at":null,"accepted_at":null,"rejected_at":null,"converted_at":null,"memo":null,"requester_id":"a0000000-0000-0000-0000-000000000003","version":0,"created_at":"2026-07-16T02:00:22.60465","created_by":"a0000000-0000-0000-0000-000000000003","modified_at":"2026-07-16T02:00:22.60465","modified_by":"a0000000-0000-0000-0000-000000000003","deleted_at":null,"deleted_by":null,"is_deleted":false,"deleted_by_name":null}
```

#### `partner_order_db.partner_orders`

```json
{"id":"8b6689d5-cf41-4b40-a98b-db410129b76b","partner_code":"P-2026-0012","biz_code":"256-84-10372","order_no":"2026/06/08-1980","slip_no":null,"status":"DRAFT","slip_publish_status":"NOT_REQUIRED","total_amount":1800000.00,"confirmed_at":null,"slip_published_at":null,"idempotency_key":"PO-CONF-P-2026-0012-104","created_at":"2026-06-08T02:09:05.396744","created_by":"a0000000-0000-0000-0000-000000000004","modified_at":"2026-08-07T20:34:31.980135","modified_by":"a0000000-0000-0000-0000-000000000001","deleted_at":null,"deleted_by":null,"is_deleted":false,"revision_count":6,"due_date":null,"memo":null,"lock_version":12,"source_estimate_id":null,"deleted_by_name":null,"partner_id":null,"delivery_address":null}
{"id":"908bd503-af77-43fb-a58b-90bc73e4e4c9","partner_code":"P-2026-0004","biz_code":"152-28-10124","order_no":"2026/06/08-1982","slip_no":null,"status":"DRAFT","slip_publish_status":"NOT_REQUIRED","total_amount":600000.00,"confirmed_at":null,"slip_published_at":null,"idempotency_key":"PO-CONF-P-2026-0004-108","created_at":"2026-06-08T02:09:16.873267","created_by":"a0000000-0000-0000-0000-000000000004","modified_at":"2026-08-08T02:09:14.668462","modified_by":"a0000000-0000-0000-0000-000000000001","deleted_at":null,"deleted_by":null,"is_deleted":false,"revision_count":3,"due_date":null,"memo":null,"lock_version":9,"source_estimate_id":null,"deleted_by_name":null,"partner_id":null,"delivery_address":null}
```

표본에서 종합견적서는 `requester_id = created_by = modified_by`인 작성자 중심 row이고, 주문서는 `created_by`와 `modified_by`가 달라진 row다. 이것만으로 “담당 변경”이라고 해석할 수는 없다. 수정 actor일 뿐이다.

## D. 개발책임자 확인이 필요한 업무 의미

아래는 코드·데이터로 결정하지 않고 질문으로 남겨야 하는 갈림점이다.

1. **담당의 정체성**: 사람(직원 user-id), 직원 사번/계정, 부서, 거래처 담당자, 또는 별도 영업 담당자 중 무엇인가? `requester_id`/`created_by`는 현재 작성 actor이지 전용 담당 축이 아니다.
2. **“자신이 담당인 견적만”의 적용 대상**: 종합견적서 snapshot, 내부 `estimates`, 주문서 `partner_orders`, `partner_order_drafts` 중 어디까지인가? 외부 거래처는 사업자 계정 범위이고 직원은 user 계정 범위인데 두 규칙을 같은 필터로 볼 것인가?
3. **관리자 예외**: MASTER/MANAGER/SALES가 모든 담당 견적을 조회·복구할 수 있는가, 아니면 정의 문구대로 관리자도 자신 담당만 가능한가?
4. **담당 변경 이력**: 변경 전/후 담당자·시각·변경자를 revision/audit에 남겨야 하는가? 현재 `modified_by`만으로는 담당 변경 이력을 표현하지 않는다.
5. **담당 변경 허용 범위**: 종합견적서 계열 내부, 주문서 계열 내부는 변경 허용인가? 종합견적서↔주문서 교차 변경 금지는 API·서비스 도메인·DB constraint·화면 중 어느 층을 정본으로 할 것인가?
6. **두 계열 결합 방식**: 하나의 통합 메뉴가 두 테이블을 union하는가, 읽기 모델/통합 API를 새로 두는가, 아니면 `quote_snapshots`와 `estimates`도 같은 “종합견적서”로 묶는가? 현재 활성 `quote_snapshots`는 1건이고 `estimates`는 43건이다.
7. **snapshot과 정식 estimate의 관계**: 외부 웹 저장 snapshot을 내부 `estimates`로 승격할 때 새 견적번호/새 revision을 발급하는가, 원 snapshot을 정식 record로 간주하는가?
8. **복구 가능 상태**: 이미 판매전표로 전환된 견적(`converted_slip_id`/`converted_at`가 채워진 상태)을 다시 불러오거나 편집할 수 있는가? “미리보기만” 허용할지, 복구 후 새 문서로 저장할지 정해야 한다.
9. **주문서 전환의 의미**: 종합견적서에서 주문서를 만들 때 원 견적과 주문서를 계속 연결(`source_estimate_id`)하는가? 주문서에서 다시 종합견적서로 불러올 때 원본/복제/새 revision 중 어느 것인가?
10. **운임·절삭 보존**: 두 계열 모두 운임·절삭을 공통 line type으로 보존할 것인가? 종합견적서의 특수 입력 규칙(수량 자동 1, 절삭 음수)을 주문서에도 그대로 적용할 것인가? 판매전표 전환 시 음수 절삭을 어떤 라인/금액 권위로 넘길 것인가?
11. **외부 거래처 조회 범위**: 외부 거래처가 자기 사업자번호의 저장 견적만 보나, 자기 거래처 코드로 생성된 종합견적서/주문서까지 보나? 직원이 작성한 종합견적서를 그 거래처 계정이 볼 수 있는 조건은 무엇인가?
12. **거래처 식별자 정본**: `partner_id`, `partner_code`, `biz_code`, `partner_business_no` 중 어느 것을 조인 키로 할 것인가? 실측상 주문서 표본 4건 중 `partner_id`는 2건만 채워졌고, `partner_code`/`biz_code`는 4건 모두 채워졌다.
13. **문서 스냅샷 필드**: 저장 당시 거래처명·주소·담당자·가격·할인·품목을 고정할 것인가, 복구 시 최신 거래처/품목 master를 재조회할 것인가?
14. **전환 중복·재전환**: 이미 판매전표가 있는 견적/주문서의 재전환을 금지할지, 새 판매전표를 만들지, 부분 전환/병합만 허용할지 정해야 한다. 현행에는 `converted_slip_id`와 주문서 `slip_publish_status`가 있다.

## 슬라이스 후보

1. **정본 저장원·통합 조회 계약** — `quote_snapshots`, `estimates`, `partner_order_drafts`, `partner_orders`의 포함 범위와 통합 목록/상세 DTO를 확정한다.
2. **담당자 축·권한 필터** — 담당자 identity, 관리자 예외, 계열별 교차 변경 금지, 변경 audit의 정본 층을 확정하고 조회 권한 계약을 닫는다.
3. **레거시 snapshot 승격·복구** — 종합견적서/주문서 snapshot envelope의 업무 필드를 새 저장 모델로 매핑하고 미리보기·복구·버전 규칙을 닫는다.
4. **운임·절삭 line parity** — 종합견적서의 금액 우선 입력, 자동 수량 1, 절삭 음수 및 전환 금액 semantics를 양 계열·판매전표까지 닫는다.
5. **전환 그래프** — 견적↔판매전표, 견적→주문서→판매전표, 외부 웹 복구 후 생성의 원본 연결·중복 방지·전환 후 재복구 정책을 닫는다.

## 신규 파일 및 변경 여부

- 신규 파일: `docs/dev-reports/2026-08-08-1092-s1-estimate-menu-recon.md`
- 코드 수정: 없음
- DB 변경: 없음 (`SELECT`만 수행)
- 커밋/push: 없음
