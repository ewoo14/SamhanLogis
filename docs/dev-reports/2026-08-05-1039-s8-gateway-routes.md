# S8 게이트웨이 라우트 누락 조사·수정 보고서

## ① 작업 위치

- 워크트리: `C:/dev/Samhan-Public/.claude/worktrees/t1039`
- 브랜치: `feat/1039-provisional-dispatch`
- 시작 HEAD: `fccb7f7075c6831d9d13f87fdfb629163d883909`
- 범위: S8 게이트웨이 라우트 전수 대조 및 누락 수정
- 제한: 컨테이너 재배포, 다른 서비스 조작, commit/push 금지

## ② 컨트롤러 매핑 ↔ 게이트웨이 Path 대조표

S1~S4 커밋의 신규 컨트롤러 매핑과 관련 client 호출을 전수 대조했다.

| 슬라이스 | 컨트롤러/호출 | 실제 매핑 | Gateway 대조 결과 | 방식 |
|---|---|---|---|---|
| S1 | `DispatchGroupAdminController` | `/admin/dispatch-groups` + 하위 전체 (`/{groupNo}`, `/{groupNo}/carrier/**`, `/{groupNo}/slips/**`, `/{groupNo}/transfer`) | `slip-dispatch-admin-noprefix`에 `/admin/dispatch-groups`, `/admin/dispatch-groups/**` 추가 | gateway `:8080` → slip-service, no-strip + JWT |
| S1 | `CarrierAdminController` | `/admin/carriers` + `/{code}` | `slip-dispatch-admin-noprefix`에 `/admin/carriers`, `/admin/carriers/**` 추가 | gateway `:8080` → slip-service, no-strip + JWT |
| S2 | `PreClassifyAdminController` | `GET /admin/dispatches/pre-classify` | `slip-dispatch-admin-noprefix`에 정확 경로 추가 | gateway `:8080` → slip-service, no-strip + JWT |
| S2 | `ArologisPreClassifySupportClient` | `GET /internal/arologis/preclassify-support` | Gateway 대상 아님. `http://arologis-service` LoadBalancer 직접 호출 + `X-Internal-Token` | service discovery 직접 호출 |
| S4 | `DispatchGroupAdminController.transfer` | `POST /admin/dispatch-groups/{groupNo}/transfer` | S1의 `/admin/dispatch-groups/**`에 포함 | gateway `:8080` → slip-service |
| S4 | `ReceivedDispatchGroupController.list` | `GET /admin/arologis/dispatch-groups` | 기존 `arologis-service-noprefix`의 `/admin/arologis/**`에 포함 | gateway `:8080` → arologis-service, JWT |
| S4 | `ReceivedDispatchGroupController.receive` / `ArologisDispatchGroupClient` | `POST /internal/arologis/dispatch-groups` | Gateway 대상 아님. client가 `http://arologis-service` LoadBalancer 직접 호출 | service discovery 직접 호출 + `X-Internal-Token` |
| S4 | `ArologisInternalController` | `/internal/arologis/preclassify-support`, `/internal/arologis/dispatches/**`, `/internal/arologis/insung/**` | Gateway 대상 아님. 서비스 간 internal 호출 계약 | service discovery/internal token |

아로로지스 자체 user-facing 신규/이전 admin 경로(`/admin/arologis/**`)는 기존 catch-all 라우트가 전체를 포함한다. `:8097` 직접 노출은 아로로지스 자체 운영/직접 호출 경로이고, 삼한 데스크톱의 수신 조회는 gateway의 기존 `/admin/arologis/**` 라우트를 사용한다.

## ③ 추가한 라우트와 배치 위치·근거

별도 route id를 만들지 않고 기존 `slip-dispatch-admin-noprefix`의 Path predicate에 아래 5개를 추가했다.

```yaml
/admin/dispatch-groups
/admin/dispatch-groups/**
/admin/carriers
/admin/carriers/**
/admin/dispatches/pre-classify
```

배치 위치는 기존 `/admin/dispatch-tasks`, `/admin/dispatch-board`, `/admin/external-*`, `/admin/slip-cutoffs`가 있는 slip-service no-prefix 블록이다. 모든 기존 필터를 유지했다.

```yaml
uri: lb://slip-service
filters:
  - JwtAuthentication
```

컨트롤러가 풀패스 `/admin/...`를 보유하므로 `StripPrefix`를 추가하지 않았다.

## ④ 기존 라우트 무영향 및 새 조합 열거

- `/admin/slips/**` → `slip-service-admin` 유지. 신규 경로와 prefix가 겹치지 않는다.
- `/admin/accounting/**` → `accounting-admin-noprefix` 유지. 신규 경로와 prefix가 겹치지 않는다.
- `/admin/sales-slips/**`, `/admin/purchase-slips/**`, `/admin/tax-invoices/**` → 기존 accounting 라우트 유지.
- `/admin/dispatch-tasks/**`, `/admin/dispatch-board/**`, `/admin/external-carriers/**`, `/admin/external-dispatches/**`, `/admin/slip-cutoffs/**` → 동일 route id에 경로만 추가했으며 기존 predicate/filter는 변경하지 않았다.
- `/admin/arologis/**` → 기존 `arologis-service-noprefix` 유지. `/admin/dispatch-groups/**`·`/admin/carriers/**`·`/admin/dispatches/pre-classify`와 겹치지 않는다.
- `/admin/**` generic catch-all route는 존재하지 않으므로 신규 경로가 가리는 기존 generic admin route가 없다.
- 선언 순서: `slip-service-admin`(기존 `/admin/slips/**`) → `slip-dispatch-admin-noprefix` → `arologis-service-noprefix`. 신규 경로는 앞뒤 기존 route와 겹치지 않으며 테스트에서 순서를 확인했다.

## ⑤ Config Audit Guard가 못 잡은 이유

`.github/workflows/ci.yml`의 `Config Audit Guard (다운스트림 URL/포트 정합, #745)`는 `infrastructure/scripts/validate-config-audit.ps1`를 실행한다. 이 스크립트는 `SAMHAN_*_SERVICE_URL`, `samhan.*-service.url`, compose `SERVER_PORT`/포트 매핑, Aligo URL, fail-mode의 **다운스트림 URL·포트 정합**만 검사한다. Gateway `application.yml`의 `Path` predicate와 각 서비스 컨트롤러 `@RequestMapping`의 완전성·누락·우선순위는 검사하지 않는다. 따라서 CI가 통과한 것은 URL/포트 계약이 통과했다는 뜻이며, 이번 404 라우트 누락은 검사 범위 밖이었다.

## ⑥ RED 원문

```text
RED-A1  게이트웨이 :8080 경유로 /admin/carriers 가 200 을 준다
RED-A2  게이트웨이 :8080 경유로 /admin/dispatch-groups 가 200 을 준다
RED-B1  기존 /admin/slips/** · /admin/accounting/** 라우트가 그대로 동작한다
RED-B2  새 경로에 인증이 걸린다 (토큰 없이 부르면 거부)
```

## ⑦ 종료조건 검증

### 종료조건 1 — 새 조합 열거

명령:

```powershell
Get-Content services/api-gateway/src/main/resources/application.yml | Select-Object -Skip 590 -First 150
```

핵심 원문:

```text
- id: slip-service-admin
  predicates:
    - Path=/admin/slips/**
- id: accounting-admin-noprefix
  predicates:
    - Path=/admin/accounting/**
- id: accounting-sales-purchase-slip-admin-noprefix
  predicates:
    - Path=/admin/sales-slips,/admin/sales-slips/**,/admin/purchase-slips,/admin/purchase-slips/**
- id: accounting-tax-invoice-admin-noprefix
  predicates:
    - Path=/admin/tax-invoices,/admin/tax-invoices/**
- id: slip-dispatch-admin-noprefix
  predicates:
    - Path=/admin/dispatch-tasks,...,/admin/dispatch-groups,/admin/dispatch-groups/**,/admin/carriers,/admin/carriers/**,/admin/dispatches/pre-classify
```

신규 경로 조합(`/admin/dispatch-groups/**`, `/admin/carriers/**`, `/admin/dispatches/pre-classify`) 모두 기존 Path와 충돌하지 않음을 위 표와 테스트로 확인했다.

### 종료조건 2 — 참조 전수

명령:

```powershell
Get-ChildItem services/slip-service/src/main/java -Recurse -Filter '*.java' |
  Select-String -Pattern '@RequestMapping|@(Get|Post|Put|Patch|Delete)Mapping' |
  Where-Object { $_.Path -match 'dispatchgroup|preclassify|external' }
```

원문 요약:

```text
CarrierAdminController.java: @RequestMapping("/admin/carriers")
DispatchGroupAdminController.java: @RequestMapping("/admin/dispatch-groups")
PreClassifyAdminController.java: @RequestMapping("/admin/dispatches") + @GetMapping("/pre-classify")
ExternalCarrierAdminController.java: @RequestMapping("/admin/external-carriers") [기존 route 포함]
ExternalDispatchController.java: @RequestMapping("/admin/external-dispatches") [기존 route 포함]
```

아로로지스 수신/내부 호출까지 별도 대조했으며, user-facing 수신 조회는 기존 `/admin/arologis/**`, 내부 POST는 gateway 우회 service discovery로 판정했다.

### 종료조건 3 — 영향 테스트

RED 원문:

```text
> .\\gradlew.bat :services:api-gateway:test --tests com.samhanair.logis.gateway.it.ApiGatewayContextLoadIT.provisionalDispatchAdminRoutes_areAuthenticatedNoStripAndReachable
1 test completed, 1 failed
FAILURE: Build failed with an exception.
BUILD FAILED in 26s
```

GREEN 원문:

```text
> .\\gradlew.bat :services:api-gateway:test --tests com.samhanair.logis.gateway.it.ApiGatewayContextLoadIT.provisionalDispatchAdminRoutes_areAuthenticatedNoStripAndReachable
> Task :services:api-gateway:test
BUILD SUCCESSFUL in 15s
6 actionable tasks: 2 executed, 4 up-to-date
```

Gateway 전체 테스트 + Spring 컨텍스트 IT 포함:

```text
> .\\gradlew.bat :services:api-gateway:test
> Task :services:api-gateway:test
BUILD SUCCESSFUL in 15s
6 actionable tasks: 1 executed, 5 up-to-date
```

관련 slip 테스트:

```text
> .\\gradlew.bat :services:slip-service:test --tests com.samhanair.logis.slip.service.preclassify.PreClassifyAdminControllerTest --tests com.samhanair.logis.slip.it.dispatchgroup.DispatchGroupContextIT
> Task :services:slip-service:test
BUILD SUCCESSFUL in 28s
18 actionable tasks: 1 executed, 17 up-to-date
```

Config Audit Guard:

```text
> & ./infrastructure/scripts/validate-config-audit.ps1 -Detailed
...
config-audit validation passed: 158 URL/template checks
```

로컬에는 `pwsh` 명령이 없어 CI와 동일한 호출은 실행할 수 없었고, Windows PowerShell로 같은 스크립트를 실행했다. 종료 코드는 0이었다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-05-1039-s8-gateway-routes.md`

기존 사용자 산출물인 `docs/dev-reports/2026-08-05-1039-live-qa-s7.md`, `docs/qa/1039-live-qa-real-qa/`는 변경하지 않았다.
