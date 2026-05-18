# SP-D1 동적 RBAC — DevOps 리뷰 (Claude, Cycle 1)

> 브랜치: `feat/sp-d1-dynamic-rbac-system` (commit `1904b65e`)
> 리뷰어: Claude DevOps Agent
> 일시: 2026-05-18

---

## 검증 범위

- V7 Flyway — auth-service 마이그레이션 순번 충돌 여부
- IT @MockBean — DynamicPermissionClient accounting-service IT 격리
- credential-plaintext guard
- 기존 121 @PreAuthorize 미변경 확인

---

## 검증 결과

### [PASS] V7 Flyway 단독 발급 — 충돌 없음

- auth-service 마이그레이션 순번: V1 → V2 → V3 → V4 → V5 → V6 → **V7** (연속, 간격 없음).
- V7 이 auth-service 내에서 유일한 최신 버전.
- 다른 서비스(accounting-service, user-service 등) 마이그레이션과 독립 스키마 운영 — DB per service 아키텍처. 교차 충돌 없음.

### [PASS] CREATE TABLE IF NOT EXISTS — 재실행 안전

- V7 DDL: `CREATE TABLE IF NOT EXISTS role_page_permissions`
- `CREATE UNIQUE INDEX IF NOT EXISTS uq_role_page_permissions_active`
- `CREATE INDEX IF NOT EXISTS idx_rpp_role_code / idx_rpp_page_code`
- Flyway 기본 동작(checksum 불일치 시 실패)과 IF NOT EXISTS가 충돌하지 않음.

### [PASS] INSERT ON CONFLICT DO NOTHING — idempotency

- 84행 seed: `ON CONFLICT DO NOTHING` — 재실행 시 중복 삽입 없음.
- CI 환경 재배포 / Flyway repair 후 재실행에도 안전.

### [WARN-1] IT @MockBean — DynamicPermissionClient 격리 확인 불가

`feedback_it_mockbean_external_clients.md` 가드 기준:
> SpringBootTest IT 의 모든 외부 client @MockBean 격리 + lenient setup. 누락 시 Eureka 비활성 → 500.

**확인 결과**: `DynamicPermissionClientImpl`이 `@Qualifier("loadBalancedRestClientBuilder")`를 통해 Eureka 기반 Load Balanced RestClient 사용. accounting-service IT 에서 `DynamicPermissionClient` @MockBean 등록 여부 확인 필요.

현재 commit 에서 accounting-service IT 파일 부재 (TaxInvoiceEmitService IT가 있다면 `@MockBean DynamicPermissionClient` 선언 필수). IT 파일이 PR에 포함되지 않았거나 단위 테스트만 존재하는 경우 운영 SpringBootTest 실행 시 500 발생 위험.

**Severity: WARN (IT 존재 여부 확인 필요)**

### [PASS] credential-plaintext guard

- `DynamicPermissionClientImpl`: `AUTH_SERVICE_BASE = "http://auth-service"` — 서비스 디스커버리 기반 URL. credential 없음.
- V7 migration SQL: 평문 credential 없음 (시스템 사용자 `'system'` 식별자만 사용).
- `PermissionUpdateRequest`: 역할 코드/페이지 코드만. 비밀번호/토큰 필드 없음.

### [PASS] 기존 @PreAuthorize 121건 미변경 확인

- accounting-service: `TaxInvoiceController.emitNts()` 기존 `@PreAuthorize("hasAnyRole('ACCOUNTANT','MASTER')")` 유지 확인.
- `TaxInvoiceEmitService`에 SP-D1 동적 권한 레이어 추가 — 기존 @PreAuthorize를 제거하거나 변경하지 않음.
- auth-service: `PermissionAdminController`의 @PreAuthorize — 신규 추가이므로 기존 변경 없음.
- 기존 서비스 전반 @PreAuthorize 변경 없음 — "추가 override 레이어" 전략 준수 확인.

### [WARN-2] accounting-service IT 격리 파일 미포함

- PR commit에 accounting-service IT 파일이 없음 (TaxInvoiceEmitServiceIT, TaxInvoiceControllerIT 등).
- `TaxInvoiceEmitService`에 `DynamicPermissionClient` 의존성이 주입되었으나, 기존 IT(있다면)에서 @MockBean 추가 여부 미확인.
- **CI 실행 시 기존 IT가 `DynamicPermissionClient` bean 미등록으로 실패할 가능성**.

**Severity: WARN (기존 IT 회귀 가능성)**

### [PASS] @Qualifier("loadBalancedRestClientBuilder") — Spring Cloud LoadBalancer 의존

- `DynamicPermissionClientImpl`: `@Qualifier("loadBalancedRestClientBuilder")` — accounting-service가 Spring Cloud LoadBalancer 설정을 갖고 있어야 함.
- 기존 accounting-service에 다른 외부 client(ETaxClient 등)가 동일 Qualifier를 사용하고 있을 경우 정상 동작. 미사용 시 bean 주입 실패.
- **accounting-service build.gradle에 `spring-cloud-starter-loadbalancer` 의존성 확인 필요**.

**Severity: WARN**

### [PASS] V7 DDL — 컬럼 NULLable 정책 (legacy 호환)

- `modified_at TIMESTAMP` — NULLable (신규 컬럼 NULLable 컨벤션 준수).
- `modified_by VARCHAR(50)` — NULLable.
- `deleted_at TIMESTAMP` — NULLable.
- `deleted_by VARCHAR(50)` — NULLable.
- `created_by VARCHAR(50) NOT NULL DEFAULT 'system'` — seed INSERT 시 값 제공.

---

## 결함 요약

| ID | 분류 | Severity | 설명 |
|---|---|---|---|
| DO-1 | IT 격리 | WARN | DynamicPermissionClient @MockBean 격리 확인 불가 — IT 파일 미포함 |
| DO-2 | IT 회귀 | WARN | 기존 accounting-service IT 에서 DynamicPermissionClient bean 추가 여부 미확인 |
| DO-3 | 의존성 | WARN | accounting-service spring-cloud-starter-loadbalancer 의존성 보유 여부 미확인 |

---

## 권장 Fix

1. **DO-1 + DO-2 (WARN)**: accounting-service IT (TaxInvoiceEmitServiceIT 등)에 `@MockBean DynamicPermissionClient dynamicPermissionClient` 추가 + lenient stub 설정:
   ```java
   @MockBean private DynamicPermissionClient dynamicPermissionClient;
   // setup:
   lenient().when(dynamicPermissionClient.canEdit(any(), any())).thenReturn(true);
   lenient().when(dynamicPermissionClient.canView(any(), any())).thenReturn(true);
   ```

2. **DO-3 (WARN)**: accounting-service `build.gradle` 확인:
   ```
   implementation 'org.springframework.cloud:spring-cloud-starter-loadbalancer'
   ```
   미포함 시 추가 또는 `@Qualifier` 없이 기본 RestClient.Builder 사용으로 변경.
