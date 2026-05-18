# SP-D3 DevOps 리뷰 — Cycle 1
> 리뷰어: Claude DevOps Agent
> 브랜치: `feat/sp-d3-slip-dispatch-permission-migration` (commit `df337cdd`)
> 작성일: 2026-05-18

---

## 1. 리뷰 범위

| 항목 | 내용 |
|------|------|
| Flyway 마이그레이션 | V7/V8 충돌 여부, SP-D3 V9 필요 여부 |
| IT @MockBean 격리 | 3개 서비스 외부 client stub 일관성 |
| Credential plaintext 가드 | 민감 정보 노출 여부 |
| CI 빌드 영향 | 컴파일 + 테스트 pass 가능성 |

---

## 2. Flyway 마이그레이션 분석

### 2.1 현재 auth-service migration 파일 목록

```
V1__init_account.sql
V2__add_password_policy.sql
V3__add_password_reset_tokens.sql
V4__add_password_change_required.sql
V5__seed_p0_5_test_accounts.sql
V6__add_department_name.sql
V7__add_role_page_permissions.sql     ← SP-D1 (12 PageCode × 7 역할 = 84 row)
V8__sp_d2_accounting_page_permissions.sql  ← SP-D2 (7 신규 PageCode + V7 SALES 보정)
```

### 2.2 SP-D3 V9 불필요 확인

SP-D3 대상 6 PageCode:
- `purchases.slip.list`, `sales.slip.list`, `inbound.inspection`
- `dispatch.board`, `notification.dispatch-sms.send-audit`, `purchases.receipt-ocr`

모두 V7에서 이미 정의됨. V7 seed row 수 = 7 역할 × 12 PageCode = 84 row. 신규 PageCode 추가 없으므로 SP-D3용 Flyway migration 불필요. **확인 완료**.

### 2.3 V7/V8 충돌 없음 확인

V7: `role_page_permissions` 테이블 DDL + 84 row 초기 seed.
V8: `role_page_permissions` 테이블 대상 7개 신규 PageCode INSERT + SALES 회계 메뉴 canView UPDATE.

V8은 V7 테이블을 전제하며, ON CONFLICT DO NOTHING 패턴 적용. V7→V8 순서 의존성 Flyway 버전 넘버링으로 보장. SP-D3 브랜치에서 V8 이후 신규 migration 없음 — 충돌 없음.

### 2.4 V7 SALES dispatch.board canView=TRUE 문제

V7 seed 118라인:
```sql
('d1000004-0000-0000-0000-000000000011', 'SALES', 'dispatch.board', TRUE, FALSE, ...)
```

`canView=TRUE`로 설정됨. V8에서 SALES 회계 관련 row만 FALSE로 보정하였으나 `dispatch.board`는 미포함. SP-D3 슬라이스에서 V9 불필요를 채택하였으나, 이 데이터 오류는 **별도 Fix migration이 필요한 상태**. 기능 관점에서는 CRITICAL 이슈(BE F-BE-02, FE F-FE-01).

**DevOps 관점**: 기존 운영 환경에 V7이 적용된 상태라면 이 오류도 DB에 반영되어 있음. Fix migration(V9) 없이 코드만 배포하면 SALES 사용자의 배차 메뉴 노출 문제가 그대로 유지됨.

**권고**: cycle 2에서 V9 fix migration 추가:
```sql
-- V9__sp_d3_fix_sales_dispatch_board.sql
UPDATE role_page_permissions
SET can_view = FALSE, can_edit = FALSE, modified_at = NOW(), modified_by = 'system'
WHERE role_code = 'SALES'
  AND page_code = 'dispatch.board'
  AND is_deleted = FALSE;
```

---

## 3. 3-service IT @MockBean 격리 일관성

### 3.1 신규 IT 외부 client 격리 현황

**SlipDynamicPermissionIT** (7개 @MockBean):
- DynamicPermissionClient
- InventoryClient, ProductClient, PartnerInternalClient
- PartnerBlockClient, NotificationClient, NotificationChatRoomClient
- ArologisDispatchClient

**ArologisDynamicPermissionIT** (5개 @MockBean):
- DynamicPermissionClient
- PartnerClient, SlipClient, NotificationClient, SlipServiceClient

**NotificationDynamicPermissionIT** + **DispatchSmsAuditDynamicPermissionIT** (공통 7개 @MockBean):
- DynamicPermissionClient
- UserClient, SlipServiceClient, PartnerLookupClient
- BlockedPartnerLookupClient, AligoCsvSourceClient, AligoAddressBookClient

### 3.2 @BeforeEach lenient stub 패턴 일관성

| IT 클래스 | lenient stub 기본값 | import 방식 |
|-----------|--------------------|-----------  |
| SlipDynamicPermissionIT | canView=true / canEdit=true | `Mockito.lenient()` |
| ArologisDynamicPermissionIT | canView=true / canEdit=true | `import static lenient` |
| NotificationDynamicPermissionIT | canView=true / canEdit=true | `Mockito.lenient()` |
| DispatchSmsAuditDynamicPermissionIT | canView=true / canEdit=true | `Mockito.lenient()` |

`import static org.mockito.Mockito.lenient` vs `Mockito.lenient()` 혼용은 기능적으로 동일. 스타일 일관성 권장 수준.

### 3.3 Testcontainers AbstractPostgresIT 상속

4개 신규 IT 클래스 모두 `AbstractPostgresIT` 상속 확인. Testcontainers PostgreSQL 컨테이너 자동 관리 — Windows Docker Desktop 환경에서 `DOCKER_HOST=tcp://localhost:2375` 필요 (memory: `feedback_testcontainers_windows_docker.md`).

---

## 4. Credential plaintext 가드

### 4.1 신규 코드 민감 정보 검색

DynamicPermissionClientImpl 3개 파일에서 확인:
- `AUTH_SERVICE_BASE = "http://auth-service"` — Eureka service name 사용. 실제 host/port 노출 없음. 정상.
- 환경변수/시크릿 직접 사용 없음. Spring Cloud LoadBalancer 통한 간접 접근.

### 4.2 V7/V8 migration 민감 정보 확인

seed SQL에 test 계정 비밀번호 등 민감 정보 없음. UUID PK + role/page_code 코드값만 포함. 정상.

---

## 5. 컴파일/빌드 영향 분석

### 5.1 신규 파일 의존성

각 서비스별 신규 파일 의존성:

```
slip-service:
  DynamicPermissionClient (interface) → DynamicPermissionClientImpl (@Component)
  SlipController → DynamicPermissionClient (@Autowired via @RequiredArgsConstructor)
  ReceiptOcrController → DynamicPermissionClient
  @Qualifier("loadBalancedRestClientBuilder") → 기존 Spring Cloud LoadBalancer bean

arologis-service: 동일 패턴

notification-service: 동일 패턴
```

`loadBalancedRestClientBuilder` bean이 각 서비스 `application.yml` 및 Bean 설정에 존재해야 함. SP-D2 패턴에서 이미 accounting-service에 동일 패턴 적용 완료 — 3개 서비스에도 해당 bean이 존재할 것으로 예상. 미존재 시 `NoSuchBeanDefinitionException` 발생.

### 5.2 IT 빌드 의존성

신규 IT 클래스들의 `AbstractPostgresIT` 상속 — 각 서비스의 기존 IT 패키지에 동일 클래스 존재. 이미 SP-D2에서 각 서비스 IT 경로에 존재 확인됨.

### 5.3 `feedback_korean_path_jdk` 가드

한글 경로에서 `gradle test` 실패 가능성. 로컬 검증은 `./gradlew :services/slip-service:compileTestJava` 수준으로 진행.

---

## 6. 서비스 설정 (application.yml) 변경 없음 확인

3개 서비스 모두 application.yml 변경 없음. `DynamicPermissionClient`는 Eureka service discovery + LoadBalancer를 통한 auth-service 연결이므로 별도 URL 설정 불필요.

---

## 7. 발견된 결함

### F-DevOps-01 [CRITICAL] V9 Fix migration 필요 — SALES dispatch.board canView=TRUE → FALSE

**위치**: `V7__add_role_page_permissions.sql` 118라인

DevOps 관점에서 V7 seed 오류는 배포 시 즉시 DB에 반영됨. SP-D3 코드 변경만으로는 해결 불가 — 반드시 Flyway migration이 실행되어야 DB 값 수정 가능.

BE F-BE-02, FE F-FE-01과 동일 문제이나 DevOps 관점에서 migration 없이 배포 시 운영 환경에서 SALES 역할 사용자가 배차 메뉴에 접근 가능한 상태가 지속됨.

**권고**:
```sql
-- V9__sp_d3_fix_sales_dispatch_board.sql
UPDATE role_page_permissions
SET can_view = FALSE,
    can_edit = FALSE,
    modified_at = NOW(),
    modified_by = 'system'
WHERE role_code = 'SALES'
  AND page_code = 'dispatch.board'
  AND is_deleted = FALSE;
```

### F-DevOps-02 [MINOR] loadBalancedRestClientBuilder bean 3개 서비스 존재 여부 미확인

`DynamicPermissionClientImpl` 생성자에서 `@Qualifier("loadBalancedRestClientBuilder")` 주입. SP-D2에서 accounting-service에 추가된 패턴이나, slip-service/arologis-service/notification-service에 동일 bean이 존재하는지 명시적 확인 필요.

bean 미존재 시 Spring context 로드 실패 → IT 전체 500/오류 발생.

**권고**: 3개 서비스 application 설정 또는 @Configuration 파일에서 `loadBalancedRestClientBuilder` bean 존재 확인. 없으면 신규 추가 필요.

---

## 8. 총평

| 항목 | 상태 |
|------|------|
| V9 Flyway 불필요 (신규 PageCode 없음) | 확인 완료 |
| V7/V8 충돌 없음 | 확인 완료 |
| V9 Fix migration 필요 (SALES dispatch.board) | 결함 발견 |
| @MockBean 외부 client 격리 | 완전 달성 |
| lenient stub @BeforeEach | 완전 달성 |
| Credential plaintext 없음 | 확인 완료 |
| loadBalancedRestClientBuilder bean 확인 | 미확인 (F-DevOps-02) |

**사이클 1 결론**: F-DevOps-01 (V9 fix migration 필요)은 V7 seed 오류 수정을 위해 migration이 반드시 필요. cycle 2에서 추가 필수.

---

## 9. TM 결정 권고

**cycle 2 수정 필수** — F-DevOps-01 (V9 fix migration) 없이 배포 시 SALES dispatch.board 접근 허용 상태 지속. BE/FE fix와 함께 V9 migration 통합 추가 후 머지.
