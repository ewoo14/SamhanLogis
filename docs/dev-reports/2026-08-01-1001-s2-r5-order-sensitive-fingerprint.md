# PR #1003 (Issue #1001) fix 라운드 보고서

## 작업 범위

병합 지문이 현재 발행 결과를 정확히 반영하도록 병합 입력 순서만 지문에 보존한다. `null` ↔ 빈 문자열 정규화와 `lineNo` 제거는 유지한다. 병합 대표 `sourceId` 선택 규칙이나 발행 동작 자체는 변경하지 않는다.

## 진행 기록

- 보고서 최초 생성: 2026-08-01
- RED 테스트 작성·실패 확인 완료
- 구현 변경·집중 테스트 통과 완료

## 지문 구성 필드 표

| 필드 | 포함 | 결과를 바꾸는가 | 근거 |
|---|---:|---:|---|
| `kind` | 포함 | 아니오 | 병합 경로 식별자일 뿐 발행 결과 차이가 아니다. |
| 병합 `sourceOrders` 입력 순서 | 포함·보존 | 예 | 첫 주문이 대표 `sourceId`가 된다. |
| 병합 `sourceOrders` 각 `partnerOrderId`·`orderNo` | 포함 | 예 | 출처 주문과 출처 추적 결과를 구성한다. |
| 발행 헤더(`ioDate`, `partnerId`, `warehouseCode`, `warehouseId`, `partnerCode`, `partnerName`, `shippingAddress`, `deliveryAddress`, `receiverPhone`, `employeeCode`, `paymentDueLabel`, `discountInfo`, `memo`) | 포함 | 필드별 발행 결과가 달라지는 경우 예 | 요청 DTO가 전표 헤더에 반영되며, nullable text는 결과가 같을 때만 정규화한다. |
| 병합 라인 입력 순서 | 포함·보존 | 예 | 전표 라인 배열이 요청 순서를 유지한다. |
| 라인 발행 필드(`productCode`, `productName`, `qty`, `spec`, 선택 단가, `supplyAmount`, `vatAmount`, `remarks`, `sourceOrderLineId`) | 포함 | 예 | 필드가 실제 라인 결과를 바꾸는 경우 지문도 달라진다. |
| `null` ↔ 빈 문자열 정규화 대상(`ioDate`, `warehouseId`, `partnerCode`, `employeeCode`, `memo`) | 유지 | 아니오 | downstream 발행 결과가 동일한 값으로 수렴한다. |
| `lineNo` | 제외 유지 | 아니오 | DTO에만 존재하고 저장·발행 라인 결과에 전달되지 않는다. |

## RED 원문

테스트 단정을 `isEqualTo`에서 `isNotEqualTo`로 먼저 변경하고 다음 명령을 실행했다.

```text
명령: ./gradlew :services:slip-service:test --tests com.samhanair.logis.slip.publish.SlipPublishFingerprintTest
종료코드: 1

SlipPublishFingerprintTest > merge_fingerprint_distinguishes_source_and_line_order_that_changes_publish_result() FAILED
    java.lang.AssertionError at SlipPublishFingerprintTest.java:51
4 tests completed, 1 failed

BUILD FAILED
```

실패 원인은 구현이 `sourceOrders`와 `lines`를 정렬하여 순서가 다른 병합 요청의 지문을 동일하게 만들고 있기 때문이다.

## 변경 요지

- `computeMergeFingerprint`의 `sourceOrders` 정렬을 제거해 요청 순서를 그대로 JSON에 반영했다.
- `canonicalLines`의 정렬을 제거해 라인 배열 순서를 그대로 JSON에 반영했다.
- legacy 병합 지문은 변경하지 않았다. 단건 지문, `null`/빈 문자열 정규화, `lineNo` 제외도 변경하지 않았다.
- Javadoc의 정렬 표현을 입력 순서 보존으로 바로잡았다.

## 실측

공유 DB에는 쓰지 않고 `docker exec ... psql -c "SELECT ..."` 읽기 전용 조회만 실행했다.

```text
명령: docker exec samhan-postgres psql -U samhan -d slip_db -At -F '|' -c "SELECT count(*) FILTER (WHERE s.is_deleted=false AND a.is_deleted=false AND a.source_type='PARTNER_ORDER'), count(*) FILTER (WHERE s.is_deleted=false AND a.is_deleted=false AND a.source_type='PARTNER_ORDER' AND s.idempotency_key LIKE 'PO-MRG-%'), count(*) FILTER (WHERE s.is_deleted=false AND a.is_deleted=false AND a.source_type='PARTNER_ORDER' AND s.idempotency_key NOT LIKE 'PO-MRG-%') FROM slips s JOIN slip_publish_audit a ON a.slip_id=s.id;"
종료코드: 0
원문: 16|3|13
```

```text
명령: docker exec samhan-postgres psql -U samhan -d slip_db -At -F '|' -c "SELECT count(*) FILTER (WHERE s.is_deleted=false AND a.is_deleted=false AND a.source_type='PARTNER_ORDER' AND a.request_fingerprint IS NOT NULL AND s.idempotency_key LIKE 'PO-MRG-%'), count(*) FILTER (WHERE s.is_deleted=false AND a.is_deleted=false AND a.source_type='PARTNER_ORDER' AND a.request_fingerprint IS NOT NULL AND s.idempotency_key NOT LIKE 'PO-MRG-%'), count(*) FILTER (WHERE s.is_deleted=false AND a.is_deleted=false AND a.source_type='PARTNER_ORDER' AND a.created_at > TIMESTAMP '2026-07-31 23:59:17+09') FROM slips s JOIN slip_publish_audit a ON a.slip_id=s.id;"
종료코드: 0
원문: 3|13|0
```

판정: 노출 키 16개(단건 13·병합 3)의 replay 모집단과 지문 보유 상태가 유지되며, 기준시각 이후 신규 audit는 0건이다. 따라서 새로 막히는 정상 발행은 **0건**이다. 실 데이터의 병합 후보 3건은 모두 다중 출처·다중 라인이고, 코드에서 첫 `sourceOrders`가 대표 `sourceId`가 되고 라인 입력 순서가 저장 순서를 결정한다.

순서가 다른 두 병합 요청은 RED 후 GREEN 테스트에서 지문이 서로 다름을 확인했다.

## 테스트

### RED

- 명령: `./gradlew :services:slip-service:test --tests com.samhanair.logis.slip.publish.SlipPublishFingerprintTest`
- 종료코드: **1**
- 결과: 순서 구분 단정이 `AssertionError`로 실패, `4 tests completed, 1 failed`.

### GREEN

- 명령: `./gradlew :services:slip-service:test --tests com.samhanair.logis.slip.publish.SlipPublishFingerprintTest`
- 종료코드: **0**
- 결과: `BUILD SUCCESSFUL`, 4개 지문 테스트 통과. 순서 구분, `null`/빈 문자열 동일, `lineNo` 무관, 단건 배송주소 차이 회귀를 포함한다.

- 명령: `git diff --check`
- 종료코드: **0**
- 결과: 공백 오류 없음.

- 명령: `git status --porcelain`
- 종료코드: **0**
- 결과: 아래 2개 수정 파일과 신규 보고서 1개만 표시되며, git 쓰기 산출물은 없다.

새 단정의 Linux 판정: 테스트와 구현은 Java `List` 순서, Jackson JSON 직렬화, SHA-256만 사용하고 OS API·locale·경로 구분자에 의존하지 않는다. 따라서 `ubuntu-latest`에서 같은 입력 순서에 같은 JSON 순서와 서로 다른 지문이 만들어진다.

## 이번에 안 본 것

- 병합이 순서 의존인 현재 발행 동작 자체의 변경(대표 `sourceId` 선택 규칙·발행 결과 변경)
- legacy 경로 — PASS 상태로 유지하며 코드 변경·재검증하지 않음
- 슬라이스 1 원장 read 계약 — PASS 상태로 유지
- 슬라이스 3·4·5
- 과거 배송주소 backfill
- 마이그레이션 번호 변경
- Docker 재빌드·재기동, 실제 HTTP POST/replay, 공유 DB write

## 신규 파일 및 작업 트리

신규 파일:

- `docs/dev-reports/2026-08-01-1001-s2-r5-order-sensitive-fingerprint.md`

`git status --porcelain` 원문:

```text
 M services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java
 M services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishFingerprintTest.java
?? docs/dev-reports/2026-08-01-1001-s2-r5-order-sensitive-fingerprint.md
```
