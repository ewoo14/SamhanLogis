# #1101 S6 소비처 자격 연결 수정

## 결론

S5의 HIGH 결함 원인은 `infrastructure/.env.local`의 표준 키를 실행 프로세스로 전달하는 어댑터가 없었던 것이다. 공용 Node 로더와 PowerShell 로더를 추가하고, S1 이후 변경된 실행 파일 201개를 표준 계약으로 수렴했다. 실제 자격은 이 문서·로그·JSON에 기록하지 않았다.

우선순위는 프로세스의 표준 키(`QA_*_PASSWORD`, k6의 `LOADTEST_PASSWORD`) → `infrastructure/.env.local`의 같은 키 → 기존 alias 호환 입력이며, 모두 없으면 네트워크 요청 전에 경로와 누락 키를 포함해 중단한다.

## 소비처 전수 표

S1~S4 변경 실행 파일 중 `DEV_PASSWORD`를 사용하던 201개를 다음처럼 분류했다.

| 분류 | 파일 수 | 최종 계약 | 결과 |
|---|---:|---|---|
| Playwright QA | 181 | `resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')` 또는 역할별 표준 `QA_*_PASSWORD` | 공용 Node 로더 |
| Desktop QA/진단 스크립트 | 18 | 동일 Node 로더 | 공용 Node 로더 |
| `scripts/` 실행기 | 1 | `resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')` | `.env.local` fallback |
| `perf/k6/mixed-load.js` | 1 | `__ENV.LOADTEST_PASSWORD`만 사용 | `process.env` 제거, 실제 k6 미검증 |
| **합계** | **201** |  |  |

기존 `QA_PASSWORD`/`QA_MASTER_PW`/`QA_LOGIN_PW`를 직접 읽던 manual capture와 레거시 캡처 소비처도 같은 로더로 정리했다. `SAMHAN_DS4_QA_PASSWORD` worker 계약은 기존 이름을 보존했다.

## RED-A — 실행 경로가 실제 자격을 얻는가

```text
node clients/desktop/qa-formula-f1-categories.mjs
[qa] login HTTP status=200
page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/#/products/estimate-items?category=HOME_MULTI
```

인증 요청은 `.env.local`의 표준 키만으로 HTTP 200에 도달했다. 이후 renderer `:5173` 미기동으로 화면 단계가 차단됐으며, 로그인 200을 화면 성공으로 과장하지 않았다.

PowerShell 로더 fallback:

```text
PowerShell .env.local fallback: PASS (value redacted)
```

## RED-B — 파일 부재 안내

```text
✔ 표준 환경변수가 .env.local보다 우선한다
✔ .env.local만 있어도 표준 키로 자격을 얻는다
✔ 두 입력이 없으면 경로와 누락 키를 포함해 fail-fast한다
✔ DEV_PASSWORD는 표준 키를 위한 호환 입력으로만 허용한다
ℹ tests 4
ℹ pass 4
```

누락 시 비밀번호 값은 출력하지 않고 `infrastructure/.env.local` 경로와 필요한 표준 키 이름만 안내한다. PowerShell도 같은 계약을 사용한다.

## RED-C — 평문 부활 방지

```text
git grep -n -E '<three-forbidden-plaintext-patterns>' -- . ':(exclude).gitguardian.yaml'
git grep banned plaintext: 0 matches
```

```text
CREDENTIAL_GUARD_SCOPE=s2 bash scripts/check-credential-plaintext.sh
[PASS] S2 저장소 전체 개발 QA 평문 없음 (allowlist 정의 제외)
```

전체 범위 가드는 Windows Git Bash에서 120초 이상 출력 없이 정체되어 중단했고, 좁은 S2 가드와 직접 `git grep` 결과를 판정 근거로 삼았다.

## RED-D — CI 회귀

```text
./gradlew :services:arologis-service:test :services:auth-service:test
BUILD SUCCESSFUL in 1m 27s
22 actionable tasks: 1 executed, 21 up-to-date
```

```text
cd clients/desktop && npx tsc -p tsconfig.web.json --noEmit
exit 0
```

추가로 Node 로더 테스트 4/4, 변경 Node 실행 파일 `node --check` 35/35, PowerShell 로더·진입점 parse 4/4가 통과했다.

## k6 별도 기록

`perf/k6/mixed-load.js`에서 Node 전용 `process.env.DEV_PASSWORD`를 제거하고 `__ENV.LOADTEST_PASSWORD` 누락 시 setup 이전에 명시 오류를 내도록 했다. `scripts/run-load-test.ps1`가 파일에서 얻은 값을 `LOADTEST_PASSWORD`로 전달한다.

```text
k6: command not found (actual k6 execution unavailable)
```

따라서 k6 실제 실행과 `LOADTEST_PASSWORD` 유/무의 런타임 관측은 하지 못했다.

## 남은 차단

- 대표 Node QA는 로그인 200 뒤 local renderer `http://localhost:5173` 부재로 GUI 대시보드 캡처까지 완료하지 못했다.
- 대표 PowerShell smoke는 파일 fallback 뒤 서비스 일부 DOWN 및 JWT claims 부재로 전체 실패했다. 자격 누락 오류는 아니었다.
- Docker·서비스 재기동·재빌드는 수행하지 않았다.
- k6 미설치로 실제 k6 실행 증거는 남길 수 없다.

## 새로 만든 파일

- `scripts/lib/qa-credentials.cjs`
- `scripts/lib/qa-credentials.d.cts`
- `scripts/lib/qa-credentials.test.cjs`
- `scripts/lib/qa-credentials.ps1`
- `docs/superpowers/plans/2026-08-07-1101-s6-consumer-wiring.md`
- `docs/dev-reports/2026-08-07-1101-s6-consumer-wiring-fix.md`
