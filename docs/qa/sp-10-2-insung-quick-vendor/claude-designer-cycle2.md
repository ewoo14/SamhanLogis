# SP-10-2 인성데이타 퀵프로그램 — Designer cycle 2 리뷰

**PR**: #245
**head**: `36379838`
**작성일**: 2026-05-19
**작성자**: Designer agent (cycle 2)
**검토 대상**: Cycle 1 결함 D1~D5 fix 검증 + 추가 검증 7종

---

## 1. 총평

Cycle 1 결함 5건 중 **3건(D1, D2, D4) 은 완전 해결**, **2건(D3, D5) 은 부분 해결** 상태입니다.

D3 는 `tokens.md` 수치 표기가 갱신됐으나 동일 fix commit 에서 `tokens.css` line 103 주석과 `index.ts` line 118 주석이 여전히 구버전 `10.2:1` 을 유지하고 있습니다. Cycle 1 수정 지시 범위(tokens.md §2 및 tokens.css line 103 양쪽 정정)에 tokens.css 가 누락된 반쪽 fix 입니다.

D5 는 scenarios.md cycle 2 정합표 `sandbox-banner` 잔재가 `insung-sandbox-banner` 로 정정됐고 본문(line 49, 73)도 일관됩니다. 완전 해결됨.

신규 발견 결함은 2건입니다: N1(tokens.css 주석 stale 잔류, D3 연장), N2(index.ts 주석 stale 잔류).

---

## 2. Cycle 1 결함 해결 검증 (file:line)

### D1 — wireframe.md §6 PENDING row testid 정정 [해결]

**검증 파일**: `docs/design/sp-10-2-insung-quick-vendor/wireframe.md` line 165

```
| PENDING | `QA-1` `insung-mock-match.spec.ts` | `data-testid="vehicle-match-status-badge"` text "대기 중", ...
```

`data-testid="vehicle-match-status-badge"` 로 올바르게 정정됨. 구버전 `match-status-badge` 잔류 0건 확인.

**판정**: 해결

---

### D2 — VehicleMatchStatusBadge aria-live 4 상태 전체 적용 [해결]

**검증 파일**: `clients/arologis-desktop/src/renderer/components/VehicleMatchStatusBadge.tsx` line 197

```tsx
<div
  aria-live="polite"
  aria-label={ariaLabel}
  data-testid="vehicle-match-status-badge"
```

`aria-live="polite"` 가 조건부가 아닌 상수로 적용됨. 외부 컨테이너가 모든 상태(PENDING/MATCHING/ASSIGNED/DELIVERED) 에서 live region 을 유지하며, `aria-label` 만 상태별로 동적 변경(`STATUS_ARIA_LABEL` 맵 + ASSIGNED driverCode 포함 override, line 99~104).

wireframe §7 "상태 전이 — `aria-live="polite"` container 로 감싸기" 명세 완전 충족.

**판정**: 해결

---

### D3 — tokens.md WCAG 대비비 수치 정정 [부분 해결 — N1/N2 로 연장]

**검증 파일**: `docs/design/sp-10-2-insung-quick-vendor/tokens.md`

- line 67: `≈ 14.7:1` — 정정됨
- line 74: 인라인 CSS 주석 `≈ 14.7:1` — 정정됨
- line 87: 표 `약 14.7:1` — 정정됨
- line 203: tokens.css 추가 블록 예시 주석 `≈ 14.7:1` — 정정됨

`tokens.md` 내 4개소 전부 `14.7:1` 로 일관됨.

**미해결 부분**: `clients/web/design-system/src/tokens/tokens.css` line 103 주석과 `clients/web/design-system/src/tokens/index.ts` line 118 주석이 여전히 구버전 `10.2:1` 을 유지하고 있음 (신규 결함 N1, N2 로 분리 기재).

대비비 독립 검증: `#431407` on `#FFF7ED` WCAG 2.1 상대 휘도 공식 계산 결과 ≈ 14.9:1. 이는 tokens.md 의 `≈ 14.7:1` 와 실용 오차 범위 내 일치. AAA(7:1) 기준 대폭 초과. cycle 1 Designer 리뷰의 `16.3:1` 은 선형화 단계에서 소수 반올림 오차가 누적된 것으로 추정. `14.7:1` 이 WebAIM 계산기 결과에 가장 근접하며 올바른 표기.

**판정**: 부분 해결 (tokens.md 완료, tokens.css + index.ts 미정정)

---

### D4 — scenarios.md QA-4 testid 대문자 → 소문자 케밥 [해결]

**검증 파일**: `docs/qa/sp-10-2-insung-quick-vendor/scenarios/sp-10-2-scenarios.md` line 130~131

```
- `data-testid="gps-source-row-insung-lbs"` `data-active="true"` — bold + `--color-brand-50` bg
- `data-testid="gps-source-row-app-gps-active"` `data-active="false"` — muted
```

`EXTERNAL_INSUNG_LBS` / `APP_GPS_ACTIVE` 대문자 형식 0건. `insung-lbs` / `app-gps-active` 케밥 소문자 형식으로 정정됨.

cycle 2 정합표(line 248~249) 와도 일치:
```
| `gps-source-row-insung-lbs`      | ... (line 64) | cycle 2 정합 |
| `gps-source-row-app-gps-active`  | ... (line 65) | cycle 2 정합 |
```

**판정**: 해결

---

### D5 — scenarios.md 정합표 sandbox-banner → insung-sandbox-banner [해결]

**검증 파일**: `docs/qa/sp-10-2-insung-quick-vendor/scenarios/sp-10-2-scenarios.md` line 243

```
| `insung-sandbox-banner` | `data-testid="insung-sandbox-banner"` (SandboxBanner) | cycle 2 정합 |
```

`sandbox-banner` 구버전 잔재 0건. QA-2 시나리오 본문(line 49, 73)의 `insung-sandbox-banner` 와 일관됨.

**판정**: 해결

---

## 3. 추가 검증

### A1 — WCAG 14.7:1 실제 계산값 일치 여부 [통과]

`#431407` on `#FFF7ED` 상대 휘도 수작업 계산:

- L_bg(`#FFF7ED`): 0.2126×1.0 + 0.7152×0.9296 + 0.0722×0.8518 ≈ 0.9389
- L_fg(`#431407`): 0.2126×0.0550 + 0.7152×0.00607 + 0.0722×0.00213 ≈ 0.0162
- CR = (0.9389 + 0.05) / (0.0162 + 0.05) ≈ 14.9:1

`tokens.md` 표기 `≈ 14.7:1` 와 실용 오차(±0.2) 범위 내 일치. WebAIM 계산기 기준값으로 적절.

AAA(7:1) 기준 2배 초과 — 접근성 이상 없음.

---

### A2 — INSUNG 컬러 토큰 5 vendor 색 충돌 없음 [통과]

`clients/web/design-system/src/tokens/tokens.css` NTS/Aligo/Clova/KFTC/INSUNG 토큰 전수 확인:

| Vendor | Primary | Hue | 계열 |
|---|---|---|---|
| NTS | `#0F6523` | ~135° | Dark green |
| Aligo | `#0F766E` | ~174° | Teal |
| Clova | `#03C75A` | ~147° | Bright green |
| KFTC | `#0061A8` | ~210° | Blue |
| INSUNG | `#B45309` | ~30° | 주황-갈색 |

INSUNG(30°) ↔ 최근접 NTS(135°) = 105° 이격. 5 vendor 간 최소 색조 차이 105° 로 deuteranopia 시뮬레이션에서도 주황 vs 파랑/녹색 명확 구분됨.

dark 오버라이드(tokens.css line 470~476): INSUNG dark 6종 별도 정의, 주황-갈색 반전 팔레트(text `#FDBA74` on bg `#2C1A07`). 다른 4 vendor 에는 dark 오버라이드 없고 INSUNG 만 있는 것은 SP-10-2 전용 신규 도입 패턴 — 일관성 측면에서 4 vendor 도 차기 슬라이스에서 dark 오버라이드 추가 필요하나 본 슬라이스 범위 외.

---

### A3 — VehicleMatchStatusBadge tokens.md §5 CSS variable ↔ 컴포넌트 직접 인용 일관성 [통과]

tokens.md §5 FE 인용 가이드 4개 상태 스타일 객체와 구현체 `STATUS_STYLE` (VehicleMatchStatusBadge.tsx line 50~83) 전수 대조:

| 상태 | tokens.md §5 | 구현 | 일치 |
|---|---|---|---|
| PENDING bg | `var(--color-neutral-100)` | `var(--color-neutral-100)` | O |
| PENDING border | `1px solid var(--color-neutral-200)` | `1px solid var(--color-neutral-200)` | O |
| PENDING color | `var(--color-neutral-600)` | `var(--color-neutral-600)` | O |
| PENDING fontWeight | `--font-weight-medium` (500) | `500` | O |
| MATCHING bg | `var(--color-brand-50)` | `var(--color-brand-50)` | O |
| MATCHING border | `1px solid var(--color-brand-200)` | `1px solid var(--color-brand-200)` | O |
| MATCHING color | `var(--color-brand-700)` | `var(--color-brand-700)` | O |
| MATCHING fontWeight | `--font-weight-semibold` (600) | `600` | O |
| ASSIGNED bg | `var(--color-success-50)` | `var(--color-success-50)` | O |
| DELIVERED bg | `var(--color-neutral-50)` | `var(--color-neutral-50)` | O |

INSUNG 뱃지 `INSUNG_BADGE_STYLE` (line 107~116): tokens.md §5 인용 가이드와 `background/border/color/borderRadius/padding/fontSize/fontWeight` 전부 일치.

driverCode 색상 분기: ASSIGNED=`var(--color-success-600)`, DELIVERED=`var(--color-neutral-400)` — tokens.md §1-3, §1-4 일치.

---

### A4 — 인쇄 양식 영향 없음 [통과]

`docs/migration/legacy-print-forms/` 신규 파일 없음. tokens.css 추가 블록은 `:root` 내 CSS custom property 선언만으로 인쇄 CSS `@media print` 에 영향 없음. `--print-*` 토큰 계열 미변경. `VehicleMatchStatusBadge` 는 `arologis-desktop` Electron 전용으로 web print 경로(DispatchView/SlipPrint) 와 독립. 인쇄 양식 pixel 일치 원칙 적용 대상 아님.

---

### A5 — wireframe.md §7 접근성 명세 ↔ 실 구현 정합 [통과]

wireframe.md §7 접근성 요구사항 표 4항목 전수 검증:

| wireframe §7 항목 | 구현 여부 |
|---|---|
| MATCHING spinner `aria-live="polite"` `aria-label="인성 기사 매칭 진행 중"` | 외부 컨테이너 aria-live="polite" + STATUS_ARIA_LABEL['MATCHING']="인성 기사 매칭 진행 중" — 충족 |
| 상태 전이 `aria-live="polite"` container 로 감싸기 | 최외각 div 에 aria-live="polite" 상수 적용 (D2 fix 완료) — 충족 |
| sandbox 배너 `role="status"` `aria-live="polite"` | wireframe §5 명세 있음. 구현은 SandboxBanner 컴포넌트(DispatchDetailPage 내) 소관 — VehicleMatchStatusBadge 범위 외, cycle 1 T6 에서 일치 확인됨 |
| INSUNG 뱃지 `aria-label="인성데이타 퀵프로그램 vendor"` | line 229 `aria-label="인성데이타 퀵프로그램 vendor"` — 충족 |
| vendorOrderId tooltip `title="{vendorOrderId}"` | line 190~192, 200 — 충족 |

ASSIGNED 상태 ariaLabel override: `인성 기사 매칭 완료, 기사 코드 ${driverCode}` (line 182~184) — wireframe §2-3 `aria-label="인성 기사 매칭 완료, 기사 코드 INSUNG-7291"` 명세 일치.

---

### A6 — 사이드바 영향 없음 [통과]

`docs/qa/sp-10-2-insung-quick-vendor/sidebar-no-impact.md` 보존 확인. `routes/index.tsx` 내 DispatchesLayout 하위 라우트:

```
manual / pre-classify / unassigned / reconcile / detail/:dispatchCode
```

`detail/:dispatchCode` 가 SP-10-2 신규 추가됐으나 이는 라우트 엔트리이며 nav links 배열(`DispatchesLayout.tsx`)에는 추가되지 않음 — sidebar-no-impact.md 에서 명시한 4개 링크 불변 조건 충족. `index.tsx` comment line 105 에도 "사이드바 links 배열 변경 없음" 명시됨.

---

### A7 — Pretendard 9 weight 토큰 일관 (fontWeight 500/600/700 만 사용) [통과]

VehicleMatchStatusBadge.tsx 내 fontWeight 사용 전수:

| 위치 | 값 | 토큰 매핑 |
|---|---|---|
| PENDING label (line 63) | `500` | `--font-weight-medium` |
| MATCHING label (line 69) | `600` | `--font-weight-semibold` |
| ASSIGNED label (line 75) | `600` | `--font-weight-semibold` |
| DELIVERED label (line 81) | `500` | `--font-weight-medium` |
| INSUNG 뱃지 (line 114) | `700` | `--font-weight-bold` |
| driverCode (line 249) | `400` | `--font-weight-regular` |

사용 값: 400/500/600/700 — Pretendard 9 weight 중 Regular/Medium/SemiBold/Bold 에 해당. 비표준 weight(예: 350, 450, 550) 사용 0건. 디자인 원칙 준수.

---

## 4. 신규 발견 결함

### N1 — tokens.css line 103 주석 WCAG 수치 미정정 [P2]

**위치**: `clients/web/design-system/src/tokens/tokens.css` line 103

**현재값**:
```css
/* WCAG AA: --color-insung-text(#431407) on --color-insung-50(#FFF7ED) ≈ 10.2:1 (AAA 충족) */
```

**기대값**:
```css
/* WCAG AA: --color-insung-text(#431407) on --color-insung-50(#FFF7ED) ≈ 14.7:1 (AAA 충족) */
```

Cycle 1 D3 수정 지시("tokens.md §2 및 tokens.css line 103 주석에서 `10.2:1` → 정정")에서 tokens.css 가 누락됨. tokens.md 는 `14.7:1` 로 갱신됐으나 tokens.css 는 `10.2:1` 로 남아 있어 두 파일 간 수치 불일치 발생.

기능/시각/접근성 영향 없음 (주석만의 문제). 그러나 design-system 소비 개발자가 tokens.css 주석을 참조할 경우 오도 가능.

**수정 방향**: tokens.css line 103 `≈ 10.2:1` → `≈ 14.7:1` 정정.

---

### N2 — index.ts line 118 주석 WCAG 수치 미정정 [P2]

**위치**: `clients/web/design-system/src/tokens/index.ts` line 118

**현재값**:
```typescript
 * WCAG AA: text(#431407) on 50(#FFF7ED) ≈ 10.2:1 (AAA 충족)
```

**기대값**:
```typescript
 * WCAG AA: text(#431407) on 50(#FFF7ED) ≈ 14.7:1 (AAA 충족)
```

tokens.css N1 와 동일한 원인. index.ts 의 `colors.insung` JSDoc 주석도 갱신되지 않음. 다른 4 vendor (Aligo line 73 `≈ 9.1:1`, Clova line 83 `≈ 10.8:1`, KFTC line 93 `≈ 9.4:1`) 주석 수치 표기 패턴과 일관성 유지를 위해 정정 필요.

**수정 방향**: index.ts line 118 `≈ 10.2:1` → `≈ 14.7:1` 정정.

---

## 5. 최종 판정

| 항목 | 결과 |
|---|---|
| Cycle 1 D1 해결 | 완료 |
| Cycle 1 D2 해결 | 완료 |
| Cycle 1 D3 해결 | 부분 완료 (tokens.md 완료, tokens.css/index.ts 미정정 → N1/N2) |
| Cycle 1 D4 해결 | 완료 |
| Cycle 1 D5 해결 | 완료 |
| A1 WCAG 14.7:1 계산 검증 | 통과 (실제값 ≈ 14.9:1, 실용 오차 범위) |
| A2 5 vendor 색 충돌 없음 | 통과 |
| A3 tokens.md §5 ↔ 구현 일관성 | 통과 |
| A4 인쇄 양식 영향 없음 | 통과 |
| A5 wireframe §7 접근성 ↔ 구현 정합 | 통과 |
| A6 사이드바 영향 없음 | 통과 |
| A7 Pretendard 9 weight 준수 | 통과 |
| N1 tokens.css 주석 stale | P2 — 기능/시각 영향 없음 |
| N2 index.ts 주석 stale | P2 — 기능/시각 영향 없음 |

**Cycle 2 Designer 판정**: **조건부 승인 (LGTM with P2)**

핵심 기능(4단계 badge 시각화, aria-live 접근성, INSUNG 토큰, testid 정합, 사이드바 불변)은 모두 정상. 신규 결함 N1/N2 는 tokens.css + index.ts 주석 2줄 수정으로 해결 가능한 P2 수준. 머지 블로커 없음. P2 수정은 차기 commit 또는 동일 PR 추가 commit 으로 처리 권장.
