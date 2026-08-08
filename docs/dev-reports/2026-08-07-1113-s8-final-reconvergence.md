# PR #1119 / 이슈 #1113 — S8 머지 전 최종 재수렴

## 결론

- 기준 좌표는 `fix/1113-smoke-jwt-role-claim`, HEAD `a95e3facf2429b2f514416c5da54a26a60c59a0f`다.
- PR #1119의 exact HEAD CI는 fresh 조회에서 38/38 pass였다.
- S5가 만든 `@(Measure-Object).Count` 회귀는 UTF-16 파일을 포함한 repo `.ps1` 64개 전수에서 0건이다.
- 인코딩은 `operational-validation.ps1`가 `FF-FE`(UTF-16 LE BOM), `seed-local-stack.ps1`가 `EF-BB-BF`(UTF-8 BOM)다.
- PR 전체 변경/신규 `.ps1` 8개를 Windows PowerShell 5.1 `-File` 경로로 진입시켰고 ParserError는 0건이다.
- pipeline과 `Measure-Object`의 0/1/다건 계산 자체는 맞다. 다만 S7 회귀 테스트는 `Measure-Object` 0/1/다건을 실행하지 않고 소스 모양만 검사한다.
- RED-B는 health 15/15, smoke 7/8·exit 1, seed 14 health·5/5 login·exit 0, 권한 경계와 전체 identity 위조 차단까지 유지됐다.
- port 축 전수에서 직접 소비 경로 4곳이 남았다.
- **S8 범위 내 결함은 5건이다. 따라서 머지 조건인 0건이 아니다.**

```text
S4  3건
S6  4건 (S5 되돌림 전 판정)
S8  5건
```

## 1. S5 회귀 제거 여부

### UTF-16 포함 `@(Measure-Object)` 전수

`rg`만 사용하지 않았다. `Get-ChildItem -Recurse -Filter *.ps1`로 repo의 PowerShell 64개를 잡고, 각 파일의 선두 bytes로 encoding을 판별했다.

```text
FF FE       → [Text.Encoding]::Unicode
EF BB BF    → UTF-8 BOM
그 외       → UTF-8/no-BOM 또는 ASCII
```

각 encoding으로 전체 원문을 읽은 뒤 multiline 정규식 `(?is)@\s*\([^\)]*?Measure-Object`를 적용했다.

```text
PS1_TOTAL=64
ARRAY_MEASURE_HITS=0
```

특히 binary로 취급되는 `infrastructure/scripts/operational-validation.ps1`도 `[IO.File]::ReadAllText(..., [Text.Encoding]::Unicode)`로 읽었으며 두 위치는 다음 올바른 형태다.

```powershell
($pretendardFiles | Measure-Object).Count
($s3YmlFiles | Measure-Object).Count
```

### 인코딩 헤더

```text
infrastructure/scripts/operational-validation.ps1
  FF-FE-23-00-52-00-65-00  / 87,066 bytes

scripts/seed-local-stack.ps1
  EF-BB-BF-70-61-72-61-6D  / 8,667 bytes
```

요구한 `FF-FE`와 `EF-BB-BF`가 모두 보존됐다.

### Windows PowerShell 5.1 `-File` 진입

실행기는 `C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe`, 버전은 `5.1.26100.8972`였다. S7 6개뿐 아니라 PR 전체 8개를 검사했다.

```text
infrastructure/scripts/operational-validation.ps1
infrastructure/scripts/start-local-full.ps1
scripts/lib/local-stack-port.ps1
scripts/seed-local-stack.ps1
tools/operational-validation/import-notion-csv.ps1
tools/operational-validation/run-smoke-tests.ps1
tools/operational-validation/smoke-test-helpers.ps1
tools/operational-validation/test-s7-axis-redefined.ps1
```

각 파일을 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File <path> -?`로 진입시켜 전체 원문을 실제 Windows PowerShell이 decode/parse하도록 했고, `ParserError`, `Unexpected token`, missing closing/string terminator는 0건이었다.

`seed-local-stack.ps1`은 `-?`를 도움말 종료로 처리하지 않고 본문을 실행했다. 첫 probe는 자격을 주입하지 않아 accounting health 뒤 login HTTP 400으로 끝났으나 **parser 오류는 없었다**. 이 runtime 실패는 업무 판정에서 제외했다. 이후 실제 mapping과 자격을 주입해 같은 `-File ... -SkipReimport` 경로로 다시 실행했고 14 health·5 login·exit 0을 받았다.

## 2. 0/1/다건 집계 — 양쪽 형태

### pipeline 결과

S7 테스트의 실제 helper 주입 결과는 다음과 같다.

```text
입력 실패 0건 → 0
입력 실패 1건 → 1
입력 실패 2건(+ OK 1건) → 2
S7 axis regression tests passed. / exit 0
```

pipeline Count 세 위치의 현재 형태는 다음과 같다.

```text
smoke-test-helpers.ps1                 @($Results | Where-Object ...).Count
import-notion-csv.ps1                 @($results | Where-Object ...).Count
run-smoke-tests.ps1                   @($healthResults | Where-Object ...).Count
```

독립 Windows PowerShell 5.1 주입에서도 0/1/다건 값은 정확했다.

### `Measure-Object` 결과

Windows PowerShell 5.1 직접 실측:

```text
INPUT=0  MEASURE_COUNT=0  WRAPPED_MEASURE_OBJECTS=1
INPUT=1  MEASURE_COUNT=1  WRAPPED_MEASURE_OBJECTS=1
INPUT=3  MEASURE_COUNT=3  WRAPPED_MEASURE_OBJECTS=1
```

즉 현재의 `($values | Measure-Object).Count`는 0/1/다건을 정확히 세며, 되돌린 `@($values | Measure-Object).Count`는 항상 1이 되는 것이 다시 확인됐다.

### 결함 1 — S7 회귀 테스트는 양쪽 형태의 0/1/다건을 모두 실행하지 않는다

`test-s7-axis-redefined.ps1`은 pipeline helper에는 0/1/다건을 실제 주입한다. 그러나 `Measure-Object` 두 위치에는 아래 정규식 source assertion만 있다.

```text
올바른 문자열이 존재하는가
잘못된 @(...Measure-Object) 문자열이 없는가
```

`Measure-Object` 입력 0/1/다건의 기대값 `0/1/N`을 실행하는 case는 없다. 따라서 계산 구현은 현재 맞지만, 질문 “S7 회귀 테스트가 이 둘을 다 덮는가”의 답은 **아니다**다. S6를 만든 바로 그 회귀를 동적 test case로 고정하지 못했으므로 범위 내 테스트 결함 1건으로 센다.

## 3. port 축 전수

repo `.ps1` 64개를 대상으로 `localhost:<number>`, `SAMHAN_*_PORT`, `DefaultPort`, `Resolve-*Port`, health/shutdown/login URL과 안내 출력까지 값 생성점에서 소비점으로 추적했다.

정상 경로:

- `seed-local-stack.ps1`: gateway/auth/accounting 및 14 health가 resolver를 사용한다.
- `run-smoke-tests.ps1`: service별 env → health probe → fallback 후 실제 URL에 쓴다.
- `import-notion-csv.ps1`: 기본 URL은 sentinel이며 gateway/service resolver로 보정한다.
- `start-local-full.ps1`: `$services`에 env override를 반영한 뒤 health와 최종 gateway/eureka 안내에 resolved port를 쓴다.
- `operational-validation.ps1`: Eureka 실제 호출과 Gateway map은 각각 resolved port를 쓴다.

### 결함 2 — `operational-validation.ps1`의 service health map은 부분 resolver이며 일부 mapping도 틀리다

Eureka와 Gateway만 resolver다. 같은 `$servicePortMap`의 auth 및 나머지는 직접 숫자를 구성한다.

```text
auth-service       8081 고정 → SAMHAN_AUTH_PORT 무시
slip-service       8085 고정 → 실제 기본 8086과도 불일치
accounting-service 8086 고정 → 실제 기본 8087과도 불일치
inventory-service  8087 고정 → 실제 기본 8085와도 불일치
partner-service    8090 고정 → 실제 기본 8095와도 불일치
```

따라서 S7의 Eureka/Gateway 보정 뒤에도 auth와 그 밖의 port 축은 비어 있지 않다. 동일 health map 한 곳의 부분 resolver/오배치를 결함 1건으로 센다.

### 결함 3 — `launch-local-stack.ps1`의 health와 안내 URL이 고정 port다

S5에서는 resolver로 바뀌었다가 S5 전체 revert로 돌아왔고 S7에서 재적용되지 않았다.

```text
health: Eureka 8761 / Gateway 8080 / Auth 8081 / Dashboard 8094
안내:  API Gateway 8080 / Eureka 8761 / Arologis API 8097
```

compose가 non-default host mapping으로 정상 기동해도 health와 안내가 다른 port를 본다. 한 launcher의 동일 데이터 흐름 결함 1건으로 센다.

### 결함 4 — `run-load-test.ps1`의 host Gateway login/health가 8080 고정이다

S5에서 `SAMHAN_API_GATEWAY_PORT` 기반으로 바뀌었다가 revert됐고 S7에서 재적용되지 않았다.

```text
http://localhost:8080/auth/login
http://localhost:8080/actuator/health
```

K6 container 내부의 `http://api-gateway:8080`은 Docker network의 container port라 정상이고 결함으로 세지 않았다. host 사전검증 두 소비만 한 결함으로 센다.

### 결함 5 — `stop-local-full.ps1`의 shutdown 대상이 전부 기본 port 고정이다

`start-local-full.ps1`은 모든 `SAMHAN_*_PORT` override를 지원하지만 stop script의 `$services`는 env/resolver 없이 14개 숫자를 직접 쓴다. 별도 PowerShell session에서 실행하면 시작 session의 job 객체에 의존할 수 없고 actuator/port 종료가 핵심 fallback인데, non-default service는 종료 대상에서 빠질 수 있다. 한 stop 경로의 port 계약 결함 1건으로 센다.

### 하드코딩이지만 결함으로 세지 않은 것

- `run-smoke-tests.ps1`, `import-notion-csv.ps1`, `seed-local-stack.ps1`의 기본 `localhost:8080`: 명시 인자가 없을 때만 resolver로 교체하는 sentinel이다.
- `tools/test-data/seed-9-slice-fixtures.ps1`의 `-ApiBase` 기본값: 명시적 caller override 계약이며 local-stack env resolver 계약을 선언하지 않는다.
- screenshot/mock/문서 예시 URL: 실제 health·login·shutdown 소비가 아니다.
- Prometheus/Grafana/MinIO 및 client dev server port: 이번 `SAMHAN_<SERVICE>_PORT` 계약 대상이 아니다.
- K6의 `api-gateway:8080`: host mapping이 아니라 container 내부 port다.

## 4. RED-B 재검증

PM이 밤사이 재배포한 `partner-order-service`, `product-service`를 포함한 현재 기존 컨테이너를 사용했다. 재빌드·재생성은 하지 않았다. 시작 전 종료 상태였던 `groupware-service`, `dashboard-service`만 검증 동안 기동했다.

### smoke 및 404 분리

실제 mapping에 `SAMHAN_SLIP_PORT=18086`, `SAMHAN_PARTNER_ORDER_PORT=18088`을 주입했다.

```text
service health  UP 15 / 15
endpoint smoke  OK 7 / 8
inventory /balances 404 BUSINESS_404
process exit 1
```

helper 독립 실측:

```text
404 + code=NOT_FOUND  → BUSINESS_404
404 + 다른 JSON code → PATH_404
404 + empty body      → PATH_404
404 + non-JSON        → PATH_404
```

유일한 실제 endpoint 실패는 범위 밖 #1051의 Inventory/Product 참조 불일치다.

### seed 실제 mapping

`powershell.exe -File scripts/seed-local-stack.ps1 -SkipReimport`로 실행했다.

```text
gateway/auth/accounting 사전 health 3/3
기존 5계정 exists
14 service actuator health OK
5계정 실제 login 5/5
process exit 0
```

### 권한 경계와 전체 identity 위조

정확한 Gateway 경로 `/auth/admin/permissions/accounts`에서 재측정했다.

```text
BOUNDARY_NO_TOKEN         401
BOUNDARY_FORGED_TOKEN     401
BOUNDARY_UNPRIVILEGED     403
BOUNDARY_MASTER           200

SPOOF_NO_TOKEN            401
SPOOF_FORGED_TOKEN        401
SPOOF_UNPRIVILEGED        403
```

위조에는 user id, MASTER group, system-master, role, 대표실 department를 동시에 넣었다. 외부 identity header 전체를 넣어도 우회되지 않았다.

### 자격 누락 fail-fast

존재하지 않는 표준 자격 key를 Windows PowerShell 5.1 별도 process에서 요청했다.

```text
MISSING_CREDENTIAL_THREW=True TYPE=RuntimeException
process exit=1
```

조용한 빈 값 반환은 없었다. 계약 테스트도 fresh 실행에서 `4 pass / 0 fail / exit 0`이었다.

## 5. 결함 수

### 범위 내 5건

1. S7 회귀 테스트가 `Measure-Object`의 0/1/다건을 실행하지 않는다.
2. `operational-validation.ps1` service health map이 Eureka/Gateway 외 port를 직접 구성하며 일부 기본 mapping도 틀리다.
3. `launch-local-stack.ps1` health·안내가 service override를 무시한다.
4. `run-load-test.ps1` host Gateway login·health가 override를 무시한다.
5. `stop-local-full.ps1` shutdown port가 start script의 override 계약을 따르지 않는다.

S5의 직접 회귀였던 `@(Measure-Object)`와 seed ParserError는 사라졌다. 위 5건은 그 두 회귀가 남았다는 뜻이 아니라, S7 테스트 커버리지와 port 축을 더 넓게 실측해 나온 잔존이다.

## 6. 본 범위와 안 본 범위

### 본 범위

- repo `.ps1` 64개 전체의 UTF-16 포함 `@(Measure-Object)` 및 service port 소비 sweep
- PR 전체 변경/신규 `.ps1` 8개의 Windows PowerShell 5.1 `-File` 진입
- pipeline 및 `Measure-Object` 0/1/다건 독립 실측과 S7 테스트 실제 커버리지 대조
- service health/login/shutdown/안내 URL의 env→resolver→소비 데이터 흐름
- 현재 기존 컨테이너의 15 health·8 endpoint smoke, 404 분리, seed 14 health·5 login
- 권한 경계와 identity 전체 위조, 자격 fail-fast
- PR #1119 exact HEAD CI 38/38 fresh 조회

### 안 본 범위

- DC 403 권한 완화·기본 계정 변경·화면 수기 권한 조정
- #1051 Inventory/Product 참조 불일치 수정 또는 DB 정리
- SSE timeout
- `seed-local-stack.ps1` 기존 literal 자격 5건 수정
- 컨테이너 재빌드·재생성, 다른 worktree, 코드 수정, commit/push
- desktop/mobile GUI 및 screenshot
- 전체 load test 실행과 stop script 실제 종료 실행(프로세스 잔류를 만들거나 전체 stack을 내리지 않기 위해 source/data-flow만 확인)
- Linux/macOS shell launcher의 parity

## 7. 정리 및 새 파일 목록

- 검증 중 기동한 `samhan-groupware-service`, `samhan-dashboard-service`는 시작 전 상태인 `Exited (137)`로 복귀했다.
- 테스트용 PowerShell/Node process 잔류 0건을 최종 확인했다.
- 코드 수정, commit, push, container rebuild는 수행하지 않았다.
- 새 파일은 본 보고서 1개다.

```text
docs/dev-reports/2026-08-07-1113-s8-final-reconvergence.md
```
