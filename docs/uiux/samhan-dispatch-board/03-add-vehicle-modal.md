# D3 — 차량 추가 modal mock (9 종류 carousel)

> 컴포넌트:
>   - desktop: `clients/desktop/src/renderer/routes/dispatch-board/AddVehicleModal.tsx`
>   - mobile: `clients/mobile-staff/src/screens/dispatch-board/AddVehicleModal.tsx`
> 트리거: 우 panel `[+ 차량 추가]` 버튼 (desktop) / 차량 그룹 tab `[+ 차량 추가]` 버튼 (mobile)
> 액션: `POST /admin/dispatch-tasks/{id}/vehicle-groups` body `{ vehicleType: "TONNAGE_1" }`
> 결과: 새 `DispatchVehicleGroup` 추가 + sequence 자동 부여 + 우 panel 에 빈 카드 출현

---

## 1. 디자인 의도

- 차량 종류 = **9 active enum** (legacy `TONNAGE_1_4` / `TONNAGE_BIG` 제외, D-DB-03).
- 종류별 시각 식별 = **아이콘 + 한국어 라벨 + 적재량 보조 정보** (예: "1톤 / 최대 1,000kg").
- 단번에 선택 + 추가 가능하도록 horizontal carousel 또는 3 x 3 grid.
  - **desktop = 3 x 3 grid** (각 카드 180 x 140px, 충분한 여백).
  - **mobile = horizontal carousel** (각 카드 140 x 120px, swipe 가능, snap to center).
- 동일 차량 종류 다중 추가 가능 (예: 1톤 #1, 1톤 #2 — sequence 만 다름).
- 선택 → [추가] 버튼 활성 → 클릭 → modal close + 우 panel 신규 그룹 카드 추가.

---

## 2. ASCII 화면 mock — desktop (3 x 3 grid)

```
[backdrop — neutral-900 alpha 0.5]

┌────────────────────────────────────────────────────────────────┐
│  차량 그룹 추가                                          [×]   │ ← header 56px
│  ────────────────────────────────────────────────────────────  │
│                                                                │
│  차량 종류를 선택하세요                                        │ ← caption 16px
│                                                                │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐                   │
│  │    🏍       │ │    🚐       │ │    🚚      │                   │
│  │           │ │           │ │           │                   │
│  │  오토바이  │ │   다마스    │ │    1톤     │                   │
│  │   ~50kg    │ │   ~500kg   │ │  ~1,000kg  │                   │
│  └───────────┘ └───────────┘ └───────────┘                   │
│                                                                │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐                   │
│  │    🚚       │ │    🚛       │ │    🚛      │                   │
│  │           │ │  ████████ │ │           │                   │ ← 선택됨
│  │   1.5톤    │ │   2.5톤    │ │    3톤     │                   │   arologis-500 border 2px
│  │  ~1,500kg  │ │  ~2,500kg  │ │  ~3,000kg  │                   │   arologis-50 bg
│  └───────────┘ └───────────┘ └───────────┘                   │
│                                                                │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐                   │
│  │    🚛       │ │    🚛       │ │    🚛      │                   │
│  │           │ │           │ │           │                   │
│  │    5톤     │ │   10톤     │ │   20톤     │                   │
│  │  ~5,000kg  │ │ ~10,000kg  │ │ ~20,000kg  │                   │
│  └───────────┘ └───────────┘ └───────────┘                   │
│                                                                │
│  ────────────────────────────────────────────────────────────  │
│                                                                │
│  선택: 2.5톤                                                   │ ← summary line
│                                                                │
│  ┌─ [취소] ─┐  ┌─ + 추가 ──────────────┐                     │ ← footer 64px
│  └────────┘  └────────────────────────┘                     │   right-aligned
│                                                                │
└────────────────────────────────────────────────────────────────┘

  modal width: 640px (max-width: 90vw)
  modal height: auto (min 540px)
  center vertical + horizontal
```

### 2.1 card 상태별

```
[idle — 미선택]                  [hover]                          [selected]
┌───────────┐                    ┌───────────┐                    ┌───────────┐
│    🚛       │                    │    🚛       │                    │  ✓  🚛     │ ← arologis-500 checkmark
│           │                    │           │ neutral-100 bg     │           │   top-right
│   1톤      │                    │   1톤      │ shadow-md          │   1톤      │ arologis-500 border 2px
│  ~1,000kg  │                    │  ~1,000kg  │                    │  ~1,000kg  │ arologis-50 bg
└───────────┘                    └───────────┘                    └───────────┘
  neutral-200 border 1px            shadow-md                       shadow-md + scale 1.02
  neutral-0 bg
```

---

## 3. ASCII 화면 mock — mobile (horizontal carousel)

```
┌────────────────────────────────────────────┐
│  차량 그룹 추가                      [×]  │ ← bottom sheet 또는 fullscreen
│  ────────────────────────────────────────  │
│                                            │
│  종류를 선택하세요                          │
│                                            │
│  ◀                                       ▶ │ ← prev/next indicator
│                                            │
│   ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│   │    🚛    │ │    🚛    │ │    🚛    │    │ ← snap-to-center
│   │         │ │ ████████│ │         │    │   center card = 선택 후보
│   │  1.5톤  │ │  2.5톤  │ │   3톤   │    │   좌우 카드 = scale 0.9
│   │~1,500kg │ │~2,500kg │ │~3,000kg │    │
│   └─────────┘ └─────────┘ └─────────┘    │
│                                            │
│      ●  ●  ●  ●  ●  ●  ◉  ●  ●            │ ← pagination dots (9개)
│                       ↑ active (2.5톤)    │   active = arologis-500
│                                            │
│  선택: 2.5톤  / 최대 2,500kg               │
│                                            │
│  ┌─ + 2.5톤 차량 추가 ────────────────┐   │ ← full-width footer button 56px
│  └─────────────────────────────────────┘   │   arologis-500 bg
│                                            │
│  ┌─ 취소 ──────────────────────────────┐   │ ← outline button 48px
│  └─────────────────────────────────────┘   │
│                                            │
└────────────────────────────────────────────┘

  모바일 = bottom sheet (snap 60% / 90% / full screen)
  swipe down → close, swipe left/right → carousel
```

---

## 4. 9 차량 종류 매트릭스

| enum 값 | 표시 (한국어) | 적재량 (보조) | 아이콘 (RN/SVG) |
|---|---|---|---|
| `MOTORCYCLE` | 오토바이 | 최대 50kg | 🏍 (motorbike) |
| `DAMAS` | 다마스 | 최대 500kg | 🚐 (mini-van) |
| `TONNAGE_1` | 1톤 | 최대 1,000kg | 🚚 (small truck) |
| `TONNAGE_1_5` | 1.5톤 | 최대 1,500kg | 🚚 (small truck variant) |
| `TONNAGE_2_5` | 2.5톤 | 최대 2,500kg | 🚛 (medium truck) |
| `TONNAGE_3` | 3톤 | 최대 3,000kg | 🚛 (medium truck) |
| `TONNAGE_5` | 5톤 | 최대 5,000kg | 🚛 (medium truck large) |
| `TONNAGE_10` | 10톤 | 최대 10,000kg | 🚛 (large truck) |
| `TONNAGE_20` | 20톤 | 최대 20,000kg | 🚛 (heavy truck) |

> 실 구현 시 emoji 대신 design-system SVG 아이콘 사용 (`@samhan/icons/Vehicle{Motorcycle/Damas/Truck1/...}`). 본 mock 는 emoji 로 표현.

> ⚠ legacy enum 값 `TONNAGE_1_4` / `TONNAGE_BIG` 은 본 modal 노출 X (D-DB-03 가드). slip-service `DispatchVehicleType` 도 9 값만 active.

---

## 5. 디자인 토큰

### 5.1 색상

| 영역 | 토큰 | HEX |
|---|---|---|
| backdrop | rgba(15,18,22,0.5) (`neutral-900` alpha 0.5) | — |
| modal bg | `neutral-0` | `#FFFFFF` |
| header text | `neutral-900` | `#0F1216` |
| 카드 idle border | `neutral-200` | `#D6DCE3` |
| 카드 hover bg | `neutral-100` | `#EDF0F4` |
| 카드 selected border | `arologis-500` | `#2A9D8F` (D-AX-03 일관) |
| 카드 selected bg | `arologis-50` | `#EFFAF8` |
| 카드 selected check | `arologis-500` | `#2A9D8F` |
| 보조 텍스트 (kg) | `--color-text-muted` (`neutral-600`) | `#4D5562` |
| [+ 추가] 버튼 bg | `arologis-500` | `#2A9D8F` |
| [+ 추가] hover | `arologis-600` | `#218074` |
| [+ 추가] disabled bg | `neutral-200` | `#D6DCE3` |
| [취소] 버튼 border | `--color-border-strong` (`neutral-300`) | `#B8C0CB` |
| pagination dot inactive | `neutral-300` | `#B8C0CB` |
| pagination dot active | `arologis-500` | `#2A9D8F` |

### 5.2 size / spacing

| 영역 | desktop | mobile |
|---|---|---|
| modal width | 640px | screen width |
| modal padding | `space-6` (24) | `space-5` (20) |
| 카드 크기 | 180 x 140 | 140 x 120 |
| 카드 gap | `space-4` (16) | `space-3` (12) |
| 카드 radius | `radius-md` (8) | `radius-md` (8) |
| 카드 padding | `space-4` (16) | `space-3` (12) |
| 아이콘 크기 | 40 x 40 | 32 x 32 |
| header height | 56 | 56 |
| footer height | 64 | 64 + 48 (2 버튼) |
| backdrop alpha | 0.5 | 0.5 |

### 5.3 typography

| 영역 | size | weight |
|---|---|---|
| modal title ("차량 그룹 추가") | `size-xl` (18) | `semibold` |
| caption ("차량 종류를 선택하세요") | `size-base` (14) | `regular` text-muted |
| 차량 라벨 ("1톤") | `size-lg` (16) | `semibold` |
| 적재량 ("~1,000kg") | `size-xs` (12) | `regular` text-muted |
| summary ("선택: 2.5톤") | `size-md` (15) | `medium` |
| 버튼 | `size-md` (15) | `semibold` |

### 5.4 애니메이션

| 요소 | 효과 |
|---|---|
| modal enter | fade-in 200ms + scale 0.96 → 1.0 (desktop) / slide-up 250ms (mobile bottom sheet) |
| backdrop enter | fade-in 200ms |
| 카드 hover | shadow 0 → md 150ms |
| 카드 select | border + bg 즉시 (no delay), scale 1.0 → 1.02 100ms |
| carousel snap | spring (damping 30, stiffness 200) (RN Reanimated) |

---

## 6. 컴포넌트 매핑

| 영역 | 컴포넌트 | 신규 / 재사용 |
|---|---|---|
| backdrop + portal | `@samhan/design-system` `Modal` | 재사용 |
| header | `@samhan/design-system` `ModalHeader` | 재사용 |
| grid (desktop) | `AddVehicleGrid` (CSS Grid 3x3) | 신규 |
| carousel (mobile) | `AddVehicleCarousel` (RN `FlatList` horizontal + snapToInterval) | 신규 |
| card | `VehicleTypeCard` (props: vehicleType, isSelected, onClick) | 신규 |
| footer | `@samhan/design-system` `ModalFooter` | 재사용 |
| 버튼 | `@samhan/design-system` `Button` (variant primary / outline) | 재사용 |

---

## 7. data-testid + 접근성

| 영역 | data-testid | aria-label / role |
|---|---|---|
| modal root | `add-vehicle-modal` | `role="dialog"` `aria-labelledby="add-vehicle-modal-title"` `aria-modal="true"` |
| modal title | `add-vehicle-modal-title` | — (h2) |
| 카드 | `vehicle-type-card-{enumValue}` (e.g. `vehicle-type-card-TONNAGE_1`) | `role="button"` `aria-pressed={isSelected}` `aria-label="{displayName} 차량 그룹 선택, 적재량 {tonnageKg}"` |
| 카드 checkmark | `vehicle-type-card-check-{enumValue}` | aria-hidden |
| [×] 닫기 | `add-vehicle-modal-close` | "차량 추가 닫기" |
| [취소] 버튼 | `add-vehicle-modal-cancel` | "차량 추가 취소" |
| [+ 추가] 버튼 | `add-vehicle-modal-confirm` | "{선택된 차량} 차량 그룹 추가" (선택 시) / "차량을 선택해주세요" (비선택 시) |
| carousel dots (mobile) | `add-vehicle-carousel-dot-{index}` | aria-hidden |

### 7.1 키보드 접근성

- `Esc` → 모달 닫기 (취소 동작).
- `Tab` 순서: 닫기 [×] → 카드 1번 → 카드 2번 → ... → 카드 9번 → [취소] → [+ 추가].
- 카드 focus 시 `outline 2px arologis-500` + visible focus ring.
- `Space`/`Enter` → 카드 선택 토글.
- modal 열림 시 첫 카드에 자동 focus (`autofocus`).
- modal 닫힘 시 trigger 버튼 ([+ 차량 추가]) 으로 focus 복귀.

### 7.2 mobile 가드

- bottom sheet swipe-down → 닫기 (취소).
- 카드 tap target `min-height 80pt` (140 x 120 충족).
- 화면 너비 < 360px (소형 안드로이드) → 카드 130 x 110 + gap 8.

---

## 8. 검증 + 에러 처리

| 시나리오 | 처리 |
|---|---|
| 카드 미선택 + [+ 추가] | 버튼 disabled (클릭 불가) |
| 추가 중 네트워크 에러 | modal 닫지 않고 footer 위 에러 배너 ("추가 실패 — 잠시 후 다시 시도해주세요", danger-50 bg) + [+ 추가] 버튼 재활성 |
| `dispatchTask.status !== DRAFT` (서버 reject) | modal 닫고 우 panel toast ("작성 중 상태에서만 차량 추가 가능합니다") |
| 중복 추가 (예: 1톤 #1 이미 있는데 1톤 #2 추가) | 허용 — sequence 만 다름 (sequence 자동 부여) |

---

## 9. 비고

- UUID 비공개 — modal 내부 어떤 위치에도 `id` 노출 X. `vehicleType` enum + `displayName` 만 사용.
- D-DB-03 가드 — legacy enum (`TONNAGE_1_4`, `TONNAGE_BIG`) 본 modal 노출 X. 카톡 파싱 backward compat 은 backend 처리.
- arologis-teal `#2A9D8F` brand color = D-AX-03 일관 — 선택 카드 / [+ 추가] 버튼 / pagination dot active 색상에 활용 (배차 → 아로로지스 발송 흐름의 시각적 일관성).
- 적재량 보조 텍스트는 사용자 인지 도움용 — 실제 데이터는 enum 값 + `displayName` 만 backend 로 전송 (`POST` body `{ vehicleType: "TONNAGE_2_5" }`).
- modal close 후 우 panel 신규 그룹 카드 = 빈 그룹 placeholder ("⬇ 여기로 슬립을 끌어다 놓으세요").
