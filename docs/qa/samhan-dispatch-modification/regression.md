# Samhan Public 배차 수정/취소 (Phase C) — 회귀 ~75 case 검증 절차

> **branch** — `feat/samhan-dispatch-modification-spec` 기반 QA 슬라이스
> **작성일** — 2026-05-14
> **작성** — QA Team
> **목적** — Phase C 슬라이스 머지 직전 Phase A 의 단위 ~45 + 기존 IT 의 **0 결함 회귀** 보장 + 신규 단위 ~20 + IT ~10 의 PASS 확인.
> **연관 산출물** —
> - `docs/superpowers/specs/2026-05-14-samhan-dispatch-modification-design.md` § 7 (테스트 + 롤백)
> - `docs/superpowers/plans/2026-05-14-samhan-dispatch-modification.md` BE Task B1~B8 (테스트), QA Task Q1~Q2
> - `docs/qa/samhan-dispatch-modification/scenarios.md` (6 수동 시나리오)
> - `docs/qa/samhan-dispatch-modification/rollback-dry-run.md` (4 단계 롤백)
> - `docs/qa/samhan-dispatch-board/regression.md` (Phase A 회귀 base)

---

## 1. 검증 범위 (spec § 7.1~7.3 baseline)

| 영역 | spec baseline | 본 슬라이스 갱신 |
|---|---|---|
| slip-service 단위 (Phase A 기존) | ~98 case + Phase A 신규 ~36 | 0 결함 회귀 의무 — DispatchTaskStatus 6 추가가 기존 DRAFT/DISPATCHING/DISPATCHED/FAILED 흐름에 영향 X |
| slip-service IT (Phase A 기존 + 신규) | ~51 + ~23 case | 기존 IT 0 결함 회귀 — V23 migration 의 status CHECK constraint 갱신이 기존 4 값 정합 유지 |
| slip-service 단위 (Phase C 신규) | + ~16 case | DispatchTaskModificationRequestServiceTest (~5) / DispatchTaskCancellationRequestServiceTest (~5) / DispatchTaskModificationDecisionServiceTest (~3) / DispatchTaskCancellationDecisionServiceTest (~3) (B3/B4/B5) |
| slip-service IT (Phase C 신규) | + ~6 case | DispatchTaskAdminControllerIT (~2 Admin endpoint) / DispatchTaskInternalControllerIT (~4 Internal endpoint) (B6) |
| arologis-service 단위 (Phase C 신규) | + ~4 case | ModificationRequestReceiveServiceTest (~2) / SlipDispatchTaskClientTest (~2) (B7) |
| arologis-service IT (Phase C 신규) | + ~3 case | ArologisInternalControllerIT (~3 receive endpoint) (B7) |
| slip-service e2e IT (Phase C 신규) | + ~3 case | DispatchModificationEndToEndIT (B8) |
| FE 컴포넌트 (Phase C 신규) | + ~10 case | DispatchTaskDetailModal (~3) / ModificationRequestDialog (~2) / CancellationRequestDialog (~2) / 편집 모드 indicator (~2) / mobile sheet (~1) |
| **합 (신규 추가)** | **~42 case** | 단위 ~20 + IT ~10 + e2e ~3 + FE ~10 = ~43 — spec §7 의 "단위 ~20 + IT ~10" 기준 |

> **주석 (concern)**: spec § 7 의 신규 단위 ~20 / IT ~10 추정은 plan B3~B8 의 case 합산 기준. 실제 수치는 회귀 실행 후 `gradlew test --info` 로 확정.

---

## 2. 회귀 실행 절차

### 2.1 Step 0 — pre-flight 가드

```bash
# 1. base 동기화 (agent_origin_main_sync 의무)
git fetch origin
git log --oneline -3 origin/feat/samhan-dispatch-modification-spec
# Expected: 6468055 (Phase C plan) → f926c22 (Phase C spec) → 01d41f6 (PR #188 머지)

# 2. 본 슬라이스 branch 위치 확인
git status
git log --oneline -3
```

### 2.2 Step 1 — slip-service 단위 회귀 (~118 case = Phase A 기존 + Phase C 신규)

```bash
# Korean path 가드 — Windows + 한글 path JDK 17 트랩 회피 (feedback_korean_path_jdk)
cd C:\dev\SamhanLogis\.claude\worktrees\agent-a5b07c63463f5d86b

# 단위 회귀
./gradlew :services:slip-service:test --tests '*Test' \
  --info --console=plain 2>&1 | tee /tmp/slip-unit-regression.log

# 결과 파싱
grep -E "Tests run:|BUILD " /tmp/slip-unit-regression.log
# Expected: Tests run: 약 118 (기존 ~98 Phase A 합쳐 ~134 + 신규 ~16 Phase C), 0 failed
```

### 2.3 Step 2 — slip-service IT 회귀 (Docker 가용)

```bash
# Docker Desktop 활성 가드
docker ps -q | head -1 || { echo "ERROR: Docker Desktop 미가용"; exit 1; }

# Testcontainers Windows npipe 우회 (feedback_testcontainers_windows_docker)
export DOCKER_HOST="tcp://localhost:2375"  # 또는 Docker Desktop "Expose daemon on tcp://" 옵션 활성

./gradlew :services:slip-service:integrationTest \
  --info --console=plain 2>&1 | tee /tmp/slip-it-regression.log

grep -E "Tests run:|BUILD " /tmp/slip-it-regression.log
# Expected: Tests run: Phase A 기존 ~74 + 신규 ~9 (controller + e2e), 0 failed
```

### 2.4 Step 3 — arologis-service 회귀 (Phase A + 신규)

```bash
./gradlew :services:arologis-service:test \
  --info --console=plain 2>&1 | tee /tmp/arologis-test.log

./gradlew :services:arologis-service:integrationTest \
  --info --console=plain 2>&1 | tee /tmp/arologis-it.log

grep -E "Tests run:|BUILD " /tmp/arologis-test.log /tmp/arologis-it.log
# Expected: Phase A + 신규 ~7 (단위 ~4 + IT ~3) 추가, 0 failed
```

### 2.5 Step 4 — FE 컴포넌트 회귀 (~10 신규)

```bash
# desktop
cd clients/desktop
npm ci
npm run typecheck
npm run test -- --run 2>&1 | tee /tmp/fe-desktop-test.log

# mobile-staff
cd ../mobile-staff
npm ci
npm run typecheck
npm run test -- --run 2>&1 | tee /tmp/fe-mobile-test.log

cd ../..
grep -E "Tests:|Test Suites:" /tmp/fe-desktop-test.log /tmp/fe-mobile-test.log
# Expected: desktop ~9 신규 + mobile ~1 신규, 0 failed
```

### 2.6 Step 5 — 전체 빌드 가드 (PM 통합 풀빌드, feedback_pm_integration_build_check)

```bash
# BE assemble (한글 path 가드 — local 은 assemble, CI 는 test 분리)
./gradlew :services:slip-service:assemble :services:arologis-service:assemble \
  --info --console=plain 2>&1 | tee /tmp/be-assemble.log

# FE build
cd clients/desktop && npm run build && cd ../..
cd clients/mobile-staff && npm run prebuild && cd ../..

grep -E "BUILD " /tmp/be-assemble.log
# Expected: BUILD SUCCESSFUL
```

---

## 3. 영역별 회귀 case 분류

### 3.1 Phase A 기존 단위 (~98 + Phase A 신규 ~36, 0 결함 의무)

본 슬라이스는 기존 DRAFT → DISPATCHING → DISPATCHED → FAILED 흐름에 **갱신 없음** — DispatchTaskStatus 에 6 신규 값 + CANCELLED 추가만. 따라서 다음 case 군은 영향 받지 않아야 함:

| 영역 | 추정 case 수 | 본 슬라이스 영향 가드 |
|---|---|---|
| Slip domain 단위 (Phase A 기존) | ~98 | DispatchTaskStatus enum 추가가 Slip lifecycle 에 영향 X |
| DispatchTask Phase A 단위 (~6 case) | ~6 | 기존 `markDispatching()` / `markDispatched()` / `markFailed()` 로직 변경 X |
| DispatchVehicleGroup 단위 (Phase A) | ~4 | 변경 없음 |
| DispatchTaskService Phase A | ~6 | 변경 없음 |
| DispatchConfirmService (Phase A) | ~5 | 변경 없음 |
| DispatchUnavailableService (Phase A) | ~4 | 변경 없음 |
| ArologisDispatchClient (Phase A) | ~3 | 기존 dispatch endpoint 호출 영향 X |
| **합** | **~134** | (Phase A 기존 ~98 + Phase A 신규 ~36) |

### 3.2 Phase A 기존 IT (~74 case, 0 결함 의무)

| 영역 | 추정 case 수 | 본 슬라이스 영향 가드 |
|---|---|---|
| `SlipAdminControllerIT` (Phase A 기존) | ~12 | 변경 없음 |
| `SlipSalesControllerIT` (Phase A) | ~10 | 변경 없음 |
| `DispatchTaskRepositoryIT` (Phase A) | ~4 | V23 의 status CHECK 갱신 후 기존 4 값 정합 유지 |
| `DispatchBoardAdminControllerIT` (Phase A) | ~6 | 변경 없음 |
| `DispatchTaskAdminControllerIT` (Phase A) | ~8 | 변경 없음 |
| `DispatchTaskInternalControllerIT` (Phase A) | ~5 | confirm / unavailable endpoint 변경 없음 |
| `ArologisDispatchReceiveIT` (Phase A) | ~5 | 변경 없음 |
| `DispatchEndToEndIT` (Phase A) | ~3 | DRAFT→DISPATCHING→DISPATCHED→DISPATCHED 변경 없음 |
| `SlipAuditIT` (Phase A) | ~6 | dispatch_task audit 7 field 추가 column 무영향 |
| 기타 (Phase A 기존) | ~15 | 영향 X |
| **합** | **~74** | |

### 3.3 Phase C 신규 단위 (~20 case, PASS 의무)

| 클래스 | 신규 case | spec §7.1 |
|---|---|---|
| `DispatchTaskModificationRequestServiceTest` | ~5 | DISPATCHED→MODIFICATION_REQUESTED 정상 + 잘못된 status 거부 + arologis client 호출 mock + notification trigger + 사유 저장 |
| `DispatchTaskCancellationRequestServiceTest` | ~5 | DISPATCHED→CANCEL_REQUESTED 정상 + 잘못된 status 거부 + arologis client 호출 + notification + 사유 저장 |
| `DispatchTaskModificationDecisionServiceTest` | ~3 | accept → MODIFICATION_ACCEPTED + decided_at NOT NULL / reject → MODIFICATION_REJECTED + rejection_reason / notification 트리거 |
| `DispatchTaskCancellationDecisionServiceTest` | ~4 | accept → CANCELLED + slip UNDISPATCHED 복귀 + arologis Dispatch soft-delete cascade / reject → CANCEL_REJECTED |
| `ArologisDispatchClientTest` (확장) | ~3 | requestModification / requestCancellation 의 WebClient mock + X-Internal-Token + timeout |
| **합** | **~20** | |

### 3.4 Phase C 신규 IT (~10 case, PASS 의무)

| 클래스 | 신규 case | spec §7.2 |
|---|---|---|
| `DispatchTaskAdminControllerIT` (확장) | ~2 | POST `/modification-request` + POST `/cancellation-request` 의 200/400/403 case |
| `DispatchTaskInternalControllerIT` (확장) | ~4 | POST `/modification-accepted` + `/modification-rejected` + `/cancellation-accepted` + `/cancellation-rejected` 4 endpoint (X-Internal-Token 검증 포함) |
| `ArologisInternalControllerIT` (확장) | ~3 | POST `/modification-request` + `/cancellation-request` receive endpoint + Mock 자동 회신 비동기 |
| **합** | **~9** | (spec §7.2 의 "~10" 명목 일관, 실제 case 수 IT 구성 후 정정) |

### 3.5 Phase C 신규 e2e IT (~3 case, PASS 의무)

| 클래스 | 신규 case |
|---|---|
| `DispatchModificationEndToEndIT` | 3 (B8.1):<br>(1) dispatched → modification-request → 5초 후 자동 accept → MODIFICATION_ACCEPTED<br>(2) dispatched → cancellation-request → 5초 후 auto accept → CANCELLED + slip UNDISPATCHED 복귀<br>(3) modification-request → reject → DISPATCHED 유지 + rejectionReason 저장 |

### 3.6 Phase C 신규 FE 컴포넌트 (~10 case, PASS 의무)

| 컴포넌트 | case | spec §7.3 |
|---|---|---|
| `DispatchTaskDetailModal` | ~3 | DISPATCHED 시 버튼 노출 / 다른 status 시 숨김 / UUID 비공개 |
| `ModificationRequestDialog` | ~2 | textarea maxLength 500 / submit handler |
| `CancellationRequestDialog` | ~2 | textarea + submit |
| `DispatchBoardPage` 편집 모드 분기 | ~2 | MODIFICATION_ACCEPTED 시 drag-and-drop 활성 + [배차 완료] 재 노출 |
| mobile-staff `DispatchBoardScreen` BottomSheet | ~1 | sub-BottomSheet stack + 사유 input + 발송 |
| **합** | **~10** | |

---

## 4. 0 결함 회귀 의무 — Phase A 기존 case 명별 영향 가드

### 4.1 DispatchTaskStatus enum 확장 가드

```sql
-- Phase A status 4 값 의 case 들 모두 V23 의 status CHECK 11 값 안에 포함됨 확인
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='dispatch_task'::regclass AND contype='c' AND conname LIKE '%status%';
-- Expected: CHECK (status IN ('DRAFT','DISPATCHING','DISPATCHED','FAILED',
--   'MODIFICATION_REQUESTED','MODIFICATION_ACCEPTED','MODIFICATION_REJECTED',
--   'CANCEL_REQUESTED','CANCEL_ACCEPTED','CANCEL_REJECTED','CANCELLED'))

-- 기존 Phase A row 의 status 가 새 CHECK 정합
SELECT status, COUNT(*) FROM dispatch_task WHERE is_deleted=FALSE GROUP BY status;
-- Expected: 모든 row 가 11 값 중 하나
```

### 4.2 4 신규 column 기본값 가드

```sql
-- 4 column 모두 NULLABLE (기본값 NULL) — 기존 row 영향 X
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name='dispatch_task'
  AND column_name IN ('modification_reason','rejection_reason','modification_requested_at','modification_decided_at');
-- Expected: 4 rows, is_nullable='YES', column_default=NULL
```

### 4.3 기존 dispatch_task / dispatch_vehicle_group(_slip) entity 매핑 가드

```bash
# DispatchTask entity 의 4 신규 field 가 추가만 + 기존 7 audit 변경 없음
grep -rn "modificationReason\|rejectionReason\|modificationRequestedAt\|modificationDecidedAt" \
  services/slip-service/src/main/java/com/samhanair/logis/slip/domain/dispatch/DispatchTask.java
# Expected: 4 field 추가 1건씩

# 기존 markDispatching/markDispatched/markFailed 변경 없음
grep -rn "markDispatching\|markDispatched\|markFailed" \
  services/slip-service/src/main/java/com/samhanair/logis/slip/domain/dispatch/DispatchTask.java
# Expected: 메서드 시그니처 변경 없음, 본 슬라이스의 markModification* / markCancel* 메서드 7 개 추가만
```

### 4.4 기존 IT MockBean 정합

```bash
# Phase A 기존 SlipAdminControllerIT 등이 ArologisDispatchClient @MockBean lenient setup 유지
# (feedback_it_mockbean_external_clients)
grep -rn "ArologisDispatchClient" services/slip-service/src/test/java/.../it/ 2>/dev/null
# Expected: 모든 @SpringBootTest IT 에 @MockBean ArologisDispatchClient lenient setup +
#           본 슬라이스에서 requestModification / requestCancellation lenient stub 추가
```

### 4.5 ArologisDispatchClient 2 메서드 추가 가드

```bash
# 기존 sendDispatch() 메서드 변경 없음
grep -rn "void sendDispatch\|sendDispatch(" \
  services/slip-service/src/main/java/com/samhanair/logis/slip/client/ArologisDispatchClient.java
# Expected: 시그니처 동일

# requestModification / requestCancellation 2 메서드 추가
grep -rn "void requestModification\|void requestCancellation" \
  services/slip-service/src/main/java/com/samhanair/logis/slip/client/ArologisDispatchClient.java
# Expected: 2 메서드 추가
```

---

## 5. CI Green 의무 (spec § 7.6)

| 영역 | 명령 | 기대 |
|---|---|---|
| BE slip-service | `./gradlew :services:slip-service:test` | BUILD SUCCESSFUL, 0 failed |
| BE arologis-service | `./gradlew :services:arologis-service:test` | BUILD SUCCESSFUL, 0 failed |
| BE 통합 IT (Docker) | `./gradlew :services:slip-service:integrationTest :services:arologis-service:integrationTest` | BUILD SUCCESSFUL, 0 failed |
| FE desktop typecheck | `cd clients/desktop && npm run typecheck` | 0 error |
| FE desktop build | `cd clients/desktop && npm run build` | 0 error |
| FE desktop unit | `cd clients/desktop && npm run test -- --run` | 0 failed |
| FE mobile typecheck | `cd clients/mobile-staff && npm run typecheck` | 0 error |
| FE mobile prebuild | `cd clients/mobile-staff && npm run prebuild` | 0 error |
| FE mobile unit | `cd clients/mobile-staff && npm run test -- --run` | 0 failed |

---

## 6. 회귀 결과 보고 양식 (TM 통합 PR comment 첨부)

```markdown
## Phase C 회귀 결과 — 2026-05-14 (commit: <SHA>)

### slip-service
- 단위: PASS (X failed, Y skipped, Z total)
- IT: PASS (X failed, Y skipped, Z total)

### arologis-service
- 단위: PASS
- IT: PASS

### FE desktop
- typecheck: PASS
- build: PASS
- unit: PASS (X total)

### FE mobile-staff
- typecheck: PASS
- prebuild: PASS
- unit: PASS

### 합계
- Phase A 회귀: 0 결함 (PASS, ~134 단위 + ~74 IT)
- Phase C 신규: ~43 case PASS (단위 ~20 + IT ~10 + e2e ~3 + FE ~10)
- 6 수동 시나리오: 6/6 PASS (스크린샷 docs/qa/samhan-dispatch-modification/screenshots/01~06.png 참조)
```

---

## 7. fail 시 즉시 fix 우선순위

| 우선순위 | 영역 | 행동 |
|---|---|---|
| 1 | Phase A 회귀 1건이라도 FAIL | DispatchTaskStatus enum 확장이 기존 transition 의 IllegalStateException 가드 또는 Hibernate enum 매핑 영향 → 즉시 root cause + 재 commit |
| 2 | V23 migration FAIL | 기존 dispatch_task 의 row 데이터가 CHECK 11 값에 맞지 않거나 (불가능, default 4 값 안) , 또는 ALTER TABLE 의 lock contention 점검 |
| 3 | 신규 IT FAIL | testcontainers DOCKER_HOST 가드 + @MockBean lenient setup 점검 (`requestModification` / `requestCancellation` 의 stub 누락 시 NullPointer) |
| 4 | FE typecheck FAIL | DispatchTaskStatus 의 TypeScript union type 갱신 + 신규 6 상태에 대한 색상/한국어 매핑 |
| 5 | 신규 단위 FAIL | DispatchTask 의 markModificationRequested 등 7 transition method 의 invariant 점검 (spec § 4.2) |
| 6 | 수동 시나리오 FAIL | 슬라이스 차단 — 통합 PR 머지 보류, BE/FE 추가 commit 의무 |

---

## 8. 참조

- `feedback_pm_integration_build_check` — PM 통합 풀빌드 가드
- `feedback_it_mockbean_external_clients` — IT 외부 client @MockBean 의무
- `feedback_testcontainers_windows_docker` — Windows Docker npipe 우회
- `feedback_korean_path_jdk` — 한글 path JDK 17 트랩 가드
- `feedback_agent_origin_main_sync` — base 동기화 의무
- `feedback_uuid_no_user_visibility` — UUID 사용자 비공개 (모든 UI assertion)
- Phase A regression — `docs/qa/samhan-dispatch-board/regression.md`
