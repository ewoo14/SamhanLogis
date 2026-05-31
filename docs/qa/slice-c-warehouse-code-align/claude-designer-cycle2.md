# Designer Review — Slice C 출고 창고 선택 UI
## claude-designer-cycle2

**리뷰 대상 커밋**: `184da98f`
**검증 파일**:
- `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx` (971~991라인)
- `clients/web/design-system/src/components/WarehouseSelector/WarehouseSelector.tsx`
- `clients/web/design-system/src/components/WarehouseSelector/WarehouseSelector.module.css`

**결론: APPROVE**

---

## F-1 [P1] 미선택 시 에러 텍스트 부재 — 해소 확인

**판정: 해소됨**

**근거** (`SalesPartnerOrderDetailPage.tsx` 972~987라인):

```tsx
const hasConvertQty = Object.values(convertQtyMap).some((q) => q > 0)
const convertWarehouseError = warehousesQuery.isError
  ? '창고 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
  : (!convertWarehouse && hasConvertQty ? '출고 창고를 선택하세요.' : undefined)
...
<WarehouseSelector
  ...
  error={convertWarehouseError}
/>
```

- 수량이 1 이상 입력(`hasConvertQty === true`)된 상태에서 창고 미선택(`!convertWarehouse`)이면 `'출고 창고를 선택하세요.'` 문자열이 `error` prop으로 전달된다.
- `WarehouseSelector`는 `FormField`로 래핑되어 있고(`WarehouseSelector.tsx` 117~161라인), `error` prop이 `FormField`의 `error`로 그대로 전달되어 `role="alert"` 인라인 에러 텍스트로 표출된다.
- 에러 발생 시 `hasError` CSS 클래스가 적용되어 빨간 테두리(`border-color: var(--color-danger)`)도 함께 표시된다 (`WarehouseSelector.module.css` 50~51라인).

사이클1 제안 사항(에러 텍스트 인라인 표출)이 정확히 반영됐다. 단, 에러 트리거 조건이 "수량 입력 후" (`hasConvertQty`)로 한정되어 있어, 창고를 선택하지 않은 채로 수량을 0으로 유지한 상태에선 에러가 표시되지 않는다. 이는 의도된 동작(전환 수량 미입력 시 버튼도 disabled이므로 에러 안내 불필요)으로 판단되며 결함 아님.

---

## F-2 [P1] 창고 목록 로딩/에러 상태 미처리 — 해소 확인

**판정: 해소됨**

**근거** (`SalesPartnerOrderDetailPage.tsx` 983~986라인):

```tsx
placeholder={warehousesQuery.isLoading ? '창고 목록 불러오는 중…' : '출고 창고를 선택하세요'}
disabled={convertMutation.isPending || warehousesQuery.isLoading}
error={convertWarehouseError}  // isError 시 → '창고 목록을 불러오지 못했습니다. ...'
```

- **로딩 중**: `warehousesQuery.isLoading === true` 시 `disabled={true}`로 드롭다운 비활성화, placeholder가 `'창고 목록 불러오는 중…'`으로 변경. 사용자가 로딩 상태를 인지할 수 있다.
- **에러**: `warehousesQuery.isError === true` 시 `convertWarehouseError`가 `'창고 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'`로 설정되어 FormField 에러 텍스트로 표출된다.
- 사이클1 제안 사항(로딩 시 disabled + 로딩 placeholder, 에러 시 error prop 전달) 두 가지 모두 반영됐다.

---

## 잔여 항목 (보류 P2) — 후속 슬라이스 권고

아래 4건은 사이클1에서 "`WarehouseSelector`가 공유 컴포넌트이므로 본 슬라이스 범위 밖"으로 합의하여 보류됐다. 해당 보류 판단은 타당하다. 공유 컴포넌트의 표현 방식 변경은 영향 범위 분석 + 별도 슬라이스가 적절하다. 본 리뷰에서 재지적하지 않으며 블로킹 없음.

| 번호 | 등급 | 위치 | 항목 | 후속 처리 |
|------|------|------|------|---------|
| F-4 | P2 | WarehouseSelector.tsx 149 | 옵션 코드 노출 (`${code} · ${name}`) — 창고명 우선 표시 | 별도 슬라이스 (WarehouseSelector UX 고도화) |
| F-5 | P2 | WarehouseSelector.module.css 42, 55 | focus ring RGB 하드코딩 — CSS 토큰 분리 필요 | 별도 슬라이스 (design-system 토큰 정합) |
| F-3 | P2 | SalesPartnerOrderDetailPage.tsx 977 | marginTop 누락 — wrapper div에 marginBottom만 존재 | 본 파일 내 낮은 우선순위, 시각 영향 미미 |
| F-6 | P2 | SalesPartnerOrderDetailPage.tsx 916~920 | 복합 disabled 원인 구분 불가 (4가지 조건 동시 적용) | F-1 에러 텍스트로 창고 미선택 안내는 완화됨 |

**F-3 추가 확인**: `style={{ marginBottom: 'var(--space-3)' }}`는 여전히 변경 없음 (`SalesPartnerOrderDetailPage.tsx` 977라인). 사이클1 P2 지적 그대로지만 보류 합의 항목이므로 블로킹 아님. `.convertWarningBanner`의 `margin-bottom` 덕분에 실렌더 12px 간격은 유지됨.

---

## 신규 결함

없음.

---

## 요약

| 번호 | 등급 | 판정 | 근거 |
|------|------|------|------|
| F-1 | P1 | **해소** | `error` prop에 `'출고 창고를 선택하세요.'` 조건부 전달 (971~987라인) |
| F-2 | P1 | **해소** | `isLoading` → disabled + placeholder, `isError` → error 문구 (983~987라인) |
| F-3 | P2 | **보류** | marginTop 누락 — 후속 슬라이스 권고, 블로킹 아님 |
| F-4 | P2 | **보류** | 옵션 코드 노출 — 공유 컴포넌트 별도 슬라이스, 블로킹 아님 |
| F-5 | P2 | **보류** | focus ring 하드코딩 — design-system 별도 슬라이스, 블로킹 아님 |
| F-6 | P2 | **보류 (완화됨)** | F-1 에러 텍스트로 창고 미선택 원인 안내 일부 충족 |

**결론: APPROVE** — 블로킹 finding 0건. P1 2건 모두 해소. P2 4건 전량 후속 슬라이스 보류 (본 슬라이스 머지 차단 없음).
