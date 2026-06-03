# Slice: 시리얼 재고 락 전략 최적화 (INV-S 후속)

> PR #350 / branch `feat/serial-lock-optimization` / 2026-06-03
> 동시성·보상 강화(#349)에서 도입한 PESSIMISTIC_WRITE row lock 의 DevOps cross-check P1/P2(락 범위·인덱스·timeout) 해소. 기능 불변, 성능·운영 안정성 강화. inventory 단독(slip 무변경).

## 1. 목표

`#349` 에서 reserve/recall/unrecall 후보조회를 `@Lock(PESSIMISTIC_WRITE)` row lock 으로 전환하면서 DevOps cross-check 가 지적한 3건:

- **P1** ForUpdate 가 거래처+품목 전체 N행을 잠가 LockTimeout/경합 확대.
- **P2** reserve FIFO 의 warehouse 조건이 인덱스에서 제한되지 않아 filesort/광범위 스캔 가능.
- **P2** `lock.timeout` 미명시로 잠금 대기 무한 가능.

## 2. 구현 (D-SER-19~21)

| 결정 | 내용 |
|---|---|
| D-SER-19 | ForUpdate 후보조회 `Pageable`(`PageRequest.of(0, deficit)`) → deficit 행만 `FOR UPDATE`. 부족판정(`candidates.size() < deficit` → 409)·멱등 정합 유지. |
| D-SER-20 | Flyway `V19 ix_stock_instances_fifo_wh (product_code, warehouse_id, status, received_at) WHERE is_deleted = FALSE` 부분 인덱스. |
| D-SER-21 | `@QueryHints(jakarta.persistence.lock.timeout=3000)` 명시 + PG 실적용 검증(아래 §4). |

### 변경 파일

- `StockInstanceRepository` — reserve/recall/unrecall ForUpdate 메서드에 `Pageable` 파라미터 + `@QueryHints` lock.timeout.
- `StockInstanceService` — reserveBatch/recallBatch/unrecallBatch 후보조회에 `PageRequest.of(0, deficit)` 전달.
- `db/migration/V19__stock_instances_fifo_warehouse_index.sql` — 부분 인덱스(`WHERE is_deleted = FALSE`, P2 5-agent fix 반영).
- `StockInstanceServiceOutboundTest` — unrecallBatch outboundSlipNo 단언 추가(outbound 3-필드 유지 검증 완성, QA P1 fix).

## 3. 검증

- 단위 + IT(실 Testcontainers): **skipped=0 · fail0 · err0**. LIMIT deficit 적용 후 FIFO/역-FIFO 정확·부족 409·멱등·unrecall outbound 마커.
- CI 전체 GREEN(전 모듈 빌드+JUnit pass).
- 실 Docker QA: `docs/qa/slice-serial-lock-optimization/real-qa-evidence.md` (Flyway V19 적용·partial 인덱스 정의·EXPLAIN 인덱스 실사용·`SET LOCAL lock_timeout` 수용).

## 4. lock.timeout PG 실적용 — BE↔DevOps 상충 해소

실 Docker QA 결과(PostgreSQL 16.14):

- PG 는 `SET LOCAL lock_timeout='3000ms'` 를 수용(`SHOW` → 3s).
- 그러나 PostgreSQL 의 `FOR UPDATE` 는 `WAIT n` 절을 지원하지 않아, Hibernate `PostgreSQLDialect` 가 `jakarta.persistence.lock.timeout` 힌트를 **PG SQL/세션에 자동 발행하지 않음(no-op)**. → **BE cross-check 지적이 정확**.
- 실 동시성 방어는 **advisory lock(`slipNo|productCode` 키별 트랜잭션 직렬화) 1차 + row `FOR UPDATE` + `LIMIT deficit` 락범위 축소**가 담당. 임계구역이 키별로 직렬화되므로 무한 row 대기 위험이 실질적으로 차단됨.
- **후속(P2)**: hard statement-level `lock_timeout` 이 필요하면 native `SET LOCAL lock_timeout` 발행 또는 datasource `connection-init-sql` 보강. 현재는 비차단(설계 수준 한계, 데이터정합/보안/운영중단 아님).

## 5. 리뷰

- **Claude 5-agent**(BE/QA/DevOps/FE/Designer): P0 0, P1 2(QA outboundSlipNo 단언 / BE lock.timeout PG 적용 → Docker QA 검증) → fix.
- **Codex(gpt-5.5) cross-check**: 5섹션 **OVERALL APPROVE**, 신규 P0/중대 P1 0건 → dual 리뷰 수렴.

## 6. 후속

- (P2) hard lock_timeout native 발행(필요 시).
- (P2) 중복 `ix_stock_instances_fifo`(V15) 와 V19 병존 — V20 DROP 검토.
- (P2) 동시성 2-스레드 IT, recallBatch TOCTOU 주석.
