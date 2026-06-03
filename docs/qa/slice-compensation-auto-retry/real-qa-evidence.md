# 실 QA 증거 — 보상 실패 자동 재시도 (D-SER-27)

> 2026-06-03 / branch `feat/compensation-auto-retry` / slip-service 단독.
> 🚨 no-fake-data — 실 Docker 재배포 + 실 psql + 실 Testcontainers IT 만.

## 1. 실 Testcontainers IT (재시도 로직)

`CompensationRetryServiceIT`(실 PostgreSQL/Flyway V32, `@MockBean InventoryClient`) — 9 케이스:
성공 해소(resolved=true+retry_count)·실패 백오프(retry_count++·next_retry_at, last↔next=10분)·max-retries 후보 제외·max-1(retry_count=4) 후보 포함·next_retry_at 미래 skip·과거 후보·resolved 제외·occurred_at ASC 순서(InOrder). + 단위 `CompensationRetryServiceTest`(혼합 배치 집계 3) + `CompensationRetryExecutorTest`(디스패치/skip/백오프/락후 재확인 5). **BUILD SUCCESSFUL, skip0/fail0/err0.**

## 2. 실 Docker 재배포 (V32 적용 + 스케줄러 기본 비활성)

slip-service bootJar 재빌드 → 이미지 재빌드 → 재배포(호스트포트 제거 overlay).

```
$ docker inspect -f '{{.State.Health.Status}}' samhan-slip-service → healthy (try 1)
$ docker logs samhan-slip-service | grep "Started SlipServiceApplication"
  Started SlipServiceApplication in 8.23 seconds
$ docker logs samhan-slip-service | grep -c ERROR → 0

# Flyway V32 적용 확인 (실 psql)
$ docker exec samhan-postgres psql -U samhan -d slip_db -t \
    -c "SELECT version, success FROM flyway_schema_history WHERE version='32';"
  32 | t

# retry 컬럼 존재 확인
$ ... information_schema.columns ... serial_compensation_failures ...
  last_retry_at
  next_retry_at
  retry_count

# 재시도 스케줄러 기본 비활성(@ConditionalOnProperty) → 빈 미등록
$ docker logs samhan-slip-service | grep -ci CompensationRetryScheduler → 0
```

- V32 마이그레이션 실 DB 적용(success=t) + retry 3컬럼 생성 확인.
- `CompensationRetryScheduler` 기본 비활성(미등록) — 운영 활성화 시에만 동작(`SAMHAN_COMPENSATION_RETRY_ENABLED=true`).
- 기동 8.23s, ERROR 0 — V32 + 신규 빈 DI 무결.

## 3. 결론

- 재시도 로직 = 실 Postgres IT(9) 로 입증(성공 해소·실패 백오프·경계·순서).
- V32 마이그레이션·스케줄러 비활성 무회귀 기동 = 실 Docker 재배포 + psql 로 입증.
- 활성 발송 흐름은 IT(@MockBean InventoryClient) 갈음. 멱등(#349)·행 락으로 동시 재시도 안전.
