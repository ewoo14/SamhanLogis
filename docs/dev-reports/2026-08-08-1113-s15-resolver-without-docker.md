# PR #1119 / Issue #1113 — S15 resolver without Docker

## 결론

S13의 실제 Docker publish 포트 계약은 유지하면서, Docker 데몬이 없거나 컨테이너 조회가 실패해도 resolver와 S7 회귀 테스트가 종료코드 0으로 판정하도록 수정했다.

출처 우선순위는 다음과 같다.

1. `SAMHAN_*_PORT` 명시적 override
2. Docker 컨테이너의 실제 publish 포트
3. `docker-compose.local-all.yml` 정적 기본값

Docker ②에서 ③으로 내려가면 `Write-Warning`으로 호출자에게 알린다. Docker 실행은 PowerShell native command를 직접 호출하지 않고 `System.Diagnostics.Process`로 감싸 2초 timeout, non-zero exit, daemon/container 부재를 모두 `$null`로 처리한다. 전역 `$ErrorActionPreference` 변경은 없다.

## RED-B 원문 재현

수정 전, Windows PowerShell 5.1 CI 형태로 없는 pipe를 지정했다.

```powershell
$env:DOCKER_HOST='npipe:////./pipe/samhan-nonexistent-docker-engine'; powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command ". 'tools/operational-validation/test-s7-axis-redefined.ps1'"
```

원문:

```text
docker : failed to connect to the docker API at npipe:////./pipe/samhan-nonexistent-docker-engine; check if the path is
correct and if the daemon is running: open //./pipe/samhan-nonexistent-docker-engine: The system cannot find the file
specified.
At C:\dev\Samhan-Public\.claude\worktrees\t1113\tools\operational-validation\test-s7-axis-redefined.ps1:53 char:26
+ ... dSlipPort = docker port samhan-slip-service ("$slipContainerPort/tcp" ...
+                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
... NativeCommandError ...
RED-B_EXIT=1
```

수정 후 동일 조건의 결과:

```text
WARNING: Docker publish port unavailable for 'slip-service'; using static default 8086.
... 16개 서비스 각각 fallback warning ...
Docker available: checking 16 resolver values against publish ports.
S7 axis regression tests passed.
RED-B_FIXED_EXIT=0
```

S7은 Dockerless 단계에서 16개 기본값, compose 선언값, fallback warning, literal guard를 모두 계속 검증한다. Docker가 없는 경우에만 실제 publish 16개 대조를 실행하지 않으며, 그 사실을 출력한다.

## RED-A 실측

공유 스택은 재기동하지 않았다. 현재 Docker에서 직접 확인한 값과 resolver 결과는 다음과 같다.

```text
docker port samhan-slip-service 8086/tcp
127.0.0.1:18086
resolver-slip=18086

docker port samhan-partner-order-service 8088/tcp
127.0.0.1:18088
resolver-partner-order=18088
RED-A_FIXED_EXIT=0
```

Docker가 있는 S7 실행은 16개 전수 publish 대조를 수행했고 `S7_DOCKER_EXIT=0`이었다. `slip-service=18086`, `partner-order-service=18088`을 포함해 전체 대조가 통과했다.

## resolver 호출부 전수 (`git ls-files -- '*.ps1'`)

| 파일 | resolver 호출 | resolver lookup 자체 | 스크립트 전체 Docker 없이 실행 |
|---|---:|---|---|
| `infrastructure/scripts/operational-validation.ps1` | 4 | 가능 | 검증 대상 외부 상태에 따라 다름 |
| `infrastructure/scripts/start-local-full.ps1` | 7 | 가능 | 불가; Docker compose/exec 기동 |
| `infrastructure/scripts/stop-local-full.ps1` | 1 | 가능 | `-KeepDocker` 없이 불가; compose down |
| `scripts/launch-local-stack.ps1` | 5 | 가능 | 불가; Docker daemon/compose 필요 |
| `scripts/lib/local-stack-port.ps1` | 2 | 가능 | 가능; resolver 본체 |
| `scripts/run-load-test.ps1` | 1 | 가능 | 불가; 실제 gateway 필요 |
| `scripts/seed-local-stack.ps1` | 4 | 가능 | 불가; 실제 서비스/API 필요 |
| `tools/operational-validation/import-notion-csv.ps1` | 5 | 가능 | 불가; 실제 서비스/API 필요 |
| `tools/operational-validation/run-smoke-tests.ps1` | 3 | 가능 | 불가; 실제 health/API 필요 |
| `tools/operational-validation/test-s7-axis-redefined.ps1` | 11 | 가능 | 가능; Dockerless 단정 포함 |
| `tools/test-data/seed-9-slice-fixtures.ps1` | 1 | 가능 | 불가; 실제 gateway/API 필요 |

위 11개 중 `start-local-full`, `stop-local-full`, `launch-local-stack`의 직접 Docker 호출은 stack 기동·종료·DB probe이며 `docker port` 포트 조회가 아니다. S7 회귀 테스트에는 직접 `docker port` 호출이 0건이다.

## 검증 결과

```text
S7_NO_DOCKER_EXIT=0
S7_DOCKER_EXIT=0
PORT_GUARD_EXIT=0
QA contract: 4 pass / 0 fail
```

QA contract 테스트의 제거된 `Resolve-LocalStackPort` 호출을 현재 `Get-LocalStackPort` 계약으로 갱신했고, Dockerless default/override를 실제 PowerShell subprocess로 검증했다.

## 변경 범위

- 수정: `scripts/lib/local-stack-port.ps1`
- 수정: `tools/operational-validation/test-s7-axis-redefined.ps1`
- 수정: `scripts/lib/qa-operational-validation-contract.test.cjs`
- 신규: `docs/dev-reports/2026-08-08-1113-s15-resolver-without-docker.md`
- 신규 생성하지 않음: 기존 untracked `docs/qa/local-load-soak-test/raw/k6-image-20260808-022301.log`, `k6-smoke-20260808-022301.log`

현재 `git diff --stat` 기준 삭제 줄 수는 **36줄**이다. 커밋·push는 하지 않았다.
