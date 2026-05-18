# SP-D5 QA Cycle 1 — Claude QA Agent 리뷰

> 작성일: 2026-05-19
> 담당: QA Agent (Claude)
> 브랜치: feat/sp-d5-permission-guard-unification-and-aop

---

## 총평

시나리오 plan 6건과 도메인 정합성 SQL 10건의 구조는 전반적으로 충실하다.
AOP 핵심 단위 테스트(`PermissionAspectTest`)와 accounting-service `AccountingDynamicPermissionIT`의 `@MockBean DynamicPermissionClient` lenient stub 패턴은 메모리 가드(`feedback_it_mockbean_external_clients`)를 준수하고 있다.
단, 아래 3건의 결함이 발견되었다.

---

## 결함 목록

### [D1] P0 — service 태그 불일치: `resolveServiceName` 패키지 추론 vs `spring.application.name`

**위치**: `shared/security/.../PermissionAspect.java` — `resolveServiceName()` 메서드

**현상**: `resolveServiceName`은 Controller 클래스 패키지에서 `com.samhanair.logis.<service>.*` 규칙으로 서비스 이름을 추론한다. `BalanceSheetController` 패키지는 `com.samhanair.logis.accounting.report` 이므로 추론 결과는 `"accounting"`이다. 그러나 `services/accounting-service/src/main/resources/application.yml`의 `spring.application.name`은 `accounting-service`이다. 동일하게 `slip-service`, `user-service`도 `spring.application.name`에 `-service` 접미사가 붙어 있으나, 패키지 추론은 `"slip"`, `"user"`를 반환한다.

**영향**: Prometheus Counter 레이블 `service="accounting"` 이 실제 서비스명 `accounting-service`와 불일치한다. 시나리오 Q2/Q4의 Counter 검증 SQL (domain-integrity-check.md 4번 항목)도 `service="accounting-service"` 기준으로 기재되어 있어 실제 메트릭과 불일치가 발생한다.

**판정**: P0 — Grafana/CloudWatch 대시보드의 service 태그 기준이 깨진다.

**수정 방향**: `resolveServiceName`에서 패키지 기반 추론 대신 `Environment` 빈을 주입하여 `spring.application.name`을 직접 읽거나, `PermissionAspect` 생성자에 `@Value("${spring.application.name}")` 파라미터를 추가하는 방식을 권장한다.

---

### [D2] P1 — `PermissionAspectTest` 헬퍼가 실제 AOP `checkPermission`을 우회

**위치**: `shared/security/.../PermissionAspectTest.java` — `PermissionAspectTestHelper` inner class

**현상**: 단위 테스트가 `PermissionAspect.checkPermission()` (AOP Around 어드바이스)을 직접 호출하지 않고, 내부 헬퍼(`evaluateViewPermission`, `evaluateEditPermission`, `evaluateAndThrowIfDenied`)가 분기 로직을 별도로 재구현한 후 리플렉션으로 `metrics` 필드에 접근하여 increment를 호출한다. 즉, 실제 `checkPermission` 메서드 코드 경로와 헬퍼 내 재구현 코드 경로가 분리되어 있어, `checkPermission` 내부 로직이 변경되어도 테스트가 통과할 수 있다 (false green 위험).

**영향**: `extractRoleCode`, `resolveServiceName`, `client == null` 건너뜀 분기 등 실제 AOP 메서드의 핵심 경로가 이 테스트에서 검증되지 않는다.

**판정**: P1 — 단위 테스트 검증 신뢰도 저하. `@SpringBootTest` IT가 없으면 AOP 경로 누락 가능.

**수정 방향**: `PermissionAspect.checkPermission(ProceedingJoinPoint)` 을 직접 호출하는 슬라이스 테스트(`@WebMvcTest` + `@Import(PermissionAspect.class)`)로 대체하거나, `checkPermission` 의 핵심 분기를 `package-private` 메서드로 추출하여 직접 테스트한다.

---

### [D3] P1 — `TrialBalanceControllerIT` 및 `ReportValidationSeedIT`: `@RequirePermission` AOP 전환 후 lenient stub `canView=true` 부재

**위치**: `services/accounting-service/src/test/.../TrialBalanceControllerIT.java`, `ReportValidationSeedIT.java`

**현상**: 두 IT 클래스 모두 `@MockBean DynamicPermissionClient`는 선언되어 있으나, `@BeforeEach` lenient stub (`canView/canEdit = true`) 설정이 없다. SP-D5에서 `TrialBalanceReportController`에 `@RequirePermission(page = "accounting.reports", action = "VIEW")`가 추가됨에 따라, stub 없는 MockBean의 `canView` 기본 반환값은 `false`이다. AOP가 `canView=false`를 확인하면 `AccessDeniedException`을 throw하므로, 기존 IT가 403으로 깨질 수 있다.

`TrialBalanceControllerIT`는 `GET /api/v1/accounting/reports/trial-balance` 등을 호출하며, `ReportValidationSeedIT`는 MockMvc를 직접 사용하지 않으므로 즉각 영향권은 아니나, 다른 IT 클래스 컨텍스트 공유 시 위험이 존재한다.

`AccountingDynamicPermissionIT`는 `@BeforeEach lenient stub`이 올바르게 설정되어 있어 기준 패턴 준수이다.

**판정**: P1 — `TrialBalanceControllerIT`는 SP-D5 AOP 전환 후 회귀 가능성 높음.

**수정 방향**: `TrialBalanceControllerIT`에 `@BeforeEach` 추가하여 `lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true)` stub 설정 필수.

---

## 항목별 검토 요약

| 검증 항목 | 판정 | 비고 |
|-----------|------|------|
| Q1/Q2 Counter 증가 검증 — IT 존재 여부 | 미흡 | `PermissionAspectTest`가 실제 AOP 우회 (D2). `@SpringBootTest` 기반 Counter IT 미작성 |
| Q3/Q4 `verify(canView, never())` 패턴 | 정합 | 시나리오 plan 기술 정확. 실제 IT 구현 시 적용 권장 |
| Q5 SP-D1~D4 기존 IT 회귀 — lenient stub | 부분 결함 | accounting-service `TrialBalanceControllerIT` stub 누락 (D3) |
| Q6 잔여 `@PreAuthorize` grep count | 계획 정확 | baseline 503건, 기대 잔존 ~478건 기술 적절 |
| domain-integrity-check SQL 1~10 | 정합 | `accounting.reports` PAGE_CODE 확인. SQL 논리 정확 |
| service 태그 ↔ spring.application.name | 불일치 | `resolveServiceName` 패키지 추론 = "accounting", 실제 = "accounting-service" (D1) |
| sidebar-no-impact.md 정책 유지 | 정합 | FE 파일 변경 0건 기술 정확 |
| `@RequirePermission` action 두 종류 | 정합 | services/ 전체 `action="VIEW"` 10건만 존재, EDIT 없음 |
| `checkView/checkEdit` 직접 호출 잔존 | 정합 | report 패키지 10개 controller: `ReportPermissionGuard.checkView` 직접 호출 제거 확인 |

---

## 판정

FIX 요청

- D1 (P0): `PermissionAspect.resolveServiceName` `spring.application.name` 기반으로 수정
- D2 (P1): `PermissionAspectTest` 실제 AOP 경로 직접 검증으로 대체
- D3 (P1): `TrialBalanceControllerIT` `@BeforeEach lenient stub` 추가

Cycle 2 에서 D1~D3 수정 확인 후 재검토.
