# SP-10-2 BE IT cross-check — InsungQuickIntegrationIT 검증

> 작성일: 2026-05-19
> 담당: QA Agent
> 브랜치: `feat/sp-10-2-insung-quick-program`
> 참조 계획: `docs/planning/2026-05-19_sp-10-2-insung-quick-program.md` §2 BE-6

---

## 개요

`InsungQuickIntegrationIT` (BE-6) 에 대한 QA cross-check.
SP-D3 cycle 3 회고 가드 2종 (`X-User-Role` 헤더, `@MockBean DynamicPermissionClient`) + SP-09 패턴 일관성 검증.

---

## 1. @MockBean 격리 패턴 검증 (feedback_it_mockbean_external_clients.md)

### 1-1. 의무 @MockBean 목록

`InsungQuickIntegrationIT` 에 반드시 포함해야 하는 `@MockBean`:

| @MockBean 대상 | 이유 | 선행 패턴 |
|---------------|------|----------|
| `InsungQuickClient` | SP-10-2 신규 외부 RestClient — 실 API 미확정 sandbox | BE-6 주요 대상 |
| `DynamicPermissionClient` | SP-D2 P04 트랩 — Eureka 비활성 시 500 방지 | SP-D3 cycle 3 회고 |
| `PartnerClient` | 기존 외부 RestClient | `ArologisInternalControllerIT` 패턴 일관 |
| `SlipClient` | 기존 외부 RestClient | 동일 |
| `NotificationClient` | 기존 외부 RestClient | 동일 |
| `SlipServiceClient` | 기존 외부 RestClient | 동일 |

누락 시 Eureka 비활성 환경에서 ApplicationContext 로드 실패 또는 500 응답 발생.

### 1-2. lenient stub 패턴 의무

`@BeforeEach` 에서 모든 `@MockBean` 에 `lenient()` stub 적용:

```java
@BeforeEach
void setUp() {
    // SP-10-2 신규
    lenient().when(insungQuickClient.requestOrder(any(), any()))
             .thenReturn(InsungQuickOrderResponse.of("INSUNG-ORDER-SANDBOX-001"));
    lenient().when(insungQuickClient.requestMatch(any()))
             .thenReturn(InsungQuickMatchResponse.pending());
    lenient().when(insungQuickClient.cancelOrder(any())).thenReturn(true);
    lenient().when(insungQuickClient.queryStatus(any()))
             .thenReturn(InsungQuickStatusResponse.of("PENDING"));

    // SP-D2 P04 트랩 방지 — cycle 3 회고
    lenient().when(dynamicPermissionClient.checkPermission(any(), any(), any()))
             .thenReturn(PermissionCheckResponse.allowed());

    // 기존 외부 client lenient stub
    lenient().when(partnerClient.findByCodes(any())).thenReturn(List.of());
    lenient().when(partnerClient.findByCode(any())).thenReturn(Optional.empty());
    lenient().when(slipClient.registerSignature(any(), any())).thenReturn(false);
    lenient().when(notificationClient.send(any(), any(), any(), any())).thenReturn(true);
    lenient().when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(List.of());
}
```

---

## 2. X-User-Role 헤더 명시 (SP-D3 cycle 3 회고 가드)

SP-D3 cycle 3에서 발견된 트랩: IT 에서 `X-User-Role` 헤더 누락 시 Spring Security 403.
`InsungQuickIntegrationIT` 에서 `/internal/arologis/insung/*` 엔드포인트 테스트 시 반드시 명시.

```java
// 올바른 패턴 — X-Internal-Token + X-User-Role 명시
mockMvc.perform(post("/internal/arologis/insung/match-result")
    .header("X-Internal-Token", "test-internal-token")
    .header("X-User-Role", "DISPATCH")           // ← SP-D3 cycle 3 회고 가드
    .contentType(MediaType.APPLICATION_JSON)
    .content(matchResultJson))
    .andExpect(status().isOk());
```

단, `/internal/*` 엔드포인트는 `X-Internal-Token` 검증만 하고 `X-User-Role` 없이도 허용하는 구조라면
`X-User-Role` 헤더 불필요 — 설계에 따라 결정. **의문 시 X-User-Role 포함이 더 안전**.

---

## 3. BE-6 InsungQuickIntegrationIT 5 케이스 cross-check

### C1: provider=insung-quick + sandbox-mode → match 요청 200

```
시나리오: samhan.arologis.matcher.provider=insung-quick, sandboxMode=true
         InsungQuickClient.requestOrder() → SANDBOX 응답 mock
         Vehicle 생성 → /internal/arologis/insung/match-result (PENDING 응답)
기대:   200 OK + vehicle.vendor_order_id 설정됨 + vehicle.status = PENDING (sandbox)
@MockBean: InsungQuickClient.requestOrder() → InsungQuickOrderResponse.of("INSUNG-ORDER-SANDBOX-001")
           DynamicPermissionClient.checkPermission() → allowed()
```

cross-check 항목:
- `@MockBean InsungQuickClient` 존재 여부
- `@MockBean DynamicPermissionClient` 존재 여부 (SP-D2 P04 트랩 방지)
- `lenient()` wrapper 적용 여부
- vendor_order_id 값이 `INSUNG-ORDER-*` 형식인지
- UUID 비공개 원칙 — vendorOrderId 가 UUID 형식이 아닌지

### C2: RPC 예외 → fail-soft (DriverMatchResult.empty() + Vehicle.status PENDING 유지)

```
시나리오: InsungQuickClient.requestMatch() → RuntimeException throw
기대:   InsungQuickDriverMatcher.match() → fail-soft → DriverMatchResult.empty()
        Vehicle.status = PENDING (MATCHING 으로 전이하지 않음)
@MockBean: InsungQuickClient.requestMatch(any()) → throw new RuntimeException("RPC timeout")
```

cross-check 항목:
- `@MockBean InsungQuickClient` 에서 throw 가능 여부 (lenient 아닌 doThrow 패턴)
- `InsungQuickDriverMatcher.match()` 가 RuntimeException 잡고 `DriverMatchResult.empty()` 반환하는지
- Vehicle 상태가 PENDING 으로 유지되는지 DB 단 검증 (testcontainer PostgreSQL)

### C3: webhook match-result 수신 → Vehicle.status ASSIGNED + driverCode INSUNG-*

```
시나리오: POST /internal/arologis/insung/match-result (vendorDriverId=7291)
기대:   Vehicle.status → ASSIGNED
        Driver.driverCode = "INSUNG-7291"
        MatchSource = EXTERNAL_INSUNG_QUICK
엔드포인트: POST /internal/arologis/insung/match-result
헤더: X-Internal-Token, X-Insung-Signature (sandbox 우회 모드)
```

cross-check 항목:
- `/internal/arologis/insung/match-result` 엔드포인트 존재 여부 (BE-3)
- `X-Internal-Token` 검증 후 200 응답
- `Driver.driverCode` = "INSUNG-7291" (UUID 비공개 원칙 준수)
- `MatchSource.EXTERNAL_INSUNG_QUICK` enum 값 DB 저장

### C4: webhook delivered 수신 → Vehicle.status DELIVERED

```
시나리오: POST /internal/arologis/insung/delivered (전자서명 + GPS 포함)
기대:   Vehicle.status → DELIVERED
        전자서명 저장 (signature 필드)
        GPS 좌표 저장 (driver_location source=EXTERNAL_INSUNG_LBS)
```

cross-check 항목:
- DELIVERED 전이 후 vehicle.vendor_status 컬럼 값 "DELIVERED" 설정
- 전자서명 저장 (SignatureCopy 패턴 일관 — PR #sign 이력 참조)
- driver_location source = EXTERNAL_INSUNG_LBS row 생성

### C5: placeholder 가드 — API key 미설정 시 BusinessException(INSUNG_QUICK_NOT_CONFIGURED)

```
시나리오: samhan.arologis.matcher.insung-quick.api-key 빈 값 (placeholder 금지 패턴)
         InsungQuickClientImpl.isPlaceholderApiKey() = true
기대:   InsungQuickClientImpl 메서드 호출 시 BusinessException(INSUNG_QUICK_NOT_CONFIGURED) throw
         HTTP 응답: 502 또는 503 (외부 의존 불가 응답 코드)
@MockBean: 불필요 — InsungQuickClientImpl 직접 생성, placeholder key 주입
```

cross-check 항목:
- `Phase10VendorPlaceholderGuardConsistencyTest` 에서 6 키워드 차단 검증 (BE-7)
- 6 키워드: `PLACEHOLDER_DEV_ONLY`, `CHANGE_ME_LOCAL_ONLY`, `changeme`, `dummy`, 빈 값, `sandbox-key-xxx`
- `sandbox-key-xxx` 는 정상 통과 (false positive 가드 — BE-7 양 방향 검증)
- `InsungQuickIntegrationIT` C5 에서 `samhan.arologis.matcher.insung-quick.api-key=` (빈 값) 주입 후 BusinessException 발생 확인

---

## 4. AbstractPostgresIT 프로퍼티 확장 필요 사항

`InsungQuickIntegrationIT` 가 `AbstractPostgresIT` 를 상속할 경우,
`@DynamicPropertySource` 에 아래 프로퍼티 추가 필요:

```java
// AbstractPostgresIT.registerDatasource() 에 SP-10-2 신규 프로퍼티 추가
registry.add("samhan.arologis.matcher.provider", () -> "insung-quick");
registry.add("samhan.arologis.matcher.insung-quick.sandbox-mode", () -> "true");
registry.add("samhan.arologis.matcher.insung-quick.api-url", () -> "http://sandbox.insung.local");
registry.add("samhan.arologis.matcher.insung-quick.api-key", () -> "sandbox-key-xxx");
registry.add("samhan.arologis.matcher.insung-quick.partner-id", () -> "SANDBOX-PARTNER");
registry.add("samhan.arologis.matcher.insung-quick.webhook-secret", () -> "sandbox-webhook-secret");
registry.add("samhan.arologis.matcher.insung-quick.request-timeout-ms", () -> "5000");
registry.add("samhan.arologis.notify.dispatch-channel", () -> "insung-talk");
registry.add("samhan.arologis.notify.invite-channel", () -> "aligo");
```

단, `InsungQuickIntegrationIT` 전용 설정은 `@TestPropertySource` 또는
별도 `@SpringBootTest(properties = {...})` 로 격리하여 기존 IT 에 영향 없도록.

---

## 5. SP-09 패턴 일관성 cross-check

| SP-09 패턴 | SP-10-2 적용 여부 | cross-check 방법 |
|-----------|-----------------|----------------|
| `@MockBean` lenient stub | BE-6 의무 (§1 참조) | IT 파일 `@MockBean` grep |
| sandbox-mode 토글 | `sandboxMode=true` (AbstractPostgresIT 확장) | `ArologisMatcherProperties` 확인 |
| placeholder 6 키워드 차단 | `Phase10VendorPlaceholderGuardConsistencyTest` (BE-7) | 6 키워드 단위 테스트 |
| false-positive 가드 (`sandbox-key-xxx`) | BE-7 정상 통과 검증 | `isPlaceholderApiKey("sandbox-key-xxx") = false` |
| `BusinessException(*_NOT_CONFIGURED)` | `INSUNG_QUICK_NOT_CONFIGURED` | BE-6 C5 + 단위 테스트 |
| CI grep 가드 | DO-3 `check-credential-plaintext.sh` | `scripts/check-credential-plaintext.sh` grep 패턴 확인 |

---

## 6. SP-D3 cycle 3 회고 가드 정합 요약

| 회고 항목 | SP-D3 cycle 3 발견 내용 | SP-10-2 적용 가드 |
|----------|----------------------|----------------|
| `X-User-Role` 헤더 누락 | `/dispatch-board` IT에서 403 발생 | `/internal/arologis/insung/*` IT 에 `X-User-Role` 헤더 포함 |
| `@MockBean DynamicPermissionClient` 누락 | Eureka 비활성 → 500 | `InsungQuickIntegrationIT` `@MockBean DynamicPermissionClient` 의무 |
| lenient stub 미적용 | strict mock → `UnnecessaryStubbingException` | 모든 `@MockBean` `lenient()` wrapper |

---

## 7. Testcontainers Windows Docker 가드

`feedback_testcontainers_windows_docker.md` — Windows + Docker Desktop npipe 한계:

```
IT skip 조건: DockerClientFactory.instance().isDockerAvailable() = false
우회: DOCKER_HOST=tcp://localhost:2375 설정
```

`InsungQuickIntegrationIT` 는 `AbstractPostgresIT` 상속 시 자동으로
`DockerAvailableCondition` 에 의해 Docker 미가동 환경에서 전체 skip.

CI 환경: `DOCKER_HOST=tcp://localhost:2375` 설정 후 IT 실행.
로컬 Windows 환경: `npipe` 미지원 시 IT skip 가능 → UNSTABLE 아님, 정상 동작.
