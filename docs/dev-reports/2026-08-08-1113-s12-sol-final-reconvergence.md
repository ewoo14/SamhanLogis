# #1113 S12 SOL 최종 재수렴 — 실제 사용자 경로 적대 검증

## 판정

**BLOCK.** 실제 운영자·개발자 경로에서 결함 8건을 재현했다.

- 새 literal/path guard가 정상 경로를 막은 수: **0개**
- 새 port resolver의 오판으로 정상 실행이 막힌 수: **2개** (`run-smoke-tests.ps1`, `seed-local-stack.ps1`)
- 종료코드가 화면 판정과 어긋난 실행 경로: **3개** (`start-local-full.ps1`, `launch-local-stack.ps1`, `seed-9-slice-fixtures.ps1`)

검증은 Windows PowerShell 5.1에서 CI와 같은 `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command ". '<script>' ..."` 형태로 수행했다. 종료코드는 각 자식 프로세스 직후의 `$LASTEXITCODE` 또는 `Start-Process(...).ExitCode`로 수집했고, 파이프 뒤 `$?`는 사용하지 않았다.

## 결함

### 1. BLOCKER — 운영검증 본체가 PowerShell 5.1에서 항목 4 진입 즉시 중단된다

실행:

```text
powershell.exe ... -Command ". '.\infrastructure\scripts\operational-validation.ps1' -ReportPath '<temp>\REPORT.md'"
EXIT=1
REPORT_EXISTS=False
```

원문 핵심:

```text
--- 항목 4: 4 CSV import ---
Cannot convert 'System.Object[]' to the type 'System.String' required by parameter 'ChildPath'.
```

원인은 `operational-validation.ps1:491-496`의 배열 안에서 `Join-Path` 호출 네 개를 쉼표로 나열한 구문이다. PS 5.1은 뒤 표현식들을 첫 `Join-Path`의 `ChildPath`용 `Object[]`로 바인딩한다. 동일 형태 최소 재현도 exit 1이었다. 따라서 운영자는 보고서를 생성할 수 없다.

### 2. BLOCKER — resolver가 실행 중 스택의 실제 host publish 포트 두 개를 틀리게 반환한다

t1096 복구 후 컨테이너 실측과 같은 PS 5.1 세션의 resolver 결과:

| 서비스 | resolver | 실제 Docker publish |
|---|---:|---:|
| slip-service | `8186` (`SAMHAN_SLIP_PORT`) | `18086 -> 8086` |
| partner-order-service | `8088` (resolver default) | `18088 -> 8088` |

`run-smoke-tests.ps1`의 `default + 100` probe도 각각 `8286`, `8188`만 보므로 `18086`, `18088`을 찾지 못한다. 그 결과 실제 컨테이너는 healthy인데 smoke는 `13/15 UP`, exit 1이었다. 올바른 QA 자격을 주입한 `seed-local-stack.ps1 -SkipReimport`도 14-service health 순회 중 잘못된 포트에서 exit 1이었다.

이 축이 정상 실행을 거짓으로 막은 경로는 **2개**다.

### 3. HIGH — `start-local-full.ps1`은 health가 두 개 DOWN이어도 완료·exit 0이다

스택을 건드리지 않는 기존-stack 경로를 실행했다.

```text
start-local-full.ps1 -SkipDocker -SkipServices -SkipPortCheck
slip-service          8186 DOWN
partner-order-service 8088 DOWN
EXIT=0
```

화면은 두 서비스를 `DOWN`으로 판정하면서 끝에서는 `완료`를 출력한다. `healthSummary`의 DOWN을 종료 판정에 포함하지 않으므로 **종료코드 = 판정** 불변식이 깨진다.

### 4. HIGH — `launch-local-stack.ps1`은 `docker compose up` 실패를 잃고 exit 0이 될 수 있다

`scripts/launch-local-stack.ps1:140`은 `docker compose ... up -d` 직후 `$LASTEXITCODE`를 저장·검사하지 않는다. 기존 스택이 이미 healthy인 조건에서 compose만 exit 17로 만든 격리 probe를 실행하자 이후 PostgreSQL/HTTP wait가 기존 스택을 보고 통과했고, URL 안내까지 출력한 뒤 프로세스가 exit 0이었다.

```text
docker compose: SIMULATED compose failure
LAUNCH_SIM_EXIT=0
```

이는 S11의 “예상된 자식 red가 부모로 새는” 것과 반대 방향의 동일 계열이다. 실패한 자식 종료코드가 뒤의 성공 probe에 덮여 성공으로 바뀐다.

### 5. HIGH — 9-slice 시드는 업무 seed가 전부 실패해도 “완료”·exit 0이다

실제 gateway에 기본 경로로 실행한 결과:

```text
backend health 200
WARN 39건
업무 seed 요청: HTTP 404
검증 count endpoint: 호출 실패
9 슬라이스 fixture seed 완료
EXIT=0
```

`seed-9-slice-fixtures.ps1`은 각 실패를 `Write-Warn`으로만 소비하고 실패 누적 또는 nonzero 종료가 없다. 아무 fixture도 준비되지 않았는데 운영자에게 완료를 단정한다.

### 6. HIGH — smoke가 실제 inventory 전체 잔액 경로에서 업무 404로 실패한다

실제 gateway·MASTER 로그인으로 실행한 smoke 원문:

```text
inventory-service /balances (전체)  gateway  404  BUSINESS_404
endpoint smoke — OK 7 / 8
EXIT=1
```

경로 404가 아니라 smoke 자체가 분류한 업무 404다. 현재 운영검증의 “전체 재고 현황은 productId 없이 조회” 경로가 실제 스택에서 되지 않는다.

### 7. MEDIUM — PS 5.1이 BOM 없는 두 사용자 스크립트의 한글을 손상시킨다

다음 두 파일은 비ASCII 문자열을 포함하지만 선두 바이트가 BOM이 아니다.

- `scripts/launch-local-stack.ps1` (`70 61 72...`)
- `scripts/run-load-test.ps1` (`70 61 72...`)

`run-load-test.ps1 -Profile smoke`는 기능상 38 iteration을 완료하고 exit 0이었지만, 단계명·안내가 `寃뚯씠?몄썾??health ?뺤씤` 같은 손상 문자열로 출력됐다. launch의 클라이언트·seed 안내도 같은 방식으로 깨졌다. 오류 발생 시 개발자가 읽어야 할 예외 안내 문자열도 동일하게 손상된다.

### 8. MEDIUM — port literal guard의 검사 기준점이 호출자 `-Root`로 완전히 교체된다

`check-local-stack-port-literals.ps1`은 스크립트 checkout을 고정 기준으로 확인하지 않고, `-Root`의 `git ls-files`만 검사한다. 빈 임시 git 저장소를 넘긴 실제 PS 5.1 실행은 다음처럼 현재 checkout을 전혀 검사하지 않고 통과했다.

```text
Local-stack port literal guard passed: all tracked .ps1 consumers use the resolver.
DECOY_ROOT_EXIT=0
```

즉 `-ProjectRoot`와 같은 기준점 교체 형태가 이 guard에도 남아 있다. 참고로 UTF-16 tracked `bad.ps1`에 `localhost:8080`을 넣은 별도 probe는 exit 1이어서, 이 결함은 인코딩 누락이 아니라 기준점 교체로 한정된다.

## 정상 실행과 증거 무결성

- literal guard: 실제 checkout에서 exit 0, 정상 경로 과차단 0.
- load test smoke: 38 complete / 0 interrupted, exit 0. 다만 결함 7의 출력 손상이 존재한다.
- `test-s7-axis-redefined.ps1`: `S7 axis regression tests passed`, exit 0.
- S11 보고서의 QA output path guard 원문: tests 47 / pass 47 / fail 0 / exit 0으로 재현됐다.
- `import-notion-csv.ps1`: 기본 `_notion-export` 입력 디렉터리가 이 worktree에 없어 exit 1. 입력 부재를 정확히 실패 처리했으므로 PR 결함으로 세지 않았다.
- `operational-validation.ps1` 보고서는 결함 1 때문에 생성되지 않았다.

따라서 기존 보고서가 실측 원문으로 제시한 S11의 두 출력은 재현됐다. 이 라운드에서 **증거 무결성 위반은 별도로 발견하지 않았다.**

## 실행 환경 회수 및 신규 파일

초기 `-?` probe가 `launch-local-stack.ps1` 본문에 진입해 동일 compose project 일부를 t1113 정의로 재생성했다. 즉시 해당 probe 프로세스 트리를 종료했고, t1096의 원래 compose 3종(`docker-compose.yml`, `docker-compose.local-all.yml`, `docker-compose.slip-port-override.yml`)을 다시 적용했다. 최종 상태에서 gateway·Eureka·14 service는 모두 healthy이고 slip/partner-order publish는 각각 `18086`/`18088`이다. 스택을 down하거나 volume을 삭제하지 않았다.

이 라운드가 workspace에 새로 만든 파일:

- `docs/dev-reports/2026-08-08-1113-s12-sol-final-reconvergence.md`
- `docs/qa/local-load-soak-test/raw/k6-image-20260808-022301.log`
- `docs/qa/local-load-soak-test/raw/k6-smoke-20260808-022301.log`
- `perf/k6/out/summary-smoke-20260808-022301.json` (gitignored)

커밋·push는 하지 않았다. DB 직접 명령은 기존 스크립트의 `SELECT count(*)`만 실행됐고, 직접 `INSERT/UPDATE/DELETE`는 실행하지 않았다. 보고서에는 비밀번호·JWT를 기록하지 않았다.

## 이 라운드가 보지 않은 것

- `stop-local-full.ps1` 실제 실행: t1096 스택을 중지하지 말라는 조건 때문에 정적 종료코드 흐름만 확인했다.
- Notion 실제 CSV import 성공 경로: 이 worktree에 기본 export 입력이 없었다.
- 7시간 soak, peak, stress 및 detach 부하테스트: smoke profile만 실행했다.
- AWS·운영 배포, 외부 vendor, 모바일·데스크톱 GUI 전체 회귀.
- 테스트 강도·커버리지·문서 표현 품질: 요청대로 게이트에서 제외했다.
