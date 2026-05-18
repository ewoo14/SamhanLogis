# SP-10-2 인성데이타 퀵프로그램 — Designer cycle 1 리뷰

**PR**: #245  
**head**: `f82a5ad5`  
**작성일**: 2026-05-19  
**작성자**: Designer agent (cycle 1)  
**검토 대상**: `docs/design/sp-10-2-insung-quick-vendor/` 5 markdown + `tokens.css` + `VehicleMatchStatusBadge.tsx` + `InsungLbsPanel.tsx` + `DispatchDetailPage.tsx`

---

## 종합 판정

| 항목 | 결함 수 | 비고 |
|---|---|---|
| P0 (즉각 수정 필수) | 0 | |
| P1 (머지 전 수정 권장) | 2 | 아래 D1, D2 |
| P2 (차기 슬라이스 개선) | 3 | 아래 D3, D4, D5 |

---

## P1 결함

### D1 — wireframe.md §6 QA 매핑 testid `match-status-badge` ↔ 실제 구현 `vehicle-match-status-badge` 불일치

**위치**: `docs/design/sp-10-2-insung-quick-vendor/wireframe.md` line 165  
**현재값**: `data-testid="match-status-badge"`  
**실제 구현값**: `data-testid="vehicle-match-status-badge"` (VehicleMatchStatusBadge.tsx line 199)

wireframe.md §6 QA 매핑 테이블에서 PENDING 상태 검증 요소를 `data-testid="match-status-badge"` 로 명시하고 있으나, 실제 FE 구현에서는 `vehicle-match-status-badge` 를 사용한다. QA 시나리오 cycle 2 정합표(sp-10-2-scenarios.md line 242)는 이미 올바른 testid 로 갱신됐음에도 wireframe.md 원본이 구버전 값을 그대로 유지하고 있다. 디자인 spec 문서가 구현 testid 와 불일치하면 차기 QA 작성자 혼동 위험이 있다.

**수정 방향**: wireframe.md §6 PENDING row 의 `"match-status-badge"` → `"vehicle-match-status-badge"` 로 정정.

---

### D2 — ASSIGNED/DELIVERED 상태 전이 시 `aria-live` 미적용 — wireframe §7 접근성 요구사항 미충족

**위치**: `clients/arologis-desktop/src/renderer/components/VehicleMatchStatusBadge.tsx` line 197  
**현재값**: `aria-live={status === 'MATCHING' ? 'polite' : undefined}`

wireframe.md §7 접근성 요구사항 표 두 번째 항목에서 "상태 전이 — `aria-live="polite"` container 로 감싸기 — ASSIGNED/DELIVERED 전이 시 자동 알림" 을 명시했다. 그러나 구현에서 `aria-live` 는 MATCHING 상태일 때만 조건부로 `polite` 가 붙고, ASSIGNED/DELIVERED 전이 시점에는 `aria-live` 가 제거된다. 이로 인해 screen reader 사용자가 매칭 완료/배송 완료 전이를 자동으로 인지하지 못한다.

WCAG 4.1.3 상태 메시지 (AA 레벨) 관점에서도, 동적 상태 변화를 DOM 조작 없이 알릴 때 `aria-live` 컨테이너를 상시 유지하는 방식이 올바르다. MATCHING 에서 ASSIGNED 로 전환 시 `aria-live` 가 undefined 로 전환되면서 컨테이너가 live region 을 벗어나 이전 예고 없이 내용이 바뀌는 상황이 발생한다.

**수정 방향**: `aria-live` 를 조건부가 아닌 상수 `"polite"` 로 고정. `aria-label` 만 상태별로 동적으로 설정하는 방식을 유지.

```tsx
// 수정 전
aria-live={status === 'MATCHING' ? 'polite' : undefined}

// 수정 후
aria-live="polite"
```

---

## P2 개선 사항

### D3 — tokens.md §2 WCAG 대비비 수치 underestimate (표기 오류, AAA 충족에는 영향 없음)

**위치**: `docs/design/sp-10-2-insung-quick-vendor/tokens.md` line 67, 87 / `tokens.css` line 103

tokens.md 에서 `--color-insung-text(#431407)` on `--color-insung-50(#FFF7ED)` 의 대비비를 "약 10.2:1 (AAA 충족)" 으로 명시했으나, WCAG 상대 휘도 공식에 따른 실제 계산값은 약 16.3:1 이다.

계산 근거:
- 배경 `#FFF7ED` (R=255, G=247, B=237) → L ≈ 0.9497
- 전경 `#431407` (R=67, G=20, B=7) → L ≈ 0.0115
- CR = (0.9497 + 0.05) / (0.0115 + 0.05) ≈ 16.3:1

AAA 기준(7:1) 을 크게 초과하므로 실용 기준에서 무결하다. 다만 tokens.md 와 tokens.css 주석의 수치 표기가 부정확하면 향후 다른 vendor 컬러 설계 시 기준점이 오염될 수 있다.

**수정 방향**: tokens.md §2 및 tokens.css line 103 주석에서 "≈ 10.2:1" → "≈ 16.3:1" 로 정정. (우선순위 낮음 — 기능/시각 결함 없음)

---

### D4 — QA 시나리오 QA-4 기대 항목의 data-testid 가 구버전 형식 잔류 (cycle 2 정합표와 내부 불일치)

**위치**: `docs/qa/sp-10-2-insung-quick-vendor/scenarios/sp-10-2-scenarios.md` line 130-131

QA-4 시나리오 "기대 (시나리오 A)" 항목이 `data-testid="gps-source-row-EXTERNAL_INSUNG_LBS"` 와 `data-testid="gps-source-row-APP_GPS_ACTIVE"` 를 명시하고 있다. 그러나 실제 구현(InsungLbsPanel.tsx line 64-65)은 각각 `gps-source-row-insung-lbs` / `gps-source-row-app-gps-active` 소문자 케밥 형식을 사용한다. cycle 2 정합표(line 248-249)에서는 케밥 형식이 올바르게 기재됐으나, 시나리오 본문이 갱신되지 않은 상태이다.

이 결함은 Designer 범위가 아닌 QA 문서 정합이지만, gps-priority-indicator.md 에서 testid 매핑을 참조하는 경로이므로 designer 리뷰에서 식별하여 전달한다.

**수정 방향**: QA 시나리오 QA-4 기대 항목 line 130-131 을 케밥 형식으로 정정.

---

### D5 — QA 시나리오 cycle 2 정합표 sandbox-banner testid 불일치

**위치**: `docs/qa/sp-10-2-insung-quick-vendor/scenarios/sp-10-2-scenarios.md` line 243

cycle 2 정합표 두 번째 행에서 `sandbox-banner` → `data-testid="sandbox-banner"` 로 기재하고 있으나, 실제 DispatchDetailPage.tsx(line 377) 구현은 `data-testid="insung-sandbox-banner"` 이다. QA-2 시나리오 본문(line 49, 73)은 `insung-sandbox-banner` 로 올바르게 기재됐으므로, 정합표 내부에서만 표기 불일치가 발생한다. false green 위험은 낮으나 문서 일관성을 위해 정정이 필요하다.

**수정 방향**: 정합표 line 243 `data-testid="sandbox-banner"` → `data-testid="insung-sandbox-banner"` 로 정정.

---

## 통과 항목 (이상 없음)

### T1 — `--color-insung-*` 6종 토큰 실존 확인

`clients/web/design-system/src/tokens/tokens.css` line 101~109 에서 6종 전체 (`--color-insung-primary`, `--color-insung-50`, `--color-insung-100`, `--color-insung-200`, `--color-insung-700`, `--color-insung-text`) 정상 정의됨. dark 오버라이드(line 469~476)도 별도 포함.

`clients/web/design-system/src/tokens/index.ts` line 120~127 에서 `colors.insung` 객체도 SP-09 패턴 (kftc, clova, aligo, nts) 과 동일 구조로 추가됨.

### T2 — WCAG AAA 충족

`--color-insung-text(#431407)` on `--color-insung-50(#FFF7ED)` 실제 대비비 ≈ 16.3:1 로 AAA(7:1) 기준을 대폭 초과. 5 vendor 컬러 중 최고 대비. (D3 에서 수치 표기 정정만 권고)

### T3 — VehicleMatchStatusBadge ↔ wireframe 4단계 시각화 정합

구현 파일 전수 대조 결과:

| 상태 | bg 토큰 | border 토큰 | text 토큰 | fontWeight | 아이콘 | driverCode | INSUNG 뱃지 |
|---|---|---|---|---|---|---|---|
| PENDING | neutral-100 O | neutral-200 O | neutral-600 O | medium(500) O | Clock O | X O | X O |
| MATCHING | brand-50 O | brand-200 O | brand-700 O | semibold(600) O | Spinner(brand-500) O | X O | O O |
| ASSIGNED | success-50 O | success-200 O | success-700 O | semibold(600) O | CheckCircle2 O | O(두 번째 줄) O | O O |
| DELIVERED | neutral-50 O | neutral-200 O | neutral-500 O | medium(500) O | CheckCheck O | O(서브텍스트) O | X O |

driverCode 색상 (ASSIGNED: `--color-success-600`, DELIVERED: `--color-neutral-400`) wireframe 명세와 일치.  
INSUNG 뱃지 pill shape (`--radius-full`) + `--color-insung-50` bg / `--color-insung-text` text / SP-09 패턴 일관성 확인.  
`vendorOrderId` hover tooltip (`title="인성 주문 ID: {vendorOrderId}"`) FE-4 명세와 일치.

### T4 — InsungLbsPanel ↔ gps-priority-indicator.md 정합

활성 source row: `--color-brand-50` bg + `border-left: 3px solid var(--color-brand-500)` / bold 강조 — wireframe mock §3-1 일치.  
비활성 source row: neutral-400 / weight 400 — §3-2 일치.  
stale (60초): `--color-warning-500` timestamp + AlertCircle + `--color-warning-700` 서브텍스트 — §3-3 일치.  
패널 표시 조건: ASSIGNED/DELIVERED 상위 컴포넌트 조건 분기 (`showGpsPanel` DispatchDetailPage line 411) 일치.  
footer 요약 row 토큰 전부 일치.  
경과 시간 1초 interval (`setInterval(1_000)`) 실시간 갱신 — §4 일치.  
소스 아이콘 4종 (Satellite/Navigation/NavigationOff/MapPin) — §5 일치.  
CSS transition `background-color/color var(--duration-slow)` — §6 stale fallback 애니메이션 일치.

### T5 — DispatchDetailPage NotifyResultSection ↔ notification-row.md 정합

채널 뱃지 (`insung-talk`: insung-50/text, `aligo`: aligo-50/text) pill shape 일치.  
성공 chip (success-50/success-700/CheckCircle2) 일치.  
실패 chip (danger-50/danger-700/XCircle) + errorCode 치환 로직 (`NOT_CONFIGURED`/`API_KEY` → "설정 오류 — 관리자 문의") — §2-2 보안 정책 일치.  
지연 chip (warning-50/warning-700/Clock) + "응답 대기 중 (최대 30초 후 자동 재시도)" 서브텍스트 일치.  
row 배경: FAILED=danger-50, DELAYED=warning-50, SUCCESS=neutral-0 — §2 각 상태별 tint 일치.  
padding-left 24px 들여쓰기 (정차 list 시각 계층 동일) 일치.  
`formatSentAt()` 당일 HH:mm / 타일 YYYY-MM-DD HH:mm 분기 — §2-1 timestamp 명세 일치.  
`maskPhone()` util 적용 — §4 마스킹 규칙 FE 처리 일치.

### T6 — sandbox 배너 ↔ wireframe §5 정합

`role="status"` + `aria-live="polite"` 일치.  
배경 `--color-warning-50` + `border-left: 4px solid var(--color-warning-500)` + `--color-warning-700` text 일치.  
AlertTriangle (Lucide) `--color-warning-500` 일치.  
닫기 버튼 없음 일치.

### T7 — design-system 신규 컴포넌트 0건 + Spinner 재사용

VehicleMatchStatusBadge.tsx MATCHING 아이콘에서 `<Spinner size="sm" tone="var(--color-brand-500)" />` 로 design-system 기존 컴포넌트 재사용 확인. 신규 컴포넌트 작성 없음.

### T8 — 아로로지스 명칭 일관성

`clients/arologis-desktop/src/renderer/` 내 한국어 표기 전수 grep 결과 "아로로지스" 정식 표기 사용됨. "아로로지" 단축형 0건. SP-10-2 신규 컴포넌트 3종(VehicleMatchStatusBadge, InsungLbsPanel, DispatchDetailPage) 의 주석/Javadoc 에서도 "아로로지스" 일관 적용.

### T9 — 인쇄 양식 영향 0 확인

print-impact.md 에서 slip-service 변경 0건 + 배차 완료 인쇄 CSS 변경 0건 명시. 실제 구현 파일에서 print CSS 수정 없음 확인. `docs/migration/legacy-print-forms/` 신규 파일 없음. 인쇄 양식 pixel 일치 원칙 적용 대상 아님 — 정당.

### T10 — 5 vendor 컬러 시각 구분 확인

INSUNG(hue 30°) ↔ NTS(135°) 105° 차이 / ↔ Aligo(174°) 144° / ↔ Clova(147°) 117° / ↔ KFTC(210°) 180°. 색조 분리 기준 충족. 명칭/tokens.css 주석/index.ts 주석 모두 deuteranopia 언급 포함.

### T11 — UX 일관성 (한국 ERP 컨벤션 / 모바일 영향 0)

DispatchDetailPage 는 `arologis-desktop` 한정. 사이드바 메뉴 변동 없음(QA-6 타깃). mobile-staff 화면 미변경. `--row-h` (40px) 준수. 라벨 13px/서브텍스트 12px 명세 일치.

---

## 요약

| 번호 | 레벨 | 위치 | 내용 | 수정 대상 |
|---|---|---|---|---|
| D1 | P1 | wireframe.md §6 line 165 | testid `match-status-badge` → `vehicle-match-status-badge` 정정 필요 | Designer(문서) |
| D2 | P1 | VehicleMatchStatusBadge.tsx line 197 | aria-live 조건부 → 상수 `"polite"` 로 수정 (ASSIGNED/DELIVERED 전이 screen reader 지원) | FE |
| D3 | P2 | tokens.md §2 / tokens.css line 103 | WCAG 대비비 표기 10.2:1 → 16.3:1 정정 (AAA 충족에 영향 없음) | Designer(문서) |
| D4 | P2 | sp-10-2-scenarios.md line 130-131 | QA-4 testid 대문자 형식 → 케밥 소문자 형식으로 정정 | QA(문서) |
| D5 | P2 | sp-10-2-scenarios.md line 243 | 정합표 `sandbox-banner` → `insung-sandbox-banner` 정정 | QA(문서) |
| T1~T11 | PASS | — | 토큰/컴포넌트/접근성/명칭/인쇄 영향 0 전부 통과 | — |
