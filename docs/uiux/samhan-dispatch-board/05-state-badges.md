# D5 — DispatchTask + Slip dispatchStatus 상태 배지 mock

> 컴포넌트:
>   - `clients/desktop/src/renderer/components/dispatch-board/DispatchStatusBadge.tsx`
>   - `clients/desktop/src/renderer/components/dispatch-board/SlipDispatchStatusBadge.tsx`
>   - mobile 동일 (`@samhan/mobile-design-system` 활용)
> 사용처:
>   - `DispatchStatusBadge`: 우 panel 헤더 (DispatchTask.status), `DispatchTaskListPage` 행, 알림
>   - `SlipDispatchStatusBadge`: 좌 panel 미배차 row 우측, 출고전표 상세 modal 기본 정보, slip 관리 화면
> 데이터:
>   - DispatchTask.status enum: `DRAFT` / `DISPATCHING` / `DISPATCHED` / `FAILED` (4)
>   - Slip.dispatchStatus enum: `UNDISPATCHED` / `DISPATCHING` / `DISPATCHED` (3)

---

## 1. 디자인 의도

- **시각 식별 = 색상 + 한국어 라벨 + (선택) 아이콘** 3 layer. 색맹 사용자 대응 → 색만 의존 X.
- DispatchTask 배지 = 작업 단위 상태 (배차담당자 시점).
- Slip 배지 = 개별 출고전표 상태 (영업/창고/배차 모두 공유 시점).
- 색상 가드 (개발책임자 spec):
  - **DRAFT / UNDISPATCHED = 회색** (작성 중 / 미진행)
  - **DISPATCHING = 파랑** (진행 중)
  - **DISPATCHED = 녹색 (arologis-teal `#2A9D8F`)** (완료, D-AX-03 brand color 일관)
  - **FAILED = 빨강** + [재배차] 버튼 (DispatchTask 만)
- 배지 모양 = pill (radius full) 또는 rounded rectangle (radius `sm`) — 본 mock 는 **rounded rectangle** 선택 (text 가 길어도 안정적, `1톤 #1 - 발송 완료, 매칭 대기` 같이 긴 경우 친화).
- 크기 = 2 variant: `sm` (테이블 행) / `md` (상세 modal / 우 panel 헤더). `lg` 는 미사용 (`md` 로 통일).

---

## 2. ASCII 화면 mock — DispatchTask.status 배지 (4 값)

```
[DRAFT — 작성 중]
┌─────────────────┐
│  ◌ 작성 중       │   ← neutral-100 bg / neutral-700 text
└─────────────────┘     아이콘: 연한 회색 ring

[DISPATCHING — 발송 후 매칭 대기]
┌──────────────────────────────┐
│  ◉ 발송 완료, 매칭 대기      │   ← info-50 bg / info-700 text
└──────────────────────────────┘     아이콘: 파란 채워진 원 + pulse 애니메이션

[DISPATCHED — 배차 완료]
┌──────────────────┐
│  ✓ 배차 완료      │   ← arologis-50 bg / arologis-700 text
└──────────────────┘     아이콘: arologis-500 checkmark
                          (= 녹색 = arologis-teal #2A9D8F)

[FAILED — 배차 불가]
┌──────────────────┐
│  ⚠ 배차 불가      │   ← danger-50 bg / danger-700 text
└──────────────────┘     아이콘: danger-600 warning triangle
        ↓ 옆에 인접 버튼
   ┌─────────────────┐
   │  ↻ 재배차       │  ← danger outline 버튼
   └─────────────────┘    클릭 → DispatchTask status reset → DRAFT
```

### 2.1 size 비교

```
sm (테이블 행 — 24px height):
[ ◌ 작성 중 ]    [ ◉ 발송 후 매칭 대기 ]    [ ✓ 배차 완료 ]    [ ⚠ 배차 불가 ]
  ↑ font 12 weight 600, padding 2/8, radius 4

md (우 panel 헤더 / 상세 modal — 32px height):
┌─────────────┐  ┌─────────────────────┐  ┌──────────────┐  ┌──────────────┐
│  ◌ 작성 중   │  │ ◉ 발송 후 매칭 대기  │  │ ✓ 배차 완료  │  │ ⚠ 배차 불가  │
└─────────────┘  └─────────────────────┘  └──────────────┘  └──────────────┘
   ↑ font 13 weight 600, padding 6/12, radius 6
```

---

## 3. ASCII 화면 mock — Slip.dispatchStatus 배지 (3 값)

```
[UNDISPATCHED — 미배차]
┌──────────┐
│  ○ 미배차 │   ← neutral-100 bg / neutral-700 text
└──────────┘     아이콘: 빈 원 (neutral-400)

[DISPATCHING — 발송 중]
┌──────────┐
│  ◉ 발송 중│   ← info-50 bg / info-700 text
└──────────┘     아이콘: info-500 채워진 원 + pulse

[DISPATCHED — 배차 완료]
┌──────────┐
│  ✓ 배차됨 │   ← arologis-50 bg / arologis-700 text
└──────────┘     아이콘: arologis-500 checkmark
```

> 주의: Slip 배지에는 FAILED 없음 (Slip 자체는 실패 상태 X — DispatchTask 가 FAILED 면 슬립은 UNDISPATCHED 로 복귀).

---

## 4. 사용 위치 매트릭스

### 4.1 DispatchStatusBadge

| 위치 | variant | 비고 |
|---|---|---|
| 우 panel 헤더 (D1 / D2) | `md` | "DT-20260514-001 [배지]" |
| DispatchTaskListPage 테이블 row | `sm` | 작업 list 화면 (별도 라우트, Phase A scope 외) |
| FAILED 시 인접 [재배차] 버튼 | — | 배지 우측 16px gap |
| 알림 (notification-service) | text-only | "[배차 완료] DT-20260514-001 매칭 성공" |

### 4.2 SlipDispatchStatusBadge

| 위치 | variant | 비고 |
|---|---|---|
| 좌 panel 미배차 row 우측 (D1) | `sm` | row 우측 정렬, 기본 UNDISPATCHED 만 표시 (필터 확장 시 다른 값) |
| 출고전표 상세 modal 기본 정보 (D4) | `md` | "배차 상태: [배지]" |
| Slip 관리 admin 페이지 (`/admin/slips`) 테이블 row | `sm` | 별도 화면 |

---

## 5. 디자인 토큰

### 5.1 색상 매트릭스

| 상태 | bg | border | text | icon |
|---|---|---|---|---|
| DRAFT (작성 중) | `--color-bg-muted` (`neutral-100` `#EDF0F4`) | `neutral-200` `#D6DCE3` | `--color-text` (`neutral-700` `#363D49`) | `neutral-400` `#8E97A4` |
| UNDISPATCHED (미배차) | `--color-bg-muted` (`neutral-100`) | `neutral-200` | `neutral-700` | `neutral-400` |
| DISPATCHING (발송 중) | `info-50` (computed `#EDF4FA`) | `info-200` (`#A8C5E0`) | `info-700` (`#1F4E73`) | `--color-info` (`#3F7DB8`) |
| DISPATCHED (배차 완료) | `arologis-50` (`#EFFAF8`) | `arologis-200` (`#A4DFD3`) | `arologis-700` (`#1B665C`) | `arologis-500` (`#2A9D8F`) |
| FAILED (배차 불가) | `danger-50` (computed `#FBEEEE`) | `danger-200` (`#EBB0AD`) | `danger-700` (`#8E2F2B`) | `--color-danger` (`#D6504A`) |

> `info-50` / `info-200` / `danger-50` / `danger-200` 은 Samhan Public design system 기본 토큰에 미존재 시 본 컴포넌트에서 1회 정의. arologis-* 색상은 D-AX-03 에서 도입된 신규 토큰 ([arologis-extract/01-desktop-login.md](../arologis-extract/01-desktop-login.md) § 3.1 참조).

### 5.2 size

| variant | height | padding | font-size | font-weight | radius | icon size |
|---|---|---|---|---|---|---|
| `sm` | 24px | 2px 8px | `size-xs` (12) | `semibold` | `radius-sm` (4) | 12 |
| `md` | 32px | 6px 12px | `size-sm` (13) | `semibold` | `radius-sm` (6) | 14 |

### 5.3 spacing

- 배지 + 인접 텍스트/버튼 gap: `space-2` (8px)
- 배지 inline 안 아이콘 + 텍스트 gap: `space-1` (4px) — `sm`, `space-2` (8) — `md`

### 5.4 애니메이션

| 상태 | 효과 |
|---|---|
| DISPATCHING 아이콘 | pulse 1.5s loop — opacity 1.0 → 0.5 → 1.0 (alternate, ease-in-out) |
| DISPATCHING → DISPATCHED 전이 | bg fade-out 200ms → fade-in 200ms (CSS cross-fade) + icon morph (info ring → arologis check, scale 0.8 → 1.0) |
| DISPATCHING → FAILED 전이 | bg fade-out 200ms → danger 200ms + icon morph (info ring → danger triangle) + 가벼운 shake (3px 좌우, 300ms) |
| FAILED → DRAFT (재배차 클릭) | fade-out 200ms → DRAFT bg (즉시) |
| `prefers-reduced-motion: reduce` | 모든 애니메이션 비활성 (opacity 즉시 변경, shake X) |

---

## 6. 컴포넌트 API

### 6.1 `DispatchStatusBadge.tsx`

```tsx
import { type ReactElement } from 'react';
import type { DispatchTaskStatus } from '@/types/dispatch';

type Props = {
  status: DispatchTaskStatus;  // 'DRAFT' | 'DISPATCHING' | 'DISPATCHED' | 'FAILED'
  size?: 'sm' | 'md';          // default 'md'
  /** 라벨 커스텀 (예: "발송 완료, 매칭 대기" 대신 "매칭 대기") */
  labelOverride?: string;
  /** FAILED 시 표시할 [재배차] 버튼 onClick */
  onRetry?: () => void;
  /** test id prefix (default 'dispatch-status-badge') */
  testIdPrefix?: string;
};

const LABELS: Record<DispatchTaskStatus, string> = {
  DRAFT: '작성 중',
  DISPATCHING: '발송 완료, 매칭 대기',
  DISPATCHED: '배차 완료',
  FAILED: '배차 불가',
};

export function DispatchStatusBadge({ status, size = 'md', labelOverride, onRetry, testIdPrefix = 'dispatch-status-badge' }: Props): ReactElement {
  // ... renders <span data-testid={`${testIdPrefix}-${status.toLowerCase()}`} aria-label={LABELS[status]}>
  //     {icon} {labelOverride ?? LABELS[status]}
  //   </span>
  //   + (status === 'FAILED' && onRetry) → adjacent <Button variant="outline-danger" onClick={onRetry}>↻ 재배차</Button>
}
```

### 6.2 `SlipDispatchStatusBadge.tsx`

```tsx
import { type ReactElement } from 'react';
import type { SlipDispatchStatus } from '@/types/dispatch';

type Props = {
  status: SlipDispatchStatus;  // 'UNDISPATCHED' | 'DISPATCHING' | 'DISPATCHED'
  size?: 'sm' | 'md';
  testIdPrefix?: string;
};

const LABELS: Record<SlipDispatchStatus, string> = {
  UNDISPATCHED: '미배차',
  DISPATCHING: '발송 중',
  DISPATCHED: '배차됨',
};

// 렌더링: <span data-testid={`${testIdPrefix}-${status.toLowerCase()}`} aria-label={LABELS[status]}>{icon}{LABELS[status]}</span>
```

---

## 7. data-testid + 접근성

| 요소 | data-testid | aria-label / role |
|---|---|---|
| DispatchStatusBadge DRAFT | `dispatch-status-badge-draft` | "배차 작업 상태: 작성 중" `role="status"` |
| DispatchStatusBadge DISPATCHING | `dispatch-status-badge-dispatching` | "배차 작업 상태: 발송 완료, 매칭 대기" `role="status"` `aria-live="polite"` |
| DispatchStatusBadge DISPATCHED | `dispatch-status-badge-dispatched` | "배차 작업 상태: 배차 완료" `role="status"` `aria-live="polite"` |
| DispatchStatusBadge FAILED | `dispatch-status-badge-failed` | "배차 작업 상태: 배차 불가" `role="status"` `aria-live="assertive"` |
| FAILED 인접 [재배차] | `dispatch-retry-btn` | "{taskCode} 재배차 시도" |
| SlipDispatchStatusBadge UNDISPATCHED | `slip-dispatch-status-badge-undispatched` | "출고전표 배차 상태: 미배차" `role="status"` |
| SlipDispatchStatusBadge DISPATCHING | `slip-dispatch-status-badge-dispatching` | "출고전표 배차 상태: 발송 중" `role="status"` `aria-live="polite"` |
| SlipDispatchStatusBadge DISPATCHED | `slip-dispatch-status-badge-dispatched` | "출고전표 배차 상태: 배차됨" `role="status"` `aria-live="polite"` |
| 아이콘 (모든 배지 공통) | `{testIdPrefix}-icon` | `aria-hidden="true"` (시각 보조) |

### 7.1 색맹 가드

- 색만으로 의존 X — 모든 배지는 **아이콘 + 한국어 텍스트** 필수.
- DISPATCHED (녹색) vs DISPATCHING (파랑) — protanopia(적록색맹)/deuteranopia 에서 명도 차이 충분 (arologis-500 명도 ~57% vs info-500 명도 ~52%, 텍스트로 추가 식별 가능).
- FAILED (빨강) vs DISPATCHED (녹색) — 적록색맹 사용자는 ⚠ (warning triangle) vs ✓ (check) 아이콘 으로 식별.

### 7.2 키보드 / 스크린리더

- 배지 자체는 non-interactive (`role="status"` `aria-live`).
- FAILED 의 [재배차] 버튼만 `Tab` focus + `Enter`/`Space` 활성.
- 상태 변화 발생 시 (DISPATCHING → DISPATCHED 등) aria-live polite/assertive 영역으로 자동 announce.

---

## 8. 사용 예시 (snippets)

### 8.1 우 panel 헤더 (D1 desktop)

```tsx
<header className="dispatch-task-header">
  <strong>{task.taskCode}</strong>
  <DispatchStatusBadge
    status={task.status}
    size="md"
    onRetry={task.status === 'FAILED' ? () => retryDispatch(task.id) : undefined}
  />
</header>
```

렌더 결과:

```
DT-20260514-001  [ ✓ 배차 완료 ]
```

또는 (FAILED 시):

```
DT-20260514-001  [ ⚠ 배차 불가 ]  [ ↻ 재배차 ]
                                    ↑ onRetry 호출
```

### 8.2 좌 panel 미배차 row (D1 desktop)

```tsx
<li className="slip-row">
  <span className="grip">☰</span>
  <strong>{slip.slipNumber}</strong> {slip.partnerName}
  <SlipDispatchStatusBadge status={slip.dispatchStatus} size="sm" />
</li>
```

렌더 결과:

```
☰ SL-2026-0521  대구공조                              [ ○ 미배차 ]
```

### 8.3 출고전표 상세 modal 기본 정보 (D4)

```tsx
<div className="info-row">
  <span className="label">배차 상태</span>
  <SlipDispatchStatusBadge status={slip.dispatchStatus} size="md" />
</div>
```

### 8.4 customLabel 사용 — DispatchVehicleGroup 헤더 옆 inline 표시

```tsx
<header className="vehicle-group-header">
  <strong>1톤 #1</strong>
  <DispatchStatusBadge status={task.status} size="sm" labelOverride="매칭 대기" />
</header>
```

---

## 9. 단위 테스트 (Vitest + RTL)

```ts
describe('DispatchStatusBadge', () => {
  it('renders DRAFT label and grey style', () => {
    render(<DispatchStatusBadge status="DRAFT" />);
    expect(screen.getByTestId('dispatch-status-badge-draft')).toHaveTextContent('작성 중');
    expect(screen.getByTestId('dispatch-status-badge-draft')).toHaveAttribute('aria-label', expect.stringContaining('작성 중'));
  });

  it('renders FAILED with retry button when onRetry provided', () => {
    const onRetry = vi.fn();
    render(<DispatchStatusBadge status="FAILED" onRetry={onRetry} />);
    fireEvent.click(screen.getByTestId('dispatch-retry-btn'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('respects labelOverride', () => {
    render(<DispatchStatusBadge status="DISPATCHING" labelOverride="매칭 대기" />);
    expect(screen.getByTestId('dispatch-status-badge-dispatching')).toHaveTextContent('매칭 대기');
  });

  it('DISPATCHING has aria-live polite', () => {
    render(<DispatchStatusBadge status="DISPATCHING" />);
    expect(screen.getByTestId('dispatch-status-badge-dispatching')).toHaveAttribute('aria-live', 'polite');
  });
});
```

---

## 10. 비고

- UUID 비공개 — 배지는 status enum 만 사용, `id` 노출 X.
- arologis-teal `#2A9D8F` = DISPATCHED 색상 = D-AX-03 brand color = `--color-success` 동일값 (Samhan Public design system 의 success token 을 아로로지스 brand 로 격상한 결과, [arologis-extract/01-desktop-login.md](../arologis-extract/01-desktop-login.md) § 3.1 일관).
- `info-50` / `danger-50` / `arologis-50` 토큰 = 본 컴포넌트에서 처음 도입 시 `clients/web/design-system/src/tokens/tokens.css` 에 추가 (FE 팀 책임).
- 배지 라벨 한국어 — i18n key 사용 시 `dispatch.status.draft` / `dispatch.status.dispatching` / `dispatch.status.dispatched` / `dispatch.status.failed` / `slip.dispatch.status.undispatched` / `slip.dispatch.status.dispatching` / `slip.dispatch.status.dispatched`.
- FAILED 의 [재배차] 버튼 = DispatchTask.status 만 (Slip 배지는 [재배차] X). Slip 은 DispatchTask 가 FAILED 되면 자동 UNDISPATCHED 복귀 (spec § 6.3).
- 상태 전이 애니메이션 = SSE/polling 으로 status 변화 감지 시 자연스럽게 전이 (개선 가능, Phase B 에서 SSE 활성).
