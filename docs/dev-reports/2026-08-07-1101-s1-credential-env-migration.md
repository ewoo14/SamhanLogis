# S1 자격 `.env` 이전 — 이슈 #1101

## 결정 및 실제 파일

- 실제 자격 파일: `infrastructure/.env.local` (저장소 추적 밖)
- 추적 가능한 키 목록: `infrastructure/env-templates/qa-credentials.env` (값 없음)
- 키: `QA_DEV_DEFAULT_PASSWORD`, `QA_MASTER_PASSWORD`, 계정별 `QA_*_LOGIN_ID`/`QA_*_PASSWORD`
- 양 PC 절차: `docs/dev-environment-setup-multi-pc.md`에 복사·입력 절차를 추가했다.
- `git check-ignore` 확인: `.gitignore:61-63`의 `.env`, `.env.local`, `.env.*.local` 규칙으로 실제 파일이 무시된다.

## RED-C 실증 원문

`infrastructure/.env.local`을 구현자가 직접 파싱해 `QA_DEV_MANAGER_LOGIN_ID`와 `QA_DEV_MANAGER_PASSWORD`를 읽었다.

```text
status=200; token=<redacted>; token_present=True; source=C:\dev\Samhan-Public\.claude\worktrees\t1101\infrastructure\.env.local
```

호출: `POST http://127.0.0.1:8080/api/v1/auth/login` · 응답 `200` · 토큰 원문 미출력. Docker·서비스 재기동은 하지 않았다.

## RED-A / RED-B 측정

| 측정 | 결과 |
|---|---:|
| `origin/main` 기준 `git grep -c` 파일 수 | 78 |
| `origin/main` 기준 평문 발생 건수 | 144 |
| 수정 후 docs 평문 발생 건수 | 0 |
| 수정 후 docs 파일 수 | 0 |
| 계정명 표본 | 유지 |

브리핑의 73파일·132건과 달리, 작업 시점의 `origin/main`을 동일 명령으로 재측정한 값은 78파일·144건이었다. 세 패턴은 docs에서 각각 0건이다.

## RED-D 가드

`scripts/check-credential-plaintext.sh`에 `PATTERN_DEV_QA`를 추가하고, 문서 스캔 범위에 연결했다. 새 패턴은 문서 범위만 검사하도록 해 개발 시드 migration·기존 테스트의 의도된 개발 전용 표본을 오차단하지 않는다.

- 새 패턴 대상 docs 직접 스캔: 0건
- 추적 저장소 전체 스캔: 기존 seed/test 및 QA harness에 같은 문자열이 남아 있음. 이번 S1의 명시 범위인 docs 밖이므로 수정하지 않았다.
- 기존 전체 guard 실행: Windows Git Bash에서 기존 패턴들의 반복 recursive grep이 5분 제한 내 완료되지 않아 PASS/FAIL 원문을 확보하지 못했다.

## 새로 만든 파일

- `infrastructure/env-templates/qa-credentials.env`
- `docs/dev-reports/2026-08-07-1101-s1-credential-env-migration.md`

`infrastructure/.env.local`은 실제 자격 파일이지만 `.gitignore`에 의해 `git status --porcelain` 목록에 나타나지 않는 것이 정상이다.

## 남은 차단

기존 전체 guard의 반복 스캔 성능 문제는 별도 DevOps 작업으로 남긴다. S1 변경 자체는 docs RED-A 0건, 계정명 보존, `.env.local` 직접 로그인 200, 새 문서 패턴 0건까지 확인했다.

## 2026-08-07 범위 확장 — 운영 문서 7건

PM 재검증으로 확인된 `.claude/memory/` 6건과 `README.md` 1건의 비밀번호 값만 제거했다. 계정명과 각 문장의 규칙·가이드 의미는 유지하고, 모두 `infrastructure/.env.local` 또는 해당 키 참조로 바꿨다. `.gitguardian.yaml:22-34`는 변경하지 않았다.

확장 후 대상 범위(`docs/`, `.claude/memory/`, `README.md`)의 세 평문 패턴은 `git grep` 기준 0건이다.

### RED-D 좁은 가드 실측

기존 전체 가드의 느린 recursive scan을 피하기 위해 S1 전용 범위를 추가했다. 다음 명령을 실제 실행했다.

```text
CREDENTIAL_GUARD_SCOPE=s1 bash scripts/check-credential-plaintext.sh
============================================================
 SP-08-8 자격 평문 비공개 가드 — 검사 시작
============================================================
 [PASS] S1 docs/memory 개발 QA 평문 없음
```

검사 범위는 추적된 `docs/`와 `.claude/memory/`이며, 걸린 건수는 0건이다. 따라서 오차단 대상도 0건이고, 정상 문서를 차단하지 않았다. `README.md`는 별도로 `git grep` 0건을 확인했다.

## S2 — tools 실행 스크립트 및 저장소 전체 잔여 표면

### 처리 원칙

S1 이후 CI가 잡은 `tools/operational-validation/`의 4건을 포함해 저장소 전체를
세 개발 QA 비밀번호 패턴으로 재검사했다(실제 검색 명령은 작업 로그에서 실행했고,
이 보고서에는 값 자체를 재기록하지 않는다).
실제 값은 `infrastructure/.env.local`에서만 공급하고, 추적 파일에는 아래 환경변수
이름 또는 기존 QA 러너의 `DEV_PASSWORD` 참조만 남겼다. `.gitguardian.yaml:22-34`는
탐지 allowlist 정의이므로 변경하지 않았다.

| 잔여 표면(처리 전 파일:줄) | 건수 | 처리 방식 |
|---|---:|---|
| `tools/operational-validation/run-smoke-tests.ps1:31,55` | 2 | `QA_MASTER_PASSWORD` 환경변수 필수 입력으로 변경. `-Password` 직접 지정 경로도 유지. |
| `tools/operational-validation/import-notion-csv.ps1:30,61,249` | 3 | `QA_MASTER_PASSWORD` 환경변수 필수 입력으로 변경하고 안내 문구를 키 이름으로 치환. |
| `clients/**` (Playwright·desktop scripts·QA formula·renderer test) | 203개 파일 / 244건 | 기존 `DEV_PASSWORD` 환경변수 경로로 치환하고, 아로로지스 admin 로그인은 `QA_AROLOGIS_ADMIN_PASSWORD`를 사용. |
| `perf/k6/mixed-load.js` | 1건 | k6 런타임에 맞춰 `__ENV.LOADTEST_PASSWORD || __ENV.DEV_PASSWORD`로 변경. |
| `scripts/run-load-test.ps1` | 1건 | `QA_DEV_DEFAULT_PASSWORD` 필수 환경변수로 변경. |
| `scripts/verify-ds4-real-qa-cleanup.cjs` 및 `clients/desktop/scripts/ds4-real-qa-reap.cjs` | 2건 | 기존 `DEV_PASSWORD` 입력 경로 유지, 하드코드 fallback 제거. |
| `tools/manual-capture/capture.config.json` 및 캡처 러너 2개 | 2건 | JSON의 password를 `passwordEnv: QA_MASTER_PASSWORD`로 바꾸고 러너가 런타임에 읽도록 변경. |
| `services/*` seed/test/README | 10개 파일 / 25건 | OrgChartSeeder는 `QA_MASTER_PASSWORD`, 아로로지스 hash test는 `QA_AROLOGIS_ADMIN_PASSWORD`, auth IT는 `QA_DEV_DEFAULT_PASSWORD`; 문서·SQL 주석도 키 이름으로 치환. 단위 테스트의 비밀번호 전달 검증은 비자격 테스트 문자열로 변경. |
| `scripts/check-credential-plaintext.sh` | 1건 | 탐지 패턴을 hex 조합으로 구성해 가드 소스 자체에 평문을 저장하지 않도록 변경. |

전수 결과는 `.gitguardian.yaml`의 지정 줄만 남았고, 그 밖의 평문은 0건이다.

### RED 결과

| 불변식 | 결과 | 증거 |
|---|---|---|
| RED-A | PASS | `git grep` 결과가 `.gitguardian.yaml:22-35`만 출력. 해당 파일은 요청대로 미변경. |
| RED-B | PASS (정적) | PowerShell 3개 스크립트 구문 파싱 PASS; `-Password` 직접 지정 또는 `QA_MASTER_PASSWORD` 환경변수 경로가 존재. 수동 캡처도 `passwordEnv` 런타임 해석 경로를 확인. |
| RED-C | PASS (범위 축소) | `CREDENTIAL_GUARD_SCOPE=s2 bash scripts/check-credential-plaintext.sh`가 저장소 전체 DEV QA 패턴을 검사해 PASS. 정상 파일 오차단 0건. |

### 가드 실행 원문

요청한 전체 명령은 실제로 실행했으나 Windows Git Bash의 기존 전체 recursive scan이
334초 제한에 도달해 exit 124로 종료됐다. 성공했다고 보고하지 않는다.

```text
$ bash scripts/check-credential-plaintext.sh
command timed out after 334027 milliseconds
exit code: 124
```

전체 가드의 병목을 우회하지 않고 S2 불변식만 좁혀 실제 가드를 실행한 원문은 다음과 같다.

```text
$ CREDENTIAL_GUARD_SCOPE=s2 bash scripts/check-credential-plaintext.sh
============================================================
 SP-08-8 자격 평문 비공개 가드 — 검사 시작
============================================================
 [PASS] S2 저장소 전체 개발 QA 평문 없음 (allowlist 정의 제외)
```

추가 확인:

```text
run-smoke-tests.ps1 parse PASS
import-notion-csv.ps1 parse PASS
run-load-test.ps1 parse PASS
```

### 새로 만든 파일

없음. 기존 S1 보고서에 S2 절만 추가했다.

## S3 — S2가 깬 테스트 복구 (2026-08-07)

### 원인 분류

| 분류 | 판정 | 근거 및 조치 |
|---|---|---|
| 문서 | 안전 | S2는 문서·메모리의 평문을 환경변수 키/마스킹으로 바꿨고, 동작 경로가 없다. 유지했다. |
| 테스트 | 깨짐 | `BcryptHashGenTest`와 `AuthFlywayV48SeedIT`/`V49SeedIT`가 CI에 주입되지 않는 환경변수를 정적 초기화에서 요구했다. seed의 승인 해시는 계속 검증하고, 로그인 단언은 `test-fixture-password`와 테스트 DB 임시 해시로 분리했다. |
| 시더 | 의도 유지 | `OrgChartSeeder`는 `QA_MASTER_PASSWORD`를 읽고 없으면 fail-fast 한다. 운영 시드의 자격 주입 계약이므로 테스트 fixture로 바꾸지 않았다. |
| 설정/스크립트 | 의도 유지 | `infrastructure/env-templates/qa-credentials.env`는 키만 둔 상태이며, Desktop QA 스크립트는 `DEV_PASSWORD` 런타임 경로를 사용한다. 가드 자체와 `.gitguardian.yaml`은 변경하지 않았다. |

### 지우지 말았어야 할 것 판정

테스트 전체를 가드에서 제외하는 셋째 갈래는 채택하지 않았다. 이번 두 auth 테스트는 임의 입력 예시가 아니라 Flyway seed 해시·로그인·권한 계약을 검증한다. 테스트를 가드에서 제외하면 평문을 다시 허용하고 회귀를 숨기게 된다. 따라서 실제 개발 비밀번호는 복원하지 않고, 해시 불변식은 해시 자체로 검증하며, 로그인 경로는 실제 값과 다른 테스트 전용 fixture로 재현했다. `EmployeeProvisioningServiceTest`의 `test-provisioning-password`도 같은 이유로 정상적인 테스트 입력이다.

### S3 RED 결과

| 불변식 | 결과 | 실행 |
|---|---|---|
| RED-A | PASS | `./gradlew :services:arologis-service:test` 및 `./gradlew :shared:common:test :services:auth-service:test :services:api-gateway:test` 성공. `clients/desktop`의 `npm run typecheck`, lint, build, build:web, build:capacitor도 성공. |
| RED-B | PASS | 금지된 개발 QA 자격 문자열 3종을 `.gitguardian.yaml` 제외하고 검색한 결과 0건. 가드 allowlist 파일은 변경하지 않았다. |
| RED-C | PASS | `CREDENTIAL_GUARD_SCOPE=s1 bash scripts/check-credential-plaintext.sh`와 `CREDENTIAL_GUARD_SCOPE=s2 bash scripts/check-credential-plaintext.sh` 모두 PASS. 정상 파일 오차단은 없었다. 전체 recursive 가드는 기존 Windows Git Bash 병목으로 exit 124였고 성공으로 세지 않았다. |

### 실행 원문

```text
$ ./gradlew :services:arologis-service:test --no-daemon --console=plain
BUILD SUCCESSFUL in 1m 37s

$ ./gradlew :shared:common:test :services:auth-service:test :services:api-gateway:test --no-daemon --console=plain
BUILD SUCCESSFUL in 9s

$ Set-Location clients/desktop; npm run typecheck
✔ real-QA 추적 집합 ... tests 50, pass 50, fail 0
exit code 0

$ CREDENTIAL_GUARD_SCOPE=s1 bash scripts/check-credential-plaintext.sh
 [PASS] S1 docs/memory 개발 QA 평문 없음

$ CREDENTIAL_GUARD_SCOPE=s2 bash scripts/check-credential-plaintext.sh
 [PASS] S2 저장소 전체 개발 QA 평문 없음 (allowlist 정의 제외)

$ git grep -n -E '<금지된 개발 QA 자격 문자열 3종>' HEAD -- . ':!.gitguardian.yaml'
[PASS] forbidden credential grep: 0 matches
```

### 새로 만든 파일

없음. S3는 기존 S1 보고서에 절을 추가했고, 커밋하지 않았다.

## S4 — cleanup-worker 계약 테스트 회귀 복구 (2026-08-07)

### 원인 및 판정

S2가 `clients/desktop/src/renderer/test-utils/ds4-real-qa-cleanup-worker.contract.test.ts`의
worker 인자를 하드코드 값에서 `(process.env.DEV_PASSWORD ?? '')`로 바꿨다. CI에는
`DEV_PASSWORD`가 주입되지 않아 `--password-b64`가 빈 문자열이 되었고, worker는
owner PID를 확인하기 전에 필수 입력 검증에서 exit code 2로 종료했다. 그래서 owner가
죽어도 polling loop의 `isOwnerAlive()`와 cleanup 로그인 호출에 도달하지 않아 5초 후
`getLoginCalls() === 0`으로 실패했다. 이는 owner 식별값 변경이나 플래키가 아니라,
테스트 worker를 시작하지 못하게 만든 입력 계약 회귀다.

이 파일의 원래 하드코드 값은 실제 QA 자격이 아니라 fake HTTP 서버가 어떤 값이든
받아들이는 계약 테스트 fixture였다. 따라서 셋째 갈래를 채택한다: 실제 자격을 되살리지
않고, worker의 non-empty 입력 가드만 만족하는 `worker-contract-fixture`를 테스트 전용
sentinel로 사용한다. 운영 worker, owner 판정, `toBeGreaterThan(0)` 단언, timeout은
변경하지 않았다. 가드에서 테스트 파일을 제외하지도 않았다.

### RED 결과

| 불변식 | 결과 | 증거 |
|---|---|---|
| RED-A | PASS | 지정 계약 테스트 1파일, 2 tests passed; 생존 owner는 로그인 0회, 사망 owner는 cleanup 로그인 1회 이상. |
| RED-B | PASS | `toBeGreaterThan(0)`와 5초 polling timeout을 유지했다. 수정 전에는 동일 명령이 1 failed/1 passed, 5,027ms로 실패했다. |
| RED-C | PASS | 금지된 개발 QA 자격 문자열 3종 검색 결과 0건(`.gitguardian.yaml` 제외). allowlist는 미변경. |
| RED-D | PASS | `npx tsc -p tsconfig.web.json --noEmit` exit code 0; `git diff --check` exit code 0. |

### 실행 명령

```text
$ cd clients/desktop
$ npx vitest run src/renderer/test-utils/ds4-real-qa-cleanup-worker.contract.test.ts
Test Files 1 passed (1)
Tests 2 passed (2)

$ npx tsc -p tsconfig.web.json --noEmit
exit code 0
```

### 새로 만든 파일

없음. 기존 계약 테스트와 이 누적 개발 보고서만 수정했다.
