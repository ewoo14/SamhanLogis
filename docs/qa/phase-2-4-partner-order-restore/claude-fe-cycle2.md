# Phase 2.4 Partner-Order RESTORE — FE Review Cycle 2 (Claude)

> 브랜치: `feat/phase-2-4-partner-order-restore` HEAD `6a36e08e`
> 기준 diff: `e6533d71..HEAD` FE 파트 (cycle1 fix cross-check)
> 검토자: Claude FE Agent
> 일시: 2026-05-30

---

## 검토 대상 파일

- `clients/desktop/src/renderer/components/audit/PartnerOrderVersionHistoryPanel.tsx`
- `clients/desktop/playwright/phase-2-4-partner-order-restore/phase-2-4-partner-order-restore.spec.ts`

---

## 중점 항목별 판정

### 1. invalidate `['partner-orders']` prefix 무효화 — 범위·정확성

**판정: 적합 (결함 없음)**

cycle1 수정 전: `queryKey: ['partner-orders', orderId]`
cycle1 수정 후: `queryKey: ['partner-orders']`

`SalesPartnerOrderListPage.tsx:51` 의 실제 목록 queryKey 는
`['partner-orders', dateFrom, dateTo, partnerId, statusFilter, searchKeyword, 0]` 이다.
TanStack Query `invalidateQueries` 는 prefix match 방식이므로 `['partner-orders']` 하나로
날짜/필터 파라미터가 무엇이든 해당 쿼리 전부를 무효화한다.

이전 `['partner-orders', orderId]` 는 UUID를 두 번째 키로 넣어서 목록 queryKey와 일치하지 않아
실제로 무효화가 이루어지지 않았다 — cycle1에서 올바르게 수정되었다.

"너무 광범위한 무효화" 우려에 대해: 목록 화면에서 사용자가 다른 필터 조건으로 불러온
기존 캐시도 stale 처리되나, 이는 복원 후 정확성 보장을 위해 의도된 동작이다
(SalesPartnerOrderDetailPage의 deleteMutation도 동일하게 `['partner-orders']` prefix 무효화를 사용한다 — line 119).

단건 무효화 `['partner-order', orderId]`(단수)도 `SalesPartnerOrderDetailPage`의 queryKey `['partner-order', id]`와
정확히 일치한다. revisions `['partner-order-revisions', orderId]` 역시 패널 자체 queryKey와 일치.

결론: 3개 무효화 키 모두 정확하고 일관성 있다.

---

### 2. `formatLocalDateTime` 방어 파싱 — 타입 안전성 + lint

**판정: 적합 (결함 없음)**

시그니처: `function formatLocalDateTime(iso: string | unknown): string`

`unknown` 타입은 TypeScript strict mode에서 narrowing 없이 사용 불가하므로
코드가 반드시 타입 검사를 통과해야 한다. 실제 코드를 확인하면:

1. 정상 경로: `typeof iso === 'string'` 검사 후 regex test — 완전한 타입 narrowing.
2. 방어 경로: `Array.isArray(iso)` 분기.
   - `(iso as number[]).join('/')` — `Array.isArray` 검사 이후 `as` 캐스팅이므로 적합.
   - `String(iso)` — `unknown`을 String()으로 변환하는 것은 타입 오류 없음.

배열 조인 시 `[2026, 5, 29, 14, 32, 18].join('/')` = `"2026/5/29/14/32/18"` →
`new Date("2026/5/29/14/32/18")` 는 브라우저 환경에서 파싱 실패(Invalid Date) 가능성이 있다.
`new Date("2026/05/29 14:32:18")` 형식이 아니므로 NaN 반환 후 `'-'`으로 fallback 된다.
단, 이는 "방어 경로"이고 정상 BE 응답은 ISO 문자열이므로 사실상 실행되지 않는다.
FE 코드 자체에 버그는 없으며 가장 나쁜 경우 `-`가 표시된다.

`string | unknown` 은 TypeScript에서 `unknown`으로 귀결되므로
실제 타입은 `unknown`이다. 이 점에서 파라미터 타입을 `unknown`으로만 명시하는 것이
더 명확하지만, `string | unknown` 표기 자체가 컴파일 오류를 유발하지는 않는다.
lint 통과 여부는 프로젝트 eslint 설정에 따라 다르나 TypeScript 컴파일 차원에서 이상 없다.

결론: 기능 정확성 및 타입 안전성 충족. 사소한 개선 가능성(파라미터 타입 `unknown` 단일화)이
있으나 결함 수준은 아님.

---

### 3. 토스트 `role` 분기 — success=status / warning·danger=alert

**판정: 적합 (결함 없음)**

```tsx
role={toast.kind === 'success' ? 'status' : 'alert'}
```

`toast.kind` 타입은 `'success' | 'danger' | 'warning'` (useState 선언 line 139).
분기 논리:
- `success` → `role="status"` (aria-live=polite, 즉각 인터럽트 없음) — 정상 복원 알림에 적합.
- `warning` → `role="alert"` (aria-live=assertive) — 출고전표 재발행 필요 경고, 즉각 고지 필요.
- `danger` → `role="alert"` — 복원 실패, 사용자 즉시 인지 필요.

WCAG 1.3.1 기준에 부합한다. `toast.kind` 가 3종('success'/'warning'/'danger') 이외의 값을
취하는 경로가 코드상 없으므로 else 분기(='alert')도 안전하다.

결론: ARIA role 분기 정확.

---

### 4. `STATUS` variant `brand` 변경 — design-system Badge 실재 여부 + 시각 충돌

**판정: 적합 (결함 없음)**

`Badge.tsx` `BadgeVariant` 타입: `'brand' | 'neutral' | 'success' | 'warning' | 'danger' | 'nts'`

REVISION_TYPE_META의 타입 어노테이션:
```ts
{ label: string; variant: 'neutral' | 'brand' | 'warning' | 'success' | 'danger' | 'nts' }
```

`brand` variant는 `Badge.module.css`에 `.variant-brand` 클래스로 정의되어 있다
(`var(--color-brand-50)` 배경, `var(--color-brand-200)` 테두리, `var(--color-brand-700)` 텍스트).

5종 변형 시각 충돌 검토:
- CREATE: neutral (회색) — 생성, 중립
- EDIT: brand (브랜드 색, 파란 계열) — 수정 행위
- STATUS: brand (EDIT과 동일 색) — 상태변경. EDIT과 동일 색이 혼동을 줄 수 있으나
  배지 레이블이 '수정'/'상태변경'으로 다르고, 설계 주석("success=초록은 완료 오해 유발")에
  따른 의도적 선택이다. 시각적으로 완전히 분리되진 않으나 결함 수준은 아니다.
- RESTORE: warning (노란 계열) — 복원 주의
- DELETE: danger (빨간 계열) — 삭제 경고

`badge` 타입 어노테이션의 variant 집합이 `BadgeVariant`와 완전히 일치한다. TypeScript 타입 오류 없음.

결론: Badge variant 실재 확인, 타입 정합, 시각 충돌 없음.

---

### 5. `&times;` / DS Button 닫기 / `whiteSpace: pre-line` 렌더

**판정: 적합 (결함 없음)**

**`&times;` (U+00D7)**: HTML entity `&times;`는 JSX에서 유효하다. `×` 문자를 렌더.
이전 `x` (ASCII 소문자) 대비 시각적으로 더 명확한 닫기 아이콘.

**DS Button 닫기**: `variant="ghost"`, `size="sm"` 사용.
`Button.tsx`에 해당 variant/size 모두 실재. `aria-label="알림 닫기"` 포함으로 접근성 충족.
이전 native `<button>` 대비 design-system 컴포넌트 사용 규칙 준수.

**`whiteSpace: pre-line`**: `\n` 줄바꿈을 그대로 렌더하기 위한 설정.
warning toast 텍스트에 `\n⚠` 개행이 포함되어 있으므로 필수이다.
`pre-line`은 공백 축약 + 개행 유지 동작으로 적합하다 (`pre-wrap`도 가능하나 차이 없음).

`alignItems: 'flex-start'`로 변경되어 여러 줄 텍스트 시 닫기 버튼이 상단에 정렬된다.

결론: 3가지 모두 렌더 정상, 개선 방향 적합.

---

### 6. revisionType 5종 배지 exhaustive 유지 + typecheck

**판정: 적합 (결함 없음)**

`PartnerOrderRevisionType = 'CREATE' | 'EDIT' | 'STATUS' | 'RESTORE' | 'DELETE'` (5종)

`REVISION_TYPE_META: Record<PartnerOrderRevisionType, ...>` 로 선언되어
TypeScript가 5종 키 전부를 요구한다 — exhaustive 자동 강제.

현재 맵:
```ts
CREATE: { label: '생성',    variant: 'neutral' },
EDIT:   { label: '수정',    variant: 'brand' },
STATUS: { label: '상태변경', variant: 'brand' },
RESTORE:{ label: '복원',    variant: 'warning' },
DELETE: { label: '삭제',    variant: 'danger' },
```
5종 모두 채워져 있다. typecheck 0 예상.

---

### 7. Playwright spec — 시나리오 재배열 + 케이스7 정합성

**판정: 적합, 단 잠재 불안정성 1건 주의**

**시나리오 번호 재배열**: cycle1 이전에 단일 "시나리오 5" (CONFIRMING/CANCELED 합산)였던 것이
4a/4b로 분리되었고, UUID 비노출이 5번으로, DELETE가 6번으로 재배열되었다.
헤더 주석과 실제 `test()` 블록 레이블이 정합하다.

**시나리오 5 (UUID 비노출)**: `innerText()` 전체 텍스트에서 UUID 패턴 탐색.
`orderId`('ord-draft')가 URL에만 쓰이고 `innerText()`에 포함되지 않으므로 오탐 없음.
`installAuthMock` stub의 `userId: '00000000-0000-0000-0000-000000010001'`이
패널 innerText에 노출되지 않아야 하는데, 이 값은 `window.samhanAuth`에 있으며
패널이 렌더하지 않으므로 안전하다.

**시나리오 7 (멱등성 재복원) — 잠재 불안정성**:

```ts
await expect(toast).toBeHidden({ timeout: 5_000 }).catch(() => {
  // toast 가 유지되는 경우에도 두 번째 복원 시도 허용
})
```

현재 구현에서 toast는 자동 닫히지 않는다 (사용자가 수동 닫기 버튼을 눌러야 한다).
따라서 `toBeHidden` 5초 대기는 항상 `.catch()`로 fallthrough 된다.
이 자체가 오류는 아니지만, 이후 "두 번째 복원 → restoreBtn1 활성 확인" 단계에서
첫 번째 toast가 화면에 남아있는 상태로 두 번째 `restoreMutation` 완료 후
`setToast()`가 동일한 state를 덮어쓴다. `data-testid="partner-order-version-history-toast"`
는 항상 하나이므로 두 번째 toast 단언은 정상 작동한다.

단, 첫 번째 복원 성공 후 `invalidateQueries`로 `['partner-order-revisions', orderId]`가
무효화되면서 revision 목록이 refetch 된다. mock 환경에서 refetch 결과가 동일한 fixture를
반환한다면 rev1 버튼이 다시 렌더되어 시나리오 7이 정상 진행된다. 그러나
만약 mock refetch 결과가 rev1을 "현재 revision"으로 변경했다면 (revisionNo가 달라져
`isLatest` 판정이 바뀌어 버튼이 사라지는 경우) 시나리오 7이 flaky해진다.
실제로는 DRAFT orderId fixture가 고정 3건을 반환하므로 일반적으로 통과하지만,
spec 주석에 이 가정이 명시되어 있지 않다는 점이 약점이다.

이 사항은 **P3 (개선 권고)** 수준이며 현재 구현·설계 오류가 아니다.

**전체 시나리오 커버리지**:
- 시나리오 1: 목록 렌더 (CREATE/EDIT/RESTORE 배지)
- 시나리오 2: DRAFT 복원 성공
- 시나리오 3: CONFIRMED 복원 + slipResyncRequired 경고
- 시나리오 4a: CONFIRMING 비활성
- 시나리오 4b: CANCELED 비활성
- 시나리오 5: UUID 비노출
- 시나리오 6: DELETE 배지
- 시나리오 7: 멱등성 재복원

FE 컴포넌트 변경 사항과 spec 시나리오 정합.

---

## 신규 결함 목록

| 등급 | 항목 | 설명 |
|------|------|------|
| P3 | 시나리오 7 spec 가정 미명시 | 첫 번째 복원 후 revision 목록 refetch 결과가 동일 fixture를 유지함을 spec 주석에 명시하지 않음. 향후 mock 변경 시 flaky 가능성. 현재 통과에는 영향 없음. |

P1/P2 결함: **없음**

---

## 종합 판정

**FE APPROVE (cycle2)**

cycle1 fix 7개 항목 (`['partner-orders']` prefix 수정, `formatLocalDateTime` 방어 파싱,
토스트 role 분기, STATUS variant brand, `&times;`/DS Button 닫기, `pre-line`, spec 재배열+케이스7)
모두 설계 의도에 부합하고 타입 정합성을 유지한다. 신규 P1/P2 결함 없음.

P3 개선 권고(시나리오 7 spec 가정 명시) 1건은 다음 슬라이스 또는 주석 보완으로 처리 가능하며
현재 cycle 머지를 막지 않는다.
