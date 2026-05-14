# D2 — Samhan Public 배차 메뉴 mobile-staff tab mock

> 화면: `clients/mobile-staff/src/screens/dispatch-board/DispatchBoardScreen.tsx`
> 라우트: `/dispatch-board` (RN Expo + `expo-router`)
> 사용자: Samhan Public 배차담당자 모바일 (375 x 812 iPhone 13 기준 / 360 x 800 Android 기준 = 가로 가변)
> 데이터: D1 desktop 과 동일 endpoint (slip-service `/admin/slips` + `/admin/dispatch-tasks/{id}`)

---

## 1. 디자인 의도

- desktop 의 좌(미배차) / 우(차량 그룹) 2-pane 을 **tab 전환** 으로 축약 — 모바일 폭에서 동시 표시 불가.
- 상단 `[미배차 전표] [차량 그룹]` segmented control (=tab) — active 시 brand-500 underline.
- `@dnd-kit/core` `TouchSensor` + `PointerSensor` 동시 활성 — **long-press 250ms** 후 드래그 시작 (스크롤 vs 드래그 disambiguation).
- long-press 시작 시 햅틱 (RN `Haptics.impactAsync(Light)`) + visual indicator (row 가장자리 brand-500 outline + 진동 ring 애니메이션).
- tab 전환 = 좌 → 우 swipe 가능 (RN `Tab.Navigator` swipeEnabled).
- DRAFT tab `[✓ 배차 완료]` 는 화면 하단 floating action (safe area inset 고려) — 그룹 1개 이상일 때만 active.
- 모바일 폭에서는 차량 그룹 카드 = 전체 폭, slip 카드 = 한 줄 (slip 번호 + 거래처 한 줄, 주소 한 줄).

---

## 2. ASCII 화면 mock

### 2.1 [미배차 전표] tab (active)

```
┌─ status bar 44px ───────────────────────────┐
│ 09:41                            ●●● 5G ▮▮  │
├─────────────────────────────────────────────┤ ← 375 x 812 iPhone safe area top
│  ←  배차 메뉴            DT-20260514-001    │ ← header 56px, brand-500 텍스트
├─────────────────────────────────────────────┤
│                                             │
│  ┌─ 미배차 전표 ─┬─ 차량 그룹 ───────────┐  │ ← tab 56px
│  │ ████████████ │                        │  │
│  │              │                        │  │ ← active = brand-500 underline 3px
│  └──────────────┴────────────────────────┘  │
│                                             │
│  ┌─ 필터 ────────────────────────────────┐  │ ← filter sheet 80px
│  │ 2026-05-13 ~ 2026-05-15  ▾            │  │
│  │ 상태  [미배차]  [▾ 더보기]            │  │
│  └────────────────────────────────────────┘  │
│                                             │
│  ┌─ 12 건 / 580 총 ─────────────────────┐   │
│  │                                       │   │
│  │ ☰  SL-2026-0521   대구공조           │   │ ← row 72px
│  │    인천 남동구                        │   │   tap → 상세 modal (D4)
│  │    ────────────────────────────       │   │   long-press 250ms → 드래그
│  │                                       │   │
│  │ ☰  SL-2026-0522   한진산업           │   │
│  │    부산 사상구                        │   │
│  │    ────────────────────────────       │   │
│  │                                       │   │
│  │ ☰  SL-2026-0523   영진통상           │   │
│  │    서울 강서구                        │   │
│  │    ────────────────────────────       │   │
│  │                                       │   │
│  │ ☰  SL-2026-0524   마트로닉           │   │
│  │    대전 서구                          │   │
│  │                                       │   │
│  │ ...                                   │   │
│  │                                       │   │ ← FlatList virtualized
│  └────────────────────────────────────────┘   │
│                                             │
│  ◀ 1 / 12 ▶  50/회                          │ ← pagination 48px
│                                             │
└─────────────────────────────────────────────┘
                                                ← safe area bottom 34px
```

### 2.2 [차량 그룹] tab (active)

```
┌─────────────────────────────────────────────┐
│  ←  배차 메뉴            DT-20260514-001    │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─ 미배차 전표 ─┬─ 차량 그룹 ───────────┐  │
│  │              │ ████████████████████   │  │ ← active
│  └──────────────┴────────────────────────┘  │
│                                             │
│  ┌─ + 차량 추가 ────────────────────────┐   │ ← brand-500 button 48px
│  └─────────────────────────────────────┘    │   tap → AddVehicleModal (D3)
│                                             │
│  ┌─ 1톤 #1                          [×] ─┐  │ ← vehicle group card
│  │ ① SL-2026-0521  대구공조           [×] │  │
│  │   인천 남동구                          │  │
│  │ ─────────────────────────────────────  │  │
│  │ ② SL-2026-0525  영진통상           [×] │  │
│  │   서울 강서구                          │  │
│  └────────────────────────────────────────┘  │
│                                             │
│  ┌─ 다마스 #2                       [×] ─┐  │
│  │ ① SL-2026-0527  마트로닉          [×] │  │
│  │   대전 서구                            │  │
│  └────────────────────────────────────────┘  │
│                                             │
│  ┌─ 5톤 #3                          [×] ─┐  │ ← 빈 그룹
│  │                                        │  │
│  │   ⬇ 미배차 tab 에서 슬립을              │  │
│  │     끌어다 놓으세요                     │  │
│  │     (길게 눌러 드래그)                  │  │
│  └────────────────────────────────────────┘  │
│                                             │
│           [ 공간 — scroll ]                 │
│                                             │
├─────────────────────────────────────────────┤
│  ┌─ ✓ 배차 완료 ─────────────────────┐    │ ← floating action 56px
│  └─────────────────────────────────────┘   │   arologis-teal #2A9D8F bg
│                                             │   safe area + 16px
└─────────────────────────────────────────────┘
```

### 2.3 long-press 드래그 진행 중

```
┌─────────────────────────────────────────────┐
│  [미배차 전표] tab                          │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ ☰  SL-2026-0521  대구공조           │    │ ← 0.3 opacity (source)
│  │    인천 남동구                       │    │
│  └─────────────────────────────────────┘    │
│                                             │
│      ┌─ 드래그 중 ──────────────┐           │ ← floating preview
│      │ SL-2026-0521             │           │   shadow-lg + scale 1.05
│      │ 대구공조                  │           │   rotate -2deg
│      │ 인천 남동구              │           │   brand-500 border 2px
│      └────────────────────────┘             │   pointer 위치 따라 이동
│                                             │
│  ⓘ 차량 그룹 탭으로 이동하여 놓아주세요     │ ← top toast 40px
│                                             │   arologis-50 bg, arologis-700 text
│  [tab 자동 전환] swipe right                │
│                                             │
└─────────────────────────────────────────────┘

[long-press indicator — 250ms hold 중 진행]

  ☰  SL-2026-0521  대구공조
   ◉═══════════════════════════════ ← progress ring
   ↑ stroke arologis-500 dasharray 애니메이션
     250ms 채워지면 드래그 활성
```

### 2.4 햅틱 + 시각 피드백 시퀀스

| 시점 | 햅틱 | 시각 |
|---|---|---|
| touch down | — | row scale 0.98 (press feedback) |
| 100ms | `Haptics.selectionAsync()` | progress ring 시작 |
| 250ms | `Haptics.impactAsync(Light)` | progress ring 완료 + row outline brand-500 2px + floating preview 생성 |
| drop on group | `Haptics.notificationAsync(Success)` | row 제거 + 그룹 카드 outline arologis-500 flash 1회 |
| drop on invalid | `Haptics.notificationAsync(Error)` | row 원위치 + 그룹 카드 outline danger flash |

---

## 3. 디자인 토큰

### 3.1 RN StyleSheet (`@samhan/mobile-design-system` 또는 인라인 토큰)

```ts
export const tokens = {
  color: {
    brand500: '#2D77A8',
    brand600: '#235F88',
    arologis50: '#EFFAF8',
    arologis300: '#6BC9B5',
    arologis500: '#2A9D8F',
    arologis700: '#1B665C',
    neutral0: '#FFFFFF',
    neutral50: '#F7F8FA',
    neutral100: '#EDF0F4',
    neutral200: '#D6DCE3',
    neutral500: '#6B7280',
    neutral700: '#363D49',
    neutral900: '#0F1216',
    danger: '#D6504A',
    info: '#3F7DB8',
  },
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
  radius: { sm: 6, md: 8, lg: 12 },
  font: {
    sizeXs: 12, sizeSm: 13, sizeBase: 14, sizeMd: 15, sizeLg: 16, sizeXl: 18, size2xl: 22,
    weightRegular: '400', weightMedium: '500', weightSemibold: '600', weightBold: '700',
  },
};
```

### 3.2 사용처

| 영역 | 색상 | spacing | size |
|---|---|---|---|
| header bg | `brand-500` | padding `space-4` | height 56 |
| header text | `neutral-0` | — | font `lg` `semibold` |
| tab bar bg | `neutral-0` | — | height 56 |
| tab active underline | `brand-500` | — | height 3 |
| 필터 sheet bg | `neutral-50` | padding `space-3` | height 80 |
| row bg | `neutral-0` | padding `space-3` `space-4` | min height 72 |
| row border | `neutral-200` | — | 1px bottom |
| row long-press ring | `arologis-500` | — | 2px outline (animated) |
| 그룹 카드 bg | `neutral-0` | padding `space-4` | radius `md` |
| 그룹 카드 header bg | `neutral-100` | — | height 40 |
| [+ 차량 추가] bg | `brand-500` | — | height 48, radius `md` |
| [✓ 배차 완료] bg | `arologis-500` | — | height 56, radius `lg` |
| 빈 그룹 placeholder bg | `neutral-50` (dashed border) | — | min height 100 |
| floating preview shadow | `rgba(0,0,0,0.18)` | offset 0 8, blur 20 | — |

### 3.3 typography

| 영역 | size | weight |
|---|---|---|
| header title | `size-lg` (16) | `semibold` |
| header task code | `size-sm` (13) | `medium` |
| tab label | `size-md` (15) | `semibold` (active) / `medium` (inactive) |
| slip number | `size-base` (14) | `semibold` |
| 거래처명 | `size-base` (14) | `regular` |
| 주소 | `size-sm` (13) | `regular` text-muted |
| 그룹 타이틀 | `size-md` (15) | `semibold` |
| 빈 그룹 placeholder | `size-sm` (13) | `regular` text-muted |
| 버튼 | `size-md` (15) | `semibold` |
| 배차 완료 버튼 | `size-lg` (16) | `bold` |

---

## 4. 컴포넌트 매핑

| 영역 | 컴포넌트 | 신규 / 재사용 |
|---|---|---|
| 화면 root | `DispatchBoardScreen` (`@react-navigation/material-top-tabs`) | 신규 |
| tab "미배차 전표" | `UndispatchedSlipsTab` | 신규 |
| tab "차량 그룹" | `VehicleGroupsTab` | 신규 |
| 필터 sheet | `DispatchBoardFilters` (mobile 버전) | 신규 |
| 미배차 row | `UndispatchedSlipRow` (RN `Pressable` + Reanimated `Animated.View`) | 신규 |
| 그룹 카드 | `VehicleGroupCard` | 신규 |
| 그룹 안 slip 카드 | `AssignedSlipCard` | 신규 |
| 차량 추가 modal | `AddVehicleModal` (D3) | 신규 |
| 배차 완료 floating action | `DispatchCompleteFab` | 신규 |
| floating preview | `@dnd-kit/core` `DragOverlay` (RN 이식) 또는 `react-native-reanimated` 직접 구현 | 신규 |

### 4.1 `@dnd-kit/core` mobile sensor 설정

```ts
import { DndContext, TouchSensor, PointerSensor, KeyboardSensor, useSensors, useSensor } from '@dnd-kit/core';

const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },  // long-press 250ms
  }),
  useSensor(KeyboardSensor),
);
```

---

## 5. data-testid + 접근성

| 영역 | data-testid | aria-label |
|---|---|---|
| 화면 root | `mobile-dispatch-board-screen` | — |
| tab bar | `tab-bar` | "배차 메뉴 탭" |
| tab 미배차 | `tab-undispatched` | "미배차 전표 탭" |
| tab 차량 그룹 | `tab-vehicle-groups` | "차량 그룹 탭" |
| 미배차 row | `mobile-undispatched-row-{slipNumber}` | "출고전표 {slipNumber}, 거래처 {partnerName}, 길게 눌러 차량에 배정" |
| long-press ring | `long-press-ring-{slipNumber}` | aria-hidden (시각 효과) |
| 그룹 카드 | `mobile-vehicle-group-{sequence}` | "{vehicleType} 그룹 {sequence}" |
| 차량 추가 버튼 | `mobile-add-vehicle-btn` | "차량 그룹 추가" |
| 배차 완료 FAB | `mobile-dispatch-complete-fab` | "배차 완료 및 아로로지스 발송" |
| 안내 토스트 | `drag-hint-toast` | aria-live polite "차량 그룹 탭으로 이동하여 놓아주세요" |

### 5.1 접근성 가드

- 모든 tap target `min-height 44pt` (Apple HIG) — row 72px / 버튼 48px / FAB 56px 충족.
- 햅틱 = visual 보조 (시각 장애인은 햅틱 + VoiceOver, 청각 장애인은 visual 만으로 인지 가능).
- VoiceOver 활성 시 long-press 비활성 → 대체 액션 = row 우측 ⋯ 메뉴 "1톤 #1 그룹에 추가" / "5톤 #3 그룹에 추가".
- `Reduce Motion` 활성 시 progress ring + scale 애니메이션 비활성, 그러나 햅틱은 유지.

---

## 6. tab 전환 동작

| trigger | 동작 |
|---|---|
| tab label tap | 즉시 전환 (`navigation.jumpTo`) |
| swipe left/right | `Tab.Navigator` `swipeEnabled` |
| drag 중 화면 우측 가장자리 hover | 자동 전환 (drag-and-drop UX 가드) |
| drag 시작 (미배차 tab) | 안내 toast 표시 ("차량 그룹 탭으로 이동하여 놓아주세요") |
| drop 완료 | 미배차 tab 으로 자동 복귀 + 성공 toast ("SL-2026-0521 1톤 #1 그룹에 배정") |

---

## 7. 비고

- UUID 비공개 — desktop 과 동일, `taskCode` / `slipNumber` / `partnerCode` / `partnerName` 만.
- TouchSensor delay 250ms = `@dnd-kit/core` 권장값 (스크롤 충돌 방지).
- 모바일 폭에서는 그룹 카드 안 slip header 1줄 (`SL-2026-0521 대구공조`) + 주소 1줄. desktop 의 2줄 분리 미사용.
- mobile-staff 사용자 = 배차담당자 (단, 외근 시 모바일 전환). 권한은 desktop 동등 (`ROLE_MASTER` / `ROLE_MANAGER`).
- arologis-teal `#2A9D8F` brand color = D-AX-03 일관 (PR #184 참조). 배차 완료 액션 = 아로로지스로 보내는 행위 → 시각적 연결.
- 안드로이드 햅틱 미지원 기기 fallback = visual flash 만.
