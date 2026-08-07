# #1092 견적서 메뉴 정본 재정의 — 갭 분석

- 분석일: 2026-08-07 (Asia/Seoul)
- 기준: `main` / `016b1a39b`
- 범위: 레거시 GAS 원문, 현재 Samhan Public 코드, 현재 로컬 개발 DB의 읽기 전용 실측
- 변경: 이 문서 1개만 신규 작성. 코드·DB·컨테이너·이슈는 변경하지 않았고 테스트도 실행하지 않았다.

## 0. 결론

현재 데스크톱의 **견적서 메뉴**는 `estimates` 테이블의 내부 견적 CRUD 화면이다. 종합견적서 웹의 `quote_snapshots`와 주문서 웹의 `partner_order_drafts`를 합쳐 보여 주지 않는다. 세 저장소 사이에는 공통 출처 구분자와 담당자 필드도 없다. 따라서 정본의 핵심인 **양쪽 웹 저장분 통합 표시, 본사 전체 조회, 담당 변경, 출처 간 담당 교차변경 금지, 원래 웹으로 다시 불러오기**는 현재 메뉴에서 구현되지 않았다.

부분 대응은 별도 경로에 흩어져 있다.

1. 종합견적서 웹은 JSON 상태 저장·복원을 갖고 있고 저장 상태에서 판매전표를 직접 발행할 수 있다.
2. 주문서 웹은 거래처별 임시저장·미리보기·복원을 갖고 있고 복원한 상태로 주문을 확정할 수 있다.
3. `estimates` 견적은 데스크톱에서 판매전표로 직접 전환할 수 있고, 백엔드에는 `estimates` 견적을 거래처 주문으로 만드는 API도 있다.

그러나 이들은 #1092의 통합 견적서 메뉴 레코드가 아니다. 특히 종합견적서 웹의 현재 목록 호출은 작성자 필터를 보내지 않아 모든 작성자의 스냅샷을 돌려받는다. 레거시의 “로그인 이메일 본인 것만” 규칙 및 개발책임자 정본의 “웹에서는 자신이 담당인 견적만 조회·복구”와 충돌한다.

### 전제 밖에서 확인된 셋째 가능성

레거시에는 다음 두 종류의 Notion 저장이 별도로 존재한다.

- **작성 중 스냅샷**: 웹 폼 전체를 저장하고 같은 웹 폼으로 복원한다. #1092의 “저장한 견적서, 미리보기, 다시 불러오기”에 해당한다.
- **전송 후 이력**: Ecount 판매전표/주문 전송 성공 뒤 전표번호·배송지·품목 등을 저장하고 조회·인쇄한다. 견적 폼으로 되돌리는 기능이 아니다.

종합견적서는 전표 전송 성공 뒤 `saveOrderToNotion(notionCommon, merged)`를 호출한다(`tools/legacy-gas/종합견적서/Code.js:1929`, `:1940`, `:1954`). 주문서도 주문 전송 성공 뒤 별도 `saveOrderToNotion` 경로를 탄다(`tools/legacy-gas/거래처 발송 주문서/Code.js:2351`, `:2373`, `:2385`). 이 문서는 두 번째를 “견적 저장분”으로 섞지 않고, 첫 번째를 정본의 직접 선행 기능으로 판정한다.

## A. 레거시 GAS 원문에서 추출한 실제 동작

### A-1. 종합견적서 — 저장 경로와 Notion에 담긴 것

#### 서버 저장 계약

`saveQuoteSnapshot(payload)`는 로그인 계정 이메일, 직렬화된 폼 상태, 거래처명, 저장시각, 미리보기 이미지를 받는다(`tools/legacy-gas/종합견적서/Code.js:2724`). 원문의 핵심은 다음과 같다.

> `const email = Session.getActiveUser().getEmail();`
>
> `const fullData = payload.data;`
>
> `const custName = payload.summary.custName || '미지정';`
> — `tools/legacy-gas/종합견적서/Code.js:2726-2729`

Notion page의 업무 필드는 정확히 다음과 같다.

- `거래처명`: 저장 화면의 거래처명
- `담당자 계정`: 로그인한 Google 계정 이메일
- `저장일시`: 저장 시각
- `데이터`: 폼 상태 JSON을 담은 본문
- `미리보기1`, `미리보기2`, `미리보기3`: 견적 시각화 이미지 본문

근거 원문은 `"거래처명"`, `"담당자 계정": { email: email }`, `"저장일시"`, `"데이터"`를 만든다(`tools/legacy-gas/종합견적서/Code.js:2754-2759`)고 명시하고, 미리보기 세 필드를 조건부로 추가한다(`:2761-2763`). JSON/base64 변환, 2,000자 분할, Notion API 호출은 저장수단이므로 계승 개수로 세지 않는다. 계승 대상은 위 업무 필드가 표현하는 값과 복원 가능한 상태다.

#### 저장한 폼 상태의 정확한 항목

브라우저의 `takeSnapshot()`은 단순 품목 목록이 아니라 화면 편집 상태 전체를 세 덩어리로 저장한다(`tools/legacy-gas/종합견적서/index.html:16240`).

1. `form`
   - 모든 `input`, `select`, `textarea`의 `id`별 값
   - checkbox는 boolean, radio는 선택된 값
   - 일반 입력은 값 `v`와 글자색이 빨간색인지 나타내는 `l`
   - 근거: `tools/legacy-gas/종합견적서/index.html:16240-16256`
2. `branch`
   - 홈/상업 분기관 UI의 항목별 표시 상태
   - 근거: `tools/legacy-gas/종합견적서/index.html:16258-16269`
3. `core`
   - 수량 map: `homeQty`, `singleQty`, `commQty`, `oldQty`
   - 판매단가 map: `homePrices`, `singlePrices`, `commPrices`, `oldPrices`
   - 정가 map: `homeListPrices`, `singleListPrices`, `commListPrices`, `oldListPrices`
   - 규격 map: `homeSpecs`, `commSpecs`, `oldSpecs`
   - 부품 수량: `singlePartQtys`, `commPartQtys`
   - 홈 수동 잠금값: `homeManualPanel`, `homeManualHose`, `homeManualRemote`, `homeManualBranch`, `homeManualFoot`
   - 상업 수동 잠금값: `commManualPanel`, `commManualHose`, `commManualRemote`, `commManualPump`, `commManualBase`
   - 절대 잠금: `absoluteLock`
   - 할인 상태: `homeDc`, `commDc`
   - 부속 직접입력 상태: `partCustomData`
   - 사용자 추가 행: `customRows`
   - 사용자 추가 행의 최종 순서/해시: `customFinalOrder`, `customFinalHash`
   - 근거: `tools/legacy-gas/종합견적서/index.html:16373-16416`

중첩 항목도 업무 데이터다.

- `partCustomData`: single/comm의 부속별 `q`, `qL`, `p`, `pL`, `spec`, `sL` — 수량·단가·규격과 각 강조 상태(`tools/legacy-gas/종합견적서/index.html:16271-16310`)
- `homeDc`, `commDc`: 모델별 고정 할인값과 변동 할인 checkbox(`tools/legacy-gas/종합견적서/index.html:16312-16340`)
- `customRows`: 구역(home/single/comm/old), 이름, 모델, 정가, 규격, 수량, 단가, 고정/변동 할인(`tools/legacy-gas/종합견적서/index.html:16342-16371`)

즉 완전계승의 데이터 기준은 “최종 합계만 같다”가 아니다. 저장 당시의 입력값, 수량·단가·정가·규격, 할인 방식, 수동 잠금, 사용자 행, 표시/강조 상태가 복원 후 같은 계산과 표현값을 내야 한다. 레이아웃·색·컴포넌트는 바뀔 수 있지만, 인쇄 결과는 개발책임자 정의대로 legacy 100% 일치가 별도 합격조건이다.

#### 조회·미리보기·복원

`getQuoteHistory`는 로그인 이메일과 정확히 같은 `담당자 계정`만 조회한다.

> `{ property: "담당자 계정", email: { equals: userEmail } }`
> — `tools/legacy-gas/종합견적서/Code.js:2794-2798`

기간 필터와 저장일시 내림차순을 적용하고(`tools/legacy-gas/종합견적서/Code.js:2800-2805`, `:2824-2827`), 각 건의 `id`, `created`, `custName`, `data`, `image`를 반환한다(`:2844-2867`). 거래처명 검색도 **같은 로그인 이메일 조건**과 거래처명 부분일치를 함께 사용한다(`getQuoteHistoryByCustomer`, `:2879`, `:2882-2896`)며 최근 30건을 반환한다(`:2917-2933`).

미리보기는 현재 폼의 구조화 견적 품목·합계·인쇄값으로 이미지를 만들어 저장한다(`tools/legacy-gas/종합견적서/index.html:17087-17100`, `:17165-17225`). 복원은 원문 그대로 “현재 내용을 지우고 해당 견적으로 복원”하는 동작이다(`:16428-16429`). `form`, `core`, 사용자 행, 할인, 부속, 분기관, 잠금값을 다시 적용한 뒤 재계산한다(`:16431-16951`). 이는 soft-delete 취소가 아니라 **웹 작성 화면으로 작업 상태를 다시 불러오기**다.

#### 레거시의 “담당자” 의미

스냅샷 저장·조회에서 `담당자 계정`은 별도 배정 가능한 직원 필드가 아니라 `Session.getActiveUser().getEmail()`로 얻은 **저장자/소유자 이메일**이다(`tools/legacy-gas/종합견적서/Code.js:2726`, `:2756`, `:2793-2798`). 담당 변경 API나 UI는 없다.

한편 판매전표 전송 데이터에는 별도의 화면 입력 `manager`/Ecount `EMP_CD`가 존재한다. 전송 후 이력 Notion에는 `담당자`가 select 값으로 저장된다(`tools/legacy-gas/종합견적서/Code.js:2371-2386`). 이것은 스냅샷 소유 이메일과 다른 개념일 가능성이 높으며, 둘을 동일 직원 키라고 추론할 수 없다.

### A-2. 주문서 — 저장 경로와 Notion에 담긴 것

#### 서버 저장 계약

`saveOrderSnapshot(payload)`는 직렬화 상태, 미리보기, 거래처명, 주제, 사업자/거래처 식별값, 저장시각을 받는다(`tools/legacy-gas/거래처 발송 주문서/Code.js:105-113`). Notion 업무 필드는 정확히 다음과 같다.

- `거래처명`
- `거래처코드`: 프런트의 `bizNo`
- `주제`: 사용자가 붙인 저장 주제
- `저장일시`
- `데이터`: 폼 상태 JSON
- `미리보기1`, `미리보기2`, `미리보기3`

근거: `tools/legacy-gas/거래처 발송 주문서/Code.js:131-141`.

#### 저장한 폼 상태의 정확한 항목

`takeSnapshot()`은 다음을 저장한다(`tools/legacy-gas/거래처 발송 주문서/index.html:8769`).

- `form`: 모든 `input`, `select`, `textarea`의 `id`별 값. checkbox는 boolean, radio는 선택값, 나머지는 문자열 값(`:8770-8781`)
- `branch`: 홈/상업 분기관 UI 표시 상태(`:8783-8786`)
- `core`: `homeQty`, `singleQty`, `commQty`, `oldQty`, `absoluteLock`(`:8788-8794`)
- 공통 메타: `timestamp`, `form`, `branch`, `core`(`:8796-8801`)

저장 미리보기의 품목 표현 필드는 `품목`, `모델명`, `단위`, `수량`, `단가`, `소계`이며 구조화/집계된 전송 행을 사용한다(`tools/legacy-gas/거래처 발송 주문서/index.html:8878-8924`). 요약값은 `custName`, `bizNo`, `theme`다(`:8860-8871`).

#### 조회·미리보기·복원

`getOrderSnapshotHistory`는 `거래처코드 == bizNo`로 조회한다.

> `{ property: "거래처코드", rich_text: { equals: String(bizNo) } }`
> — `tools/legacy-gas/거래처 발송 주문서/Code.js:169-180`

저장일시 내림차순을 적용하고(`:198-201`) `id`, `created`, `custName`, `theme`, `data`, `image`를 반환한다(`:218-245`). 웹은 현재 사업자번호를 넘겨 이력을 불러오며(`tools/legacy-gas/거래처 발송 주문서/index.html:9164-9197`), 각 행에 미리보기와 복원 버튼을 표시한다(`:9199-9239`). 복원은 “현재 내용을 지우고 해당 주문으로 복원”하고(`:9060-9061`) 폼, 수량 map, 분기관, 잠금값을 다시 적용한 뒤 재계산한다(`:9062-9124`).

#### 레거시의 “담당자” 의미

주문서 스냅샷에는 직원 담당자/저장자 이메일 필드가 없다. 조회 경계는 외부 거래처의 `bizNo`를 `거래처코드`에 저장한 **거래처 소유권**이다. 그러므로 정본의 “주문서를 사용하는 외부 거래처 견적의 담당”은 레거시 스냅샷만으로 employees의 어느 필드인지 정할 수 없다.

### A-3. 전송 후 이력은 별도 데이터다

혼동 방지를 위해 전송 후 Notion 이력의 필드도 구분해 기록한다.

- 종합견적서 전송 후 이력: 출고일, 전표번호, 거래처코드/명, 담당자, 출고창고, 배송주소, 감리주소, 사업자주소, 대표번호, 인수자 번호, 특이사항, 결제예정일, 사용자계정, 생성날짜, 품목데이터(`tools/legacy-gas/종합견적서/Code.js:2371-2386`).
- 주문서 전송 후 이력: 거래처명/코드, 전표번호, 배송주소, 현장주소, 인수자 번호, 특이사항, 품목데이터, 선택적 출고희망일/결제예정일(`tools/legacy-gas/거래처 발송 주문서/Code.js:3249-3276`).

이 경로는 전송 결과 조회·인쇄를 위한 것이고 `applySnapshot`으로 견적/주문 작성 화면을 복원하지 않는다. #1092에서 이것도 견적서 메뉴에 보여야 하는지는 개발책임자 확인이 필요하다.

## B. 현재 Samhan Public 견적서 메뉴

### B-1. 화면·라우트·API·엔티티

| 층 | 현재 구현 | 근거 |
|---|---|---|
| 데스크톱 라우트 | 목록 `/sales/estimates`, 신규, 상세, 편집, 인쇄 | `clients/desktop/src/renderer/routes/index.tsx:490-500`, `:548-552` |
| 목록 화면 | `listEstimates`로 `estimates` 50건을 상태/기간 기준 조회하고 거래처명·번호를 클라이언트 필터 | `clients/desktop/src/renderer/routes/EstimateListPage.tsx:75-120` |
| 목록 표시 | 견적번호, 거래처 사업자번호/명, 유효기간, 금액, 상태. 출처와 담당자 열 없음 | `clients/desktop/src/renderer/routes/EstimateListPage.tsx:130-234` |
| 데스크톱 API | 목록/상세/생성/수정/상태/판매전표 전환/soft-delete/restore | `clients/desktop/src/renderer/api/estimateApi.ts:218-314` |
| 백엔드 API | `/slips/estimates`; 목록 필터는 status, partnerId, dateFrom/dateTo뿐 | `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/web/EstimateController.java:64`, `:76-95` |
| 엔티티 | `estimates`: 견적번호/일자/상태, 거래처 UUID·명·사업자번호·주소, 유효일, 세액/합계, 변환 전표, 메모, 요청자 UUID | `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/domain/Estimate.java:56-61`, `:76-149` |
| 목록 SQL | status/partner/date/deleted 조건만 있고 requester/source/assignee 조건 없음 | `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/repository/EstimateRepository.java:58-80` |
| 종합견적서 저장소 | `quote_snapshots`: author email, participant emails, 거래처명, JSON 상태, 공급가/부가세/총액, 저장시각 | `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/snapshot/domain/QuoteSnapshot.java:22-62`, `:94-100` |
| 주문서 저장소 | `partner_order_drafts`: partner code, 거래처별 순번, 라벨, payload JSON, 30일 만료 | `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrderDraft.java:18-24`, `:39-57` |

`estimates`, `quote_snapshots`, `partner_order_drafts` 사이에 공통 견적 ID나 origin/source foreign key가 없다. `estimates`에는 `requester_id`만 있고 배정 가능한 담당자 필드는 없다. `quote_snapshots.participant_emails`도 신규 생성 시 항상 작성자 한 명만 들어가며(`QuoteSnapshot.java:64-81`) 담당 변경 메서드가 없다. 주문서 draft도 직원 키가 없다.

### B-2. 현재 조회 범위·권한

#### 데스크톱 견적서 메뉴

- 라우트는 `estimates.list` VIEW 권한으로 보호된다(`clients/desktop/src/renderer/routes/index.tsx:493-497`).
- 컨트롤러도 동적 권한을 확인하지만(`EstimateController.java:76-95`), 호출자/요청자 ID를 서비스에 넘기지 않는다.
- 서비스 목록은 호출자와 무관하게 공통 검색을 실행한다(`services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateService.java:444-453`).
- 따라서 권한을 가진 직원은 `estimates`의 전체 활성/삭제포함 검색 결과를 볼 수 있고, “자신이 담당인 것만”이라는 행 단위 범위는 없다.
- 반대로 종합견적서/주문서 웹 저장분은 이 메뉴 쿼리에 아예 포함되지 않는다.

#### 종합견적서 웹

- 서버 서비스는 `userEmail`이 없으면 전체 활성 목록을 반환한다(`QuoteSnapshotService.java:56-70`).
- 현재 웹의 `getQuoteHistory`와 거래처별 조회는 URL에 `userEmail`을 넣지 않는다(`clients/web/estimate-app/lib/code.js:2493-2521`).
- RPC가 인증 이메일을 강제로 결합하는 함수 집합에는 저장 함수만 있고 조회 함수는 없다(`clients/web/estimate-app/routes/rpc.js:39-46`).
- UI는 반환된 모든 작성자의 `authorEmail`과 복원 버튼을 표시하고 그대로 `applySnapshot`한다(`clients/web/estimate-app/views/index.ejs:17859-17895`).

따라서 **현재 종합견적서 웹은 타 작성자의 견적도 조회·메모리 복원 가능**하다. 기존 행 수정은 서비스가 작성자 이메일 exact match로 막지만(`QuoteSnapshotService.java:43-53`), “조회·복구” 자체는 막지 않는다.

#### 주문서 웹

- draft API는 `X-Partner-Code` 범위로 저장/목록/상세를 처리한다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderDraftController.java:51-90`).
- 컨트롤러 주석과 서비스 계약은 “본인 거래처만”을 명시한다(`:63-77`).
- 웹 RPC는 `saveOrderSnapshot`과 `getOrderSnapshotHistory`를 이 draft API에 연결한다(`clients/web/order-app/src/samhanApi.ts:350-358`).
- 현재 주문서 화면은 상태 저장·미리보기·복원을 유지한다(`clients/web/order-app/index.html:9147`, `:9363`, `:9439`, `:9589-9592`).

이는 직원 담당자 기준이 아니라 거래처 코드 기준 self-service다.

### B-3. 판매전표 전환과 웹 재개 경로

1. **`estimates` → 판매전표 직접 전환: 있음.** 데스크톱 API는 `POST /slips/estimates/{id}/convert`를 호출한다(`clients/desktop/src/renderer/api/estimateApi.ts:299-305`). 서비스는 허용 상태와 중복 전환을 검증한 뒤 Slip을 만든다(`services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateService.java:315-338`). 상세 화면에도 전환 버튼과 결과 전표 이동이 있다(`clients/desktop/src/renderer/routes/EstimateDetailPage.tsx:129-146`, `:586-596`).
2. **종합견적서 웹 → 판매전표: 있음.** 웹 bridge가 견적 표현값을 `PublishFromEstimateRequest`로 매핑하고(`clients/web/estimate-app/lib/slip-bridge.js:72-140`) `/internal/slips/from-estimate`로 전송한다(`:143-169`). 저장 스냅샷을 웹에서 복원한 뒤 같은 발행 흐름을 사용할 수 있다. 다만 통합 메뉴에서 해당 웹으로 hand-off하는 경로는 없다.
3. **`estimates` → 거래처 주문 백엔드: 있음.** `POST /api/v1/partner-orders/from-estimate/{estimateId}`가 존재한다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderFromEstimateController.java:20-43`). 데스크톱 견적서 화면에서 이 API를 호출하는 UI는 검색되지 않았다.
4. **주문서 draft → 주문 생성: 있음.** 주문서 RPC의 `sendOrderFromUi`는 draft 생성 후 confirm 경로를 사용한다(`clients/web/order-app/src/samhanApi.ts:360-378`). 통합 메뉴에서 주문서 웹으로 저장 상태를 넘기는 경로는 없다.

### B-4. 미리보기와 “다시 불러오기”

- 데스크톱 `estimates`에는 상세/편집/인쇄가 있으나 이는 `Estimate` 정규화 레코드를 보는 기능이다. 종합견적서/주문서 웹 스냅샷 미리보기나 원래 폼 복원은 아니다.
- 목록의 “복원”은 삭제 견적의 `deleted_at`/soft-delete를 취소하는 기능이다(`clients/desktop/src/renderer/routes/EstimateListPage.tsx:252-268`, `:399-412`; `EstimateController.java:197-203`). 레거시 `applySnapshot`의 웹 폼 재개와 의미가 다르다.
- 종합견적서 DB는 JSON 상태를 보존해 재오픈은 가능하지만, V100에서 `preview_image`를 명시적으로 제거했다(`services/slip-service/src/main/resources/db/migration/V100__normalize_quote_snapshot_json_owner_totals.sql:22-28`). 현재 UI는 여전히 `item.image`가 있을 때만 미리보기 버튼을 보이므로 모든 신규 DB 행에서 “없음”이 된다(`clients/web/estimate-app/views/index.ejs:17869-17883`).
- 주문서 draft는 payload에 이미지 포함을 허용하고(`PartnerOrderDraft.java:23-24`, `:51-53`) 현재 웹에서 미리보기·복원이 가능하다.

## C. 정본 대비 갭 표

판정 기준: **대** = 핵심 데이터 모델/API/UI 또는 보안 경계 신설 필요, **중** = 기반 경로는 있으나 통합·handoff·표현 보완 필요, **소** = 국소 배선/표현 차이. 다른 화면에 흩어진 기능은 통합 메뉴 완성으로 세지 않았다.

| 정본 요구 | 현재 상태 | 근거(파일:줄 또는 SQL) | 갭 크기 |
|---|---|---|---|
| 종합견적서 저장분 표시 | **미대응** — 웹 `quote_snapshots`에는 저장되나 데스크톱 메뉴는 `estimates`만 조회 | `clients/desktop/src/renderer/routes/EstimateListPage.tsx:75-100`; `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/snapshot/domain/QuoteSnapshot.java:22-62`; 두 저장소 연결/union 없음 | 대 |
| 주문서 저장분 표시 | **미대응** — `partner_order_drafts`는 주문서 웹 전용 | `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderDraftController.java:38-90`; 데스크톱 `/sales/estimates` 쿼리는 `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/repository/EstimateRepository.java:58-80` | 대 |
| 미리보기 | **부분 대응/메뉴 미대응** — `estimates` 상세·인쇄와 주문서 draft 이미지는 있으나 양쪽 저장분 통합 미리보기 없음. 종합견적서 preview 컬럼은 제거됨 | `clients/desktop/src/renderer/routes/index.tsx:548-552`; `services/slip-service/src/main/resources/db/migration/V100__normalize_quote_snapshot_json_owner_totals.sql:22-28`; `clients/web/estimate-app/views/index.ejs:17876-17903` | 대 |
| 다시 불러오기 | **부분 대응/메뉴 미대응** — 각 웹 자체 복원은 있으나 메뉴에서 원래 웹으로 복구 불가. 메뉴 “복원”은 soft-delete 취소 | legacy 종합 `tools/legacy-gas/종합견적서/index.html:16428-16951`; current 종합 `clients/web/estimate-app/views/index.ejs:17890-17895`; 메뉴 `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/web/EstimateController.java:197-203` | 대 |
| 본사: 양쪽 전부 조회 | **미대응** — 어느 API도 두 저장소를 합치지 않음 | `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/web/EstimateController.java:76-95`; `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/snapshot/web/QuoteSnapshotController.java:82-106`; `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderDraftController.java:67-90` | 대 |
| 본사: 담당 변경 가능 | **미대응** — 세 엔티티 모두 변경 가능한 공통 담당자 컬럼/API 없음 | `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/domain/Estimate.java:76-149`; `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/snapshot/domain/QuoteSnapshot.java:36-43`, `:84-92`; `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrderDraft.java:39-57` | 대 |
| 웹: 자신이 담당인 것만 조회·복구 | **불일치** — 주문서는 거래처 단위 충족. 종합견적서는 현재 작성자 필터를 생략해 전체 작성자 조회·복원 가능. 직원 “담당” 모델은 없음 | `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/snapshot/service/QuoteSnapshotService.java:56-70`; `clients/web/estimate-app/lib/code.js:2493-2521`; `clients/web/estimate-app/views/index.ejs:17878-17895`; `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderDraftController.java:63-90` | 대 |
| 종합견적서↔주문서 담당 교차변경 불가 | **판정/강제 불가** — 출처와 공통 담당자 자체가 없음 | `estimates` 컬럼 SQL `services/slip-service/src/main/resources/db/migration/V13__add_estimate.sql:26-56`; `quote_snapshots`/`partner_order_drafts` 엔티티; D절 source/assignee 컬럼 0개 | 대 |
| 견적 → 판매전표 전환 | **부분 대응** — `estimates`와 종합견적서 웹 직접 발행은 있음. 양쪽 웹 저장분을 통합 메뉴에서 전환하는 경로는 없음 | `clients/desktop/src/renderer/api/estimateApi.ts:299-305`; `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateService.java:315-338`; `clients/web/estimate-app/lib/slip-bridge.js:143-169` | 중 |
| 견적 → 종합견적서 경유 판매전표 생성 | **부분 대응** — 종합견적서 자체 복원 후 발행 가능하나 메뉴 hand-off와 담당 범위 통제가 없음 | `clients/web/estimate-app/views/index.ejs:17890-17895`; `clients/web/estimate-app/lib/slip-bridge.js:72-169`; 메뉴와 snapshot 연결 없음 | 중 |
| 견적 → 주문서 경유 주문서 생성 | **부분 대응** — 주문서 draft 복원·confirm 및 `estimates`→주문 백엔드는 있으나 메뉴→주문서 웹 hand-off UI 없음 | `clients/web/order-app/src/samhanApi.ts:350-378`; `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderFromEstimateController.java:20-43`; FE 소비처 검색 결과 없음 | 중 |

### 인쇄 100% 일치 조건

현재 데스크톱 `QuoteView`, 종합견적서 웹 인쇄, 주문서 웹 인쇄는 서로 다른 상태/화면 경로다. 통합 메뉴가 두 출처를 preview/hand-off할 때 다음을 별도 golden 판정해야 한다.

- 저장 당시 품목·모델·단위·수량·단가·소계와 합계
- 종합견적서의 정가/할인/규격/부속/사용자 행/수동 잠금이 인쇄 계산에 미치는 결과
- 주문서의 주제·거래처 표시와 집계 행
- 각 출처별 legacy 인쇄 양식의 100% 일치

현재 통합 메뉴가 원본 snapshot을 읽지 않으므로 이 조건은 **미검증이며 충족으로 판정할 수 없다**.

## D. 실 데이터 실측

### D-1. 측정 조건

- 2026-08-07 현재 실행 중인 로컬 개발 DB 컨테이너에 읽기 전용 `SELECT`만 수행했다.
- 운영 DB 표본이 아니므로 규모/품질을 운영으로 일반화하지 않는다.
- 행이 0이면 “구현 불필요”로 보지 않고 “실데이터 판정 불가”로 판정한다.

### D-2. `slip_db.estimates`

요청 SQL의 결과:

```sql
SELECT count(*) FROM estimates WHERE deleted_at IS NULL;
-- 2,017
```

현재 엔티티의 실제 soft-delete 플래그 기준도 활성 2,017건이며 전체 2,024건, 삭제 7건이다. 활성 상태 분포는 `QUOTE_DRAFT` 2,016건, `QUOTE_ACCEPTED` 1건이다. `converted_slip_id`가 채워진 활성 행은 0건이므로 **코드상 전환 경로의 존재는 확인되지만 실데이터 전환 성공 이력은 이 표본에서 판정 불가**다.

#### 출처 분포

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'estimates'
  AND (column_name ILIKE '%source%'
    OR column_name ILIKE '%origin%'
    OR column_name ILIKE '%manager%'
    OR column_name ILIKE '%assignee%'
    OR column_name ILIKE '%owner%');
-- 0 rows
```

따라서 2,017건을 “종합견적서 유래/주문서 유래/데스크톱 직접 작성”으로 나누는 것은 **표본 부족이 아니라 식별 컬럼 부재로 판정 불가**다. `quote_snapshots`나 `partner_order_drafts`로 연결하는 FK도 없다.

#### 조인 키 충족률

| 키 | 활성 채움 | 비율 | 실제 대상 일치 |
|---|---:|---:|---:|
| `partner_id` | 90 / 2,017 | 4.46% | distinct 7개 모두 `partner_db.partners` 활성 행과 일치 |
| `partner_business_no` | 2,000 / 2,017 | 99.16% | 정규화 distinct 24개 모두 활성 거래처의 사업자번호와 일치 |
| `requester_id` | 2,017 / 2,017 | 100.00% | distinct 3개 모두 `user_db.employees.account_id`와 일치 |

거래처 키 조합은 `partner_id`·사업자번호 둘 다 있음 73건, 사업자번호만 1,927건, UUID만 17건, 둘 다 없음 0건이다. 따라서 현 데이터에서 거래처 표시/조인은 UUID 단독으로 설계하면 95.54%를 놓친다. 반대로 사업자번호 정규화 조인은 99.16%를 커버하며 UUID-only 17건에 대한 fallback이 필요하다. 이는 설계안이 아니라 현재 데이터의 충족률 관찰이다.

`requester_id`는 직원 account UUID와 100% 이어지지만 이것을 정본의 변경 가능한 “담당”이라고 볼 근거는 없다. 현재 의미는 생성 요청자다.

#### 견적 라인 품목 키

활성 견적 라인 2,058건에서 `product_id`, `model_name`, `product_name`은 각각 100% 채워졌다. 그러나 distinct product UUID 29개 중 26개만 현재 활성 `product_db.products`와 일치했다. 불일치 3개가 61개 라인, `line_total` 합계 6,450,000원을 차지한다.

| 불일치 모델 | 라인 | `line_total` 합계 |
|---|---:|---:|
| `QA797-PART-01` | 30 | 4,565,000 |
| `QA797-PART-02` | 29 | 1,595,000 |
| `QA797-GEN-01` | 2 | 290,000 |

즉 “컬럼 100% 채움”만으로 안전하지 않다. 현재 로컬 표본의 불일치는 QA fixture 잔존 가능성이 있어 운영 결함으로 단정하지 않지만, UI가 product master inner join에만 의존하면 금액/행 소실 가능성이 있다.

#### 종합견적서 웹 저장분

`quote_snapshots` 활성 행은 1건이다. `author_email`, `participant_emails`, `cust_name`, `total_amount`는 모두 1/1 채워졌고 작성자 이메일은 `user_db.employees.email`과 일치했다. 표본 1이므로 권한/담당 변경의 실사용 분포는 판정 불가다.

### D-3. `partner_order_db.partner_order_drafts`

- 전체 2,003건
- 활성(`is_deleted = false`) 9건
- 활성·미만료 9건
- `partner_code`, `payload_json` 채움: 9/9, 100%
- 직원 담당/source 컬럼: 없음

활성 draft의 거래처 코드 분포는 `2118712345` 5건, `000011111111` 3건, `1068689215` 1건이다. `partner_db.partners.partner_code` 또는 정규화 사업자번호와 실제 일치한 것은 4/9건(44.44%), 불일치는 5/9건(55.56%)이다. 따라서 주문서 저장분을 본사 목록에 붙일 때 `partner_code`가 채워졌다는 사실만으로 거래처명이 안전하게 복원된다고 볼 수 없다.

또한 draft에는 30일 TTL이 있다(`PartnerOrderDraft.java:55-57`). 정본의 “웹에서 저장한 견적서들을 표시”가 영구 이력을 뜻한다면 현재 만료 정책과 충돌할 수 있다.

### D-4. 실측 판정 요약

| 판정 대상 | 실측 결론 |
|---|---|
| `estimates` 표본 | 2,017건 — 표본 0 아님 |
| 출처별 분포 | source/origin 컬럼이 없어 판정 불가 |
| 담당자 채움률 | assignee/manager 컬럼이 없어 판정 불가; `requester_id`는 100%이나 생성자 의미 |
| 거래처 조인 | `partner_id` 4.46%, 사업자번호 99.16%; 둘을 구분한 fallback 필요 |
| 품목 조인 | 키는 100% 채움이나 61라인/6,450,000원이 현재 master와 불일치 |
| 종합견적서 snapshot | 활성 1건 — 존재 확인, 분포 판정에는 부족 |
| 주문서 draft | 활성 9건, 거래처 master 실제 일치 44.44% |

## E. 개발책임자 확인 질문

아래는 업무 의미가 코드/레거시에서 확정되지 않아 설계에 추론해서 넣으면 안 되는 항목이다.

1. 정본의 **“담당”**은 `employees.account_id`, employee row UUID, 로그인 이메일, Ecount `EMP_CD`, 또는 별도 영업담당 코드 중 무엇인가? 레거시 종합견적서 snapshot의 담당자 계정은 저장자 이메일이고, 판매전표의 담당자는 별도 값이다.
2. 담당 변경 후에도 원작성자/외부 거래처는 감사값으로 별도 보존해야 하는가? 즉 `created_by`와 `assignee`를 분리하는 것이 맞는가?
3. “본사” 전체 조회 권한의 정확한 역할은 `MASTER`/`MANAGER`만인가, `SALES`와 `ACCOUNTANT`도 포함하는가?
4. “웹에서는 자신이 담당인 견적들만 조회 및 복구”에서 종합견적서 직원은 employee 담당자 기준, 주문서 외부 사용자는 partner code 기준으로 서로 다른 소유 경계를 유지하는가?
5. **“복구”**는 레거시처럼 웹 작성 폼으로 불러오기인가? 데스크톱이 쓰는 soft-delete 복원은 별도 용어로 분리해도 되는가?
6. “종합견적서의 견적과 주문서의 견적을 서로 담당을 변경 불가”는 (a) 출처 타입 자체를 바꿀 수 없음, (b) 직원 담당자와 외부 거래처 담당자 풀 사이 교차 배정 금지, (c) 두 의미 모두 중 어느 것인가?
7. 주문서 유래 견적의 최초 직원 담당자는 어디서 정하는가? 거래처 master의 기존 담당, 로그인 partner와 매핑된 영업담당, 저장 시 선택값 중 어느 것이 정본인가?
8. 메뉴의 “견적 → 판매전표 전환”은 원본 snapshot을 직접 변환해야 하는가, 반드시 원래 종합견적서 웹을 열어 사용자가 확인한 뒤 발행하는 선택지도 동등한가?
9. “견적 → 주문서 경유 주문서 생성”에서 종합견적서 출처도 주문서 웹으로 보낼 수 있는가, 아니면 주문서 출처만 자기 웹으로 재개할 수 있는가?
10. 주문서 draft의 현재 30일 TTL은 정본의 견적 이력 보존기간과 맞는가? 만료된 1,994건과 향후 만료분을 메뉴에서 제외해도 되는가?
11. 레거시의 **전송 후 Notion 이력**도 견적서 메뉴 대상인가, 아니면 작성 중 snapshot만 대상인가?
12. 기존 `estimates` 2,017건에는 출처가 없다. 신규부터만 source를 강제할지, 과거 행을 `DESKTOP/UNKNOWN`으로 두어 표시할지 결정이 필요하다.
13. 종합견적서 신규 snapshot은 미리보기 이미지를 저장하지 않는다. 정본의 미리보기는 (a) JSON에서 실시간 렌더링, (b) 저장 당시 인쇄 결과 이미지/PDF 고정본 중 어느 것인가? 인쇄 100% 일치를 위해 둘 다 필요한가?
14. 거래처 master와 불일치한 주문서 draft 5건 및 product master와 불일치한 61라인은 목록에서 원문 fallback 표시할지, 오류 상태로 격리할지 정책 확인이 필요하다.

## 최종 판정

#1092는 기존 `estimates` 목록에 열 몇 개를 추가하는 수준이 아니다. 현재는 **세 가지 서로 다른 저장 모델과 세 가지 소유 경계**가 있다.

```text
데스크톱 Estimate       : requester UUID / 정규화 견적 / 직접 판매전표 전환
종합견적서 QuoteSnapshot: author email / 전체 웹 상태 JSON / 웹 복원·판매전표 발행
주문서 PartnerOrderDraft: partner code / 전체 웹 상태+미리보기 / 웹 복원·주문 확정 / 30일 TTL
```

정본을 만족하려면 최소한 출처를 보존한 통합 조회 모델, 원작성자와 변경 가능한 담당자의 분리, 본사/웹 각각의 행 단위 권한, 출처별 원래 웹 hand-off, 전환 idempotency, legacy 인쇄 golden이 필요하다. 다만 구체 데이터 모델은 E절 질문 답변 전에는 확정하면 안 된다.
