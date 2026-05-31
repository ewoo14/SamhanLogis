# D2 다중주문 병합→단일 출고전표 — BE 코드 리뷰 (사이클 1)

- 리뷰어: Claude BE Agent
- 일자: 2026-05-31
- 브랜치: feat/d2-order-merge-to-slip
- 리뷰 범위: slip-service / partner-order-service 변경분 (git diff origin/main...HEAD)

---

## 종합 판정: CHANGES_REQUESTED

P0 결함 2건, P1 결함 4건 확인. 머지 전 수정 필요.

---

## P0 — 즉시 수정 필수

### P0-1: SlipSourceOrder 에 `@Version` / `version` 컬럼 누락

**파일**: `slip-service/.../domain/SlipSourceOrder.java` (전체)  
**파일**: `slip-service/src/main/resources/db/migration/V30__create_slip_source_orders.sql` (전체)

**근거**:  
`V1__init_slip_service.sql` 주석에 "낙관적 락: version BIGINT NOT NULL DEFAULT 0" 이 명시되어 있으며, `Slip` 엔티티에도 `@Version private Long version` 이 존재한다 (Slip.java:544). 그러나 `SlipSourceOrder`에는 `@Version` 필드가 없고 V30 마이그레이션에도 `version` 컬럼이 없다. 프로젝트 컨벤션("BaseEntity + version")을 위반한다.

**권고**: `SlipSourceOrder`에 `@Version @Column(name = "version", nullable = false) private Long version = 0L;` 추가, V30 에 `version BIGINT NOT NULL DEFAULT 0` 추가. 단, `SlipSourceOrder`는 한 번 INSERT 후 업데이트가 없으므로 실질 위험은 낮지만 컨벤션 일관성을 위해 필수.

---

### P0-2: V30 audit 컬럼 스키마가 V1 기준(`NOT NULL`/`VARCHAR(50)`)과 불일치

**파일**: `V30__create_slip_source_orders.sql:9,11,13`

**근거**:  
`V1__init_slip_service.sql:38`에서 `created_by VARCHAR(50) NOT NULL`이다. V30은 `created_by VARCHAR(255)`이며 `NOT NULL` 제약이 없다. `BaseEntity`의 `@Column(name = "created_by", nullable = false, updatable = false, length = 50)` 과도 어긋난다. Hibernate DDL 검증에서 length mismatch 로 경고 또는 실패 가능.

**권고**: V30 의 `created_by / modified_by / deleted_by` 를 `VARCHAR(50)`, `created_by NOT NULL`로 수정. `created_at NOT NULL`, `modified_at NOT NULL`도 확인 필요.

---

## P1 — 머지 전 수정 강력 권고

### P1-1: `@Transactional` 내 `ResponseStatusException` 전파 시 트랜잭션 롤백 여부 미보장

**파일**: `PartnerOrderMergeConvertService.java:91(@Transactional), 96, 114, 139, 143`

**근거**:  
Spring `@Transactional`의 기본 rollback 대상은 `RuntimeException` 과 `Error` 이다. `ResponseStatusException extends RuntimeException` 이므로 롤백은 되지만, **트랜잭션 롤백이 발생하면 reserve 보상(compensate)은 이미 완료되었지만 DB 변경사항도 함께 롤백**된다. 이는 의도된 동작이다.

그러나 현재 reserve 보상이 `@Transactional` 내부에서 수행되므로, 보상 후 `throw ex` 로 `ResponseStatusException`을 전파하면 트랜잭션 롤백이 일어난다. 이때 `compensate()` 내부의 `inventoryClient.release()` 호출은 **외부 HTTP 호출**이라 이미 완료된 상태이고 롤백되지 않는다. 이 점은 올바르다.

문제는 `warehouseCode null` 체크(라인 96)가 reserve **이전**에 발생하므로 보상 대상이 없는데도 롤백이 일어나는 점이다 — 이는 harmless하다. 실질적인 위험은 **`reserveTargets` 가 비어있어도 `buildIdempotencyKey`/`buildConvertKeyUuid` 가 빈 리스트로 동작**하여 항상 같은 해시(빈 문자열 SHA-256)를 반환하는 경우다. 단일 라인이라도 있으면 이 문제는 없지만, 빈 요청이 검증 없이 도달하면 idempotencyKey 가 동일해진다.

**권고**: `reserveTargets.isEmpty()` 사전 가드 추가 — `@NotEmpty` 가 `req.orders()` 에만 있고 개별 `items` 는 `@NotEmpty` 가 있지만 서비스 레이어에서 추가 방어 추천.

---

### P1-2: `PublishResult.duplicate()` 수신 시에도 `line.convert(qty)` + `saveAll` 무조건 실행

**파일**: `PartnerOrderMergeConvertService.java:214-227`

**근거**:  
slip-service 가 멱등 replay(동일 키 + 동일 본문)로 `PublishResult.duplicate(slipNo)` 를 반환해도, 서비스는 `result.duplicate()` 를 확인하지 않고 항상 `t.line().convert(t.quantity())` + `orderRepository.saveAll(orders)` 를 실행한다. 이는 **이중 convertedQuantity 누적**을 유발한다.

단일주문 전환(`PartnerOrderConvertService`)도 `result.duplicate()` 를 확인하지 않는 점은 동일하지만, 단일 전환은 idempotencyKey가 `orderId:lineId:convertedBefore:qty` 기반이므로 convertedQuantity가 변경되면 키가 달라진다. 병합 전환도 동일하게 `convertedBefore`를 포함하지만, **같은 요청을 재전송할 때 이미 convertedQuantity 가 증가된 상태**라면 키가 다르게 생성되어 slip-service 에서 새 전표가 발행된다. 즉, `duplicate` 케이스는 실제로 발생하기 어렵지만, 발생 시 더블 누적 위험이 있다.

**권고**: `if (!result.duplicate()) { ... line.convert() ... saveAll() ... }` 패턴 적용. 단일 전환 서비스와 패턴 일치 여부도 같이 검토 권고.

---

### P1-3: `findBySource` UNION 경로에서 N+1 쿼리 발생

**파일**: `SlipPublishService.java:368-371`

**근거**:  
```java
sourceOrderRepository.findAllByPartnerOrderId(orderId)
    .forEach(so -> slipRepository.findById(so.getSlipId()) ...);
```
`findAllByPartnerOrderId` 결과 행 수만큼 `slipRepository.findById()` 가 별도 SELECT 를 발행한다. 병합 주문이 많을 경우(운영 확장) N+1 문제가 된다. 현재 요건(소규모 병합)에서는 허용 가능하나 명시적 위험 표시가 없다.

**권고**: `slipRepository.findAllById(slipIds)` 로 배치 조회 후 soft-delete 필터 적용. 또는 JPQL/네이티브 단일 쿼리로 대체. 단기에는 주석으로 N+1 위험과 허용 임계 문서화.

---

### P1-4: `@Transactional` 클래스 레벨 + `slip_source_orders` INSERT 가 Slip saveAndFlush 이후 별도 실행 — 부분 성공 위험

**파일**: `SlipPublishService.java:313-324`

**근거**:  
`SlipPublishService` 는 클래스 레벨 `@Transactional` 이다 (라인 79). `slipRepository.saveAndFlush(slip)` 후 `sourceOrderRepository.save(...)` N회 반복이 같은 트랜잭션 내에 있으므로 정상적으로는 원자적이다.

그러나 `slip_source_orders` INSERT 루프 중 하나가 실패(예: `UUID.fromString(ref.partnerOrderId())` 에서 `IllegalArgumentException`)하면 전체 트랜잭션이 롤백된다. 이 예외는 롤백을 유발하여 Slip 도 함께 롤백되므로 원자성은 유지된다.

문제는 `UUID.fromString(ref.partnerOrderId())` 에서 `IllegalArgumentException` 이 발생할 경우 이를 명시적으로 처리하는 코드가 없다는 점이다. 호출자(partner-order-service)가 UUID 형식을 보장하지만, 서버 측 방어가 없다.

**권고**: `UUID.fromString()` 호출부에 try-catch 또는 사전 `@NotBlank @Size(max=36)` 유효성 검증이 `SourceOrderRef` 에 있으므로(`@Valid` 전파 확인 필요) 현 상태에서는 `@Valid @RequestBody` 로 충분히 방어되는지 컨트롤러 레이어 검증. 단순히 `@Valid` 가 동작하는지 IT 에서 검증하는 케이스 추가 권고.

---

## P2 — 개선 권고 (머지 블로킹 아님)

### P2-1: `MergeConvertToSlipRequest.warehouseCode` 에 `@NotBlank` 어노테이션 누락

**파일**: `MergeConvertToSlipRequest.java:21`

**근거**:  
```java
public record MergeConvertToSlipRequest(
    @NotNull @NotEmpty @Valid List<OrderItems> orders,
    String warehouseCode,          // @NotBlank 없음
    @Valid ShippingInfo shippingInfo) {}
```
서비스 레이어(라인 96)에서 null/blank 체크를 하므로 기능적 문제는 없지만, Jakarta Validation 레이어에서 먼저 잡아야 일관성이 있다. `@NotBlank` 추가 시 서비스 레이어의 수동 체크를 제거 가능.

---

### P2-2: `computeMergeFingerprint` 에 `shippingAddress` / `receiverPhone` 비포함

**파일**: `SlipPublishService.java:646-660`

**근거**:  
fingerprint 에 `shippingAddress`, `receiverPhone` 이 포함되지 않는다. 같은 idempotencyKey + 같은 주문/라인 조합에서 배송지만 다른 요청이 올 경우 replay 로 처리되어 배송지 변경이 무시된다. 설계상 "같은 병합 요청이면 replay"가 맞는지, "배송지 다르면 conflict" 가 맞는지 명확히 해야 한다.

현행 `partnerCode / warehouseCode / paymentDueLabel / discountInfo / memo` 포함이 의도적이면 Javadoc 에 명시적으로 "배송지는 fingerprint 비포함 — 같은 병합 조합은 replay" 라고 문서화 권고.

---

### P2-3: `@SQLRestriction` 과 `findById` soft-delete 이중 필터 — 항상 true 조건

**파일**: `SlipPublishService.java:369-371`

**근거**:  
```java
slipRepository.findById(so.getSlipId())
    .filter(s -> !Boolean.TRUE.equals(s.getIsDeleted()))
```
`SlipRepository`가 이미 `@SQLRestriction("is_deleted = false")` 가 있는 경우, `.filter(s -> !Boolean.TRUE.equals(s.getIsDeleted()))` 는 항상 true 조건이 된다 (soft-delete 된 행은 이미 조회되지 않으므로). 코드 혼동을 줄이기 위해 제거 권고. 단, `Slip` 엔티티에 `@SQLRestriction` 이 없다면 이 필터가 필요하므로 먼저 확인.

---

### P2-4: `partnerCode` 검증 순서 — 거래처 검증이 `sourceOrders` 처리 이후

**파일**: `SlipPublishService.java:283`

**근거**:  
`publishFromOrdersMerge` 에서 `verifyPartnerOrThrow(req.partnerCode())` 는 `resolveWarehouseId`, `resolveLines` 등 무거운 처리 전에 실행된다(라인 283). 순서는 적절하다. 다만, partner-order-service 가 이미 `partnerCode` 동일성을 검증 후 호출하므로 slip-service 에서의 검증은 defense-in-depth 목적임을 Javadoc 에 명시 권고.

---

### P2-5: `buildConvertKeyUuid` — SHA-256 hex 앞 32자가 valid UUID 형식 보장 여부

**파일**: `PartnerOrderMergeConvertService.java:278-285`

**근거**:  
UUID 는 버전 비트(7번째 그룹 앞 4자리 첫 번째 자리 = 4, 9번째 그룹 첫 번째 자리 = 8/9/a/b)를 가진다. 현 구현은 이 비트를 강제하지 않으므로 생성된 UUID 가 표준 RFC 4122 v4 가 아니지만, `UUID.fromString()` 통과 자체는 문제 없다. inventory 서비스가 referenceId 를 문자열로 저장한다면 기능 문제 없음. 단, UUID type 검사 강화 시 이슈 가능성 명시 권고.

---

### P2-6: IT 테스트 — 멱등 재시도 후 `slip_source_orders` 이중 INSERT 가능성 미검증

**파일**: `SlipPublishMergeIT.java:케이스3 (약 220행)`

**근거**:  
케이스 3에서 멱등 재시도 시 `slip_source_orders` 2행만 존재하는지 단언한다. 그러나 현재 `publishFromOrdersMerge` 로직을 보면, 멱등 재시도 시 `lookupByIdempotencyKey` 가 기존 Slip 을 찾고 `assertReplayOrConflict` 를 즉시 반환하므로, `sourceOrderRepository.save()` 루프에 도달하지 않는다. 즉 이중 INSERT 는 실제로 발생하지 않는다. 단지 테스트가 이 경로(replay 조기 반환)를 명시적으로 입증하고 있다 — 이는 올바르다.

개선 제안: 케이스 3의 단언에 `sourceOrderRepository.findAllBySlipId(slipId).size() == 2` 가 포함되어 있으므로 충분하다. 다만 두 번째 호출 후 sourceOrders 행이 4가 아닌 2임을 확인하는 코멘트를 명시하면 가독성 향상.

---

## 중점 검토 항목별 요약

| 검토 항목 | 결과 |
|---|---|
| 1. 원자성/보상 정확성 | 부분 이슈 — P1-2(duplicate 수신 시 이중 누적 가능), reserve 예외 후 보상 경로는 정확 |
| 2. 멱등성 | 전반적으로 양호, P1-2 edge case 존재 |
| 3. 계약 정합 | payload 키(sourceOrders/lines/warehouseId) 일치 확인됨 — 이상 없음 |
| 4. 회귀 0 | publishFromPartnerOrder / PartnerOrderConvertService 무변경 확인됨 |
| 5. findBySource UNION | 동작 정확, N+1 P1-3 이슈, UUID 예외 안전 처리 확인됨 |
| 6. partnerCode 동일성 검증 위치 | reserve/publish 전 정확히 위치, 409 처리 올바름 |
| 7. BaseEntity/soft-delete/Javadoc/도메인 메서드 | version 컬럼 누락(P0-1), audit 컬럼 불일치(P0-2), Javadoc 양호 |
| 8. IT @MockBean 격리 | 모든 외부 client MockBean 완비, skipped=0 예상 |
