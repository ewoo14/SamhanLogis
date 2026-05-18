# 🔵 Claude TM 통합 리뷰 — SP-10-2 Cycle 1

**HEAD**: `f82a5ad5`
**PR**: #245
**리뷰어**: Claude 5-agent 병렬 (BE / FE / Designer / QA / DevOps)
**CI**: ⚠️ 25/27 PASS (2 arologis-service IT fail — TC-1/TC-4 unique constraint)

## 종합 판정: **FIX 요청** — cycle 2 통합 fix 필요 (P0 4건 + P1 6건 + P2 12건)

---

## P0 / CRITICAL — 4건 (머지 차단)

### BE
1. **P0-1 `InsungQuickDriverMatcher.match()` vendor_order_id DB 미저장 → webhook 흐름 완전 단절**
   - `requestOrder()` 가 vendorOrderId 반환해도 `vehicle.updateVendorOrderId()` + `vehicleRepository.save()` 호출 0
   - 결과: `vehicles.vendor_order_id` 컬럼 항상 NULL → `InsungWebhookService.findByVendorOrderId()` Optional.empty() → 3 webhook 모두 silent skip
   - IT TC-2/3/4 는 사전 수동 `updateVendorOrderId()` 호출로 우회 통과, 실 운영 흐름 완전 미작동 (운영 critical)

### CI (BE)
2. **CI fail: InsungQuickIntegrationIT TC-1/TC-4 unique constraint 위반**
   - `ux_dispatches_date_type_active` constraint violation
   - TC-1: `Dispatch.of(LocalDate.now(), DispatchType.DAY, ...)`
   - TC-4: `Dispatch.of(LocalDate.now(), DispatchType.DAY, ...)` — 동일 (date, type) 중복
   - 각 TC 가 unique 한 (date, type) 사용하도록 fixture 정합 필요

### FE / QA
3. **QA P0-1 / FE D-1: `sandbox-banner` testid mismatch**
   - QA spec line 257/316: `[data-testid="sandbox-banner"]`
   - FE 실제 (DispatchDetailPage:377): `data-testid="insung-sandbox-banner"`
   - QA-1 not.toBeVisible() false-green / QA-2 toBeVisible() FAIL

### QA
4. **P0-2: `DispatchDetailRouteWrapper` dispatch=null 상시 전달**
   - `routes/index.tsx:45` 항상 `<DispatchDetailPage dispatch={null}>` 전달
   - 결과: "배차 정보를 불러오는 중..." 만 렌더, vehicle row / badge / sandbox banner 모두 미표시
   - QA spec `page.route('**/api/arologis/dispatches/**', ...)` mock 무의미 (fetch 경로 부재)
   - QA-1~QA-5 전 case dev server 가동 시 FAIL (현재 dev server 미가동으로 server-unreachable FAIL 만 발생)

---

## P1 / HIGH — 6건 (cycle 2 fix 필수)

### BE
- **P1-1**: `InsungWebhookService.handleMatchResult()` 상태 가드 없이 `assignDriver()` — DEPARTED/DELIVERED 상태 vehicle 에 webhook 재수신 시 ASSIGNED 상태 후퇴 (race 회귀)
- **P1-2**: `verifyInsungSignature()` sandbox=false + webhookSecret blank 시 HMAC 우회 — 운영 배포 후 서명 없는 임의 요청 통과 가능 (보안 critical)
- **P1-3**: `verifyInsungSignature()` `reqBody.toString()` (Java record 자동 형식) HMAC 계산 — 인성 측 JSON body 기반 서명과 항상 불일치 → cutover 시 100% 검증 fail

### Designer
- **D1**: wireframe.md §6 PENDING row `match-status-badge` 잔류 (실제 `vehicle-match-status-badge`)
- **D2**: `aria-live` MATCHING 만 적용, ASSIGNED/DELIVERED 전이 시 screen reader 알림 X (wireframe §7 위반)

### DevOps
- **D1**: `arologis-ci.yml` pull_request paths 에 `scripts/check-credential-plaintext.sh` 미포함 — INSUNG_QUICK 가드 변경만 PR 시 트리거 안 됨 (ci.yml 가 커버하지만 명시 의도 위반)

---

## P2 / MINOR — 12건 (cycle 2 fix 포함 권장)

### BE
- **P2-1**: `MatcherConfig.java` stale Javadoc/log "UnsupportedOperationException throw" 잔재
- **P2-2**: `InsungWebhookService.handleDelivered()` stops 빈 목록 시 allDelivered vacuously true → vehicle 즉시 DELIVERED
- **P2-3**: `InsungWebhookService.parseCapturedAt()` `.replace("T", "T")` noop
- **P2-4**: `InsungQuickClientImpl` 5xx 런타임 오류에 `INSUNG_QUICK_NOT_CONFIGURED` 재사용 → 별도 `INSUNG_QUICK_SUBMIT_FAILED` 필요 (SP-09 패턴)
- **P2-5**: `InsungQuickIntegrationIT` TC-1 mockMvc 없이 직접 도메인 조작 → 실 흐름 미검증

### Designer
- **D3**: tokens.md WCAG "10.2:1" 표기 (실제 ≈14.7:1)
- **D4**: QA-4 본문 testid 대문자 형식 `gps-source-row-EXTERNAL_INSUNG_LBS` (실제 `gps-source-row-insung-lbs`)
- **D5**: cycle 2 정합표 `sandbox-banner` 잔류

### QA
- **P1-1 (시나리오)**: scenarios.md line 46 `match-status-badge` / line 243 `sandbox-banner` 정합표 오기

### FE
- **D-2**: `--surface-subtle` dark mode override 누락 (`InsungLbsPanel` 패널 배경)
- **D-3 / D-4**: spec 의 `gps-active-source-label` / `channel-badge-*` / `notification-masked-phone` / `insung-lbs-panel` textContent 대체 → 실제 testid 사용으로 정합 강화

### DevOps
- **D2**: `SAMHAN_INSUNG_QUICK_TIMEOUT_MS` env-template / docker-compose 누락 (application.yml 참조)

---

## 일관성 점수

| Team | 점수 | 비고 |
|---|---|---|
| BE | 2/5 | P0-1 운영 critical + P1 보안 critical 2건 |
| FE | 4/5 | testid mismatch 1건 외 양호 |
| Designer | 4/5 | wireframe testid drift + aria-live 적용 범위 |
| QA | 3/5 | P0 운영 critical (dispatch=null) + 다수 testid 대체 |
| DevOps | 4/5 | CI paths + env 누락 minor |

## 운영 영향

- **운영 critical 2건**: BE P0-1 (vendor_order_id DB 미저장) + QA P0-2 (FE 라우터 dispatch null → 화면 미표시)
- **보안 critical 1건**: BE P1-2 (HMAC sandbox=false + secret blank 시 우회)
- **CI 차단**: TC-1/TC-4 fixture 중복

cycle 2 fix 필수 항목 (Codex workspace-write):
1. P0 4건 + P1 6건 즉시 fix
2. P2 일부 함께 해소 (문서 일관성)
3. cycle 3 안 (양쪽 0 결함) 완료 정책 준수

---

상세 5-team 리뷰:
- [`docs/qa/sp-10-2-insung-quick-vendor/claude-be-cycle1.md`](docs/qa/sp-10-2-insung-quick-vendor/claude-be-cycle1.md)
- [`docs/qa/sp-10-2-insung-quick-vendor/claude-fe-cycle1.md`](docs/qa/sp-10-2-insung-quick-vendor/claude-fe-cycle1.md)
- [`docs/qa/sp-10-2-insung-quick-vendor/claude-designer-cycle1.md`](docs/qa/sp-10-2-insung-quick-vendor/claude-designer-cycle1.md)
- [`docs/qa/sp-10-2-insung-quick-vendor/claude-qa-cycle1.md`](docs/qa/sp-10-2-insung-quick-vendor/claude-qa-cycle1.md)
- [`docs/qa/sp-10-2-insung-quick-vendor/claude-devops-cycle1.md`](docs/qa/sp-10-2-insung-quick-vendor/claude-devops-cycle1.md)

**TM 결정: FIX 요청 → Codex 5-section 재검 → cycle 2 통합 fix → head B 재리뷰**

Claude TM — 2026-05-19
