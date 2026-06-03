# Slice: 시리얼 분산 보상 견고화 (INV-S 후속 ⓑ)

> PR #351 / branch `feat/serial-compensation-resilience` / 2026-06-03
> D-SER-05(동기 REST + best-effort 보상) 한계 보완 — 보상 실패의 조용한 삼킴을 관측·영속·복구단서로 전환. slip-service 단독(inventory/product 무변경).

## 1. 문제

`SlipService.accept`(OUTBOUND 예약)·`completeRecallInbound`(회수)의 동기 REST 보상이 실패하면 `ex.addSuppressed(compensationFailure)` 로 **조용히 삼켜져** 구조적 로그·영속 감사·운영 알림이 전무. inventory 측 고아 RESERVED/RECALLED 인스턴스를 운영자가 인지·복구할 수단이 없었다.

## 2. 구현 (D-SER-22)

- **`CompensationAuditWriter`**(@Component, `@Transactional(REQUIRES_NEW)` 별도 빈): 보상 실패를 (1) 구조적 WARN `[COMPENSATION_FAILURE]`(cause + originalCause) (2) `serial_compensation_failures`(V31) append-only 1행을 **독립 커밋**(원본 slip 롤백과 분리). save 실패 시 `[COMPENSATION_AUDIT_SAVE_FAILURE]` ERROR 로그 후 rethrow.
- **`SlipService.runCompensationsWithAudit`** 공통 헬퍼: `accept`(ACCEPT_RESERVE)/`completeRecallInbound`(COMPLETE_RECALL) 인라인 역순 보상 루프를 교체. serial·batch 보상 공통 적용. 기능 동등(원본 예외 그대로 throw).
- **`SerialCompensationFailure`**(BaseEntity, 정적팩토리 `of`, productCode null/blank guard, `@SQLRestriction`), `CompensationPhase`/`CompensationOperation` enum, `TimeConfig` Clock 빈(date-bomb 회피).
- **V31** `serial_compensation_failures`(BaseEntity 7 audit + resolved + occurred_at + 인덱스 `(resolved,created_at)`/`(slip_no)`).

왜 inventory `stock_movements` 가 아닌가: 보상 실패의 전형 원인이 inventory 도달 불가이므로, 같은 이유로 inventory 측 기록도 실패할 수 있다. **호출자(slip) 측 영속**이 정합.

## 3. 검증

- 단위(`SlipServiceCompensationTest` 4 / `CompensationAuditWriterTest` 1) + IT(`SlipCompensationAuditIT` 1, 실 Testcontainers): **skipped=0 · fail0 · err0**. CI 20/20 green.
- IT 가 REQUIRES_NEW 물리 커밋 독립성을 raw JDBC COUNT 로 직접 증명(원본 롤백 시 `status==SENT` + audit 행 잔존).
- Docker 실 QA: `docs/qa/slice-serial-compensation-resilience/real-qa-evidence.md`(V31 적용·테이블 구조·인덱스·정상 무오염).

## 4. 리뷰 (dual, N=1 수렴)

- **Claude 5-agent**: Designer/FE APPROVE. fix 7건 — QA P0(IT raw JDBC 커밋독립 단언)·QA P1(occurredAt 단언/slipNo eq)·BE P1(productCode guard)·DevOps P1(WARN originalCause)·BE P2(audit save ERROR 로그/V31 slip_no 인덱스/occurredAt Javadoc).
- **Codex(gpt-5.5) cross-check**: 5섹션 **OVERALL APPROVE**.
- **PM 판정**: BE @Version 미반영(append-only audit 선례 `StockMovement`/`SlipPublishAudit`/`SlipSignatureAudit` 일관 — rows 불변 낙관락 불요).

## 5. 후속

- HikariCP `maximum-pool-size` 명시(REQUIRES_NEW 2중 커넥션 — DevOps P1, application.yml 튜닝).
- `serial_compensation_failures` retention 정책 + 복구 API(`resolved` 토글) + 운영자 보상 실패 목록 화면(Designer 권고).
- notification-service 운영 알림 푸시(현 TODO seam).
- 자동 재시도(outbox/Saga) — D-SER-05 한계의 근본 해소.
