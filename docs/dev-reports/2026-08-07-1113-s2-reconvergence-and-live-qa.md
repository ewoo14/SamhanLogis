# #1113 S2 — 적대검증 + 라이브 QA 재수렴

## 결론

- **S2 실측 결함: 5건**이다. 다만 **이 PR의 role claim / `X-User-Role` 제거가 새로 만든 결함은 0건**이다.
- 기존 2건을 둘 다 단순히 "경로/환경"이라고 묶은 판정은 **반은 맞고 반은 틀렸다**.
  - Dashboard: 미기동 환경 문제가 맞다.
  - Inventory: 경로 404가 아니다. endpoint와 route를 통과한 뒤 inventory → product 내부 조회에서 발생한 **업무 `NOT_FOUND` 404**다.
- `X-User-Role`을 넣지 않아 막힌 정상 경로는 관측되지 않았다. 부서 가드 5개 controller / 30개 method는 `departmentName` 기준으로 통과했고, role 헤더 유무와 무관했다.
- 헤더 위조는 차단됐다. 무토큰/위조 토큰/권한 없는 계정/MASTER = **401/401/403/200**, 모든 identity 헤더 위조 후 = **401/401/403**이다.

## 환경 확인

```text
cwd       C:\dev\Samhan-Public\.claude\worktrees\t1113
branch    fix/1113-smoke-jwt-role-claim
HEAD      c736b71e9810cf08259520c760cc2b38eac2d2ec
PR #1119 headRefOid 일치
초기 Docker dashboard/groupware  Exited (143)
재빌드                          0건
코드 수정/commit/push           0건
```

`infrastructure/.env.local`의 key만 확인했고 값은 출력하지 않았다. 라이브 QA는 해당 파일을 process 환경으로만 로드해 수행했다.

Dashboard와 groupware는 기존 image/container만 `docker start`했다. 정상 응답 확인 후 둘 다 다시 `Exited (143)`로 회수했다. 신규 Gradle daemon은 `--no-daemon`으로 실행 종료됐고, 라운드 종료 시 신규 잔류 프로세스는 0건이다.

## ① 남은 2건 판정

### A. `/api/v1/inventory/balances`

#### 정적 도달 경로

```text
Gateway application.yml
  Path=/api/v1/inventory/**
  StripPrefix=2
  JwtAuthentication
    ↓
inventory-service
  StockController @RequestMapping("/inventory")
  @GetMapping("/balances")
  @RequirePermission("inventory.stock-balance", VIEW)
    ↓
StockService.findBalancePage(...)
    ↓
ProductClient POST /products/internal/lookup
```

Gateway route와 controller mapping은 모두 존재한다. 배포 container의 `/v3/api-docs`에도 `/inventory/balances`가 있었다.

#### 라이브 대조

```text
gateway, X-User-Role 없음       404
gateway, X-User-Role: MASTER 위조 404
direct :8085, role 없음          404
direct :8085, role 있음          404
```

네 응답의 body는 같은 `code=NOT_FOUND`였고, 메시지는 product batch 요청 100건 중 1건만 응답됐다는 내용이었다. 즉 request mapping, JWT, PermissionAspect를 통과한 뒤 `ProductClient.lookup()` line 114~117에서 발생한 업무 404다.

**판정:** role 계약과 무관하다는 판정은 맞다. 다만 "경로 문제"는 틀렸고, 제3의 가능성인 **inventory/product 간 데이터 참조 불일치**다.

### B. `/admin/dashboard/kpi`

소스의 `DashboardAdminController` mapping은 존재하고 dashboard-service default port는 8094다. Gateway route는 `/dashboard/**`만 보유하므로 smoke의 `/admin/dashboard/kpi` direct 호출 선택도 맞다.

```text
초기                 container Exited / Eureka 미등록 / 연결 실패
기존 container만 기동  actuator 200 / Eureka UP
direct, role 없음       200
direct, role 있음       200
gateway /admin/...       404 (route 미존재, smoke는 이 경로를 쓰지 않음)
```

**판정:** 초기 연결 실패는 미기동 환경 문제이며 role 계약과 무관하다. 기존 container를 정지 상태로 복귀했다.

## ② 정상 경로 전수

### `HrAuthorizationHelper` / `DepartmentAspect`

생산 소스의 `@RequireDepartment` 실적용은 **5개 controller, 30개 method**다.

| controller | method 수 | 라이브 대표 경로 | role 없음 | role 위조 |
|---|---:|---|---:|---:|
| `DcConfigImportController` | 1 | `POST /api/v1/dc-config/admin/import` direct | 200 | 미필요 |
| `AdminUserController` | 12 | `GET /api/v1/admin/users` gateway | 200 | 200 |
| `WarehouseController` | 6 | `GET /inventory/warehouses/deleted` gateway | 200 | 200 |
| `PartnerAdminController` | 7 | `GET /admin/partners/export.xlsx` gateway | 200 | 200 |
| `GroupwareAdminController` | 4 | `GET /admin/groupware/approvals/approver-search` gateway/direct | 200 | 200 |

30개 method 전체의 annotation과 실행 구현을 정적 확인했다. `DepartmentAspect` line 30의 `X-User-Role`은 deny 메트릭/메시지의 role label을 추출할 뿐 허용 판정에 쓰지 않는다. 실제 판정은 `hr.isExecutiveOffice()`이며, `X-User-Department` claim이 있으면 role 헤더와 무관하다.

같은 MASTER 그룹이어도 `departmentName` 미배정 계정은 위 4개 조회 경로에서 403이었고, 대표실 claim이 있는 `dev_master`는 role 헤더 없이 200이었다. 이것은 실패 폐쇄 계약이며 role 헤더 복원 근거가 아니다.

### 기타 `X-User-Role` 참조전수

- Samhan 공통 `HeaderAuthenticationFilter`들은 `X-User-Id` 단독으로 인증을 성립시키고 groups authority를 추가한다.
- 일반 Samhan `PermissionAspect`는 account/groups + `X-Is-System-Master`를 쓴다. `X-User-Role`은 arologis 독립 JWT의 `roleBasedEnforcement=true` 분기에만 사용한다.
- 일부 controller에 남은 optional role parameter는 미사용이거나 null일 때 건너뛰는 점진 이전 guard였다. 라이브 MASTER 정상 경로와 게이트웨이 smoke를 role 없이 통과했다.
- 현재 diff에 `services/`, `shared/`, `clients/`, gateway 제품 코드 변경은 0건이다. Desktop/mobile은 운영 PowerShell 스크립트를 import/호출하지 않는다.
- Inventory → Product internal-token 호출은 실제 product-service 응답까지 도달했다. 연결/내부 토큰 문제가 아니라 응답 건수 불일치였다.

### `seed-local-stack.ps1` 실실행

Windows PowerShell 5.1의 기존 UTF-8 no-BOM 파싱 문제를 회피하기 위해 파일을 수정하지 않고 UTF-8 scriptblock으로 같은 원문을 실행했다. 자격값과 시드 평문 리터럴은 출력에서 제거했다.

```text
기본 AuthBaseUrl (gateway /api/auth)  register 403
direct auth-service override             사용자 5건 생성 성공
direct 성공 후                       health 8086의 404로 exit 1
```

Direct auth 실행에서 새 identity claim 헤더만으로 실제 시드 5건이 생성됐다. 따라서 role 헤더 제거가 register를 막지 않는다. 스크립트 실행으로만 생성했고 DB 직접 변경은 하지 않았다.

다만 기본 URL은 gateway의 public `/api/auth/**` route로 들어가 `StripInboundIdentityHeaders`가 identity를 전부 제거한 뒤 register를 호출하므로 403이다. 또한 post-seed health는 실제 host mapping/override를 무시하고 8086, 8088 등을 하드코딩해 시드 생성 후에도 완주하지 못했다. 둘 다 이 PR diff의 role 변경 전부터 있던 별개 문제다.

### `import-notion-csv.ps1` 실실행

추적 외 임시 디렉터리에 importer가 요구하는 최소 헤더만 가진 0-row CSV 4종을 만들어 실제 multipart를 호출했다.

```text
REGION  200 / inserted=0 / updated=0 / rejected=0
DC      200 / inserted=0 / updated=0 / rejected=0
CHAT    200 / inserted=0 / updated=0 / rejected=0
BLOCK   200 / inserted=0 / updated=0 / rejected=0
종합     4/4 OK / exit 0
```

DC import는 `@RequireDepartment(EXECUTIVE_OFFICE)` + `@RequirePermission(CREATE)`를 role 헤더 없이 실제 통과했다. 임시 CSV 4종과 디렉터리는 실행 즉시 삭제했다.

## ③ 권한 경계 + identity 헤더 위조

부서 가드와 분리해 groups/MASTER bypass 자체를 검증하기 위해 `/auth/admin/permissions/accounts`를 사용했다.

```text
무토큰                  401
위조 토큰               401
권한 없는 계정          403
MASTER                   200

무토큰 + identity 전체 위조  401
위조 토큰 + identity 전체 위조 401
권한 없는 계정 + identity 전체 위조 403
```

`전체 위조`는 `X-Is-System-Master=true`, MASTER groups, MASTER user id, `X-User-Role=MASTER`, `X-User-Department=대표실`을 동시에 넣은 것이다. Gateway `JwtAuthenticationGatewayFilterFactory` line 225~245가 `INBOUND_IDENTITY_HEADERS`를 모두 remove한 뒤 서명 검증된 JWT claim으로만 재주입한다. 라이브 응답이 이 계약과 일치했다.

## ④ S2 결함 5건과 도달 경로

| # | 결함 | 도달 경로 | PR role 변경 관련 |
|---:|---|---|---|
| 1 | Inventory/Product 참조 불일치 | gateway → `StockController.balances` → `StockService.findBalancePage` → `ProductClient.lookup` → 100 요청/1 응답 → 404 `NOT_FOUND` | 무관 |
| 2 | Smoke가 모든 404를 `PATH_404`로 잘못 분류 | `run-smoke-tests.ps1:296~303` 상태코드만 보고 body `code=NOT_FOUND`를 버림 | 무관, 기존 |
| 3 | PowerShell 5.1에서 단일 endpoint fail 건수가 null | `run-smoke-tests.ps1:318` — 단일 `PSCustomObject` pipeline 결과의 `.Count` → null, 실제 7/8을 8/8로 출력 | 무관, 기존 |
| 4 | Seed 기본 register가 public auth route에서 identity strip | `seed-local-stack.ps1` default `/api/auth/register` → gateway `auth-service` route → `StripInboundIdentityHeaders` → `@RequirePermission` 403 | 무관, 기존 |
| 5 | Seed post-check가 실제 port mapping을 무시 | 사용자 5건 생성 → hardcoded `http://localhost:8086/actuator/health` → 404 → exit 1 | 무관, 기존 |

Dashboard 미기동, groupware 미기동, host port override가 현재 shell에 없어 smoke health가 slip/partner-order를 DOWN으로 보고한 것은 이 라운드의 코드 결함 수에 추가하지 않았다. 다만 #5와 같이 스크립트가 현 배치를 따라가지 못하는 지점은 별도 결함으로 세었다.

## 검증 명령

```text
node --test scripts/lib/qa-operational-validation-contract.test.cjs
  2 pass / 0 fail

gradlew --no-daemon
  :shared:security:test
    PermissionAspectTest
    DepartmentAspectTest
  :services:api-gateway:test
    JwtAuthenticationGatewayFilterFactoryTest
    StripInboundIdentityHeadersGatewayFilterFactoryTest
  BUILD SUCCESSFUL

import-notion-csv.ps1 실 multipart
  4/4 200 / exit 0

권한 경계 라이브
  401/401/403/200
  위조 후 401/401/403
```

## 본 범위와 안 본 범위

### 본 범위

- exact HEAD/diff, Docker/Eureka/health 기준선
- 남은 inventory/dashboard 2건의 route/controller/service 도달
- role 헤더 유무 대조
- 부서 가드 30 method 정적 전수 + 5 controller 라이브 대표
- seed 실실행, Notion import 4종 실 multipart
- 권한 경계와 identity 헤더 위조
- gateway/header filter 계약 테스트
- product 코드 미변경을 통한 desktop/mobile 영향 경계

### 안 본 범위

- SSE stream timeout
- `scripts/seed-local-stack.ps1:70~74` 평문 리터럴 5건
- 데이터 오염을 피하기 위한 부서 가드 write/delete/restore 30 method의 실 mutation 전수
- Desktop/mobile GUI 창 기동. 사용자 게임 중 지시를 따라 창을 띄우지 않았고 동일 gateway API 계약을 headless로 검증했다.
- 코드 수정, container rebuild, commit, push

## 새 파일 목록

- `docs/dev-reports/2026-08-07-1113-s2-reconvergence-and-live-qa.md`

임시 0-row CSV 4종은 즉시 삭제했으며 최종 worktree에 남지 않았다.
