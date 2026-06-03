# 시리얼 분산 보상 견고화 — 실 Docker QA 증빙

> PR #351 / branch `feat/serial-compensation-resilience` / 2026-06-03
> 환경: Docker compose (`infrastructure/` yml + local-all + no-host-ports), PostgreSQL 16, slip-service 재빌드(--no-cache) 후 `--force-recreate` 재배포.
> 원칙: no-fake-data — 모든 출력은 실 컨테이너/실 psql 캡처. 합성·조작 없음.

## 1. slip-service 재배포 + Flyway V31 적용 (실 psql)

컨테이너: `samhan-slip-service  Up (healthy)`.

```sql
SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 2;
```

```
 version |             description             | success
---------+-------------------------------------+---------
 31      | create serial compensation failures | t
 30      | create slip source orders           | t
```

→ V31 success=t. slip_db 단독 적용(inventory 무변경).

## 2. serial_compensation_failures 테이블 구조 (실 psql `\d`)

```
 Column                  | Type                        | Nullable | Default
-------------------------+-----------------------------+----------+---------
 id                      | uuid                        | not null |
 slip_id                 | uuid                        | not null |
 slip_no                 | varchar(64)                 | not null |
 slip_type               | varchar(32)                 | not null |
 phase                   | varchar(32)                 | not null |
 product_code            | varchar(64)                 | not null |
 attempted_operation     | varchar(32)                 | not null |
 failure_reason          | varchar(1000)               | not null |
 original_failure_reason | varchar(1000)               | not null |
 resolved                | boolean                     | not null | false
 occurred_at             | timestamp                   | not null |
 created_at              | timestamp                   | not null |   ┐
 created_by              | varchar(50)                 | not null |   │
 modified_at             | timestamp                   |          |   │ BaseEntity
 modified_by             | varchar(50)                 |          |   │ 7 audit
 deleted_at              | timestamp                   |          |   │
 deleted_by              | varchar(50)                 |          |   │
 is_deleted              | boolean                     | not null | false ┘
```

인덱스:

```
 serial_compensation_failures_pkey         PRIMARY KEY btree (id)
 idx_serial_comp_failures_resolved_created  btree (resolved, created_at)   -- 미해소 조회
 idx_serial_comp_failures_slip_no           btree (slip_no)                -- 전표번호 조회/cleanup (BE/DevOps P2 fix)
```

→ BaseEntity 7 audit + resolved 플래그 + occurred_at + 인덱스 2개 정합.

## 3. 정상 상태 확인 (보상 실패 미발생)

```sql
SELECT count(*) FROM serial_compensation_failures;   -- → 0
```

```
docker logs samhan-slip-service | grep -c "COMPENSATION_FAILURE"   -- → 0
```

→ 정상 운영 중 보상 실패가 발생하지 않았으므로 audit 행 0건 · WARN 마커 0건. **정상 경로 무오염**(보상 실패가 없으면 audit 미기록) 실증.

## 4. 보상 실패 동작 — REQUIRES_NEW 커밋 독립성 (CI 실 Testcontainers IT)

실 DB 에서 보상 실패를 인위 주입하지 않음(no-fake-data — 운영 DB 조작 금지). 대신 **CI 실 Testcontainers IT** `SlipCompensationAuditIT.accept_compensationFailure_commitsAuditEvenWhenSlipRollback` 가 실 PostgreSQL 에서 검증:

- accept 혼합전표 2번째 라인 reserve 실패 + 1번째 release 보상 실패 주입.
- 원본 예외 throw + suppressed = 보상 예외.
- 원본 slip 트랜잭션 롤백(`status == SENT` 잔존).
- audit 행 **독립 커밋 잔존**: `failureRepository.findAll().hasSize(1)` + **raw JDBC** `SELECT COUNT(*) FROM serial_compensation_failures WHERE slip_id=? AND is_deleted=false` = 1 (JPA 캐시/@SQLRestriction 개입 배제, 물리 커밋 직접 증명 — QA P0 fix).
- audit 필드 단언: phase=ACCEPT_RESERVE, op=RELEASE_INSTANCES, productCode, failureReason/originalFailureReason, resolved=false, occurredAt not null.

skipped=0 · fail0 · err0. CI 20/20 green.

## 5. 종합

| 항목 | 결과 |
|---|---|
| Flyway V31 적용 | ✅ success=t |
| 테이블 구조 + BaseEntity 7 audit | ✅ 18컬럼 |
| 인덱스 (resolved,created)+(slip_no) | ✅ |
| 정상 경로 무오염 (count 0 / 마커 0) | ✅ |
| REQUIRES_NEW 커밋 독립성 | ✅ CI 실 IT (raw JDBC 단언) |
| dual 리뷰 | Claude 5-agent fix 7건 + Codex OVERALL APPROVE |
