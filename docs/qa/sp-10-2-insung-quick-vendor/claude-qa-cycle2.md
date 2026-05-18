# SP-10-2 QA 리뷰 — Claude Cycle 2

> PR #245 `feat/sp-10-2-insung-quick-program` (head `36379838`)
> 리뷰어: Claude QA subagent
> 리뷰일: 2026-05-19

---

## 1. 총평

Cycle 1 P0 2건 + P1/P2 다수가 commit `36379838` 에서 일괄 처리. P0-1(sandbox-banner testid), P0-2(DispatchDetailRouteWrapper fetch 누락) 모두 코드 상 수정 확인. testid 19종 전체가 FE 실제 컴포넌트 값과 정합하며, false green 패턴 3종(`|| true` / `test.skip(!ok)` / `page.setContent()`)은 0건 유지. 단, cycle 2에서 신규 발견된 결함 4건이 존재하며 중 1건(N1)은 P1 수준 잠재 flakiness.

---

## 2. Cycle 1 결함 해결 검증

### P0-1: sandbox-banner testid 불일치 — PASS

- spec.ts line 257, 316 에서 `[data-testid="insung-sandbox-banner"]` 로 교체
- DispatchDetailPage.tsx SandboxBanner `data-testid="insung-sandbox-banner"` (line 377) 완전 정합
- scenarios.md line 243 cycle 2 표 `insung-sandbox-banner` 로 정정

### P0-2: DispatchDetailRouteWrapper dispatch=null 상시 전달 — PASS

- routes/index.tsx `DispatchDetailRouteWrapper` 에 useEffect + apiClient.get fetch 추가 (line 51-80)
- page.route('**/api/arologis/dispatches/**') mock 이 이 axios 호출 인터셉트 가능 구조
- dispatch state 가 BE 응답으로 설정되므로 `<DispatchDetailPage dispatch={dispatch} />` 에 실데이터 전달

### P1-1/P2: scenarios.md match-status-badge + sandbox-banner 잔재 — PASS

- scenarios.md line 46 `vehicle-match-status-badge` 로 정합
- cycle 2 testid 표 전체가 FE 실제값 기준 갱신 확인

---

## 3. testid 전수 검증 (19종)

| spec assertion testid | FE 파일:line | 정합 |
|---|---|---|
| `vehicle-match-status-badge` | VehicleMatchStatusBadge.tsx:199 | PASS |
| `insung-sandbox-banner` | DispatchDetailPage.tsx:377 | PASS |
| `notify-row-insung-talk/aligo` | DispatchDetailPage.tsx:293 (동적) | PASS |
| `notification-result-section` | DispatchDetailPage.tsx:266 | PASS |
| `channel-badge-insung-talk/aligo` | DispatchDetailPage.tsx:307 (동적) | PASS |
| `notification-status-chip-{success/failed/delayed}` | DispatchDetailPage.tsx:156/182/214 | PASS |
| `notification-masked-phone` | DispatchDetailPage.tsx:339 | PASS |
| `notification-fail-reason` | DispatchDetailPage.tsx:198 | PASS |
| `insung-vendor-badge` | VehicleMatchStatusBadge.tsx:230 | PASS |
| `match-status-driver-code` | VehicleMatchStatusBadge.tsx:241 | PASS |
| `insung-lbs-panel` | InsungLbsPanel.tsx:314 | PASS |
| `gps-source-row-insung-lbs/app-gps-active` | InsungLbsPanel.tsx:64-65 | PASS |
| `gps-stale-warning` | InsungLbsPanel.tsx:250 | PASS |
| `gps-active-source-label` | InsungLbsPanel.tsx:374 | PASS |

19종 PASS. Cycle 1 미검증 7종이 spec에서 직접 testid 검증으로 전환되었으며 FE 실 컴포넌트에도 부여 확인.

---

## 4. False Green 가드 검증

- `|| true`: spec 784줄 — 0건
- `test.skip(!ok)`: 0건. 6 describe `beforeEach` `expect(ok).toBe(true)` FAIL 처리 일관 적용
- `page.setContent()`: 0건
- `isServerAvailable()`: 6 describe block 모두 `beforeEach` 포함
- `expect(true).toBe(true)` 빈 assertion: 0건

---

## 5. BE InsungQuickIntegrationIT 5 TC ↔ QA 5 case cross-coverage

| BE TC | QA case | cross-coverage |
|---|---|---|
| TC-1: sandbox+requestMatch 성공 → ASSIGNED | QA-5 (mock-result webhook) | 충분 |
| TC-2: webhook match-result → DB ASSIGNED | QA-5 (badge 전이) | 충분 |
| TC-3: webhook status-update DEPARTED | QA-5 (MATCHING badge 중간 상태) | 부분 (FE 비검증 영역) |
| TC-4: webhook delivered → Signature + DELIVERED | QA-5 (delivered badge + CheckCheck) | 충분 |
| TC-5: RPC 예외 → fail-soft PENDING | QA-2 (sandbox RPC 예외) | 충분 |

`@MockBean` 격리: InsungQuickClient, DynamicPermissionClient, PartnerClient, SlipClient, NotificationClient, SlipServiceClient, SlipDispatchTaskClient 7종 전체 `@MockBean` + lenient stub `@BeforeEach`. feedback_it_mockbean_external_clients.md 의무 PASS.

`AbstractPostgresIT` 의 `samhan.arologis.matcher.provider=mock` 강제 override 제거 cycle 2 fix 적용 확인 → TC-1 sandbox-mode insung-quick 시나리오 적용 가능.

---

## 6. Cycle 2 신규 발견 결함

### [N1] P1 — QA-4-3 InsungLbsPanel 타이밍 위험

- spec line 610-612: `[data-testid="insung-lbs-panel"]` `toBeVisible({ timeout: 5_000 })`
- axios 가 XHR 기반이라 `waitForLoadState('networkidle')` 가 axios 완료를 보장하지 못할 가능성
- 잠재 flakiness — dev server 미실행 환경에서는 `isServerAvailable()` FAIL 차단되어 false green 아님
- 추후 `waitForResponse('**/api/arologis/dispatches/**')` 도입 검토

### [N2] P2 — QA-3 notification-fail-reason 괄호 래핑 표기 누락

- spec line 432-434 `failReason.toContainText('E_INVALID_PHONE')`
- 실제 NotifyStatusChip FAILED 분기에서 errorCode 가 `(E_INVALID_PHONE)` 괄호 래핑 노출
- `toContainText` 부분 매칭이라 PASS 가능, scenarios.md 기대 절에 명시 누락

### [N3] P2 — screenshots 0건

- `docs/qa/sp-10-2-insung-quick-vendor/screenshots/` 디렉토리 존재하나 PNG 0건
- spec.ts 에 `page.screenshot({ path: 'docs/qa/.../QA-*-*.png' })` 11건 정의
- `feedback_pr_qa_screenshots.md` PR 본문 인라인 첨부 의무 미충족 → cycle 3 mock 1장 이상 생성 필요

### [N4] P2 — it-cross-check.md C1 기대 stale (PENDING vs 실 ASSIGNED)

- it-cross-check.md §3 C1: `Vehicle.status = PENDING (sandbox)`
- 실제 BE TC-1: `vehicle.status = ASSIGNED` 단언
- cycle 2 BE P0-1 fix 후 변경, 문서 동기화 누락

---

## 7. 도메인 정합 검증

- V13 migration `vehicle.vendor_order_id VARCHAR(64)` + partial unique index — `updateVendorOrderId() + save()` 정합 PASS
- DriverLocation source enum 4종 — FE InsungLbsPanel ↔ BE domain-integrity-check.md SQL 일치 PASS
- Signature idempotency — `SignatureRepository.findByStopIdAndSource` + skip 가드 PASS
- UUID 비공개 — driverCode `INSUNG-{vendorDriverId}` 형식 고정 PASS

---

## 8. 최종 판정

**CONDITIONAL PASS — Cycle 3 fix 후 머지 가능**

Cycle 1 P0 2건 + P1/P2 다수가 모두 해소되었으며, testid 19종 PASS, false green 가드 0건이 유지됨. 단 머지 전 N3 (screenshots) + N4 (문서 정정) 의무, N1 (타이밍) 은 모니터링.

cycle 3 fix scope (QA 관점):
- [N3] screenshots mock 1장 이상 생성 (P2)
- [N4] it-cross-check.md C1 기대 PENDING → ASSIGNED 정정 (P2)
- [N1] 추후 flakiness 발견 시 waitForResponse 도입 (모니터링)
- [N2] scenarios.md 괄호 래핑 표기 추가 (선택 P2)

Claude QA — 2026-05-19
