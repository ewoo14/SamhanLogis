# SP-10-2 BE 리뷰 — Claude Cycle 1

> PR #245 `feat/sp-10-2-insung-quick-program` (head `f82a5ad5`)
> 리뷰어: Claude BE subagent
> 리뷰일: 2026-05-19

---

## 총평

전체 아키텍처 방향 (InsungQuickClient interface/impl 분리, SP-09 vendor 패턴 일관, sandbox-mode 토글, HMAC 이중 가드, @MockBean 격리 IT, Phase10VendorPlaceholderGuardConsistencyTest) 은 올바르다. 그러나 **vendor_order_id 저장 경로가 매처 계층에서 완전히 단절**되어 있어 IT 는 통과하지만 실 운영에서 webhook 흐름 3종이 전혀 동작하지 않는 P0 결함이 존재한다. 아래 P0/P1/P2 를 모두 수정한 뒤 cycle 2 진입이 필요하다.

---

## P0 — 즉시 차단

### P0-1: InsungQuickDriverMatcher.match() — vendor_order_id DB 미저장으로 webhook 흐름 완전 단절

**위치:** `services/arologis-service/src/main/java/com/samhanair/logis/arologis/matcher/InsungQuickDriverMatcher.java` L57–L100

**문제:**

`InsungQuickClient.requestOrder()` 가 `vendorOrderId` 를 반환하지만 `Vehicle.updateVendorOrderId()` 가 단 한 번도 호출되지 않는다. 이로 인해 `vehicles.vendor_order_id` 컬럼은 항상 NULL 이다.

`InsungWebhookService` 의 세 메서드 (`handleMatchResult` / `handleStatusUpdate` / `handleDelivered`) 는 모두 `vehicleRepository.findByVendorOrderId(req.vendorOrderId())` 로 vehicle 을 조회한다. vendor_order_id 가 저장되지 않은 상태이므로 Optional.empty() 가 반환되고 webhook 처리 로직이 전부 skip 된다.

**추가 확인:**

`DispatchReceiveService.matchAndNotify()` 에서도 매칭 성공 후 `vehicle.assignDriver(driverId, src, result.externalRefId())` 로 `external_ref_id` 컬럼에만 저장한다. `vendor_order_id` 컬럼에는 별도 저장이 없다. `externalRefId` 와 `vendorOrderId` 는 Vehicle 엔티티에서 서로 다른 필드/컬럼이다.

```
// Vehicle 엔티티
@Column(name = "external_ref_id", length = 100)
private String externalRefId;          // assignDriver()로 저장

@Column(name = "vendor_order_id", length = 64)
private String vendorOrderId;          // updateVendorOrderId()로만 저장 — 현재 호출 없음
```

**IT 마스킹:** TC-2/TC-3/TC-4 는 모두 `vehicle.updateVendorOrderId(...)` 를 직접 호출하여 사전 상태를 설정한다. 따라서 IT 는 통과하지만 실 운영 흐름 (requestOrder → webhook) 을 검증하지 못한다.

**수정 방향:**

`InsungQuickDriverMatcher.match()` 에서 `requestOrder()` 성공 직후 아래 두 줄을 추가해야 한다.

```java
vehicle.updateVendorOrderId(vendorOrderId);
vehicleRepository.save(vehicle);
```

pending 상태에서 empty() 반환 전에도 동일하게 저장이 필요하다 (webhook callback 에서 vehicle 을 찾아야 하므로).

---

## P1 — 이번 사이클 수정 필수

### P1-1: handleMatchResult — DEPARTED/DELIVERED 상태에서 match-result webhook 재수신 시 ASSIGNED 로 상태 후퇴

**위치:** `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/insung/InsungWebhookService.java` L99–L104

**문제:**

`vehicle.assignDriver()` 는 현재 vehicle 상태 검증 없이 무조건 `status = ASSIGNED` 로 설정한다. 이미 DEPARTED 또는 DELIVERED 상태인 vehicle 에 match-result webhook 이 재수신되면 상태가 ASSIGNED 로 후퇴한다. webhook 중복 수신 또는 네트워크 재전송 시나리오에서 발생 가능하다.

**수정 방향:**

`handleMatchResult` 에서 `vehicle.getStatus()` 가 MATCHING 또는 PENDING 인 경우에만 `assignDriver` 를 호출하도록 상태 가드를 추가해야 한다.

```java
if (vehicle.getStatus() == VehicleStatus.MATCHING
        || vehicle.getStatus() == VehicleStatus.PENDING) {
    vehicle.assignDriver(driver.getId(), MatchSource.EXTERNAL_INSUNG_QUICK, req.vendorOrderId());
} else {
    log.warn("[InsungWebhook] 매칭 완료 수신 but vehicle.status={} — idempotent skip",
            vehicle.getStatus());
}
```

### P1-2: verifyInsungSignature — webhookSecret 미설정 시 HMAC 검증 우회

**위치:** `services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisInternalController.java` L253–L257

**문제:**

```java
if (webhookSecret == null || webhookSecret.isBlank()) {
    log.warn("[ArologisInternal] webhookSecret 미설정 — HMAC 검증 우회 (운영 환경 주입 필요)");
    return;
}
```

`SAMHAN_INSUNG_QUICK_WEBHOOK_SECRET` 환경변수가 비어있으면 (default 빈 값) sandbox-mode=false 운영 환경에서도 HMAC 검증이 완전히 우회된다. 인성 측이 아닌 임의 요청도 webhook endpoint 를 통과할 수 있다. 운영 전환 시 즉시 위험 노출된다.

`application.yml` 에서 `webhook-secret: ${SAMHAN_INSUNG_QUICK_WEBHOOK_SECRET:}` (빈 값 default) 이므로 운영 배포 시 주입 누락을 탐지하지 못한다.

**수정 방향:**

sandbox-mode=false 이고 webhookSecret 이 blank 인 경우 우회하지 않고 즉시 AccessDeniedException 을 throw 해야 한다.

```java
if (webhookSecret == null || webhookSecret.isBlank()) {
    if (!sandboxMode) {
        log.error("[ArologisInternal] webhookSecret 미설정 — 운영 환경 HMAC 검증 불가. 요청 거부.");
        throw new org.springframework.security.access.AccessDeniedException(
                "webhookSecret 미설정 — SAMHAN_INSUNG_QUICK_WEBHOOK_SECRET 주입 필요");
    }
    log.warn("[ArologisInternal] webhookSecret 미설정 — sandbox-mode HMAC 검증 우회");
    return;
}
```

### P1-3: verifyInsungSignature — reqBody.toString() 으로 HMAC 계산 (불안정)

**위치:** `services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisInternalController.java` L262

**문제:**

```java
byte[] bodyBytes = reqBody.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
```

`reqBody` 는 Java record (`InsungMatchResultRequest` 등) 이다. `toString()` 은 `record(field1=value1, field2=value2, ...)` 형식의 자동 생성 문자열을 반환한다. 인성 vendor 가 계산하는 HMAC 은 raw HTTP request body JSON 기반이므로 양쪽 서명이 항상 불일치한다. Javadoc 에도 "실 운영에서는 raw byte 사용 권장" 이라고 명시되어 있으나 수정 없이 그대로다.

**수정 방향:**

Controller 에서 raw body 를 `@RequestBody byte[]` 로 먼저 수신하거나, `HttpServletRequest.getInputStream()` 을 통해 raw bytes 를 별도로 읽어야 한다. 또는 `ObjectMapper` 로 직렬화한 JSON 바이트를 사용해야 한다.

```java
// 최소 수정안: ObjectMapper 직렬화
byte[] bodyBytes = objectMapper.writeValueAsBytes(reqBody);
```

실 운영 환경에서는 인성 측이 보낸 원본 JSON body 의 HMAC 과 일치해야 하므로 `HttpServletRequest` 기반 raw byte 읽기가 가장 정확하다.

---

## P2 — 다음 사이클 전까지 수정 권장

### P2-1: MatcherConfig Javadoc + log message stale — "UnsupportedOperationException throw" 잔재

**위치:** `services/arologis-service/src/main/java/com/samhanair/logis/arologis/config/MatcherConfig.java` L17, L39

**문제:**

클래스 Javadoc 에 `(W10-2 시점 활성, 본 PR 호출 시 throw)`, log.info 메시지에 `현재 호출 시 UnsupportedOperationException throw — D-P10-03` 이 남아 있다. W10-2 PR 에서 실 구현으로 교체되었으므로 오해를 유발한다.

**수정 방향:**

"UnsupportedOperationException throw" 관련 문구를 제거하고, "W10-2 실 구현 활성" 으로 교체한다.

### P2-2: handleDelivered — stops 빈 목록 시 vacuously true allDelivered

**위치:** `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/insung/InsungWebhookService.java` L229–L237

**문제:**

```java
boolean allDelivered = stops.stream()
        .filter(s -> s.getStatus() != StopStatus.UNPARSED)
        .allMatch(s -> s.getStatus() == StopStatus.DELIVERED || s.getStatus() == StopStatus.FAILED);
```

UNPARSED 제외 후 stops 가 0건이면 `allMatch` 는 vacuously true 를 반환한다. Vehicle 에 정차가 없거나 전부 UNPARSED 상태인 경우 delivered webhook 한 건만 수신해도 vehicle 이 즉시 DELIVERED 로 전이된다.

**수정 방향:**

```java
boolean allDelivered = !stops.isEmpty() && stops.stream()
        .filter(s -> s.getStatus() != StopStatus.UNPARSED)
        .allMatch(...);
```

또는 필터 후 스트림이 비어있으면 false 처리한다.

### P2-3: parseCapturedAt — `.replace("T", "T")` noop

**위치:** `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/insung/InsungWebhookService.java` L248

**문제:**

```java
return LocalDateTime.parse(iso.replace("Z", "").replace("T", "T"));
```

`.replace("T", "T")` 는 T 를 T 로 교체하는 noop 이다. 의도가 불분명하다 (`replace("T", " ")` 로 공백 치환을 원했을 가능성). 현재는 Z suffix 제거 후 `LocalDateTime.parse()` 가 정상 동작하므로 기능 결함은 없지만 코드 혼란을 유발한다.

**수정 방향:**

`.replace("T", "T")` 를 제거하거나, 원래 의도가 공백 치환이었다면 `replace("T", "T")` 대신 올바른 처리로 수정한다.

### P2-4: INSUNG_QUICK_NOT_CONFIGURED — 5xx/network 런타임 실패에 설정 오류 코드 재사용

**위치:** `services/arologis-service/src/main/java/com/samhanair/logis/arologis/client/InsungQuickClientImpl.java` L170, L227, L265, L313

**문제:**

5xx/network 오류 발생 시 `BusinessException(ErrorCode.INSUNG_QUICK_NOT_CONFIGURED, ...)` 를 throw 한다. `NOT_CONFIGURED` 는 API 키 미설정/placeholder 문제를 나타내는 코드이므로 런타임 통신 실패에 사용하면 오해를 유발한다. SP-09 패턴에서는 `ETAX_SUBMIT_FAILED` / `OCR_SUBMIT_FAILED` / `KFTC_SUBMIT_FAILED` 처럼 별도 runtime 실패 코드가 존재한다.

**수정 방향:**

`INSUNG_QUICK_SUBMIT_FAILED` (또는 `INSUNG_QUICK_RPC_FAILED`) ErrorCode 를 `ErrorCode.java` 에 추가하고 5xx/network 케이스에 적용한다. placeholder 차단은 `INSUNG_QUICK_NOT_CONFIGURED` 유지.

### P2-5: TC-1 — InsungWebhookService 실 흐름 미검증 (직접 도메인 메서드 조작)

**위치:** `services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/InsungQuickIntegrationIT.java` TC-1 (L151–L173)

**문제:**

TC-1 ("sandbox-mode + requestMatch 성공 → Vehicle.status ASSIGNED 전이") 은 `mockMvc.perform()` 없이 직접 `driverRepository.save()` → `vehicle.assignDriver()` → `vehicleRepository.save()` 를 호출해서 상태를 수동으로 설정한 뒤 `assertThat` 만 확인한다. `InsungQuickDriverMatcher.match()` 실 흐름을 전혀 거치지 않는다.

TC-1 에 명시된 "provider=insung-quick + sandbox-mode + requestMatch 성공 → ASSIGNED 전이" 검증 의도와 다른 구현이다. P0-1 수정 후 실 matcher 흐름을 거치는 테스트로 교체해야 한다.

---

## 긍정적 평가 (유지 사항)

| 항목 | 평가 |
|---|---|
| InsungQuickClient interface/impl 분리 | SP-09 vendor 패턴 일관, 교체 용이 구조 |
| 5 placeholder 키워드 + blank = 6종 차단 | 플랜 명세 정합 |
| sandbox-mode 토글 (default=true) | prod 무중단 cutover 구조 정상 |
| `@Retryable` + `@EnableRetry` | maxAttempts=2, 5s timeout 정합 |
| `HmacSignatureVerifier` constant-time equals | timing attack 방지 |
| `@MockBean InsungQuickClient` + lenient stub | SP-09-5 IT 패턴 일관 |
| `@MockBean DynamicPermissionClient` | SP-D3 cycle 3 회고 의무 준수 |
| Phase10VendorPlaceholderGuardConsistencyTest | false-positive 가드 (`sandbox-key-xxx`, `test` 합법키) |
| V13 migration NULL 허용 + partial unique index | legacy 호환 + race 가드 구조 정합 |
| `MatchSource.EXTERNAL_INSUNG_QUICK` / `DriverSource.EXTERNAL_INSUNG_QUICK` | 도메인 식별자 일관 |
| driverCode = `INSUNG-<vendorDriverId>` | UUID 비공개 가드 준수 |
| 한국어 Javadoc | 신규 엔티티/도메인 메서드/Service/Controller 전반 |
| `docs/operational-validation/sp-10-2-insung-key-rotation.md` 화이트리스트 등록 | CI grep 가드 정상 |

---

## 수정 우선순위 요약

| 번호 | 등급 | 파일 | 내용 |
|---|---|---|---|
| P0-1 | P0 | `InsungQuickDriverMatcher.java` | `requestOrder()` 후 `vehicle.updateVendorOrderId() + vehicleRepository.save()` 추가 (pending/성공 양쪽) |
| P1-1 | P1 | `InsungWebhookService.java` | `handleMatchResult` 에 상태 가드 추가 (DEPARTED/DELIVERED 재webhook 시 상태 후퇴 방지) |
| P1-2 | P1 | `ArologisInternalController.java` | sandbox=false + webhookSecret blank 시 우회 → AccessDeniedException throw |
| P1-3 | P1 | `ArologisInternalController.java` | `reqBody.toString()` → `objectMapper.writeValueAsBytes(reqBody)` (최소 수정) |
| P2-1 | P2 | `MatcherConfig.java` | Javadoc + log stale 제거 |
| P2-2 | P2 | `InsungWebhookService.java` | `allDelivered` 빈 stops 예외 처리 |
| P2-3 | P2 | `InsungWebhookService.java` | `parseCapturedAt` noop `.replace("T","T")` 제거 |
| P2-4 | P2 | `ErrorCode.java` + `InsungQuickClientImpl.java` | `INSUNG_QUICK_SUBMIT_FAILED` 추가 + 5xx 분리 |
| P2-5 | P2 | `InsungQuickIntegrationIT.java` | TC-1 실 matcher 흐름 검증으로 교체 (P0-1 수정 전제) |
