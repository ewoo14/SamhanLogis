# 시리얼 재고 락 전략 최적화 — 구현 계획

> Codex 구현 + dual cross-check. spec: `docs/superpowers/specs/2026-06-03-serial-lock-optimization-design.md`. INV-S #349 DevOps P1/P2 후속.

**Goal:** ForUpdate 락 범위 LIMIT :deficit + V19 warehouse 인덱스 + lock.timeout 명시. 기능 불변, 성능·운영 안정성.

**대원칙:** BaseEntity/도메인체인/UUID비공개/IT skipped=0/6월 date-bomb 회피. inventory 단독.

---

## Task 1: ForUpdate 후보조회 LIMIT :deficit
- `StockInstanceRepository`: reserve/recall ForUpdate 메서드에 `Pageable` 파라미터 추가(또는 신규 limit 변형). `@Lock(PESSIMISTIC_WRITE)` 유지.
- `StockInstanceService.reserveBatch`(163)/`recallBatch`(247): 후보조회에 `PageRequest.of(0, deficit)` 전달 → deficit개만 FOR UPDATE.
- 멱등(already)+부족판정(candidates.size()<deficit) 정합 유지(LIMIT deficit 결과 deficit 미만이면 부족 409).
- 단위테스트 mock 시그니처 동기화.
- 커밋 `feat(inventory): ForUpdate 후보조회 LIMIT deficit 락범위 최소화 (D-SER-19)`

## Task 2: Flyway V19 warehouse 인덱스
- `V19__stock_instances_fifo_warehouse_index.sql`: `CREATE INDEX IF NOT EXISTS ix_stock_instances_fifo_wh ON stock_instances (product_code, warehouse_id, status, received_at)`. reserve FIFO ForUpdate warehouse 제한.
- 커밋 `feat(inventory): V19 FIFO warehouse 인덱스 (D-SER-20)`

## Task 3: lock.timeout 명시
- `application.yml`: `spring.jpa.properties.jakarta.persistence.lock.timeout: 3000` + PG 실적용 검증(Hibernate hint → SET lock_timeout). 커넥션 고갈 방지.
- 커밋 `feat(inventory): PESSIMISTIC lock.timeout 명시 (D-SER-21)`

## Task 4: IT 보강
- jsonPath 단언 보강(unrecall outbound 마커: outbound_partner_code/outbound_slip_no/outbound_at, recall_slip_no null). LIMIT 후 FIFO/역-FIFO 정확·부족409·멱등 유지 IT.
- 커밋 `test: 락 최적화 IT 보강 + jsonPath 단언`

## 배포 순서
inventory 단독(V19 + 코드). slip 무변경.

## 자기검토
- LIMIT deficit 멱등/부족판정 정합(spec 자기검토).
- V19 IF NOT EXISTS 멱등. 기존 ix_stock_instances_fifo 병존(조회 호환).
- lock.timeout PG 실적용 Docker EXPLAIN/pg_stat 검증.
- test mock Pageable 시그니처 동기화(S4 sed 교훈).
