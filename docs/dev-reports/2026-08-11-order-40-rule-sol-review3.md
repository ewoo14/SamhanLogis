# PR #1166 S2 재검토3 — 확정 fail-closed

- 검토자: CODEX SOL 5.6
- 검토 기준: `3ced9c74cd4f80104d07b858f7e3beea6a0189dc`
- 일자: 2026-08-11
- 판정: **FAIL — BLOCKER 1건**
- git 조작: 없음
- 공유 DB: `SELECT`만 수행. 실제 저장 QA는 `sol3-1166-*` 격리 PostgreSQL 3개에서만 수행

## 1. 결론

dc-config 장애/부분 응답을 저장 전에 차단하는 본래 fix는 맞다. 실제 dc-config 프로세스를
중단한 확정에서 HTTP 503을 확인했고, 확정 직전과 직후의 `partner_orders`,
`partner_order_lines`, `partner_order_history`, `partner_order_revisions` 행 수가 모두 같았다.
이전 결함인 1,000,000원 저장과 반쪽 저장은 재현되지 않았다.

그러나 정상 주문이 불필요한 보조 원격 호출 하나에 새로 종속됐다. product-service의 현재
기본 lookup이 이미 `fixedDiscountRate`와 `fixedDiscountSource=NONE`을 유효하게 계산해
주더라도 partner-order-service는 모든 품목에
`/products/internal/fixed-discount-rate-bulk`를 다시 호출한다. dc-config는 정상인 채 이 보조
endpoint만 500으로 만들자, 고정DC가 없는 정상 변동DC 품목의 600,000원 주문이 HTTP 503으로
막혔다. 이는 fail-closed가 막으면 안 되는 정상 경로를 막는 가용성 회귀다.

따라서 이 HEAD는 머지 불가다.

## 2. BLOCKER-1 — 현재 정상 lookup을 받았는데도 고정DC 호환 조회 장애가 모든 주문을 막음

### 재현 데이터와 결과

- 격리 거래처: `P-QA-40`, HOME/COMM 일반 DC 7%
- 격리 품목: `QA-HVAC-001`, 정상가 1,000,000원, `hasVariableDiscount=true`,
  `fixedDiscountRate=null`, 물리구분 `HVAC`
- dc-config: 실제 서비스 정상
- product 기본 lookup: HTTP 200, 위 품목의 현재 계약 반환
- product 고정DC 보조 endpoint만: HTTP 500 토글
- 기대: 현재 lookup의 명시적 `NONE`을 신뢰하여 주문 40% = 600,000원 확정
- 실제: HTTP 503, 화면 메시지
  `품목 고정 할인 기준을 확인할 수 없어 주문 가격을 계산할 수 없습니다`
- 무저장 확인: 확정 직전/직후 모두
  `orders=3, lines=3, history=8, revisions=3`

증거: [04-product-fixed-helper-500-overblocks-order.png](../qa/2026-08-11-order40-sol3/04-product-fixed-helper-500-overblocks-order.png)

### 원인 좌표

1. 현재 product-service는 lookup 응답을 만들 때 이미 `resolveFixedDiscount()`를 실행한다.
   - `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/ProductSummaryResponse.java:165-198`
   - rate는 184, source는 196-197에서 응답한다.
   - 고정DC 없음도 `Product.java:648-663`에서 `rate=null, source=NONE`이라는 명시적 정상 상태다.
2. partner-order wire record는 source를 버린다.
   - `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/ProductSummary.java:17-32`
   - `ProductClient.java:206-233`도 `fixedDiscountSource`를 파싱하지 않는다.
3. 그래서 모든 비어 있지 않은 주문이 무조건 보조 endpoint를 호출한다.
   - `PartnerOrderPriceCalculationService.java:102-108`
   - 그 결과를 기본 lookup rate와 병합하는 곳은 119-120이다.
4. 보조 client의 “유효한 빈 응답과 실패” 구분 자체는 구현돼 있다.
   - 빈 productId만 호출 생략: `ProductClient.java:106-109`
   - 유효 envelope/map 파싱: 110-141
   - 5xx/네트워크를 503으로 변환: 142-149
   - product endpoint도 존재 품목의 null은 map entry로 반환하고, 미존재만 생략한다:
     `ProductInternalController.java:260-291`.

즉 결함은 실패 구분이 아니라 **호환 보조 조회가 필요 없는 현재 응답에서도 무조건 호출하는
정책**이다. 현재 공유 product DB에서도 활성 2,982건 중 고정DC null이 2,917건이므로 영향
면적이 예외적이지 않다.

## 3. 라이브 QA

### 실제 실행 결과

| 시나리오 | 실제 결과 | DB 확인 | 판정 |
|---|---|---|---|
| dc-config 정상 주문 확정 | preview/confirm 600,000원, 주문 `2026/08/11-3` 화면·DB 저장 | 주문/라인 모두 600,000원 | PASS |
| dc-config 완전 중단 | HTTP 503, 읽을 수 있는 재시도 메시지 | 전 `orders=2,lines=2,history=5,revisions=2`; 후 동일 | PASS |
| 견적 7% | appliedRate 0.07, 930,000원, 견적 `2026/08/11-3` 화면·DB 저장 | 견적/라인 930,000원 | PASS |
| dc-config 정상 + product 보조 500 | HTTP 503, 고정DC 기준 조회 실패 메시지 | 전후 `orders=3,lines=3,history=8,revisions=3` 동일 | **FAIL/BLOCKER** |

스크린샷:

1. [01-order-confirm-600000-visible.png](../qa/2026-08-11-order40-sol3/01-order-confirm-600000-visible.png)
2. [02-order-confirm-dc-down-503-visible.png](../qa/2026-08-11-order40-sol3/02-order-confirm-dc-down-503-visible.png)
3. [03-estimate-7-percent-930000-visible.png](../qa/2026-08-11-order40-sol3/03-estimate-7-percent-930000-visible.png)
4. [04-product-fixed-helper-500-overblocks-order.png](../qa/2026-08-11-order40-sol3/04-product-fixed-helper-500-overblocks-order.png)

### 실패 원문 보존

- in-app Browser: `No browser is available`; browser census `[]`. 저장소 Playwright + 실제 격리
  서비스/DB로 전환했다.
- 첫 앱 부팅: `VITE_APP_VERSION=2026/08/11-sol3`이 버전 형식 검증에 실패. 실제 허용 형식
  `2026/08/11-63`으로 고쳤다.
- 정상 주문 첫 화면 검증: 배송지를 일반 text로 찾았으나 실제 화면은 input value여서 locator
  실패. 그 실행의 API/DB 600,000원 저장은 이미 성공했고, locator만 실제 DOM 계약으로 고쳤다.
- 견적 첫 실행: 잘못된 `/estimates/...` 경로로 `No static resource` 500. 실제
  `/slips/estimates` 경로로 고쳤다.
- slip 첫 실행: product discovery 미설정으로
  `No servers available for service: product-service`. 격리 product stub의 static instance를
  지정해 재실행했다.
- BLOCKER 화면 첫 실행: 기대 문구를 공통 dc-config 문구로 잡아 실패했고 실제 수신 문구는
  `품목 고정 할인 기준을 확인할 수 없어 주문 가격을 계산할 수 없습니다`였다. 실제 계약으로
  assertion을 고친 재실행은 1/1 통과했다.

## 4. 정상 경로 오차단 검토

### partial 완전성 판정

현재 confirm 계약에서는 “모든 요청 lineId가 응답에 있어야 한다”가 정당하다.

- confirm 수량은 `@Min(1)`: `ConfirmLineRequest.java:16-21`. 수량 0 라인은 정상 confirm
  입력이 아니다.
- 삭제 라인은 요청 목록에 실리지 않으며, 요청에 들어온 모든 라인은 계산 대상이다.
- dc-config 계산기는 fixed/variable 여부와 관계없이 요청의 모든 line을 순회해 응답 line을
  하나씩 만든다: `PriceCalculationService.java:65-85`.
- partner 계산기의 ID/개수 완전성 검사는
  `PartnerOrderPriceCalculationService.java:168-176`이다.

공유 DB를 조회만 한 결과 활성 주문은 4건/활성 라인은 8건, 수량 0은 0건이었다. 현재 활성
product lookup까지 가능한 것은 2주문/6라인이며 이 6라인은 전부 completeness 판정을
통과하는 형태다. 나머지 2주문/2라인은 연결 product가 soft-delete되어 partial 판정 전에
카탈로그 없음으로 중단된다. 따라서 실 데이터 기준 **판정 진입 2건/6라인, 통과 2건/6라인,
partial 오검출 0건**이다. 단, 과거 주문을 재확정하는 별도 기능이 생기면 soft-delete 품목
정책은 따로 결정해야 한다.

### 견적과 견적→주문

- 견적 계산 client는 `callerService=slip-service`를 보내며
  (`DiscountPriceClient.java:45-66`), 주문 전용 caller일 때만 40%를 여는
  `PriceCalculationService.java:62-68`을 지나지 않는다. 실제 7%/930,000원 저장도 확인했다.
- 견적→주문은 estimate snapshot을 읽어 라인을 복사한다:
  `PartnerOrderFromEstimateService.java:53-85,91-111`. order 40% 계산기와
  `DcConfigClient` 참조가 없다.

## 5. 7경로 전수표 재검산

O/X는 “dc-config/가격 원격 실패 시 정상가 또는 이전값을 조용히 저장하는가”다.

| 경로 | 재검산 | 직접 근거/보정 |
|---|---:|---|
| 주문 확정 | X | 131-140에서 계산 완전성을 저장 전 검사하고, 저장은 `PartnerOrderConfirmService.java:145-180`에서 그 뒤 시작 |
| 주문 미리보기 | X | 같은 `PartnerOrderPriceCalculationService`를 사용하고 503 반환. 단 BLOCKER-1 때문에 정상 경로도 오차단 |
| 주문 수정·재계산 | X | dc-config 호출 자체가 없어 원격 fallback은 아니다. 다만 보고서의 “금액 필드 불허” 근거는 틀림. `PartnerOrderUpdateService.java:333-359,471-482`는 PRICE 권위 납품가/수량을 받아 저장함 |
| 견적 확정 | X | slip-service caller의 독립 7% 경로; 라이브 930,000원 확인 |
| 견적→주문 | X | estimate snapshot의 저장 단가/금액을 복사; order 계산기 미호출 |
| 이카운트/MIG 적재 | X | dc-config 미호출. `Mig8OrderImportService.java:105-145,180-205`가 외부 snapshot 금액을 직접 적재. null 금액은 `zero()`가 0으로 바꾸므로 기존 표의 “금액 기본값 없음”이라는 설명은 부정확함 |
| 배치·재처리 | X | 주문 가격 재계산 batch 없음. outbox writer/convert는 상태·전환 수량만 저장 |

표 밖에서 확인한 좌표:

- 재고 연동: confirm에서는 예약을 제거했고(`PartnerOrderConfirmService.java:142-143`), convert에서만
  예약/전표 발행 후 converted 수량·status를 저장한다
  (`PartnerOrderConvertService.java:190-222`, `PartnerOrderMergeConvertService.java:203-267`).
- 반품: partner-order 주문 생성/가격 저장 endpoint가 없다. 반품 표기는 slip/inventory 영역이다.
- 세트 전개: 별도 저장 우회가 아니라 order-app이 최종 line 목록을 같은
  `/partner-orders/{draftId}/confirm`에 보낸다(`clients/web/order-app/src/samhanApi.ts:370-411`).
- 복사 생성: partner-order copy/clone endpoint 없음.
- API 직접 호출: `PartnerOrderConfirmController.java:77-89`에서 같은 confirm service로만 진입.
- **기존 7표 누락 기술 경로**: revision restore는 snapshot 단가/금액으로 기존 주문 라인을
  교체한다(`PartnerOrderRevisionService.java:294-334`). dc-config fallback은 아니지만 금액을
  쓰는 경로이므로 전수표에는 명시해야 한다.
- **비운영 경로**: `PartnerOrderSeeder.java:50-52,145-183`은 dev + 명시 flag에서만 임의
  단가를 저장한다.

## 6. timeout 실재 확인

- 실제 HTTP transport connect timeout 2초:
  `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/DcConfigClient.java:59-60`
- 실제 HTTP transport read timeout **3초**: 같은 파일 61
- 이 factory를 dc-config 전용 clone builder에 실제 결합: 62-65
- 404/5xx는 error body를 성공으로 오인하지 않고 결국 `available=false`:
  `DcConfigClient.java:187-202`
- null/실패 envelope/data/lines도 `available=false`: 214-228

따라서 “3초”는 문서나 resilience 설정만이 아니라 실제 RestClient request factory에 설정돼 있다.

## 7. RED-B와 전체 검증

- 주문 40%: order caller이며 주문 전체에 실외기·실내기·미분류가 없을 때만 후보
  (`PriceCalculationService.java:130-163`), 그중 `hasVariableDiscount=true` 라인에만 적용
  (105-119). 정상 라이브 600,000원 확인.
- 견적 7%: 라이브 930,000원 확인.
- S1 제품구분: 이 fix HEAD는 product 분류 구현을 변경하지 않았다. 자동분류 916,
  구성품 역산 41, 미분류 2,126 기준과 관련 회귀는 product-service 전체 781건에 포함돼 통과.
- Gradle 강제 재실행(`--rerun-tasks --max-workers=1`):
  dc-config 79 + partner-order 530 + product 781 = **1,390/1,390**, failure/error/skip 0.
- order-app: **246/246**.
- Desktop: exit 0, **2,155 passed / 1 skipped**.
- origin/main 대비: test/spec 파일 삭제 0건. 변경된 Vitest 파일
  `productCatalogApi.test.ts`는 +30/-0이며 테스트 1건을 추가했다. Playwright spec 2개도
  +350/-0이다. 따라서 테스트 감소 없음.

## 8. 구현자 지시서

### 불변식

1. 현재 product lookup이 고정DC resolution의 존재 여부를 명시하면 그 결과가 권위다.
   `fixedDiscountSource=NONE` + rate null은 “조회 실패”가 아니라 유효한 고정DC 없음이다.
2. 보조 `/fixed-discount-rate-bulk`는 source marker가 없는 구형 product-service 응답과의
   호환 때만 호출한다.
3. 보조 호출이 실제로 필요한 구형 경로에서 404/5xx/네트워크/timeout이면 계속 503
   fail-closed여야 한다.
4. dc-config unavailable/partial 및 누락 finalPrice는 계속 저장 전 503이며
   order/order_line/history/revision이 하나도 남지 않아야 한다.

### 좌표 전수

- `ProductSummary.java:17-32`: `fixedDiscountSource` 또는 동등한 explicit-resolution marker 추가
- `ProductClient.java:206-233`: 현재 lookup의 `fixedDiscountSource` 파싱
- `PartnerOrderPriceCalculationService.java:102-120`: source가 없는 legacy 품목만 모아 보조
  조회하고, 현재 응답의 `NONE/PRODUCT/S/M/L`은 보조 호출 없이 그대로 사용
- `ProductClient.java:106-149`: 실제 fallback 호출이 필요한 때의 fail-closed 계약 유지
- 미리보기와 확정이 같은 계산 service를 사용하므로 양쪽 모두 회귀 표적에 포함

### RED-A — 이 fix가 반드시 새로 닫아야 할 상태

1. 현재 응답 `{fixedDiscountRate:null,fixedDiscountSource:"NONE"}` + 보조 endpoint 500 +
   dc-config 정상 → 보조 호출 0회, 600,000원 확정·저장.
2. 현재 응답 source가 `PRODUCT/S/M/L` → 보조 호출 0회, 해당 resolved rate 보존.
3. 구형 응답 source marker 없음 → 보조 조회 성공 시 호환; 5xx/네트워크/timeout 시 503 무저장.
4. 여러 라인에서 현재/구형 응답이 섞이면 legacy 라인 ID만 보조 조회하고 현재 라인은 영향 없음.
5. dc-config partial/중단은 이번 라운드와 동일하게 503 + 4테이블 무변경.

### RED-B — 잃으면 안 되는 것

- 주문 40%는 실외기·실내기가 주문 전체에 없고 미분류도 아니며 변동DC 대상인 라인에만 적용
- 견적 7%/930,000원 및 견적→주문 snapshot 금액 보존
- fixed rate 우선, `hasVariableDiscount=false` 무할인, 옵션 정액/tier의 기존 결과 보존
- S1 916/41/2,126, Gradle 1,390, order-app 246, Desktop 2,155/1 유지
- UUID 사용자 비노출, 실패 메시지 한국어, 실패 확정 4테이블 무저장

### 구현 후 새로 가능해야 하는 상태

product 기본 lookup과 dc-config가 정상이라면, 구형 호환용 고정DC 보조 endpoint가 일시
중단돼도 **현재 계약으로 고정DC 없음/적용값이 이미 확정된 주문은 정상 확정**할 수 있어야 한다.
반대로 marker가 없는 구형 응답에서 보조 기준을 실제로 잃은 주문만 503으로 막혀야 한다.

**제 전제가 틀렸다면 고치지 말고 중단·보고하십시오.** 특히 현재
`fixedDiscountSource=NONE`이 고정DC 미설정의 권위 있는 정상 상태가 아니라는 별도 배포 계약이
있다면, 호환 정책과 배포 순서를 개발책임자에게 먼저 보고해야 한다.

## 9. 이 라운드가 보지 않은 표면

- 실제 운영 인증·운영 DB write는 수행하지 않았다.
- 실제 네트워크 3초 hang을 wall-clock으로 재현하지는 않았다. transport 설정과
  네트워크/중단 503 경로는 확인했다.
- 수백 라인의 대형 주문, mixed-version product-service를 실제 두 버전으로 띄운 배포 호환 QA,
  revision restore 화면 QA는 수행하지 않았다.
- 모바일/태블릿 주문 화면과 인쇄물은 이번 S2 저장 차단 범위에서 직접 캡처하지 않았다.

