# Phase 2.6a SlipServiceClient 경로/헤더 fix — BE cross-check (사이클 N=3)

검토일: 2026-05-30  
검토자: Claude BE Agent (cycle3 slipclient)  
대상 커밋: 현재 `feat/phase-2-6-order-to-slip-conversion` HEAD (494990fc) — fix는 MIG-23 (#291, 5ac04457) 에 이미 병합됨  
대상 파일: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/SlipServiceClient.java`

---

## 검토 대상 변경 요약

fix diff (작업 지시서 기준):
- URI: `/slips/from-partner-order` → `/api/v1/slips/from-partner-order`
- 헤더 추가: `X-User-Role: MASTER` + `X-User-Id: 00000000-0000-0000-0000-000000000000`

현재 코드(5ac04457 이후)에서 두 변경 모두 적용 확인:

```
.uri("/api/v1/slips/from-partner-order")           // 라인 77
.header(USER_ROLE_HEADER, INTERNAL_ROLE)            // 라인 79  INTERNAL_ROLE = "MASTER"
.header(USER_ID_HEADER, INTERNAL_CALLER_ID)         // 라인 80  all-zero UUID
```

---

## 검증 항목 1 — 3 caller 영향 분석

### PartnerOrderConfirmService (confirm 흐름)

- idempotencyKey 형식: `PO-CONF-{partnerCode}-{draftSeq}`
- `slipServiceClient.publishFromPartnerOrder(slipPayload, idempotencyKey)` 단일 호출
- 경로 fix → slip-service `/api/v1/slips/from-partner-order` 로 정확히 도달
- 헤더 추가 → PermissionAspect MASTER bypass 경로 활성화 (아래 검증 항목 2 참조)
- 결론: 정상 동작 기대. confirm 흐름에서 발행 성공 후 `order.markSlipPublished(result.slipNo())` 호출 경로까지 일관

### PartnerOrderConvertService (부분전환 흐름)

- idempotencyKey 형식: `PO-CONV-{orderId}-{SHA-256[:16]}`
- `slipServiceClient.publishFromPartnerOrder(payload, idempotencyKey)` 단일 호출
- 경로 fix → 동일 엔드포인트 도달
- 두 caller 모두 동일 `publishFromPartnerOrder` 메서드 거치므로 헤더/경로 일관성 보장
- 결론: 정상 동작 기대

### SlipPublishOutboxScheduler (outbox 재시도 흐름)

- `slipServiceClient.publishFromPartnerOrder(payload, locked.getIdempotencyKey())`
- payload 는 confirm 시점에 JSON 직렬화→DB 저장 후 재파싱된 것 (`objectMapper.readValue`)
- idempotencyKey 는 DB 의 `idempotency_key` 컬럼 값 — 초기 발행 시점과 동일
- 경로 fix → 재시도 시에도 동일 올바른 경로 사용. 멱등성 보장 유지
- 결론: 정상 동작 기대. PO-CONF/PO-CONV prefix 불문하고 동일 메서드 경유이므로 일관

**3 caller 요약: 모두 동일 `publishFromPartnerOrder` 단일 메서드를 거쳐 경로/헤더 일관 적용. 회귀 없음.**

---

## 검증 항목 2 — 헤더 회귀 분석

### X-User-Role: MASTER 추가

slip-service `PermissionAspect.isMasterBypass()`:

```java
private boolean isMasterBypass(String roleCode) {
    if ("MASTER".equalsIgnoreCase(roleCode)) {
        return true;   // 동적 DB 조회 없이 즉시 통과
    }
    return roleBasedEnforcement && "AROLOGIS_MASTER".equalsIgnoreCase(roleCode);
}
```

- MASTER → `joinPoint.proceed()` 즉시 실행. DynamicPermissionClient 호출 없음
- slip-service 의 `@PostMapping("/from-partner-order")` 에 붙은 `@RequirePermission(page="slip.publish.from-partner-order", action=CREATE)` 권한 검사 bypass → 정상 통과
- 다른 서비스(product-service, inventory-service 등) 에는 본 헤더가 전달되지 않음 (partner-order-service 내부 RestClient 에서 slip-service 로만 발송). 다른 서비스 영향 없음

### X-User-Id: 00000000-0000-0000-0000-000000000000 추가

slip-service `HeaderAuthenticationFilter`:

```java
String userId = request.getHeader(USER_ID_HEADER);   // "00000000-..."
String role   = request.getHeader(USER_ROLE_HEADER); // "MASTER"
// 둘 다 non-null, non-blank → SecurityContext 에 UsernamePasswordAuthenticationToken 등록
var authority = new SimpleGrantedAuthority("ROLE_MASTER");
var auth = new UsernamePasswordAuthenticationToken(userId, null, List.of(authority));
SecurityContextHolder.getContext().setAuthentication(auth);
```

- all-zero UUID 는 유효한 UUID 형식 — filter 통과, SecurityContext 정상 등록
- PermissionAspect 는 MASTER bypass 이므로 `parseAccountId("00000000-0000-0000-0000-000000000000")` 까지 도달하지 않음 (isMasterBypass 가 먼저 return true)
- `accountId == null` deny 분기 도달 불가 — 안전
- `SlipPublishController.callerOrSystem(callerHeader)`:

```java
private String callerOrSystem(String header) {
    return (header == null || header.isBlank()) ? "system" : header;
}
```
  all-zero UUID 가 blank 가 아니므로 `"00000000-0000-0000-0000-000000000000"` 이 callerHeader 로 사용됨. DB audit 에는 이 값이 저장 → 운영상 `system` 과 구별 가능. 허용 범위 내

**헤더 추가 회귀 없음. MASTER bypass 로 accountId 파싱 도달 자체 없어 all-zero UUID 문제 없음.**

---

## 검증 항목 3 — 테스트 갭 분석

### partner-order IT 에서의 경로/헤더 검증 가능 여부

`PartnerOrderConfirmServiceIT`, `PartnerOrderConvertIT` 모두:
- `@MockBean private SlipServiceClient slipServiceClient;` — RestClient 실 호출 없음
- `Mockito.when(slipServiceClient.publishFromPartnerOrder(anyMap(), anyString())).thenReturn(...)` — 반환값 stub
- 경로 문자열 `/api/v1/slips/from-partner-order` 및 헤더는 mock 레이어 아래에서 완전히 숨겨짐

**결론: 이 버그(경로 오타)를 partner-order IT 가 잡지 못한 것은 설계상 필연적 한계. `@MockBean` 격리가 `feedback_it_mockbean_external_clients.md` 규칙 준수이므로 해당 IT 구조를 변경할 수 없음.**

### slip-service SlipPublishControllerIT 의 경로 정합 역할

`SlipPublishControllerIT.publishFromPartnerOrder_returns201()`:

```java
mockMvc.perform(post("/api/v1/slips/from-partner-order")
        .header("X-User-Role", "MANAGER")
        ...
```

- slip-service 입장에서 `/api/v1/slips/from-partner-order` 경로가 존재하고 응답한다는 것을 검증
- partner-order-service 가 이 경로를 올바르게 호출하는지는 검증하지 않음 (MockMvc 는 slip-service 내부 테스트)
- 즉, slip-service IT 는 "수신 측 경로가 유효함" 을 증명하지만 "발신 측이 올바른 경로를 사용하는지"는 검증하지 못함

**갭 (P2, 비차단)**: 두 서비스 사이의 경로 정합을 자동 검증하는 계약 테스트(Consumer-Driven Contract Test, 예: Spring Cloud Contract / Pact)가 없음. 현재 구조에서는 경로 오타가 CI 에서 검출되지 않고 운영 404 로 드러남.

권고사항(향후): slip-service 의 `from-partner-order` 엔드포인트에 대한 Consumer Contract 또는 통합 E2E 테스트 추가. 현 슬라이스 범위 밖이므로 차단 결함으로 분류하지 않음.

---

## 검증 항목 4 — compileJava 통과

```
./gradlew :services:partner-order-service:compileJava \
          :services:partner-order-service:compileTestJava --no-daemon

BUILD SUCCESSFUL in 12s
6 actionable tasks: 6 up-to-date
```

compileJava + compileTestJava 모두 BUILD SUCCESSFUL 확인.

---

## 검증 항목 5 — 운영 주의 (중요)

### 배경

경로 오타(`/slips/from-partner-order` vs `/api/v1/slips/from-partner-order`)가 최초 코드(46f5c9f4, Phase 6 M4 skeleton)부터 존재하였고 fix 는 MIG-23(5ac04457, 2026-05-22) 에서 이루어짐. 이 기간 동안 운영에 배포되었다면:

- 모든 confirm → slip 발행 시도가 404 Not Found 를 반환 → `BusinessException(INTERNAL_ERROR)` → outbox PENDING 큐잉
- 즉 성공적인 Sync REST 발행은 0건이었고 모두 outbox PENDING_RETRY 상태로 쌓임

### fix 머지 후 우려 — outbox 급처리

**현재 outbox 에 PENDING 상태 row 가 쌓여 있다면** fix 배포 즉시 스케줄러(5분 cron)가 이를 일괄 처리 시도:

- 최대 BATCH_SIZE=50 건/회 처리
- 지수 백오프 적용이므로 nextAttemptAt 이 미래인 row 는 즉시 처리되지 않음
- max-retry-hours(기본값 확인 필요) 초과 row 는 이미 FAILED_PERMANENT 상태일 수 있음
- 동일 idempotencyKey 재시도이므로 slip-service 가 409-duplicate 반환 가능 (이미 부분 발행된 경우) — SlipServiceClient 가 409 를 PublishResult.duplicate(slipNo) 로 처리하므로 이중 발행 없음

**실제 운영 배포 이전이라면(dev/staging 환경에서만 사용)**: outbox 잔여분 확인 불필요.

**운영 배포 이력이 있다면**: 머지 전 DBA/운영팀이 `slip_publish_outbox` 테이블의 PENDING 건수를 사전 확인하고 급처리 부담을 인지해야 함. 특히 `max_retry_hours` 내에 있는 row 가 한꺼번에 처리될 때 slip-service 부하 집중 가능. 필요시 BATCH_SIZE 임시 축소 또는 수동 분산 처리 권고.

### dev-report 반영 권고

`docs/dev-reports/phase-2-6a-order-to-slip-conversion.md` 에 다음 항목 추가 권고:
- "SlipServiceClient 경로 fix (MIG-23 선행 배포 의존): 운영 배포 전 slip_publish_outbox PENDING 건수 확인 필수"

---

## 종합 판정

| 항목 | 결과 |
|------|------|
| 3 caller (confirm/convert/outbox) 일관성 | PASS — 단일 메서드 경유, 회귀 없음 |
| X-User-Role: MASTER bypass 동작 | PASS — PermissionAspect MASTER bypass 확인 |
| X-User-Id all-zero UUID 안전성 | PASS — MASTER bypass 이전 단계에서 통과, accountId 파싱 미도달 |
| compileJava + compileTestJava | PASS — BUILD SUCCESSFUL |
| 테스트 갭 | P2 갭 — 경로 정합 계약 테스트 부재 (비차단) |
| 운영 주의 | 운영 배포 이력 있을 경우 outbox 급처리 주의 (조건부, 비차단) |

**BE APPROVE (slipclient fix)**

신규 결함 없음. P2 갭(경로 계약 테스트 부재) 및 운영 outbox 주의 명시.
