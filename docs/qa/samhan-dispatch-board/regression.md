# Samhan Public 배차 메뉴 (Phase A) — 회귀 ~98 case 검증 절차

> **branch** — `feat/samhan-dispatch-board-spec` 기반 QA 슬라이스
> **작성일** — 2026-05-14
> **작성** — QA Team
> **목적** — Phase A (배차 메뉴 + 아로로지스 발송) 슬라이스 머지 직전, 기존 slip-service ~98 단위 + 기존 IT 의 **0 결함 회귀** 보장 + 신규 IT ~31 / 단위 ~36 의 PASS 확인.
> **연관 산출물** —
> - `docs/superpowers/specs/2026-05-14-samhan-dispatch-board-design.md` § 7 (테스트 + 롤백)
> - `docs/superpowers/plans/2026-05-14-samhan-dispatch-board.md` BE Task B11~B14 (테스트), QA Task Q2
> - `docs/qa/samhan-dispatch-board/scenarios.md` (6 수동 시나리오)
> - `docs/qa/samhan-dispatch-board/rollback-dry-run.md` (롤백)

---

## 1. 검증 범위 (spec § 7.1~7.3 baseline)

| 영역 | spec baseline | 본 슬라이스 갱신 |
|---|---|---|
| slip-service 단위 | ~98 case | 0 결함 회귀 의무 — `dispatchStatus` 추가가 기존 slip lifecycle 에 영향 X |
| slip-service IT | (기존) | `@MockBean ArologisDispatchClient` 추가 — 0 결함 회귀 |
| slip-service 단위 (신규) | + ~24 case | DispatchTask / VehicleGroup / Service / Client 단위 (B11) |
| slip-service IT (신규) | + ~23 case | DispatchTaskRepositoryIT (~4) / DispatchBoardAdminControllerIT (~6) / DispatchTaskAdminControllerIT (~8) / DispatchTaskInternalControllerIT (~5) (B12) |
| arologis-service 단위 (신규) | + ~12 case | DispatchReceiveServiceTest (~5) / SlipDispatchTaskClientTest (~3) / 기타 (~4) (B11) |
| arologis-service IT (신규) | + ~8 case | ArologisDispatchReceiveIT (~5) + DispatchEndToEndIT (~3) (B13) |
| FE 컴포넌트 (신규) | + ~24 case | DispatchBoardPage / VehicleGroupCard / AddVehicleModal / SlipDetailModal / DispatchCompleteDialog / mobile DispatchBoardScreen (F1~F6) |
| **합 (신규 추가)** | **~91 case** | 단위 ~36 + IT ~31 + FE ~24 |

> **주석 (concern)**: spec § 7 의 "기존 ~98 단위 + 기존 IT 0 결함" 은 본 worktree 의 `services/slip-service/src/test/java/...` 의 @Test 메서드 총합으로 추정. 실제 수치는 회귀 실행 후 `gradlew test --info` 로 확정.

---

## 2. 회귀 실행 절차

### 2.1 Step 0 — pre-flight 가드

```bash
# 1. base 동기화 (agent_origin_main_sync 의무)
git fetch origin main
git log --oneline -3 origin/main
# Expected: 최신 main 의 HEAD 기록

# 2. 본 슬라이스 branch 위치 확인 (qa/samhan-dispatch-board-scenarios 또는 통합 PR feature branch)
git status
git log --oneline -3
```

### 2.2 Step 1 — slip-service 단위 회귀 (~98 case)

```bash
# Korean path 가드 — Windows + 한글 path JDK 17 트랩 회피
cd C:\dev\SamhanLogis\.claude\worktrees\agent-a029b7df327b42190

# 단위 회귀
./gradlew :services:slip-service:test --tests '*Test' \
  --info --console=plain 2>&1 | tee /tmp/slip-unit-regression.log

# 결과 파싱
grep -E "Tests run:|BUILD " /tmp/slip-unit-regression.log
# Expected: Tests run: ~98+24=122 (기존 + 신규), 0 failed, 0 error
```

### 2.3 Step 2 — slip-service IT 회귀 (Docker 가용)

```bash
# Docker Desktop 활성 가드
docker ps -q | head -1 || { echo "ERROR: Docker Desktop 미가용"; exit 1; }

# Testcontainers Windows npipe 우회 (feedback_testcontainers_windows_docker)
$env:DOCKER_HOST = "tcp://localhost:2375"  # 또는 Docker Desktop 의 "Expose daemon on tcp://" 옵션 활성

./gradlew :services:slip-service:integrationTest \
  --info --console=plain 2>&1 | tee /tmp/slip-it-regression.log

grep -E "Tests run:|BUILD " /tmp/slip-it-regression.log
# Expected: Tests run: 기존 + 신규 (~23 신규), 0 failed
```

### 2.4 Step 3 — arologis-service 회귀 (기존 + 신규)

```bash
./gradlew :services:arologis-service:test \
  --info --console=plain 2>&1 | tee /tmp/arologis-test.log

./gradlew :services:arologis-service:integrationTest \
  --info --console=plain 2>&1 | tee /tmp/arologis-it.log

grep -E "Tests run:|BUILD " /tmp/arologis-test.log /tmp/arologis-it.log
# Expected: 기존 + 신규 ~12 단위 + ~8 IT 추가, 0 failed
```

### 2.5 Step 4 — FE 컴포넌트 회귀 (~24 신규)

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
# Expected: desktop ~20 신규 + mobile ~4 신규, 0 failed
```

### 2.6 Step 5 — 전체 빌드 가드 (PM 통합 풀빌드, `feedback_pm_integration_build_check`)

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

### 3.1 slip-service 기존 단위 (~98 case, 0 결함 의무)

본 슬라이스는 기존 slip lifecycle (`DRAFT → PICKED → INSPECTED`) 에 **갱신 없음** — `dispatch_status` column 만 add (default `UNDISPATCHED`). 따라서 다음 기존 case 군은 본 슬라이스 영향 받지 않아야 함:

| 영역 | 추정 case 수 | 본 슬라이스 영향 가드 |
|---|---|---|
| Slip domain 단위 (create/pick/inspect/audit) | ~25 | `dispatch_status` 가 BaseEntity 7 + audit 7 에 미간섭 |
| Slip service (CRUD/조회/필터) | ~20 | 기존 query 에 `dispatch_status` 필터 추가가 default 시 NO-OP |
| Slip controller (admin/sales 페이지네이션) | ~15 | response DTO 에 `dispatchStatus` field 추가 — 기존 client 무관 |
| Slip audit (history/revert) | ~10 | `dispatch_status` 가 audit history 에 추가 기록 — column 추가만 의무 |
| Slip event listener (PartnerInbound 등) | ~10 | 이벤트 자체 변경 없음 |
| Slip ecount 통합 | ~10 | 본 슬라이스 무관 |
| 기타 (Vendor/PartnerInbound/Warehouse 연동) | ~8 | 영향 X |
| **합** | **~98** | |

### 3.2 slip-service 기존 IT (Docker 가용, 0 결함 의무)

| 영역 | 추정 case 수 | 본 슬라이스 영향 가드 |
|---|---|---|
| `SlipAdminControllerIT` | ~12 | response DTO 의 `dispatchStatus` field 추가 검증 |
| `SlipSalesControllerIT` | ~10 | dispatchStatus default 검증 |
| `SlipRepositoryIT` | ~8 | partial unique 변경 없음 |
| `SlipAuditIT` | ~6 | audit 7 field 변경 없음 |
| `SlipEventIT` | ~5 | 이벤트 payload 변경 없음 |
| 기타 (PartnerInbound 등) | ~10 | 영향 X |
| **합** | **~51** | (실제 수치는 회귀 실행 후 정정) |

### 3.3 신규 단위 (~36 case, PASS 의무)

| 클래스 | 신규 case | spec §7.1 |
|---|---|---|
| `DispatchTaskTest` | ~6 | create / addVehicleGroup / removeVehicleGroup / dispatch / confirm / fail |
| `DispatchVehicleGroupTest` | ~4 | addSlip / reorderSlips / removeSlip / partial unique |
| `DispatchTaskServiceTest` | ~6 | DRAFT lifecycle + DISPATCHING 전이 + 멱등성 |
| `DispatchConfirmServiceTest` | ~5 | confirm 흐름 + dispatchStatus 변경 + notification trigger |
| `DispatchUnavailableServiceTest` | ~4 | fail 흐름 + slip UNDISPATCHED 복귀 |
| `ArologisDispatchClientTest` | ~3 | WebClient mock + X-Internal-Token + timeout |
| `DispatchReceiveServiceTest` (arologis) | ~5 | receive + Vehicle 생성 + Mock matcher + 회신 |
| `SlipDispatchTaskClientTest` (arologis) | ~3 | confirm/unavailable WebClient mock |
| **합** | **~36** | |

### 3.4 신규 IT (~31 case, PASS 의무)

| 클래스 | 신규 case | spec §7.2 |
|---|---|---|
| `DispatchTaskRepositoryIT` | ~4 | partial unique 4건 |
| `DispatchBoardAdminControllerIT` | ~6 | GET 페이지네이션 + 필터 |
| `DispatchTaskAdminControllerIT` | ~8 | POST 생성 / 그룹 / slip 매핑 / dispatch |
| `DispatchTaskInternalControllerIT` | ~5 | POST confirm / unavailable + X-Internal-Token |
| `ArologisDispatchReceiveIT` (arologis) | ~5 | POST receive + Mock matcher + 회신 호출 |
| `DispatchEndToEndIT` | ~3 | Mock 매칭 e2e |
| **합** | **~31** | |

### 3.5 신규 FE 컴포넌트 (~24 case, PASS 의무)

| 컴포넌트 | case | spec §7.3 |
|---|---|---|
| `DispatchBoardPage` | ~5 | 페이지네이션 + 필터 + drag-source |
| `VehicleGroupCard` | ~5 | 빈/추가/순서/제거/삭제 |
| `AddVehicleModal` | ~3 | 9 종류 + 추가 |
| `SlipDetailModal` | ~3 | 상세 + 인수자 + 정차 |
| `DispatchCompleteDialog` | ~4 | 확인 + POST + spinner + refresh |
| mobile `DispatchBoardScreen` | ~4 | TouchSensor + long-press + tab |
| **합** | **~24** | |

---

## 4. 0 결함 회귀 의무 — 기존 case 명별 영향 가드

### 4.1 slip lifecycle 변경 없음 보증

```sql
-- 기존 slip 의 inspection_state / write_off 등 column 무영향 확인
\d+ slip
-- Expected: dispatch_status column 추가 1건, 기타 column 변경 없음

-- Trigger / partial unique 변경 없음
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'slip' ORDER BY indexname;
-- Expected: 기존 index + idx_slip_dispatch_status_active 1건만 추가
```

### 4.2 기존 slip API response DTO 변경 가드

```bash
# 기존 SlipResponseDto / SlipAdminDto 에 dispatchStatus 추가가 nullable=false default
grep -rn "dispatchStatus" services/slip-service/src/main/java/.../dto/ 2>/dev/null
# Expected: response DTO 에 추가, 기존 client (FE) typed Slip type 의 dispatchStatus optional 우선
```

### 4.3 기존 audit / event listener 가드

```bash
# audit listener 가 dispatch_status column 변경을 정상 기록
./gradlew :services:slip-service:test --tests 'SlipAuditTest' --info
# Expected: 기존 audit case PASS + dispatch_status field 추가 audit 1건
```

### 4.4 기존 IT MockBean 정합

```bash
# 기존 SlipAdminControllerIT 등이 ArologisDispatchClient @MockBean lenient setup 의무
# (feedback_it_mockbean_external_clients — 누락 시 Eureka 비활성 → 500)
grep -rn "ArologisDispatchClient" services/slip-service/src/test/java/.../it/ 2>/dev/null
# Expected: 모든 @SpringBootTest IT 에 @MockBean ArologisDispatchClient lenient setup
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
## 회귀 결과 — 2026-05-14 (commit: <SHA>)

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
- 기존 회귀: 0 결함 (PASS)
- 신규: ~91 case PASS
- 6 수동 시나리오: 6/6 PASS (스크린샷 docs/qa/samhan-dispatch-board/screenshots/01~06.png 참조)
```

---

## 7. fail 시 즉시 fix 우선순위

| 우선순위 | 영역 | 행동 |
|---|---|---|
| 1 | 기존 slip-service 회귀 1건이라도 FAIL | dispatch_status column 추가가 기존 query 에 NULL 또는 type cast 영향 → 즉시 root cause + 재 commit |
| 2 | 신규 IT FAIL | testcontainers DOCKER_HOST 가드 + @MockBean lenient setup 점검 |
| 3 | FE typecheck FAIL | `@dnd-kit/core` type 의존성 + Slip / DispatchTask 의 TypeScript interface 점검 |
| 4 | 신규 단위 FAIL | domain invariant 의 spec § 4 정합 점검 |
| 5 | 수동 시나리오 FAIL | 슬라이스 차단 — 통합 PR 머지 보류, BE/FE 추가 commit 의무 |

---

## 8. 참조

- `feedback_pm_integration_build_check` — PM 통합 풀빌드 가드
- `feedback_it_mockbean_external_clients` — IT 외부 client @MockBean 의무
- `feedback_testcontainers_windows_docker` — Windows Docker npipe 우회
- `feedback_korean_path_jdk` — 한글 path JDK 17 트랩 가드
- `feedback_agent_origin_main_sync` — base 동기화 의무
