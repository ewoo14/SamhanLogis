# #1113 S4 — S3 재수렴 및 SOL 라이브 QA

## 결론

- 기준: `fix/1113-smoke-jwt-role-claim`, HEAD `5edb2e5db9b37cfebe31d912bd3cf23c137401b1`.
- PR #1119 CI는 exact HEAD 기준 38/38 success, mergeable/CLEAN이다.
- smoke 실패 집계, 404 분류, 실제 7/8 및 exit code는 S3 수정대로 동작한다.
- 실제 mapping override를 준 seed는 14 service health, 5계정 login verify, exit 0으로 완주했다.
- 권한 경계와 identity 전체 위조 차단은 `401 / 401 / 403 / 200`, `401 / 401 / 403`으로 유지됐다.
- **S4 범위 내 결함은 3건이다.** 따라서 이 실측 기준으로 머지 게이트 ①③은 충족하지 않는다.
- 범위 밖 Inventory/Product 참조 불일치는 그대로 `BUSINESS_404`이며 결함 수에 넣지 않았다.

## 환경 확인

```text
branch  fix/1113-smoke-jwt-role-claim
HEAD    5edb2e5db9b37cfebe31d912bd3cf23c137401b1
PR      #1119 MERGEABLE / CLEAN / exact SHA 38 checks success

product-service        재배포 uptime 약 15분, healthy
partner-order-service  재배포 uptime 약 15분, healthy, host 18088
slip-service           기존 배포, healthy, host 18086
```

라운드 시작 당시 `groupware-service`, `dashboard-service`는 `Exited (137)`였다. seed와 smoke의 15 health 전수를 위해 기존 컨테이너만 잠시 시작했으며 재빌드하지 않았다. 라운드 종료 시 두 컨테이너 모두 다시 `Exited (137)`로 복귀시켰다.

PowerShell 5.1 자식 프로세스로 헬퍼와 운영 스크립트를 직접 실행했다. 별도 창은 열지 않았다. 초기에 일회성 하네스의 JSON/정규식 escaping이 깨진 실행은 입력 자체가 잘못됐으므로 판정에서 제외하고, `EncodedCommand` 또는 문자열 배열 직접 전달로 재실측한 값만 아래에 채택했다.

## 집계 0건·1건·다건 실측 원문

`Get-SmokeFailureCount`에 8개 결과를 직접 주입하고 실제 자식 PowerShell exit code를 회수했다.

```text
CASE=ZERO
FAILURES=0 endpoint smoke — OK 8 / 8
PROCESS_EXIT=0
CASE=ONE_INTENTIONAL
FAILURES=1 endpoint smoke — OK 7 / 8
PROCESS_EXIT=1
CASE=MULTI
FAILURES=3 endpoint smoke — OK 5 / 8
PROCESS_EXIT=1
```

원 결함인 단일 실패가 실제로 `7 / 8`, failure 1, exit 1로 출력된다. PowerShell 5.1의 단일 `PSCustomObject.Count = null` 경로는 `@(...)` 강제 배열화로 해소됐다.

실제 전체 smoke도 같은 결과였다.

```text
service health  — UP 15 / 15
inventory-service /balances (전체)  404  BUSINESS_404
endpoint smoke  — OK 7 / 8
LIVE_SMOKE_PROCESS_EXIT=1
```

실패 1건은 범위 밖 Inventory/Product 참조 불일치다. 스크립트는 이를 숨기지 않고 7/8 및 exit 1로 보고했다.

## 404 분리 및 파싱 실패

Windows PowerShell 5.1에 JSON 원문을 보존해 직접 호출한 결과다.

```text
BUSINESS_JSON|status=404|verdict=BUSINESS_404
OTHER_JSON|status=404|verdict=PATH_404
EMPTY_BODY|status=404|verdict=PATH_404
NON_JSON|status=404|verdict=PATH_404
SUCCESS|status=200|verdict=OK
PROCESS_EXIT=0
```

`code=NOT_FOUND`만 업무 404다. body 없음, 비JSON, 다른 JSON code는 `ConvertFrom-Json` 실패 또는 조건 불일치 후 모두 `PATH_404`로 닫힌다.

## seed 양쪽 환경

### 실제 non-default mapping + override 있음

현재 배치의 실제 mapping인 `SAMHAN_SLIP_PORT=18086`, `SAMHAN_PARTNER_ORDER_PORT=18088`을 주입했다. 기존 5계정이 이미 S3에서 생성돼 있어 신규 insert 대신 idempotent `exists`였고, 뒤이어 5계정 모두 실로그인으로 검증됐다.

```text
[seed] OK gateway
[seed] OK auth-service
[seed] OK accounting-service
[seed] exists  master@samhan.test
[seed] exists  manager@samhan.test
[seed] exists  accountant@samhan.test
[seed] exists  staff@samhan.test
[seed] exists  driver@samhan.test
[seed] 14 service actuator health OK — Flyway startup completed
[seed] verified login OK: master@samhan.test (role=MASTER)
[seed] verified login OK: manager@samhan.test (role=MANAGER)
[seed] verified login OK: accountant@samhan.test (role=ACCOUNTANT)
[seed] verified login OK: staff@samhan.test (role=STAFF)
[seed] verified login OK: driver@samhan.test (role=DRIVER)
OVERRIDE_PROCESS_EXIT=0
```

최종 평문 자격 요약 5줄은 캡처 단계에서 폐기했다.

### override 없음

현재 환경은 기본-port 환경이 아니라 slip/partner-order가 non-default mapping인 환경이다. 모든 `SAMHAN_*_PORT`를 제거하면 resolver는 계약대로 기본 8086/8088을 선택하고, host 8086의 다른 서비스가 404를 반환한다.

```text
[seed] OK gateway
[seed] OK auth-service
[seed] OK accounting-service
[seed] exists 5건
SEED_ERROR=404 Not Found
NO_OVERRIDE_PROCESS_EXIT=1
```

순수 resolver 실측은 다음과 같다.

```text
PORT_DEFAULT=8086
PORT_OVERRIDE=18086
PORT_INVALID_FALLBACK=8086
PORT_HELPER_PROCESS_EXIT=0
```

따라서 제시된 두 갈래 외 셋째 상태가 있다. **override가 없는 기본-port 환경**과 **non-default mapping인데 override를 누락한 환경**은 같지 않다. 후자는 실패가 정상이다. 컨테이너 재빌드/재생성 금지 때문에 기본 mapping 환경의 full seed는 만들지 않았다.

## RED-B 전수

### role claim 제거 후 endpoint 도달

실로그인 JWT에 `role` claim이 없음을 확인했다.

```text
MASTER_JWT_ROLE_CLAIM_PRESENT=False
```

그 토큰으로 실제 smoke 8경로 중 7개가 200이었다. Inventory는 controller/service/ProductClient 단계 뒤 업무 `NOT_FOUND`에 도달했다. 즉 role claim 없이 인증·인가 및 endpoint 단계까지 도달한다.

### 권한 경계와 identity 전체 위조

정확한 인증 route인 `/auth/admin/permissions/accounts`에서 재측정했다.

```text
BOUNDARY_NO_TOKEN=401
BOUNDARY_FORGED_TOKEN=401
BOUNDARY_UNPRIVILEGED=403
BOUNDARY_MASTER=200
SPOOF_NO_TOKEN=401
SPOOF_FORGED_TOKEN=401
SPOOF_UNPRIVILEGED=403
```

전체 위조는 `X-User-Id`, MASTER groups, `X-Is-System-Master=true`, `X-User-Role=MASTER`, 대표실 부서를 동시에 넣었다. gateway가 서명된 JWT보다 먼저 외부 identity 헤더를 제거하므로 우회되지 않았다.

### Notion import

DB 데이터를 바꾸지 않도록 최소 유효 헤더만 가진 0-row CSV 4종으로 실제 multipart를 호출했다.

기본 실행(`kimmiseon`)은 다음과 같았다.

```text
REGION  200  inserted=0 updated=0 rejected=0 OK
DC      403  EXCEPTION
CHAT    200  inserted=0 updated=0 rejected=0 OK
BLOCK   200  inserted=0 updated=0 rejected=0 OK
NOTION_IMPORT_PROCESS_EXIT=1
```

대표실 claim이 있는 `dev_master`를 명시하면 같은 파일로 4/4가 통과했다.

```text
REGION  200  inserted=0 updated=0 rejected=0 OK
DC      200  inserted=0 updated=0 rejected=0 OK
CHAT    200  inserted=0 updated=0 rejected=0 OK
BLOCK   200  inserted=0 updated=0 rejected=0 OK
NOTION_DEV_MASTER_PROCESS_EXIT=0
```

즉 import 기능 자체는 role 없이 동작하지만, 스크립트의 문서화된 기본 계정은 DC endpoint 자격을 충족하지 않는다.

### 자격 없으면 throw

분리된 표준 자격 loader에 의도적으로 존재하지 않는 키를 요청했다.

```text
MISSING_CREDENTIAL=THREW type=RuntimeException
MISSING_CREDENTIAL_PROCESS_EXIT=1
```

조용한 빈 값 반환은 없었다. 계약 테스트도 fresh 실행에서 4 pass / 0 fail이었다.

```text
node --test scripts/lib/qa-operational-validation-contract.test.cjs
tests 4 / pass 4 / fail 0 / exit 0
```

## 범위 내 결함 3건

### 1. Notion importer 기본 실행이 4/4가 아니라 3/4

`import-notion-csv.ps1`의 기본 `LoginId`는 `kimmiseon`이다. 현재 서명 JWT는 `isSystemMaster=true`지만 `role`과 `departmentName`이 모두 없다. PR이 `X-User-Role` 전달을 제거하면서 `HrAuthorizationHelper`의 legacy MASTER fallback도 더는 발화하지 않는다. DC import의 `@RequireDepartment(EXECUTIVE_OFFICE)`가 403을 반환한다.

대표실 claim이 있는 `dev_master`를 명시하면 4/4이므로 endpoint나 새 identity 헤더 자체의 결함은 아니다. **기본 자격 선택과 부서 계약의 불일치**다.

### 2. Notion 단일 실패 집계도 PowerShell 5.1에서 공백

`import-notion-csv.ps1:442~443`도 smoke의 원 결함과 같은 스칼라 `.Count` 패턴이다.

```text
$okCount   = ($results | Where-Object { $_.Verdict -eq 'OK' }).Count
$failCount = ($results | Where-Object { $_.Verdict -ne 'OK' }).Count
```

DC만 실패한 실제 출력은 다음처럼 실패 수가 비었다.

```text
불합격 —  항목 fail / 합격 3 항목
```

exit 1은 유지돼 거짓 green은 아니지만 운영 진단 숫자가 틀렸다.

### 3. seed auth 사전 health는 `SAMHAN_AUTH_PORT`를 무시

`seed-local-stack.ps1`은 `$authPort`와 `$authServiceBaseUrl`을 계산하지만 line 78의 최초 대기는 여전히 하드코딩이다.

```text
Wait-Http "auth-service" "http://localhost:8081/actuator/health"
```

따라서 slip/partner-order override는 이번 실제 mapping에서 통과했지만, auth-service 자체가 non-default port인 환경에서는 override 양쪽 계약이 완성되지 않았다. 현재 auth는 기본 8081이라 live failure를 만들지는 않았고, 재배포 금지 때문에 auth mapping을 바꿔 재현하지 않았다.

## 결함 수 수렴

```text
S2  5건 (당시 PR 무관 4 + 범위 밖 backend 1)
S3  기존 4건 흡수
S4  새 범위 내 결함 3건
    1) Notion 기본 계정 DC 403
    2) Notion 단일 fail count 공백
    3) seed auth health override 미반영

범위 밖 잔존 1건
    Inventory/Product 참조 불일치 → BUSINESS_404
```

## 본 범위

- exact SHA/CI/merge 상태와 Docker host mapping
- PowerShell 5.1 집계 0/1/다건, 고의 단일 실패 7/8, 각 exit code
- 404 업무/경로 분리와 빈 body·비JSON 파싱 실패
- seed 실제 실행: non-default mapping의 override 있음/누락 상태, 14 health, 기존 5계정 실로그인
- role claim 부재, 8 endpoint smoke, 권한 경계, identity 전체 위조
- Notion 0-row multipart: 기본 계정 3/4 및 대표실 계정 4/4
- 자격 loader fail-fast throw
- 계약 테스트 4/4

## 안 본 범위

- Inventory/Product 데이터 참조 불일치의 백엔드 수정 또는 DB 정리
- SSE stream timeout
- `seed-local-stack.ps1`의 기존 평문 literal 5건
- 컨테이너 재빌드/재생성, auth-service non-default mapping 환경 구성
- 기본 8086/8088 mapping으로 전체 스택을 다시 만든 full seed
- DB 직접 변경
- Desktop/mobile GUI. 사용자 게임 중 지시에 따라 창을 띄우지 않았다.
- 코드 수정, commit, push, 새 이슈 생성

## 정리 및 새 파일 목록

- 임시 0-row CSV 4종과 임시 디렉터리는 삭제했다.
- 잠시 시작한 groupware/dashboard 컨테이너는 원래 종료 상태로 복귀했다.
- 테스트용 PowerShell/Node/브라우저 프로세스 잔류는 0건이다. 기존 Codex runtime 프로세스만 남아 있다.
- 새 파일: `docs/dev-reports/2026-08-07-1113-s4-reconvergence-and-live-qa.md`

