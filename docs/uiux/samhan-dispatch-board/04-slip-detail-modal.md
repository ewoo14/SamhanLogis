# D4 — 출고전표 상세 modal mock (인수자 + 정차 순서 + 메모)

> 컴포넌트:
>   - desktop: `clients/desktop/src/renderer/routes/dispatch-board/SlipDetailModal.tsx` (side modal, 우 700px)
>   - mobile: `clients/mobile-staff/src/screens/dispatch-board/SlipDetailScreen.tsx` (full screen)
> 트리거:
>   - 좌 panel 미배차 row 클릭 (desktop) / tap (mobile)
>   - 우 panel 배정 slip 카드 클릭 / tap
> 데이터: slip-service `GET /admin/slips/{id}` — `Slip` + `SlipItem` + `Partner` + 배차 정보
> 액션:
>   - 메모 편집: `PUT /admin/slips/{id}` (메모만 갱신)
>   - 정차 순서 변경: `PUT /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/slips/{slipId}` body `{ sequence: N }`
>   - 그룹에서 제거: `DELETE /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/slips/{slipId}`

---

## 1. 디자인 의도

- **읽기 중심 + 일부 편집** — 출고전표 기본 정보는 읽기 전용, 메모와 정차 순서만 편집 가능.
- side modal (desktop) — 우측 슬라이드 in, 좌 panel + 우 panel 은 그대로 유지 (사용자 컨텍스트 보존).
- full screen (mobile) — 모바일 폭에서 정보 밀도 확보.
- 정보 구성: ① 기본 정보 (slip number / 거래처 / 주소) ② 인수자 정보 (이름 / 연락처) ③ 정차 순서 (그룹 배정된 경우만) ④ 메모 (편집 가능) ⑤ 슬립 품목 (요약).
- 그룹 배정 상태에서는 "정차 순서 변경" + "그룹에서 제거" 가능. 미배정 상태에서는 정차 순서 section 숨김.
- 메모 = inline 편집 (클릭 → textarea, blur → 자동 저장 + toast).

---

## 2. ASCII 화면 mock — desktop side modal (700px 우측 슬라이드)

```
[main 영역 dim 0.3]
                                ┌─ side modal 700px ───────────────────────┐
                                │  ←  출고전표 상세                  [×]   │ ← header 56px
                                │  ──────────────────────────────────────  │
                                │                                          │
                                │  ┌─ 기본 정보 ───────────────────────┐  │
                                │  │ 슬립 번호    SL-2026-0521         │  │
                                │  │ 거래처 코드  P-1234                │  │
                                │  │ 거래처명     대구공조             │  │
                                │  │ 출고일       2026-05-14           │  │
                                │  │ 배송 주소    인천 남동구 호구포로  │  │
                                │  │              123, 5층 503호        │  │
                                │  │ 출고 상태    검수 완료 (INSPECTED) │  │
                                │  │ 배차 상태    [발송중] ← D5 배지   │  │
                                │  └────────────────────────────────────┘  │
                                │                                          │
                                │  ┌─ 인수자 정보 ─────────────────────┐  │
                                │  │ 인수자명     김인수                │  │
                                │  │ 연락처       010-9876-5432         │  │ ← Aligo 발송 대상
                                │  │ 이메일       (선택) -              │  │   (Phase E)
                                │  │ 카톡 ID      (선택) -              │  │
                                │  └────────────────────────────────────┘  │
                                │                                          │
                                │  ┌─ 정차 순서 ───────────────────────┐  │
                                │  │ 차량 그룹    1톤 #1               │  │
                                │  │ 정차 순번    ② (총 3개 중)         │  │
                                │  │ ────────────────────────────────  │  │
                                │  │ 같은 그룹 정차:                    │  │
                                │  │  ① SL-2026-0518 영진통상          │  │
                                │  │  ② SL-2026-0521 대구공조 ← 현재  │  │
                                │  │  ③ SL-2026-0525 한진산업          │  │
                                │  │                                    │  │
                                │  │ 순서 변경  ┌─ ▲ 위로 ─┐ ┌─ ▼ 아래 ─┐│  │
                                │  │                                    │  │
                                │  │ 그룹에서 제거  ┌─ × 제거 ──────┐  │  │ ← danger outline
                                │  └────────────────────────────────────┘  │
                                │                                          │
                                │  ┌─ 메모 (편집 가능) ─────────────────┐  │
                                │  │ ┌────────────────────────────────┐ │  │
                                │  │ │ 9시까지 배송 부탁드립니다.       │ │  │ ← textarea
                                │  │ │ 인수자 김인수 부재시 경비실      │ │  │   클릭 → 편집 활성
                                │  │ │ 보관 가능 (☎010-1111-2222)      │ │  │   blur → 자동 저장
                                │  │ └────────────────────────────────┘ │  │
                                │  │ ✓ 저장됨 (2026-05-14 09:23)        │  │ ← saved indicator
                                │  └────────────────────────────────────┘  │
                                │                                          │
                                │  ┌─ 품목 요약 (5건) ──────────────────┐  │
                                │  │ • 냉방기 본체 RAC-1808 × 3 EA      │  │
                                │  │ • 실외기 RAC-O1808 × 3 EA          │  │
                                │  │ • 동관 1/2" × 30 m                 │  │
                                │  │ • 보온재 25mm × 30 m               │  │
                                │  │ • 설치 부자재 1 SET                │  │
                                │  │                                    │  │
                                │  │ ┌─ → 슬립 전체 보기 ─────────────┐│  │ ← 링크 (admin/slips/{id})
                                │  │ └────────────────────────────────┘ │  │
                                │  └────────────────────────────────────┘  │
                                │                                          │
                                │  ──────────────────────────────────────  │
                                │  ┌─ 닫기 ──────────────────────────┐    │ ← footer 64px
                                │  └─────────────────────────────────┘    │
                                └──────────────────────────────────────────┘

  side modal 우측 슬라이드 in (300ms ease-out)
  scroll 가능 (height: 100vh - 0, sticky header + footer)
```

### 2.1 메모 inline 편집 상태

```
┌─ 메모 (편집 중) ───────────────────────┐
│ ┌─────────────────────────────────┐   │
│ │ 9시까지 배송 부탁드립니다.|       │   │ ← textarea focus
│ │ 인수자 김인수 부재시 경비실       │   │   arologis-500 border 2px
│ │ 보관 가능 (☎010-1111-2222)       │   │
│ │                                  │   │
│ └─────────────────────────────────┘   │
│ ⓘ 96 / 500 자                          │ ← char count
│ ◌ 자동 저장 중...                       │ ← spinner + arologis-700 text
└────────────────────────────────────────┘

저장 완료 후:
┌─ 메모 ──────────────────────────────────┐
│ 9시까지 배송 부탁드립니다.                │ ← 읽기 모드 (textarea readonly)
│ 인수자 김인수 부재시 경비실 보관 가능...  │
│ ✓ 저장됨 (2026-05-14 09:24)             │ ← arologis-500 check
└──────────────────────────────────────────┘
```

### 2.2 미배정 slip 상세 (좌 panel 미배차 row 클릭 시)

```
┌─ 정차 순서 ───────────────────────────┐
│                                       │
│  ⓘ 차량 그룹에 배정되지 않은 슬립      │
│    드래그하여 차량 그룹에 배정해주세요  │
│                                       │
└───────────────────────────────────────┘

(편집 가능 = 메모만)
```

---

## 3. ASCII 화면 mock — mobile full screen

```
┌────────────────────────────────────┐
│ ← 출고전표 상세            [×]    │ ← header 56px (safe area)
├────────────────────────────────────┤
│                                    │
│ ┌─ 기본 정보 ─────────────────────┐│
│ │ SL-2026-0521                    ││ ← slip number 큰 텍스트
│ │ 대구공조 (P-1234)                ││
│ │ 인천 남동구 호구포로 123, 5층 503││
│ │ ─────────────────────────────── ││
│ │ 출고일  2026-05-14              ││
│ │ 배차상태  [발송중]               ││ ← D5 배지
│ └──────────────────────────────────┘│
│                                    │
│ ┌─ 인수자 ─────────────────────────┐│
│ │ 김인수                            ││
│ │ ☎ 010-9876-5432                  ││ ← tap to call
│ └──────────────────────────────────┘│
│                                    │
│ ┌─ 정차 순서 ──────────────────────┐│
│ │ 1톤 #1 그룹 — ② / 3              ││
│ │  ① SL-2026-0518 영진통상         ││
│ │  ② SL-2026-0521 대구공조 (현재)  ││
│ │  ③ SL-2026-0525 한진산업         ││
│ │                                   ││
│ │  ┌─ ▲ 위 ──┐ ┌─ ▼ 아래 ──┐     ││ ← 순서 변경 버튼
│ │                                   ││
│ │  ┌─ × 그룹에서 제거 ────────┐    ││ ← danger outline
│ └──────────────────────────────────┘│
│                                    │
│ ┌─ 메모 ────────────────────────────┐│
│ │ 9시까지 배송 부탁드립니다.         ││ ← tap → 편집 화면 push
│ │ 인수자 김인수 부재시 ...           ││
│ │ ─ tap to edit                      ││
│ │ ✓ 저장됨 (09:24)                  ││
│ └──────────────────────────────────┘│
│                                    │
│ ┌─ 품목 5건 ──────────────────────────┐│
│ │ 냉방기 본체 RAC-1808 × 3 EA         ││
│ │ 실외기 RAC-O1808 × 3 EA             ││
│ │ ...                                  ││
│ │ ─ tap → 전체 보기                    ││
│ └──────────────────────────────────────┘│
│                                    │
│ [scroll 영역]                       │
│                                    │
├────────────────────────────────────┤
│ ┌─ 닫기 ──────────────────────────┐│ ← bottom fixed (safe area inset)
│ └─────────────────────────────────┘│
└────────────────────────────────────┘
```

---

## 4. 디자인 토큰

### 4.1 색상

| 영역 | 토큰 | HEX |
|---|---|---|
| backdrop dim (desktop) | rgba(15,18,22,0.3) | — |
| modal bg | `--color-bg` (`neutral-0`) | `#FFFFFF` |
| section bg | `--color-bg-subtle` (`neutral-50`) | `#F7F8FA` |
| section border | `--color-border` (`neutral-200`) | `#D6DCE3` |
| 라벨 텍스트 | `--color-text-muted` (`neutral-600`) | `#4D5562` |
| 값 텍스트 | `--color-text` (`neutral-900`) | `#0F1216` |
| slip number 강조 | `--color-brand-700` | `#1B4A6B` |
| 인수자 연락처 (tap-to-call) | `--color-info` (`#3F7DB8`) | underline mobile |
| 메모 textarea focus | `arologis-500` | `#2A9D8F` border 2px |
| 메모 저장 중 spinner | `arologis-700` | `#1B665C` |
| 메모 저장 완료 ✓ | `arologis-500` | `#2A9D8F` |
| 메모 char count over (>500) | `--color-danger` | `#D6504A` |
| 순서 변경 버튼 | `--color-bg-muted` (`neutral-100`) + `neutral-700` text | — |
| 순서 변경 disabled | `neutral-200` bg + `neutral-400` text | — |
| 제거 [×] 버튼 outline | `--color-danger` | `#D6504A` |
| 제거 hover bg | `danger-50` (alpha mix) | `#FBEEEE` |
| 미배정 안내 배너 bg | `--color-bg-muted` | `#EDF0F4` |
| 미배정 안내 텍스트 | `--color-text-muted` | `#4D5562` |

### 4.2 size / spacing

| 영역 | desktop | mobile |
|---|---|---|
| modal width | 700px (side) | screen width |
| modal padding | `space-6` (24) | `space-4` (16) |
| section gap | `space-5` (20) | `space-4` (16) |
| section padding | `space-5` (20) | `space-4` (16) |
| section radius | `radius-md` (8) | `radius-md` (8) |
| 라벨 width (desktop) | 100px label | flex |
| 메모 textarea height | min 100px / max 300px | min 80px |
| 메모 char count | 96 / 500 | 동일 |
| 순서 변경 버튼 크기 | 80 x 36 | 96 x 44 (touch target) |
| 제거 버튼 크기 | 120 x 36 | full width 48 |
| modal slide-in 시간 | 300ms ease-out | 250ms slide-up |

### 4.3 typography

| 영역 | size | weight |
|---|---|---|
| modal title ("출고전표 상세") | `size-xl` (18) | `semibold` |
| section title (기본 정보 등) | `size-md` (15) | `semibold` |
| 라벨 ("슬립 번호") | `size-sm` (13) | `regular` text-muted |
| 값 (SL-2026-0521) | `size-base` (14) | `medium` |
| slip number 강조 (mobile) | `size-xl` (18) | `bold` |
| 정차 순서 row | `size-base` (14) | `regular` (현재 = `semibold`) |
| 메모 textarea | `size-base` (14) | `regular` |
| 메모 char count | `size-xs` (12) | `regular` text-muted |
| 메모 saved 메시지 | `size-xs` (12) | `medium` arologis-500 |
| 품목 row | `size-sm` (13) | `regular` |

---

## 5. 컴포넌트 매핑

| 영역 | 컴포넌트 | 신규 / 재사용 |
|---|---|---|
| modal portal (desktop) | `@samhan/design-system` `SideModal` | 신규 (재사용 가능 확장) |
| modal portal (mobile) | `expo-router` `Modal` route | 재사용 (Stack) |
| header | `SlipDetailHeader` | 신규 |
| 기본 정보 section | `SlipBasicInfoSection` (read-only) | 신규 |
| 인수자 section | `SlipRecipientSection` (read-only, 연락처 tap-to-call mobile) | 신규 |
| 정차 순서 section | `SlipStopSequenceSection` | 신규 |
| 순서 변경 버튼 | `MoveSequenceButton` (props: direction `up`/`down`, disabled if first/last) | 신규 |
| 그룹 제거 버튼 | `RemoveFromGroupButton` (confirm dialog 호출) | 신규 |
| 메모 section | `SlipNotesSection` (inline edit + auto-save debounce 800ms) | 신규 |
| 품목 section | `SlipItemsSummarySection` (5 row + 전체 보기 링크) | 신규 |
| footer 닫기 | `@samhan/design-system` `Button` variant outline | 재사용 |
| 배차 상태 배지 | `DispatchStatusBadge` (D5 참조) | 신규 (D5) |

---

## 6. data-testid + 접근성

| 영역 | data-testid | aria-label / role |
|---|---|---|
| modal root | `slip-detail-modal` | `role="dialog"` `aria-labelledby="slip-detail-title"` `aria-modal="true"` |
| modal title | `slip-detail-title` | "{slipNumber} 출고전표 상세" |
| [×] 닫기 | `slip-detail-close` | "상세 닫기" |
| 기본 정보 section | `section-basic-info` | `aria-labelledby="section-basic-info-title"` |
| 인수자 section | `section-recipient` | `aria-labelledby="section-recipient-title"` |
| 인수자 전화 (tap-to-call) | `recipient-phone` | "인수자 전화 {phone} 걸기" + `href="tel:..."` (mobile) |
| 정차 순서 section | `section-stop-sequence` | `aria-labelledby="section-stop-sequence-title"` |
| 정차 순서 현재 row | `stop-sequence-current` | `aria-current="true"` "현재 슬립, 정차 순번 {sequence}" |
| 순서 위로 버튼 | `move-sequence-up` | "정차 순번 위로 이동" (disabled 시 첫 슬립이면 X) |
| 순서 아래로 버튼 | `move-sequence-down` | "정차 순번 아래로 이동" |
| 그룹 제거 버튼 | `remove-from-group` | "{vehicleType} 그룹에서 제거" |
| 그룹 제거 confirm | `remove-from-group-confirm` | "정말 제거하시겠습니까?" |
| 메모 textarea | `slip-notes-textarea` | "출고전표 메모, 자동 저장" + `aria-describedby="notes-char-count notes-saved-status"` |
| 메모 char count | `notes-char-count` | aria-live polite |
| 메모 저장 상태 | `notes-saved-status` | aria-live polite |
| 품목 section | `section-items-summary` | `aria-labelledby="section-items-title"` |
| 전체 보기 링크 | `view-full-slip-link` | "{slipNumber} 슬립 전체 보기" |

### 6.1 키보드 접근성

- `Esc` → modal 닫기.
- `Tab` 순서: 닫기 [×] → ... → 메모 textarea → 순서 변경 버튼 → 그룹 제거 → 전체 보기 링크 → 닫기 버튼.
- 메모 편집 중 `Esc` → blur + 자동 저장 후 modal 유지.
- 메모 편집 중 `Cmd+Enter` / `Ctrl+Enter` → blur + 즉시 저장.
- 순서 변경 키보드 단축 = textarea 외 focus 영역에서 `↑`/`↓`.

### 6.2 메모 자동 저장 동작

| 시점 | 동작 |
|---|---|
| textarea focus | `is-editing=true` |
| keystroke | debounce 800ms 대기 |
| 800ms idle | `PUT /admin/slips/{id}` body `{ notes }` |
| 응답 200 | `is-editing=false` + `✓ 저장됨 (HH:MM)` 표시 + aria-live "저장되었습니다" |
| 응답 4xx/5xx | textarea border `--color-danger` + 에러 메시지 ("저장 실패 — 다시 시도") + 30초 후 재시도 |
| textarea blur | 즉시 저장 (debounce skip) |

### 6.3 mobile 가드

- 메모 = tap → push 새 화면 (full screen textarea, Done 버튼).
- 인수자 연락처 = tap → `Linking.openURL('tel:01098765432')`.
- 정차 순서 row = swipe-left 노출 → "그룹에서 제거" 액션.
- side modal 대신 fullscreen route — `expo-router` `<Stack.Screen options={{ presentation: 'modal' }} />`.

---

## 7. 비고

- UUID 비공개 — slip `id` / partner `id` / vehicleGroup `id` 모두 노출 X. `slipNumber` / `partnerCode` / `partnerName` / `vehicleType` 만.
- 메모 max length = 500 자 (`Slip.notes` column constraint).
- 정차 순서 변경은 dispatch_vehicle_group_slip.sequence 만 갱신 — 인접 slip 의 sequence 자동 swap.
- 그룹에서 제거 = soft delete (`dispatch_vehicle_group_slip.is_deleted=true`) → 좌 panel 미배차 list 로 복귀.
- `dispatchStatus !== UNDISPATCHED` 슬립 (예: DISPATCHING / DISPATCHED) 은 정차 순서 변경 / 그룹 제거 X (서버 reject + 클라이언트 버튼 disabled).
- 품목 요약 = 최대 5개만 modal 안 표시, 초과 시 "+ N개 더 보기" 링크 (admin/slips/{id} 라우트로 push).
- arologis-teal `#2A9D8F` = 메모 textarea focus border + 저장 완료 ✓ + section accent (D-AX-03 일관, 배차 흐름의 시각적 통합).
