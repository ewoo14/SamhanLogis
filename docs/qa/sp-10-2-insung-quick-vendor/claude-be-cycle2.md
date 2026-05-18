# SP-10-2 BE 리뷰 — Cycle 2 (head: 36379838)

**리뷰어**: Backend Engineer (Claude)
**대상 commit**: `36379838a55b2834ef2dad0bd756c01b5d5cb352`
**리뷰 일자**: 2026-05-19

---

## 1. 총평

Cycle 1에서 Claude TM + Codex TM이 지적한 P0 1건 + P1 7건 + P2 5건 = 총 13건의 BE 결함이 본 commit에서 전반적으로 올바르게 해소되었다. P0-1(vendorOrderId Vehicle 저장 누락), P1-1(상태 가드), P1-2(sandbox=false + secret blank 하드 페일), P1-3(raw body bytes HMAC), C-P1-1(서명 idempotency), C-P1-2(nullable 방어) 등 핵심 결함이 코드 수준에서 실제로 fix 되었음을 라인 단위로 확인했다. 단위 테스트(InsungQuickDriverMatcherTest)와 통합 테스트(InsungQuickIntegrationIT TC-1~5)도 실 흐름을 검증하는 방향으로 개선되었다. 다만 Cycle 2 신규 발견으로 P2 경계의 2건 — `parseCapturedAt`의 오프셋(+09:00) 미처리와 `TestPropertySource` 미사용 import — 이 남아 있어 FIX 요청으로 판정한다.

---

## 2. Cycle 1 결함 해결 검증 (13건)

### P0

| ID | 항목 | 판정 | 증거 (file:line) |
|----|------|------|-----------------|
| P0-1 | `InsungQuickDriverMatcher.match()` — `vehicle.updateVendorOrderId()` + `vehicleRepository.save()` 추가 | **PASS** | `InsungQuickDriverMatcher.java:71-72` — `vehicle.updateVendorOrderId(vendorOrderId)` 직후 `vehicleRepository.save(vehicle)` 호출 확인. `InsungQuickDriverMatcherTest.java:87` — `verify(vehicleRepository).save(vehicle)` assertion 추가 확인. |

### P1

| ID | 항목 | 판정 | 증거 (file:line) |
|----|------|------|-----------------|
| P1-1 | `handleMatchResult` / `handleStatusUpdate` 상태 가드 | **PASS** | `InsungWebhookService.java:101-110` — MATCHING/PENDING 시에만 `assignDriver()` 진입, 그 외 WARN 로그 skip. `handleStatusUpdate:139-148` — DEPARTED 시 ASSIGNED/MATCHING 만 `markDeparted()`, 그 외 skip 로그. |
| P1-2 | `verifyInsungSignature` sandbox=false + webhookSecret blank → `BusinessException(INSUNG_QUICK_NOT_CONFIGURED)` | **PASS** | `ArologisInternalController.java:272-276` — `webhookSecret == null || blank` 시 `BusinessException(ErrorCode.INSUNG_QUICK_NOT_CONFIGURED, ...)` throw 확인. |
| P1-3 | HMAC 검증 raw body bytes (`@RequestBody String rawBody` + `rawBody.getBytes(UTF-8)`) | **PASS** | `ArologisInternalController.java:175, 207, 241` — 3개 webhook endpoint 모두 `@RequestBody String rawBody` 수신. `verifyInsungSignature:278` — `rawBody.getBytes(StandardCharsets.UTF_8)` 사용. `readInsungBody:286-292` — ObjectMapper deserialization 분리. |
| C-P1-1 | signature idempotency — `findByStopIdAndSource(stopId, source)` 중복 skip | **PASS** | `SignatureRepository.java:19` — `Optional<Signature> findByStopIdAndSource(UUID, SignatureSource)` 메서드 추가. `InsungWebhookService.java:220-226` — `isPresent()` 시 WARN 로그 + `return`. TC-4 두 번째 요청에서 signature 1건만 저장됨을 `InsungQuickIntegrationIT.java:300-315` 가 검증. |
| C-P1-2 | controller response nullable 방어 (`safeVendorOrderId()` + `stopSequence != null ? : -1`) | **PASS** | `ArologisInternalController.java:182, 215-217, 249-251` — 3개 endpoint 모두 `safeVendorOrderId()`, `stopSequence != null ? req.stopSequence() : -1` 적용. `safeVendorOrderId:294-296` — null 시 `<unknown>` 반환. |

### P2

| ID | 항목 | 판정 | 증거 (file:line) |
|----|------|------|-----------------|
| P2-1 | `MatcherConfig` stale "UnsupportedOperationException throw — D-P10-03" 로그 제거 | **PASS** | `MatcherConfig.java:38` — 로그가 `"DriverMatcher = insung-quick (Phase 10 W10-2 vendor 통합 활성)"` 로 교체. diff 확인. |
| P2-2 | `handleDelivered` stops 빈 목록 시 skip | **PASS** | `InsungWebhookService.java:197-200` — `stops.isEmpty()` 시 WARN 로그 + `return`. |
| P2-3 | `parseCapturedAt` `iso.replace("Z","")` ISO-8601 파싱 | **PASS** | `InsungWebhookService.java:259` — `iso.replace("Z", "")` 적용. 기존 `.replace("T", "T")` no-op 제거. |
| P2-4 | `INSUNG_QUICK_SUBMIT_FAILED` (BAD_GATEWAY) 신규 + `InsungQuickClientImpl` 4 catch 분리 | **PASS** | `ErrorCode.java:129-130` — `INSUNG_QUICK_SUBMIT_FAILED(HttpStatus.BAD_GATEWAY, ...)` 추가. `InsungQuickClientImpl.java:170, 227, 265, 313` — 4개 메서드 `RestClientException` catch에서 `INSUNG_QUICK_SUBMIT_FAILED`로 통일. `INSUNG_QUICK_NOT_CONFIGURED`는 guardApiKey 전용으로 분리. |
| P2-5 | `InsungQuickDriverMatcherTest` vendor_order_id 저장 + `verify(save)` assertion 추가 | **PASS** | `InsungQuickDriverMatcherTest.java:87, 113` — `requestMatch pending` 케이스에서 `assertThat(vehicle.getVendorOrderId()).isEqualTo("VENDOR-ORD-001")` + `verify(vehicleRepository).save(vehicle)`. 매칭 성공 케이스에서도 동일. |

---

## 3. Cycle 2 신규 발견

### P2-1 (신규): `parseCapturedAt` — timezone offset(`+09:00`) 미처리

**심각도**: P2 (MINOR)
**위치**: `InsungWebhookService.java:259`

**현상**: 현재 로직은 `iso.replace("Z", "")` 만 적용한다. 인성데이타 vendor가 KST 오프셋 포함(`2026-05-19T10:30:00+09:00`)을 보낼 경우 `Z` 제거 후에도 `+09:00`이 남아 `LocalDateTime.parse()` 가 실패하고 fallback `now()`가 대체된다. 실운영에서 capturedAt 필드가 실제 서명 시각 대신 처리 시각으로 저장될 수 있다.

**현재 코드**:
```java
return LocalDateTime.parse(iso.replace("Z", ""));
```

**권장 fix**: `OffsetDateTime.parse()` 후 `toLocalDateTime()` 변환, 또는 정규식으로 오프셋 제거.
```java
try {
    return OffsetDateTime.parse(iso).toLocalDateTime();
} catch (DateTimeParseException e1) {
    try {
        return LocalDateTime.parse(iso.replace("Z", ""));
    } catch (DateTimeParseException e2) {
        log.warn("[InsungWebhook] capturedAt 파싱 실패='{}' — now() 대체", iso);
        return LocalDateTime.now();
    }
}
```

### P2-2 (신규): `InsungQuickIntegrationIT` — 미사용 import `TestPropertySource`

**심각도**: P2 (MINOR / 정리)
**위치**: `InsungQuickIntegrationIT.java:55`

**현상**: `import org.springframework.test.context.TestPropertySource;` 가 있으나 실제로 `@TestPropertySource` 어노테이션은 사용되지 않는다 (properties는 `@SpringBootTest(properties = {...})`로 대신 지정). 컴파일은 되지만 불필요한 import.

**권장 fix**: 해당 import 라인 제거.

---

## 4. 추가 검증 항목 — 이상 없음 (목록)

| 항목 | 결과 | 근거 |
|------|------|------|
| `AbstractPostgresIT.matcher.provider=mock` 강제 override 제거 → 다른 IT 회귀 | **이상 없음** | `application.yml:66` — `provider: ${SAMHAN_AROLOGIS_MATCHER_PROVIDER:mock}` 기본값이 `mock`. `InsungQuickIntegrationIT`만 `properties = {"samhan.arologis.matcher.provider=insung-quick"}` 로 override. 나머지 IT는 기본값 `mock` 사용. |
| `ArologisAdminControllerIT` auto-match — `InsungQuickClient` MockBean 누락 위험 | **이상 없음** | `application.yml` 기본 sandbox-mode=true이므로 `InsungQuickClientImpl.requestOrder()` 가 실 HTTP 미호출. `DispatchService.java:153-155` — `UnsupportedOperationException` 외에도 일반 `Exception` catch (fail-soft)로 런타임 오류 흡수. 회귀 없음 확인. |
| `HmacSignatureVerifier.verify()` — signature null 동작 | **이상 없음** | `HmacSignatureVerifier.java:38-40` — `signature == null || blank` 시 false 반환. `verifyInsungSignature` 에서 `HmacSignatureVerifier.verify(...) == false` → `AccessDeniedException` throw. sandbox=true 시 이 경로 미진입. |
| `handleDelivered` lambda 내 `return` — 외부 stream 처리 영향 | **이상 없음 (구조 주의)** | `InsungWebhookService.java:225` `return`은 `ifPresent()` Consumer 내부 조기 종료이며 lambda 범위에서만 효과. 라인 238 `vehicle.updateVendorStatus("DELIVERED")` 및 라인 241-251 allDelivered 체크는 항상 실행된다. 중복 webhook 시 stop.markDelivered()는 `status != DELIVERED` 조건(라인 216)으로 이미 skip되므로 allDelivered 재계산에 영향 없음. |
| `vehicle.markDelivered()` 동시성 안전 | **기존 구조적 문제 (이번 PR 범위 외)** | `BaseEntity.java`에 `@Version` 없음. arologis-service 전체에 낙관적 락 미적용 — 이번 PR 도입이 아닌 기존 상태. webhook 처리는 `@Transactional` 레벨에서 DB row lock으로 일부 보호되나 완전한 CAS 보장은 아님. Phase 11 이전 별도 이슈로 추적 권장. |
| `Phase10VendorPlaceholderGuardConsistencyTest` — 신규 ErrorCode 일관성 | **이상 없음** | `Phase10VendorPlaceholderGuardConsistencyTest.java:136-138` — `INSUNG_QUICK_NOT_CONFIGURED.getHttpStatus().value() == 502` 검증. `INSUNG_QUICK_SUBMIT_FAILED` 에 대한 별도 테스트는 없으나 `ErrorCode.java:129-130` — `BAD_GATEWAY(502)` 일관. 추가 assertion은 권고 수준. |
| `InsungQuickIntegrationIT` TC-1 실 흐름 검증 강도 | **개선됨** | 이전 TC-1은 직접 DB 조작 후 단순 상태 확인이었으나, 현재는 `POST /internal/arologis/dispatches` MockMvc 호출 → InsungQuickDriverMatcher 전 흐름 통과 → `vehicleRepository.findByVendorOrderId("SANDBOX-IT-001")` 로 실 저장 검증. 충분한 E2E 강도. |
| `DispatchService.java:153-154` — `UnsupportedOperationException` catch dead code | **P2 수준 (이번 PR 범위 외)** | InsungQuickDriverMatcher 실 구현 이후 UnsupportedOperationException이 발생하지 않으므로 dead code. 제거를 권고하나 이번 PR에서 신규 도입된 것이 아니고 기존 코드. |

---

## 5. 최종 판정

**FIX 요청 (Cycle 3 진입 필요)**

Cycle 1 결함 13건은 모두 **PASS** 판정이다. 단, Cycle 2에서 신규 발견된 2건이 있다:

1. **P2-1** `parseCapturedAt` timezone offset(`+09:00`) 미처리 — 실운영에서 capturedAt 정확도 저하 위험
2. **P2-2** `InsungQuickIntegrationIT` 미사용 `TestPropertySource` import — 코드 정리

P2-1은 `OffsetDateTime.parse().toLocalDateTime()` 방식으로 수정을 권장한다. P2-2는 import 1줄 제거이다. 두 건 모두 Cycle 3에서 수정 후 재검증 의무. Cycle 3 완료 시 APPROVE 가능.
