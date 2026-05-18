# SP-10-2 인성데이타 퀵프로그램 vendor 통합 (W10-2) — BE dev-report

> 작성일: 2026-05-19
> 담당: BE (Claude)
> 브랜치: `feat/sp-10-2-insung-quick-program`
> 베이스: `b76d3cc6` (SP-D4 #244 머지 직후)

---

## §1 목표

W10-1 placeholder(`UnsupportedOperationException`) 위에 실 vendor 통합 layer 추가.
SP-09 vendor 시리즈(NTS/Aligo/Clova/KFTC) sandbox/skeleton/placeholder-guard 패턴 일관 적용.

---

## §2 BE 산출물 (BE-1 ~ BE-7)

### BE-1: InsungQuickDriverMatcher 실 구현

- 파일: `services/arologis-service/src/main/java/.../matcher/InsungQuickDriverMatcher.java`
- `UnsupportedOperationException` 제거 → `InsungQuickClient.requestOrder()` + `requestMatch()` 호출
- 매칭 성공 시 Driver upsert (driverCode = `INSUNG-<vendorDriverId>`)
- fail-soft: RPC 예외 시 `DriverMatchResult.empty()` 반환 + WARN 로그
- `MatchSource.EXTERNAL_INSUNG_QUICK` 사용 (기존 enum 값)

### BE-2: InsungQuickClient REST 어댑터

- 파일(신규):
  - `services/arologis-service/src/main/java/.../client/InsungQuickClient.java` (interface)
  - `services/arologis-service/src/main/java/.../client/InsungQuickClientImpl.java`
  - `services/arologis-service/src/main/java/.../client/dto/InsungDriverMatchResponse.java`
  - `services/arologis-service/src/main/java/.../client/dto/InsungOrderStatus.java`
- 4 메서드: `requestOrder()` / `requestMatch()` / `cancelOrder()` / `queryStatus()`
- SP-09 placeholder guard 일관 — 6 키워드 차단 + blank 차단 → `INSUNG_QUICK_NOT_CONFIGURED` (502)
- sandbox-mode=true 시 실 API 미호출, mock 응답 반환
- Spring Retry `@Retryable` (maxAttempts=2, delay=500ms)
- 4xx → fail-soft (null 또는 빈 result), 5xx/network → BusinessException

### BE-3: Webhook endpoint 3 sub-endpoint 확장

- 파일(수정): `services/arologis-service/src/main/java/.../controller/ArologisInternalController.java`
- 기존 `/dispatches/sync` 보존
- 신규 3 endpoint:
  - `POST /internal/arologis/insung/match-result` — 매칭 완료/실패
  - `POST /internal/arologis/insung/status-update` — DEPARTED/ARRIVED
  - `POST /internal/arologis/insung/delivered` — 전자서명 + GPS
- X-Internal-Token + X-Insung-Signature HMAC SHA-256 이중 검증
- sandbox-mode=true 시 HMAC 검증 우회 (WARN 로그)
- webhook DTO 신규:
  - `InsungMatchResultRequest.java`
  - `InsungStatusUpdateRequest.java`
  - `InsungDeliveredRequest.java`
- `InsungWebhookService.java` 신규 (도메인 처리 로직 분리)
- `HmacSignatureVerifier.java` 신규 (HMAC SHA-256 constant-time 비교)

### BE-4: ArologisMatcherProperties 확장

- 파일(수정): `services/arologis-service/src/main/java/.../config/ArologisMatcherProperties.java`
- `InsungQuick` 중첩 클래스: `sandboxMode(true)` + `webhookSecret` + `requestTimeoutMs(5000)` 추가
- `Notify` 중첩 클래스 신규: `dispatchChannel("insung-talk")` + `inviteChannel("aligo")`
- `Gps` 중첩 클래스 신규: `priority("insung-lbs,app-gps,manual")` + `staleThresholdMs(60000)`

### BE-5: Flyway V13

- 파일(신규): `services/arologis-service/src/main/resources/db/migration/V13__add_insung_order_ref.sql`
- `vehicles` 테이블: `vendor_order_id VARCHAR(64)` + `vendor_status VARCHAR(20)` 추가 (NULLable)
- partial unique index: `uq_vehicle_vendor_order_id_active` (`WHERE is_deleted=false AND vendor_order_id IS NOT NULL`)
- Vehicle entity: `vendorOrderId` + `vendorStatus` 필드 + `updateVendorOrderId()` + `updateVendorStatus()` 도메인 메서드 추가

### BE-6: InsungQuickIntegrationIT

- 파일(신규): `services/arologis-service/src/test/java/.../it/InsungQuickIntegrationIT.java`
- `@MockBean InsungQuickClient` lenient stub (SP-09-5 패턴 일관)
- `@MockBean DynamicPermissionClient` (SP-D3 cycle 3 회고 의무)
- 5 케이스:
  1. TC-1: sandbox-mode + requestMatch 성공 → Vehicle.status ASSIGNED
  2. TC-2: webhook match-result 수신 → DB Vehicle.status ASSIGNED + Driver upsert
  3. TC-3: webhook status-update DEPARTED → Vehicle.status DEPARTED
  4. TC-4: webhook delivered → Signature 생성 + Vehicle.status DELIVERED
  5. TC-5: RPC 예외 → DriverMatchResult.empty() + Vehicle.status PENDING 유지 (fail-soft)

### BE-7: Phase10VendorPlaceholderGuardConsistencyTest

- 파일(신규): `services/arologis-service/src/test/java/.../vendor/Phase10VendorPlaceholderGuardConsistencyTest.java`
- `Phase9VendorPlaceholderGuardConsistencyTest` 패턴 그대로
- 6 키워드 대소문자 무시 차단 검증 + blank/null 차단
- false-positive 가드: `sandbox-key-xxx` / `sk-live-xxx` 정상 통과
- `INSUNG_QUICK_NOT_CONFIGURED` ErrorCode → 502 HTTP 상태 검증

---

## §3 공통 변경 사항

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `shared/common/.../ErrorCode.java` | 수정 | `INSUNG_QUICK_NOT_CONFIGURED` (502) 신규 추가 |
| `ArologisServiceApplication.java` | 수정 | `@EnableRetry` 추가 |
| `build.gradle` (arologis-service) | 수정 | `spring-retry` + `spring-aspects` 의존성 추가 |
| `application.yml` | 수정 | `sandbox-mode` / `webhook-secret` / `request-timeout-ms` / `notify.*` / `gps.stale-threshold-ms` 추가 |
| `SignatureSource.java` | 수정 | `EXTERNAL_INSUNG_LBS` enum 값 신규 추가 |
| `VehicleRepository.java` | 수정 | `findByVendorOrderId(String)` 메서드 추가 |
| `InsungQuickDriverMatcherTest.java` | 수정 | W10-2 실 구현 단위 테스트로 교체 |

---

## §4 UUID 비공개 가드 확인

- `Driver.driverCode` = `INSUNG-<vendorDriverId>` 만 응답 노출
- 내부 `Driver.id` UUID 는 응답에 포함 없음
- `InsungDriverMatchResponse.vendorDriverId()` 는 인성 vendor 측 식별자 (문자열)
- webhook 응답에 UUID 미포함

---

## §5 컴파일 결과

```
./gradlew :services:arologis-service:assemble :services:arologis-service:testClasses
BUILD SUCCESSFUL
```

---

## §6 한국어 경계 결과

- placeholder 6 키워드 (PLACEHOLDER_DEV_ONLY / CHANGE_ME_LOCAL_ONLY / changeme / dummy / placeholder) + blank → `INSUNG_QUICK_NOT_CONFIGURED` (502)
- sandbox-mode=true (default) → 실 API 미호출, SANDBOX-* mock 응답
- webhookSecret 미설정 + sandbox-mode=true → HMAC 검증 우회 (운영 전 반드시 주입)
- sandbox-mode=false + webhookSecret blank → `BusinessException(INSUNG_QUICK_NOT_CONFIGURED)` hard fail (cycle 2 BE P1-2 fix)

---

## §7 Phase 11 backlog — vendor secret KMS migration

본 슬라이스에서는 `SAMHAN_INSUNG_QUICK_API_KEY` / `SAMHAN_INSUNG_QUICK_WEBHOOK_SECRET` / `SAMHAN_INSUNG_QUICK_PARTNER_ID` 를 `infrastructure/env-templates/arologis-service.env` 평문 env 로 관리.

Phase 11 AWS cutover (Seoul, m5.xlarge + RDS db.t3.medium) 진입 시 의무 마이그레이션:

| 항목 | 현재 (Phase 10) | Phase 11 cutover 후 |
|---|---|---|
| API_KEY | env-template 평문 (`.env`) | AWS Secrets Manager (KMS CMK 암호화) → SSM Parameter Store reference |
| WEBHOOK_SECRET | 동일 | 동일. EC2 IAM Role 로 read-only 접근 |
| PARTNER_ID | 동일 | Parameter Store SecureString |
| 회전 주기 | 수동 (운영 PC `.env`) | 90 일 자동 회전 (Secrets Manager rotation Lambda) |

- 관련 backlog: `docs/migration/phase11/M-PHASE-11-vendor-secrets-kms.md` (Phase 11 진입 시 신규 작성 의무)
- 운영 가이드: `docs/operational-validation/sp-10-2-insung-key-rotation.md` (Phase 10 수동 회전 절차)
- cutover 게이트: Phase 11 진입 PR 본문에 본 §7 링크 + KMS migration spec 첨부 의무
