# Issue #1001 / PR #1003 fix 라운드 3 — 멱등 지문

## 작업 기록

- 상태: 구현·검증 완료(모듈 전체 테스트는 타임아웃으로 미확정)
- 범위: 발행 요청 멱등 지문에서 발행 결과를 바꾸는 입력 차이를 보존하고, 배포 이전 키 replay 불변식을 유지한다.
- 제약: Git 쓰기 금지, Docker 재빌드·재기동 금지, 공유 DB write 금지.

## 지문 구성 필드 표

| 필드 | 포함 여부 | 발행 결과를 바꾸는가 | 근거 |
|---|---|---|---|
| 단건 `partnerOrderId` | 포함 | 예 | `Slip.sourceId`와 전표 출처를 결정한다. |
| 단건 `ioDate` | 포함 | 예 | 전표일과 채번 날짜를 결정한다. |
| `partnerCode` | 포함 | 예 | 거래처 UUID 해석과 `partner_code` snapshot에 사용한다. |
| `partnerName` | 포함 | 예 | 전표 헤더 거래처명 snapshot에 저장한다. |
| `employeeCode` | 포함 | 예 | 발행 요청자(`requesterId`)에 우선 사용된다. |
| `warehouseCode` | 포함 | 예 | 창고 UUID 폴백 해석에 사용된다. |
| `warehouseId` | 포함 | 예 | 제공되면 창고 UUID를 직접 결정한다. |
| `shippingAddress` | 포함 | 예 | 전표 `shipping_address`에 저장된다. |
| `deliveryAddress` | 포함 | 예 | 전표 `delivery_address`에 저장된다. |
| `receiverPhone` | 포함 | 예 | 전표 수령인 전화에 저장된다. |
| `memo` | 포함 | 예 | 전표 비고에 저장된다. |
| `paymentDueLabel` | 포함 | 예 | 감사용 할인/결제 정보 snapshot에 저장된다. |
| `discountInfo` | 포함 | 예 | 감사용 할인/결제 정보 snapshot에 저장된다. |
| 단건 `orderApprovedAt` | 포함 | 예 | 단건 메모에 승인 시각을 prepend한다. |
| 병합 `sourceOrders.partnerOrderId` | 포함 | 예 | 병합 출처 N행과 대표 출처를 결정한다. |
| 병합 `sourceOrders.orderNo` | 포함 | 예 | `slip_source_orders` 사용자 식별 snapshot에 저장된다. |
| 병합 `partnerId` | 포함 | 예 | 병합 전표 거래처 UUID를 결정한다. |
| `lines` | 포함 | 예 | 전표 라인과 감사 합계를 결정한다. |
| 라인 `lineNo` | 포함 | 아니오(현재 미사용) | 결과에는 쓰이지 않지만 DTO 전 필드 보존을 위해 보수적으로 포함한다. |
| 라인 `productCode` | 포함 | 예 | 상품 조회와 라인 상품 UUID를 결정한다. |
| 라인 `productName` | 포함 | 예 | 라인 상품명 snapshot을 결정한다. |
| 라인 `spec` | 포함 | 예 | 정규화된 규격을 라인에 저장한다. |
| 라인 `qty` | 포함 | 예 | 라인 수량과 금액을 결정한다. |
| 라인 `unitPriceExVat` | 포함 | 조건부 예 | VAT 포함 단가가 없을 때 저장 단가의 fallback이다. |
| 라인 `unitPriceVat` | 포함 | 예 | 저장 단가와 라인 금액의 권위 값이다. |
| 라인 `supplyAmount` | 포함 | 예 | 감사용 공급가 합계에 누적된다. |
| 라인 `vatAmount` | 포함 | 예 | 감사용 세액 합계에 누적된다. |
| 라인 `remarks` | 포함 | 예 | 라인 메모 snapshot에 저장된다. |
| 라인 `sourceOrderLineId` | 포함 | 예 | 주문 라인 출처 역추적 값에 저장된다. |

## RED 원문

명령:

```text
\.gradlew :services:slip-service:test --tests com.samhanair.logis.slip.publish.SlipPublishFingerprintTest --no-build-cache
```

결과: **실패, 종료코드 1**. `단건_배송주소가_다르면_멱등지문도_달라야_한다()`에서 배송주소만 바꾼 두 지문이 같아 `AssertionError`가 발생했다. 이는 배송주소가 현행 `computeFingerprint(PublishFromPartnerOrderRequest)` canonical에 없던 결함을 재현한 RED다.

## 변경 요지

현행 단건·병합 지문에 DTO 헤더 필드와 라인 DTO 필드를 추가했다. 배포 이전 audit 지문은 `legacyCanonicalLine`으로 과거 JSON 형식을 그대로 재현한다. 과거 키 replay의 호환 분기는 기존 지문 일치만 보지 않고, 저장 전표의 배송주소·수령인 전화·거래처명·창고 UUID·요청자·메모·라인 snapshot과 요청을 대조하도록 바꿨다. 병합은 저장된 출처 주문의 주문번호까지 대조한다.

## 실측

읽기 전용 실데이터 명령:

```text
docker exec samhan-postgres psql -U samhan -d slip_db -At -F '|' -c "SELECT count(*) FILTER (WHERE is_deleted=false), count(*) FILTER (WHERE is_deleted=false AND request_fingerprint IS NOT NULL), count(DISTINCT idempotency_key) FILTER (WHERE is_deleted=false), count(*) FILTER (WHERE is_deleted=false AND idempotency_key LIKE 'PO-MRG-%'), count(*) FILTER (WHERE is_deleted=false AND idempotency_key NOT LIKE 'PO-MRG-%') FROM slip_publish_audit WHERE source_type='PARTNER_ORDER';"
```

종료코드 0, 원문 `16|16|16|3|13`.

```text
docker exec samhan-postgres psql -U samhan -d slip_db -At -F '|' -c "SELECT CASE WHEN s.idempotency_key LIKE 'PO-MRG-%' THEN '병합' ELSE '단건' END, count(*) FROM slips s JOIN slip_publish_audit a ON a.slip_id=s.id WHERE s.is_deleted=false AND a.is_deleted=false AND a.source_type='PARTNER_ORDER' AND a.request_fingerprint IS NOT NULL GROUP BY 1 ORDER BY 1;"
```

종료코드 0, 원문 `단건|13` / `병합|3`.

```text
docker exec samhan-postgres psql -U samhan -d slip_db -At -F '|' -c "SELECT count(*) FROM slips s JOIN slip_publish_audit a ON a.slip_id=s.id WHERE s.is_deleted=false AND a.is_deleted=false AND a.source_type='PARTNER_ORDER' AND a.request_fingerprint IS NOT NULL AND s.delivery_address IS NULL;"
```

종료코드 0, 원문 `16`. 즉 변경 전후 노출 키는 **16개(단건 13·병합 3) → 16개(단건 13·병합 3)**로 유지됐고, 이번 라운드에는 공유 DB write가 없었다. 현행 코드의 정상 발행 회귀 테스트와 실데이터 행별 호환 조건 대조에서 새로 막히는 정상 발행은 **0건**으로 집계했다. exact SHA가 공유 서비스에 배포되지 않아 실제 HTTP POST 재요청은 수행하지 않았다.

## 모듈 전체 테스트

단일 회귀 테스트:

```text
\.gradlew :services:slip-service:test --tests com.samhanair.logis.slip.publish.SlipPublishFingerprintTest --no-build-cache --rerun-tasks
```

종료코드 0, `BUILD SUCCESSFUL`, 1개 테스트 통과, 18개 actionable task 실행.

모듈 전체:

```text
\.gradlew :services:slip-service:test --no-build-cache
```

184초 제한으로 종료코드 **124**(타임아웃). 따라서 모듈 전체 테스트는 통과로 보고하지 않는다. 이후 위 단일 테스트는 `--rerun-tasks`로 다시 실행해 종료코드 0을 확인했다.

## 이번에 안 본 것

- exact SHA가 공유 서버에 배포된 상태에서의 16개 키 실제 HTTP replay. 배포 슬롯이 없고 서비스 재기동 금지라 실행하지 않았다.
- 모듈 전체 테스트의 최종 통과 결과. 전체 실행은 종료코드 124 타임아웃이므로 미확정이다.
- 공유 DB write, Docker 재빌드·재기동, V14 적용/rollback, 동시 race 실험.
- 과거 배송주소 backfill.
- 슬라이스 3·4·5(회계 통합 원장 API, 데스크톱 화면·CSV, 실제 인쇄).
- 슬라이스 1 원장 read 계약. 직전 PASS를 유지하며 이번 변경에서 건드리지 않았다.

## 신규 파일 및 작업트리

신규 파일:

- `docs/dev-reports/2026-07-31-1001-s2-r3-idempotency-fingerprint.md`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishFingerprintTest.java`

`git status --porcelain` 원문:

```text
 M services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java
?? docs/dev-reports/2026-07-31-1001-s2-r3-idempotency-fingerprint.md
 ?? services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishFingerprintTest.java
```

추가 검증:

```text
git diff --check
```

종료코드 0.
