# SP-D5 PermissionGuard 단일화 + AOP — QA 시나리오 Plan

> 작성일: 2026-05-19
> 담당: QA Agent
> 브랜치: `feat/sp-d5-permission-guard-unification-and-aop`

---

## 슬라이스 개요

SP-D5 는 SP-D1~D4 에서 각 서비스 내부에 분산된 `*PermissionGuard.checkView/checkEdit` 직접 호출 방식을
`shared/security` 모듈 수준의 AOP(`PermissionAspect`) + 어노테이션(`@RequirePermission`) 으로 통합한다.

**핵심 변경**:
- `shared/security`: `DynamicPermissionClient` interface 통합, `@RequirePermission(page, action)` annotation, `PermissionAspect` (@Around AOP), `PermissionGuardMetrics` (Micrometer Counter)
- SP-D1~D4 에서 명시적 `checkView/checkEdit` 호출하던 ~25 endpoint 의 `@PreAuthorize` 제거 + `@RequirePermission` annotation 으로 대체
- 잔여 ~475 `@PreAuthorize` 는 SP-D5 범위 밖 (미변경 보존)
- FE/Designer 영향 0

**검증 핵심**:
- AOP allow/deny 분기 정확성 (VIEW / EDIT 각각)
- Micrometer Counter `permission_guard_denied_total` 증감 정합
- SP-D1~D4 기존 IT 회귀 없음
- 잔여 `@PreAuthorize` 미변경 보존

---

## 시나리오 Q1: AOP allow 분기 — 마이그레이션 endpoint VIEW 허용

**대상 endpoint**: `@RequirePermission(page="estimate", action="VIEW")` 어노테이션 적용 endpoint

**전제조건**:
- `DynamicPermissionClient` @MockBean 등록 (IT 환경)
- `canView("SALES_VIEWER", "estimate") = true` mock stub 설정
- X-User-Role=SALES_VIEWER 헤더 포함 요청

**단계**:
1. MockMvc `GET /slips/estimates` 요청 — `X-User-Role: SALES_VIEWER` 헤더 포함
2. `PermissionAspect.@Around` 인터셉트 — `@RequirePermission(page="estimate", action="VIEW")` 검출
3. `DynamicPermissionClient.canView("SALES_VIEWER", "estimate")` 호출 → `true` 반환
4. 요청 정상 위임 (proceed) → 200 OK 응답 확인
5. `/actuator/prometheus` 조회 — `permission_guard_denied_total{page="estimate", action="VIEW", role="SALES_VIEWER"}` 미증가 확인

**기대 결과**:
- HTTP 200 OK 반환
- `PermissionAspect` 로그: `[SecurityAspect] allow page=estimate action=VIEW role=SALES_VIEWER` (또는 유사)
- Counter `permission_guard_denied_total` 해당 레이블 값 0 (미증가)

**BE IT**: `@SpringBootTest` + `@MockBean DynamicPermissionClient` + lenient stub

---

## 시나리오 Q2: AOP deny 분기 — VIEW 권한 없음 403

**대상 endpoint**: Q1 동일 endpoint (`@RequirePermission(page="estimate", action="VIEW")`)

**전제조건**:
- X-User-Role=DRIVER 헤더 포함 (권한 없는 역할)
- `DynamicPermissionClient.canView("DRIVER", "estimate") = false` mock stub 설정

**단계**:
1. MockMvc `GET /slips/estimates` 요청 — `X-User-Role: DRIVER` 헤더 포함
2. `PermissionAspect.@Around` 인터셉트 — `canView("DRIVER", "estimate")` = `false` 판정
3. AOP 가 `AccessDeniedException` 던짐 (proceed 미호출)
4. 응답 HTTP 403 확인
5. 로그 `[SecurityAspect] deny` 출력 확인 (action 무관 공통 로그 패턴)
6. `/actuator/prometheus` 조회:
   ```
   permission_guard_denied_total{service="slip-service",page="estimate",role="DRIVER",action="VIEW"} 1
   ```

**기대 결과**:
- HTTP 403 Forbidden
- Counter `permission_guard_denied_total` — `page="estimate"`, `role="DRIVER"`, `action="VIEW"`, `service="slip-service"` 레이블 조합 값 정확히 1 증가
- `[SecurityAspect] deny` 로그 1건

**BE IT**: deny stub override (`Mockito.when(canView(...)).thenReturn(false)`) + `status().isForbidden()` assert

---

## 시나리오 Q3: AOP allow 분기 — EDIT 권한 있음 통과

**대상 endpoint**: `@RequirePermission(page="estimate", action="EDIT")` 어노테이션 적용 write endpoint

**전제조건**:
- X-User-Role=SALES_EDITOR 헤더 포함
- `DynamicPermissionClient.canEdit("SALES_EDITOR", "estimate") = true` mock stub

**단계**:
1. MockMvc `POST /slips/estimates` 요청 — `X-User-Role: SALES_EDITOR` 헤더 포함 + 유효 body
2. `PermissionAspect.@Around` 인터셉트 — action="EDIT" 분기 실행
3. `DynamicPermissionClient.canEdit("SALES_EDITOR", "estimate")` 호출 → `true` 반환
4. `canView` 호출 0회 확인 (EDIT 분기에서 canView 호출 불필요)
5. 요청 정상 위임 → 200 OK 또는 201 Created (403 아님 확인)

**기대 결과**:
- HTTP 200/201 (403 아님)
- `canView` MockBean 호출 0회 (`Mockito.verify(dynamicPermissionClient, never()).canView(...)`)
- Counter `permission_guard_denied_total` EDIT 레이블 값 미증가

**BE IT**: `@MockBean` + `verify(never()).canView(...)` assertion

---

## 시나리오 Q4: AOP deny 분기 — EDIT 권한 없음 403

**대상 endpoint**: Q3 동일 write endpoint (`@RequirePermission(page="estimate", action="EDIT")`)

**전제조건**:
- X-User-Role=SALES_VIEWER 헤더 포함 (읽기 전용 역할)
- `DynamicPermissionClient.canEdit("SALES_VIEWER", "estimate") = false` mock stub

**단계**:
1. MockMvc `POST /slips/estimates` 요청 — `X-User-Role: SALES_VIEWER` 헤더 포함
2. `PermissionAspect.@Around` 인터셉트 — `canEdit("SALES_VIEWER", "estimate")` = `false` 판정
3. AOP 가 `AccessDeniedException` 던짐 → HTTP 403
4. `/actuator/prometheus` 조회:
   ```
   permission_guard_denied_total{service="slip-service",page="estimate",role="SALES_VIEWER",action="EDIT"} 1
   ```

**기대 결과**:
- HTTP 403 Forbidden
- Counter `permission_guard_denied_total` — `action="EDIT"`, `role="SALES_VIEWER"` 레이블 값 정확히 1 증가
- `[SecurityAspect] deny` 로그 1건

---

## 시나리오 Q5: SP-D1~D4 기존 IT 회귀 없음

**검증 범위**: SP-D1~D4 에서 `@RequirePermission` 전환 대상이 된 ~25 endpoint 의 기존 SpringBootTest IT

**전제조건**:
- `@RequirePermission` 전환 완료 후 CI 빌드 실행
- 각 서비스 IT 클래스에 `@MockBean DynamicPermissionClient` + lenient stub 패턴 유지

**검증 항목**:

| 서비스 | IT 클래스 | 케이스 |
|--------|-----------|--------|
| slip-service | EstimatePermissionIT | C1 canView allow → 200 / C2 canView deny → 403 / C3 canEdit allow → 201 / C4 canEdit deny → 403 |
| user-service | EmployeePermissionIT | C1~C4 동일 4-case 패턴 |
| product-service | ProductPermissionIT | C1~C4 동일 4-case 패턴 |
| partner-service | PartnerAdminPermissionIT | C1~C4 동일 4-case 패턴 |
| partner-order-service | PartnerOrderListPermissionIT | C1~C4 동일 4-case 패턴 |
| inventory-service | WarehousePermissionIT | C1~C4 동일 4-case 패턴 |
| arologis-service | ArologisAdminPermissionIT | C1~C4 동일 4-case 패턴 |

**단계**:
1. `@MockBean DynamicPermissionClient` 존재 + `@BeforeEach lenient stub allow` 패턴 유지 확인
2. 각 IT 클래스 test 전체 실행 — PASS 상태 확인
3. deny override (`Mockito.when(...).thenReturn(false)`) C2/C4 케이스 정상 동작 확인
4. 기존 IT 에서 `checkView/checkEdit` 직접 호출 흔적이 AOP 인터셉트로 대체되어도 동일 결과 반환 확인

**기대 결과**:
- 전체 ~25 endpoint IT 케이스 GREEN
- SP-D4 cycle 1 QA 에서 발견된 D1 결함 (ArologisAdminPermissionIT 외부 client @MockBean 4종 누락) 수정 후 통과 확인
- `feedback_it_mockbean_external_clients.md` 가드 준수 — 외부 client 전체 @MockBean 격리

**false green 가드**:
- `|| true` 패턴 0건
- `@Disabled` / `Assumptions.assumeTrue(false)` 패턴 0건
- lenient stub 없는 `thenReturn(true)` 단독 사용 0건

---

## 시나리오 Q6: 잔여 @PreAuthorize 보존 회귀 검증

**검증 목적**: SP-D5 가 ~25 endpoint 의 `@PreAuthorize` 만 제거하고, 잔여 ~475 endpoint 의 `@PreAuthorize` 를 건드리지 않았음 확인

**전제조건**:
- SP-D4 머지 시점 기준 `@PreAuthorize` count baseline 확인
- SP-D5 PR 적용 후 count 재확인

**단계**:
1. SP-D5 PR 브랜치에서 전체 서비스 `@PreAuthorize` 개수 집계:
   ```
   grep -r "@PreAuthorize" services/ --include="*.java" | wc -l
   ```
2. 집계 결과와 SP-D4 baseline 대비 — 감소 수 = 마이그레이션된 endpoint 수 (~25) 와 일치 확인
3. 잔여 `@PreAuthorize` 가 SP-D5 수정 대상 파일 외 다른 파일에 존재하는지 확인

**기대 결과**:
- `@PreAuthorize` 감소 수 = `@RequirePermission` 증가 수 (1:1 대체 관계)
- SP-D5 범위 밖 파일의 `@PreAuthorize` count 변경 0건
- `@RequirePermission` 어노테이션 신규 등장 수 = 마이그레이션된 endpoint 수

**grep 검증 스크립트** (CI 또는 수동 실행):
```bash
# @PreAuthorize 전체 count
grep -r "@PreAuthorize" services/ --include="*.java" | wc -l

# @RequirePermission 전체 count
grep -r "@RequirePermission" services/ --include="*.java" | wc -l

# 비범위 파일 @PreAuthorize count (SP-D5 대상 파일 제외)
# 기대: SP-D4 baseline 과 동일
```

---

## Actuator Prometheus Counter 검증

SP-D5 는 deny 이벤트마다 Micrometer Counter 를 증가시킨다.
로컬 또는 CI 통합 환경에서 다음 메트릭 형식 확인:

```
# HELP permission_guard_denied_total 동적 권한 deny 이벤트 카운터
# TYPE permission_guard_denied_total counter
permission_guard_denied_total{service="slip-service",page="estimate",role="DRIVER",action="VIEW"} 1.0
permission_guard_denied_total{service="slip-service",page="estimate",role="SALES_VIEWER",action="EDIT"} 1.0
```

**검증 절차**:
1. `GET /actuator/prometheus` 응답 본문 확인
2. `permission_guard_denied_total` 존재 여부 확인
3. Q2 deny 이후 해당 레이블 값 1 증가 확인
4. Q4 deny 이후 action="EDIT" 레이블 값 1 증가 확인
5. Q1/Q3 allow 분기에서는 Counter 미증가 확인

**전제**: `spring-boot-starter-actuator` + `micrometer-registry-prometheus` 의존성 추가 및 `management.endpoints.web.exposure.include=prometheus` 설정 적용 확인

---

## false green 가드 체크리스트

- [ ] IT 에서 `|| true` 패턴 0건
- [ ] IT 에서 `@Disabled` / `Assumptions.assumeTrue(false)` 패턴 0건
- [ ] AOP 인터셉트 없이 직접 통과하는 우회 코드 0건
- [ ] `@RequirePermission` 어노테이션이 proxy 대상 bean method 에만 적용되었는지 확인 (non-proxy 내부 호출 우회 방지)
- [ ] `PermissionAspect` pointcut 범위가 지나치게 넓어 unintended endpoint 까지 인터셉트하지 않음 확인
- [ ] Counter 레이블 `service` 태그 값이 `spring.application.name` 과 1:1 일치 확인

---

## BE IT 구현 가이드

### 신규 IT 클래스 패턴 (SP-D5 AOP 전환 후)

```java
@SpringBootTest
@AutoConfigureMockMvc
class EstimateAopPermissionIT extends AbstractPostgresIT {

    @Autowired MockMvc mockMvc;
    @Autowired MeterRegistry meterRegistry;  // Counter 검증용

    // 외부 client 전체 @MockBean 격리 (feedback_it_mockbean_external_clients.md)
    @MockBean DynamicPermissionClient dynamicPermissionClient;
    @MockBean InventoryClient inventoryClient;
    @MockBean ProductClient productClient;
    // ... 기타 외부 client

    @BeforeEach
    void setupLenientStubs() {
        Mockito.lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
    }

    @Test
    @WithMockUser(authorities = {"ROLE_SALES_VIEWER"})
    void Q1_view_allow_returns_200() throws Exception {
        mockMvc.perform(get("/slips/estimates").header("X-User-Role", "SALES_VIEWER"))
               .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(authorities = {"ROLE_DRIVER"})
    void Q2_view_deny_increments_counter() throws Exception {
        Mockito.when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(false);

        mockMvc.perform(get("/slips/estimates").header("X-User-Role", "DRIVER"))
               .andExpect(status().isForbidden());

        // Counter 검증
        Counter counter = meterRegistry.find("permission_guard_denied_total")
            .tags("page", "estimate", "action", "VIEW", "role", "DRIVER")
            .counter();
        assertThat(counter).isNotNull();
        assertThat(counter.count()).isEqualTo(1.0);
    }
}
```
