# 시리얼 분산 보상 견고화 — 구현 계획

> spec: `docs/superpowers/specs/2026-06-03-serial-compensation-resilience-design.md`. slip-service 단독.

**Goal:** 동기 REST 보상 실패의 조용한 삼킴(`addSuppressed`)을 구조적 WARN 로그 + slip측 append-only 감사(REQUIRES_NEW 독립 커밋)로 전환. D-SER-05 한계 관측·복구단서 보완.

**대원칙:** BaseEntity 7 audit + soft-delete / 도메인 정적팩토리(직접 set 금지) / UUID 비공개(productCode) / IT skipped=0 / 6월 date-bomb 회피(고정 시각) / inventory·product 무변경.

---

## Task 1: V31 + 감사 엔티티/리포지토리

- `V31__create_serial_compensation_failures.sql`: `serial_compensation_failures` (BaseEntity 7 audit 컬럼 + id UUID PK + slip_id/slip_no/slip_type/phase/product_code/attempted_operation/failure_reason(1000)/original_failure_reason(1000)/resolved bool default false/occurred_at). 인덱스 `(resolved, created_at)` 미해소 조회용.
- `CompensationPhase`(ACCEPT_RESERVE, COMPLETE_RECALL) / `CompensationOperation`(RELEASE, RELEASE_INSTANCES, UNRECALL_INSTANCES) enum.
- `SerialCompensationFailure extends BaseEntity` — `@UuidGenerator`, `@SQLRestriction("is_deleted = false")`, 정적팩토리 `of(...)`.
- `SerialCompensationFailureRepository extends JpaRepository<…, UUID>`.
- 커밋 `feat(slip): V31 serial_compensation_failures 감사 테이블 + 엔티티 (D-SER-22)`

## Task 2: REQUIRES_NEW 감사 writer

- `CompensationAuditWriter`(@Component) — `@Transactional(propagation = REQUIRES_NEW)` `record(Slip, CompensationPhase, productCode, CompensationOperation, Throwable compFailure, Throwable originalEx)`:
  - `log.warn("[COMPENSATION_FAILURE] slipNo={} slipType={} phase={} product={} op={} cause={}", …, compFailure.toString())`
  - `SerialCompensationFailure.of(...)` 저장(원인 = `ex.getClass().getSimpleName() + ": " + message`, 스택 제외, 1000자 truncate).
  - notification-service 푸시 = TODO 주석(후속).
- 별도 빈으로 분리(self-invocation 프록시 우회).
- 커밋 `feat(slip): 보상 실패 REQUIRES_NEW 감사 writer + 구조적 WARN (D-SER-22)`

## Task 3: 공통 보상 헬퍼 + 호출부 교체

- `SlipService.runCompensationsWithAudit(Slip, CompensationPhase, List<Compensation> comps, RuntimeException originalEx)`:
  - `Compensation`(productCode, op, action: Runnable) 경량 레코드.
  - 역순 loop → action.run(); catch → `compensationAuditWriter.record(...)` + `originalEx.addSuppressed(compFailure)`.
  - 마지막에 `throw originalEx`.
- `accept`(OUTBOUND reserve, ACCEPT_RESERVE)와 `completeRecallInbound`(COMPLETE_RECALL)의 인라인 보상 루프 → 헬퍼 호출로 교체. compensations.add 시 productCode/op 동봉.
- 기능 동등(원본 예외 그대로 throw) — 회귀 없음.
- 커밋 `refactor(slip): accept/completeRecallInbound 보상 루프 공통 헬퍼 교체 (D-SER-22)`

## Task 4: 테스트

- 단위 `SlipServiceCompensationTest`: InventoryClient mock — accept 2번째 라인 reserve 실패 + 1번째 release 보상 실패 주입 → audit writer record 1회 호출 + addSuppressed + 원본 throw. 전건 성공 시 record 0회. completeRecallInbound 동형.
- `CompensationAuditWriter` 단위: 저장 1행 + reason truncate(1000) + WARN.
- IT `SlipCompensationAuditIT`(실 Testcontainers): accept 혼합전표 보상 실패 → `serial_compensation_failures` 1행 **커밋 독립**(원본 slip 롤백에도 audit 잔존) 검증. skipped=0.
- 커밋 `test: 보상 감사 단위 + REQUIRES_NEW 커밋 독립 IT`

## 배포 순서

slip-service 단독(V31 + 코드). inventory/product 무변경.

## 자기검토

- REQUIRES_NEW: writer 별도 빈 + IT 커밋 독립 검증(같은 트랜잭션이면 audit 유실).
- 보상 0실패 → audit 0행(정상 경로 무오염).
- batch·serial 공통 적용(헬퍼 공통). DECISIONS 명시.
- 고정 시각 주입(date-bomb). reason 스택 미저장(PII/길이).
