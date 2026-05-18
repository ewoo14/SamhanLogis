# SP-10-2 인성데이타 퀵프로그램 vendor 통합 — QA cycle 1 리뷰

> 작성일: 2026-05-19
> 리뷰어: Claude QA Agent (cycle 1)
> 대상 PR: #245 (head: f82a5ad5)
> 브랜치: feat/sp-10-2-insung-quick-program
> 검토 파일:
>   - qa/playwright/tests/arologis/sp-10-2-insung-quick-vendor.spec.ts
>   - clients/arologis-desktop/src/renderer/routes/dispatches/DispatchDetailPage.tsx
>   - clients/arologis-desktop/src/renderer/components/VehicleMatchStatusBadge.tsx
>   - clients/arologis-desktop/src/renderer/components/InsungLbsPanel.tsx
>   - clients/arologis-desktop/src/renderer/routes/index.tsx
>   - services/arologis-service/src/test/java/.../it/InsungQuickIntegrationIT.java

---

## 요약

| 영역 | 결과 |
|------|------|
| false green 가드 | PASS |
| testid 11종 정합 | P0 결함 1건, P1 결함 1건 |
| 진입 URL / 라우터 | P0 결함 1건 (운영 치명) |
| @MockBean 가드 | PASS |
| SP-D 회귀 가드 | PASS |
| UUID 비공개 가드 | PASS |
| GPS data-active 검증 | PASS |
| 시나리오 + 도메인 정합 | PASS |

**전체 결론: cycle 2 진입 필요 — P0 2건, P1 1건 수정 필요.**

---

## 결함 목록

### [P0-1] sandbox-banner testid 불일치 — QA-1/QA-2 전체 오작동

**파일**: spec line 257, 316 vs DispatchDetailPage.tsx line 377

**현상**:
spec 은 `[data-testid="sandbox-banner"]` 로 단언하나, FE SandboxBanner 컴포넌트 실제 data-testid 는 `"insung-sandbox-banner"` 이다.

- spec (line 257): `page.locator('[data-testid="sandbox-banner"]')`
- spec (line 316): `page.locator('[data-testid="sandbox-banner"]')`
- FE 실제값 (DispatchDetailPage line 377): `data-testid="insung-sandbox-banner"`

QA-1 의 `not.toBeVisible()` 단언은 locator 가 아무것도 찾지 못하므로 항상 "표시 안 됨"으로 PASS한다 (false green 우려). QA-2 의 `toBeVisible()` 단언은 locator 불일치로 반드시 FAIL 한다.

spec 헤더 주석 (line 14) 에도 `"sandbox-banner" (FE DispatchDetailPage SandboxBanner line 369)` 로 명기되어 있어 주석과 실제 FE 값이 불일치하는 상태다.

**수정 방안**:
spec line 257, 316 을 `[data-testid="insung-sandbox-banner"]` 로 교체. 또는 FE SandboxBanner 컴포넌트를 `data-testid="sandbox-banner"` 로 변경 후 spec 주석 정합.

---

### [P0-2] DispatchDetailPage dispatch=null 상시 전달 — QA 전 케이스 "배차 정보를 불러오는 중..." 렌더링

**파일**: clients/arologis-desktop/src/renderer/routes/index.tsx line 45

**현상**:
라우터 `DispatchDetailRouteWrapper` 는 항상 `<DispatchDetailPage dispatch={null} />` 을 전달한다. `dispatch=null` 이면 DispatchDetailPage 는 `"배차 정보를 불러오는 중..."` 텍스트만 렌더링하고 실제 vehicle row / badge / sandbox banner 등 아무 것도 표시하지 않는다.

QA spec 은 `page.route('**/api/arologis/dispatches/**', ...)` mock 을 주입하나, DispatchDetailPage 는 현재 BE API 를 전혀 호출하지 않는다 (useEffect/useQuery/fetch 코드 0건). 따라서 mock 주입이 실제 렌더링에 전혀 영향을 주지 않는다.

결과적으로 QA-1~QA-5 의 모든 `vehicle-match-status-badge`, `notification-result-section`, `notify-row-*`, `insung-vendor-badge`, `gps-source-row-*` 등 assertion 은 dev server 가동 시 전부 FAIL 한다 (locator 매칭 0건).

**근본 원인**: TM cross-check PR body 에 "QA Playwright 가 page.route() mock 으로 dispatch 데이터 주입"이라고 명기되어 있으나 라우터가 실제 fetch를 수행하지 않으므로 mock이 무의미하다.

**수정 방안**: 다음 중 하나 선택.
1. (권장) `DispatchDetailRouteWrapper` 에 `useEffect` + `fetch("/api/arologis/dispatches/{dispatchCode}")` 를 추가하여 BE API 호출 후 `dispatch` state를 설정. QA `page.route()` mock 이 이 fetch 를 인터셉트.
2. (임시) `DispatchDetailRouteWrapper` 에 `useMemo(() => buildMockDispatch(dispatchCode), [dispatchCode])` 로 mock 데이터 직접 주입 (BE 완성 전 임시 방편).

---

### [P1-1] spec 헤더 주석 내 시나리오 문서 testid 불일치 2건 — scenarios markdown 과 spec 불일치

**파일**: docs/qa/sp-10-2-insung-quick-vendor/scenarios/sp-10-2-scenarios.md

**현상**:
scenarios markdown cycle 2 testid 정합 현황 표 (line 243) 에는 `sandbox-banner` 가 "cycle 2 정합" 으로 표기되어 있으나 실제 FE 값은 `insung-sandbox-banner` 이다. 이는 [P0-1] 의 파생 문서 불일치다.

또한 scenarios markdown line 46 에 `data-testid="match-status-badge"` 로 명기되어 있으나 실제 FE 값 및 spec 값은 `"vehicle-match-status-badge"` 이다 (QA-1 기대 절). 해당 오기는 cycle 2 이전 초안이 정합되지 않고 남은 것으로 보인다.

**수정 방안**: scenarios markdown 의 testid 표 및 QA-1/QA-2 기대 절을 FE 실제값 기준으로 정합.

---

## 검증 통과 항목

### 1. false green 패턴 0건 확인 (PASS)

spec 전체를 grep 한 결과:
- `|| true` 패턴: 0건
- `test.skip(!ok)` 패턴: 0건 — `expect(ok).toBe(true)` 로 dev server 미가동 시 명시적 FAIL 처리
- `page.setContent()` 패턴: 0건 — 모든 case 에서 `page.goto(${BASE_URL}/#/dispatches/...)` 실 라우팅 사용
- `expect(true).toBe(true)` 형태의 빈 assertion: 0건

단, [P0-2] 로 인해 dev server 가동 시에도 "실질적 false green" 상태(locator 0건 매칭, not.toBeVisible() PASS) 가 존재함에 유의.

### 2. mockDispatchDetail 단일 endpoint mock (PASS 구조, 운용은 P0-2 조건부)

`mockDispatchDetail(page, override, vehicles)` 헬퍼가 단일 `**/api/arologis/dispatches/**` glob 으로 통합된 구조는 cycle 2 정합 설계 기준에 부합한다. 이전 `mockMatcherConfig` 분리 패턴이 올바르게 제거되었다. 단, [P0-2] 가 해결되어야 실제 mock 인터셉트가 유효해진다.

### 3. 진입 URL 라우터 mount 정합 (구조 PASS, 데이터 P0)

`/#/dispatches/detail/D-001` spec 진입 URL 과 index.tsx 의 `{ path: 'detail/:dispatchCode', element: <DispatchDetailRouteWrapper /> }` 라우터 등록이 일치한다. HashRouter 기반이므로 `/#/` prefix 도 올바르다. 라우트 mount 자체는 정합하나 [P0-2] 로 인해 데이터 흐름이 차단된다.

### 4. testid 11종 정합 현황

| testid | FE 실제값 | spec 값 | 상태 |
|--------|-----------|---------|------|
| vehicle-match-status-badge | VehicleMatchStatusBadge line 199 | 일치 | PASS |
| sandbox-banner | FE: insung-sandbox-banner (line 377) | spec: sandbox-banner | **P0 불일치** |
| notify-row-insung-talk | DispatchDetailPage line 293 (동적) | 일치 | PASS |
| notify-row-aligo | DispatchDetailPage line 293 (동적) | 일치 | PASS |
| notification-result-section | DispatchDetailPage line 266 | 일치 | PASS |
| insung-vendor-badge | VehicleMatchStatusBadge line 230 | 일치 | PASS |
| match-status-driver-code | VehicleMatchStatusBadge line 241 | 일치 | PASS |
| gps-source-row-insung-lbs | InsungLbsPanel SOURCE_TESTID line 63 | 일치 | PASS |
| gps-source-row-app-gps-active | InsungLbsPanel SOURCE_TESTID line 64 | 일치 | PASS |
| gps-source-row-app-gps-background | InsungLbsPanel SOURCE_TESTID line 65 | 일치 | PASS |
| gps-source-row-manual | InsungLbsPanel SOURCE_TESTID line 66 | 일치 | PASS |
| gps-stale-warning | InsungLbsPanel SourceRow line 250 | 일치 | PASS |

미반영 testid (`insung-lbs-panel`, `gps-active-source-label`, `channel-badge-*`, `notification-status-chip-*`, `notification-masked-phone`, `notification-fail-reason`) 는 spec 헤더에 명시적으로 기재 후 aria-label / textContent 기반으로 대체 검증하고 있어 허용 가능하다.

### 5. data-active attribute 검증 — GPS 4종 (PASS)

InsungLbsPanel SourceRow 컴포넌트 (line 167~168) 에서 `data-active={active ? 'true' : 'false'}` 로 문자열 설정.
spec QA-4 에서 `.toHaveAttribute('data-active', 'true')` / `'false'` 단언이 일치한다.
`gps-stale-warning` 은 `isStale && elapsedMs !== null && elapsedMs > 60_000` 조건이므로 QA-4-2 (61초 stale fixture) 검증과 정합한다.

### 6. @MockBean DynamicPermissionClient SP-D 회귀 가드 (PASS)

InsungQuickIntegrationIT (line 126~130):
```java
@MockBean
private DynamicPermissionClient dynamicPermissionClient;
```
lenient stub `canEdit/canView = true` 가 `@BeforeEach` 에 설정되어 있다. SP-D3 cycle 3 회고 의무 충족.

기타 외부 client 전체 (`InsungQuickClient`, `PartnerClient`, `SlipClient`, `NotificationClient`, `SlipServiceClient`, `SlipDispatchTaskClient`) `@MockBean` 격리 확인. `feedback_it_mockbean_external_clients.md` 의무 PASS.

### 7. UUID 비공개 가드 (PASS)

- `driverCode` 는 `"INSUNG-{vendorDriverId}"` 형식 (VARCHAR 64, vendor 측 식별자)으로 FE 노출
- 내부 `driver.id` UUID 는 BE 에서 FE 에 전달되지 않음 (VehicleDetail.driverCode 필드만 존재)
- spec QA-5 에서 `expect(codeText ?? '').toMatch(/^INSUNG-\w+/)` 로 UUID 형식 차단 단언 존재
- `vendorOrderId` 는 hover tooltip 에만 노출되며 UUID 아닌 vendor 측 문자열 ID

### 8. MATCHING badge 텍스트 정합 (PASS)

FE `STATUS_LABEL.MATCHING = '매칭 중...'` (VehicleMatchStatusBadge line 87).
spec QA-5-3 (line 717): `await expect(badge).toContainText('매칭 중')` — `toContainText` 이므로 "매칭 중..." 에 부분 매칭되어 PASS.

### 9. IT TC-2/TC-3/TC-4 webhook sandbox 우회 (PASS)

IT `@SpringBootTest properties` 에 `samhan.arologis.matcher.insung-quick.sandbox-mode=true` 설정.
컨트롤러 `verifyInsungSignature()` 는 `sandboxMode=true` 시 HMAC 검증을 우회하므로 IT 에서 `X-Insung-Signature` 헤더 없이도 200 응답 반환. TC-2/TC-3/TC-4 모두 헤더 미설정 상태로 POST 요청하여 sandbox 우회 경로 정상 동작.

### 10. Flyway V13 도메인 정합 (PASS)

`V13__add_insung_order_ref.sql`:
- 테이블명 `vehicles` (V1 base 와 일치)
- `vendor_order_id VARCHAR(64) NULL`, `vendor_status VARCHAR(20) NULL` — legacy 호환
- partial unique index `uq_vehicle_vendor_order_id_active ON vehicles(vendor_order_id) WHERE is_deleted = false AND vendor_order_id IS NOT NULL`
- domain-integrity-check.md SQL 과 인덱스명/조건 일치 확인

### 11. playwright.config.ts arologis-sp-10-2 project 추가 (PASS)

`arologis-sp-10-2` project 가 `testMatch: [/.*\/arologis\/sp-10-2-insung-quick-vendor\.spec\.ts/]` 로 정확히 지정되어 있으며 `baseURL: process.env.QA_AROLOGIS_URL ?? 'http://localhost:5173'` 이 spec 의 `BASE_URL` 기본값과 일치한다.

### 12. 사이드바 영향 0 (PASS)

QA-6 spec 이 `nav[aria-label="배차 메뉴"]` locator 기반으로 4개 링크 고정 검증. SP-10-2 신규 메뉴("인성", "vendor") 미추가 단언 포함. sidebar-no-impact.md 문서와 일치.

---

## 추가 관찰 사항 (개선 권고)

### [관찰-1] InsungLbsPanel data-testid="insung-lbs-panel" 존재하나 spec 은 aria-label 사용

InsungLbsPanel root div 에 `data-testid="insung-lbs-panel"` (line 314) 이 실제로 존재함에도 불구하고 spec 은 aria-label 기반 locator `[aria-label="GPS 위치 소스 패널"]` 를 사용하고 있다. spec 헤더 주석에는 "insung-lbs-panel testid 미부여 대체" 로 잘못 명시되어 있다. 다음 cycle 에서 testid 기반으로 통일하면 aria-label 변경 시 회귀에 강건해진다.

### [관찰-2] gps-active-source-label testid 존재하나 spec 은 패널 텍스트로 대체

InsungLbsPanel footer span 에 `data-testid="gps-active-source-label"` (line 374) 이 실제 존재한다. spec 은 `gpsPanel.toContainText('인성 LBS')` 로 패널 전체 textContent 에서 검증하고 있어 locator 정밀도가 낮다. 다음 cycle 에서 정합 권고.

### [관찰-3] QA-4-3 (GPS empty) — InsungLbsPanel 렌더 조건 미검증

QA-4-3 은 `gpsSources=[]` 일 때 패널 표시 유지를 검증하나, InsungLbsPanel 상위인 DispatchDetailPage `VehicleRow` 에서 `showGpsPanel = matchStatus === 'ASSIGNED' || 'DELIVERED'` 조건이 있다. [P0-2] 해결 후에도 `driverCode` 가 null 이면 `InsungLbsPanel` 렌더가 차단되는데(`vehicle.driverCode && <InsungLbsPanel .../>`), QA-4-3 fixture 에는 `driverCode: 'INSUNG-7291'` 이 설정되어 있어 이 케이스는 정상이다.

---

## cycle 2 의무 수정 목록

1. **[P0-1]** spec line 257, 316 의 `[data-testid="sandbox-banner"]` 를 `[data-testid="insung-sandbox-banner"]` 로 교체. 또는 FE SandboxBanner testid 를 `"sandbox-banner"` 로 변경. 둘 중 하나 선택 후 scenarios markdown line 243, 73 동기화.

2. **[P0-2]** `DispatchDetailRouteWrapper` 에 실제 fetch 또는 임시 state 를 추가하여 `dispatch=null` 상시 전달 문제 해결. QA `page.route()` mock 이 FE fetch 를 인터셉트할 수 있도록 데이터 흐름 연결.

3. **[P1-1]** scenarios markdown line 46 `data-testid="match-status-badge"` 를 `"vehicle-match-status-badge"` 로 정합.
