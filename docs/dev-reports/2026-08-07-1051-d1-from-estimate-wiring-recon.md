# PR #1082 / 이슈 #1051 — D1 견적 → 거래처 주문서 전환 배선 정찰

- 정찰일: 2026-08-07 KST
- 작업트리: `C:\dev\Samhan-Public\.claude\worktrees\t1051`
- 브랜치 / 조사 시작 HEAD: `fix/1051-slip-product-link-audit` / `1fae6f284`
- 범위: 읽기 전용 정찰. 이 보고서 외 코드·설정·테스트 파일을 만들거나 수정하지 않았다.
- 금지 준수: Docker·DB 쓰기·서비스 재기동·다른 워크트리 접근·`git add/commit/push` 없음.

## 0. 결론

`POST /api/v1/partner-orders/from-estimate/{estimateId}`는 컨트롤러부터 주문 저장·감사·revision·realtime까지 실제로 열려 있다. 그러나 운영 `EstimateClient` bean은 항상 `Optional.empty()`를 반환하고, desktop/mobile/web 호출자는 0건이다. 따라서 현재 실 경로는 항상 404다.

단순히 HTTP client 하나만 붙여서는 이번 목적(`SUPPLY` 권위 지속)을 달성할 수 없다. 견적은 `slip-service`의 `slip_db.estimates` / `estimate_lines`에 살지만, 원천 `estimate_lines`에는 S/V/T 값만 있고 **어느 값이 사용자 입력 권위였는지 나타내는 컬럼·도메인 필드·응답 필드가 없다**. 견적 상세도 거래처 `partnerCode`, 주문 납기일, 주문 라인의 `categoryKey`를 현재 `EstimateClient` 계약 그대로 채울 수 없다.

업무 정의는 일부만 확정됐다. 레거시 `거래처 발송 주문서`에는 거래처가 품목을 골라 견적 미리보기를 확인한 뒤 주문서를 보내는 동일 세션 흐름이 있다. 반면 **저장된 종합견적서/현행 desktop 견적 row를 거래처 주문 row로 직접 복제하는 레거시 기능은 찾지 못했다**. 다만 개발책임자 정의가 기록된 이슈 #1092는 저장 견적을 주문서 웹으로 불러와 주문서를 생성할 수 있어야 한다고 명시한다. 어느 화면에서 어떤 상태 전이로 실행할지는 아직 결정 근거가 없다.

---

## 1. 완성 / 미완성 전수

### 1.1 production 코드

| 영역 | 파일:줄 | 상태 | 확인 내용 |
|---|---|---|---|
| endpoint | `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderFromEstimateController.java:23-43` | **완성** | `/api/v1/partner-orders` + `POST /from-estimate/{estimateId}` = 실제 `POST /api/v1/partner-orders/from-estimate/{estimateId}`. 201, `sales.partner-order.edit` CREATE 권한, 요청자 헤더 전달. |
| gateway route | `services/api-gateway/src/main/resources/application.yml:539-545` | **완성** | `/api/v1/partner-orders/**` 전체가 `partner-order-service`로 라우팅되고 JWT 인증을 탄다. endpoint가 gateway에서 빠진 상태가 아니다. |
| 변환 orchestration | `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderFromEstimateService.java:54-90` | **완성** | active 중복 검사 → snapshot 조회 → 거래처 정체성 확인 → DRAFT 주문/라인 생성 → 합계 → 저장 → 감사로그 → CREATE revision → 목록 realtime 발행. |
| 중복 방지 | 같은 파일 `:56-62`, `:120-123`; `services/partner-order-service/src/main/resources/db/migration/V6__add_partner_order_from_estimate_link.sql` | **완성** | 같은 `source_estimate_id`의 active 주문을 서비스 409와 DB partial unique index로 막는다. |
| 생성 상태 | `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrder.java:240-256` | **완성** | 변환 주문은 `DRAFT`, `slipPublishStatus=NOT_REQUIRED`, `sourceEstimateId`·dueDate·memo를 저장한다. 판매전표 자동 발행은 하지 않는다. |
| 금액 snapshot 포트 | `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/EstimateClient.java:18-48` | **계약만 완성** | header + lines record가 있고 라인은 `supplyAmount/vatAmount/lineTotal/authority`를 받을 수 있다. 구 7인자 fixture 호환 생성자는 네 값을 null로 둔다. |
| 네 권위 분기 | `PartnerOrderFromEstimateService.java:92-111` | **완성** | 금액 snapshot이 전부 없으면 legacy `PRICE`; 하나라도 있으면 `PRICE/SUPPLY/VAT/TOTAL`을 파싱하여 권위 생성기로 보낸다. 잘못된 authority는 예외다. |
| 권위 계산/영속 | `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrderLine.java:112-120`, `:167-229`; `.../db/migration/V17__persist_partner_order_line_amount_authority.sql` | **완성** | 네 권위 계산과 `amount_authority` 저장 계약이 있다. |
| 실제 estimate 조회 구현 | `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/FixtureEstimateClient.java:7-18` | **비어 있음** | 유일한 production 구현. Javadoc에 호출 가능한 endpoint가 없다고 명시하며 `findById()`는 무조건 `Optional.empty()`. HTTP adapter, base URL, timeout, 오류 매핑이 없다. |
| 운영 설정 | `services/partner-order-service/src/main/resources/application.yml:170-177` | **비어 있음** | product/inventory/slip/dc/partner-auth URL은 있으나 estimate 조회용 URL·client 설정은 없다. 같은 물리 서비스인 slip-service URL은 이미 존재한다. |
| FE API caller | 저장소 전역 `rg 'partner-orders/from-estimate|createFromEstimate' clients services --glob '!services/partner-order-service/**'` | **비어 있음** | production caller 0건. 유일한 desktop hit는 문자열 존재를 보는 Playwright 산출물뿐이다. `clients/desktop/src/renderer/api/sales.ts`에도 호출 함수가 없다. |
| desktop control | `clients/desktop/src/renderer/routes/EstimateFormPage.tsx`; R8 보고 `docs/dev-reports/2026-08-07-1051-r8-live-qa.md:136-164` | **비어 있음** | 견적 상세의 기존 변환은 판매전표 변환이다. 거래처 주문서 변환 버튼·mutation·성공 후 이동 경로가 없다. |

### 1.2 source 견적 계약과 adapter가 부딪히는 지점

| 필요한 값 (`EstimateClient`) | 실제 slip-service 견적 | 판정 |
|---|---|---|
| `estimateId` | `EstimateDetailResponse.id` (`.../EstimateDetailResponse.java:13`) | 직접 매핑 가능 |
| `estimateNumber` | `estimateNo` (`:14`) | 직접 매핑 가능 |
| `partnerCode` | 상세 응답에 없음. `partnerId`, `partnerBusinessNo`만 있음 (`:18-20`) | **직접 매핑 불가**. 현재 resolver는 partnerCode+bizCode 둘 다 필수다 (`PartnerOrderPartnerIdentityResolver.java:33-49`). |
| `bizCode` | `partnerBusinessNo` (`EstimateDetailResponse.java:20`) | 의미상 사업자번호 후보이나 이름이 다르므로 adapter 계약 명시 필요 |
| `dueDate` | 견적에는 `validUntil`만 있음 (`:22`) | **업무 의미 불일치**. 견적 유효기한을 주문 납기일로 복사할 근거 없음. |
| `memo` | `memo` (`:31`) | 직접 매핑 가능 |
| line `productId` | `EstimateLineResponse.productId` (`.../EstimateLineResponse.java:11`) | 직접 매핑 가능 |
| `modelCode` | `modelName`만 있음 (`:13`) | 저장소의 모델명=품목코드 표기 결정과 맞을 수 있으나 현 interface 명과의 명시적 adapter 계약 필요 |
| `productName` | `productName` (`:12`) | 직접 매핑 가능 |
| `categoryKey` | 응답에 없음; `specification`만 있음 (`:14`) | **직접 매핑 불가**. null 허용 여부/카탈로그 보강 여부 결정 필요 |
| `quantity` | `quantity` (`:15`) | 직접 매핑 가능 |
| `deliveryPrice` | `unitPriceWithVat`와 `unitPrice`가 공존 (`:16`, `:21-22`) | 주문 `deliveryPrice`가 VAT 포함 단가이므로 후보는 `unitPriceWithVat`; legacy null 정책 필요 |
| `remark` | `note` (`:20`) | 명칭만 다른 직접 후보 |
| S/V/T | `supplyAmount/vatAmount/lineTotal` (`:17-19`) | 값은 직접 매핑 가능 |
| `authority` | 컬럼·entity·response 모두 없음 | **매핑 불가**. 세 값이 모두 저장되므로 값만 보고 PRICE/SUPPLY/VAT/TOTAL 중 하나를 역추론할 수 없다. |

`CreateEstimateRequest.EstimateLineRequest`는 S/V/T 세 값을 받는다(`services/slip-service/.../CreateEstimateRequest.java:32-48`)지만 authority 문자열은 받지 않는다. `EstimateLine.createFromAuthoritativeAmounts`도 세 값을 그대로 저장할 뿐 authority는 보유하지 않는다(`.../EstimateLine.java:210-239`). `V13__add_estimate.sql:85-107`에도 authority 컬럼이 없다. 따라서 GUI에서 SUPPLY를 편집해 저장해도 결과 row만으로 “SUPPLY가 권위였다”는 사실은 소실된다.

### 1.3 테스트가 실제로 덮는 것 / 덮지 않는 것

| 테스트 | 파일:줄 | 덮는 것 | 덮지 않는 것 |
|---|---|---|---|
| from-estimate IT | `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderFromEstimateIT.java:111-221` | mock snapshot 성공 201·DRAFT·2라인·source link·partnerId, not found 404, 중복 409, PARTNER 403, 감사로그 | 실제 HTTP, 실제 slip_db 견적, FE, 네 권위. fixture lines는 구 7인자 생성자(`:224-248`)라 S/V/T/authority가 전부 null이고 PRICE fallback만 간접 통과한다. |
| permission matrix IT | `.../PartnerOrderPermissionControllerIT.java:320-355` | endpoint가 `sales.partner-order.edit` CREATE permission gate를 타는지 | 실제 service/DB/estimate 조회. service 자체를 mock한다 (`:143`, `:201`). |
| revision restore IT | `.../revision/PartnerOrderRevisionRestoreIT.java:187-290` 등 | mock from-estimate 주문 생성 뒤 CREATE/EDIT revision·복원 | 실제 estimate adapter 및 FE |
| 권위 domain unit | `.../domain/PartnerOrderLineSupplyVatTest.java:31-63` | PRICE/SUPPLY/VAT/TOTAL 각각의 S+V=T와 authority 저장 | `PartnerOrderFromEstimateService`가 실제 estimate response에서 authority를 받는지 |
| Playwright | `clients/desktop/playwright/sp-08-4-3-order-delete-and-estimate-convert/...spec.ts` | endpoint/ErrorCode/domain source 문자열 존재와 정적 mock 화면 | 사용자가 견적 화면에서 버튼을 눌러 endpoint까지 가는 E2E. 보고서도 당시 UI를 후속으로 위임했다고 명시 (`docs/dev-reports/sp-08-4-3-order-delete-and-estimate-convert.md:27-35`). |

과거 구현 보고서는 처음부터 이 상태를 명시했다. `docs/dev-reports/sp-08-4-3-order-delete-and-estimate-convert.md:8-12`, `:80-88`은 “임시 fixture 기본 empty, 실제 snapshot은 후속 HTTP client”라고 적고 있다. 즉 현 상태는 배선 회귀가 아니라 **의도적으로 미완인 후속 작업**이다.

---

## 2. 서비스 경계와 가능한 조회 경로

### 2.1 견적의 실제 소유 서비스 / DB

- 소유 서비스: **slip-service**
- 소유 DB: **slip_db**
- 테이블: `estimates`, `estimate_lines`
- 근거:
  - `services/slip-service/src/main/resources/db/migration/V13__add_estimate.sql:24-40`, `:82-107`
  - `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/domain/Estimate.java:56-61`
  - `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/domain/EstimateLine.java:63-67`
- 공개 사용자 조회: `GET /api/v1/slips/estimates/{id}`로 도달하는 controller path (`EstimateController.java:63-66`, `:97-107`). 인증 사용자 + `estimates.list` VIEW 권한을 요구한다.
- **견적 단건용 내부 service-to-service endpoint는 없다.** `/internal/estimates/snapshots`는 웹 종합견적서의 `quote_snapshots`용이며 normalized `estimates/estimate_lines` 조회가 아니다 (`QuoteSnapshotController.java:28-38`).

partner-order-service는 자기 `partner_order_db`만 소유한다(`services/partner-order-service/build.gradle:22-23`, `application.yml:12`). service-per-DB 원칙상 slip_db를 직접 조회해서는 안 된다.

### 2.2 허용 가능한 경로

1. **동기 내부 API — 가장 좁은 배선 후보**
   - slip-service에 normalized 견적 → 주문 snapshot 전용 내부 GET을 두고 `X-Internal-Token`으로 보호한다.
   - partner-order-service의 실제 `EstimateClient` adapter가 기존 load-balanced `slip-service` 호출 패턴과 timeout/error mapping을 사용한다.
   - 장점: 현 endpoint의 동기 201/404/409 UX와 맞고, 한 트랜잭션 시작 전에 최신 견적 snapshot을 얻을 수 있다.
   - 대가: 두 서비스 계약·내부 endpoint·adapter·오류/timeout 테스트가 필요하다. 또한 아래 authority/partnerCode/dueDate 의미를 먼저 결정해야 한다.

2. **이벤트 기반 local projection**
   - slip-service가 견적 생성/수정/삭제/상태변경 이벤트를 발행하고 partner-order-service가 자기 DB에 read model을 유지한다.
   - 장점: runtime 결합과 조회 장애를 줄인다.
   - 대가: outbox, replay, 순서·중복·삭제·schema version, eventual consistency를 새로 설계해야 한다. 단일 버튼 동기 전환에 비해 범위가 크며 이번 PR의 즉시 배선에는 과하다.

3. **기존 공개 GET을 사용자 권한으로 재호출**
   - 기술적으로 `/api/v1/slips/estimates/{id}`는 존재한다.
   - 그러나 서비스가 사용자 JWT/identity와 `estimates.list` VIEW를 대리 전달하는 정책이 없고, 응답 계약도 주문 snapshot에 필요한 필드가 모자란다. service-to-service 정본으로 채택됐다는 명시적 계약이 없다.

4. **cross-DB 직접 조회**
   - **금지**. 제안 대상이 아니다.

내부 API가 가장 작은 기술 경로라는 것은 확인할 수 있지만, endpoint payload는 업무 결정 없이 확정할 수 없다. 특히 authority를 원천에 영속하지 않으면 내부 API를 추가해도 SUPPLY 지속은 검증할 수 없다.

---

## 3. 업무 정의 — 근거 자격별 판정

### 3.1 [① 레거시 원문] 거래처 발송 주문서의 실제 흐름

확정:

- 사용 안내가 품목 수량 입력 → `견적/주문하기` → 미리보기의 `주문하기`라고 직접 적는다.
  - `tools/legacy-gas/거래처 발송 주문서/index.html:675-682`
- 실제 버튼도 `견적/주문하기` → 주문서 미리보기의 `주문하기` → 최종 `주문서 발송`이다.
  - 같은 파일 `:710`, `:1003-1035`, `:1180`
- tutorial 원문도 같은 순서를 고정한다.
  - 같은 파일 `:9533-9536`
- 최종 전송은 현재 화면에서 `buildSendRows()`로 품목을 다시 만들고 `sendOrderFromUi(items, order)`를 호출한다.
  - 같은 파일 `:6352-6423`
- 서버는 이카운트 `saleorder` endpoint로 `SaleOrderList`를 전송한다.
  - `tools/legacy-gas/거래처 발송 주문서/Code.js:1953-1981`, `:2230-2244`
- 메일 원문은 “`${cName}님께서 이카운트 주문서를 발송`”, “출고요청 주문서”라고 한다.
  - 같은 파일 `:2291-2344`

판정:

- 이 문서에서 견적 미리보기와 주문서는 **같은 거래처 세션의 선택 데이터**를 연속 사용한다.
- 방향은 `삼한 → 거래처` 발주서가 아니라, **거래처가 삼한에 보내는 출고요청/판매주문**이다. UI와 카탈로그는 삼한이 제공하지만 제출 행위의 주체는 거래처다.
- 그러나 persisted 견적 ID를 받아 기존 주문 row를 만드는 변환은 아니다. 미리보기와 주문 전송 사이에 저장된 견적 식별자·상태 전이가 없다. **[근거 없음]** 레거시에는 저장 견적 ID를 직접 거래처 주문으로 바꾸는 기능의 근거가 없다.

### 3.2 [① 레거시 원문] 종합견적서의 주문/전표 흐름

확정:

- 종합견적서의 서버 함수 주석은 `주문전송`이지만 실제 전송 URL은 `/proxy/ecount/sale`이고 payload는 `SaleList`다.
  - `tools/legacy-gas/종합견적서/Code.js:1761-1768`, `:1841-1909`, `:1911-1927`
- 성공 후 기록도 `slipNo`를 추출하고 “전표발송 내역”으로 저장한다.
  - 같은 파일 `:1924-1955`, `:2335-2341`
- 견적 저장은 별도 `saveQuoteSnapshot` → Notion page POST이고 주문/전표와 견적 ID를 연결하지 않는다.
  - 같은 파일 `:2723-2786`

판정:

- 레거시 종합견적서의 “주문전송”은 현행 명칭으로 **판매전표 생성**에 해당한다. 거래처 주문서 생성 근거로 사용할 수 없다.
- 저장된 종합견적서를 거래처 주문서로 직접 변환하는 버튼/함수는 `tools/legacy-gas/종합견적서/{Code.js,index.html}`에서 찾지 못했다.

### 3.3 [② 명시적 계약] 현행 코드가 단정하는 것

확정:

- `PartnerOrderFromEstimateService` Javadoc은 “견적 snapshot을 거래처 주문으로 변환”한다고 단정한다 (`:26-28`).
- controller는 “외부 estimate-service UUID를 주문으로 변환”, “견적 snapshot을 partner-order-service 주문 row로 변환”이라고 단정한다 (`PartnerOrderFromEstimateController.java:20-35`).
- 같은 견적의 active 주문은 1건뿐이다 (`PartnerOrderFromEstimateService.java:43-57`, V6 unique index).
- 결과는 DRAFT 주문이며 자동 판매전표가 아니다 (`PartnerOrder.java:240-256`).
- 최초 SP-08-4-3 보고서는 UI를 후속으로 명시적으로 위임했다 (`docs/dev-reports/sp-08-4-3-order-delete-and-estimate-convert.md:27-35`).

계약으로 확정되지 않은 것(**각 항목 [근거 없음]**):

- 어떤 견적 상태만 변환 가능한지. service는 현재 source 상태를 받지도 검사하지도 않는다.
- 변환 뒤 견적 상태를 바꾸는지. partner-order-service는 source DB를 갱신하지 않는다.
- source 견적이 이미 판매전표로 `QUOTE_CONVERTED`여도 주문 변환 가능한지.
- 어느 화면에 버튼을 두는지, 직접 POST인지 order web으로 deep-link하는지.
- 견적 `validUntil`을 주문 `dueDate`로 해석하는지.
- 견적의 네 금액 권위를 어떻게 복원하는지.

### 3.4 [③ 개발책임자 확인] 이미 기록된 정의

이슈 #1092 본문의 `개발책임자 정의 (2026-08-06)`는 다음을 명시한다.

> 견적서를 '판매전표'로 전환 가능. 또는 해당 견적을 웹에서 불러와 종합견적서를 통해 판매전표로 생성하거나, 주문서를 통해 주문서를 생성하는 것은 가능함.

재현 명령: `gh issue view 1092 --json number,title,body,url`

따라서 **저장 견적을 주문서 웹으로 불러와 거래처 주문서를 생성할 수 있어야 한다는 상위 업무 목표는 확정**이다. 다만 이 문장은 desktop 견적 상세에서 즉시 partner-order row를 만들라는 것인지, order web에 불러온 뒤 거래처/직원이 보완·확정해 만들라는 것인지까지 정하지 않는다.

### 3.5 방향 질문의 최종 판정

| 문서 | 발신/행위 주체 | 수신/업무 결과 | 근거 |
|---|---|---|---|
| 종합견적서/현행 견적 | 삼한 직원이 고객용 견적 작성 | 고객에게 가격 제시 | 레거시 종합견적서 UI 및 현행 `Estimate` 영업 견적 Javadoc (`Estimate.java:34-54`) |
| 거래처 발송 주문서 | 거래처가 주문 내용을 제출 | 삼한이 출고요청/판매주문을 접수 | 레거시 `index.html:675-682`, `Code.js:2291-2344` |

두 문서의 전달 방향은 **같지 않다**. 견적은 우리→고객 제안이고 거래처 주문서는 고객→우리 주문이다. 이 둘을 잇는 업무 의미는 “견적 자체의 문서종류 변경”이 아니라, **견적 내용을 근거로 고객 주문 초안을 만드는 것**으로 볼 여지가 있다. 그러나 “누가 주문 의사를 확정했는가”를 생략한 직접 변환이 허용되는지는 레거시 원문과 기존 Javadoc/테스트에서 확정할 수 없다.

### 3.6 찾아본 경로 목록

- `tools/legacy-gas/종합견적서/Code.js`
- `tools/legacy-gas/종합견적서/index.html`
- `tools/legacy-gas/거래처 발송 주문서/Code.js`
- `tools/legacy-gas/거래처 발송 주문서/index.html`
- `tools/legacy-gas` 전역의 `견적|주문서|거래처.*주문|발주|전환|변환|estimate|order|quote|convert`
- `docs/dev-reports/sp-08-4-3-order-delete-and-estimate-convert.md`
- `docs/dev-reports/phase-2-4-partner-order-restore-version-history.md`
- `docs/dev-reports/phase-2-5-partner-order-hold-status-filter.md`
- `docs/dev-reports/phase-2-6a-order-to-slip-conversion.md`
- `docs/dev-reports/2026-08-07-1051-sol-5-6-fifth-reconvergence.md`
- GitHub 이슈 #826, #1092, #1071, #896 본문 (`gh issue view <N> --json ...`)

---

## 4. 관련 이슈와의 경계

| 이슈 | 본문을 읽고 확인한 범위 | 본 작업과의 관계 | 경계 |
|---|---|---|---|
| #826 `[FEAT] '주문서 관리' + '주문서 관리(이관)' 통합` | eCount MIG-8 silo 데이터를 `partner_orders`로 서비스 기반 이식한 뒤 `(이관)` 메뉴를 제거하는 Phase 11 cutover 작업. 현재 pre-cutover 작업량 0. | **직접 중복 아님** | #1051 배선은 신규 native 주문 생성 경로. #826은 과거 eCount 주문 이관과 메뉴 제거. 단, 둘 다 `partner_orders`를 만들므로 source/provenance·중복 정책은 충돌하지 않게 해야 한다. |
| #1092 `견적서 메뉴 정본 재정의` | 종합견적서 웹 저장분 + 주문서 웹 저장분 통합 표시, 담당 축, 웹 재불러오기, 판매전표/주문서 생성까지 포함. 본문이 from-estimate 운영 404도 이미 명시. | **강하게 겹침 / 상위 이슈** | 이번 배선은 #1092 G9의 일부다. #1092는 저장소 통합·웹 왕복·담당/인증까지 더 넓다. 어느 화면에서 변환할지 결정 없이 desktop direct path를 먼저 고정하면 #1092의 웹 왕복 설계와 중복될 수 있다. |
| #1071 `판매전표 수정 화면 품목 추가` | `/sales/:id/edit` 신규, 기존 전표 수정 계약/VAT/라인 draft 문제. | **중복 아님** | 견적→주문 생성이나 견적 source 조회와 무관. 다만 견적→주문→판매전표로 이어진 뒤 판매전표를 편집하는 하류 기능일 뿐이다. `SlipFormPage.tsx` 충돌 주의도 이번 예상 파일과 직접 겹치지 않는다. |
| #896 `품목 수량 동기화` | 종합견적서·주문서 **웹 전용** 하드코딩 수량 관계를 chip 설정으로 바꾸는 작업. desktop/mobile은 명시적으로 범위 밖. | **기능 중복 아님, 데이터 의미 접점** | 배선된 견적 내용을 order web에서 다시 계산/전개한다면 수량 동기화 정책이 결과를 바꿀 수 있다. 그러나 #896 자체는 변환 endpoint/상태/권한/authority를 다루지 않는다. 이번 PR에 흡수할 근거 없음. |

---

## 5. 개발책임자 질문 목록

아래 네 답이면 구현 범위와 테스트 기대값을 고정할 수 있다. 코드에 이미 확정된 것(201 endpoint, DRAFT 생성, source active unique, 권한 page-code)은 다시 묻지 않는다.

### Q1. 전환 동선과 주문 의사 확정 주체

어느 경로를 이번 PR의 정본으로 할까요?

- **A. 견적 상세에서 즉시 DRAFT 거래처 주문 생성**: 가장 짧고 현 endpoint를 그대로 살린다. 다만 직원 클릭만으로 고객→우리 주문 초안이 생기므로 “고객 주문 의사”와 구분되는 상태/표시가 필요할 수 있다.
- **B. 견적 상세에서 주문서 웹으로 불러오기 → 주문정보 확인 후 주문 생성**: 이슈 #1092 개발책임자 정의와 레거시 `미리보기→주문하기`에 가장 가깝다. 대가로 deep-link/token/담당·인증과 web save/load 계약까지 범위가 커진다.
- **C. 둘 다**: 직원 direct 초안과 web 확인 흐름을 모두 제공한다. 중복 생성/idempotency와 두 진입점 권한·감사 구분이 추가된다.

**PM 권고: B.** 유효 근거가 있는 흐름은 “저장 견적을 주문서 웹으로 불러와 주문서 생성”이고, 견적과 주문서의 방향이 반대라 주문 정보 확인 단계를 보존하는 편이 안전하다. 다만 개발책임자께서 이번 PR의 “전환 배선”을 direct endpoint 활성화로 뜻하셨다면 A를 명시해 주셔야 한다.

### Q2. source 견적 상태와 전환 후 상태

어떤 상태를 주문 전환 대상으로 하고, 전환 후 견적은 어떻게 둘까요?

- **A. `QUOTE_ACCEPTED`만 허용, 견적 상태는 유지 + `source_estimate_id` 링크만 기록**: 고객 수락 뒤 주문이라는 의미가 가장 분명하다. 현재 R8 표본 `QUOTE_DRAFT`는 먼저 accept해야 한다.
- **B. `DRAFT/SENT/ACCEPTED` 허용, 견적 상태 유지**: 현 판매전표 convert의 넓은 허용과 비슷하고 빠르다. 미수락 견적도 주문 초안이 된다.
- **C. 상태별 허용을 정하고 별도 `ORDER_CREATED` 상태/링크를 source 견적에 기록**: 추적은 가장 명확하지만 slip-service 상태 머신·migration·양서비스 원자성/보상 범위가 커진다.

추가 단정이 필요한 한 줄: **이미 `QUOTE_CONVERTED`로 판매전표가 생성된 견적도 주문 전환을 허용할지**. 허용하면 한 견적에서 판매전표 direct와 주문→판매전표가 이중으로 생길 수 있고, 금지하면 기존 판매전표가 있는 견적은 주문 흐름을 탈 수 없다.

**PM 권고: A + `QUOTE_CONVERTED` 금지.** 주문 의사 수락 근거와 중복 판매전표 위험을 가장 작게 만든다. 단, 이는 레거시 원문에 없는 신규 정책이므로 개발책임자 확인이 필수다.

### Q3. 견적 → 주문 필드 의미

원천에 없는 주문 필드를 어떻게 정할까요?

- **A. 변환/웹 확인 단계에서 필수 입력**: 주문 `dueDate`(출고요청일)를 새로 받고, source 견적의 `validUntil`은 복사하지 않는다. `partnerCode`는 견적 `partnerId`로 partner-service를 조회해 snapshot하고, `categoryKey`는 product-service에서 보강한다. 대가: UI/API body와 두 외부 lookup이 늘어난다.
- **B. 자동 매핑**: `validUntil→dueDate`, `partnerBusinessNo→bizCode`, `modelName→modelCode`, category null. 가장 작지만 유효기한=납기일이라는 근거가 없어 잘못된 주문을 만들 수 있다.
- **C. 주문 초안에는 dueDate null 허용, 상세 화면에서 후속 보완**: 즉시 생성은 가능하나 현재 주문 저장/변환의 필수성·화면 가드 점검이 필요하고 불완전 draft가 목록에 쌓인다.

**PM 권고: A.** 특히 견적 유효기한과 주문 납기일은 다른 업무 값이라 자동 복사 근거가 없다.

### Q4. 금액 권위의 원천 보존 범위

이번 PR에서 견적 원천에도 `PRICE/SUPPLY/VAT/TOTAL` authority를 영속화할까요?

- **A. 견적 `estimate_lines`에 authority 추가·생성/수정/상세/revision/판매전표 변환/주문 snapshot 전 경로 보존**: SUPPLY 검증이 실제로 가능하고 “권위 지속”이 end-to-end가 된다. 대가: slip-service migration + DTO/domain/revision + partner-order adapter + UI 테스트까지 범위가 넓다.
- **B. 주문 변환 순간 S/V/T 값으로 authority 추론**: migration은 줄지만 세 값이 모두 저장되어 어느 열이 사용자 권위였는지 판별할 수 없다. 동일 값에 여러 권위가 가능하므로 정확한 구현이 불가능하다.
- **C. 모든 견적 전환 주문을 PRICE로 생성**: 배선은 가능하지만 이번 PR의 SUPPLY 지속 목표를 포기한다.

**PM 권고: A.** B는 기술 선택지가 아니라 정보 소실을 추측으로 메우는 것이고, C는 개발책임자의 “권위 지속” 검증 목적과 충돌한다.

### 이미 확정되어 질문하지 않는 것

- 권한 page-code: endpoint는 `sales.partner-order.edit` CREATE로 이미 명시돼 있고 MASTER/MANAGER/SALES seed가 있다 (`PartnerOrderFromEstimateController.java:35-43`, `auth-service V30:47-49`). 권한을 바꾸라는 근거는 없다.
- 중복: 동일 active source 견적당 주문 1건은 서비스+DB 계약으로 확정됐다.
- 생성 결과: DRAFT/NOT_REQUIRED이며 자동 판매전표 발행이 아니다.
- 금액 권위: 주문에 도달한 뒤에는 PRICE/SUPPLY/VAT/TOTAL을 그대로 영속해야 한다.

---

## 6. 새로 만든 파일 목록 (`git status --porcelain`)

최종 검증 시점의 실제 `git status --porcelain`:

```text
M  clients/desktop/src/renderer/components/audit/PartnerOrderVersionHistoryPanel.tsx
M  clients/desktop/src/renderer/components/collab/PartnerOrderCollaborationPanel.tsx
M  clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.coedit.test.tsx
M  clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx
A  docs/dev-reports/2026-08-07-1051-r9-restore-draft-stale-fix.md
?? docs/dev-reports/2026-08-07-1051-d1-from-estimate-wiring-recon.md
```

- 이번 정찰이 새로 만든 파일: `docs/dev-reports/2026-08-07-1051-d1-from-estimate-wiring-recon.md`
- 나머지 5개는 조사 시작 전부터 존재한 다른 트랙의 변경이다. 조사 시작 시에는 4개가 unstaged(` M`), R9 보고서가 untracked(`??`)였으나 최종 확인 시 staged(`M ` / `A `)로 바뀌었다. 본 정찰은 `git add`를 실행하지 않았고 이 파일들을 수정·unstage하지 않았다.
