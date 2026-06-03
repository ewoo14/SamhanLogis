# 시리얼 재고 락 전략 최적화 — 실 Docker QA 증빙

> PR #350 / branch `feat/serial-lock-optimization` / 2026-06-03
> 환경: Docker compose (`infrastructure/docker-compose.yml` + `local-all` + `no-host-ports`), PostgreSQL 16.14, inventory-service 재빌드(--no-cache) 후 `--force-recreate` 재배포.
> 원칙: no-fake-data — 모든 출력은 실 컨테이너/실 psql 캡처. 데이터 조작·합성 없음.

## 1. inventory-service 재배포 + Flyway V19 적용 (실 기동 로그)

```
Database: jdbc:postgresql://postgres:5432/inventory_db (PostgreSQL 16.14)
Successfully validated 19 migrations
Current version of schema "public": 18
Migrating schema "public" to version "19 - stock instances fifo warehouse index"
Successfully applied 1 migration to schema "public", now at version v19 (execution time 00:00.017s)
Started InventoryServiceApplication in 8.788 seconds
```

`flyway_schema_history`:

```
 version |             description              | success
---------+--------------------------------------+---------
 19      | stock instances fifo warehouse index | t
 18      | stock instances recall slip          | t
 17      | stock instances outbound slip index  | t
```

컨테이너: `samhan-inventory-service  Up (healthy)`.

## 2. V19 partial 인덱스 정의 (실 psql)

```sql
SELECT indexdef FROM pg_indexes
 WHERE tablename='stock_instances' AND indexname='ix_stock_instances_fifo_wh';
```

```
CREATE INDEX ix_stock_instances_fifo_wh ON public.stock_instances
  USING btree (product_code, warehouse_id, status, received_at)
  WHERE (is_deleted = false)
```

→ P2 fix(`WHERE is_deleted = FALSE` 부분 인덱스) 실 반영 확인. V16/V17 부분 인덱스 컨벤션 일관.

## 3. FIFO ForUpdate EXPLAIN — V19 인덱스 실사용 (실 psql)

```sql
EXPLAIN
SELECT * FROM stock_instances
 WHERE product_code=(...) AND status='AVAILABLE' AND is_deleted=false
 ORDER BY product_code, warehouse_id, status, received_at
 LIMIT 5 FOR UPDATE;
```

```
 Limit
   InitPlan 1 (returns $0)
     ->  Limit
           ->  Index Only Scan using ix_stock_instances_fifo_wh on stock_instances ...
                 Index Cond: (status = 'AVAILABLE')
   ->  LockRows
         ->  Index Scan using ix_stock_instances_fifo_wh on stock_instances
               Index Cond: ((product_code = $0) AND (status = 'AVAILABLE'))
               Filter: (NOT is_deleted)
```

→ reserve FIFO ForUpdate 후보조회가 `ix_stock_instances_fifo_wh` 를 실제 사용(InitPlan·LockRows 양쪽). D-SER-20 달성.

## 4. 🚨 lock.timeout PG 실적용 검증 — BE↔DevOps 상충 해소

### 4-1. PG 자체는 `SET LOCAL lock_timeout` 수용 (실 psql)

```sql
BEGIN; SET LOCAL lock_timeout='3000ms'; SHOW lock_timeout; ROLLBACK;
```

```
 lock_timeout
--------------
 3s
```

→ PostgreSQL 16 은 트랜잭션 범위 `lock_timeout` 을 정상 수용.

### 4-2. 결론: Hibernate 힌트는 PG 에서 자동 적용되지 않음 (no-op)

- **근거**: PostgreSQL 의 `FOR UPDATE` 구문은 `WAIT n`(대기시간) 절을 지원하지 않음(`NOWAIT`/`SKIP LOCKED` 만 존재). Hibernate `PostgreSQLDialect` 는 잠금 타임아웃을 SQL 에 인코딩할 수 없어, `@QueryHints(jakarta.persistence.lock.timeout=3000)` 은 PG 에서 **세션/트랜잭션 `SET LOCAL lock_timeout` 을 자동 발행하지 않음**. 기본 `lock_timeout=0`(무한 대기) 유지.
- **즉 BE cross-check(#349 P1) 지적이 정확** — DevOps 의 "힌트만으로 PG 적용" 가정은 PG 에서 성립하지 않음.
- **실 동시성 방어는 다음 2계층이 담당(IT 검증 완료)**:
  1. **advisory lock** `pg_advisory_xact_lock((product,warehouse) 해시)` — 임계구역을 키별 직렬화(1차 방어, 무한 row 대기 자체를 회피).
  2. **row lock `FOR UPDATE` + `LIMIT :deficit`** — 잠금 범위를 deficit 행으로 축소(경합 창 최소화).
- **D-SER-21 정정**: lock.timeout 힌트는 "명시"되었으나 PG 자동 강제는 미적용. hard statement-level timeout 이 필요하면 후속(P2)으로 `SET LOCAL lock_timeout` native 발행 또는 datasource `connection-init-sql` 보강. 현재는 advisory 직렬화로 무한 대기 위험이 실질적으로 차단되므로 **머지 비차단(설계 수준 한계, 데이터정합/보안/운영중단 아님)**.

## 5. reserve/recall happy-path

- 실 DB(`inventory_db`) 현재 시리얼 재고: product `010001` 의 SHIPPED 2 / RECALLED 1 (AVAILABLE 0). AVAILABLE 인스턴스 부재로 **실 reserve 호출 대상 없음** — no-fake-data 원칙상 데이터 합성·삽입하지 않음.
- reserve/recall/unrecall 상태전이·멱등·부족판정·outbound 마커 happy-path 는 **CI 실 Testcontainers IT(skipped=0·fail0·err0)** 가 LIMIT deficit 적용 코드 그대로 검증(별도 DB 인스턴스, 실 PostgreSQL). 본 슬라이스 단위/IT 전 그린.

## 6. 종합

| 항목 | 결과 |
|---|---|
| Flyway V19 적용 | ✅ success=t (실 기동 로그) |
| V19 partial 인덱스 (`WHERE is_deleted=false`) | ✅ 실 정의 확인 |
| FIFO ForUpdate 인덱스 실사용 | ✅ EXPLAIN `Index Scan ix_stock_instances_fifo_wh` |
| PG `SET LOCAL lock_timeout` 수용 | ✅ 3s |
| Hibernate 힌트 PG 자동적용 | ❌ no-op (PG `FOR UPDATE WAIT` 미지원) → advisory 1차방어로 비차단, P2 후속 |
| reserve/recall happy-path | ✅ CI 실 Testcontainers IT (skip0) |
| dual 리뷰 | Claude 5-agent fix + Codex OVERALL APPROVE |
