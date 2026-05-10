## Designer Reviewer — PR #141 (P0-6 거래처 4탭 UI)

검토 기준: `PARTNER-4TAB-DESIGN.md` (self) + FE 3파일 (PartnerCreatePage / PartnerDetailDialog / PartnersPage) + Tabs 컴포넌트 (design-system)

---

### 1. Tabs 컴포넌트 ARIA 준수 — **PASS**

`clients/web/design-system/src/components/Tabs/Tabs.tsx`

| 체크 항목 | 결과 |
|---|---|
| `role="tablist"` | PASS — tablist div 에 명시 |
| `role="tab"` | PASS — 각 button 에 적용 |
| `role="tabpanel"` | PASS — 각 패널 div 에 적용 |
| `aria-selected="true/false"` | PASS — `isActive` 상태 연동 |
| 활성 탭 `tabIndex={0}` / 비활성 `tabIndex={-1}` | PASS — 구현 확인 |
| `aria-controls` / `aria-labelledby` 연결 | PASS — `uid` 기반 id 생성 |
| `ArrowLeft` / `ArrowRight` / `Home` / `End` 키보드 이동 | PASS — `handleKeyDown` 구현 |
| `aria-label` prop (tablist) | PASS — `ariaLabel` prop → `"거래처 등록 탭"` / `"거래처 상세 탭"` 각각 전달 |

Tabs.module.css 에서 활성 탭 indicator 는 `var(--action-brand)` / `var(--line-focus)` 토큰 사용 — raw hex 없음. PASS.

---

### 2. raw hex 완전 제거 — **조건부 PASS (경미 지적)**

`PartnerCreatePage.tsx` / `PartnerDetailDialog.tsx` / `PartnersPage.tsx` 전수 검사 결과:

**완전 standalone raw hex 없음** — PASS 기준 충족.

단, CSS-in-JS inline style 의 CSS 변수 fallback 값으로 raw hex 가 다수 포함되어 있음:

```tsx
// PartnerCreatePage.tsx 279-282
background: 'var(--color-danger-50, #FEF2F2)',
border: '1px solid var(--color-danger-200, #FECACA)',
color: 'var(--color-danger-700, #B91C1C)',

// 공통 selectStyle / textareaStyle
border: '1px solid var(--color-border, #D1D5DB)',
background: '#fff',   ← PartnerDetailDialog.tsx:817
```

`#fff` (PartnerDetailDialog.tsx L817 `selectStyle`) 는 fallback 없는 단독 raw hex. 엄밀히 **위반**이나 흰색 배경이므로 시각적 영향 미미.

**요청**: 차기 iteration(3차)에서 아래와 같이 토큰화 예정 목록으로 등록.

| 파일 | 위치 | 현재 | 교체 토큰 |
|---|---|---|---|
| PartnerDetailDialog.tsx | L817 `selectStyle` | `background: '#fff'` | `var(--surface-card)` |
| PartnerCreatePage.tsx | L750 `selectStyle` | `background: '#fff'` | `var(--surface-card)` |
| 공통 fallback hex | 에러 배너 | `#FEF2F2`, `#FECACA`, `#B91C1C` | design-system `--state-danger-bg`, `--state-danger` 토큰 직접 사용 |

이번 PR 에서 CI 차단 기준(단독 raw hex 0건)은 충족. 단, fallback hex 는 후속 cleanup PR 에서 통합 제거 권장.

---

### 3. data-testid 일치 검증 — **부분 불일치 (지적)**

디자인 가이드(`§8.1 data-testid 전체 목록`) vs FE 구현 비교:

| 디자인 가이드 명세 | FE 구현 | 상태 |
|---|---|---|
| `partner-create-form` (form 래퍼) | 미구현 — `<form>` 래퍼 없음, `<div>` 사용 | **MISS** |
| `partner-tab-1` ~ `partner-tab-4` (탭 버튼) | 미구현 — Tabs 컴포넌트에 per-tab testid 미노출 | **MISS** |
| `partner-shipping-address-add-button` | 미구현 — 버튼에 data-testid 없음 | **MISS** |
| `partner-contact-add-button` | 미구현 — 버튼에 data-testid 없음 | **MISS** |
| `partner-detail-dialog` | PASS — `data-testid="partner-detail-dialog"` Modal 에 전달 | PASS |
| `partner-create-submit` | PASS | PASS |
| `partner-create-basic-name` / `partner-create-basic-bizno` / `partner-create-basic-type` | PASS | PASS |
| `partner-detail-edit-btn` / `partner-detail-save-btn` / `partner-detail-cancel-edit-btn` | PASS | PASS |

**핵심 미구현 4건** — QA 자동화 시나리오(탭 클릭 → 패널 전환 검증)가 작동하지 않습니다.

수정 방안:

```tsx
// PartnerCreatePage — form 래퍼 추가
<form data-testid="partner-create-form" onSubmit={...}>

// Tabs 컴포넌트에 per-tab testid 지원 추가 (TabItem 인터페이스 확장)
export interface TabItem {
  label: ReactNode
  disabled?: boolean
  testId?: string   // 추가
}
// 버튼 렌더:
<button ... data-testid={tab.testId}>

// ShippingAddressTab 추가 버튼
<Button ... data-testid="partner-shipping-address-add-button">

// ContactTab 추가 버튼
<Button ... data-testid="partner-contact-add-button">
```

---

### 4. 디자인 가이드 vs 구현 UX 차이 — **경미 2건**

#### 4-1. Create 하단 네비게이션 버튼 미구현

가이드 §15: `[이전 탭]` / `[다음 탭]` / `[저장 완료]` 하단 버튼 스펙 정의.
현재 구현: 하단 버튼 없음, 헤더 `[등록]` 버튼만 존재.

Iteration 계획(§20) 2~3차에서 구현 예정으로 이해. 이번 1차 산출물 범위 내 허용.

#### 4-2. Edit 탭 dot indicator 미구현

가이드 §3: 변경된 탭에 `6px circle var(--color-warning)` dot indicator (Edit 모드 전용).
현재 구현: dot indicator 없음.

동일하게 후속 iteration 범위로 허용.

---

### 5. 타이포그래피 / 스페이싱 — **PASS**

- 탭 레이블: `var(--font-size-sm)` — Tabs.module.css 확인, PASS.
- 활성 탭: `var(--font-weight-semibold)` — `.tabActive` 클래스, PASS.
- 탭 패널 padding: `padding: 20px 0` — 가이드 `var(--space-5)` = 20px, PASS.
- 다중행 gap 16px — `gridStyle gap: 16` PASS.
- Pretendard 자동 상속: tablist `font-family: var(--font-family-sans)` 선언, PASS.

---

### 6. UUID 비공개 — **PASS**

`PartnerDetailDialog.tsx` — `partnerId` (UUID) 는 API 호출 경로에만 사용, 화면 노출 없음.
`PartnersPage.tsx` — `partnerCode` 기반 식별자만 노출, UUID 없음.

---

### 종합 판정

| 항목 | 판정 |
|---|---|
| Tabs ARIA 패턴 | PASS |
| raw hex 단독 0건 (CI 기준) | PASS |
| data-testid 핵심 4건 누락 | **요수정** (차기 커밋) |
| fallback hex 다수 포함 | 3차 iteration cleanup 권장 |
| UX 가이드 일치 (탭 구조/필드) | PASS |
| 타이포그래피 / 스페이싱 | PASS |
| UUID 비공개 | PASS |

**data-testid 4건 누락이 QA 자동화를 차단**합니다. FE agent 가 현 PR 에 추가 커밋 또는 후속 PR 로 `partner-create-form` / `partner-tab-{1~4}` / 배송지·담당자 추가 버튼 testid 를 보완해 주시면 Designer 최종 승인 드릴 수 있습니다.

— Designer reviewer (SamhanLogis)
