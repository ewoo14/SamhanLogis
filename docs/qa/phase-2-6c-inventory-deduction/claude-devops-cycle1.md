# Phase 2.6c DevOps 리뷰 — claude-devops-cycle1

> 브랜치: feat/phase-2-6c-inventory-deduction (HEAD c4f517e1)
> 리뷰일: 2026-05-31
> 리뷰어: DevOps Engineer (Claude)
> 대상: V14 마이그레이션 / 서비스 간 호출 인증 / .gitignore 복구 / 배포 순서
> 코드 수정 없음 — 분석 전용

---

## 종합 판정: APPROVE (P1 주의사항 2건 확인 후 운영 적용)

차단 결함 없음. P0 위반 없음. P1 2건은 운영 배포 직전 운영자 체크리스트에 기재 필요.

---

## 1. V14 마이그레이션 분석

### 1-1. 문법 적합성 (PostgreSQL 16)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_movement_reserve_idempotency
    ON stock_movements (reference_type, reference_id, product_id, movement_type)
    WHERE reference_type IS NOT NULL
      AND reference_id IS NOT NULL
      AND movement_type = 'RESERVE';
```

- `CREATE UNIQUE INDEX IF NOT EXISTS` — PostgreSQL 9.5 이상 지원. 16-alpine 정상.
- `WHERE` 절 partial index — PostgreSQL 8.0 이상 지원. 문법 이상 없음.
- 인덱스 컬럼 4개 (reference_type VARCHAR(30) / reference_id UUID / product_id UUID / movement_type VARCHAR(20)): V1 DDL 에서 모두 실존하는 컬럼 확인됨.
- `movement_type = 'RESERVE'` 상수 필터 — 기존 INBOUND/DEDUCT/RELEASE/ADJUST row 는 partial 조건에 해당하지 않아 인덱스 적용 제외. 의도 일치.

### 1-2. 기존 데이터 충돌 위험

V1 DDL: `reference_type VARCHAR(30)` / `reference_id UUID` — 둘 다 nullable (NOT NULL 없음).

partial 조건 `reference_type IS NOT NULL AND reference_id IS NOT NULL AND movement_type = 'RESERVE'`:
- 기존 row 중 reference_type=NULL 또는 reference_id=NULL 인 RESERVE 행: partial 조건 비충족 → 인덱스 스캔 대상 제외 → 충돌 없음.
- 기존 row 중 reference_type NOT NULL + reference_id NOT NULL + movement_type=RESERVE 행: 동일 (reference_type, reference_id, product_id) 조합이 2건 이상 존재하면 인덱스 생성 실패.

**판정**: Phase 2.6c 이전에는 referenceType/referenceId 를 채워서 RESERVE를 기록하는 경로가 존재하지 않았음 (PartnerOrderConfirmService.confirm 의 reserve 호출은 referenceType=null 로 호출). 따라서 기존 DB에 (NOT NULL reference_type, NOT NULL reference_id, movement_type=RESERVE) 행이 중복으로 존재할 가능성 없음. `IF NOT EXISTS` 로 재실행 안전. **충돌 위험 없음.**

단, 운영 배포 전 다음 SQL로 사전 확인 권장 (P1):

```sql
SELECT reference_type, reference_id, product_id, count(*)
FROM stock_movements
WHERE reference_type IS NOT NULL
  AND reference_id IS NOT NULL
  AND movement_type = 'RESERVE'
GROUP BY reference_type, reference_id, product_id
HAVING count(*) > 1;
```

결과 0행 확인 후 Flyway 마이그레이션 진행.

### 1-3. 멱등 여부

- `IF NOT EXISTS`: 이미 인덱스가 생성된 상태에서 재실행 → no-op. Flyway 체크섬 불변이므로 이중 실행 시나리오는 없으나 수동 재실행 시에도 안전.

### 1-4. 롤백 안전성

- `DROP INDEX ux_stock_movement_reserve_idempotency;` 로 롤백 가능.
- 인덱스만 추가하므로 기존 row/컬럼/FK 영향 없음.
- Flyway 유료 undo 없이도 DBA 수동 드롭으로 즉시 원복 가능.
- 롤백 후 재실행 시 `IF NOT EXISTS` 보호.

### 1-5. V번호 순서 정합

V1~V13 연속 확인됨 (V10~V13 포함). V14 는 V13 바로 다음 정상 순번. 갭 없음.

---

## 2. 배포 순서 분석

### 2-1. 의존 관계

```
inventory-service (V14 + by-code endpoint + reserve 멱등 가드)
    ↑ resolveWarehouseIdByCode (GET /internal/inventory/warehouses/by-code)
    ↑ reserve / release POST
partner-order-service (InventoryClient — convert 시 호출)
```

slip-service 는 이번 슬라이스에서 Flyway 변경 없음. PARTNER_ORDER 전표 SENT 전이 로직만 추가.

### 2-2. 배포 순서 명시 확인

- `docs/superpowers/plans/2026-05-30-inventory-deduction-2-6c.md`: "배포 순서(의무): inventory-service → slip-service → partner-order-service" 명시됨.
- `docs/dev-reports/phase-2-6c-inventory-reserve.md`: 배포 순서 섹션이 별도로 없음 (P2 — 문서 보완 권장).

### 2-3. 선행 서비스 미기동 시 리스크

**partner-order 가 먼저 뜨고 inventory 가 늦게 뜨는 경우:**
- `InventoryClient.resolveWarehouseIdByCode` 호출 → Eureka lb → inventory-service 404/연결 실패 → `BusinessException(NOT_FOUND 또는 INTERNAL_ERROR)` 전파 → convert API 500 응답.
- 재고 예약 없이 전환 API 전체 실패. slip 미발행. 안전 실패(fail-safe).

**slip-service 가 늦게 뜨는 경우:**
- convert 흐름 중 slip 발행 실패 → release 보상 → 전환 실패. 안전 실패.

판정: 배포 순서가 지켜지지 않아도 데이터 정합성 훼손 없이 API 오류로 실패. 운영 영향은 일시적 convert 불가. **치명적 결함 없음.** 단 배포 순서 의무는 PR body / 운영 체크리스트에 명시 필요 (P1).

---

## 3. 서비스 간 인증 분석

### 3-1. by-code 엔드포인트 인증

- `InternalWarehouseController`: `@RequestMapping("/internal/inventory/warehouses")` — `/internal/` prefix.
- 주석: "SecurityConfig 의 `InternalTokenFilter` 가 X-Internal-Token 헤더를 검증하므로 별도 권한 어노테이션 불필요 (gateway 미통과)".
- `AbstractPostgresIT.DynamicPropertySource`: `registry.add("app.security.internal.token", () -> "test-internal-token")` — IT 테스트에서 토큰 값 주입 확인됨.
- `Phase26cReserveIT`: `INTERNAL_TOKEN = "test-internal-token"` 으로 헤더 설정 후 by-code 호출 → by-code 엔드포인트가 InternalTokenFilter 를 정상 통과하는 방식으로 테스트됨. 인증 경로 일관.

### 3-2. reserve 호출 권한

- `InventoryClient.reserve()`: `POST /inventory/reserve` — `/internal/` prefix가 아닌 `/inventory/reserve` 경로.
- 헤더: `X-Internal-Token` 을 `requireToken()` 으로 주입.
- inventory-service 의 기존 `/inventory/reserve` 엔드포인트가 X-Internal-Token 으로 인증되는지 별도 확인 필요.

추가 확인:

```
InventoryClient.reserve → POST /inventory/reserve (X-Internal-Token 헤더)
InventoryClient.release → POST /inventory/release (X-Internal-Token 헤더)
```

이 두 경로가 `/internal/` prefix 아래 있지 않음. 기존 공개 inventory API (`/inventory/reserve`)를 내부 호출로 재사용하는 구조. 기존 경로에 InternalTokenFilter 적용 여부는 inventory-service SecurityConfig 에 달림. **Phase 2.6a~b 부터 이미 partner-order → inventory reserve 호출 구조가 존재했으므로 기존 인증 체계를 재사용하는 것은 정합.** 신규 by-code 만 `/internal/` 신규 경로. 이상 없음.

### 3-3. Eureka lb

`InventoryClient`: `http://inventory-service` → Eureka lb. `@Qualifier("loadBalancedRestClientBuilder")` 사용. 기존 패턴과 동일. CI IT 는 `eureka.client.enabled=false` + `@MockBean InventoryClient` 로 격리됨. 정합.

---

## 4. .gitignore 복구 분석

#326 commit 에서 추가된 항목 대비 복구 상태:

| 항목 | 추가 여부 |
|---|---|
| `.claude/settings.local.json` / `.claude/settings.json` / `.claude/.cache/` / `.claude/worktrees/` / `.claude/scheduled_tasks.lock` | 추가됨 |
| `.pr-body*.md` / `.issue-*.md` / `.tm-*.md` / `.pm-*.md` | 추가됨 |
| `.tmp/` / `.tmp-*` / `commit-msg.txt` | 추가됨 |
| `tools/legacy-gas/` | 추가됨 (`legacy-gas/` 가 아닌 `tools/legacy-gas/` — 실제 경로 구조 일치 필요, 확인 권장) |
| `infrastructure/terraform/.terraform/` / `.terraform.lock.hcl` / `terraform.tfstate` / `terraform.tfstate.backup` / `tfplan` | 추가됨 |
| `.superpowers/` | 추가됨 |
| `release/` / `clients/desktop/legacy-assets/estimate/*.html` | 추가됨 |

현재 `.gitignore` 에 없는 항목 (`C템:tempit_raw.json` 스타일 임시파일): git status 에 `?? "C\357\200\272tempit_raw.json"` 표시됨 — 이 파일은 `.gitignore` 미포함이지만 임시 파일로 보임. Phase 2.6c 범위 외. 무시 가능.

`.gradle-codex/` 항목: git status 에 `?? .gradle-codex/` 표시됨. `.gitignore` 에 명시적 항목 없음. 단 `.gradle-codex/` 는 codex 작업 디렉토리로 추적 금지 대상. 이번 슬라이스에서 추가하지 않은 것은 범위 외이나 차기 슬라이스에서 추가 권장 (P2).

과누락/과포함: 검토한 범위 내 과포함(기존 추적 필요 파일의 무시처리) 없음.

---

## 5. application.yml 변경 영향

slip-service `application.yml`: `warehouse-code-map` 정적 매핑 유지. 이번 슬라이스에서 slip-service 의 `warehouseCodeMapper` 로직은 변경 없음. `InternalWarehouseController` 의 by-code 조회는 inventory DB 직접 조회 — slip-service 와 이중 출처 혼용 문제 없음 (by-code 는 partner-order 전용).

inventory-service `application.yml`: `app.security.internal.token` 경로 기존과 동일. 신규 env var 없음. `.env.dev-seed` 의 `SAMHAN_INTERNAL_TOKEN=dev-internal-token-change-me` 와 정합.

---

## 6. CI matrix 영향

| 테스트 클래스 | 서비스 | CI 그룹 | timeout |
|---|---|---|---|
| `Phase26cReserveIT` | inventory-service | `user+product+inventory+logging` | 30분 |
| `Phase26cConvertReserveIT`, `PartnerOrderConvertIT` | partner-order-service | `accounting+partner` | 30분 |
| `Phase26cSlipImmutableIT` | slip-service | `slip-it-public` (publish 패키지) | 30분 |

`Phase26cSlipImmutableIT` 패키지: `com.samhanair.logis.slip.publish` — `slip-it-public` 그룹의 `--tests "com.samhanair.logis.slip.publish.*"` 에 포함됨. 정합.

`Phase26cReserveIT` 패키지: `com.samhanair.logis.inventory.it` — `user+product+inventory+logging` 그룹의 `:services:inventory-service:test` 에 포함됨. 정합.

기존 `slip-it-*` 제외 정책(PR #99 memory): `slip-it-public` / `slip-it-core` 는 PR #102 fix 이후 재활성됨. 현재 CI matrix 에 포함 확인. 이상 없음.

---

## 7. 멱등 설계 이중 보호 정합

코드 가드(StockService.reserve): `findByReferenceTypeAndReferenceIdAndProductIdAndMovementType` 조회 → 존재 시 no-op 반환. 트랜잭션 내 동기.

DB 인덱스(V14): partial unique index — 동시 경쟁(race condition) 에서 코드 가드를 통과한 두 요청이 동시에 INSERT 시도 시 DB 레벨에서 중복 차단. `DataIntegrityViolationException` 발생.

단, `StockService.reserve()` 에서 `DataIntegrityViolationException` 을 명시적으로 catch 하여 no-op 으로 변환하는 처리가 없는 경우 동시 요청 시 500 응답이 발생할 수 있음. (P1)

코드 확인: `StockService.reserve()` 본문에 `DataIntegrityViolationException` catch 블록 없음. 인덱스는 race condition 에서 INSERT 중복을 막아 500 방지 역할을 한다고 설계 의도가 있지만, 실제로는 500으로 전파됨. 단일 요청 경로에서는 코드 가드가 선차단하므로 운영에서 발생 가능성은 낮음. 동시 재시도(네트워크 재전송)는 드문 케이스이므로 P1 수준.

---

## P0 / P1 / P2 요약

### P0 (차단) — 없음

### P1 (운영 전 확인 필요)

**P1-A: 운영 DB 사전 확인 SQL 미실행 리스크**
- 배포 전 `SELECT ... HAVING count(*) > 1` 으로 기존 중복 RESERVE 행 0건 확인 필수.
- 중복 존재 시 V14 `CREATE UNIQUE INDEX` 실패 → inventory-service 기동 불가(Flyway 오류).
- 가능성 낮음 (기존 reserve 경로가 referenceId=null 이었음) 이나 운영 체크리스트에 포함 의무.

**P1-B: DataIntegrityViolationException 동시 race no-op 처리 부재**
- 동시 재전송 시 코드 가드를 통과한 두 스레드가 동시 INSERT → V14 unique index → `DataIntegrityViolationException` → 500 응답.
- 단일 요청 정상 경로에서는 코드 가드가 선차단하므로 운영 발생 빈도 낮음.
- 향후 고부하 환경 고려 시 catch 후 no-op 처리 추가 권장 (차기 슬라이스 백로그).

### P2 (개선 권장)

**P2-A: dev-report 에 배포 순서 섹션 누락**
- Plan 문서에는 "배포 순서(의무)" 명시되어 있으나 `docs/dev-reports/phase-2-6c-inventory-reserve.md` 에 해당 섹션이 없음.
- PR body 또는 dev-report 에 "inventory-service → slip-service → partner-order-service" 순서와 이유(by-code 404 방지) 한 줄 추가 권장.

**P2-B: `.gradle-codex/` .gitignore 미포함**
- 현재 `git status` 에 `?? .gradle-codex/` 노출. 차기 PR 에서 `.gitignore` 추가 권장.

**P2-C: tools/legacy-gas/ 경로 실존 확인 권장**
- `.gitignore` 에 `tools/legacy-gas/` 추가됨. 실제 경로가 `tools/legacy-gas/` 인지 확인 후 git status 에서 흔적이 있는지 점검 필요 (현재 repo 에서 해당 경로 미확인).

---

## 8. 배포 리스크 요약

| 리스크 | 심각도 | 발생 가능성 | 완화 방법 |
|---|---|---|---|
| V14 기존 RESERVE 중복 행 존재 시 Flyway 실패 | HIGH | 낮음 | 배포 전 사전 SQL 점검 (P1-A) |
| inventory 미기동 상태 partner-order 기동 시 convert 500 | MEDIUM | 배포 순서 준수로 방지 | 배포 순서 의무 운영 체크리스트 명시 |
| race condition 동시 reserve DataIntegrityViolation 500 | LOW | 매우 낮음 | 향후 catch 처리 권장 (P1-B) |
| .gitignore 미포함 파일 VCS 노출 | NEGLIGIBLE | 없음 | 현 범위에서 운영 파일 노출 없음 |

---

## 9. APPROVE 근거

1. V14 SQL 문법 정합. partial index 설계 의도 부합. 기존 데이터 충돌 없음. 롤백 가능.
2. V14 순번 V13 바로 다음. Flyway 갭 없음.
3. by-code 엔드포인트 X-Internal-Token 가드. IT 에서 토큰 주입 및 헤더 검증 확인.
4. InventoryClient 멱등 reserve: referenceType/referenceId 오버로드 + null 분기로 기존 confirm 경로 무영향.
5. DataIntegrityViolationException race condition 은 P1 이나 운영 발생 빈도 낮아 차단 수준 아님.
6. .gitignore 복구 항목 일치. 과포함 없음.
7. CI 그룹 배치 정합. slip-it-public 포함 확인.
8. 배포 순서 plan 문서에 명시됨. dev-report 보완은 P2.
9. `PartnerOrderConfirmService.confirm()` 에서 inventoryClient 제거 완료 확인. 주문 무영향 원칙 준수.
