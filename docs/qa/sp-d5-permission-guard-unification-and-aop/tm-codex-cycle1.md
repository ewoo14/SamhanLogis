# 🟢 Codex TM 5-Section Cross-Check Review — SP-D5 Cycle 1

**HEAD**: `ee793327814bc96930804efdf0e51283b5044915`
**PR**: #247

## 종합 판정: FIX 요청

### A. BE 5-team 발견

**P0 — AOP가 실제 service `DynamicPermissionClientImpl`을 못 잡아 `@RequirePermission`이 사실상 no-op 가능**
`shared/security/src/main/java/com/samhanair/logis/security/permission/PermissionAspect.java:59,95`
`services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/DynamicPermissionClient.java:10-11`
`services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/DynamicPermissionClientImpl.java:32`
Aspect는 shared `com.samhanair.logis.security.permission.DynamicPermissionClient`를 `ObjectProvider`로 찾지만, 8개 service impl은 여전히 각 service 로컬 deprecated interface를 구현합니다. 로컬 interface도 shared interface를 `extends`하지 않습니다. 결과적으로 `clientProvider.getIfAvailable()`이 null이 되어 line 96-99 경로로 권한 검증을 건너뛸 수 있습니다.
권장 fix: 8개 deprecated interface가 shared interface를 `extends`하게 하거나, 8개 impl의 `implements`를 shared interface로 즉시 전환. accounting IT의 `@MockBean`도 shared interface 기준으로 추가/전환해야 합니다.

**P1 — 시범 10 endpoint의 `@PreAuthorize → @RequirePermission` 전환 요구 미충족**
`services/accounting-service/src/main/java/com/samhanair/logis/accounting/report/BalanceSheetController.java:64-65` 외 9개 report controller
10개 endpoint 모두 `@PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")`가 남아 있고 `@RequirePermission`이 추가된 상태입니다. Scope의 "@PreAuthorize → @RequirePermission 전환", 리뷰 항목의 "@PreAuthorize 완전 제거"와 불일치합니다.
권장 fix: 10개 report endpoint에서 `@PreAuthorize` import/annotation 제거. 단, P0 해결 전 제거하면 권한이 열리므로 P0 먼저 수정 필요.

**P1 — AutoConfiguration 조건부 scope가 `@Component`로 무력화될 수 있음**
`PermissionAspect.java:50-51`, `PermissionGuardMetrics.java:27`, `PermissionSecurityAutoConfiguration.java:44-64`
AutoConfiguration은 `@ConditionalOnBean(MeterRegistry.class)`로 조건부 등록하지만 대상 클래스 자체에 `@Component`가 붙어 있습니다. consumer service의 component scan 범위에 shared package가 포함되면 conditional을 우회해 직접 등록됩니다.
권장 fix: `PermissionAspect`, `PermissionGuardMetrics`에서 `@Component` 제거하고 auto-configuration bean 등록만 유지.

**P2 — 테스트 누락**
`shared/security/src/test/java/.../PermissionAspectTest.java`는 단일 mock provider 중심입니다. 실제 service impl이 shared interface bean으로 노출되는지, 다중 bean/미노출 bean 분기, `AccessDeniedException` message content 검증이 없습니다. P0를 잡지 못한 원인입니다.

### B. FE

FE 변경 0은 정상입니다. API path 변경도 diff상 보이지 않습니다. accounting `GlobalExceptionHandler`는 `AccessDeniedException`을 `ApiResponse.fail(FORBIDDEN, ex.getMessage())`로 감싸므로 envelope 자체는 호환됩니다. 다만 P0 때문에 AOP 403 경로가 실제로 발화하지 않을 수 있어 `PermissionMatrixPage`/`usePermissions` 회귀보다 BE 권한 적용 실패가 우선 리스크입니다.

### C. Designer

4개 문서 범위는 존재하고 metrics tag(`service/page/role/action`)는 BE Counter tag와 일치합니다. 인쇄 양식 6종 영향 0 판단도 변경 범위상 타당합니다.
P2: `git diff --check main...HEAD`에서 design/QA markdown 다수 trailing whitespace가 검출되었습니다. 머지 전 정리 권장.

### D. QA

Q1~Q6 문서와 Counter query는 방향이 맞지만, 현재 테스트는 실제 accounting context에서 shared `DynamicPermissionClient` bean이 잡히는지 검증하지 못합니다. 기존 accounting IT들은 `com.samhanair.logis.accounting.client.DynamicPermissionClient`를 mock하고 있어 P0 경로를 놓칩니다.
권장 fix: report 10 endpoint용 SpringBootTest/WebMvcTest에 shared interface `@MockBean` 또는 실제 impl shared 노출 검증을 추가하고, deny 시 Counter 증가 + 403 envelope를 함께 검증.

### E. DevOps

`shared/security/build.gradle`의 `spring-aop`, `aspectjweaver`, `micrometer-core` 의존성은 의도와 맞습니다. Grafana PromQL은 `permission_guard_denied_total{service,page,role,action}` tag와 대체로 일치합니다. Prometheus scrape 대상은 17 service/job에 `/actuator/prometheus`가 설정되어 있습니다.
JSON 구조 검증은 PowerShell/파이썬 실행 정책 차단으로 도구 검증하지 못했습니다. CI `paths-ignore`의 `infrastructure/grafana/**` 추가는 Grafana-only 변경 skip 의도에는 맞지만, 이번 PR처럼 BE와 함께 변경되면 CI는 계속 실행됩니다.

### F. 한국어 boundary

한국어 Javadoc/문서 방향은 충족합니다. UUID 사용자 노출 신규 경로는 보이지 않습니다. Samhan Public / 아로로지스 명칭도 문서에서 일관 사용됩니다. 단 일부 콘솔 출력에서 인코딩이 깨져 보였으므로 파일 자체 UTF-8은 별도 CI/리뷰 환경에서 확인 권장입니다.

### G. 머지 판단

머지 보류입니다. P0는 SP-D5 핵심 목표인 AOP 권한 검증을 무력화할 수 있고, P1은 전환 범위 요구와 다릅니다. 최소 수정 순서는 1. shared interface bean 호환성 확보, 2. 10 endpoint `@PreAuthorize` 제거 여부 확정 및 반영, 3. 실제 accounting endpoint deny + Counter 증가 IT 추가입니다.

Codex TM — 2026-05-19
