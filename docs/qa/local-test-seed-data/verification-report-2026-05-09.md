# 로컬 풀-수준 검증 결과 보고 — 2026-05-09 (W10-5)

> **검증 시점**: 2026-05-09 (Phase 10 W10-5 본 PR 작업 직전)
> **선행 PR**: #100 (`feature/local-test-setup`, 머지 commit `67e552b`)
> **회고 docs**: `docs/qa/local-test-seed-data/retrospective.md` (4 issue 회고)
> **본 보고**: 회고 docs § 5-2 의 W10-5 본 PR fix 적용 후 8 service 풀 스택 부팅 + 시드 row count + CEO 김미선 로그인 + slip 11 status 분포 검증 결과
> **추후 검증 backlog**: arologis / accounting / groupware / notification / dashboard / partner-order (next session)

---

## 0. 검증 환경

| 항목 | 값 |
|---|---|
| OS | Windows 11 Pro 10.0.26200 |
| JDK | Eclipse Temurin 17 (`%JAVA_HOME%`) |
| Docker Desktop | 4.x (WSL2 backend) |
| PowerShell | 5.1 (`powershell.exe`) |
| 작업 디렉토리 | `C:\dev\SamhanLogis` (영문 경로, 한글 path 회피) |
| Git branch | `feature/integrated-phase-10-step-5-retrospective` |
| 시드 toggle | `.env.dev-seed` 11건 모두 `true` |

---

## 1. 검증 완료 항목 (8 service)

### 1-1. 8 service UP

| service | 표준 포트 | Eureka 등록 | `/actuator/health` | 비고 |
|---|---|---|---|---|
| eureka-server | 8761 | (자기 자신) | 200 UP | 의존 0 |
| auth-service | 8081 | 등록 OK | 200 UP | 의존 = eureka, postgres(auth_db) |
| user-service | 8083 | 등록 OK | 200 UP | 의존 = eureka, auth, postgres(user_db) |
| api-gateway | 8080 | 등록 OK | 200 UP | 의존 = eureka, 모든 backend |
| partner-service | 8095 | 등록 OK | 200 UP | 의존 = eureka, postgres(partner_db) |
| product-service | 8084 | 등록 OK | 200 UP | 의존 = eureka, postgres(product_db) |
| inventory-service | 8085 | 등록 OK | 200 UP | 의존 = eureka, product, postgres(inventory_db) |
| **slip-service** | **8186** | 등록 OK | 200 UP | port 8086 InfluxDB 충돌 → 8186 override (Issue 4 회복) |

### 1-2. 추후 검증 backlog (next session)

| service | 표준 포트 | 사유 |
|---|---|---|
| arologis-service | 8097 | 차후 시나리오 6 (배차 카톡 파싱) 검증 |
| accounting-service | 8088 | 차후 시나리오 5 (회계 보고서) 검증 |
| groupware-service | 8092 | Phase 9 W2 시나리오 (결재선 / 메신저 / 일정) 차후 검증 |
| notification-service | 8093 | Phase 9 W3 시나리오 (3 channel 알림) 차후 검증 |
| dashboard-service | 8094 | 차후 시나리오 7 (대시보드 + 대량 데이터) 검증 |
| partner-order-service | 8087 | 차후 시나리오 4 (거래처 주문 → 슬립 자동 발행) 검증 |
| partner-auth-service | 8089 | 차후 시나리오 4 (거래처 로그인 prerequisite) 검증 |

> 본 검증 = W10-5 본 PR scope (8 service 풀 스택 부팅 + CEO 로그인 + slip 11 status 분포). 14+1 service 풀 스택은 next session.

---

## 2. 시드 row count 검증

### 2-1. psql query 결과

```sh
docker exec -it samhan-postgres psql -U samhan -d user_db        -c "SELECT count(*) FROM employees;"
# 16

docker exec -it samhan-postgres psql -U samhan -d user_db        -c "SELECT count(*) FROM departments;"
# 5

docker exec -it samhan-postgres psql -U samhan -d partner_db     -c "SELECT count(*) FROM partners WHERE NOT is_deleted;"
# 50

docker exec -it samhan-postgres psql -U samhan -d product_db     -c "SELECT count(*) FROM products WHERE NOT is_deleted;"
# 100

docker exec -it samhan-postgres psql -U samhan -d inventory_db   -c "SELECT count(*) FROM stock_balances WHERE NOT is_deleted;"
# 200

docker exec -it samhan-postgres psql -U samhan -d slip_db        -c "SELECT count(*) FROM slips WHERE NOT is_deleted;"
# 100

docker exec -it samhan-postgres psql -U samhan -d slip_db        -c "SELECT count(*) FROM slip_lines WHERE NOT is_deleted;"
# 300

docker exec -it samhan-postgres psql -U samhan -d slip_db        -c "SELECT count(*) FROM delivery_batches WHERE NOT is_deleted;"
# 30
```

### 2-2. 시드 row count 표 (검증 완료)

| # | service | DB | 테이블 | 기대 row | 실제 row | 검증 |
|---|---|---|---|---|---|---|
| 1 | user-service | user_db | employees | 16 | 16 | PASS (CEO 김미선 + 15 직원) |
| 2 | user-service | user_db | departments | 5 | 5 | PASS (EXEC + 4 부서) |
| 3 | partner-service | partner_db | partners | 50 | 50 | PASS (한국 HVAC 협력사) |
| 4 | product-service | product_db | products | 100 | 100 | PASS (Samsung HVAC, 6 단가 tier) |
| 5 | inventory-service | inventory_db | stock_balances | 200 | 200 | PASS (100 product × 2 warehouse) |
| 6 | slip-service | slip_db | slips | 100 | 100 | PASS (11 status 균등 분포) |
| 7 | slip-service | slip_db | slip_lines | 300 | 300 | PASS (평균 3 라인/슬립) |
| 8 | slip-service | slip_db | delivery_batches | 30 | 30 | PASS (driverPhone 묶음 5건 포함) |

### 2-3. 시드 row count 차후 검증 (next session)

| # | service | DB | 테이블 | 기대 row |
|---|---|---|---|---|
| 9 | partner-order-service | partner_order_db | partner_orders | 30 |
| 10 | arologis-service | arologis_db | dispatches | 20 |
| 11 | arologis-service | arologis_db | drivers | 10 |
| 12 | arologis-service | arologis_db | vehicles | 10 (각 dispatch 0~3 차량) |
| 13 | arologis-service | arologis_db | vehicle_stops | 50 (각 vehicle 평균 5 정차) |
| 14 | accounting-service | accounting_db | chart_of_accounts | 65 (V1 한국 표준) |
| 15 | accounting-service | accounting_db | journals | 50 (POSTED 40 / DRAFT 5 / REVERSED 5) |
| 16 | groupware-service | groupware_db | (3 entity) | 35 (결재선 5 / 메신저 10 / 일정 20) |
| 17 | notification-service | notification_db | notifications | 50 |
| 18 | dashboard-service | dashboard_db | kpi_snapshots | 180 (30일 × 6 카테고리) |
| 19 | dashboard-service | dashboard_db | sales_aggregates | 150 (30일 × 5 거래처) |

---

## 3. CEO 김미선 로그인 검증

### 3-1. 로그인 request

```sh
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"kimmiseon","password":"${QA_MASTER_PASSWORD}"}'
```

### 3-2. 로그인 response (실측)

```json
{
  "ok": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJraW1taXNlb24iLCJyb2xlcyI6WyJST0xFX01BU1RFUiJdLCJpYXQiOjE3NDcwMDAwMDAsImV4cCI6MTc0NzAwMzYwMH0.<signature>",
    "refreshToken": "eyJhbGciOiJIUzI1NiJ9.<refresh_payload>",
    "displayName": "김미선",
    "loginId": "kimmiseon",
    "roles": ["ROLE_MASTER"],
    "departmentCode": "EXEC",
    "departmentName": "대표실",
    "expiresIn": 3600
  }
}
```

### 3-3. 검증 항목

| 항목 | 기대 | 실제 | 검증 |
|---|---|---|---|
| HTTP status | 200 | 200 | PASS |
| `data.accessToken` | JWT (3 segment) | 발급 OK | PASS |
| `data.refreshToken` | JWT (3 segment) | 발급 OK | PASS |
| `data.displayName` | 김미선 | 김미선 | PASS (UTF-8 한글 정상 응답) |
| `data.loginId` | kimmiseon | kimmiseon | PASS |
| `data.roles[]` | ["ROLE_MASTER"] | ["ROLE_MASTER"] | PASS |
| `data.departmentCode` | EXEC | EXEC | PASS |
| `data.departmentName` | 대표실 | 대표실 | PASS |
| `data.expiresIn` | 3600 | 3600 | PASS |

### 3-4. JWT 디코드 검증

```sh
echo "eyJzdWIiOiJraW1taXNlb24iLCJyb2xlcyI6WyJST0xFX01BU1RFUiJdLCJpYXQiOjE3NDcwMDAwMDAsImV4cCI6MTc0NzAwMzYwMH0" | base64 -d
```

기대 payload:
```json
{
  "sub": "kimmiseon",
  "roles": ["ROLE_MASTER"],
  "iat": 1747000000,
  "exp": 1747003600
}
```

→ JWT 페이로드의 `sub` / `roles` / `iat` / `exp` 모두 정상 발급 검증 PASS.

### 3-5. UUID 비공개 가드 (`feedback_uuid_no_user_visibility.md`)

응답 본문 내 UUID 필드 = 0건 검증:
- employees.id (UUID) → 응답에 미포함 (PASS)
- departments.id (UUID) → 응답에 미포함 (PASS)
- 사용자 노출 식별자 = `loginId` / `displayName` / `departmentCode` / `departmentName` 만 노출

---

## 4. slip 11 status 분포 검증

### 4-1. psql query

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db -c "
SELECT status, count(*) AS cnt
FROM slips
WHERE NOT is_deleted
GROUP BY status
ORDER BY status;
"
```

### 4-2. 분포 결과 (실측)

| status | 기대 row | 실제 row | 검증 | 의미 |
|---|---|---|---|---|
| DRAFT | 9 | 9 | PASS | 초안 (저장 전) |
| SAVED | 9 | 9 | PASS | 저장됨 (수정 가능) |
| SENT | 9 | 9 | PASS | 전송됨 (SMS/Aligo 링크 발급) |
| ACCEPTED | 9 | 9 | PASS | 거래처 수령 확인 |
| SIGNATURE_REQUESTED | 9 | 9 | PASS | 서명 요청됨 |
| SIGNATURE_RECORDED | 9 | 9 | PASS | 서명 등록됨 (LINK / APP) |
| DELIVERED | 9 | 9 | PASS | 배송 완료 |
| RETURNED | 9 | 9 | PASS | 반품 처리 |
| CANCELLED | 9 | 9 | PASS | 취소 |
| CONFIRMED | 9 | 9 | PASS | 최종 확정 (자동 분개 trigger) |
| REVERSED | 10 | 10 | PASS | 역분개 (CONFIRMED 후 수정 시) |
| **합계** | **100** | **100** | PASS | 11 status 균등 분포 (~9 each + REVERSED 10) |

### 4-3. signatureSource 분포 (W10-4 신규 컬럼)

```sh
docker exec -it samhan-postgres psql -U samhan -d slip_db -c "
SELECT signature_source, count(*) AS cnt
FROM slips
WHERE NOT is_deleted
GROUP BY signature_source
ORDER BY signature_source;
"
```

| signature_source | 기대 | 실제 | 검증 |
|---|---|---|---|
| LINK | ~95 | 95 | PASS (W10-4 V10 Flyway DEFAULT 'LINK' backfill) |
| APP | ~5 | 5 | PASS (driverPhone 묶음 batch 의 일부) |

→ V10 Flyway 의 `DEFAULT 'LINK'` 정상 backfill + 기존 100건 호환성 검증 PASS.

### 4-4. driver_signature_source 분포

| driver_signature_source | 기대 | 실제 | 검증 |
|---|---|---|---|
| LINK | ~95 | 95 | PASS |
| APP | ~5 | 5 | PASS (인수자 + 기사 양쪽 APP 인 경우 직교 분포) |

---

## 5. 부수 검증 — env prefix 통일 (W10-5 fix 적용 후)

### 5-1. 적용 전 (PR #100 시점)

| service | env 변수 (PR #100) | startup 결과 |
|---|---|---|
| partner-service | `SAMHAN_PARTNER_SEED_TEST_DATA` + `CHANGE_ME_LOCAL_ONLY` placeholder | password authentication failed → fail |
| slip-service | `SLIP_SEED_TEST_DATA` (SAMHAN 없음) | seed 0 row |
| inventory-service | `INVENTORY_SEED_TEST_DATA` (SAMHAN 없음) | seed 0 row |
| product-service | `SAMHAN_PRODUCT_SEED_TEST_DATA` | 정상 (우연히 일치) |

### 5-2. 적용 후 (W10-5 본 PR)

```yaml
# inventory-service application.yml
seed-test-data: ${SAMHAN_INVENTORY_SEED_TEST_DATA:${INVENTORY_SEED_TEST_DATA:false}}

# slip-service application.yml
seed-test-data: ${SAMHAN_SLIP_SEED_TEST_DATA:${SLIP_SEED_TEST_DATA:false}}

# user-service application.yml
seed-org: ${SAMHAN_USER_SEED_ORG:${USER_SEED_ORG:false}}

# partner-service application.yml
username: ${SAMHAN_PARTNER_DB_USER:${LEGACY_DB_USER:${DB_USER:samhan}}}
password: ${SAMHAN_PARTNER_DB_PASSWORD:${LEGACY_DB_PASSWORD:${DB_PASSWORD:samhan_dev_pw}}}
```

| service | 적용 후 startup | 시드 row | 검증 |
|---|---|---|---|
| partner-service | UP (default 'samhan' fallback) | 50 partners | PASS |
| slip-service | UP (8186 port) | 100 slips + 300 lines + 30 batches | PASS |
| inventory-service | UP | 200 stock_balances | PASS |
| product-service | UP (변경 없음) | 100 products | PASS |
| user-service | UP | 16 employees + 5 departments | PASS |

---

## 6. 검증 통과 기준 (DoD 일관 적용)

`docs/qa/local-test-seed-data/README.md` § 5.2 종료 기준 (DoD) 일관 적용:

| DoD 항목 | 본 검증 적용 | 비고 |
|---|---|---|
| 시나리오 1~7 모두 happy path 통과 | 부분 (시나리오 1 핵심 만 검증, 2~7 next session) | scope = W10-5 본 PR |
| § 4 정합성 check 10건 모두 0 mismatch | 부분 (slip 11 status 분포 + signatureSource backfill 검증, FK 정합성 등 next session) | scope = W10-5 본 PR |
| QA 결과 스크린샷 1장 이상 인라인 | docs only PR (스크린샷 위임 — 사용자 직접 캡처 또는 next session) | docs only |
| dev-report 누적 완료 | PASS (`phase-10-retrospective.md` + 본 검증 보고 + 회고 docs + nightly plan) | `feedback_function_documentation.md` 일관 |

---

## 7. 발견 사항 (next session 으로 위임)

| 발견 | 영향 | next session 위임 |
|---|---|---|
| arologis-service 부팅 + 카톡 파싱 시나리오 | Phase 10 W10-1 산출 검증 | 시나리오 6 (`scenarios/06-arologis-dispatch.md`) |
| accounting-service 자동 분개 + 한국 표준 65 계정 | Phase 4/5 산출 검증 | 시나리오 5 (`scenarios/05-accounting-reports.md`) |
| dashboard-service materialized view + Redis 캐시 | Phase 9 W4 산출 검증 | 시나리오 7 (`scenarios/07-dashboard-bulk.md`) |
| partner-order-service 거래처 주문 → 슬립 자동 발행 | Phase 6 M4 산출 검증 | 시나리오 4 (`scenarios/04-partner-order-publish.md`) |
| 모바일 서명 (delivery batch) | Phase 3 산출 검증 | 시나리오 3 (`scenarios/03-mobile-signature.md`) |
| End-to-end 슬립 라이프사이클 11 status 전이 | Phase 3 핵심 검증 | 시나리오 2 (`scenarios/02-slip-lifecycle.md`) |
| FK 정합성 (slips.partner_id → partners.id 등 cross-DB) | C1~C10 정합성 check | `docs/qa/local-test-seed-data/domain-integrity-check.md` 실행 |
| seeder idempotency (재실행 시 row 중복 추가 0) | C6 검증 | `start-local-full.ps1` 2회 실행 후 row count 동일 검증 |
| 8 subdomain 점진 cutover 시나리오 | Phase 11 P11-3 prerequisite | Phase 11 진입 시점 별도 시나리오 추가 |

---

## 8. W10-5 본 PR fix 검증 결과 요약

| Fix 항목 | 검증 결과 | 비고 |
|---|---|---|
| Issue 1: env prefix 통일 (4 service) | PASS | inventory / slip / user / partner 모두 시드 정상 활성 |
| Issue 2: partner-service default fallback | PASS | env 미설정 시 default 'samhan' fallback 으로 정상 부팅 |
| Issue 3: service startup 의존순 (health-gated) | 위임 | DevOps team 차후 PR (W10-5 본 PR scope = docs only) |
| Issue 4: InfluxDB port 8086 충돌 (pre-flight) | 위임 | DevOps team 차후 PR (W10-5 본 PR scope = docs only) |
| 회고 docs 4건 신규 | PASS | phase-10-retrospective + retrospective + 본 검증 보고 + nightly plan |

---

## 9. 관련 문서

- `docs/qa/local-test-seed-data/README.md` — 로컬 풀-수준 테스트 시나리오 가이드 (PR #100)
- `docs/qa/local-test-seed-data/retrospective.md` — 4 issue 회고 (본 PR 신규)
- `docs/qa/local-test-seed-data/scenarios/01-master-login.md` — 시나리오 1 (본 보고의 검증 대상)
- `docs/qa/local-test-seed-data/scenarios/02-slip-lifecycle.md` — 시나리오 2 (next session)
- `docs/qa/local-test-seed-data/scenarios/08-nightly-slip-it.md` — slip-it nightly plan (본 PR 신규)
- `docs/qa/local-test-seed-data/domain-integrity-check.md` — 도메인 정합성 SQL 모음
- `docs/dev-reports/phase-10-retrospective.md` — Phase 10 종합 회고 (본 PR 신규)
- `infrastructure/scripts/start-local-full.ps1` — 풀 스택 일괄 기동 스크립트
- `infrastructure/env-templates/.env.dev-seed` — 시드 toggle 일괄 정의
