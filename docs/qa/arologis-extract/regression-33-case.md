# 아로로지스 독립 분리 — 회귀 33 case 검증 절차

> **branch** — `feature/arologis-extract`
> **작성일** — 2026-05-14
> **작성** — QA Team
> **목적** — 자체 auth + UserClient 제거 후 기존 단위 20 + IT 13 = 33 case 가 0 결함 PASS 임을 명시 절차로 보장. 신규 IT 4 (B12~B14 산출, 추가 unit/IT 합 ~10 신규)을 누적 검증.
> **연관 산출물** —
> - `docs/superpowers/specs/2026-05-14-arologis-extract-design.md` §10.1, §10.2
> - `docs/superpowers/plans/2026-05-14-arologis-extract.md` BE Task B12~B15
> - `docs/qa/arologis-extract/scenarios.md` (수동 6 시나리오)
> - `docs/qa/arologis-extract/rollback-dry-run.md` (롤백)

---

## 1. 검증 범위 (spec §10.1 baseline)

| 영역 | spec baseline | 본 슬라이스 갱신 |
|---|---|---|
| 단위 | 20 case | `UserClient` 관련 case → 자체 `AdminUserService`/`DriverLoginService`/`RefreshTokenService` 단위 case 로 대체 |
| IT (기존) | 13 case | `@MockBean UserClient` 제거 + 자체 `JwtIssuer`/`AuthService` 흐름으로 갱신 (B15) |
| IT (신규) | + 4 case | `ArologisAdminAuthIT` / `ArologisDriverAuthIT` / `ArologisAuthSecurityIT` / `ArologisRefreshTokenIT` (B12~B14) |

**합** — 단위 20 + IT 13 + 신규 IT 4 = 37 case. 단, baseline 33 은 회귀 0 결함 의무, 신규 4 는 PASS 의무.

> **주석 (concern)**: spec 수치는 "기존 IT 13" 이라 명시하나 실제 worktree 의 `services/arologis-service/src/test/java/.../it/*.java` 는 8 file × 메서드 합 48 @Test. 단위는 98 @Test. spec 작성자 (TM) 의 "case" 정의가 file 단위인지 @Test 메서드 단위인지 불명확하므로 본 문서는 **두 가지 모두 기록** — TM 통합 PR 검토 시 정정 가능.

---

## 2. 기존 IT 13 case 명 (B15 갱신 대상)

spec §10.1 의 "IT 13 case" 는 본 worktree 기준 다음 8 file 의 핵심 IT @Test 메서드를 의미하는 것으로 추정 (file 8 × 평균 1.6 = 13). 실제 @Test 메서드는 file 별로 다수.

| # | File | @Test 메서드 수 | UserClient @MockBean 제거 대상 |
|---|---|---|---|
| 1 | `ApplicationContextLoadIT.java` | 1 | O (line 40) |
| 2 | `ArologisInternalControllerIT.java` | 4 | O (line 45) |
| 3 | `ArologisAdminControllerIT.java` | 12 | O (line 72) |
| 4 | `ArologisDriverAppControllerIT.java` | 6 | O (line 81) |
| 5 | `ArologisRealtimeIT.java` | 2 | O (line 75) |
| 6 | `DispatchAdminV1ControllerIT.java` | 10 | TBD (grep 결과 확인 필요) |
| 7 | `P15ValidationIT.java` | 9 | TBD |
| 8 | `SignatureIntegrationIT.java` | 4 | TBD |
| - | **합** | **48 @Test 메서드** (file 8개) | 5+ file 에서 `@MockBean UserClient` 명시 확인 |

### 2.1 IT 핵심 회귀 case (spec §10.1 의 "IT 13" 대응 추정)

| # | IT 클래스 | 메서드 | 검증 |
|---|---|---|---|
| 1 | `ApplicationContextLoadIT` | `contextLoads` | Spring context 정상 로드 (UserClient 제거 후 회귀 0) |
| 2 | `ArologisInternalControllerIT` | `sync_without_token_returns_403` | shared internal token 인증 가드 |
| 3 | `ArologisInternalControllerIT` | `sync_with_invalid_token_returns_401` | invalid token 차단 |
| 4 | `ArologisInternalControllerIT` | `sync_with_valid_token_returns_200` | valid token 통과 |
| 5 | `ArologisInternalControllerIT` | `sync_with_empty_body_returns_200_when_authorized` | empty payload 허용 |
| 6 | `ArologisAdminControllerIT` | `parseKakao_returns_200` | 카카오 메시지 파서 정상 |
| 7 | `ArologisAdminControllerIT` | `create_dispatch_returns_200_with_id` | 배차 등록 |
| 8 | `ArologisAdminControllerIT` | `auto_match_returns_200` | 자동매칭 (시나리오 1 회귀 가드) |
| 9 | `ArologisAdminControllerIT` | `list_drivers_returns_200` | 기사 목록 |
| 10 | `ArologisDriverAppControllerIT` | (today/list/signature 등) | driver-app 엔드포인트 |
| 11 | `ArologisRealtimeIT` | (sse/websocket subscribe) | 실시간 채널 |
| 12 | `P15ValidationIT` | (P15 도메인 검증) | 도메인 invariant |
| 13 | `SignatureIntegrationIT` | (signature lifecycle) | 전자서명 생명주기 |

신규 IT 4 (B12~B14):

| # | IT 클래스 | 검증 |
|---|---|---|
| B12 | `ArologisAdminAuthIT` | `/auth/admin/login` loginId+password → JWT → `/admin/arologis/**` 호출 가능 (2 case) |
| B13 | `ArologisDriverAuthIT` | `/auth/driver/login` phoneNumber → 등록 시 JWT, 미등록 401, 형식 오류 400 (3 case) |
| B14a | `ArologisAuthSecurityIT` | 만료 JWT / 잘못된 password / Soft Deleted Driver / 잘못된 role (4 case) |
| B14b | `ArologisRefreshTokenIT` | rotation 정상 / revoked / 만료 / 미존재 (4 case) |

---

## 3. 회귀 실행 절차

### 3.1 Step 1 — pre-flight (UserClient 잔존 검증)

```bash
# 본 슬라이스 BE Task B10 / B15 산출이 UserClient 잔존 0 임을 확인
grep -rn "UserClient" services/arologis-service/src/main/java/ services/arologis-service/src/test/java/ 2>/dev/null
# Expected: 0 줄 (B10 + B15 commit 후 기준)

# shared:user-client-abstraction 의존 제거 확인
grep -n "user-client-abstraction" services/arologis-service/build.gradle services/arologis-service/build.gradle.kts 2>/dev/null
# Expected: 0 줄
```

### 3.2 Step 2 — Docker 환경 가용 확인 (Testcontainers)

```bash
# Windows Docker Desktop npipe 제약 (feedback_testcontainers_windows_docker)
docker version --format '{{.Server.Version}}'
# Expected: 24.x.x 이상

# DOCKER_HOST 우회 (Windows 환경에서 IT skip 회피)
# PowerShell:
#   $env:DOCKER_HOST = "tcp://localhost:2375"
# bash/wsl:
#   export DOCKER_HOST=tcp://localhost:2375

# Docker engine 의 daemon.json 에 "hosts": ["tcp://0.0.0.0:2375", "npipe://"] 설정 필요
```

### 3.3 Step 3 — 단위 테스트 (20 case + 신규 ~10)

```bash
# 단위만 — Testcontainers 불필요
./gradlew :services:arologis-service:test \
  --tests "com.samhanair.logis.arologis.service.*" \
  --tests "com.samhanair.logis.arologis.matcher.*" \
  --tests "com.samhanair.logis.arologis.parser.*" \
  --tests "com.samhanair.logis.arologis.realtime.*" \
  --tests "com.samhanair.logis.arologis.client.*" \
  -i 2>&1 | tee build/qa-unit.log

# 단위 통과 수 추출
grep -E "tests completed|PASSED" build/qa-unit.log | tail -3
# Expected:
#   "98 tests completed" 등 (98 = 본 worktree 단위 @Test 합, spec baseline 20 보다 큼)
#   "BUILD SUCCESSFUL"
```

### 3.4 Step 4 — IT (기존 13 + 신규 4 = 17 case 표면, 실제 @Test 메서드 ~57)

```bash
# IT 만 — Testcontainers Postgres 16 컨테이너 자동 기동
./gradlew :services:arologis-service:test \
  --tests "com.samhanair.logis.arologis.it.*" \
  -i 2>&1 | tee build/qa-it.log

grep -E "tests completed|FAILED|BUILD" build/qa-it.log | tail -5
# Expected:
#   "57 tests completed, 0 failed, 0 skipped" (대략)
#   "BUILD SUCCESSFUL"
```

### 3.5 Step 5 — 전체 (단위 + IT 누적)

```bash
./gradlew :services:arologis-service:test -i 2>&1 | tee build/qa-all.log

# 누적 통과 수
grep -E "tests completed" build/qa-all.log
# Expected: 단위 + IT 합 (예: 155 tests completed, 0 failed)

# 빌드 결과
grep "BUILD" build/qa-all.log | tail -1
# Expected: "BUILD SUCCESSFUL in XXs"
```

---

## 4. before/after PASS count diff 비교

본 슬라이스 시작 전 baseline 측정 → 슬라이스 후 재측정 → 0 결함 diff.

### 4.1 Baseline 측정 (slice 시작 전 — `feature/arologis-extract` 분기 직전)

```bash
git checkout origin/main
./gradlew :services:arologis-service:test 2>&1 | tee build/baseline-main.log

# 추출
BASELINE_PASS=$(grep -oE "[0-9]+ tests completed" build/baseline-main.log | head -1 | grep -oE "[0-9]+")
BASELINE_FAIL=$(grep -oE "[0-9]+ failed" build/baseline-main.log | head -1 | grep -oE "[0-9]+")
echo "BASELINE: PASS=$BASELINE_PASS, FAIL=$BASELINE_FAIL"
# Expected (현재 main 기준 추정): PASS=146 (단위 98 + IT 48), FAIL=0
```

### 4.2 After 측정 (slice 완료 후 — `feature/arologis-extract` HEAD)

```bash
git checkout feature/arologis-extract
./gradlew :services:arologis-service:test 2>&1 | tee build/after-arologis-extract.log

AFTER_PASS=$(grep -oE "[0-9]+ tests completed" build/after-arologis-extract.log | head -1 | grep -oE "[0-9]+")
AFTER_FAIL=$(grep -oE "[0-9]+ failed" build/after-arologis-extract.log | head -1 | grep -oE "[0-9]+")
echo "AFTER:    PASS=$AFTER_PASS, FAIL=$AFTER_FAIL"
# Expected: PASS=156 (baseline 146 + 신규 ~10), FAIL=0
```

### 4.3 Diff 검증

```bash
# Diff 계산
PASS_DIFF=$((AFTER_PASS - BASELINE_PASS))
echo "PASS diff: $PASS_DIFF (신규 IT 4 + 갱신 단위 ~6 = ~10 신규 PASS 기대)"

# 회귀 0 결함 의무
if [ "$AFTER_FAIL" -eq 0 ] && [ "$AFTER_PASS" -ge "$BASELINE_PASS" ]; then
  echo "PASS — 회귀 0 결함, 신규 case 누적 통과"
else
  echo "FAIL — 회귀 또는 신규 case 결함 발생"
  exit 1
fi
```

### 4.4 결과 표기 (TM 통합 PR 본문 첨부 의무)

```markdown
| 영역 | Baseline (main) | After (feature/arologis-extract) | Diff |
|---|---|---|---|
| 단위 PASS | <BASELINE_UNIT> | <AFTER_UNIT> | <+신규> |
| IT PASS | <BASELINE_IT> | <AFTER_IT> | <+4 신규> |
| FAIL | 0 | 0 | 0 |
| BUILD | SUCCESSFUL | SUCCESSFUL | OK |
```

---

## 5. UserClient 제거 회귀 가드 (B10 + B15 교차 검증)

```bash
# 1. 소스에서 UserClient 미사용 (B10 산출)
test 0 -eq $(grep -rln "UserClient" services/arologis-service/src/main/java/ 2>/dev/null | wc -l) \
  && echo "OK — main 에 UserClient 0 회 참조" \
  || echo "FAIL — main 에 UserClient 잔존"

# 2. 테스트에서 @MockBean UserClient 미사용 (B15 산출)
test 0 -eq $(grep -rln "@MockBean.*UserClient\|UserClient.*@MockBean" services/arologis-service/src/test/java/ 2>/dev/null | wc -l) \
  && echo "OK — test 에 @MockBean UserClient 0 회 참조" \
  || echo "FAIL — test 에 @MockBean UserClient 잔존"

# 3. build.gradle 에서 shared:user-client-abstraction 의존 제거 (B10 산출)
test 0 -eq $(grep -ln "user-client-abstraction" services/arologis-service/build.gradle services/arologis-service/build.gradle.kts 2>/dev/null | wc -l) \
  && echo "OK — build.gradle 에 user-client-abstraction 0 회 참조" \
  || echo "FAIL — build.gradle 에 user-client-abstraction 잔존"
```

---

## 6. 신규 IT 4 별 PASS 의무 SQL/명령

### 6.1 ArologisAdminAuthIT (B12) — 2 case

```bash
./gradlew :services:arologis-service:test \
  --tests "com.samhanair.logis.arologis.it.ArologisAdminAuthIT" -i

# Expected:
#   admin_login_then_call_admin_endpoint PASSED
#   wrong_password_returns_401 PASSED
```

검증 SQL (`/auth/admin/login` 후 DB 상태):

```sql
SELECT login_id, role, last_login_at
FROM auth_user
WHERE login_id = 'itadmin';
-- Expected: role = 'AROLOGIS_MASTER', last_login_at NOT NULL
```

### 6.2 ArologisDriverAuthIT (B13) — 3 case

```bash
./gradlew :services:arologis-service:test \
  --tests "com.samhanair.logis.arologis.it.ArologisDriverAuthIT" -i

# Expected:
#   registered_phone_issues_driver_jwt PASSED
#   unregistered_phone_returns_401 PASSED
#   invalid_phone_format_returns_400 PASSED
```

검증 SQL:

```sql
SELECT driver_code, phone_number, last_login_at
FROM driver
WHERE driver_code = 'ITD001';
-- Expected: phone_number = '01011112222', last_login_at NOT NULL
```

### 6.3 ArologisAuthSecurityIT (B14a) — 4 case

```bash
./gradlew :services:arologis-service:test \
  --tests "com.samhanair.logis.arologis.it.ArologisAuthSecurityIT" -i

# Expected:
#   expired_jwt_returns_401 PASSED
#   wrong_password_returns_401 PASSED
#   soft_deleted_driver_login_returns_401 PASSED
#   wrong_role_endpoint_returns_403 PASSED
```

검증 SQL:

```sql
-- Soft Deleted Driver 로그인 차단 검증
SELECT driver_code, deleted_at
FROM driver
WHERE deleted_at IS NOT NULL
LIMIT 5;
-- Expected: 1행 이상 — 이 row 의 phoneNumber 로 login 시 401
```

### 6.4 ArologisRefreshTokenIT (B14b) — 4 case

```bash
./gradlew :services:arologis-service:test \
  --tests "com.samhanair.logis.arologis.it.ArologisRefreshTokenIT" -i

# Expected:
#   normal_rotation_issues_new_pair PASSED
#   revoked_token_reuse_returns_401 PASSED
#   expired_refresh_token_returns_401 PASSED
#   nonexistent_token_returns_401 PASSED
```

검증 SQL:

```sql
-- rotation 정상 시 기존 토큰 revoke + 신규 토큰 active
SELECT
  COUNT(*) FILTER (WHERE revoked_at IS NOT NULL) AS revoked,
  COUNT(*) FILTER (WHERE revoked_at IS NULL AND expires_at > NOW()) AS active
FROM auth_refresh_token;
-- Expected: revoked >= 1, active >= 1 (rotation 1회 후)
```

---

## 7. CI 실행 흐름 (DevOps DO1 의 arologis-ci.yml 일관)

```bash
# Local 재현 (Docker 가용 환경 — Linux 또는 Windows + DOCKER_HOST)
./gradlew :services:arologis-service:test :services:arologis-service:bootJar -i

# Expected:
#   Task :services:arologis-service:test PASSED
#   Task :services:arologis-service:bootJar SUCCESS
#   Build artifact: services/arologis-service/build/libs/arologis-service.jar
```

GitHub Actions (`arologis-ci.yml`) job 결과:

```bash
gh pr checks --watch  # PM 자동 모니터링 (feedback_pr_ci_monitoring)
```

Expected — 3 job (backend / desktop / mobile) 모두 green.

---

## 8. UNSTABLE / FAIL 시 액션 매트릭스

| 증상 | 추정 원인 | 액션 |
|---|---|---|
| `UserClient cannot be resolved` 컴파일 에러 | B10 의 import 제거 누락 | BE 팀 재dispatch — `grep -rn "UserClient" services/arologis-service/src/` 0 회 확인 후 재빌드 |
| `ArologisAdminAuthIT` 의 `admin_login_then_call_admin_endpoint` FAIL (401) | JwtIssuer 또는 AdminLoginService 누락 | B4 + B5 commit 회수 검토, AdminUser seed (V9) 확인 |
| `ArologisDriverAuthIT` 의 `unregistered_phone_returns_401` 이 500 반환 | DriverLoginService 의 NotFound 예외 처리 누락 | B6 회수 — `@ExceptionHandler(DriverNotFoundException)` 추가 |
| 기존 IT 13 중 `auto_match_returns_200` 회귀 FAIL | UserClient 제거 후 driver 조회 회귀 | B10 회수 — driver 조회를 자체 `DriverRepository.findByCode` 로 교체했는지 확인 |
| Testcontainers timeout | Windows Docker npipe 제약 | `DOCKER_HOST=tcp://localhost:2375` 설정 (`feedback_testcontainers_windows_docker`) |
| Flyway V7/V8/V9 migration FAIL | 이전 migration 과 hash 충돌 | DB 초기화 후 재실행 — `docker compose -f docker-compose.arologis.yml down -v` |

---

## 9. PASS 보고 형식 (TM 통합 PR comment)

```markdown
## QA — 회귀 33 case 검증 결과

| 항목 | Baseline (main) | After | Δ |
|---|---|---|---|
| 단위 PASS | NN | NN+ΔU | +ΔU |
| IT PASS | NN | NN+4+ΔI | +(4+ΔI) |
| FAIL | 0 | 0 | 0 |
| SKIPPED | N | N | 0 |
| BUILD | SUCCESSFUL | SUCCESSFUL | OK |

UserClient 제거 회귀 가드 — main 0 / test 0 / build.gradle 0 회 잔존
신규 IT 4 (B12 admin / B13 driver / B14a security / B14b refresh) 모두 PASS

artifacts:
- build/qa-all.log (전체 실행 로그)
- services/arologis-service/build/reports/tests/test/index.html (JUnit HTML 보고서)
```
