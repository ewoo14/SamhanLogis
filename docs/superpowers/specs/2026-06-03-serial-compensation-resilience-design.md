# 시리얼 분산 보상 견고화 — 설계

> Phase INV-S 후속 ⓑ. D-SER-05(동기 REST + best-effort 보상) 한계 보완.
> branch `feat/serial-compensation-resilience`. slip-service 단독(inventory 무변경).

## 문제 (실코드 근거)

`SlipService.accept`(OUTBOUND 예약)와 `completeRecallInbound`(회수)는 원격 inventory 호출이 slip 트랜잭션에 묶이지 않으므로(동기 REST), 혼합 전표 라인 중간 실패 시 이미 성공한 원격 예약/회수를 **역순 보상**(`releaseInstances`/`unrecallInstances`)한다. 그러나 보상 자체가 실패하면:

```java
} catch (RuntimeException compensationFailure) {
    ex.addSuppressed(compensationFailure);   // ← 조용히 삼킴
}
throw ex;
```

`addSuppressed` 는 원본 예외 스택의 suppressed 배열에만 남아 **구조적 로그·영속 감사·운영 알림이 전무**. 결과적으로 inventory 측에 고아 RESERVED/RECALLED 인스턴스가 남아도 운영자가 인지·복구할 수단이 없다. (D-SER-05 가 명시한 best-effort 한계의 핵심 미관측 지점.)

### 왜 inventory `stock_movements` 가 아닌가

보상 실패의 전형적 원인은 **inventory-service 도달 불가/오류**다. 따라서 실패 사실을 inventory 측 `stock_movements` 에 기록하려는 시도 역시 같은 이유로 실패할 수 있다. 보상 실패는 **호출자(slip) 측에서 영속·관측**하는 것이 올바르다(slip 자신의 트랜잭션/DB 는 정상).

## 목표 (YAGNI — 관측·영속·복구단서, 분산 트랜잭션 재작성 아님)

1. 보상 실패를 **조용한 삼킴 → 구조적 WARN 로그**로 전환(안정 마커 `[COMPENSATION_FAILURE]` + 컨텍스트).
2. 보상 실패를 **slip 측 append-only 감사 테이블**에 1행 영속 → 운영자가 미해소 고아 재고를 조회·수동 정합.
3. 운영 알림은 WARN 로그(로그 기반 경보)가 1차 채널. notification-service 실연동은 **후속**(seam 만 마련, YAGNI).
4. Saga/outbox 등 분산 트랜잭션 인프라는 **본 슬라이스 범위 외**(D-SER-05 한계는 "관측 가능"으로 1차 완화, 자동 재시도는 후속).

## 설계

### 1. 보상 실패 감사 엔티티 + V31

- `V31__create_serial_compensation_failures.sql` (slip-service, 최신 V30 다음).
- 엔티티 `SerialCompensationFailure extends BaseEntity` (`SlipPublishAudit` 패턴: `@UuidGenerator` + `@SQLRestriction("is_deleted = false")`, soft-delete 영구보존).
- 컬럼:
  - `slip_id`(UUID, logical FK), `slip_no`(String), `slip_type`(enum STRING)
  - `phase`(enum: `ACCEPT_RESERVE` / `COMPLETE_RECALL`) — 어느 보상 흐름인지
  - `product_code`(String) — 보상 대상 품목(사용자 노출 식별자, UUID 비공개 원칙)
  - `attempted_operation`(enum: `RELEASE` / `RELEASE_INSTANCES` / `UNRECALL_INSTANCES`) — 실패한 보상 동작
  - `failure_reason`(String 1000) — 보상 예외 메시지(원인 클래스+message, 스택 제외)
  - `original_failure_reason`(String 1000) — 보상을 촉발한 원본 예외 요약
  - `resolved`(boolean, default false) — 운영자 수동 정합 완료 플래그(후속 복구 API 용 자리)
- `SerialCompensationFailureRepository`(JpaRepository).
- append-only: 도메인 정적 팩토리 `of(...)`, setter 없음.

### 2. 공통 보상 실행 헬퍼

- `SlipService` 에 `runCompensationsWithAudit(Slip slip, CompensationPhase phase, List<Compensation> comps, RuntimeException originalEx)` 추출.
- `Compensation` = `{ String productCode; CompensationOperation op; Runnable action; }` 경량 레코드.
- 동작: 역순 실행 → 각 실패마다 (a) `log.warn("[COMPENSATION_FAILURE] slipNo={} type={} phase={} product={} op={} cause={}", ...)` (b) `SerialCompensationFailure` 1행 저장(별도 REQUIRES_NEW 트랜잭션 — 원본 롤백과 독립 영속) (c) `originalEx.addSuppressed`.
- `accept`/`completeRecallInbound` 의 기존 인라인 보상 루프를 이 헬퍼 호출로 교체(중복 제거). batch·serial 보상 **공통 적용**(둘 다 동일 미관측 위험 → "시리얼 한정" 보다 공통이 견고; audit 는 productCode 기반).

### 3. REQUIRES_NEW 영속 보장

- 보상은 원본 예외로 slip 트랜잭션이 롤백되는 경로에서 실행되므로, 같은 트랜잭션에 audit 를 쓰면 함께 롤백된다. → audit 저장은 `@Transactional(REQUIRES_NEW)` 보조 빈(`CompensationAuditWriter`)을 통해 독립 커밋. self-invocation 프록시 우회를 위해 별도 빈으로 분리.

### 4. 운영 알림 seam (YAGNI)

- `CompensationAuditWriter.record(...)` 가 WARN 로그 + DB 저장만 수행. notification-service 푸시는 TODO 주석 + 후속 슬라이스. 본 슬라이스에서 cross-service 호출 추가 없음.

## 배포·범위

- slip-service 단독(V31 + 코드). inventory/product 무변경. 배포 순서 영향 없음.
- 조회/복구 API(`GET compensation-failures`, `resolved` 토글)는 **후속**(YAGNI — 본 슬라이스는 영속·관측까지).

## 테스트

- 단위: `runCompensationsWithAudit` — 보상 1건 실패 시 audit 1행 + WARN + addSuppressed, 전건 성공 시 audit 0행. accept/completeRecallInbound 보상 경로 mock(InventoryClient 실패 주입).
- IT(실 Testcontainers, skipped=0): accept 혼합전표 2번째 라인 실패 + 보상 실패 주입 → `serial_compensation_failures` 1행 커밋(REQUIRES_NEW 독립) 검증.
- date-bomb 회피(고정 시각 주입), BaseEntity 7 audit + soft-delete, UUID 비공개(응답/로그 productCode 사용).

## 자기검토

- REQUIRES_NEW 누락 시 audit 가 원본 롤백과 함께 사라짐 → 별도 빈 + 전파속성 필수(IT 로 커밋 독립 검증).
- 보상 실패가 0건이면 audit 미기록(정상 경로 오염 없음).
- "시리얼 한정" → batch 공통 적용으로 확장(헬퍼 공통, 더 견고). DECISIONS 에 명시.
- 멱등: 동일 보상 재시도 없음(1회성 best-effort 유지) — audit 는 시도 1건당 1행.
- D-SER-05 한계는 "관측·복구단서"까지 보완. 자동 재시도(outbox/Saga)는 명시적 후속.
