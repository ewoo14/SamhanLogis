# #720 월마감 실행 실패 fix — slip lock-by-period 내부 엔드포인트화 (fix/720-lock-by-period-internal)

> 월마감(month-end close) 실행 100% 실패. #719 QA 라이브가 적발한 사전결함. 서비스간 auth 파손(#665 internal-auth 계열).

## 근본원인
- accounting `MonthEndCloseService:109` → `SlipServiceClient.lockByPeriod` → slip `POST /slips/lock-by-period`.
- slip `SlipController`(base `/slips`·public)의 `POST /lock-by-period`가 **`@RequirePermission(page="slip.period-lock", action=UPDATE)`**. 그러나 `/slips/**`는 **`/internal/` prefix 아님 → InternalTokenFilter no-op**(X-Internal-Token 무시).
- accounting client는 X-Internal-Token만 보내고 user context(X-User-Role) 없음(서비스간 직접 호출·게이트웨이 미경유) → `@RequirePermission` 사용자 권한 검사 실패 → **403** → client `onStatus(4xx)` → `BusinessException(CONFLICT)` → **409**(월마감 실패).
- **@MockBean 가림**: `MonthEndCloseControllerIT`가 `slipServiceClient`를 mock → 실 cross-service auth 미검증(false-green). [[feedback_restclient_contract_test_false_green]]·[[feedback_enforcement_real_http_test]].

## 결정
- **D1 lock-by-period = 내부 엔드포인트화**(#665 패턴): 서비스간 전용(user-facing 아님)이므로 `POST /internal/slips/lock-by-period`로 이전 — `/internal/` prefix라 `InternalTokenFilter`가 X-Internal-Token→ROLE_MASTER 부여 → 통과. public `/slips/lock-by-period`(+@RequirePermission)는 제거(서비스간 전용·사용자 미호출). [[feedback_identity_header_authz_antipattern]] downstream fail-CLOSED 유지.

## 요구
1. **slip**: `POST /internal/slips/lock-by-period` 내부 컨트롤러(또는 기존 컨트롤러에 internal 매핑)·`@RequirePermission` 제거·InternalTokenFilter 경유. 기존 `slipService.lockByPeriod()` 로직 재사용(무변경). public `/slips/lock-by-period` 제거.
2. **accounting**: `SlipServiceClient.LOCK_BY_PERIOD_PATH` → `/internal/slips/lock-by-period`.
3. **테스트**:
   - slip: `/internal/slips/lock-by-period` 실 HTTP IT(X-Internal-Token 有→200·無→401/403·기간 lock 실증). InternalTokenFilter 경유 확인.
   - accounting: `SlipServiceClient` 실-HTTP 계약 테스트(**MockRestServiceServer**·X-Internal-Token 헤더 단언·200/4xx 분기·**@MockBean 우회 금지**). [[feedback_restclient_contract_test_false_green]] 4체크.
   - `MonthEndCloseControllerIT`는 @MockBean 유지 가능(단위)이나 위 계약 테스트가 실 auth 회귀 방지.

## 함정
- `InternalTokenFilter`는 `/internal/**`만 처리(shared:security)·게이트웨이는 서비스간 직접호출에 X-User-Role 미주입.
- 적용 마이그 불변([[feedback_applied_migration_immutable]]) — 이 fix는 Flyway 0(엔드포인트 경로만).
- IT 외부 RestClient @MockBean 의무([[feedback_it_mockbean_external_clients]]) — 누락 시 Eureka 비활성 500.
- page-code `slip.period-lock` 시드/권한(auth) 정리 여부 확인(엔드포인트 internal화로 불요 시 dead).

## 검증
- BE: slip+accounting 모듈 전체 test(--rerun-tasks). 실 HTTP 계약·InternalTokenFilter IT.
- 라이브 QA(Docker·mock OFF·dev_master): 회계 월마감 실행 → **성공**(기존 100% 실패 해소)·slip CONFIRMED→LOCKED 전이·lockedCount 표시. 스샷(SendUserFile+PR SHA-pinned).
