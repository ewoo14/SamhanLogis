# PR #984 R10 native import fix 보고서

> 📌 **PM 정정 (2026-07-31)** — 이 마이그레이션은 원래 `V14` 로 작성됐으나, PR #1003(Issue #1001)이 같은 서비스에 `V14__add_partner_order_delivery_address.sql` 을 먼저 올려 두어 **번호가 충돌**했다. 각 PR 의 CI 는 자기 브랜치만 보므로 **양쪽 green 인 채 배포에서 깨지는** 형태다. PM 이 **`V15` 로 재번호**했다.


## 작업 범위와 제한

- 기준 HEAD: `2ad4e042b`
- R9 판정: BLOCK (`docs/qa/984-ecount-import-live/R9-RECONV.md`)
- git 쓰기, Docker 이미지 재빌드·서비스 재기동, 공유 DB write를 하지 않는다.
- R9의 (2) reservation 경합 창과 Issue #1000 범위는 이번 라운드에서 다루지 않는다.

## 설계 요약

미해소 라인이 포함된 주문은 native `partner_orders`와 `partner_order_lines`에 보존하여 영업 주문 목록·상세에 나타나게 한다. 미해소 라인은 `productId = NULL`을 유지하고 전표 전환·재고 예약의 대상에서 제외한다. 회계 admin DTO에는 미해소 여부를 명시적으로 전달하고, import 응답에는 주문번호·라인·사유를 포함한 항목별 결과를 추가한다.

## 불변식별 RED

### ① 미해소 주문의 영업 운영 경로 보존

RED 원문: `Mig8OrderImportServiceIT#importMig8Orders_preserves_order_with_unresolved_line_without_making_it_convertible`가 기존 코드에서 `createdCount=0`으로 실패했다(종료코드 1). 원인은 `hasInvalidLine()`의 `productId == null` 전량 거부였다.

### ② 화면의 미해소 표시

RED 근거: 기존 회계 admin DTO에는 `productId`도 미해소 상태도 없었고, 화면은 일반 품목과 동일하게 렌더링했다. 이 계약을 컴파일·타입체크로 고정했다.

### ③ 거부 이유의 응답 전달

RED 원문: `Mig8OrderImportServiceIT`에 `rejectionDetails()` 단정을 먼저 추가했을 때 `cannot find symbol: method rejectionDetails()`로 실패했다(종료코드 1).

## 변경 요지

- V14 migration으로 `partner_order_lines.product_id` NULL을 허용했다.
- native import는 NULL 라인을 주문 전체 거부 사유로 취급하지 않고 라인 snapshot을 저장한다. 표시용 `model_name`/`product_name`/`category_key`는 fallback을 사용하지만 product 참조는 NULL이다.
- 단일·병합 전표 변환은 NULL product 라인을 409로 차단하여 재고 예약·전표 payload에 넣지 않는다.
- import 결과에 `rejectionDetails`를 추가해 주문번호·사유를 응답한다. 기존 `rejectedCount`도 유지한다.
- 회계 admin 목록에 `unresolvedLineCount`, 상세 라인에 `unresolved`를 추가하고 desktop에서 목록 건수와 `(미해소)`를 표시한다.

## 실측

공유 DB의 `staging.ecount_order_raw`는 0행이다. R7의 26,055행 라이브 replay 및 해당 처리 건수는 데이터 부재로 미판정한다. 대신 실 API로 생성 가능한 throwaway 데이터와 단위·통합 테스트로 경로를 재현한다.

## 전체 테스트

### 영향 건수

- 정상 경로: 기존 IT에서 정상 주문 3건 생성·라인 4건 저장, 재실행 3건 skip을 확인했다. fix로 정상 주문이 차단된 건수는 0건이다.
- 미해소 throwaway: 주문 1건·라인 2건(해소 1, 미해소 1)을 생성하고 native 주문 1건·라인 2건, NULL 라인 1건을 확인했다.
- 라이브 26,055행의 실제 영향 건수는 `staging.ecount_order_raw = 0행`이므로 데이터 부재로 미판정이다.

### 명령과 종료코드

- `.\gradlew.bat :services:partner-order-service:test --no-daemon` — 최신 재실행은 종료코드 124(timeout)로 미판정. timeout 직전 특정 IT 실행은 아래 명령으로 종료코드 0을 확인했다.
- `.\gradlew.bat :services:accounting-service:compileJava` — 종료코드 0 (`BUILD SUCCESSFUL`).
- `npm run typecheck` (작업 위치 `clients/desktop`) — 종료코드 0. tsc와 real-QA scope 50/50 통과.
- `.\gradlew.bat :services:accounting-service:test --no-daemon` — 종료코드 124. 304초 무출력 timeout으로 전체 테스트 통과는 미판정.
- `.\gradlew.bat :services:partner-order-service:test --tests 'com.samhanair.logis.partnerorder.it.Mig8OrderImportServiceIT'` — 종료코드 0. Testcontainers ephemeral PostgreSQL에서 migration 포함 IT 통과.
- `.\gradlew.bat :services:partner-order-service:test --no-daemon` — 종료코드 124. 모듈 전체 최신 실행은 124초 및 304초 제한에서 완료되지 않아 전체 통과로 주장하지 않는다.

## 이번에 안 본 것

- reservation 경합 창 및 TTL/commit handshake
- Issue #1000의 순번코드→모델명 코드 규칙 전환·이카운트 원본 병합
- 선두 token 매칭 규칙
- 프론트엔드 광범위 개편

## 신규 파일

- `docs/dev-reports/2026-07-31-984-r10-native-import-fix.md`
- `services/partner-order-service/src/main/resources/db/migration/V15__allow_unresolved_mig8_product_lines.sql`

### `git status --porcelain` 원문

```text
 M clients/desktop/src/renderer/api/accountingAdminApi.ts
 M clients/desktop/src/renderer/routes/accounting/admin/OrderDetailPage.tsx
 M clients/desktop/src/renderer/routes/accounting/admin/OrderListPage.tsx
 M services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/AccountingAdminQueryService.java
 M services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/OrderDetailResponse.java
 M services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/OrderSummaryResponse.java
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrderLine.java
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/mig8/service/Mig8OrderImportResult.java
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/mig8/service/Mig8OrderImportService.java
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderMergeConvertService.java
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderDetailResponse.java
 M services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/Mig8OrderImportServiceIT.java
?? docs/dev-reports/2026-07-31-984-r10-native-import-fix.md
?? services/partner-order-service/src/main/resources/db/migration/V15__allow_unresolved_mig8_product_lines.sql
```
