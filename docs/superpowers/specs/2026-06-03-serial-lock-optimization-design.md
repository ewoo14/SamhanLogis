# 시리얼 재고 락 전략 최적화 — 설계

> Phase INV-S 후속. 동시성·보상 강화(#349)의 DevOps cross-check P1/P2(row lock 범위·인덱스·timeout) 해소.

## 목표

동시성·보상(#349)에서 도입한 PESSIMISTIC_WRITE row lock의 부작용(락 범위 과대·인덱스 미스·timeout 미적용)을 최적화한다. 기능 변경 없이 성능·운영 안정성 강화.

## 결정 (DECISIONS D-SER-19~21)

- **D-SER-19 ForUpdate 후보조회 LIMIT :deficit**: `reserveBatch`/`recallBatch`의 후보 ForUpdate 조회를 필요한 `deficit`개만 잠그도록 제한(Spring Data `Pageable`/`setMaxResults` 또는 `@Query` nativeQuery LIMIT). 거래처+품목 전체 N행 잠금 → deficit행으로 축소(LockTimeout 완화). 멱등(`already` count)+deficit 계산·부족판정(`candidates.size() < deficit` 409)은 그대로 정합(LIMIT deficit 결과가 deficit 미만이면 부족).
- **D-SER-20 Flyway V19 인덱스 `ix_stock_instances_fifo_wh (product_code, warehouse_id, status, received_at)`**: reserve FIFO ForUpdate가 warehouse_id를 인덱스 단에서 제한(기존 ix_stock_instances_fifo는 warehouse_id 미포함 → 타 창고 행 스캔/잠금). recall은 V15 ix_stock_instances_recall 재사용.
- **D-SER-21 lock.timeout 명시 적용**: `application.yml` 에 `spring.jpa.properties.jakarta.persistence.lock.timeout` 설정(현재 부재) + PostgreSQL 실제 적용 위해 Hibernate dialect timeout hint 또는 커넥션 `SET lock_timeout` 보강. FOR UPDATE 무한 대기로 인한 커넥션 고갈 방지.

## 변경 범위 (inventory-service 전용)

- `StockInstanceRepository`: reserve/recall ForUpdate 메서드에 `Pageable` 파라미터(또는 LIMIT @Query) — deficit개 제한.
- `StockInstanceService.reserveBatch/recallBatch`: 후보조회에 `PageRequest.of(0, deficit)` 전달.
- `db/migration/V19__stock_instances_fifo_warehouse_index.sql`: ix_stock_instances_fifo_wh 생성(IF NOT EXISTS).
- `application.yml`: lock.timeout 설정.
- IT: jsonPath 단언 보강(unrecall outbound 마커), 락 범위 검증(deficit개만 잠금 — 가능 범위).

## 테스트

- 단위: reserveBatch/recallBatch가 PageRequest(0,deficit)로 후보조회 호출(verify) + 멱등·부족판정 정합 유지.
- IT(실 Testcontainers, skipped=0): LIMIT 후에도 FIFO/역-FIFO 정확 + 부족 409 + 멱등. unrecall jsonPath 마커 단언.
- Docker 실QA: V19 인덱스 EXPLAIN(ix_stock_instances_fifo_wh 사용) + lock_timeout 적용 확인.

## 배포 순서

inventory 단독(V19 + 코드). slip 무변경.

## 자기검토

- LIMIT deficit가 멱등/부족판정 깨지 않게: candidates(LIMIT deficit) 반환이 deficit 미만이면 부족 409 정상. already+deficit=quantity 정합 유지.
- V19 인덱스 IF NOT EXISTS 멱등. 기존 ix_stock_instances_fifo 유지(다른 조회 호환) 또는 대체 검토(EXPLAIN 후).
- lock.timeout PG 실적용 검증(Docker EXPLAIN/pg_stat).
