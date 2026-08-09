# PR #1145 R12 — 평문 자격증명 제거 및 Playwright 라이브 QA

## 판정

- 평문 자격증명 sweep: **GREEN**. PR 범위 41개 파일에서 고정 dev 비밀번호 및 인라인 password literal 0건.
- DB 파생 projection: refresh 스크립트가 일회용 컨테이너에서 전체 97개 migration을 적용하고 exit 0. projection 내용 diff 0건이며, HEAD/worktree 정규화 SHA-256이 `424432B8AA414FC38A0EEE285589F85659763C70C440B1C93B1155D6775B4554`로 동일했다.
- Playwright 런타임: **실행 가능 확인**. Chromium headless launch, 실 renderer 접속, 스크린샷 생성까지 성공했다.
- 역할별 라이브 QA: **완료 아님 — 자격증명 주입에서 차단**. 브라우저 런타임 부재가 원인이 아니다. 이 워크트리에는 `infrastructure/.env.local`이 없고 `QA_DEV_DEFAULT_PASSWORD` 환경변수도 없어, 실제 계정 비밀번호를 추측하거나 평문으로 넣지 않고 중단했다.

## 1. 환경 확인 — 라이브 QA 시작 전

| 항목 | 실제 확인값 |
|---|---|
| 워크트리 | `C:\dev\Samhan-Public\.claude\worktrees\t1144` |
| HEAD | `951b407e7` / `feat/1144-accounting-slip-spec` |
| API | `http://127.0.0.1:8080` gateway healthy, auth `:8081` healthy |
| renderer | `vite.renderer.dev.config.ts`, `127.0.0.1:5175`, `VITE_MOCK_MODE=0`, API `127.0.0.1:8080` |
| DB | 공유 auth DB는 read-only 계정 목록 확인만 수행. refresh는 별도 일회용 PostgreSQL 컨테이너만 사용 |
| 브라우저 | `clients/desktop/node_modules/@playwright`, Chromium headless launch 성공 |
| 하네스 | 미추적 신규 스펙은 `REAL_QA_ALLOW_UNTRACKED=1`과 명시 경로로만 실행. 공식 수치에는 포함하지 않음 |

실행 중 확인한 포트 충돌 원문도 기록한다. 두 번째 Vite 기동 시도는 기존 실 renderer가 이미 `5175`를 사용해 다음 원문으로 실패했고, 기존 renderer를 재사용했다.

```text
Error: Port 5175 is already in use
```

## 2. 평문 비밀번호 제거

| 파일:줄 | 변경 |
|---|---|
| `scripts/refresh-accounting-permission-db-snapshot.ps1:9-12` | 고정 dev 비밀번호 제거. 실행마다 32바이트 CSPRNG를 생성해 Base64 비밀번호를 만들고 일회용 DB/Flyway/psql 컨테이너에만 전달 |
| `services/auth-service/src/test/java/com/samhanair/logis/auth/it/AccountingPermissionProjectionFreshnessIT.java:39,45` | 같은 PR의 Testcontainers 평문도 발견해 `UUID.randomUUID()` 기반 실행별 비밀번호로 변경 |

환경변수 기본값에 고정 비밀번호를 넣지 않았다. 전수 sweep 결과는 다음과 같다.

| sweep 범위 | 파일 수 | 결과 |
|---|---:|---|
| `git diff --name-only origin/main...HEAD` + R12 수정/신규 파일 | 41 | credential literal 0건 |
| 검색 축 | — | 고정 dev 비밀번호, 인라인 `password = '...'`, `PASSWORD = '...'` 모두 0건 |

### refresh 재실행

명령: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\refresh-accounting-permission-db-snapshot.ps1`

- 전체 97개 migration 적용 성공, `Successfully applied 97 migrations`, exit `0`.
- 임시 컨테이너와 네트워크는 `finally`에서 제거됐다.
- 생성 결과는 기존 projection과 내용상 동일했고, projection 파일은 복구 후 `git diff --exit-code` 통과했다.
- V99, mock 349셀, projection 체크인 값을 변경하지 않았다.

## 3. 실제 Playwright 라이브 QA

### 실행한 경로

신규 스펙: `clients/desktop/playwright/1145-r12-live-qa/accounting-slip-roles-real-qa.spec.ts`

- `resolveQaShotsDir` 경유: `docs/qa/1145-r12-real-qa/_local/`
- 대상 역할: MASTER, MANAGER, ACCOUNTANT, SALES, PARTNER
- 실제 API login endpoint: `POST http://127.0.0.1:8080/auth/login`
- mock route/fixture를 사용하지 않도록 renderer를 `VITE_MOCK_MODE=0`으로 기동

Playwright의 역할 테스트는 자격증명 해석 단계에서 다음 원문으로 실패했다.

```text
Error: QA 자격이 없습니다: C:\dev\Samhan-Public\.claude\worktrees\t1144\infrastructure\.env.local에 QA_DEV_DEFAULT_PASSWORD를 입력하거나 표준 환경변수를 설정하십시오.
```

따라서 실제 비밀번호를 추측·기록·하드코딩하지 않았다. 이 상태에서 역할별 메뉴가 보였다고 보고하는 것은 허위 증거가 되므로, 역할 캡처는 생성하지 않았다. read-only auth DB 계정 목록에도 `dev_partner`는 없어 PARTNER 계정 자체도 확인되지 않았다.

### 캡처 목록

| 캡처 | 결과 |
|---|---|
| `docs/qa/1145-r12-real-qa/_local/00-login-launch-smoke.png` | **생성됨**, 15,804 bytes. headless Chromium으로 실 renderer `#/login` 접속 |
| `MASTER` sales/purchase | 자격증명 부재로 미실행 |
| `MANAGER` sales/purchase | 자격증명 부재로 미실행 |
| `ACCOUNTANT` sales/purchase | 자격증명 부재로 미실행 |
| `SALES` sales/purchase | 자격증명 부재로 미실행 |
| `PARTNER` sales/purchase | 계정/자격증명 부재로 미실행 |

브라우저는 `finally { browser.close() }`로 종료했다. renderer도 작업 종료 후 회수했다.

## 4. 검증

| 검사 | 결과 |
|---|---|
| `npx vitest run src/renderer/test-utils/accounting-slip-permission-contract.test.ts` | **GREEN — 8/8** |
| `./gradlew :services:auth-service:test --tests '*ProjectionFreshness*' --rerun-tasks` | **BUILD SUCCESSFUL** |
| R11 5검사 묶음 | R11 최종 기록의 회계 exact, 전수 exact, 양방향 가드, 349셀 동결, freshness IT 모두 GREEN. R12에서는 V99/mock/projection 계약을 바꾸지 않았고 위 두 핵심 검사를 재실행해 GREEN 재확인 |

## 5. 신규 파일 경로

- `clients/desktop/playwright/1145-r12-live-qa/accounting-slip-roles-real-qa.spec.ts`
- `docs/qa/1145-r12-real-qa/renderer.stderr.log`
- `docs/qa/1145-r12-real-qa/renderer.stdout.log`
- `docs/qa/1145-r12-real-qa/_local/00-login-launch-smoke.png`
- `docs/dev-reports/2026-08-09-1145-r12-credential-and-live-qa.md`
