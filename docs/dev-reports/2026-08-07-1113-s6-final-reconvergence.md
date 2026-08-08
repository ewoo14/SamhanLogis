# PR #1119 / 이슈 #1113 — S6 최종 재수렴

## 결론

- 기준 좌표는 `fix/1113-smoke-jwt-role-claim`, HEAD `45c3057c0b5f73d13b36fd42525f6363eaf0fb3c`다.
- PR #1119의 exact HEAD CI는 38/38 green이다.
- S5 회귀 테스트는 통과하지만, 변경한 9개 스크립트를 전부 실행하거나 각 스크립트의 0/1/다건을 검증하지 않는다. 동적 검증은 공통 count helper와 port resolver뿐이고 importer/seed는 문자열 검사다.
- RED-B의 업무 동작은 유지됐다. 실제 mapping override를 준 smoke는 health 15/15, endpoint 7/8, exit 1이며 유일한 endpoint 실패는 범위 밖 #1051의 `BUSINESS_404`다. 권한 경계와 전체 identity 위조 차단, 404 3종 분리, UTF-8 강제 로드한 seed의 14 health·5계정 login, 자격 fail-fast도 재확인했다.
- 그러나 축 재-sweep에서 **범위 내 결함 4건**을 확인했다. 따라서 S6 결함 수는 0이 아니다.

```text
S2  5건
S4  3건
S6  4건
```

## 환경과 보존 조치

```text
branch  fix/1113-smoke-jwt-role-claim
HEAD    45c3057c0b5f73d13b36fd42525f6363eaf0fb3c
CI      38/38 pass

partner-order-service  PM 재배포본, host 18088, healthy
slip-service           기존 배포, host 18086, healthy
groupware/dashboard    시작 전 Exited (137)
```

health와 smoke를 위해 `groupware-service`, `dashboard-service` 기존 컨테이너만 기동했다. 재빌드·재생성은 하지 않았다. 종료 시 두 컨테이너 모두 다시 `Exited (137)`로 복귀시켰고, S6용 PowerShell/Node 자식 프로세스 잔류는 0건이다.

## 1. count·집계·인덱싱 축 재-sweep

### 방법

단일행 grep만으로 판정하지 않았다.

1. `rg --files -g '*.ps1'`로 repo의 PowerShell 64개를 확정했다.
2. `rg -n --glob '*.ps1' '\.Count\b'`로 86개 `.Count` 사용을 수집했다.
3. PowerShell parser의 `ParseFile`/AST로 여러 줄에 걸친 `@( ... ).Count`와 구문 오류까지 다시 읽었다.
4. `= ... |`, `Where-Object`, `Select-Object`, `Get-ChildItem`, `Measure-Object`, `+=`, 인덱싱을 별도 검색하고 값 생성 지점부터 소비 지점까지 역추적했다.
5. scalar `PSCustomObject`, 빈 pipeline, 명시적 빈 배열, `Measure-Object` 반환 객체를 Windows PowerShell 5.1.26100에서 직접 비교했다.
6. port는 `localhost:<숫자>`, `SAMHAN_*_PORT`, `Resolve-LocalStackPort`, service health URL과 최종 안내 URL을 함께 대조했다.

안전한 패턴은 다음과 같이 분리했다.

- `@()`로 시작하고 `+=`로만 누적하는 `$results`, `$rows`, `$failures`, `$occupied`는 0/1/다건 모두 배열 계약을 유지한다.
- 문자열, `-split` 결과, JSON array, 고정 hashtable/배열의 `.Count`는 `PSCustomObject` pipeline scalar 함정과 다르다.
- pipeline 결과를 boolean으로만 소비하는 `$failed`, `$failedRequired`는 건수 출력이 아니므로 결함으로 세지 않았다.
- `($values | Measure-Object).Count`는 입력 건수지만, `@($values | Measure-Object).Count`는 요약 객체 배열의 크기라 항상 1이다.

### 결함 1 — `Measure-Object` 입력이 아니라 요약 객체를 센다

`infrastructure/scripts/operational-validation.ps1:764-765,814-815`의 두 경로가 다음 형태다.

```powershell
@($pretendardFiles | Measure-Object).Count
@($s3YmlFiles | Measure-Object).Count
```

Windows PowerShell 5.1 실측:

```text
입력 0건  → 현재값 1 / 실제값 0 / 조건 PASS
입력 1건  → 현재값 1 / 실제값 1
입력 3건  → 현재값 1 / 실제값 3
```

즉 빈 검색 결과도 Pretendard/S3 검증을 PASS시키며, 다건 상세도 항상 `1 파일`로 축소한다. S5 보고서의 해당 스크립트 `0/1/3` 판정은 실제 코드 동작과 다르다. 같은 원인의 두 위치를 결함 1건으로 센다.

### 다른 count 계열 결과

```text
importer OK/fail pipeline  0/1/3 입력에서 0/1/다건 정확
smoke DOWN pipeline        0/1/3 입력에서 0/1/다건 정확
config actual 분기         null/SINGLE/3건 → NO_COMPOSE_PORT/SINGLE/AMBIGUOUS 정확
스크린샷 누락 pipeline     누락 0/1/3 정확
migration 파일 pipeline    0/1/3 정확
```

`validate-config-audit.ps1`의 `$null -eq $actual -or @($actual).Count ...`는 explicit null에서 `@($null).Count`가 1인 PowerShell 5.1 특성이 있어도 선행 null guard가 short-circuit하므로 분기 결과는 정확했다.

## 2. S5 회귀 테스트 커버리지와 미커버 실측

`tools/operational-validation/test-s5-count-and-port.ps1` 자체는 fresh 실행에서 exit 0이었다. 그러나 실제 커버리지는 다음과 같다.

| 변경 스크립트 | S5 테스트가 하는 일 | S6 직접 실측 | 결과 |
|---|---|---|---|
| `infrastructure/scripts/operational-validation.ps1` | 없음 | `Measure-Object` 0/1/3 | **FAIL: 1/1/1** |
| `infrastructure/scripts/validate-config-audit.ps1` | 없음 | null/1/3 compose 결과와 Java 검색 배열 | PASS |
| `scripts/generate-sp-08-4-4-order-print-form-screenshots.ps1` | 없음 | 임시 파일로 누락 0/1/3 | PASS |
| `scripts/launch-local-stack.ps1` | 없음 | env→resolver→health/output URL 데이터 흐름 | 변경부 PASS |
| `scripts/probe-896-s2-fresh-postgres.ps1` | 없음 | 임시 migration 0/1/3 정렬·count | PASS |
| `scripts/run-load-test.ps1` | 없음 | gateway override→base URL 데이터 흐름 | 변경부 PASS |
| `scripts/seed-local-stack.ps1` | 리터럴 8081 부재만 문자열 검사 | auth override URL, 정상 `-File` 진입, UTF-8 강제 실행 | port PASS, **진입 FAIL** |
| `tools/operational-validation/import-notion-csv.ps1` | helper 이름 존재만 검사 | 유효 0-row CSV 4종 실제 호출 | 3 OK / 1 DC 403, `1 항목 fail`, exit 1 |
| `tools/operational-validation/run-smoke-tests.ps1` | 공통 helper만 간접 검증 | 실제 15 health·8 endpoint | 15/15, 7/8, exit 1 |

따라서 회귀 테스트는 “9개 스크립트를 다 덮는가”에 대해 **아니다**. 대표 helper·resolver와 두 문자열만 덮는다.

초기 Notion 실측에서 임의 `header` 한 칸짜리 CSV를 사용해 1 OK / 3 fail이 나온 실행은 입력 자체가 서비스별 CSV 계약에 맞지 않아 판정에서 제외했다. 각 서비스가 요구하는 최소 유효 header로 다시 실행한 값을 채택했다.

### 결함 2 — seed의 정상 PowerShell 5.1 진입이 ParserError

`scripts/seed-local-stack.ps1`은 UTF-8 BOM이 없고, Windows PowerShell 5.1의 정상 명령인 다음 호출에서 본문 실행 전에 실패한다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\seed-local-stack.ps1 -SkipReimport
```

실측:

```text
BOM=False
ParseFile errors=5
첫 오류 scripts/seed-local-stack.ps1:102 Unexpected token
process exit=1
```

UTF-8을 명시해 `ReadAllText(..., UTF8)` 후 scriptblock으로 실행하면 같은 파일이 14 service health, 5계정 login, exit 0으로 완주했다. 따라서 자격/서비스 문제가 아니라 **PowerShell 5.1의 파일 디코딩 진입 문제**다. S4의 UTF-8 강제 로드 우회는 업무 동작을 확인했지만, 사용자가 문서대로 직접 실행하는 경로는 여전히 깨져 있다.

## 3. port 축 재-sweep

변경한 세 스크립트의 핵심 port 데이터 흐름은 정상이다.

```text
launch-local-stack  eureka/gateway/auth/dashboard → Resolve-LocalStackPort 사용
run-load-test       gateway login/health → resolved gatewayBaseUrl 사용
seed-local-stack    gateway/auth/accounting + 14 health → env override 사용

resolver 실측       빈 값→8081, 8181→8181, 비숫자→8081
seed auth URL        SAMHAN_AUTH_PORT 값으로 구성됨
```

그러나 repo-wide sweep에서 직접 구성 잔여 2건을 확인했다.

### 결함 3 — 운영검증 Eureka 실제 호출이 override를 무시

`infrastructure/scripts/operational-validation.ps1:614-616`은 실제 HTTP 검증을 `http://localhost:8761/eureka/apps`로 고정한다. 같은 repo의 launcher/smoke가 지원하는 `SAMHAN_EUREKA_PORT`를 읽지 않는다. Eureka가 non-default mapping이면 정상 service를 오판한다.

Prometheus/Grafana/MinIO 같은 고정 인프라 endpoint와 달리 Eureka는 명시적인 `SAMHAN_EUREKA_PORT` 대상이므로 범위 내 결함으로 센다.

### 결함 4 — `start-local-full` 최종 안내가 resolved port를 버린다

`infrastructure/scripts/start-local-full.ps1`은 `$services`의 gateway/eureka port를 env override로 올바르게 갱신하고 health도 그 값으로 검사한다. 그러나 `:561,565-566`의 최종 사용 가이드는 다시 `8080`, `8761`을 직접 출력한다.

S5가 같은 이유로 `launch-local-stack.ps1`의 출력 URL을 resolved port로 바꿨지만, 이 launcher에는 동일 축이 남았다. non-default mapping에서 성공적으로 기동한 직후 잘못된 login/Eureka URL을 안내하므로 결함으로 센다.

기본값을 sentinel로 받은 뒤 resolver로 교체하는 importer/smoke/seed의 `localhost:8080` 기본 parameter, 고정 인프라 URL, 이미지 안의 예시 URL은 실제 override를 우회하는 호출로 세지 않았다.

## 4. RED-B 전수 재검증

### role claim 제거 후 endpoint 단계와 smoke

```text
MASTER_JWT_ROLE_CLAIM_PRESENT=False
service health  UP 15 / 15
endpoint smoke  OK 7 / 8
inventory /balances 404 BUSINESS_404
process exit 1
```

role claim 없이 7개 endpoint가 200이고 inventory도 인증/인가·controller 이후 업무 `NOT_FOUND`에 도달했다. 7/8과 exit 1이 정확하다.

실제 mapping override를 누락한 첫 실행은 13/15였다. 이는 기본-port 환경이 아니라 S4에서 분리한 “non-default mapping인데 override 누락” 상태이므로 최종 smoke 판정에서 제외하고, `SAMHAN_SLIP_PORT=18086`, `SAMHAN_PARTNER_ORDER_PORT=18088`을 주입해 재실행했다.

### 404 업무/경로/비JSON 분리

```text
200                              OK
404 + {code: NOT_FOUND}          BUSINESS_404
404 + 다른 JSON code             PATH_404
404 + empty body                 PATH_404
404 + non-JSON                   PATH_404
```

처음 한 번은 JSON 문자열에 불필요한 escape를 넣어 비JSON으로 전달됐으므로 제외하고, `ConvertTo-Json`으로 만든 실제 JSON 원문 재실행 값만 채택했다.

### seed 실제 mapping

UTF-8 강제 로드 우회로 업무 동작을 분리 검증했다.

```text
gateway/auth/accounting 사전 health  3/3
14 service actuator health           OK
기존 5계정                           exists
5계정 실제 login                     5/5
process exit                         0
```

자격 값과 스크립트의 최종 평문 자격 요약은 보고서에 기록하지 않았다.

### 권한 경계와 identity 전체 위조

정확한 gateway route `/auth/admin/permissions/accounts`에서 재측정했다.

```text
BOUNDARY_NO_TOKEN         401
BOUNDARY_FORGED_TOKEN     401
BOUNDARY_UNPRIVILEGED     403
BOUNDARY_MASTER           200

SPOOF_NO_TOKEN            401
SPOOF_FORGED_TOKEN        401
SPOOF_UNPRIVILEGED        403
```

전체 위조에는 user id, MASTER group, system-master, role, 대표실 부서를 동시에 넣었다. 외부 identity header만으로 우회되지 않았다.

### 자격 없으면 throw

존재하지 않는 표준 자격 key를 별도 PowerShell 5.1 process에서 요청했다.

```text
MISSING_CREDENTIAL_THREW=True
process exit=1
```

조용한 빈 값 반환은 없었다. `node --test scripts/lib/qa-operational-validation-contract.test.cjs`도 fresh 실행에서 4 pass / 0 fail / exit 0이었다.

## 5. 결함 수와 범위

### 범위 내 결함 4건

1. `operational-validation.ps1`의 `@(Measure-Object).Count`가 0/1/다건을 모두 1로 오집계한다.
2. `seed-local-stack.ps1`이 Windows PowerShell 5.1 정상 `-File` 진입에서 ParserError로 실행되지 않는다.
3. `operational-validation.ps1`의 Eureka 실제 호출이 `SAMHAN_EUREKA_PORT`를 무시한다.
4. `start-local-full.ps1`이 resolved gateway/eureka port 대신 고정 8080/8761 사용 URL을 출력한다.

DC 기본 계정 403은 개발책임자의 `MASTER · MANAGER만 허용, 화면 수기 조정` 결정에 따라 결함으로 세지 않았다.

### 본 범위

- repo PowerShell 64개 전체의 `.Count`, pipeline, `Measure-Object`, `+=`, indexing, ParseFile, service port literal 재-sweep
- S5 변경 9개 스크립트의 회귀 테스트 실제 커버리지 대조
- count 변경부의 독립 0/1/다건 실측과 port 데이터 흐름 검증
- Notion 최소 유효 0-row CSV 4종 실제 multipart 및 단일 실패 숫자
- 실제 15 health·8 endpoint smoke, 404 분류, role claim 부재
- auth admin 권한 경계와 전체 identity 위조
- seed 정상 진입과 UTF-8 강제 로드 업무 동작 분리
- 표준 자격 loader fail-fast와 계약 테스트
- exact HEAD GitHub checks

### 안 본 범위

- DC 권한 완화·기본 계정 변경·화면 수기 권한 조정
- #1051로 흡수된 Inventory/Product 참조 불일치 수정
- SSE stream timeout
- `seed-local-stack.ps1:70-74` 예외 literal 5건 수정
- 컨테이너 재빌드·재생성, DB 직접 수정, 다른 워크트리
- 전체 load test 실행, fresh PostgreSQL container probe, 전체 스크린샷 렌더링
- desktop/mobile GUI
- 코드 수정, commit, push, 새 이슈 생성

## 6. 정리와 새 파일

- 임시 CSV·migration·PNG 실측 디렉터리는 모두 삭제했다.
- `groupware-service`, `dashboard-service`는 시작 전 상태인 `Exited (137)`로 복귀했다.
- S6 테스트 자식 프로세스 잔류는 0건이다.
- 새 파일은 본 보고서 1개다.

```text
docs/dev-reports/2026-08-07-1113-s6-final-reconvergence.md
```
