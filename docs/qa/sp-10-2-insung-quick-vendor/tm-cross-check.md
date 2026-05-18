# TM Cross-Check Report — SP-10-2 인성 vendor 통합 (W10-2)

- 작성일: 2026-05-19
- 브랜치: `feat/sp-10-2-insung-quick-program` (base `b76d3cc6` main)
- 마스터 plan: `docs/planning/2026-05-19_sp-10-2-insung-quick-program.md`
- TM 검수자: Tech Manager
- 5-team 산출 다이프 stat: 21 files / +669 / -50 (`git diff main --stat`)

---

## 1. UUID 정합성: ✅ PASS

| 항목 | 결과 | 근거 |
|---|---|---|
| `vehicle.vendor_order_id` VARCHAR(64) — vendor 측 문자열 식별자 | ✅ | `V13__add_insung_order_ref.sql` line 6, UUID 아님 |
| `Driver.driverCode = INSUNG-<vendorDriverId>` 문자열 prefix | ✅ | `InsungQuickDriverMatcher.match()` line 83, `InsungWebhookService.handleMatchResult()` line 94 |
| 응답 노출 식별자 = `driverCode` 만, 내부 `driverId UUID` 비공개 | ✅ | `DispatchDetailPage.VehicleDetail.driverCode` JSDoc 명시 (line 88~91), `vendorOrderId` JSDoc "UUID 아님" 명시 (line 96) |
| cross-service join 영향 | ✅ | partner/user/slip/notification 4-client UUID 인용 변경 0건 — V13 추가 컬럼 2개 모두 활성 vehicle 행 내부 보조 컬럼 |
| partial unique index `WHERE is_deleted=false AND vendor_order_id IS NOT NULL` | ✅ | V13 line 14~16 — Soft Delete 일관 + NULL 행 허용 (race condition 가드) |
| `feedback_uuid_no_user_visibility.md` 메모리 가드 | ✅ | FE 4 컴포넌트 모두 UUID 노출 없음 (sequence / driverCode / vendorOrderId 만) |

## 2. API contract: ⚠️ FIX 1건 (FE↔QA data-testid mismatch)

| 항목 | 결과 | 근거 |
|---|---|---|
| 3 webhook endpoint `/internal/arologis/insung/{match-result,status-update,delivered}` | ✅ | `ArologisInternalController` line 164/195/225 — DTO 3종 (`InsungMatchResultRequest` / `InsungStatusUpdateRequest` / `InsungDeliveredRequest`) 정합 |
| `X-Insung-Signature` HMAC SHA-256 헤더명 일관 | ✅ | controller line 167/198/228 + `HmacSignatureVerifier` line 39 + DTO line 152 docstring + IT mockmvc header 미설정 시 sandbox-mode 우회 |
| HMAC 이중 검증 (X-Internal-Token + X-Insung-Signature) | ✅ | controller `verifyInsungSignature()` line 248 — sandbox-mode=true / webhookSecret blank 시 우회 + WARN 로그 |
| sandbox-mode HMAC 우회 — IT 가 X-Insung-Signature 미설정으로도 200 | ✅ | `InsungQuickIntegrationIT` TC-2~4 X-Internal-Token 만 설정, sandbox-mode=true 명시 (line 77) |
| `ApiResponse<Map<String,Object>>` 한국어 메시지 + meta wrapper 일관 | ✅ | controller 3 endpoint 모두 `ApiResponse.ok(Map.of("received", true, ...))` 반환, 예외는 `BusinessException(INSUNG_QUICK_NOT_CONFIGURED, "인성데이타 API 호출 실패: ...")` 한국어 |
| ErrorCode `INSUNG_QUICK_NOT_CONFIGURED` HTTP 502 | ✅ | `ErrorCode.java` line 124 + `Phase10VendorPlaceholderGuardConsistencyTest.insungQuickNotConfigured_is502()` 회귀 가드 |
| FE `DispatchDetail` DTO ↔ BE 응답 일치 (sandboxMode/vendorOrderId/notifyResults/gpsSources 4 필드) | ⚠️ | FE interface 는 정의되어 있으나 BE 측 dispatch 상세 GET endpoint (`/api/arologis/dispatches/{id}` 등) 가 본 PR 에서 신규로 만들어지지 않음 — QA Playwright 가 mock 으로 처리 (FE 단독 검증). 운영 cutover 시 endpoint 추가 의무. |
| **FE↔QA data-testid 정합** | ❌ | **11건 testid 불일치 (FIX 필요)** — 아래 표 참조 |

### 2-A. FE↔QA data-testid 불일치 상세 (Fix 후보 — cycle 2 대상)

| QA 가 기대 (Playwright) | FE 실제 (TSX) | 영향 |
|---|---|---|
| `insung-sandbox-banner` | `sandbox-banner` (DispatchDetailPage:368) | QA-2 두 번째 케이스 FAIL |
| `channel-badge-insung-talk` / `channel-badge-aligo` | 미존재 (NotifyResultSection 의 채널 뱃지 element 에 testid 없음) | QA-3 첫 케이스 FAIL |
| `notification-status-chip-failed` / `-delayed` | 미존재 (`NotifyStatusChip` 컴포넌트에 testid 없음) | QA-3 실패/지연 케이스 FAIL |
| `notification-masked-phone` | 미존재 (`maskPhone()` span 에 testid 없음) | QA-3 마스킹 검증 FAIL |
| `notification-fail-reason` | 미존재 (errorCode span 에 testid 없음) | QA-3 실패 사유 FAIL |
| `insung-lbs-panel` | 미존재 (`InsungLbsPanel` root div 에 testid 없음) | QA-4 전체 FAIL |
| `gps-source-row-EXTERNAL_INSUNG_LBS` 등 4종 | 미존재 (`SourceRow` 에 testid + data-active 없음) | QA-4 전체 FAIL |
| `gps-active-source-label` | 미존재 (footer span 에 testid 없음) | QA-4 footer 검증 FAIL |
| `gps-stale-warning` | 미존재 (`AlertCircle` 옆에 testid 없음) | QA-4 stale 검증 FAIL |
| `insung-vendor-badge` | 미존재 (INSUNG span line 230 에 testid 없음) | QA-5 INSUNG 뱃지 검증 FAIL |
| `match-status-driver-code` | 미존재 (driverCode span line 239 에 testid 없음) | QA-5 driverCode 검증 FAIL |

추가 상수 mismatch:
- QA `mockMatcherConfig` 가 `/api/arologis/dispatches/*/matcher-config` endpoint mock → FE 는 `DispatchDetail.sandboxMode` boolean 필드 인용 (별도 endpoint 아님). API mock path 와 FE consumption path 가 분리되어 있어 mock 이 효과 없음.
- QA 가 `BASE_URL/#/dispatches/manual` 로 진입 → 실제 라우터는 `ManualDispatchPage` 가 렌더되며, **`DispatchDetailPage` 는 router 미연결 orphan 컴포넌트** (JSDoc line 6 "임시 경로" 명시). VehicleMatchStatusBadge / InsungLbsPanel / NotifyResultSection 모두 화면에 출현하지 않음.

> ⚠️ **FE-1/2/3/4 4 컴포넌트 모두 코드는 완성되어 있으나 UI 트리에 연결되지 않음**.  
> 후속 cycle 에서 (1) 11종 data-testid 부여 + (2) DispatchDetailPage 를 라우터에 mount + (3) mockMatcherConfig 제거 또는 FE 측 endpoint 추가, 3가지 fix 필요.

## 3. 디자인 일관성: ✅ PASS

| 항목 | 결과 | 근거 |
|---|---|---|
| `tokens.css --color-insung-*` 6종 light + dark | ✅ | tokens.css line 104~109 light + line 470~475 dark override |
| `index.ts colors.insung` 6 키 | ✅ | tokens/index.ts line 120~127 (kftc 직후) — 5 vendor 색조 분리 주석 포함 |
| WCAG AAA 10.2:1 대비 (`#431407` on `#FFF7ED`) | ✅ | tokens.css line 103 + tokens.md §1.4 검증표 |
| Designer tokens.md §5 CSS variable 직접 인용 | ✅ | `VehicleMatchStatusBadge.tsx` line 60~82 PENDING/MATCHING/ASSIGNED/DELIVERED 4 상태 + line 107~115 INSUNG_BADGE_STYLE `--color-insung-50/200/text` |
| design-system 신규 컴포넌트 작성 0건 | ✅ | grep 결과 디자인-시스템 폴더에 신규 컴포넌트 추가 없음 (`Spinner` 재사용만) |
| Pretendard 9 weight + 한국어 본문 fontFamily | ✅ | badge / panel / detail 모두 `var(--font-family-mono)` (driverCode/coord/timestamp) + 기본 sans (라벨) 인용 |
| 5 vendor 색조 (NTS 135° / Aligo 174° / Clova 147° / KFTC 210° / INSUNG 30°) | ✅ | tokens.md §2 검증표 + index.ts JSDoc line 117 색맹(deuteranopia) 명시 |

## 4. 도메인 정합: ✅ PASS

| 항목 | 결과 | 근거 |
|---|---|---|
| `InsungQuickDriverMatcher.match()` → `requestOrder` → `requestMatch` → Driver upsert → `DriverMatchResult.of(driver, EXTERNAL_INSUNG_QUICK, vendorOrderId)` | ✅ | `InsungQuickDriverMatcher.java` line 57~107 fail-soft + UUID 비공개 |
| `Vehicle.assignDriver(driverId, matchSource, externalRefId)` + `markDeparted()` + `markDelivered()` | ✅ | `Vehicle.java` line 121~147 도메인 메서드 — `assignDriver`(ASSIGNED) / `markDeparted`(DEPARTED) / `markDelivered`(DELIVERED) — webhook chain 인용 정확 |
| `Vehicle.updateVendorOrderId` / `updateVendorStatus` — idempotent | ✅ | `Vehicle.java` line 157~171 — 동일 값 재설정 허용 + webhook 재수신 시 skip 로직 (`InsungWebhookService` line 87/132) |
| `MatchSource.EXTERNAL_INSUNG_QUICK` + `DriverSource.EXTERNAL_INSUNG_QUICK` 일관 | ✅ | matcher line 91/100 + webhook service line 99 + IT TC-1 line 165/171 |
| `SignatureSource.EXTERNAL_INSUNG_LBS` 신규 (W10-2 enum 확장) | ✅ | `SignatureSource.java` line 18 — `EXTERNAL_INSUNG_LBS` 추가 + 인용 `InsungWebhookService.handleDelivered` line 217 |
| `StopStatus.PENDING → ARRIVED → DELIVERED` 전이 + idempotent | ✅ | `InsungWebhookService.handleStatusUpdate` ARRIVED case line 146~162 + `handleDelivered` line 199~227 (강제 전이 webhook race 허용) |
| 모든 활성 stop DELIVERED 시 Vehicle DELIVERED 자동 전이 | ✅ | `InsungWebhookService.handleDelivered` line 232~239 |
| fail-soft (`RPC 예외 → empty + WARN`) | ✅ | matcher line 102~106 + IT TC-5 line 287~307 검증 |

## 5. Flyway V13: ✅ PASS

| 항목 | 결과 | 근거 |
|---|---|---|
| V13 의존 — V1 `vehicles` 테이블 + `is_deleted` 컬럼 선행 | ✅ | `V1__init_arologis.sql` line 48 + line 65 `is_deleted BOOLEAN NOT NULL DEFAULT FALSE` |
| V12 (`dispatch_save_history`) 와 무충돌 | ✅ | V12 는 `dispatch_save_history` 신규 테이블만 — `vehicle` 미참조 |
| 신규 컬럼 NULLable | ✅ | V13 `vendor_order_id VARCHAR(64)` + `vendor_status VARCHAR(20)` 둘 다 NOT NULL 제약 없음 (legacy 호환) |
| `JPA ddl-auto=validate` 호환 | ✅ | `Vehicle.java` `@Column(name="vendor_order_id", length=64)` + `@Column(name="vendor_status", length=20)` 양쪽 nullable 기본값 — V13 컬럼 정의 1:1 일치 |
| partial unique index 활성 행 race 가드 | ✅ | `uq_vehicle_vendor_order_id_active ON vehicles (vendor_order_id) WHERE is_deleted=false AND vendor_order_id IS NOT NULL` — webhook idempotent 충돌 방지 + cancelled 행 재사용 허용 |
| COMMENT ON COLUMN 한국어 | ✅ | V13 line 9/10 한국어 주석 |

## 6. SP-09 vendor 패턴 일관: ✅ PASS

| 항목 | 결과 | 근거 |
|---|---|---|
| placeholder 5 키워드 + blank 6종 차단 (NTS/Aligo/Clova/KFTC 동일) | ✅ | `InsungQuickClientImpl.PLACEHOLDER_KEYWORDS` line 46~52 — `PLACEHOLDER_DEV_ONLY` / `CHANGE_ME_LOCAL_ONLY` / `changeme` / `dummy` / `placeholder` + blank/null `guardApiKey()` 검증 |
| sandbox-mode 토글 (`samhan.arologis.matcher.insung-quick.sandbox-mode`) | ✅ | `ArologisMatcherProperties.InsungQuick.sandboxMode = true` (default) — application.yml line 72 chained-default |
| `@MockBean InsungQuickClient` + lenient stub IT 격리 | ✅ | `InsungQuickIntegrationIT.java` line 106~146 — Insung + Partner + Slip + Notification + DynamicPermission 6 client 모두 `@MockBean` + lenient stub |
| CI grep 가드 `INSUNG_QUICK` (CLOVA/KFTC 위치 직후) | ✅ | `scripts/check-credential-plaintext.sh` line 80~82 PATTERN_INSUNG + line 210 label 예외 + line 297 scan_pattern 호출 (CLOVA/KFTC 동일 위치) + arologis-ci.yml line 41~56 credential-guard job 최상단 |
| `Phase10VendorPlaceholderGuardConsistencyTest` (SP-09 패턴 일관) | ✅ | `vendor/Phase10VendorPlaceholderGuardConsistencyTest.java` line 39~210 — Nested 3 group (Placeholder / SandboxBypass / ErrorCode502) — `Phase9VendorPlaceholderGuardConsistencyTest` 패턴 그대로 |
| `INSUNG_QUICK_NOT_CONFIGURED` 502 BAD_GATEWAY (CLOVA/KFTC OCR_SUBMIT_FAILED/KFTC_SUBMIT_FAILED 와 동일 상태) | ✅ | `ErrorCode.java` line 124 + 회귀 가드 line 134~139 |
| env-template 빈 값 의무 (placeholder 사용 자체 금지) | ✅ | `infrastructure/env-templates/arologis-service.env` line 72~80 — 4 키 모두 `=` 빈 값 + 주석 line 67~71 정책 명시 |

## 7. SP-D 시리즈 회귀: ✅ PASS

| 항목 | 결과 | 근거 |
|---|---|---|
| SP-D3 동적 RBAC 가드 — Internal endpoint 영향 | ✅ | 신규 3 webhook endpoint `/internal/arologis/insung/*` 는 X-Internal-Token + HMAC 이중 검증만 사용. `arologis.admin` PageCode 와 분리 (Internal 경로 외부 노출 X) — SP-D3 마이그레이션 6 페이지 (dispatch.board / receipt-batch / dispatch-sms / send-audit / dispatched-list / closed-confirm) 와 path 충돌 0건 |
| `@PreAuthorize("hasAnyRole('MASTER','AROLOGIS_MASTER')")` 일관 | ✅ | 3 신규 endpoint 모두 동일 어노테이션 — `/dispatches/sync` (W10-1) 기존 정책 보존 + `/dispatches` (Phase A) 와 동일 RBAC |
| `DynamicPermissionClient @MockBean lenient` (SP-D3 cycle 3 회고) | ✅ | `InsungQuickIntegrationIT.java` line 124~126 + line 136~137 — `canEdit/canView` 양쪽 lenient stub |
| FE 사이드바 영향 0 | ✅ | QA-6 두 케이스 — `DispatchesLayout nav 4개 링크 (수동 배차/가배차 분류/미배차/실배차 비교)` 그대로 + AppLayout 신규 메뉴 0건 — `docs/qa/sp-10-2-insung-quick-vendor/sidebar-no-impact.md` |

## 8. 컴파일 검증

| 검증 | 결과 | 명령 |
|---|---|---|
| BE arologis assemble + testClasses | ✅ BUILD SUCCESSFUL | `./gradlew :services:arologis-service:assemble :services:arologis-service:testClasses --console=plain` (3s, 17 actionable) |
| FE typecheck (arologis-desktop) | ✅ PASS | `npm run typecheck` (`tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit`) — exit 0 |
| FE typecheck (design-system) | ✅ PASS | `npx tsc -p tsconfig.build.json --noEmit` — exit 0 (design-system 에 typecheck script 미존재, tsc 직접 실행) |
| CI grep 가드 (`check-credential-plaintext.sh`) | ✅ PASS | `bash scripts/check-credential-plaintext.sh` — `[PASS] 자격 평문 비공개 — 위반 없음` |

## 메모리 가드 일관성

| 메모리 가드 | 결과 | 근거 |
|---|---|---|
| `feedback_uuid_no_user_visibility.md` | ✅ | §1 UUID 정합성 + FE 4 컴포넌트 driverCode/sequence/vendorOrderId 만 노출 |
| `project_korean_accounting.md` | N/A | 본 슬라이스 회계 영향 0 |
| `feedback_korean_commits.md` | ✅ | 모든 commit/PR 한국어 작성 (TM 발행 단계 PM 책임) |
| `feedback_no_dev_director_mention.md` | ✅ | 5-team 산출물 grep 결과 "개발책임자" 단어 미사용 |
| `feedback_role_naming_full.md` | ✅ | `@PreAuthorize` MASTER / AROLOGIS_MASTER 풀네임 — M/M/D 약어 0건 |
| `feedback_pr_qa_screenshots.md` | ⚠️ | QA Playwright 스크린샷 path 6개 정의되어 있으나 실제 캡처 미수행 (FE 미연결 → 첫 실행 시 FAIL 발생). PM PR 발행 단계에서 처리 |
| `feedback_it_mockbean_external_clients.md` | ✅ | IT 6 client `@MockBean` lenient stub |
| `feedback_continuous_docs_sync.md` | ✅ | `docs/dev-reports/sp-10-2-insung-quick-vendor.md` + `docs/operational-validation/sp-10-2-insung-key-rotation.md` 신규 생성 |
| `feedback_multi_agent_team_pattern.md` | ✅ | Designer + BE + FE + QA + DevOps 5-team 산출물 모두 회수 |

---

## 결론: ⚠️ FIX 요청 — cycle 2 진행 필요

### 통과 항목
- UUID 정합성 / 디자인 일관성 / 도메인 정합 / Flyway V13 / SP-09 vendor 패턴 / SP-D 시리즈 회귀 — 6/8 ✅
- BE 컴파일 / FE 컴파일 / CI 가드 — 3/3 ✅

### FIX 필요 (1건)
**FE↔QA data-testid 11건 mismatch + `DispatchDetailPage` 라우터 미연결**:

cycle 2 fix 분배 권고:
1. **FE-Cycle-2** — `VehicleMatchStatusBadge.tsx` / `InsungLbsPanel.tsx` / `DispatchDetailPage.tsx` 에 11종 data-testid 부여:
   - `insung-sandbox-banner` (sandbox-banner 변경 or alias)
   - `channel-badge-insung-talk` / `channel-badge-aligo`
   - `notification-status-chip-failed` / `notification-status-chip-delayed` / `notification-status-chip-success` 
   - `notification-masked-phone`
   - `notification-fail-reason`
   - `insung-lbs-panel`
   - `gps-source-row-{source}` (4종) + `data-active` attribute
   - `gps-active-source-label`
   - `gps-stale-warning`
   - `insung-vendor-badge`
   - `match-status-driver-code`
2. **FE-Cycle-2 (옵션)** — `DispatchDetailPage` 를 라우터에 mount (`/dispatches/detail/:dispatchCode`) 또는 QA 가 `ManualDispatchPage` 에 컴포넌트 노출 가정 시 ManualDispatchPage 안에 컴포넌트 삽입
3. **QA-Cycle-2** — `mockMatcherConfig` 제거 (별도 endpoint 없음, sandboxMode 는 `DispatchDetail.sandboxMode` 필드로 전달) + 진입 URL 조정 (`/dispatches/detail/:id` or ManualDispatchPage)

### 추가 backlog (운영 cutover 시점)
- BE — Dispatch 상세 GET endpoint (`GET /api/arologis/dispatches/{id}`) 신규로 4 필드 (sandboxMode/vendorOrderId/notifyResults/gpsSources) 반환 — 본 PR 에서 처리되지 않음, FE 단독 mock 검증만 가능
- DevOps — 운영 PC `.env` 에 `SAMHAN_INSUNG_QUICK_*` 4 키 sandbox 발급 후 주입 — `sp-10-2-insung-key-rotation.md` 가이드 참조

### PM 위임
- cycle 2 FE + QA 두 에이전트 호출 (5-team 전체 X — 영향 범위 한정)
- 통합 PR 발행은 cycle 2 fix 완료 후 진행
- 풀빌드 검증 + PR 발행 + CI watch 는 PM 책임
