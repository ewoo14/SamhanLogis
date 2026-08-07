# #1101 S10 — 발견 기반 자격 가드 및 목록 밖 QA 실행물 수렴

## 결론

고정 `CREDENTIAL_CONSUMER_FILES`를 제거하고 `clients/desktop`, `docs/qa`, `scripts` 아래 실행 파일을 확장자 기준으로 재귀 발견하도록 바꿨다. 자격 신호가 있는 파일만 소비자로 분류하고, loader 자신과 계약 테스트만 제외한다. 현재 발견 전수는 227개이며 227/227개가 표준 loader를 경유한다.

## RED-A① — 미등록 새 파일 발견

원문 재현:

```text
임시 파일: docs/qa/s10-unregistered-credential-consumer.mjs
내용: process.env.DEV_PASSWORD를 읽고 login payload에 전달
기존 계약 테스트: 5/5 PASS, exit 0
```

파일을 `CREDENTIAL_CONSUMER_FILES`에 추가하지 않으면 계속 통과했다. 임시 파일을 삭제한 뒤 발견 기반 테스트를 추가했고, 같은 파일을 테스트 안에서 임시 생성하면 등록 없이 발견되는 것을 확인했다.

## RED-A② — S9 목록 밖 3개 실제 로그인

세 실행물의 기존 직접 참조를 표준 loader로 교체하고 같은 gateway 로그인 요청을 재실행했다.

| 실행물 | 계정 | 결과 |
|---|---|---|
| `docs/qa/919-sol-round/live-ui-qa.mjs` | `dev_master` | status=200, success=true |
| `docs/qa/coedit-s3-5-dispatch/capture-dispatch-coedit.spec.ts` | `kimmiseon` | status=200, success=true |
| `docs/qa/dev-menu-dev2/backend-qa.sh` | `dev_master` | status=200, success=true |

`live-ui-qa.mjs`의 다른 워크트리 절대 Playwright import도 로컬 상대 import로 바꿔 현재 워크트리에서 실행 가능하도록 했다.

## RED-B 및 동시 GREEN

| 불변식 | 확인 결과 |
|---|---|
| 자격 불필요 파일은 막지 않음 | loader/자격 신호가 없는 임시 실행 파일은 소비자에서 제외, 계약 PASS |
| CI에 `.env.local` 없음 | 환경변수 우선, 파일이 없으면 `QA_CREDENTIAL_MISSING` fail-fast |
| loader/test 예외 | loader는 alias를 보존하고 계약 테스트는 자기 파일을 검사 대상에서 제외 |
| 평문 자격 | 개발 QA 평문 리터럴 0, 새 평문·`.env.local`·GitGuardian `match:` 미추가 |
| 직접 참조 | 발견된 소비자 227개 중 직접 자격 env read 0개; 227/227 loader 경유 |

## 발견한 자격 키 이름과 축별 카운트

측정 범위는 `clients/desktop`, `docs/qa`, `scripts`의 실행 확장자 1,264개다. occurrence는 실행 코드에서 발견한 키 이름 토큰 수이며 loader alias·계약 fixture·호환 문자열도 포함한다.

| 키 이름 | occurrence |
|---|---:|
| `AROLOGIS_ADMIN_PASSWORD` | 1 |
| `DEV_PASSWORD` | 6 |
| `DEV_QA_PASSWORD` | 1 |
| `DEV_SEED_PASSWORD` | 1 |
| `LOADTEST_PASSWORD` | 4 |
| `QA_AROLOGIS_ADMIN_PASSWORD` | 3 |
| `QA_DEV_DEFAULT_PASSWORD` | 288 |
| `QA_MASTER_PASSWORD` | 23 |
| `QA_MASTER_PW` | 1 |
| `QA_PASSWORD` | 1 |
| `SAMHAN_DS4_QA_PASSWORD` | 1 |

축 집계:

- 실행 파일 스캔: **1,264개**
- 발견된 자격 소비자: **227개**
- 표준 Node/PowerShell loader 경유: **227/227개**
- 소비자 파일의 직접 `process.env`/`$env:`/shell 환경 자격 read: **0개**
- 개발 QA 평문 리터럴: **0개**
- 검사 대상 하드코딩 배열: **0개**

`QA_DEV_DEFAULT_PASSWORD` occurrence가 많은 것은 표준 키의 정상 loader 호출과 계약 자료 때문이다. 키 이름 발견은 고정 alias 배열이 아니라 실행 소스의 환경변수 접근 및 loader 신호를 수집한다.

## 가드가 전수를 덮는 방법

1. `fs.readdirSync(..., { withFileTypes: true })`로 세 QA 실행 루트를 재귀 순회한다.
2. `.cjs`, `.js`, `.mjs`, `.ts`, `.tsx`, `.ps1`, `.sh`, `.py`만 실행 후보로 읽고 `node_modules`는 건너뛴다.
3. `process.env`, `$env:`, shell `${...}`의 QA/DEV/LOADTEST/SAMHAN_DS4/AROLOGIS 계열 `*PASSWORD`·`*PW` 키 또는 표준 loader 호출이 있는 파일을 소비자로 발견한다.
4. 발견된 각 파일에 표준 `resolveQaCredential(...)` 또는 `Resolve-QaCredential`가 있는지 검사하고, 해당 파일의 직접 자격 env read를 금지한다.
5. loader 자신과 이 계약 테스트만 명시적으로 제외한다. 새 실행 파일은 등록 없이 자동 검사되고, 자격 신호가 없는 파일은 loader 요구를 받지 않는다.

## 필수 fix 3절

### 1. `scripts/lib/qa-credentials.test.cjs`

고정 8개 배열을 삭제하고 발견 함수·미등록 새 파일 회귀 테스트·자격 불필요 파일 제외 테스트를 추가했다.

### 2. S9 목록 밖 실행물 3개

- `live-ui-qa.mjs`: `QA_DEV_MASTER_PASSWORD` 직접 참조를 `resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')`로 교체.
- `capture-dispatch-coedit.spec.ts`: placeholder fallback과 `process.env.QA_MASTER_PASSWORD`를 `resolveQaCredential('QA_MASTER_PASSWORD')`로 교체.
- `backend-qa.sh`: 로그인 비밀번호를 Node 표준 loader에서 얻어 사용하도록 교체.

### 3. 실행 경로

`live-ui-qa.mjs`의 다른 worktree 절대 import를 현재 repo의 상대 import로 교체했다. 인증 요청 세 경로는 모두 HTTP 200이다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-07-1101-s10-discovery-based-guard.md`
- S10 회귀 테스트가 생성 후 삭제한 임시 파일: `docs/qa/s10-unregistered-credential-consumer.mjs` (최종 잔존하지 않음)

S9에서 이미 생성된 untracked QA 보고서와 캡처는 삭제하지 않고 그대로 보존했다.

## 검증 명령

```text
node --test scripts/lib/qa-credentials.test.cjs   6/6 PASS
node --check docs/qa/919-sol-round/live-ui-qa.mjs  exit 0
git diff --check                                  exit 0
실제 gateway login 3/3                          status=200
```

범위 밖인 PowerShell smoke JWT role claim과 SSE timeout은 조사·변경하지 않았다.
