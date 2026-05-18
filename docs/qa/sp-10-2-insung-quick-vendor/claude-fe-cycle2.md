# SP-10-2 인성데이타 퀵프로그램 — FE Cycle 2 리뷰

리뷰어: Frontend Engineer (Claude)
기준 커밋: `36379838`
리뷰 일자: 2026-05-19

---

## 1. 총평

Cycle 1 에서 제기된 P0 2건 (P0-3 testid 정합, P0-4 dispatch=null 라우터) 및 P1/P2 2건 (D-2 dark mode 토큰, D2 aria-live) 모두 코드 레벨에서 정상적으로 수정되었다. 신규 회귀는 1건 (에러 상태에서 영구 로딩 UX 노출) 이 식별되었으며, 이는 P1 수준이다. Spinner 컴포넌트 prop 계약, UUID 비공개 원칙, design-system import 의무는 전부 준수되었다.

---

## 2. Cycle 1 결함 해결 검증

### P0-3: spec sandbox-banner testid → `insung-sandbox-banner` 정합

상태: **PASS**

`DispatchDetailPage.tsx` 라인 377 에서 `SandboxBanner` 컴포넌트의 외부 div 에 `data-testid="insung-sandbox-banner"` 가 정확히 선언되어 있다.

`qa/playwright/tests/arologis/sp-10-2-insung-quick-vendor.spec.ts` 라인 257, 316 에서 `page.locator('[data-testid="insung-sandbox-banner"]')` 로 동일 값 참조. 정합 확인.

### P0-4: DispatchDetailRouteWrapper dispatch=null 상시 전달 해소

상태: **PASS**

`clients/arologis-desktop/src/renderer/routes/index.tsx` 라인 46-83 에서 `DispatchDetailRouteWrapper` 가 다음 방식으로 구현되었다.

- `useParams<{ dispatchCode: string }>()` 로 URL 파라미터 추출 (라인 48)
- `useEffect` 안에서 `apiClient.get(...)` 을 호출하여 실제 fetch 수행 (라인 60-75)
- 성공 시 `setDispatch(nextDispatch)` 로 데이터 주입, 실패 시 `setDispatch(null)` (라인 70, 74)
- 라우터에 `{ path: 'detail/:dispatchCode', element: <DispatchDetailRouteWrapper /> }` 로 마운트 (라인 106)
- `DispatchDetailPage` 에 `dispatch={dispatch}` 주입 (라인 82)

기존 dispatch=null 고정 전달 패턴이 완전히 제거되었다.

### D-2: design-system tokens.css dark mode `--surface-subtle` 추가

상태: **PASS**

`clients/web/design-system/src/tokens/tokens.css` 라인 468 에서 dark mode selector `html[data-theme="dark"], body[data-theme="dark"]` 블록 내에 `--surface-subtle: #1F2937` 가 추가되었다.

light mode 값은 라인 200 에서 `--surface-subtle: #F4F6F8` 이다.

WCAG 대비 검토:
- light `#F4F6F8` — 배경 역할로 내부 텍스트 색상 대비 의존 (카드/패널 표면). 문제없음.
- dark `#1F2937` — Tailwind gray-800 계열. 어두운 배경에 light 텍스트(`--color-neutral-900` = `#F7F8FA` dark override) 사용 시 대비비 약 13:1 (AAA 충족).

`InsungLbsPanel.tsx` 라인 316 에서 `background: 'var(--surface-subtle)'` 로 참조하므로 light/dark 자동 전환 적용 확인.

### Designer D2: VehicleMatchStatusBadge aria-live 컨테이너 4 상태 전체 적용

상태: **PASS**

`clients/arologis-desktop/src/renderer/components/VehicleMatchStatusBadge.tsx` 라인 197-198 에서 외부 컨테이너 div 에 `aria-live="polite"` 와 `aria-label={ariaLabel}` 이 적용되었다.

`STATUS_ARIA_LABEL` 레코드 (라인 99-104) 에서 PENDING/MATCHING/ASSIGNED/DELIVERED 4개 상태 전체에 한국어 aria-label 이 정의되어 있다.

상태 전이 시 컨테이너의 내부 텍스트가 변경되면 `aria-live="polite"` 에 의해 스크린리더가 전체 컨테이너를 재독하므로 스크린리더 알림이 정확히 동작한다.

---

## 3. Cycle 2 신규 발견

### C2-1: 에러 상태에서 "배차 정보를 불러오는 중..." 영구 노출 [P1]

파일: `clients/arologis-desktop/src/renderer/routes/index.tsx` 라인 72-75 및 `clients/arologis-desktop/src/renderer/routes/dispatches/DispatchDetailPage.tsx` 라인 488-499

에러 시 catch 블록에서 `setDispatch(null)` 로 상태를 초기화한다 (index.tsx 라인 74). `DispatchDetailPage` 는 `dispatch === null` 이면 "배차 정보를 불러오는 중..." 텍스트를 렌더한다 (DispatchDetailPage.tsx 라인 488-499).

결과적으로 네트워크 오류, 404, 403 등 모든 에러 케이스에서 사용자는 "배차 정보를 불러오는 중..." 이라는 오해를 유발하는 메시지를 무한정 보게 된다. 에러 상태를 구분하는 별도 상태변수(`error: Error | null`) 또는 union type (`'loading' | 'error' | DispatchDetail`) 이 필요하다.

현재 Playwright spec 에도 에러 상태 케이스가 없어 이 시나리오는 자동화 미커버 상태다.

### C2-2: loading 상태와 loaded 상태 구분 불가 [P2]

파일: `clients/arologis-desktop/src/renderer/routes/index.tsx` 라인 49, 58

초기 `useState<DispatchDetail | null>(null)` 과 fetch 완료 전 중간 상태 모두 `null` 이다. fetch 시작 직전 `setDispatch(null)` 을 다시 호출하므로 (라인 58) 실제로 "로딩 중인 null" 과 "에러로 인한 null" 을 구분할 수 없다.

`dispatchCode` 가 없는 경우도 동일하게 null 을 반환하므로 (라인 52-54) URL 파라미터 누락 케이스도 에러/로딩과 구분 불가다.

C2-1 과 연계된 파생 결함. Spinner 또는 로딩 인디케이터와 에러 메시지를 구분해야 UX 가 완성된다.

### C2-3: encodeURIComponent URL injection 가드 충분성 [PASS — 추가 확인]

`routes/index.tsx` 라인 62 에서 `encodeURIComponent(dispatchCode)` 를 적용한다. `dispatchCode` 는 `useParams` 로 추출되며, react-router-dom 이 URL 파싱 시 이미 decodeURIComponent 를 적용한다. 따라서 `encodeURIComponent` 재인코딩은 중복이나 무해하며 injection 가드로는 유효하다. 특수문자 포함 dispatchCode 가 있다면 이중 인코딩이 발생할 수 있으나, dispatchCode 가 영숫자/하이픈 형식이라면 실무상 문제없다. PASS 처리.

### C2-4: ApiEnvelope 분기 처리 — BE 응답 정합 [조건부 PASS]

파일: `clients/arologis-desktop/src/renderer/routes/index.tsx` 라인 64-69

```
const body = res.data
const nextDispatch =
  body && typeof body === 'object' && 'data' in body
    ? (body as ApiEnvelope<DispatchDetail>).data
    : (body as DispatchDetail)
```

BE `arologis-service` 의 `/api/arologis/dispatches/{code}` endpoint 가 envelope 를 쓰는지 raw 객체를 쓰는지에 따라 동작이 달라진다. `client.ts` 의 `ApiEnvelope<T>` 주석 (라인 138-139) 에 "아로로지스 auth endpoint 는 envelope 없이 raw 객체로 응답한다 ... 다른 endpoint 는 BE 가 envelope 적용 여부에 따라 분기" 라고 명시되어 있다.

Playwright mock (spec 라인 201-211) 은 envelope 없는 raw 객체로 응답하도록 설정되어 있으므로, BE 가 실제로 raw 응답을 쓴다면 `'data' in body` 분기는 false 로 평가되어 정상 동작한다. BE contract 가 확정되면 분기가 올바른지 최종 검증 필요.

### C2-5: showInsungBadge / showDriverCode 분기 정합 [PASS]

`VehicleMatchStatusBadge.tsx` 라인 185-187:
- `showInsungBadge = status === 'MATCHING' || status === 'ASSIGNED'` — DELIVERED 에서는 미표시 (QA-5 delivered 테스트와 일치)
- `showDriverCode = (status === 'ASSIGNED' || status === 'DELIVERED') && Boolean(driverCode)` — DELIVERED 에서도 driverCode 노출 (트레이서빌리티 확보)

Playwright spec QA-5 라인 684-685 에서 DELIVERED 상태 insungBadge `not.toBeVisible()`, 라인 689-691 에서 driverCode `toBeVisible()` + "전자서명 수신" 텍스트 확인 — 구현과 100% 정합. PASS.

### C2-6: Spinner design-system import 의무 준수 [PASS]

`VehicleMatchStatusBadge.tsx` 라인 26 에서 `import { Spinner } from '@samhan/design-system'` 으로 import. `StatusIcon` 컴포넌트의 MATCHING 케이스 (라인 136-140) 에서 `<Spinner size="sm" tone="var(--color-brand-500)" label="매칭 중" />` 사용. 자체 신규 컴포넌트 작성 없음. PASS.

`Spinner.tsx` prop 계약 확인: `size: SpinnerSize = 'md'` / `tone?: string` / `label?: string`. 호출부 `size="sm"` (유효), `tone="var(--color-brand-500)"` (유효), `label="매칭 중"` (유효). 완전 정합.

### C2-7: UUID 비공개 원칙 준수 [PASS]

- `DispatchDetailPage.tsx` 내 `dispatch.id`, `vehicle.id` 는 화면 렌더에 사용되지 않음. 사용자 표시에는 `sequence`, `dispatchDate`, `dispatchTypeLabel`, `driverCode` 만 사용.
- `VehicleMatchStatusBadge.tsx` 의 `driverCode` prop 주석: "UUID driverId 는 전달 금지" (라인 37-38).
- `InsungLbsPanel.tsx` 헤더에서 `driverCode` 만 표시 (라인 332).
- QA spec fixture 의 `id: 'dispatch-uuid-001'` 은 mock 내부에만 존재하며 화면 렌더 경로 없음.

UUID 비공개 원칙 전면 준수. PASS.

---

## 4. 결함 요약

| ID | 우선순위 | 파일 | 내용 | 상태 |
|---|---|---|---|---|
| C2-1 | P1 | routes/index.tsx:72-75, DispatchDetailPage.tsx:488-499 | 에러 케이스에서 "배차 정보를 불러오는 중..." 영구 노출 — error state 구분 없음 | 신규 결함 |
| C2-2 | P2 | routes/index.tsx:49,58 | loading/error/null 상태 구분 불가 — null 단일 표현 | 신규 결함 |

---

## 5. 최종 판정

**FIX (P1 수정 후 재리뷰)**

P0 결함 2건 및 P1/P2 Designer 결함 모두 정상 수정되었다. 그러나 신규 P1 (C2-1: 에러 시 "로딩 중" 영구 노출) 이 발견되어 사용자 경험에 직접 영향을 미친다. 최소한 `isLoading: boolean` + `isError: boolean` 상태를 분리하거나, `DispatchDetailPage` 에 에러 prop 를 추가하여 "배차 정보를 불러올 수 없습니다. 다시 시도해 주세요." 메시지를 표시하는 수정이 필요하다. 수정 후 Cycle 3 에서 재검증.
