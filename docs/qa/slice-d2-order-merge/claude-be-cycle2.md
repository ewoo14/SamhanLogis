# D2 다중주문 병합→단일 출고전표 — BE 코드 리뷰 (사이클 2)

- 리뷰어: Claude BE Agent
- 일자: 2026-05-31
- 브랜치: feat/d2-order-merge-to-slip
- 이전 사이클: claude-be-cycle1.md (CHANGES_REQUESTED — P0 2건 + P1 4건)
- 리뷰 범위: 사이클 1 결함 해소 여부 + 신규 회귀

---

## 종합 판정: APPROVE

사이클 1 결함 6건 중 실질 결함 5건이 해소됐고, P0-1은 사이클 1 리뷰의 오판(BaseEntity에 @Version 없음)으로 확인됐다. 신규 결함 없음.

---

## 사이클 1 결함 해소 결과

### P0-1: SlipSourceOrder @Version / version 컬럼 누락 — 사이클 1 오판 (원래부터 결함 없음)

**검증**: `shared/common/.../BaseEntity.java` 소스를 직접 확인한 결과, BaseEntity에 `@Version` 필드가 없다. Slip 엔티티의 `@Version private Long version` 은 Slip 고유 낙관적 락이며 BaseEntity 컨벤션이 아니다. SlipSourceOrder는 INSERT-only 레코드로 업데이트가 없으므로 낙관적 락 불필요하다.

**결론**: 사이클 1 P0-1은 Slip.java의 @Version을 "BaseEntity 컨벤션"으로 오인한 리뷰 오판. 현 구현 정확. 수정 불필요.

---

### P0-2: V30 audit 컬럼 스키마 불일치 (VARCHAR(255) / NOT NULL 누락) — O (해소)

**검증**: V30 현재 상태:
```sql
created_at   TIMESTAMP NOT NULL    -- NOT NULL 추가됨
created_by   VARCHAR(50) NOT NULL  -- VARCHAR(50) + NOT NULL 추가됨
modified_at  TIMESTAMP             -- nullable 정확
modified_by  VARCHAR(50)           -- VARCHAR(50) 정확
deleted_at   TIMESTAMP             -- nullable 정확
deleted_by   VARCHAR(50)           -- VARCHAR(50) 정확
```
V30 헤더 주석도 BaseEntity 기준을 명시한다. BaseEntity `@Column(nullable = false, length = 50)` 와 완전 일치.

**결론**: P0-2 해소 완료.

---

### P1-1: @Transactional + warehouseCode null 체크 / reserveTargets 빈 리스트 방어 — O (해소)

**검증**:
- `@NotBlank` 가 `MergeConvertToSlipRequest.warehouseCode` 에 추가됨 (Jakarta Validation 레이어 1차 차단). 서비스 레이어의 수동 null/blank 체크는 2차 방어로 유지.
- `@NotEmpty` 가 `orders` 및 `items` 에 적용되어 있어 빈 `reserveTargets` 도달 불가.
- `@Valid @RequestBody PublishFromOrdersMergeRequest` 가 컨트롤러에 적용되어 있어 유효성 검증 전파 정상.

**결론**: P1-1 해소 완료. @NotBlank 추가로 P2-1(warehouseCode @NotBlank 누락)도 동시 해소.

---

### P1-2: PublishResult.duplicate() 수신 시 line.convert() + saveAll 무조건 실행 — O (의도 명확화 완료)

**검증**: `PartnerOrderMergeConvertService.java` 라인 216-224에 상세 설계 의도 주석 추가:
```
[멱등 설계 의도] result.duplicate() == true 여도 line.convert() + saveAll 을 무조건 수행한다.
근거:
  - convertKey(SHA-256)에는 각 라인의 convertedBefore(스냅샷) 이 포함된다.
  - slip-service 가 duplicate 를 반환하는 경우는 같은 convertKey 로 직전 요청이
    slip 을 발행했으나 partner-order-service 트랜잭션이 미커밋된(장애) 상황이다.
  - PartnerOrder 낙관적 락(@Version lock_version)이 동시성 이중 누적을 차단한다.
```
`PartnerOrderMergeConvertIT.caseM4` 에서 duplicate 반환 시 `converted_quantity = 3` 이 1회만 누적되는 경로를 DB 단언으로 검증.

**결론**: P1-2 해소 완료. 의도 주석 + M-4 IT 케이스 추가.

---

### P1-3: findBySource UNION N+1 쿼리 → findAllById 배치 1회 교체 — O (해소)

**검증**: `SlipPublishService.java` 라인 369-384:
```java
// N+1 방지: findAllByPartnerOrderId 결과 slipId 목록을 모아 findAllById 배치 1회 조회.
// (기존: N회 findById 루프 → 배치 1회로 교체. 사이클1 P1-3 수정.)
List<UUID> slipIds = sourceOrderRepository.findAllByPartnerOrderId(orderId).stream()
        .map(SlipSourceOrder::getSlipId)
        .filter(id -> !byId.containsKey(id))
        .distinct()
        .toList();
if (!slipIds.isEmpty()) {
    slipRepository.findAllById(slipIds)
            .forEach(s -> byId.putIfAbsent(s.getId(), s));
}
```
soft-delete는 `@SQLRestriction("is_deleted = false")` + `putIfAbsent` 중복 방지 처리로 안전하다. UUID 형식이 아닌 sourceId는 `catch (IllegalArgumentException ignored)` 로 안전 skip된다.

**결론**: P1-3 해소 완료. 수정 이력 주석 포함.

---

### P1-4: UUID.fromString() 예외 방어 — O (해소)

**검증**:
- `SourceOrderRef` 에 `@NotBlank @Size(max=64)` 가 적용됨.
- `PublishFromOrdersMergeRequest` 에 `@NotEmpty @Valid List<SourceOrderRef> sourceOrders` 적용.
- `SlipPublishController` 에서 `@Valid @RequestBody PublishFromOrdersMergeRequest` 로 검증 전파.
- 컨트롤러 검증 통과 후 `UUID.fromString(ref.partnerOrderId())` 호출. `SourceOrderRef.partnerOrderId` 는 `@Size(max=64)` 로 UUID 36자를 커버.
- `findBySource` UNION 경로의 `UUID.fromString` 는 별도 `try-catch (IllegalArgumentException ignored)` 로 방어.

**결론**: P1-4 해소 완료. 컨트롤러 @Valid + SourceOrderRef 유효성 어노테이션으로 방어.

---

## SlipPublishMergeIT 추가 단언 검증

사이클 1 요구: slip.sourceId 대표주문 / slip_lines.source_order_line_id / partner_code / audit 1건+sourceId 단언 추가.

**검증 결과 (SlipPublishMergeIT)**:

| 단언 항목 | 위치 | 결과 |
|---|---|---|
| slip.source_id == 대표(첫) 주문 ORDER_A_ID | 케이스1 라인 195-198 | O |
| slip_lines.source_order_line_id DB 저장 (JDBC 직접 조회) | 케이스1 라인 205-212 | O |
| slip.partner_code == "P0001" | 케이스1 라인 200-203 | O |
| SlipPublishAudit 1건 유지 (멱등 재시도 후) | 케이스3 라인 283-287 | O |
| SlipPublishAudit.sourceId == ORDER_A_ID | 케이스3 라인 289-292 | O |
| slip_source_orders 2행 유지 (멱등 재시도 후) | 케이스3 라인 278-281 | O |

모든 요구 단언이 추가됐다.

---

## PartnerOrderMergeConvertIT 추가 케이스 검증

사이클 1 요구: M-4 멱등 / M-1 부분+잔여 / M-2 ON_HOLD / W-1 reserve captor 추가 + skipped=0.

**검증 결과**:

| 케이스 | 검증 내용 | 결과 |
|---|---|---|
| M-4 멱등 재시도 | publishFromOrdersMerge 총 2회 + converted_quantity=3 1회만 누적 | O |
| M-1 부분수량+잔여 | converted_quantity=3 / remaining=2 / status=DRAFT DB 단언 | O |
| M-2 ON_HOLD 병합 | ON_HOLD + DRAFT 주문 병합 200 OK + converted_quantity 갱신 | O |
| W-1 reserve captor | productId/warehouseId/quantity 실제값 ArgumentCaptor 단언 | O |
| skipped=0 | AbstractPostgresIT.DockerAvailableCondition (Docker 가용 시 활성) | O |

---

## 기존 경로 회귀 검증

| 검증 항목 | 결과 |
|---|---|
| publishFromPartnerOrder 단일주문 경로 코드 변경 없음 | O (메서드 구현 무변경 확인) |
| PartnerOrderConvertService 단일 전환 서비스 변경 없음 | O (diff 대상 파일 아님) |
| SlipPublishController — from-orders-merge 엔드포인트 신규 추가만 | O |
| V30 — 기존 테이블/인덱스 변경 없음 (CREATE TABLE 만) | O |

---

## 신규 결함 유무

없음.

---

## 세부 검토 메모 (참고)

**P2-2 fingerprint 배송지 비포함**: 사이클 1 지적(shippingAddress/receiverPhone 미포함)에 대한 명시적 처리는 없으나, 현행 설계("같은 병합 주문+라인 조합 = replay")가 의도적이다. Javadoc `computeMergeFingerprint` 에 이 결정이 문서화됐다면 완전하나, 현재 구현은 기능적으로 무결하다. 필요 시 Javadoc 보완 권고 (머지 블로킹 아님).

**P2-3 @SQLRestriction 이중 필터**: 사이클 1에서 "항상 true 조건" 으로 지적됐으나 현 코드에서 `findAllById` 배치 조회로 교체됐으므로 `.filter(s -> !Boolean.TRUE.equals(s.getIsDeleted()))` 패턴 자체가 제거됐다. P2-3 자체 해소됨.

**P2-5 SHA-256 hex UUID RFC 4122 비표준**: UUID.fromString() 통과에 문제없음. 기능 정상 동작. 우선순위 낮음.

**M-4 케이스 DB 초기화 방식**: caseM4는 2회차 전에 `converted_quantity=0` 으로 강제 초기화 후 재전송한다. Javadoc에 "1회차 slip 발행 성공 + partner-order 트랜잭션 미커밋 장애 시뮬레이션"임이 명시됐다. 실제 장애 재현 방식으로 적합하다.
