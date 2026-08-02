# PR #1003 / Issue #1001 지문 정규화 fix 라운드 보고서

## 진행 상태

- 시작일: 2026-08-01
- 상태: 구현·검증 완료(전체 모듈 스위트는 timeout으로 미판정)
- 범위: 병합 지문 정규화만 수정
- 금지 범위: legacy 경로, 슬라이스 3·4·5, 슬라이스 1 원장 read 계약, V14 번호, 배송주소 backfill

## 지문 구성 필드 표

| 필드 | 포함 | 발행 결과를 바꾸는가 | 근거 |
|---|---|---|---|
| `partnerOrderId` | 예 | 예 | 단건 전표의 `sourceId`와 병합 대표 출처를 결정한다. |
| 병합 `sourceOrders.partnerOrderId`, `orderNo` | 예, 정렬 | 예 | 병합 출처 행과 사용자 식별 주문번호를 저장한다. 입력 순서는 키 계약상 의미가 없으므로 안정 정렬한다. |
| `ioDate` | 예 | 예 | 전표일과 전표번호 날짜를 결정한다. `null`/blank는 발행 시 기본 날짜로 처리하므로 canonical에서도 부재로 정규화한다. |
| `partnerId` | 예(병합) | 예 | 병합 전표의 거래처 UUID를 결정한다. |
| `partnerCode` | 예 | 예 | 거래처 검증·UUID 해석과 `partner_code` snapshot에 사용한다. blank는 발행 시 미설정으로 처리하므로 `null`과 같게 정규화한다. |
| `partnerName` | 예 | 예 | 전표 거래처명 snapshot에 저장한다. |
| `warehouseCode` | 예 | 예 | 창고 UUID fallback 해석에 사용한다. |
| `warehouseId` | 예 | 예 | 제공되면 창고 UUID를 직접 결정한다. blank는 미제공으로 처리하므로 `null`과 같게 정규화한다. |
| `shippingAddress` | 예 | 예 | 전표 배송주소 snapshot에 저장한다. `null`과 빈 문자열을 합치지 않는다. |
| `deliveryAddress` | 예 | 예 | 전표 프로젝트/배송주소에 저장한다. |
| `receiverPhone` | 예 | 예 | 수령인 전화 snapshot에 저장한다. |
| `employeeCode` | 예 | 예 | 요청자에 사용되며 blank는 header/system fallback으로 처리되므로 `null`과 같게 정규화한다. |
| `paymentDueLabel` | 예 | 예 | 전표 결제기한 snapshot 및 할인 audit snapshot에 저장한다. |
| `discountInfo` | 예 | 예 | 할인 audit snapshot에 저장한다. |
| `memo` | 예 | 예 | partner-order 승인시각과 결합되어 전표 memo에 저장된다. 발행의 trim/blank→null 규칙을 canonical에도 적용한다. |
| 단건 `orderApprovedAt` | 예 | 예 | memo prepend 결과를 바꾼다. blank는 prepend하지 않으므로 부재로 정규화한다. |
| 라인 `productCode` | 예 | 예 | 상품 조회와 라인 상품 UUID를 결정한다. |
| 라인 `productName` | 예 | 예 | 라인 상품명 snapshot을 결정한다. `null`은 조회 상품명 fallback이고 빈 문자열은 빈 snapshot이므로 합치지 않는다. |
| 라인 `qty` | 예 | 예 | 라인 수량과 금액을 결정한다. |
| 라인 `spec` | 예 | 예 | zero-width space/trim 정규화 후 라인 규격에 저장된다. |
| 라인 유효 `unitPrice` | 예 | 예 | `unitPriceVat` 우선, 없으면 `unitPriceExVat`, 모두 없으면 0인 실제 저장 단가를 fingerprint에 담는다. |
| 라인 `supplyAmount` | 예 | 예 | 발행 audit 공급가 합계에 누적된다. |
| 라인 `vatAmount` | 예 | 예 | 발행 audit 세액 합계에 누적된다. |
| 라인 `remarks` | 예 | 예 | 라인 메모 snapshot에 저장된다. |
| 라인 `sourceOrderLineId` | 예 | 예 | 주문 라인 출처 역추적 값에 저장된다. |
| 라인 `lineNo` | 아니오 | 아니오 | 발행 해석·저장에 사용되지 않아 결과를 바꾸지 않는다. |
| 라인 원본 `unitPriceExVat` | 아니오(단, VAT 단가가 있으면) | 아니오(그 경우) | VAT 단가가 있으면 실제 단가는 `unitPriceVat`이고 원본 VAT 제외 단가는 결과에 쓰이지 않는다. 실제 유효 단가만 포함한다. |

## RED 원문

세 형태를 구현 전 상태에서 각각 먼저 실행했다.

명령:

```text
.\gradlew :services:slip-service:test --tests com.samhanair.logis.slip.publish.SlipPublishFingerprintTest --no-build-cache
```

종료코드 **1**. 원문 핵심:

```text
SlipPublishFingerprintTest > line_number_does_not_change_the_fingerprint() FAILED
SlipPublishFingerprintTest > merge_fingerprint_is_independent_of_source_and_line_order() FAILED
SlipPublishFingerprintTest > fingerprint_treats_null_and_empty_string_as_the_same_published_value() FAILED
4 tests completed, 3 failed
BUILD FAILED
```

각 실패는 해당 결함(순서 민감, `null`/빈 문자열 구분, `lineNo` 포함)을 직접 가리켰으며 컴파일 오류나 잘못된 테스트 오류가 아니었다. 테스트의 `assertThat(...).isEqualTo(...)`는 Linux의 동일한 JVM 문자열/JSON 직렬화 규칙에서도 참이어야 한다는 기준으로 작성했다.

## 변경 요지

`computeMergeFingerprint`에서 `sourceOrders`와 `lines`를 canonical JSON 문자열 기준으로 안정 정렬했다. `canonicalLine`에서 발행 결과를 바꾸지 않는 `lineNo`를 제거하고, VAT 단가 우선 규칙으로 계산한 유효 `unitPrice`만 남겼다. 발행 코드가 blank를 부재·trim으로 처리하는 `ioDate`, `warehouseId`, `partnerCode`, `employeeCode`, `memo`, `orderApprovedAt`만 동일 규칙으로 정규화했다. 배송주소·수령인 전화·거래처명·창고 식별자·라인 결과 필드는 계속 포함했다. estimate 및 legacy canonical 경로는 변경하지 않았다.

## 실측

읽기 전용 실데이터 계수 명령:

```text
docker exec samhan-postgres psql -U samhan -d slip_db -At -F '|' -c "SELECT count(*) FILTER (WHERE s.is_deleted=false AND a.is_deleted=false AND a.source_type='PARTNER_ORDER'), count(*) FILTER (WHERE s.is_deleted=false AND a.is_deleted=false AND a.source_type='PARTNER_ORDER' AND s.idempotency_key LIKE 'PO-MRG-%'), count(*) FILTER (WHERE s.is_deleted=false AND a.is_deleted=false AND a.source_type='PARTNER_ORDER' AND s.idempotency_key NOT LIKE 'PO-MRG-%') FROM slips s JOIN slip_publish_audit a ON a.slip_id=s.id;"
```

종료코드 **0**, 원문 `16|3|13` — 노출 키 16개(병합 3, 단건 13)이다.

```text
docker exec samhan-postgres psql -U samhan -d slip_db -At -F '|' -c "SELECT count(*) FILTER (WHERE s.is_deleted=false AND a.is_deleted=false AND a.source_type='PARTNER_ORDER' AND a.request_fingerprint IS NOT NULL AND s.idempotency_key LIKE 'PO-MRG-%'), count(*) FILTER (WHERE s.is_deleted=false AND a.is_deleted=false AND a.source_type='PARTNER_ORDER' AND a.request_fingerprint IS NOT NULL AND s.idempotency_key NOT LIKE 'PO-MRG-%'), count(*) FILTER (WHERE s.is_deleted=false AND a.is_deleted=false AND a.source_type='PARTNER_ORDER' AND a.created_at > TIMESTAMP '2026-07-31 23:59:17+09') FROM slips s JOIN slip_publish_audit a ON a.slip_id=s.id;"
```

종료코드 **0**, 원문 `3|13|0` — 지문이 있는 병합 3·단건 13 모두 유지되고, fix 기준시각 이후 신규 audit는 0건이다. 따라서 실데이터 관측상 노출 키 **16개 replay 모집단**, 새로 막히는 정상 발행 **0건**이다. 실제 HTTP replay는 공유 서비스 배포 슬롯 부재 및 공유 DB write 금지로 실행하지 않았다.

## 테스트

RED:

- 명령 `.\gradlew :services:slip-service:test --tests com.samhanair.logis.slip.publish.SlipPublishFingerprintTest --no-build-cache` — 종료코드 **1**.

GREEN:

- 명령 `.\gradlew :services:slip-service:test --tests com.samhanair.logis.slip.publish.SlipPublishFingerprintTest --no-build-cache --rerun-tasks` — 종료코드 **0**. 4개 fingerprint 테스트 통과.
- 명령 `git diff --check` — 종료코드 **0**.
- 새 단정의 Linux 판정: 테스트는 OS API·locale·경로 구분자에 의존하지 않고 Java `String`/Jackson JSON 및 SHA-256만 사용하므로 ubuntu-latest에서 동일한 canonical 결과를 기대한다.

전체 모듈 실행:

- 명령 `.\gradlew :services:slip-service:test --no-build-cache` — 184초 timeout, 종료코드 **124**. 전체 스위트는 **미판정**이며 CI 권위로 넘긴다.

## 이번에 안 본 것

- legacy 경로
- 슬라이스 3·4·5
- 슬라이스 1 원장 read 계약
- 과거 배송주소 backfill
- 마이그레이션 V14 번호 변경

## 신규 파일 및 작업 트리

신규 파일:

- `docs/dev-reports/2026-08-01-1001-s2-r4-fingerprint-normalization.md`

변경 파일:

- `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishFingerprintTest.java`

`git status --porcelain` 원문:

```text
 M services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java
 M services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishFingerprintTest.java
?? docs/dev-reports/2026-08-01-1001-s2-r4-fingerprint-normalization.md
```
