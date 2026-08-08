# #1113 S1 — PowerShell smoke JWT role claim 계약 정합화

## 조사 기준과 제한

사용자가 지정한 S9 근거 보고서는 현재 브랜치의 ref에는 없었지만 로컬 객체 `39ff2edd2`에서
`docs/dev-reports/2026-08-07-1101-s9-reconvergence-and-live-qa.md`를 직접 읽었다.
해당 보고서의 결론은 자격 로더 배선 자체는 정상이고, 이번 건은 PowerShell smoke의 JWT role claim
계약 문제라는 것이다.

현재 워크트리의 컨테이너는 읽기 전용으로 확인만 했으며 재빌드·재기동하지 않았다. 표준 QA 자격값은
Process/User/Machine 환경변수와 공유 저장소의 `infrastructure/.env.local` 모두에서 사용할 수 없었다.
따라서 실제 로그인/endpoint 라이브 재실행은 비밀번호를 추측하거나 출력하지 않고 중단했다.

## ① 기대 claim vs 실제 claim — 원문 대조

### smoke가 기대하던 원문

수정 전 두 운영 검증 스크립트는 다음을 수행했다.

```powershell
$roleName = $claims.role
if (-not $userId -or -not $roleName) {
    throw "JWT claims 부재 (sub / role)"
}
...
$headers['X-User-Role'] = $roleName
```

즉 `sub`와 `role`을 모두 요구하고, direct service 호출에는 `X-User-Role`을 전달하는 계약이었다.

### 실제 발급/소비 계약 원문

`shared/common/.../JwtTokenProvider.java`의 C5-4 발급부는 다음을 명시한다.

```java
// Phase C5-4: role 클레임 제거 — 인가 경로에서 role 완전 소멸.
// role 파라미터는 소스 계약 호환을 위해 시그니처에만 잔존하며 JWT 본문에 포함하지 않는다.
```

실제 Samhan JWT는 `sub`를 발급하고, 조건에 따라 `isSystemMaster`와 `groups`를 포함하며 `role`은
포함하지 않는다. `JwtTokenProviderTest`도 `generate_doesNotContainRoleClaim` 및 groups/
isSystemMaster 왕복 테스트로 이를 고정한다.

API Gateway의 명시적 계약 원문은 다음과 같다.

```java
// X-User-Role 도 legacy 인가 폴백 오용을 막기 위해 명시적으로 제거한다.
HttpHeaderConstants.INBOUND_IDENTITY_HEADERS.forEach(h::remove);
h.add(HEADER_USER_ID, userId);
h.add(HEADER_IS_SYSTEM_MASTER, String.valueOf(isSystemMaster));
h.add(HEADER_USER_GROUPS, groups);
```

따라서 정본은 `sub` + `groups` + `isSystemMaster`이며 `role`/`X-User-Role`은 정본이 아니다.

## ② 어긋난 시점

```text
2026-06-06  2b62a6f07  [FEAT] 권한그룹 C5-4 — 인가 와이어 role 완전 제거
                         (JwtTokenProvider / API Gateway / PermissionAspect / 계약 테스트)
2026-08-07  d54da54df  #1101 S6 — 소비처 표준 자격 로더 배선
2026-08-07  39ff2edd2  #1107 — S9 라이브 QA 보고서가 자격 배선 정상 및 별도 smoke 증상을 기록
```

코드 정본과 smoke 소비처의 불일치는 C5-4 이후 계속 존재했고, #1101 자격 배선 변경과는 별개의
계약 불일치다.

## ③ 수정 내용

- `run-smoke-tests.ps1`: `sub`만 필수 claim으로 검증하고 `groups`/`isSystemMaster`를 읽는다.
- `import-notion-csv.ps1`: 동일한 claim 소비 및 direct 호출 헤더로 정합화한다.
- 두 스크립트의 direct 호출은 `X-User-Id`, `X-User-Groups`, `X-Is-System-Master`만 전달한다.
  권한 계약을 느슨하게 만들거나 `X-User-Role`을 되살리지 않았다.
- `scripts/seed-local-stack.ps1`: 동일하게 JWT claim에서 identity 헤더를 파생한다.
- `scripts/lib/qa-credentials.ps1`: 현재 작업 브랜치에 누락되어 있던 표준 PowerShell 로더를 추가했다.
  두 운영 검증 스크립트는 `QA_MASTER_PASSWORD`와 기존 호환 alias만 로더를 통해 읽는다.

## ④ JWT 발급받아 쓰는 스크립트 축 전수 확인

목록이 아니라 `api/auth/login`/`auth/login` 호출과 JWT 후속 전달을 축으로 확인했다.

| 소비처 | JWT 후속 사용 | 판정 |
|---|---|---|
| `tools/operational-validation/run-smoke-tests.ps1` | gateway + direct endpoint | 수정 |
| `tools/operational-validation/import-notion-csv.ps1` | direct multipart admin endpoint | 수정 |
| `scripts/seed-local-stack.ps1` | direct accounting/register 호출 | 수정 |
| `scripts/run-load-test.ps1` | login 성공/token 존재만 확인, role claim/role header 소비 없음 | 영향 없음 |

PowerShell tracked 스크립트에서 `X-User-Role`, `$claims.role`, `$roleName = $claims.role`의 잔여
소비는 0건이다. 다른 JWT 소비처(게이트웨이, 서비스 간 호출, 데스크톱, 모바일)의 제품 코드는
변경하지 않았다.

## ⑤ smoke endpoint 범위

`run-smoke-tests.ps1`의 현재 endpoint 정의는 8개다.

```text
1 auth-service /auth/me
2 product-service /products
3 inventory-service /warehouses
4 inventory-service /balances (전체)
5 slip-service /slips
6 partner-service /admin/partners
7 notification-service /admin/notifications
8 dashboard-service /admin/dashboard/kpi
```

수정 전에는 JWT 발급 단계에서 `role` 부재로 종료하므로 8개 중 0개가 실행됐다. 수정 후에는
스크립트 흐름상 8개 endpoint 단계까지 진입하도록 바뀌었다. 유효 자격값 부재로 이번 라운드에는
실 HTTP 8개 응답값을 측정하지 못했다.

## RED-A / RED-B 판정

### RED-A

```text
원인 전: role claim 부재 → JWT 단계 exit 1 → endpoint 실행 0/8
계약 테스트 후: role 비필수 + identity claim 전달 테스트 1/1 PASS
PowerShell parse: smoke/import/seed 3/3 PARSE_OK
실 stack 재실행: 표준 QA 자격값 부재로 미실시
```

정적/계약 수준은 GREEN이지만, 실 HTTP endpoint 결과를 포함한 라이브 RED-A GREEN은 자격값이
공급되지 않아 미판정이다.

### RED-B

```text
Gateway: C5-4 계약 테스트가 X-User-Role 미전파와 X-Is-System-Master/groups 전파를 고정
JWT issuer: role claim 미포함 계약 테스트 PASS
제품 코드 변경: 게이트웨이/서비스/클라이언트 0개
권한 완화: 없음 — MASTER 우회는 X-Is-System-Master=true, 일반 권한은 groups 계약 유지
```

RED-B는 코드/계약 회귀 없음으로 GREEN이다. 권한 없는 계정의 실제 거부 응답은 이번 라운드에
자격값과 별도 부정 계정이 없어 라이브 재측정하지 않았다.

## 검증 결과

```text
node --test scripts/lib/qa-operational-validation-contract.test.cjs  2/2 PASS
PowerShell parse smoke/import/seed                                  3/3 PARSE_OK
git diff --check                                                    PASS
컨테이너                                                             재빌드·재기동 없음
프로세스                                                             신규 기동 없음 / 회수할 신규 프로세스 없음
```

## 신규 파일 목록

- `scripts/lib/qa-credentials.ps1`
- `scripts/lib/qa-operational-validation-contract.test.cjs`
- `docs/dev-reports/2026-08-07-1113-s1-smoke-jwt-role-claim.md`

수정 파일은 `scripts/seed-local-stack.ps1`, `tools/operational-validation/run-smoke-tests.ps1`,
`tools/operational-validation/import-notion-csv.ps1`이다. commit/push는 수행하지 않았다.

## 2026-08-07 후속 실측 — RED-A / HR·부서 / RED-B

### RED-A 실제 실행

PM이 `infrastructure/.env.local`을 현재 워크트리에 복사한 뒤, 컨테이너 재빌드·재기동 없이
다음 명령을 두 번 실행했다.

```text
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File
  tools/operational-validation/run-smoke-tests.ps1 -SkipDcConfig
```

두 실행 모두 JWT 단계까지 통과했고 endpoint 단계에 도달했다.

```text
JWT: OK (role claim을 요구하지 않음, isSystemMaster=True, groups=MASTER 그룹)
health: UP 10/14
endpoint: OK 6/8

OK  auth-service /auth/me                     200
OK  product-service /products                 200
OK  inventory-service /warehouses             200
FAIL inventory-service /balances (전체)       404 PATH_404
OK  slip-service /slips                       200
OK  partner-service /admin/partners           200
OK  notification-service /admin/notifications 200
FAIL dashboard-service /admin/dashboard/kpi   연결 실패
```

health DOWN은 `slip-service`(실제 8186 탐지 후 8186도 미응답), `partner-order-service`,
`groupware-service`, `dashboard-service` 4개였다. dashboard endpoint 실패는 이 중 dashboard
미기동과 일치한다. `inventory /balances`는 gateway가 404를 반환했으며, 이번 이슈의 JWT claim
실패가 아니다.

수정 전에는 `role` claim 부재로 endpoint 0/8에서 종료했지만, 수정 후 실제 endpoint 결과
8개를 수집했다. 따라서 RED-A의 핵심 불변식(endpoint 단계 도달)은 GREEN이다. 전체 smoke
합격은 위 2건 때문에 아직 아니다.

### HR/부서 fallback 판정

현재 smoke의 8개 controller 경로와 가드를 소스 대조했다.

```text
/auth/me                              @RequireDepartment 없음
/products                             @RequireDepartment 없음
/inventory/warehouses (GET 목록)     @RequireDepartment 없음
/inventory/balances                   @RequireDepartment 없음
/slips                                @RequireDepartment 없음
/admin/partners (GET 목록)            @RequireDepartment 없음
/admin/notifications (GET 목록)      @RequireDepartment 없음
/admin/dashboard/kpi                  @RequireDepartment 없음
```

`@RequireDepartment`는 `inventory` warehouse 생성/수정, partner 쓰기 경로, user/groupware
관리 경로 등에 존재하지만 이번 smoke GET 목록에는 없다. 따라서 smoke endpoint 중
`HrAuthorizationHelper`/`DepartmentAspect`를 실제로 통과하는 경로는 0개이며, 이번 smoke
6개 성공 결과에서 legacy fallback 상실은 관측되지 않았다.

다만 `import-notion-csv.ps1`의 DC import endpoint는 `@RequireDepartment(EXECUTIVE_OFFICE)`
경로다. 이를 위해 세 PowerShell JWT 소비처가 이제 `departmentName` claim을 읽고,
gateway와 같은 UTF-8 URL 인코딩으로 `X-User-Department`를 direct 요청에 추가한다.
서버측 legacy fallback은 변경하지 않았다.

### `import-notion-csv.ps1` 실제 실행

실행은 로그인 전에 다음 입력 부재로 fail-fast했다.

```text
NotionExportRoot 가 존재하지 않습니다:
...\tools\legacy-gas\_notion-export
```

현재 워크트리에는 해당 Notion CSV 4종이 없다. 임의 CSV를 만들거나 다른 워크트리에서
복사해 endpoint를 호출하지 않았다. 따라서 import endpoint의 실제 HR 통과 응답은 미판정이며,
스크립트가 JWT 단계까지 진입하지 못한 이유는 claim/권한이 아니라 입력 파일 부재다.

### `seed-local-stack.ps1` 실제 실행

UTF-8 원문을 보존하는 방식으로 실제 스크립트 블록을 실행했다. 기본 seed 자격은 400,
표준 QA 자격으로 `kimmiseon`을 명시한 재실행은 login 이후 register 단계에서 403으로
중단됐다.

```text
[seed] gateway/auth-service/accounting-service health: OK
default seed login: HTTP 400
standard QA kimmiseon login path: HTTP 403 at subsequent register call
```

Windows PowerShell `-File` 직접 실행은 기존 UTF-8 무 BOM 한글 파싱 오류로 시작 전에 중단되어,
파일을 수정하지 않고 UTF-8 `Get-Content` + scriptblock으로 재실행했다. seed 전체 성공은
확인하지 못했으며, 이 403을 서버 권한 계약 완화로 고치지 않았다.

### RED-B 실제 실행

실 gateway에서 `/admin/partners/export.xlsx`에 대해 무토큰·위조토큰·권한 없는 계정·MASTER를
각각 호출했다.

```text
no-token   = 401
forged     = 401
dev_sales  = 403
dev_master = 200
```

권한 경계는 느슨해지지 않았다. 게이트웨이/서비스 간 호출/데스크톱·모바일 제품 코드는
변경하지 않았고, 현재 diff는 운영 스크립트·표준 로더·계약 테스트·보고서뿐이다.

### 후속 검증

```text
node --test scripts/lib/qa-operational-validation-contract.test.cjs  2/2 PASS
PowerShell parse smoke/import/seed                                  3/3 PARSE_OK
smoke 실제 endpoint                                                  6/8 OK, endpoint 단계 도달
RED-B 실제 권한 경계                                                 401/401/403/200 PASS
컨테이너                                                             재빌드·재기동 없음
신규 프로세스                                                        없음(모든 실행 종료)
```

현재 남은 실제 실패는 `inventory /balances`의 404, dashboard-service 미기동, Notion CSV 입력
부재, seed register 403이다. 서버측 HR fallback이나 권한 계약은 범위 밖이므로 수정하지 않았다.
