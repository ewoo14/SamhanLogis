# SP-10-2 인성데이타 퀵프로그램 vendor 통합 — QA 시나리오 Plan

> 작성일: 2026-05-19
> cycle 2 갱신: 2026-05-19
> 담당: QA Agent
> 브랜치: `feat/sp-10-2-insung-quick-program`
> 참조: `docs/planning/2026-05-19_sp-10-2-insung-quick-program.md` §5
> Designer 1:1 매핑: `docs/design/sp-10-2-insung-quick-vendor/wireframe.md` §6
>
> **cycle 2 변경 사항**:
> - mockMatcherConfig (/matcher-config 별도 endpoint) 제거 — sandboxMode 는 DispatchDetail.sandboxMode boolean 필드
> - 진입 URL: `/#/dispatches/detail/D-001` (DispatchDetailPage 독립 라우트 옵션 A 가정)
> - testid 11종 FE 실제값 기준 정합 (아래 표 참조)
> - GpsSource 인터페이스 정합: `active` / `latitude` / `longitude` / `lastReceivedAt` 필드명 사용
> - DispatchDetail fixture: `vehicles: VehicleDetail[]` 배열 구조로 통합

---

## 시나리오 개요

| QA case | spec 파일 | Designer 매핑 상태 | BE IT 연계 |
|---------|----------|------------------|-----------|
| QA-1 | `insung-mock-match.spec.ts` 동등 | PENDING badge / Clock / neutral-100 | InsungQuickIntegrationIT C1 (mock provider) |
| QA-2 | `insung-sandbox-fallback.spec.ts` 동등 | PENDING 복귀 / sandbox 배너 | InsungQuickIntegrationIT C2 (sandbox RPC 예외) |
| QA-3 | `insung-notify-channel-separation.spec.ts` 동등 | 알림 발송 결과 row 3 상태 | InsungQuickIntegrationIT C3 (notify channel) |
| QA-4 | `insung-gps-priority.spec.ts` 동등 | GPS 패널 우선순위 / stale fallback | InsungQuickIntegrationIT C4 (GPS priority) |
| QA-5 | `insung-webhook-status-update.spec.ts` 동등 | MATCHING→ASSIGNED→DELIVERED 전이 | InsungQuickIntegrationIT C5 (webhook 3종) |
| QA-6 | `insung-sidebar-no-impact.spec.ts` 동등 | 사이드바 미변동 | (BE 독립, FE 단독 검증) |

모든 case: `page.route()` mock 으로 BE 의존 제거 → FE 단독 검증 가능.
BE 완료 후 mock 제거 + 실 server 연동으로 확장 예정.

---

## QA-1: provider=mock 매칭 흐름 회귀

### 사용자
DISPATCH 역할 관리자

### 단계
1. `samhan.arologis.matcher.provider=mock` 설정 상태에서 arologis-desktop 접속
2. 배차 목록 페이지(`/#/dispatches/manual`) 진입
3. vehicle row 의 `VehicleMatchStatusBadge` 확인

### 기대
- `data-testid="match-status-badge"` 텍스트: **"대기 중"**
- 아이콘: `Clock` (Lucide) — `--color-neutral-400`
- 배경: `--color-neutral-100` (#EDF0F4)
- sandbox 배너 미표시 (`data-testid="insung-sandbox-banner"` invisible)
- driverCode row 미표시 (`data-testid="match-status-driver-code"` invisible)
- mock provider 전환 후 `MockDriverMatcher` 즉시 ASSIGNED 전이 → regression 0 확인

### 스크린샷
![QA-1 mock PENDING badge](screenshots/QA-1-mock-pending-badge.png)

---

## QA-2: sandbox + RPC 예외 → PENDING 유지 + sandbox 배너

### 사용자
DISPATCH 역할 관리자

### 단계
1. `samhan.arologis.matcher.provider=insung-quick`, `sandboxMode=true` 설정
2. `InsungQuickClient.requestMatch()` RPC 예외 시뮬레이션 (mock route → BE `fail-soft` 응답)
3. vehicle row badge 상태 확인
4. 페이지 상단 sandbox 배너 확인

### 기대
- Vehicle.status: **PENDING** 유지 (fail-soft → `DriverMatchResult.empty()`, MATCHING 으로 전이되지 않음)
- `Loader2` spinner 미표시 (MATCHING 상태 아님)
- driverCode row 미표시
- sandbox 배너: `data-testid="insung-sandbox-banner"` visible + `role="status"` + 텍스트 "sandbox 모드" 포함
- 배너 배경: `--color-warning-50`

### 스크린샷
![QA-2 sandbox RPC fail-soft](screenshots/QA-2-sandbox-rpc-fail-soft.png)

![QA-2 sandbox 배너](screenshots/QA-2-sandbox-banner.png)

---

## QA-3: 알림톡 채널 분리 — 3 상태 색상 확인

### 사용자
DISPATCH 역할 관리자

### 단계
1. Vehicle.status = ASSIGNED, `notify.dispatch-channel=insung-talk`, `invite-channel=aligo`
2. 배차 상세 페이지 vehicle row 하단 "알림 발송 결과" 섹션 확인
3. 인성 알림톡 성공 row, Aligo SMS 성공 row, 실패 row, 지연 row 각각 확인
4. 수신자 번호 마스킹 형식 확인

### 기대
**성공 row**:
- 채널 뱃지: `[인성 알림톡]` — `--color-insung-50` bg / `--color-insung-text` text
- status chip: `[✓ 발송 성공]` — `--color-success-50` bg
- 마스킹 번호: 정규식 `010-XXXX-\d{4}` 패턴 일치

**실패 row**:
- `data-testid="notification-status-chip-failed"` visible + "발송 실패" 텍스트
- 사유 서브텍스트: `data-testid="notification-fail-reason"` visible, 텍스트 non-empty
- 보안 오류(`INSUNG_QUICK_NOT_CONFIGURED`) 는 "설정 오류 — 관리자 문의" 로 치환

**지연 row**:
- `data-testid="notification-status-chip-delayed"` visible + "발송 지연" 텍스트
- `--color-warning-50` row 배경

### 스크린샷
![QA-3 알림톡 성공](screenshots/QA-3-notify-success.png)

![QA-3 알림톡 실패](screenshots/QA-3-notify-failed.png)

![QA-3 알림톡 지연](screenshots/QA-3-notify-delayed.png)

---

## QA-4: GPS 우선순위 — insung-lbs 우선 + stale fallback

### 사용자
DISPATCH 역할 관리자

### 단계 (시나리오 A: insung-lbs 활성)
1. Vehicle.status = ASSIGNED, `DriverLocation` sources: EXTERNAL_INSUNG_LBS + APP_GPS_ACTIVE 동시 수신
2. `InsungLbsPanel` (`data-testid="insung-lbs-panel"`) 확인
3. 1순위 row (`EXTERNAL_INSUNG_LBS`) 활성 스타일, 2순위 row 비활성(muted) 확인
4. footer 요약: "인성 LBS" 표시

### 기대 (시나리오 A)
- `data-testid="gps-source-row-EXTERNAL_INSUNG_LBS"` `data-active="true"` — bold + `--color-brand-50` bg
- `data-testid="gps-source-row-APP_GPS_ACTIVE"` `data-active="false"` — muted
- `data-testid="gps-active-source-label"` 텍스트 "인성 LBS" 포함
- PENDING / MATCHING 상태에서는 패널 미표시

### 단계 (시나리오 B: stale fallback)
1. EXTERNAL_INSUNG_LBS `lastReceivedAt` = 61초 전 (stale 판정)
2. APP_GPS_ACTIVE 최신 수신 상태
3. stale 경고 확인 + fallback 활성 확인

### 기대 (시나리오 B)
- `data-testid="gps-stale-warning"` visible (⚠ 아이콘 + warning 색)
- APP_GPS_ACTIVE row `data-active="true"` 로 전환
- footer "앱 GPS (활성)" 으로 변경

### 단계 (시나리오 C: DriverLocation empty)
1. `DriverLocation` API 빈 배열 응답
2. 패널 표시 + "위치 정보 없음" 메시지 확인

### 기대 (시나리오 C)
- `data-testid="insung-lbs-panel"` 표시 유지
- 패널 내 "위치 정보 없음" 텍스트 표시

### 스크린샷
![QA-4 insung-lbs 활성](screenshots/QA-4-gps-insung-active.png)

![QA-4 stale fallback](screenshots/QA-4-gps-stale-fallback.png)

![QA-4 GPS empty](screenshots/QA-4-gps-empty.png)

---

## QA-5: webhook 3종 수신 → badge 전이

### 사용자
DISPATCH 역할 관리자

### 단계 (match-result webhook)
1. Vehicle.status = MATCHING (requestMatch 호출 후)
2. `POST /internal/arologis/insung/match-result` webhook 수신 시뮬레이션 (BE mock 응답)
3. Vehicle.status → ASSIGNED 전이 확인
4. badge 텍스트 + driverCode + INSUNG 뱃지 확인

### 기대
- badge: `data-testid="match-status-badge"` 텍스트 **"매칭 완료"** — `--color-success-50` bg
- driverCode: `data-testid="match-status-driver-code"` 텍스트 정규식 `INSUNG-\w+`
- INSUNG 뱃지: `data-testid="insung-vendor-badge"` visible

### 단계 (delivered webhook)
1. Vehicle.status = DELIVERED 상태
2. badge 텍스트 + CheckCheck 아이콘 + INSUNG 뱃지 미표시 확인

### 기대
- badge: **"배송 완료"** — `--color-neutral-50` bg
- CheckCheck 아이콘 visible (`data-icon="CheckCheck"` 또는 aria)
- INSUNG 뱃지: invisible (DELIVERED 상태 이후 vendor 강조 불필요)
- driverCode: 트레이서빌리티용으로 여전히 표시

### 단계 (MATCHING badge 진행 중)
1. Vehicle.status = MATCHING
2. spinner(`Loader2`) + aria-live="polite" + INSUNG 뱃지 확인

### 기대
- badge: **"매칭 중..."** — `--color-brand-50` bg + Loader2 spin
- `aria-live="polite"` 속성 존재
- driverCode 미표시 (아직 배정 전)

### 스크린샷
![QA-5 webhook ASSIGNED](screenshots/QA-5-webhook-assigned.png)

![QA-5 webhook DELIVERED](screenshots/QA-5-webhook-delivered.png)

![QA-5 webhook MATCHING](screenshots/QA-5-webhook-matching.png)

---

## QA-6: 사이드바 메뉴 unchanged

### 사용자
DISPATCH 역할 관리자

### 단계
1. arologis-desktop 배차 페이지 진입
2. `nav[aria-label="배차 메뉴"]` nav 링크 수 확인
3. SP-10-2 이후 신규 vendor 메뉴 추가 여부 확인

### 기대
- `nav[aria-label="배차 메뉴"]` 내 `<a>` 태그 정확히 **4개** — DispatchesLayout.tsx `links` 배열 불변
- 4개 메뉴: "수동 배차", "가배차 분류", "미배차", "실배차 비교" (SP-10-2 전/후 동일)
- 신규 vendor 관련 메뉴 (예: "인성 설정", "vendor config") nav 에 없음
- `arologis-mobile` 영향 0 (본 spec 은 desktop 전담 — mobile spec 별도)

### 스크린샷
![QA-6 사이드바 unchanged](screenshots/QA-6-sidebar-unchanged.png)

![QA-6 AppLayout 신규 메뉴 없음](screenshots/QA-6-appsidebar-no-new-menu.png)

---

## false green 가드 체크리스트

- `|| true` 패턴: spec 내 0건 확인
- `test.skip(!ok)` 패턴: 0건 — `expect(ok).toBe(true)` 로 FAIL 처리 (dev server 미가동 시 명확 실패)
- `page.setContent()` 패턴: 0건 — 모든 case `page.goto(BASE_URL + '/#/...')` 실제 URL 이동
- `data-testid` / `aria-label` / `textContent` 기반 assertion: 전 case 적용
- BE 미가동 시: `isServerAvailable()` → `expect(ok).toBe(true)` FAIL (CI dry-run 에서 false green 방지)
- UUID 노출 금지: driverCode `INSUNG-{vendorId}` 형식만 노출 (UUID 아님)

## cycle 2 testid 정합 현황

| spec assertion | FE 실제 testid / locator | 상태 |
|---|---|---|
| `vehicle-match-status-badge` | `data-testid="vehicle-match-status-badge"` (VehicleMatchStatusBadge line 199) | cycle 2 정합 |
| `sandbox-banner` | `data-testid="sandbox-banner"` (SandboxBanner line 369) | cycle 2 정합 |
| `notify-row-insung-talk` / `notify-row-aligo` | `data-testid="notify-row-{channel}"` (NotifyResultSection line 286) | cycle 2 정합 |
| `notification-result-section` | `data-testid="notification-result-section"` (line 259) | cycle 2 정합 |
| `insung-vendor-badge` | `data-testid="insung-vendor-badge"` (VehicleMatchStatusBadge line 230) | cycle 1 이후 유지 |
| `match-status-driver-code` | `data-testid="match-status-driver-code"` (VehicleMatchStatusBadge line 241) | cycle 1 이후 유지 |
| `gps-source-row-insung-lbs` | `data-testid="gps-source-row-insung-lbs"` (InsungLbsPanel SOURCE_TESTID line 64) | cycle 2 정합 |
| `gps-source-row-app-gps-active` | `data-testid="gps-source-row-app-gps-active"` (line 65) | cycle 2 정합 |
| `gps-stale-warning` | `data-testid="gps-stale-warning"` (SourceRow line 250) | cycle 1 이후 유지 |
| `aria-label="GPS 위치 소스 패널"` | aria-label 기반 locator (InsungLbsPanel line 313) | cycle 2 정합 (insung-lbs-panel testid 미부여 대체) |
| 패널 footer 텍스트 | `gpsPanel.toContainText('인성 LBS')` / `'앱 GPS'` | cycle 2 정합 (gps-active-source-label testid 미부여 대체) |
| 마스킹 번호 | `insungRow.textContent()` 정규식 검증 | cycle 2 정합 (notification-masked-phone testid 미부여 대체) |
| 실패 사유 | `failRow.textContent()` 포함 검증 | cycle 2 정합 (notification-fail-reason testid 미부여 대체) |
| 발송 상태 텍스트 | row.toContainText('발송 성공'/'발송 실패'/'발송 지연') | cycle 2 정합 (status-chip testid 미부여 대체) |

backlog testid (FE cycle 3 이후 확인):
- `insung-lbs-panel` — InsungLbsPanel root div 에 data-testid 추가 시 aria-label 대체 가능
- `gps-active-source-label` — footer span 에 data-testid 추가 시 textContent 대체 가능
- `channel-badge-insung-talk` / `channel-badge-aligo` — 채널 badge span 에 data-testid 추가 시 정합
- `notification-status-chip-{status}` — NotifyStatusChip span 에 data-testid 추가 시 정합
- `notification-masked-phone` — 마스킹 번호 span 에 data-testid 추가 시 정합
- `notification-fail-reason` — errorCode span 에 data-testid 추가 시 정합

---

## Designer 1:1 매핑 가드

| wireframe.md §6 매핑 항목 | QA case | 검증 요소 |
|--------------------------|---------|----------|
| PENDING badge (neutral-100 bg, Clock 아이콘) | QA-1 | `data-testid="match-status-badge"` text "대기 중" |
| MATCHING → PENDING fail-soft (sandbox RPC 예외) | QA-2 | PENDING 복귀 + sandbox 배너 `role="status"` |
| ASSIGNED + INSUNG 뱃지 | QA-5 | `driverCode` "INSUNG-*" + `data-testid="insung-vendor-badge"` |
| DELIVERED + CheckCheck | QA-5 | badge text "배송 완료" + INSUNG 뱃지 없음 |
| sandbox 배너 표시 | QA-2 | 배너 visible + warning-50 |
| 사이드바 미변동 | QA-6 | nav 4개 links 정확히 일치 |
