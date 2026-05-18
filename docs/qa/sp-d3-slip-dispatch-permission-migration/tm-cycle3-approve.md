## 🔵 TM 통합 — SP-D3 Cycle 3 APPROVE (CI green)

**HEAD**: `6c2c816f` (cycle 3 fix)

### 결정
**APPROVE** — cycle 2 CI 회귀 5 IT 모두 해소, CI 전체 PASS.

### Cycle 3 fix (test-only, 5 file)

| # | 파일 | 변경 |
|---|---|---|
| 1 | `SlipDynamicPermissionIT` | C1/C2/C3/C4/C5 에 `.header("X-User-Role", role)` 추가 |
| 2 | `SlipQuerySalesIT` | `@MockBean DynamicPermissionClient` + lenient stub |
| 3 | `SlipQueryPurchaseIT` | 동일 |
| 4 | `SlipQueryRedesignSpecIT` | 동일 |
| 5 | `DispatchSmsAuditDynamicPermissionIT` C2 | `.header("X-User-Role", "DISPATCH")` 추가 |

### 근본 원인 2가지

1. **X-User-Role 헤더 누락 → 정적 가드 차단**
   - `@WithMockUser` 는 Spring Security Authentication 만 설정. controller `list()` 의 `@RequestHeader("X-User-Role")` 는 별도 필요.
   - C1 (SALES OUTBOUND): null role → `guardOutboundSalesRead` 403 → 동적 가드 진입 못함.
   - C3 (WAREHOUSE INBOUND): null role → `guardInboundPurchaseRead` 403 → 동일.
   - DispatchSmsAudit C2: null role → `checkViewPermission(null)` skip → 200 (기대 403).

2. **`@MockBean DynamicPermissionClient` 누락 → real impl Eureka 호출**
   - `DynamicPermissionClientImpl` 이 Eureka 통해 auth-service 호출, IT 환경 Eureka 비활성 → `RestClientException` catch → fallback false → 403.
   - cycle 2 에서 dispatch 3 IT 만 `@MockBean` 추가, 기존 query IT (`SlipQuerySalesIT`/`SlipQueryPurchaseIT`/`SlipQueryRedesignSpecIT`) 누락 → 기존 200 기대 테스트 403 반환.

### CI 검증 (HEAD 6c2c816f)

| 작업 | 결과 | 시간 |
|---|---|---|
| slip-it-core | ✅ pass | 2m24s |
| phase9-10 (groupware+notification+dashboard) | ✅ pass | 1m31s |
| slip-it-public | ✅ pass | 1m30s |
| slip-units | ✅ pass | 1m2s |
| accounting+partner | ✅ pass | 1m6s |
| shared+auth+gateway | ✅ pass | 1m4s |
| user+product+inventory+logging | ✅ pass | 1m5s |
| arologis-service | ✅ pass | 1m50s |
| Playwright (web + electron + mobile emul) | ✅ pass | 1m37s |
| Detox Android | ✅ pass | 27s |
| Frontend DS / Desktop / Mobile-Staff | ✅ pass | 53s / 56s / 27s |
| Credential Plaintext Guard / Notion Runtime Zero Guard | ✅ pass | 10s / 7s |
| GitGuardian Security Checks | ✅ pass | - |
| JUnit 테스트 결과 (8 group) | ✅ pass | - |

### 5-team 재리뷰 면제 사유

- cycle 3 변경은 **test-only** (5 file 모두 `src/test/java/...` 하위).
- 운영 코드 (production code) 0 변경 → BE/FE/Designer/DevOps 검토 대상 아님.
- QA 영역만 영향 → QA 가드 (`feedback_it_mockbean_external_clients.md`) 일관성 확인.

### 메모리 가드 일관성

- ✅ `feedback_it_mockbean_external_clients.md` — 외부 client `@MockBean` + lenient stub 패턴 일관.
- ✅ `feedback_pm_integration_build_check.md` — `./gradlew testClasses` BUILD SUCCESSFUL 사전 검증.
- ✅ `feedback_korean_commits.md` — commit message 한국어 본문.
- ✅ `feedback_dual_5agent_review.md` cycle N=3 안 완료 — cycle 4 미진입.

**TM 결정: APPROVE → 개발책임자 머지 요청**

Claude TM — 2026-05-18
