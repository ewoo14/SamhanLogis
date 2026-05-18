# SP-D5 PermissionGuard 단일화 인프라 + Counter.builder 실 구현 + AOP 통합

## 1. 변경 요약 (BE)

SP-D1~D4 에서 각 service 에 분산 정의되었던 PermissionGuard/DynamicPermissionClient 를
`shared:security` 모듈 공통 인프라로 통합하는 SP-D5 슬라이스.

### 신규 파일 (shared:security)

| 파일 | 역할 |
|---|---|
| `permission/DynamicPermissionClient.java` | 8개 service 공통 interface 일원화 |
| `permission/RequirePermission.java` | AOP 권한 검증 어노테이션 (`@Target(METHOD)`) |
| `permission/PermissionAspect.java` | `@Around` AOP 인터셉터 — X-User-Role 헤더 추출 + canView/canEdit 검증 + deny 시 AccessDeniedException |
| `permission/PermissionGuardMetrics.java` | `permission_guard_denied_total` Micrometer Counter |
| `permission/PermissionSecurityAutoConfiguration.java` | Spring 자동 설정 (`@EnableAspectJAutoProxy` + bean 등록) |

### AutoConfiguration.imports 업데이트

```
com.samhanair.logis.security.InternalSecurityAutoConfiguration
com.samhanair.logis.security.permission.PermissionSecurityAutoConfiguration
```

### shared:security build.gradle 의존성 추가

- `io.micrometer:micrometer-core` (Counter)
- `org.springframework:spring-aop` + `org.aspectj:aspectjweaver` (AOP)
- testImplementation: `spring-boot-starter-aop`, `micrometer-registry-prometheus`

### 기존 interface @Deprecated 처리 (8개 service)

accounting / arologis / inventory / notification / partner-order / partner / product / slip / user service 의 `DynamicPermissionClient.java` 에
`@Deprecated(since = "SP-D5", forRemoval = false)` 추가.
구현체(impl) 는 RestClient baseUrl 설정 차이로 각 service 에 유지.
SP-D6+ 에 impl 의 `implements` 대상을 공통 interface 로 교체 예정.

## 2. 영향 범위

| 팀 | 영향 |
|---|---|
| FE | 없음 (API 응답 변경 0, HTTP status 변경 0) |
| Designer | 없음 |
| QA | `permission_guard_denied_total` metric 존재 확인 가능 (`/actuator/prometheus`) |
| DevOps | Prometheus metric 신규 추가 — CloudWatch/Grafana 대시보드 신규 metric 반영 필요 (Phase 11) |

## 3. 시범 마이그레이션 10 endpoint 목록

accounting-service `report` 패키지 10개 Controller 의
`reportPermissionGuard.checkView(roleHeader)` 직접 호출 제거 + `@RequirePermission(page="accounting.reports", action="VIEW")` 부착.

| Controller | HTTP Method | 경로 | page code | action |
|---|---|---|---|---|
| BalanceSheetController | GET | /api/v1/accounting/reports/balance-sheet | accounting.reports | VIEW |
| CashFlowStatementController | GET | /api/v1/accounting/reports/cash-flow | accounting.reports | VIEW |
| CorporateTaxReportController | GET | /api/v1/accounting/reports/corporate-tax | accounting.reports | VIEW |
| DailySummaryController | GET | /api/v1/accounting/reports/daily-summary | accounting.reports | VIEW |
| EquityChangesController | GET | /api/v1/accounting/reports/equity-changes | accounting.reports | VIEW |
| IncomeStatementController | GET | /api/v1/accounting/reports/income-statement | accounting.reports | VIEW |
| MonthlySummaryController | GET | /api/v1/accounting/reports/monthly-summary | accounting.reports | VIEW |
| PartnerAgingController | GET | /api/v1/accounting/reports/partner-aging | accounting.reports | VIEW |
| TrialBalanceReportController | GET | /api/v1/accounting/reports/trial-balance | accounting.reports | VIEW |
| VatReportController | GET | /api/v1/accounting/reports/vat | accounting.reports | VIEW |

각 Controller 에서 `ReportPermissionGuard` 필드(`reportPermissionGuard`) 제거 완료.
`@PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")` 는 유지 (이중 가드 정책 일관).

## 4. 검증 결과

### 단위 테스트 (shared:security)

| 테스트 클래스 | 케이스 수 | 결과 |
|---|---|---|
| PermissionGuardMetricsTest | 5 | PASS |
| PermissionAspectTest | 7 | PASS |
| InternalTokenFilterTest (기존) | - | PASS |
| InternalTokenGuardTest (기존) | - | PASS |

### 컴파일 검증

```
./gradlew :shared:security:compileJava                       → BUILD SUCCESSFUL
./gradlew :services:accounting-service:compileJava           → BUILD SUCCESSFUL
./gradlew :services:arologis-service:compileJava             → BUILD SUCCESSFUL
./gradlew :services:inventory-service:compileJava            → BUILD SUCCESSFUL
./gradlew :services:notification-service:compileJava         → BUILD SUCCESSFUL
./gradlew :services:partner-order-service:compileJava        → BUILD SUCCESSFUL
./gradlew :services:partner-service:compileJava              → BUILD SUCCESSFUL
./gradlew :services:product-service:compileJava              → BUILD SUCCESSFUL
./gradlew :services:slip-service:compileJava                 → BUILD SUCCESSFUL
./gradlew :services:user-service:compileJava                 → BUILD SUCCESSFUL
./gradlew :services:accounting-service:compileTestJava       → BUILD SUCCESSFUL
```

## 5. SP-D6+ 이연 (잔여 미마이그레이션)

### 잔여 checkView/checkEdit 직접 호출 (SP-D5 미마이그레이션)

| Service | 잔여 호출 수 (대략) |
|---|---|
| arologis-service | ~30 (ArologisAdminController, RegionAdminController) |
| inventory-service | ~7 (WarehouseController) |
| partner-order-service | ~7 (VendorOrderController, PartnerOrderConfirmController, HistoryController, ListController, PrintController) |
| partner-service | ~9 (PartnerAdminController, PartnerBlockAdminController, PartnerEditRequestController) |
| product-service | ~4 (ProductController) |
| slip-service | ~2 (EstimateController) |
| user-service | ~2 (EmployeeController) |

### 잔여 @PreAuthorize (전체 마이그레이션 미완)

SP-D1~D5 기준 마이그레이션 완료: ~10 endpoint (accounting.reports)
잔여 @PreAuthorize: ~491개 (14 service 전체 미마이그레이션 endpoint)

SP-D6+ 에서 위 잔여 service 의 직접 호출을 `@RequirePermission` annotation 으로 교체.
DynamicPermissionClientImpl 의 implements 타입을 service 별 interface → 공통 interface 로 교체.

## 6. PermissionAspect 동작 세부 사양

### X-User-Role 추출 순서
1. `@RequestHeader("X-User-Role")` 파라미터 (Java reflection 으로 탐색)
2. `RequestContextHolder` → `HttpServletRequest.getHeader("X-User-Role")`
3. null → 건너뜀 (PermissionGuard 와 동일 정책)

### deny 정책
- `action="VIEW"`: `canView(roleCode, page) == false` → deny
- `action="EDIT"`: `canEdit == false` + `canView == true` → deny (view-only override); `canEdit == false` + `canView == false` → fallback 통과

### DynamicPermissionClient 미존재 처리
- `ObjectProvider<DynamicPermissionClient>.getIfAvailable()` 로 lazy 주입
- bean 없으면 권한 검증 건너뜀 (서비스 미지원 환경 호환)
