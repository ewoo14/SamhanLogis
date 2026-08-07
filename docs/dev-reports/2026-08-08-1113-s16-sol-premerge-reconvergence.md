# PR #1119 / Issue #1113 — S16 SOL 머지 전 재수렴

## 판정

**BLOCK · 도달 결함 8건.**

HEAD는 `6f69a182adc3dc2a2d4a98105b0b1d999e944c22`였고 PR #1119의 head와 일치했다. 검증은 Windows PowerShell 5.1에서 `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command ". '<script>'"` 형태로 실행했다. 공유 Docker stack은 재기동·재생성·중지하지 않았다.

실제 주 경로 4종은 전부 nonzero였다.

| 실제 경로 | 결과 | 판정 |
|---|---:|---|
| `start-local-full.ps1 -SkipDocker -SkipServices -SkipPortCheck` | exit 1 | resolver가 healthy slip을 `8186 DOWN`으로 오판 |
| `seed-local-stack.ps1 -SkipReimport` | exit 1 | 선재 QA seed 자격 400에서 중단 |
| `run-load-test.ps1 -Profile smoke` | 두 번 모두 exit 1 | k6 exit 99, `http_req_failed` 1.39% / 1.94% |
| `run-smoke-tests.ps1` | exit 1 | slip 거짓 DOWN + inventory 업무 404 |

`seed-9-slice-fixtures.ps1`도 업무 seed 38건 실패로 exit 1이었다. 이것은 실패를 성공으로 바꾸던 S12 결함이 아니라 현재 실패 판정과 종료코드가 일치하는 결과다.

정상 실행을 거짓으로 막은 **실행 경로는 2개**(`start-local-full`, `run-smoke-tests`)다. Docker 불능 조건에서도 같은 2개가 slip/partner-order의 잘못된 ③단 값으로 막힌다. `launch-local-stack`의 실 compose 실행은 공유 stack 보호 지시 때문에 하지 않았지만, 현재 호스트에서 정상 기동이 막히는 별도 정적·런타임 증거가 있다(결함 3).

## 기존 8건 재판정

| S12 # | 재판정 | 근거 |
|---:|---|---|
| 1 | **해소** | 운영검증 항목 4 포함 끝까지 실행, `PASS 19 / FAIL 0 / SKIP 11`, 보고서 생성, exit 0 |
| 2 | **재발** | S15의 환경변수 우선으로 `8186`이 live Docker `18086`을 가림. Dockerless ③단도 override compose와 2건 불일치 |
| 3 | **종료코드 해소** | health DOWN이면 완료 문구 없이 exit 1. 다만 resolver 오판 때문에 정상 실행 자체는 막힘 |
| 4 | **해소** | compose exit 17 격리 probe가 즉시 부모 exit 1 |
| 5 | **해소** | 업무 seed 38건 실패 시 완료 문구 없이 exit 1 |
| 6 | **미해소·선재 확인** | gateway와 inventory direct 모두 동일 업무 404 |
| 7 | **해소** | tracked PS1 65개 parse 0, 비ASCII·BOM 누락 0, 실제 소비자와 dot-source 통과 |
| 8 | **해소** | guard 자기 checkout 고정, decoy `-Root`가 검사 기준을 교체하지 않음 |

## 도달 결함

### 1. BLOCKER — S15의 ① 환경변수 우선이 S12의 정상 경로 오차단을 되살렸다

현재 프로세스 환경에는 `SAMHAN_SLIP_PORT=8186`이 있고, 실제 Docker publish는 `18086 -> 8086`이다. S13은 Docker publish를 먼저 읽어 이 충돌을 해소했지만 S15가 순서를 환경변수 → Docker로 뒤집었다.

실행 원문:

```text
start-local-full ...
slip-service  8186  DOWN
partner-order-service 18088 UP
START_LIVE_EXIT=1

run-smoke-tests.ps1
slip-service 8186 DOWN
SMOKE_ASIS_EXIT=1
```

같은 shell에서 `SAMHAN_SLIP_PORT`만 제거하면 resolver는 live publish `18086`을 반환했고 slip health는 UP이었다. 즉 서비스 장애가 아니라 출처 우선순위 회귀다. 정상 실행을 거짓 차단한 실제 경로는 **2개**다.

### 2. BLOCKER — Dockerless ③단은 실제 compose 합성이 아니라 base overlay 한 장만 검사한다

S7은 `infrastructure/docker-compose.local-all.yml`의 base 선언만 문자열 대조한다. 실제 공유 stack은 다음 3개 파일 합성으로 기동되어 있다.

```text
docker-compose.yml
docker-compose.local-all.yml
docker-compose.slip-port-override.yml
```

Docker daemon을 멈추지 않고 없는 pipe를 지정한 전수 결과:

| 서비스 | Dockerless fallback | 3-file compose publish | live publish |
|---|---:|---:|---:|
| slip-service | 8086 | 18086 | 18086 |
| partner-order-service | 8088 | 18088 | 18088 |

나머지 14개는 모두 일치했고 불일치는 정확히 **2/16**이었다. 이 조건의 smoke는 slip `8086 DOWN`, partner-order `8088 DOWN`, exit 1이었다.

S7 자체는 Dockerless 외부 실행에서도 exit 0이다. 이유는 fallback 검증 뒤 내부에서 `DOCKER_HOST`를 `$null`로 바꾸고 live Docker를 다시 사용하기 때문이다. 따라서 현재 회귀 테스트는 “Docker 없는 실제 소비자 + override compose” 조합을 닫지 않는다.

### 3. HIGH — `launch-local-stack.ps1`이 이 호스트에 필수인 override compose를 사용하지 않는다

`launch-local-stack.ps1:46-49`의 compose 목록은 base 2개뿐이며 `docker-compose.slip-port-override.yml`이 없다. 현재 read-only listener 실측은 다음과 같다.

```text
8086  influxd.exe
8088  influxd.exe
18086 com.docker.backend
18088 com.docker.backend
```

따라서 이 스크립트의 실제 `compose up`은 8086/8088 bind에서 막힌다. 공유 stack을 깨뜨릴 수 있어 실제 up은 실행하지 않았다. 합성 `docker compose config`와 live listener를 대조했으며, 3-file 합성만 18086/18088을 선언한다.

### 4. HIGH — load smoke가 허용되지 않은 partner-order draft 요청으로 확률적 hard red가 된다

`run-load-test.ps1 -Profile smoke`를 두 번 독립 실행했고 둘 다 k6 exit 99를 부모 exit 1로 정확히 전파했다.

| 실행 | iteration | `http_req_failed` | threshold |
|---|---:|---:|---|
| 1 | 37 | 4/287 = 1.39% | `rate < 1%` 실패 |
| 2 | 40 | 6/308 = 1.94% | `rate < 1%` 실패 |

20초 endpoint-tag 진단에서 실패는 `POST /api/v1/partner-orders/drafts`, HTTP 401로 수렴했다. `request()`가 401에 재로그인 후 같은 요청을 한 번 더 보내므로 권한이 바뀌지 않는 계정에서는 한 논리 실패가 HTTP 실패 2건으로 계수된다. write 비율이 확률적이라 S12의 한 번 green과 양립하며, 현재 smoke는 실제로 두 번 연속 차단됐다.

### 5. HIGH — inventory 전체 `/balances`는 선재이지만 실제 업무 404가 유지된다

표준 MASTER 자격으로 gateway와 direct service를 독립 호출했다.

```text
gateway /api/v1/inventory/balances?page=0&size=10  -> 404
direct  /inventory/balances?page=0&size=10         -> 404
code=NOT_FOUND
message=일부 제품을 찾을 수 없습니다 (요청 100, 응답 1)
```

경로 404가 아니다. `StockService.findBalancePage()`가 재고의 product UUID 100개를 product-service에 bulk 조회했지만 1개만 응답받아 업무 404를 낸다.

선재성도 독립 확인했다. 전체 조회 구현은 `9cafd6689`(2026-08-02), 후속 virtual warehouse 확장은 `7ba5f00f8`(2026-08-04)이며 PR #1119의 merge-base 이후 inventory 코드 변경은 없다. 선재라는 사실은 이 운영 경로가 현재 실패한다는 판정을 없애지 않는다.

### 6. HIGH — `stop-local-stack.ps1`은 compose down 실패 후 “stopped”·exit 0이다

실제 Docker를 호출하지 않는 격리 함수로 compose down exit 19를 주입했다.

```text
[stop] docker compose down
SIMULATED_DOCKER_DOWN_FAILURE
[stop] local stack stopped
STOP_LOCAL_STACK_SIM_EXIT=0
```

native 종료코드를 저장·검사하지 않고 다음 `Write-Host`가 부모 성공을 만든다.

### 7. HIGH — `stop-local-full.ps1`도 compose down 실패 후 “종료 완료”·exit 0이다

실제 서비스와 겹치지 않는 20000대 포트를 환경변수로 주입하고 Docker 함수를 격리해 exit 21을 반환시켰다. 공유 서비스는 건드리지 않았다.

```text
[2/2] 인프라 stack 종료 (docker compose down)
SIMULATED_DOCKER_DOWN_FAILURE
종료 완료
STOP_LOCAL_FULL_SIM_EXIT=0
```

S13 전수표가 이 파일을 “판정 없음”으로 분류했지만 실제로는 `종료 완료`라는 사람 판정이 있다.

### 8. HIGH — `launch-local-stack.ps1`은 Gradle build 실패를 후속 compose 성공으로 덮을 수 있다

`launch-local-stack.ps1:118-135`의 `gradlew.bat ... bootJar` 직후 `$LASTEXITCODE` 검사가 없고, 다음 명령은 compose up이다. PowerShell 5.1에서 native exit 23 뒤 출력 명령을 실행한 최소 재현은 `CONTINUED_AFTER_NATIVE_23`, 부모 exit 0이었다.

따라서 bootJar가 실패해도 기존 image로 compose up이 성공하면 스크립트는 readiness와 URL 안내까지 진행할 수 있다. S13은 compose 실패만 보존했고 build 자식 종료코드는 남겼다.

## BOM 20개와 dot-source/파이프 소비 검증

- S14 commit 전후 archive를 byte 대조해 UTF-8 BOM 추가 파일이 정확히 **20개**임을 확인했다.
- tracked `.ps1` **65개**, PowerShell 5.1 parser error **0개**.
- 비ASCII 문자열이 있는데 UTF-8/UTF-16 BOM이 없는 파일 **0개**.
- `qa-credentials.ps1`과 `smoke-test-helpers.ps1` 실제 dot-source 성공, 함수 호출 성공.
- `validate-config-audit.ps1`: 165 checks, exit 0.
- port literal guard: exit 0.
- `launch-local-stack`, `run-load-test`, `test-s7-axis-redefined`, 운영검증 본체를 실제 PS 5.1로 실행했고 BOM 때문에 발생한 구문·dot-source·파이프 손상은 없었다.
- Node 계약/자격/QA path 통합 실행은 57개 중 56 pass, cross-drive junction 1개가 임시 경로 소실로 fail했다. 해당 D-2만 fresh 격리 재실행하면 2/2 pass였다. 재현되지 않아 도달 결함으로 세지 않았지만 증거 무결성 관찰로 남긴다.

## 가드 기준점 재수렴

tracked PowerShell의 checkout/root/base 인자를 다시 검색했다. 검사 기준을 호출자 인자로 교체할 수 있는 잔여는 발견하지 않았다.

- port literal guard는 `$PSScriptRoot\..` 자기 checkout을 사용한다.
- decoy git root를 `-Root`로 넘겨도 현재 checkout 검사는 그대로 green이었다.
- operational validation의 `-ProjectRoot`는 검사 대상과 보고서 위치용이고, QA physical anchor는 자기 checkout 기준을 유지한다.
- `validate-config-audit`, start/stop/launch/import의 repository root는 모두 자기 스크립트 위치에서 유도한다.

## seed QA 400 선재성 독립 확인

`seed-local-stack.ps1`의 기본 실행은 현재도 exit 1이다. 원인은 port가 아니라 login request의 빈 password다.

```text
POST /api/auth/login
status=400
code=INVALID_INPUT
message=password: size must be between 8 and 100
```

`SEED_LOGIN_PW`가 없을 때 빈 문자열을 쓰는 코드는 `076d569a3`(2026-05-30)에서 들어왔다. PR #1119는 이 줄을 바꾸지 않았다. 따라서 **선재 상태**라는 S14 판단은 맞다. 평문 자격을 복원하지 않았고 보고서에는 `<redacted>`만 사용한다.

이는 current seed 명령이 막힌다는 실행 사실과 별개다. 이번 결함 8건에는 신규 PR 결함으로 중복 계수하지 않았다.

## 종료코드 재수렴 요약

| 경로 | 화면 판정 | exit | 일치 |
|---|---|---:|---:|
| operational validation | PASS 19 / FAIL 0 | 0 | Y |
| start-local-full, health DOWN | 실패 | 1 | Y |
| launch, compose exit 17 | 실패 | 1 | Y |
| seed-9-slice, WARN 38 | 실패 | 1 | Y |
| smoke, endpoint fail | 실패 | 1 | Y |
| load, k6 threshold fail | 실패 | 1 | Y |
| seed-local, auth 400 | 실패 | 1 | Y |
| stop-local-stack, compose down exit 19 | **stopped** | 0 | **N** |
| stop-local-full, compose down exit 21 | **종료 완료** | 0 | **N** |
| launch, Gradle build nonzero 후 compose 성공 | 성공 진행 가능 | 0 가능 | **N** |

종료코드와 사람 판정이 어긋나는 잔여 실행 경로는 **3개**다.

## 공유 환경·프로세스 회수

- Docker stack을 up/down/recreate/restart하지 않았다.
- 최종 read-only inspect: Eureka, gateway, 14 service 모두 running + healthy, **16/16**.
- 최종 slip/partner-order publish는 각각 `18086`/`18088`이다.
- 진단 k6 컨테이너는 `--rm`으로 종료됐고 잔여 k6 컨테이너는 0개다.
- DB 직접 `INSERT/UPDATE/DELETE`는 실행하지 않았다. inventory 진단은 API GET만 사용했다.
- 커밋·push·코드 수정은 하지 않았다.

## 신규 파일

이 라운드가 workspace에 새로 만든 파일:

- `docs/dev-reports/2026-08-08-1113-s16-sol-premerge-reconvergence.md`
- `docs/qa/local-load-soak-test/raw/k6-image-20260808-033759.log`
- `docs/qa/local-load-soak-test/raw/k6-smoke-20260808-033759.log`
- `docs/qa/local-load-soak-test/raw/k6-image-20260808-034532.log`
- `docs/qa/local-load-soak-test/raw/k6-smoke-20260808-034532.log`
- `perf/k6/out/summary-smoke-20260808-033759.json` (gitignored)
- `perf/k6/out/summary-smoke-20260808-034532.json` (gitignored)

S12가 만든 `022301` raw log 2개는 라운드 시작 전부터 untracked였으며 수정·삭제하지 않았다. 짧은 endpoint 진단 JSON은 판정 후 삭제해 최종 신규 파일이 아니다.

## 이 라운드가 보지 않은 것

- 공유 stack을 실제로 재기동하는 `launch-local-stack.ps1` / `start-local-full.ps1` full up: override 누락 시 기존 healthy 컨테이너를 깨뜨리므로 실행하지 않았다.
- 실제 stop/down: 공유 stack 중지 금지 때문에 격리된 native exit 주입으로만 검증했다.
- `SEED_LOGIN_PW`를 주입한 `seed-local-stack.ps1` 성공 경로와 reimport: 평문 자격을 새로 추출·재사용하지 않았다.
- Notion 실제 CSV import 성공 경로: 기본 export 입력이 없다.
- 7시간 soak, baseline, peak, stress.
- AWS 배포·Terraform·외부 vendor·모바일/데스크톱 GUI 전체 회귀.
- DB 데이터 정합의 전수 조사: inventory 404의 API 경계까지만 추적했고 DB에는 SELECT도 직접 실행하지 않았다.
- QA 테스트 강도·문서 표현 품질: 요청대로 판정에서 제외했다.

