# Samhan Public 배차 메뉴 (Phase A) — 5 단계 롤백 dry-run runbook

> **branch** — `feat/samhan-dispatch-board-spec` 기반 QA 슬라이스
> **작성일** — 2026-05-14
> **작성** — QA Team
> **목적** — spec § 7.5 의 5 단계 reversible 롤백 절차를 dry-run 명령 + 예상 결과로 사전 검증. 본 runbook 은 실 운영 사고 시점에서도 그대로 실행 가능한 명령 시퀀스.
> **총 예상 시간** — 약 1 시간 50 분 (FE 30 + arologis 30 + slip 30 + Slip column 10 + VehicleTonnage 10 + buffer 10)
> **연관 산출물** —
> - `docs/superpowers/specs/2026-05-14-samhan-dispatch-board-design.md` § 7.5
> - `docs/qa/samhan-dispatch-board/scenarios.md` (정상 흐름 6 시나리오)
> - `docs/qa/samhan-dispatch-board/regression.md` (회귀 가드)

---

## 0. 사전 가드

### 0.1 dry-run 정책

- DB ALTER TABLE 은 staging 환경의 db dump 복사본에서 1회 dry-run 의무 (실 운영 적용 직전)
- `git revert` 는 isolated worktree 에서 1회 시뮬레이션 후 main 적용
- Flyway 의 forward-only 정책에 의해 본 롤백은 **별도 down migration** 작성 (V18__rollback_dispatch_status.sql, V11__rollback_vehicle_tonnage_check.sql)

### 0.2 트리거 조건

본 롤백은 다음 중 1건 이상일 때만 실행:

| 트리거 | 검증 |
|---|---|
| 시나리오 1~6 중 🔴 Critical FAIL (운영 적용 후) | TM PR comment 의 QA 보고 |
| 배차 발송 후 회신 누락 30분 이상 지속 | notification-service Aligo 미발송 알람 |
| Samhan Public 기존 14 service 회귀 FAIL | CI samhanlogis-ci.yml red |
| arologis Mock matcher 응답 30분 이상 끊김 | EC2 health check Lambda 알람 |

### 0.3 롤백 단계 의존성

```
Step 1 (FE 회수) → Step 2 (arologis BE 회수) → Step 3 (slip BE 회수)
                                                  ↓
Step 4 (slip.dispatch_status DROP) → Step 5 (VehicleTonnage CHECK 11→5 복원)
```

**Step 1+2 만 실행 시 빠른 격리** (60분, 데이터/코드 보존). Step 3~5 는 슬라이스 전체 회수 시점에 진행.

---

## 1. Step 1 — FE 회수 (30 분)

### 1.1 목적

`/dispatch-board` 라우트 + 사이드바 "배차 메뉴" 항목 + `@dnd-kit/core` 의존성을 제거하여 사용자가 접근하지 못하도록 회수. BE / DB 변경 없음.

### 1.2 dry-run 절차

```bash
# 1. 회수 대상 FE 파일 확인 (read-only)
git log --oneline --diff-filter=A clients/desktop/src/pages/dispatch-board/ \
  clients/desktop/src/components/dispatch-board/ \
  clients/mobile-staff/src/screens/dispatch-board/ 2>&1

# Expected: F1~F6 의 신규 파일 list (DispatchBoardPage.tsx, VehicleGroupCard.tsx, AddVehicleModal.tsx, SlipDetailModal.tsx, DispatchCompleteDialog.tsx, mobile/DispatchBoardScreen.tsx)

# 2. 사이드바 메뉴 항목 차단 — 1줄 패치 dry-run
grep -rn "배차 메뉴" clients/desktop/src/components/Sidebar.tsx 2>/dev/null
# Expected: 1 라인의 sidebar entry 위치 확인 — 본 라인을 hidden 으로 토글
```

### 1.3 실 실행 명령

```bash
# Option A — git revert (통합 PR commit 1건 revert)
git revert <FE-COMMIT-SHA> --no-edit
git push origin <ROLLBACK_BRANCH>
gh pr create --title "rollback: 배차 메뉴 FE 회수 (Step 1)" \
  --body "Phase A 롤백 Step 1 — FE 라우트 + 사이드바 회수. BE/DB 변경 없음."

# Option B — feature flag 즉시 차단 (FE redeploy 시간 미가용 시)
# (사전에 feature flag 도입 시) FEATURE_DISPATCH_BOARD=false 환경변수로 차단
```

### 1.4 검증

```bash
# desktop / mobile-staff 의 `/dispatch-board` URL 접근 시 404 / NotFound
curl -sf http://localhost:3000/dispatch-board
# Expected: 404 또는 redirect to /home

# 사이드바에서 "배차 메뉴" 항목 보이지 않음 (수동 UI 확인)
```

### 1.5 복귀 조건

- 회수 PR revert: 다시 revert (재 revert = 원래 상태 복귀)
- 환경변수 차단: `FEATURE_DISPATCH_BOARD=true` 복귀

---

## 2. Step 2 — arologis BE 회수 (30 분)

### 2.1 목적

arologis-service 의 신규 `POST /internal/arologis/dispatches` endpoint + `SlipDispatchTaskClient` 제거. arologis 의 기존 endpoint (`POST /admin/arologis/parse-kakao` 등) 무영향.

### 2.2 dry-run 절차

```bash
# 회수 대상 arologis 파일
git log --oneline --diff-filter=A \
  services/arologis-service/src/main/java/.../arologis/dispatchreceive/ \
  services/arologis-service/src/main/java/.../client/SlipDispatchTaskClient.java \
  services/arologis-service/src/main/java/.../matcher/MockDriverMatcher.java 2>&1
# Expected: 본 슬라이스에서 add 된 file list

# 회수 영향 — 기존 ArologisInternalController 에 `/dispatches` POST 만 회수, 기존 entrypoint 유지
grep -n "dispatches" services/arologis-service/src/main/java/.../controller/ArologisInternalController.java
# Expected: 본 슬라이스 추가 endpoint 만 회수 (기존 sync / parse-kakao 는 유지)
```

### 2.3 실 실행 명령

```bash
# Option A — feature toggle 즉시 차단 (controller 의 @ConditionalOnProperty)
# (BE 사전 도입 시) SAMHAN_AROLOGIS_DISPATCH_ENABLED=false 로 endpoint 비활성
docker-compose -f infrastructure/docker/docker-compose.yml exec arologis-service \
  /bin/sh -c "echo 'SAMHAN_AROLOGIS_DISPATCH_ENABLED=false' >> /app/.env" && \
  docker-compose restart arologis-service

# Option B — git revert (통합 PR 의 arologis 영역 commit revert)
git revert <AROLOGIS-COMMIT-SHA> --no-edit
./gradlew :services:arologis-service:assemble
docker-compose build arologis-service && docker-compose up -d arologis-service
```

### 2.4 검증

```bash
# endpoint 비활성 확인
curl -X POST http://localhost:8097/internal/arologis/dispatches \
  -H "X-Internal-Token: <shared>" -H "Content-Type: application/json" -d '{}'
# Expected: HTTP 404 (endpoint 미존재) 또는 503 (feature toggle off)

# 기존 endpoint 정상 유지 확인
curl -sf http://localhost:8097/actuator/health | jq '.status'
# Expected: "UP"

# slip-service 측의 dispatch 호출 시 fallback (timeout 5s 후 DispatchTask FAILED)
# — 본 단계 후 30분 이상 운영 시 slip-service 도 회수 (Step 3)
```

### 2.5 복귀 조건

- feature toggle: 환경변수 `SAMHAN_AROLOGIS_DISPATCH_ENABLED=true`
- git revert: 다시 revert + redeploy

---

## 3. Step 3 — slip-service BE 회수 (30 분)

### 3.1 목적

slip-service 의 신규 3 entity (`dispatch_task`/`dispatch_vehicle_group`/`dispatch_vehicle_group_slip`) + `ArologisDispatchClient` + `DispatchTaskInternalController` 제거. **단, Step 4 까지는 DB 테이블 자체는 유지** (data 보존).

### 3.2 dry-run 절차

```bash
# 회수 대상 slip-service 파일
git log --oneline --diff-filter=A \
  services/slip-service/src/main/java/.../slip/dispatch/ \
  services/slip-service/src/main/java/.../client/ArologisDispatchClient.java \
  services/slip-service/src/main/resources/db/migration/V16__dispatch_tables.sql \
  services/slip-service/src/main/resources/db/migration/V17__slip_dispatch_status.sql 2>&1
# Expected: 본 슬라이스에서 추가된 file list

# 본 코드 회수가 기존 slip lifecycle 에 영향 X 확인
grep -rn "dispatchStatus\|DispatchStatus" services/slip-service/src/main/java/.../slip/domain/Slip.java
# Expected: dispatchStatus field 1개 — 단순 column 추가 (geometry 변경 없음)
```

### 3.3 실 실행 명령

```bash
# Option A — feature toggle (Controller 의 @ConditionalOnProperty)
# (BE 사전 도입 시) SAMHAN_DISPATCH_BOARD_ENABLED=false
docker-compose -f infrastructure/docker/docker-compose.yml exec slip-service \
  /bin/sh -c "echo 'SAMHAN_DISPATCH_BOARD_ENABLED=false' >> /app/.env" && \
  docker-compose restart slip-service

# Option B — git revert (통합 PR 의 slip 영역 commit revert)
git revert <SLIP-COMMIT-SHA> --no-edit
./gradlew :services:slip-service:assemble
docker-compose build slip-service && docker-compose up -d slip-service
```

### 3.4 검증

```bash
# admin endpoint 비활성 확인
curl -sf http://localhost:8084/admin/dispatch-tasks \
  -H "Authorization: Bearer <manager-jwt>"
# Expected: HTTP 404 또는 503

# internal endpoint 비활성 확인
curl -X POST http://localhost:8084/internal/slip/dispatch-tasks/<id>/confirm \
  -H "X-Internal-Token: <shared>" -H "Content-Type: application/json" -d '{}'
# Expected: HTTP 404

# 기존 slip endpoint 정상 유지
curl -sf http://localhost:8084/admin/slips \
  -H "Authorization: Bearer <manager-jwt>" | jq '.content | length'
# Expected: >0 (기존 slip 응답 정상)

# DB 의 dispatch_task / dispatch_vehicle_group(_slip) 데이터 보존 확인 (Step 4 미실행)
PGPASSWORD=devpass psql -h localhost -U devuser -d slip_service -c \
  "SELECT COUNT(*) FROM dispatch_task; SELECT COUNT(*) FROM dispatch_vehicle_group; SELECT COUNT(*) FROM dispatch_vehicle_group_slip;"
# Expected: row 수 >0 (data 보존)
```

### 3.5 복귀 조건

- feature toggle: `SAMHAN_DISPATCH_BOARD_ENABLED=true` + restart
- git revert: 다시 revert + redeploy
- DB 보존 → Step 4 미실행 시 data 그대로 복귀

---

## 4. Step 4 — `slip.dispatch_status` column DROP (10 분)

### 4.1 목적

`slip` 테이블의 `dispatch_status` column 과 partial index 제거. **데이터 손실 발생** — 본 단계는 슬라이스 전체 회수 결정 후에만 실행.

### 4.2 사전 가드

- Step 1~3 이 production 에서 30 분 이상 안정 적용된 후 진행
- DB dump 백업 의무 (PG pg_dump)
- staging 환경 dry-run 1회 의무

### 4.3 down migration script (V18 으로 신규 추가)

```sql
-- services/slip-service/src/main/resources/db/migration/V18__rollback_slip_dispatch_status.sql
-- (Flyway forward-only 정책에 따라 down 도 forward migration 으로 작성)

BEGIN;

-- 1. partial index 제거
DROP INDEX IF EXISTS idx_slip_dispatch_status_active;

-- 2. CHECK constraint 제거 (column 제거 전 의무)
ALTER TABLE slip DROP CONSTRAINT IF EXISTS slip_dispatch_status_check;

-- 3. column 제거
ALTER TABLE slip DROP COLUMN IF EXISTS dispatch_status;

COMMIT;
```

### 4.4 dry-run

```bash
# 1. staging db 의 슬라이스 적용 상태 검증
PGPASSWORD=devpass psql -h staging-db -U devuser -d slip_service <<'SQL'
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'slip' AND column_name = 'dispatch_status';
SQL
# Expected: 1 row (column 존재 확인)

# 2. backup 의무
pg_dump -h staging-db -U devuser -d slip_service --table=slip --data-only \
  > /backup/slip-data-before-rollback-step4-$(date +%Y%m%d).sql

# 3. V18 down migration dry-run (staging)
./gradlew :services:slip-service:flywayMigrate -PflywayUrl=jdbc:postgresql://staging-db:5432/slip_service \
  --info 2>&1 | tee /tmp/flyway-rollback-step4.log

# Expected: Migrating schema "public" to version "18 - rollback slip dispatch status"
```

### 4.5 실 실행

```bash
# Production 적용 (staging 검증 완료 후)
./gradlew :services:slip-service:flywayMigrate -PflywayUrl=jdbc:postgresql://prod-db:5432/slip_service
# Expected: Migration 18 적용 완료
```

### 4.6 검증

```sql
-- 1. column 제거 확인
SELECT column_name FROM information_schema.columns
WHERE table_name = 'slip' AND column_name = 'dispatch_status';
-- Expected: 0 rows

-- 2. partial index 제거 확인
SELECT indexname FROM pg_indexes WHERE indexname = 'idx_slip_dispatch_status_active';
-- Expected: 0 rows

-- 3. Flyway history
SELECT version, description, success FROM flyway_schema_history WHERE version='18';
-- Expected: 1 row, success=true
```

### 4.7 복귀 조건 (Step 4 회수 = Step 4 re-do)

```sql
-- Step 4 회수 시 다시 V19 migration 으로 column 추가 (forward-only)
ALTER TABLE slip
  ADD COLUMN dispatch_status VARCHAR(32) NOT NULL DEFAULT 'UNDISPATCHED'
    CHECK (dispatch_status IN ('UNDISPATCHED','DISPATCHING','DISPATCHED'));
CREATE INDEX idx_slip_dispatch_status_active ON slip(dispatch_status) WHERE is_deleted=FALSE;
```

---

## 5. Step 5 — arologis `VehicleTonnage` CHECK constraint 11→5 복원 (10 분)

### 5.1 목적

arologis-service 의 `vehicle.tonnage` CHECK constraint 를 신규 11 값에서 legacy 5 값으로 복원. **신규 7 값 (`MOTORCYCLE`/`DAMAS`/`TONNAGE_1_5`/`TONNAGE_3`/`TONNAGE_10`/`TONNAGE_20`) 데이터 손실 발생**.

### 5.2 down migration (V11 신규)

```sql
-- services/arologis-service/src/main/resources/db/migration/V11__rollback_vehicle_tonnage_check.sql

BEGIN;

-- 1. 기존 vehicle row 의 신규 enum 값 매핑 정리 (또는 archive)
-- (필요 시) UPDATE vehicle SET tonnage='TONNAGE_1' WHERE tonnage IN ('MOTORCYCLE','DAMAS','TONNAGE_1_5');
-- (필요 시) UPDATE vehicle SET tonnage='TONNAGE_5' WHERE tonnage IN ('TONNAGE_3','TONNAGE_10','TONNAGE_20');

-- 2. CHECK constraint 갱신 (11 → 5 legacy)
ALTER TABLE vehicle DROP CONSTRAINT IF EXISTS vehicle_tonnage_check;
ALTER TABLE vehicle ADD CONSTRAINT vehicle_tonnage_check
  CHECK (tonnage IN ('TONNAGE_1','TONNAGE_1_4','TONNAGE_2_5','TONNAGE_5','TONNAGE_BIG'));

COMMIT;
```

### 5.3 dry-run

```bash
# 1. 신규 enum 값을 사용한 vehicle row 확인
PGPASSWORD=devpass psql -h staging-db -U devuser -d arologis_service <<'SQL'
SELECT tonnage, COUNT(*) FROM vehicle WHERE is_deleted=FALSE GROUP BY tonnage ORDER BY tonnage;
SQL
# Expected: 신규 7 값에 대한 row 분포 (있다면 archive 의무)

# 2. backup
pg_dump -h staging-db -U devuser -d arologis_service --table=vehicle --data-only \
  > /backup/vehicle-data-before-rollback-step5-$(date +%Y%m%d).sql

# 3. archive 의무 (운영 회수 시)
PGPASSWORD=devpass psql -h staging-db -U devuser -d arologis_service <<'SQL'
CREATE TABLE IF NOT EXISTS vehicle_archive_phase_a_rollback AS
SELECT * FROM vehicle WHERE tonnage IN ('MOTORCYCLE','DAMAS','TONNAGE_1_5','TONNAGE_3','TONNAGE_10','TONNAGE_20');
SQL
```

### 5.4 실 실행

```bash
./gradlew :services:arologis-service:flywayMigrate -PflywayUrl=jdbc:postgresql://prod-db:5432/arologis_service
# Expected: Migration 11 적용 완료
```

### 5.5 검증

```sql
-- 1. CHECK constraint 변경 확인
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='vehicle'::regclass AND conname='vehicle_tonnage_check';
-- Expected: CHECK (tonnage IN ('TONNAGE_1','TONNAGE_1_4','TONNAGE_2_5','TONNAGE_5','TONNAGE_BIG'))

-- 2. 신규 enum 값 row 부재 확인
SELECT COUNT(*) FROM vehicle
WHERE tonnage IN ('MOTORCYCLE','DAMAS','TONNAGE_1_5','TONNAGE_3','TONNAGE_10','TONNAGE_20');
-- Expected: 0 (또는 archive 으로 이동 완료)
```

### 5.6 복귀 조건

- Step 5 회수 = 다시 V12 forward migration 으로 11 값 CHECK 복원

---

## 6. 5 단계 전체 매트릭스

| Step | 영역 | 시간 | 데이터 영향 | git 또는 DB |
|---|---|---|---|---|
| 1 | FE 라우트 + 사이드바 | 30분 | 무영향 | git revert 또는 feature toggle |
| 2 | arologis BE `/internal/arologis/dispatches` | 30분 | 무영향 (DB 무관) | git revert 또는 toggle |
| 3 | slip-service BE 3 entity + Controller | 30분 | 무영향 (DB 보존) | git revert 또는 toggle |
| 4 | `slip.dispatch_status` column DROP | 10분 | **column 삭제** | Flyway V18 (forward) |
| 5 | arologis `VehicleTonnage` CHECK 5→legacy | 10분 | **archive 의무** | Flyway V11 (forward) |
| **합** | | **~110분** | | |

---

## 7. 롤백 후 통합 가드

### 7.1 회귀 재실행

```bash
# 회귀 ~98 case 다시 PASS 확인 (slip-service)
./gradlew :services:slip-service:test --info 2>&1 | tee /tmp/post-rollback-regression.log
# Expected: 0 failed, 0 error
```

### 7.2 사용자 알림

- notification-service Aligo 알람: `Phase A 배차 메뉴 회수 완료 (Step X/5)`
- TM PR comment 에 회수 완료 보고 (각 step 별 시각 + 검증 결과 첨부)

### 7.3 추후 재시도

본 슬라이스 재 적용 시 동일한 통합 PR pattern (5-team) + 6 시나리오 재검증 의무. 회수 사유의 root cause 가 spec 단계에 영향 있다면 spec 갱신 후 새 슬라이스 작성.

---

## 8. 참조

- `feedback_integrated_pr_pattern` — 통합 PR 단위 회수
- `feedback_pm_integration_build_check` — 회수 후 풀빌드 가드
- `feedback_korean_path_jdk` — Windows 한글 path 가드 (회귀 재실행 시)
- spec § 7.5 — 5 단계 reversible 롤백 정의
- spec § 4.4 — Flyway migration 정의 (V16/V17/V10)
