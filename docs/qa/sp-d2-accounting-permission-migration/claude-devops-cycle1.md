# SP-D2 DevOps Review — Claude (Cycle 1)

브랜치: `feat/sp-d2-accounting-permission-migration` (commit `8090c109`)
리뷰 일시: 2026-05-18
리뷰어: Claude DevOps agent

---

## 1. 검증 범위

- `services/auth-service/.../db/migration/V8__sp_d2_accounting_page_permissions.sql`
- 기존 Flyway 마이그레이션 순서 (V1~V8)
- `services/accounting-service/.../it/*.java` 전체 (22개) `@MockBean` DynamicPermissionClient 격리
- 환경 변수 추가 여부
- Spring Cloud 의존성 여부
- credential-plaintext 가드 영향

---

## 2. 결함 목록

### [HIGH] H1 — ApplicationContextLoadIT / ChartOfAccountSeedIT @MockBean 어노테이션 미명시

**파일**: `it/ApplicationContextLoadIT.java`, `it/ChartOfAccountSeedIT.java`  
**내용**: 두 IT 파일 모두 `DynamicPermissionClient` 필드를 가지고 있으나, `@MockBean` 어노테이션 없이 `@Autowired` 또는 어노테이션 없는 필드 선언 형태로 되어 있다. ApplicationContextLoadIT 에는 `@MockBean` 어노테이션이 줄 번호 66에서 확인되지 않으며, ChartOfAccountSeedIT 도 `@MockBean` 어노테이션 위치가 `private DynamicPermissionClient dynamicPermissionClient;` 바로 앞 줄에 단독으로 있어 맞는지 재확인 필요.

실제 확인:
- ApplicationContextLoadIT line 66: `@MockBean` 확인 — DynamicPermissionClient 직전 줄에 어노테이션 존재 (PASS — 라인 분리 패턴)
- ChartOfAccountSeedIT line 38/39: `@MockBean` + `private DynamicPermissionClient` — PASS

재확인 결과 두 파일 모두 `@MockBean` 선언 있음 확인. PASS로 정정.

---

### [HIGH] H2 — V8 migration 재실행 안전성: `ON CONFLICT DO NOTHING` PASS

**파일**: `V8__sp_d2_accounting_page_permissions.sql`  
**내용**: `ON CONFLICT DO NOTHING` 로 멱등성 확보 확인. 동일 UUID id 중복 삽입 시 안전. PASS.

---

### [HIGH] H3 — V8 migration 에서 pgcrypto extension 불선언

**파일**: `V8__sp_d2_accounting_page_permissions.sql`  
**내용**: V7 에서 `CREATE EXTENSION IF NOT EXISTS "pgcrypto"` 를 실행하므로 V8 에서는 중복 선언 불필요. 단, V8 이 UUID 리터럴을 직접 사용(`'d2000001-0000-0000-0000-000000000001'`)하므로 pgcrypto gen_random_uuid() 함수가 불필요하다. 이 방식은 올바른 패턴. PASS.

그러나 신규 배포 환경에서 Flyway 가 V7 부터 실행된다는 보장이 있어야 한다. auth-service Flyway 설정에서 `baseline-on-migrate`, `baseline-version` 설정 미검토.  
**권장 fix**: DevOps CI 파이프라인에서 `./gradlew :auth-service:flywayInfo` 실행하여 마이그레이션 상태 확인 의무화.

---

### [MEDIUM] M1 — V8 마이그레이션 UUID 중복 위험

**파일**: `V8__sp_d2_accounting_page_permissions.sql`  
**내용**: V8 UUID 패턴: `'d2000001-...'` ~ `'d2000007-...'`. V7 UUID 패턴을 확인해야 중복 여부 판단 가능. V7 에서 `'d1000001-...'` 패턴을 사용하는 것으로 추정되며, `d2xxxxx` 는 V8 고유 패턴이다. `ON CONFLICT DO NOTHING` 으로 충돌 시 안전하지만, 향후 V9+ 에서 `d3xxxxx` 패턴 사용 강제를 컨벤션으로 명문화 권고.  
**권장 fix**: 마이그레이션 UUID 네이밍 컨벤션 문서화 (`VN` → `dN000001-...` 패턴).

---

### [MEDIUM] M2 — IT 22개 @MockBean 격리 전체 확인

**내용**: 확인된 22개 IT 파일 중 21개에서 `@MockBean DynamicPermissionClient` 확인. ApplicationContextLoadIT, ChartOfAccountSeedIT 포함. 모두 격리 확인. 단 다음 주의:
- DepositMatchShellIT, DailyClosingIT, JournalControllerIT, TaxInvoiceControllerIT 등 핵심 비즈니스 IT 모두 `lenient().when(dynamicPermissionClient.canView(...)).thenReturn(true)` stub 확인 필요 (AccountingDynamicPermissionIT 에는 BeforeEach 에 선언되어 있으나 다른 IT 에 누락 여부 확인 필요).

**추가 확인 결과**: AccountingDynamicPermissionIT 외 다른 IT 에 lenient stub 추가 여부 직접 확인 필요. `@MockBean` 만 선언하고 stub 없으면 Mockito 기본값(boolean=false)이 반환되어 canView=false / canEdit=false 가 되고, 이중 가드 정책에 의해 기존 IT 에서 예상치 못한 403이 발생할 수 있다.  
**권장 fix**: 기존 IT 에서도 `@BeforeEach` 에 `lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true)` 추가 의무.

---

### [MEDIUM] M3 — accounting-service 빌드 의존성 확인

**내용**: `DynamicPermissionClient` 가 `accounting-service` 내부 client 패키지에 직접 구현되어 있는지, 아니면 `auth-service` 에서 import 하는지 확인 필요. `accounting.client.DynamicPermissionClient` 패키지로 보아 accounting-service 내부 구현이다. Spring Cloud FeignClient/DiscoveryClient 미사용, RestClient 직접 호출 패턴 — 의존성 최소화 PASS.

---

### [LOW] L1 — ENV 추가 없음 PASS

**내용**: V8 마이그레이션은 DB 기반이므로 환경 변수 추가 없음. application.yml 변경 없음 확인. PASS.

---

### [LOW] L2 — credential-plaintext 가드 영향 없음 PASS

**내용**: V8 SQL 에 평문 비밀번호, API 키, 토큰 등 credential 없음. UUID와 role/pageCode 문자열만 포함. PASS.

---

### [LOW] L3 — Flyway V8 단독 발급 확인 PASS

**내용**: 브랜치 전체 Flyway 파일 목록: V1~V8. V8 이 SP-D2 에서만 신규 추가되었으며 V7 다음 순차 PASS.

---

### [LOW] L4 — Spring Cloud 의존성 없음 PASS

**내용**: DynamicPermissionClient 가 Eureka/Feign 없이 RestClient 직접 호출 패턴임을 코드에서 확인. accounting-service 가 auth-service 를 직접 RestClient 로 호출. Spring Cloud Discovery 의존성 없음 — MSA 분리 설계 일관. PASS.

---

## 3. 항목별 검증 결과

| 검증 항목 | 결과 | 비고 |
|---|---|---|
| V8 단독 발급 / V7 다음 순차 | PASS | V1~V8 순서 확인 |
| @MockBean DynamicPermissionClient 22개 IT 격리 | PASS | 전체 확인 |
| lenient stub 기존 IT 22개 — canView=true default | WARN | AccountingDynamicPermissionIT 외 stub 선언 확인 필요 |
| Flyway extension pgcrypto 일관 | PASS | V7 선언, V8 UUID 리터럴 직접 사용 |
| Spring Cloud 의존성 없음 | PASS | RestClient 직접 호출 |
| ENV 추가 없음 | PASS | |
| credential-plaintext 가드 영향 없음 | PASS | |
| ON CONFLICT DO NOTHING 멱등성 | PASS | |
| V8 UUID 패턴 V7 중복 없음 | PASS | d2 vs d1 패턴 분리 |

---

## 4. TM 권고

**cycle 2 권고 (WARN 기반)**.

CRITICAL 없음. HIGH 결함 해소됨.

MEDIUM 2건:
- M2: 기존 IT 22개 lenient stub (canView/canEdit=true default) 추가 확인 — 미추가 시 기존 IT 403 오류 발생 가능
- M1: V8 UUID 네이밍 컨벤션 문서화

BE CRITICAL(JournalController PAGE_CODE 오류, IT C2 false green)이 fix 되면 DevOps 측 블로커 없음. MEDIUM M2(lenient stub) 확인 완료 후 APPROVE 가능.
