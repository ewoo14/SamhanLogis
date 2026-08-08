# PR #1119 / Issue #1113 — S28 머지 전 최종 재수렴

## 판정

**도달 결함 0건 — 머지 가능하다.**

검증 HEAD는 `f954588fdc4ca428151dae85f9bb68e8899652bd`다. S27의 바깥 `try/finally`가 기존 `exit 1`, terminating error, 내부 보호 구간의 제어 흐름을 바꾸지 않았고, `-RunSeed`의 product/inventory toggle 및 inventory validator fail-fast도 유지했다. S26의 process 환경 오염은 실제 같은 Windows PowerShell 5.1 runspace와 후속 표준 compose `config`에서 닫혔다.

## 1. S27이 연 제어 흐름 표면

### 실제 `exit 1`과 `finally`

코드 파일을 바꾸지 않고 Windows PowerShell 5.1 child runspace에서 `start-local-full.ps1:570`에 일회성 breakpoint를 걸었다. breakpoint action은 해당 script scope의 `$failedHealth`만 DOWN 1건으로 바꿨다. 따라서 실제 `start-local-full.ps1:581`의 `exit 1`을 실행했고, 호출자가 다음을 관측했다.

```text
BREAKPOINT_HIT=True
ACTUAL_EXIT_LASTEXITCODE=1
ENV_DEFINED_AFTER_ACTUAL_EXIT=False
ACTUAL_EXIT_PROBE_WRAPPER=0
```

즉 `finally`는 실행되어 진입 전 미정의 상태를 복원했고, `exit 1`은 0으로 덮이지 않고 호출자의 `$LASTEXITCODE=1`로 그대로 도달했다. 별도 최소 PowerShell 5.1 probe도 `try { exit 7 } finally { 복원 }`에서 `FINALLY_RESTORED=before`, process exit 7이었다.

### terminating error 전파

child PATH에서 Java만 보이지 않게 해 실제 pre-flight `throw`를 만들고, 스크립트 바깥에서 catch했다.

```text
ACTUAL_EXCEPTION_TYPE=System.Management.Automation.RuntimeException
ACTUAL_EXCEPTION_MESSAGE_MATCH=True
ENV_AFTER_EXCEPTION=sentinel-before-exception
ACTUAL_EXCEPTION_WRAPPER_EXIT=23
```

바깥 `try`에는 `catch`가 없으므로 `$ErrorActionPreference='Stop'`의 terminating error는 그대로 호출자까지 전파됐다. `finally`는 선행 `sentinel-before-exception`을 보존했고 예외를 삼키거나 다른 정상 반환으로 바꾸지 않았다.

### 중첩 보호 구간과 parser

- 바깥 쌍: `try` 77행 ↔ `finally` 588행.
- 기존 내부 쌍은 Docker info 122↔127, compose up 219↔225, MinIO 238↔243, max-connections 265↔267↔269, service health 438↔441, health summary 481↔484, row query 519↔538 및 그 내부 523↔526으로 모두 닫힌다.
- tracked `.ps1` 65개를 parser로 다시 읽어 parse failure 0건을 확인했다. 비ASCII BOM 누락도 0건이다.
- 외곽 `finally`는 내부 `$ErrorActionPreference` 복원 뒤 실행된다. 실제 terminating error probe에서도 호출자 catch가 도달했다.

## 2. `-RunSeed`와 비사용 경로

Windows PowerShell 5.1의 같은 runspace에서 실제 스크립트를 `-SkipDocker -SkipServices -SkipPortCheck`로 호출했다. 서비스 기동과 seed mutation은 없었고 기존 row-count SELECT 및 health 조회만 수행했다.

```text
CASE_NO_RUNSEED_AFTER=false
CASE_PRETRUE_RUNSEED_AFTER=true
CASE_UNSET_RUNSEED_DEFINED_AFTER=False
SAME_RUNSPACE_PROBE_EXIT=0
```

PM이 제시한 세 조합과 모순이 없다.

- 진입 전 미정의 + `-RunSeed`: 반환 후 미정의.
- 진입 전 `true` + `-RunSeed`: 반환 후 `true`.
- 진입 전 `false` + `-RunSeed` 없음: 반환 후 `false`.

따라서 `-RunSeed`가 없을 때도 호출자의 선행 상태를 바꾸지 않는다. 스크립트 실행 중 template의 `false`를 사용하는 기존 동작과 반환 후 호출자 상태 복원은 서로 분리돼 있다.

`-RunSeed` 자체의 도달성도 유지됐다.

- `start-local-full.ps1:316-319`가 service job 생성 전 process toggle을 `true`로 만든다.
- PowerShell 5.1 `Start-Job` 상속 probe: `JOB_INHERITED=true`, exit 0.
- product/inventory Spring property는 각각 `SAMHAN_SEED_TEST_DATA`를 `app.seed-test-data`로 연결한다.
- product seeder 2개와 inventory seeder 3개는 `app.seed-test-data=true` 조건을 유지한다.
- `StockBalanceSeeder.run()`은 첫 insert loop보다 앞에서 `ProductSeedIntegrityValidator.validate(...)`를 호출한다.

fresh `--rerun-tasks --no-daemon --no-build-cache` 결과는 다음과 같다.

| 계약 | tests | failures | errors | skipped |
|---|---:|---:|---:|---:|
| `ProductClientTest` | 7 | 0 | 0 | 0 |
| `ProductSeedIntegrityValidatorTest` | 1 | 0 | 0 | 0 |
| `HvacProductSeederTest` | 7 | 0 | 0 | 0 |

합계 15/15이며 두 Gradle 명령 모두 `BUILD SUCCESSFUL`, exit 0이다. 실제 seed는 실행하지 않았다.

## 3. 같은 셸의 후속 표준 compose 합성

진입 전 `SAMHAN_SEED_TEST_DATA`를 제거하고 실제 `-RunSeed` 호출이 정상 반환한 직후, 같은 Windows PowerShell 5.1 runspace에서 아래 표준 두 파일만 `config --format json`으로 합성했다.

- `infrastructure/docker-compose.yml`
- `infrastructure/docker-compose.local-all.yml`

전체 config는 자격 노출을 피하려 출력하지 않고 두 service의 toggle만 추출했다.

```text
CASE_UNSET_RUNSEED_DEFINED_AFTER=False
COMPOSE_PRODUCT=false
COMPOSE_INVENTORY=false
COMPOSE_EXIT=0
```

S26의 원래 결함인 “명시적 seed 실행 뒤 같은 셸의 표준 compose가 다시 seed 모드로 합성됨”은 재현되지 않았다.

## 4. S13~S23 회귀와 현재 PR gate

| 축 | fresh 결과 |
|---|---|
| S27 + S23 + seed 자격 Node 계약 | 15/15 pass, exit 0 |
| local-stack literal guard | pass, exit 0 |
| S7 Dockerless resolver/Measure-Object/guard | `S7 axis regression tests passed`, exit 0 |
| PS1 parser/BOM | tracked 65, parse failure 0, 비ASCII BOM 누락 0 |
| k6 syntax | `node --check perf/k6/mixed-load.js`, exit 0 |
| product/inventory seed 계약 | 15/15, failure/error/skip 0 |
| PR checks | `gh pr checks 1119` exit 0, 44줄, fail-like 0 |

S13~S23에서 고정한 resolver 우선순위, Dockerless compose fallback, `.Count`, guard 기준점, 공통 toggle 배선, 종료코드 전달, seed 자격 및 validator 계약에서 새 도달 단절은 없었다.

## 5. 증거 무결성

- 첫 제어 흐름 probe는 PowerShell 함수의 출력과 종료코드를 같은 변수에 수집해 비교가 실패했다. 원시 출력은 맞았지만 판정에서 폐기하고 독립 실행해 `finally`와 exit 7/23을 다시 확인했다.
- 첫 실제 same-runspace probe는 `-EncodedCommand` 뒤 인자를 전달해 PowerShell 사용법 오류로 본문 진입 전에 끝났다. 환경변수로 경로를 상속해 처음부터 재실행한 결과만 사용했다.
- 실제 581행을 공유 `auth-service` DOWN 상태로 밟으려 한 시도는 health 검사 중 서비스가 복구돼 정상 반환했다. PATH/포트 격리와 `Invoke-WebRequest` shadow 시도도 실제 581행에 도달하지 않아 모두 폐기했다. 최종 판정에는 breakpoint로 실제 `$failedHealth`만 바꿔 581행을 실행한 결과만 사용했다.
- `qa-operational-validation-contract.test.cjs`를 요구 범위보다 넓게 함께 돌렸을 때 19개 중 1개가 실패했다. Dockerless slip 기본 기대가 `8086`인데 현재 3-file effective compose 계약은 override `18086`이어서 생긴 기존 기대 불일치다. 같은 현재 계약을 직접 검증하는 S7 harness는 Dockerless 16개 비교를 통과했다. 이는 이번 seed/제어 흐름의 도달 결함으로 세지 않았다.
- S7의 첫 live Docker 비교는 실행 중 `samhan-auth-service`가 restart loop에 들어가 publish port가 사라져 중단됐다. read-only `docker ps/events`에서 `Restarting`, 최근 `start→die`, `docker port` exit 1을 확인했다. stack을 손대지 않고 Docker CLI를 PATH에서 격리한 fresh Dockerless 재실행으로 코드 계약을 확인했다.
- 첫 Gradle 검증을 같은 worktree에서 병렬 `--rerun-tasks`로 실행해 `shared:common` 산출 경합과 cache pack 오류를 만들었다. 해당 실행은 폐기하고 daemon 2개를 회수한 뒤 `--no-build-cache`로 순차 재실행한 15/15만 집계했다.

## 6. 변경·환경 회수

- 코드 수정, commit, push 없음.
- 신규 파일: 본 보고서 1개.
- 공유 Docker stack의 up/down/restart/recreate 없음. seed 실행 없음.
- DB 직접 쓰기 없음. 스크립트가 수행한 DB 접근은 기존 row-count SELECT뿐이다.
- 평문 자격 출력 없음. compose 전체 출력도 남기지 않았다.
- 최종 회수 결과 `gradlew.bat --stop` exit 0, Gradle daemon 0, 이 worktree 관련 Java/Gradle/Node/PowerShell process 0, PowerShell background job 0, k6 container 0이다.

## 이 라운드가 보지 않은 것

- 실제 `-RunSeed` product/inventory mutation과 현재 soft-delete 데이터의 운영 복구는 금지 조건에 따라 실행하지 않았다.
- 공유 stack 재기동·중지, stop script 실동작, compose `up`은 수행하지 않았다.
- S7 live 16-service 전수 publish 비교는 공유 `auth-service` restart 때문에 완주하지 못했다. 동일 코드의 Dockerless 16-service 합성 계약은 완주했다.
- `/api/v1/inventory/balances` 404와 끊긴 product 참조 100건의 정책·수정은 이번 판정 범위가 아니다.
- k6 실제 부하, DB mutation QA, GUI/E2E, AWS/Terraform, 외부 vendor는 수행하지 않았다.
