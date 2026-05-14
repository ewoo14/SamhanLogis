# Samhan Public 배차 수정/취소 (Phase C) — 4 단계 롤백 dry-run runbook

> **branch** — `feat/samhan-dispatch-modification-spec` 기반 QA 슬라이스
> **작성일** — 2026-05-14
> **작성** — QA Team
> **목적** — spec § 7.5 의 4 단계 reversible 롤백 절차를 dry-run 명령 + 예상 결과로 사전 검증. 본 runbook 은 실 운영 사고 시점에서도 그대로 실행 가능한 명령 시퀀스.
> **총 예상 시간** — 약 1 시간 30 분 (FE 30 + slip 30 + arologis 20 + Flyway 10 + buffer)
> **연관 산출물** —
> - `docs/superpowers/specs/2026-05-14-samhan-dispatch-modification-design.md` § 7.5
> - `docs/qa/samhan-dispatch-modification/scenarios.md` (정상 흐름 6 시나리오)
> - `docs/qa/samhan-dispatch-modification/regression.md` (회귀 가드)
> - `docs/qa/samhan-dispatch-board/rollback-dry-run.md` (Phase A 의 5 단계 — 본 슬라이스 회수 후 Phase A 도 회수 시점에 활용)

---

## 0. 사전 가드

### 0.1 dry-run 정책

- DB ALTER TABLE 은 staging 환경의 db dump 복사본에서 1회 dry-run 의무 (실 운영 적용 직전)
- `git revert` 는 isolated worktree 에서 1회 시뮬레이션 후 main 적용
- Flyway 의 forward-only 정책에 의해 본 롤백은 **별도 down migration** 작성 (V24__rollback_dispatch_task_status_phase_c.sql)
- Phase A 의 rollback (Step 1~5) 은 **본 슬라이스 회수 후 별도 결정** — 4 단계는 Phase C 만 회수

### 0.2 트리거 조건

본 롤백은 다음 중 1건 이상일 때만 실행:

| 트리거 | 검증 |
|---|---|
| 시나리오 1~6 중 🔴 Critical FAIL (운영 적용 후) | TM PR comment 의 QA 보고 |
| 수정/취소 요청 발송 후 회신 누락 30분 이상 지속 | notification-service Aligo 미발송 알람 |
| Phase A 의 DispatchTask DISPATCHED 흐름 회귀 FAIL | CI samhanlogis-ci.yml red |
| arologis Mock auto-accept 응답 30분 이상 끊김 | EC2 health check Lambda 알람 |
| `dispatch_task.status` row 들이 6 신규 상태에서 무한 stuck | DB 모니터링 알람 |

### 0.3 롤백 단계 의존성

```
Step 1 (FE 회수) → Step 2 (slip-service BE 회수) → Step 3 (arologis BE 회수)
                                                       ↓
                              Step 4 (Flyway V24 — status CHECK 11→4 + 4 column DROP)
```

**Step 1+2 만 실행 시 빠른 격리** (60분, 데이터/코드 보존). Step 3~4 는 슬라이스 전체 회수 시점에 진행.

---

## 1. Step 1 — FE 회수 (30 분)

### 1.1 목적

`DispatchTaskDetailModal` 의 [수정 요청] / [취소 요청] 버튼 + `ModificationRequestDialog` / `CancellationRequestDialog` + MODIFICATION_ACCEPTED 편집 모드 indicator + mobile-staff sub-BottomSheet 제거. BE / DB 변경 없음 — 사용자가 수정/취소 요청 trigger 못 함.

### 1.2 dry-run 절차

```bash
# 1. 회수 대상 FE 파일 확인 (read-only)
git log --oneline --diff-filter=A \
  clients/desktop/src/renderer/routes/dispatch-board/components/ModificationRequestDialog.tsx \
  clients/desktop/src/renderer/routes/dispatch-board/components/CancellationRequestDialog.tsx \
  clients/mobile-staff/src/screens/dispatch-board/ 2>&1
# Expected: F1~F4 의 신규 파일 + 수정 파일 list

# 2. DispatchTaskDetailModal 의 버튼 분기 패치 dry-run
grep -rn "showRequestButtons\|수정 요청\|취소 요청" \
  clients/desktop/src/renderer/routes/dispatch-board/components/ 2>/dev/null
# Expected: 본 슬라이스 추가 라인 list — 본 라인을 conditional false 또는 제거
```

### 1.3 실 실행 명령

```bash
# Option A — git revert (통합 PR commit 1건 revert)
git revert <FE-COMMIT-SHA> --no-edit
git push origin <ROLLBACK_BRANCH>
gh pr create --title "rollback: 배차 수정/취소 FE 회수 (Phase C Step 1)" \
  --body "Phase C 롤백 Step 1 — FE 수정/취소 dialog + 편집 모드 indicator 회수. BE/DB 변경 없음."

# Option B — feature flag 즉시 차단 (FE redeploy 시간 미가용 시)
# (사전에 feature flag 도입 시) FEATURE_DISPATCH_MODIFICATION=false 환경변수로 차단
```

### 1.4 검증

```bash
# desktop / mobile-staff 의 DispatchTaskDetailModal 에 [수정 요청] / [취소 요청] 버튼 보이지 않음
# 수동 UI 확인: DT-20260514-001 (DISPATCHED) 카드 click → modal 에 2 버튼 없음

# 회수 후 [수정 요청] / [취소 요청] dialog 코드 부재
grep -rn "ModificationRequestDialog\|CancellationRequestDialog" \
  clients/desktop/src/renderer/routes/dispatch-board/ 2>/dev/null
# Expected: import / 사용 모두 제거

# 회수 후 사용자가 DISPATCHED 인 task 에서 수정 trigger 불가능 — BE endpoint 는 살아 있지만 UI 진입로 차단
```

### 1.5 복귀 조건

- 회수 PR revert: 다시 revert (재 revert = 원래 상태 복귀)
- 환경변수 차단: `FEATURE_DISPATCH_MODIFICATION=true` 복귀

---

## 2. Step 2 — slip-service BE 회수 (30 분)

### 2.1 목적

slip-service 의 신규 5 service (Modification/Cancellation 의 Request + Decision 2종) + 2 Admin endpoint + 4 Internal endpoint + ArologisDispatchClient 2 메서드 제거. **단, Step 4 까지는 DB schema 자체는 유지** (data + column 보존).

### 2.2 dry-run 절차

```bash
# 회수 대상 slip-service 파일
git log --oneline --diff-filter=A \
  services/slip-service/src/main/java/com/samhanair/logis/slip/service/dispatch/DispatchTaskModificationRequestService.java \
  services/slip-service/src/main/java/com/samhanair/logis/slip/service/dispatch/DispatchTaskCancellationRequestService.java \
  services/slip-service/src/main/java/com/samhanair/logis/slip/service/dispatch/DispatchTaskModificationDecisionService.java \
  services/slip-service/src/main/java/com/samhanair/logis/slip/service/dispatch/DispatchTaskCancellationDecisionService.java \
  services/slip-service/src/main/java/com/samhanair/logis/slip/dto/dispatch/ArologisModificationRequest.java \
  services/slip-service/src/main/java/com/samhanair/logis/slip/dto/dispatch/ArologisCancellationRequest.java \
  services/slip-service/src/main/resources/db/migration/V23__expand_dispatch_task_status.sql 2>&1
# Expected: B1~B6 의 신규 파일 list

# 본 코드 회수가 Phase A 의 DRAFT→DISPATCHING→DISPATCHED→FAILED 흐름에 영향 X 확인
grep -rn "markDispatching\|markDispatched\|markFailed" \
  services/slip-service/src/main/java/com/samhanair/logis/slip/domain/dispatch/DispatchTask.java
# Expected: 4 메서드 시그니처 변경 없음 (본 슬라이스 의 markModification* / markCancel* 메서드 7 개만 추가)

# Phase A 의 DispatchTaskStatus 4 값 (DRAFT/DISPATCHING/DISPATCHED/FAILED) 유지 확인
grep -rn "DRAFT\|DISPATCHING\|DISPATCHED\|FAILED" \
  services/slip-service/src/main/java/com/samhanair/logis/slip/domain/dispatch/DispatchTaskStatus.java
# Expected: 4 enum 값 유지
```

### 2.3 실 실행 명령

```bash
# Option A — feature toggle (Controller 의 @ConditionalOnProperty)
# (BE 사전 도입 시) SAMHAN_DISPATCH_MODIFICATION_ENABLED=false
docker-compose -f infrastructure/docker/docker-compose.yml exec slip-service \
  /bin/sh -c "echo 'SAMHAN_DISPATCH_MODIFICATION_ENABLED=false' >> /app/.env" && \
  docker-compose restart slip-service

# Option B — git revert (통합 PR 의 slip 영역 commit revert)
git revert <SLIP-COMMIT-SHA> --no-edit
./gradlew :services:slip-service:assemble
docker-compose build slip-service && docker-compose up -d slip-service
```

### 2.4 검증

```bash
# Admin endpoint 비활성 확인
curl -X POST "http://localhost:8086/admin/dispatch-tasks/<taskCode>/modification-request" \
  -H "Authorization: Bearer <manager-jwt>" -H "Content-Type: application/json" \
  -d '{"reason":"test"}'
# Expected: HTTP 404 (endpoint 미존재) 또는 503 (feature toggle off)

curl -X POST "http://localhost:8086/admin/dispatch-tasks/<taskCode>/cancellation-request" \
  -H "Authorization: Bearer <manager-jwt>" -H "Content-Type: application/json" \
  -d '{"reason":"test"}'
# Expected: HTTP 404

# Internal endpoint 비활성 확인
curl -X POST "http://localhost:8086/internal/slip/dispatch-tasks/<id>/modification-accepted" \
  -H "X-Internal-Token: <shared>" -H "Content-Type: application/json" -d '{}'
# Expected: HTTP 404

# Phase A 의 dispatch endpoint 정상 유지 확인
curl -sf "http://localhost:8086/admin/dispatch-tasks" \
  -H "Authorization: Bearer <manager-jwt>" | jq '.content | length'
# Expected: >0 (Phase A dispatch_task list 응답 정상)

# DB 의 dispatch_task 의 4 신규 column 데이터 보존 확인 (Step 4 미실행)
PGPASSWORD=devpass psql -h localhost -U devuser -d slip_service -c \
  "SELECT COUNT(*) FROM dispatch_task WHERE modification_reason IS NOT NULL OR rejection_reason IS NOT NULL;"
# Expected: row 수 >0 (data 보존)

# 회수 후 사용자가 status MODIFICATION_REQUESTED 인 row 에 대해 어떻게 처리할 것인가?
# → 회수 후 30 분 이내 manual SQL 로 status='DISPATCHED' 로 reset 권고 (운영 가이드)
PGPASSWORD=devpass psql -h localhost -U devuser -d slip_service <<'SQL'
-- 회수 후 cleanup script (운영 수동 결정)
UPDATE dispatch_task
SET status='DISPATCHED'
WHERE status IN ('MODIFICATION_REQUESTED','MODIFICATION_ACCEPTED','MODIFICATION_REJECTED');
-- CANCEL_REQUESTED/ACCEPTED 등은 사용자 의도 확인 후 처리 (CANCELLED 면 그대로 또는 manual revert)
SQL
```

### 2.5 복귀 조건

- feature toggle: `SAMHAN_DISPATCH_MODIFICATION_ENABLED=true` + restart
- git revert: 다시 revert + redeploy
- DB 보존 → Step 4 미실행 시 data + column 그대로 복귀

---

## 3. Step 3 — arologis BE 회수 (20 분)

### 3.1 목적

arologis-service 의 신규 2 receive endpoint (`/internal/arologis/dispatches/{id}/modification-request` + `/cancellation-request`) + `ModificationRequestReceiveService` + `SlipDispatchTaskClient` 4 메서드 제거. arologis 의 기존 endpoint (Phase A `POST /internal/arologis/dispatches` 등) 무영향.

### 3.2 dry-run 절차

```bash
# 회수 대상 arologis 파일
git log --oneline --diff-filter=A \
  services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/ModificationRequestReceiveService.java 2>&1
# Expected: B7 의 신규 file list

# ArologisInternalController 의 신규 2 endpoint 만 회수 (기존 sync/parse-kakao + Phase A dispatches POST 유지)
grep -n "modification-request\|cancellation-request" \
  services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisInternalController.java
# Expected: 본 슬라이스 추가 endpoint 2 만 회수 — Phase A 의 `/dispatches` POST 유지

# SlipDispatchTaskClient 의 신규 4 메서드만 회수 (Phase A 의 confirm/unavailable 유지)
grep -n "modificationAccepted\|modificationRejected\|cancellationAccepted\|cancellationRejected" \
  services/arologis-service/src/main/java/com/samhanair/logis/arologis/client/SlipDispatchTaskClient.java
# Expected: 4 메서드 추가 — 회수 시 제거
```

### 3.3 실 실행 명령

```bash
# Option A — feature toggle (controller 의 @ConditionalOnProperty)
# (BE 사전 도입 시) SAMHAN_AROLOGIS_MODIFICATION_RECEIVE_ENABLED=false
docker-compose -f infrastructure/docker/docker-compose.yml exec arologis-service \
  /bin/sh -c "echo 'SAMHAN_AROLOGIS_MODIFICATION_RECEIVE_ENABLED=false' >> /app/.env" && \
  docker-compose restart arologis-service

# Option B — git revert (통합 PR 의 arologis 영역 commit revert)
git revert <AROLOGIS-COMMIT-SHA> --no-edit
./gradlew :services:arologis-service:assemble
docker-compose build arologis-service && docker-compose up -d arologis-service
```

### 3.4 검증

```bash
# 신규 endpoint 비활성 확인
curl -X POST "http://localhost:8097/internal/arologis/dispatches/<id>/modification-request" \
  -H "X-Internal-Token: <shared>" -H "Content-Type: application/json" -d '{}'
# Expected: HTTP 404 또는 503

curl -X POST "http://localhost:8097/internal/arologis/dispatches/<id>/cancellation-request" \
  -H "X-Internal-Token: <shared>" -H "Content-Type: application/json" -d '{}'
# Expected: HTTP 404

# Phase A 의 dispatches POST 정상 유지 확인
curl -sf "http://localhost:8097/actuator/health" | jq '.status'
# Expected: "UP"

# slip-service 측의 modification-request 호출 시 fallback
# Step 2 의 slip-service 회수 후이므로 slip-service 가 호출 자체를 하지 않음 → arologis 영향 X
```

### 3.5 복귀 조건

- feature toggle: 환경변수 `SAMHAN_AROLOGIS_MODIFICATION_RECEIVE_ENABLED=true`
- git revert: 다시 revert + redeploy

---

## 4. Step 4 — Flyway V24 — `dispatch_task.status` CHECK 11→4 + 4 column DROP (10 분)

### 4.1 목적

`dispatch_task` 의 status CHECK constraint 를 Phase C 의 11 값에서 Phase A 의 4 값으로 복원 + 4 신규 column DROP. **데이터 손실 발생** — 본 단계는 슬라이스 전체 회수 결정 후에만 실행.

### 4.2 사전 가드

- Step 1~3 이 production 에서 30 분 이상 안정 적용된 후 진행
- DB dump 백업 의무 (PG pg_dump)
- staging 환경 dry-run 1회 의무
- 6 신규 상태 + CANCELLED 의 row 들 → DISPATCHED 또는 FAILED 로 cleanup (Step 2 의 cleanup script)

### 4.3 down migration script (V24 신규 추가)

```sql
-- services/slip-service/src/main/resources/db/migration/V24__rollback_dispatch_task_status_phase_c.sql
-- (Flyway forward-only 정책에 따라 down 도 forward migration 으로 작성)

BEGIN;

-- 1. 6 신규 상태 + CANCELLED 의 row 들 cleanup (운영 결정에 따라 DISPATCHED 또는 archive)
-- 운영 결정: 모두 DISPATCHED 로 복귀 (CANCELLED 도 사용자 의도 재확인 후 manual 처리 권장)
UPDATE dispatch_task
SET status='DISPATCHED',
    modification_reason=NULL,
    rejection_reason=NULL,
    modification_requested_at=NULL,
    modification_decided_at=NULL
WHERE status IN ('MODIFICATION_REQUESTED','MODIFICATION_ACCEPTED','MODIFICATION_REJECTED',
                 'CANCEL_REQUESTED','CANCEL_ACCEPTED','CANCEL_REJECTED','CANCELLED');

-- 2. CHECK constraint 복원 (11 → 4)
ALTER TABLE dispatch_task DROP CONSTRAINT IF EXISTS dispatch_task_status_check;
ALTER TABLE dispatch_task ADD CONSTRAINT dispatch_task_status_check
  CHECK (status IN ('DRAFT','DISPATCHING','DISPATCHED','FAILED'));

-- 3. 4 신규 column DROP
ALTER TABLE dispatch_task DROP COLUMN IF EXISTS modification_reason;
ALTER TABLE dispatch_task DROP COLUMN IF EXISTS rejection_reason;
ALTER TABLE dispatch_task DROP COLUMN IF EXISTS modification_requested_at;
ALTER TABLE dispatch_task DROP COLUMN IF EXISTS modification_decided_at;

COMMIT;
```

### 4.4 dry-run

```bash
# 1. staging db 의 슬라이스 적용 상태 검증
PGPASSWORD=devpass psql -h staging-db -U devuser -d slip_service <<'SQL'
SELECT status, COUNT(*) FROM dispatch_task GROUP BY status ORDER BY status;
SQL
# Expected: 4 + Phase C 신규 7 status 의 분포 노출 — 6 신규 상태에 row 가 있다면 cleanup 필요

# 2. backup 의무
pg_dump -h staging-db -U devuser -d slip_service --table=dispatch_task --data-only \
  > /backup/dispatch_task-data-before-phase-c-rollback-step4-$(date +%Y%m%d).sql

# 3. V24 down migration dry-run (staging)
./gradlew :services:slip-service:flywayMigrate -PflywayUrl=jdbc:postgresql://staging-db:5432/slip_service \
  --info 2>&1 | tee /tmp/flyway-rollback-step4.log
# Expected: Migrating schema "public" to version "24 - rollback dispatch task status phase c"

# 4. archive 의무 (운영 회수 시) — CANCELLED row 데이터 보존
PGPASSWORD=devpass psql -h staging-db -U devuser -d slip_service <<'SQL'
CREATE TABLE IF NOT EXISTS dispatch_task_archive_phase_c_rollback AS
SELECT * FROM dispatch_task
WHERE status IN ('MODIFICATION_REQUESTED','MODIFICATION_ACCEPTED','MODIFICATION_REJECTED',
                 'CANCEL_REQUESTED','CANCEL_ACCEPTED','CANCEL_REJECTED','CANCELLED')
   OR modification_reason IS NOT NULL OR rejection_reason IS NOT NULL;
SQL
```

### 4.5 실 실행

```bash
# Production 적용 (staging 검증 + archive 완료 후)
./gradlew :services:slip-service:flywayMigrate -PflywayUrl=jdbc:postgresql://prod-db:5432/slip_service
# Expected: Migration 24 적용 완료
```

### 4.6 검증

```sql
-- 1. status CHECK 4 값 복원 확인
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='dispatch_task'::regclass AND conname='dispatch_task_status_check';
-- Expected: CHECK (status IN ('DRAFT','DISPATCHING','DISPATCHED','FAILED'))

-- 2. 4 신규 column 제거 확인
SELECT column_name FROM information_schema.columns
WHERE table_name='dispatch_task'
  AND column_name IN ('modification_reason','rejection_reason','modification_requested_at','modification_decided_at');
-- Expected: 0 rows

-- 3. 모든 row 의 status 가 4 값에 정합
SELECT status, COUNT(*) FROM dispatch_task GROUP BY status ORDER BY status;
-- Expected: 모두 DRAFT/DISPATCHING/DISPATCHED/FAILED 중 하나

-- 4. Flyway history
SELECT version, description, success FROM flyway_schema_history WHERE version='24';
-- Expected: 1 row, success=true

-- 5. archive table 데이터 보존 확인
SELECT COUNT(*) FROM dispatch_task_archive_phase_c_rollback;
-- Expected: dry-run 시 archive 한 row 수와 동일
```

### 4.7 복귀 조건 (Step 4 회수 = Step 4 re-do)

```sql
-- Step 4 회수 시 다시 V25 forward migration 으로 column 추가 + CHECK 복원 (forward-only)
ALTER TABLE dispatch_task DROP CONSTRAINT IF EXISTS dispatch_task_status_check;
ALTER TABLE dispatch_task ADD CONSTRAINT dispatch_task_status_check
  CHECK (status IN ('DRAFT','DISPATCHING','DISPATCHED','FAILED',
                    'MODIFICATION_REQUESTED','MODIFICATION_ACCEPTED','MODIFICATION_REJECTED',
                    'CANCEL_REQUESTED','CANCEL_ACCEPTED','CANCEL_REJECTED','CANCELLED'));
ALTER TABLE dispatch_task
  ADD COLUMN modification_reason       VARCHAR(500),
  ADD COLUMN rejection_reason          VARCHAR(500),
  ADD COLUMN modification_requested_at TIMESTAMP,
  ADD COLUMN modification_decided_at   TIMESTAMP;

-- archive 데이터 복원 (선택)
UPDATE dispatch_task dt
SET status = a.status,
    modification_reason = a.modification_reason,
    rejection_reason = a.rejection_reason,
    modification_requested_at = a.modification_requested_at,
    modification_decided_at = a.modification_decided_at
FROM dispatch_task_archive_phase_c_rollback a
WHERE dt.id = a.id;
```

---

## 5. 4 단계 전체 매트릭스

| Step | 영역 | 시간 | 데이터 영향 | git 또는 DB |
|---|---|---|---|---|
| 1 | FE 수정/취소 dialog + 편집 모드 indicator | 30분 | 무영향 | git revert 또는 feature toggle |
| 2 | slip-service BE 5 service + 6 endpoint + 2 client 메서드 | 30분 | 무영향 (DB 보존) | git revert 또는 toggle |
| 3 | arologis BE 2 receive endpoint + 4 회신 client + receive service | 20분 | 무영향 | git revert 또는 toggle |
| 4 | Flyway V24 — status CHECK 11→4 + 4 column DROP | 10분 | **column 삭제 + archive** | Flyway V24 (forward) |
| **합** | | **~90분** | | |

---

## 6. 롤백 후 통합 가드

### 6.1 회귀 재실행

```bash
# Phase A 의 ~98 case 다시 PASS 확인 (slip-service)
./gradlew :services:slip-service:test --info 2>&1 | tee /tmp/post-rollback-regression.log
# Expected: 0 failed, 0 error

# Phase A 의 IT 도 0 결함
./gradlew :services:slip-service:integrationTest --info 2>&1 | tee /tmp/post-rollback-it.log
# Expected: 0 failed
```

### 6.2 사용자 알림

- notification-service Aligo 알람: `Phase C 배차 수정/취소 회수 완료 (Step X/4)`
- TM PR comment 에 회수 완료 보고 (각 step 별 시각 + 검증 결과 첨부)

### 6.3 추후 재시도

본 슬라이스 재 적용 시 동일한 통합 PR pattern (5-team) + 6 시나리오 재검증 의무. 회수 사유의 root cause 가 spec 단계에 영향 있다면 spec 갱신 후 새 슬라이스 작성. 특히 D-DC-04 의 delete-recreate 정책이 race condition 으로 실패했다면 incremental 매핑 방식 검토.

### 6.4 Phase A 동반 회수 여부

Phase C 만 회수 후 Phase A (배차 메뉴 + arologis 발송) 는 유지 → 사용자는 배차 메뉴를 통해 배차 발송 (DRAFT → DISPATCHED) 가능, 단 수정/취소 요청만 불가능. 만약 Phase A 도 회수 필요하다면 `docs/qa/samhan-dispatch-board/rollback-dry-run.md` 의 Step 1~5 별도 실행.

---

## 7. 참조

- `feedback_integrated_pr_pattern` — 통합 PR 단위 회수
- `feedback_pm_integration_build_check` — 회수 후 풀빌드 가드
- `feedback_korean_path_jdk` — Windows 한글 path 가드 (회귀 재실행 시)
- spec § 7.5 — 4 단계 reversible 롤백 정의
- spec § 4.3 — Flyway V23 정의 (status CHECK + 4 column)
- Phase A rollback — `docs/qa/samhan-dispatch-board/rollback-dry-run.md`
