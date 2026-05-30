# FE 리뷰 — Phase 2.6c 재고 예약 모델 (claude-fe-cycle1)

브랜치: `feat/phase-2-6c-inventory-deduction` HEAD `c4f517e1`
리뷰 기준일: 2026-05-31
리뷰어: claude-fe

---

## 판정 요약

**CONDITIONAL APPROVE** — P1 결함 2건 수정 후 머지 가능. P0 차단 없음.

| 등급 | 건수 | 내용 요약 |
|---|---|---|
| P0 | 0 | — |
| P1 | 2 | insufficientLines 계약 불일치 / 사이드바 동적 RBAC 누락 |
| P2 | 3 | native select / 페이지네이션 하드코드 / 페이지 레벨 pre-line 누락 |

---

## P0 — 차단 없음

---

## P1 — 머지 전 수정 권장

### P1-1. `insufficientLines` 파싱 분기가 실제 BE 계약과 불일치

**파일**: `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx:211-238`

**근거**: `PartnerOrderConvertService.java`(이번 diff)는 가용 부족 409를 `BusinessException(ErrorCode.CONFLICT, message)` 형태로 던지며, `StockService.java`의 reserve 실패도 동일 패턴입니다. BE `ApiEnvelope` 구조는 `{ success, code, message, data, timestamp }`이고, 현재 서비스 전체에서 `insufficientLines` 배열을 409 본문에 포함하는 코드가 존재하지 않습니다 (repo-wide 검색 결과 0건).

FE는 `insufficientLines` 분기를 먼저 시도하고 없으면 `message` fallback으로 처리하므로 실 호출 시에는 fallback 경로가 실행됩니다. 구조적으로 큰 문제는 아니지만, 주석이 "BE 가 insufficientLines 배열을 포함하면"이라고 명시하여 사용자에게 BE 계약이 확정된 것처럼 오인시킵니다.

**권장**: 현 BE 계약이 `message` 단일 문자열임을 주석에 명시하고, `insufficientLines` 분기는 "향후 확장 예정" 주석으로 변경하거나 제거하여 실제 계약과 코드를 일치시킵니다. 또는 BE에서 `insufficientLines` 배열을 실제로 포함하도록 BE 계약을 확정하고, 이번 diff의 `PartnerOrderConvertService`에도 반영합니다. 어느 쪽이든 현재 상태는 코드와 계약이 따로 놉니다.

---

### P1-2. 사이드바 `재고 현황` 링크에 독립 동적 RBAC 키 미등록

**파일**: `clients/desktop/src/renderer/components/AppLayout.tsx:1053`

**근거**: 신규 `/inventory/stock-balance` 라우트는 `RoleGuard allow={['WAREHOUSE','MANAGER','MASTER']}`로 가드되지만, 사이드바 `show` 조건은 기존 `showInventoryWarehouse || showInventoryStockTransfer`(각각 `inventory.warehouse`, `inventory.stock-transfer` PageCode)를 재사용합니다. `inventory.stock-balance`용 `dynamicCanAccess` 변수가 없으므로, RBAC 매트릭스에서 `inventory.warehouse`와 `inventory.stock-transfer`를 모두 닫은 사용자는 `inventory.stock-balance`에 `view` 권한이 있어도 사이드바에 메뉴가 나타나지 않습니다. 라우트 직접 접근은 `RoleGuard`만으로 가능하지만 사이드바 가시성 정책이 불완전합니다.

기존 패턴(`showInventoryWarehouse`, `showInventoryDps` 등)은 각 화면마다 `dynamicCanAccess('inventory.<pageCode>', 'view')` 변수를 개별 선언하고 `showInventoryGroup` OR 조건에 합산합니다(AppLayout.tsx:317-319). 이 패턴을 따르지 않았습니다.

**권장**: `showInventoryStockBalance = dynamicCanAccess('inventory.stock-balance', 'view')` 변수를 추가하고, `show={showInventoryWarehouse || showInventoryStockTransfer || showInventoryStockBalance}` 로 수정합니다. `showInventoryGroup` OR 조건에도 포함시킵니다. `inventory.stock-balance` PageCode를 RBAC 매트릭스에 등록하는 것은 DevOps/BE 담당.

---

## P2 — 권장 개선 (머지 비차단)

### P2-1. 창고 필터에 native `<select>` 사용 — design-system `Select` 컴포넌트 미사용

**파일**: `clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx:264-278`

**근거**: design-system은 `Select` 컴포넌트를 export(`clients/web/design-system/src/index.ts:13`)합니다. 툴바의 창고 필터는 인라인 스타일이 적용된 native `<select>`로 구현되어 있으며 design-system `Select`를 사용하지 않습니다. `feedback_integrated_pr_pattern` 가드에 따라 디자인/UI 불일치는 단편 픽스보다 통합 PR에서 처리하는 것이 원칙이지만, 신규 화면에서의 누락이므로 이번 사이클 내 수정이 적절합니다.

**권장**: `import { Select } from '@samhan/design-system'`으로 대체. `Select`의 `option` children 패턴은 기존 화면(TransferListPage 등)의 패턴을 참고합니다.

---

### P2-2. `size: 200` 하드코드 — 실 데이터 200건 초과 시 페이지네이션 미표시

**파일**: `clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx:212` / `api/inventory.ts:407`

**근거**: `listStockBalances` 호출 시 `size: 200`을 고정으로 요청하며, `totalElements`를 하단 요약에 표시하지만 페이지 이동 UI가 없습니다. Phase 2.6c 초기에는 품목 수가 200건 이내일 수 있으나, 이카운트 마이그레이션(MIG-1 7,748행 적재)을 고려하면 품목×창고 조합이 수천 행을 넘길 수 있습니다. `totalElements > 200`인 경우 데이터가 잘리고 사용자는 인지하지 못합니다.

**권장**: 단기적으로 `totalElements > rows.length` 조건 시 "전체 {totalElements}건 중 최초 {rows.length}건만 표시됩니다. 창고 필터로 범위를 좁혀주세요." 안내 문구를 추가합니다.

---

### P2-3. 페이지 레벨 에러 배너(`partner-order-convert-error`)에 `whiteSpace: pre-line` 미적용

**파일**: `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx:505-509`

**근거**: 이번 diff에서 모달 내 에러 배너(라인 932-937)에는 `style={{ whiteSpace: 'pre-line', alignItems: 'flex-start' }}`가 추가되었습니다. 그러나 같은 `convertErrorMessage`를 렌더링하는 페이지 레벨 배너(`data-testid="partner-order-convert-error"`, 라인 505-509)에는 `whiteSpace: pre-line`이 적용되지 않았습니다. 줄바꿈(`\n`)을 포함하는 `insufficientLines` 조합 메시지가 페이지 레벨 배너에 표시될 경우 줄바꿈이 렌더되지 않습니다.

**권장**: `data-testid="partner-order-convert-error"` div에도 `style={{ whiteSpace: 'pre-line' }}`를 추가합니다. `alignItems: flex-start`는 페이지 레벨 배너가 flex 컨테이너인 경우에만 필요하므로 기존 `errorBanner` CSS 클래스 확인 후 결정합니다.

---

## 점검 항목별 결과

### 1. 재고 3구분 정확 표시

- 가용재고(availableQty) / 실재고(totalQty) / 예약재고(reservedQty) 3구분 컬럼이 `COLUMNS` 배열에 올바른 순서(`availableQty → reservedQty → totalQty`)로 정의됩니다.
- `fmtQty` 헬퍼가 null/undefined/NaN 모두 `—`로 처리하여 데이터 결함에 안전합니다.
- `availableQty = totalQty - reservedQty` 계산은 BE(`StockService.reserve`)와 mock 양쪽에서 일관하게 `Math.max(0, total - reserved)`로 처리합니다.
- 가용 0 강조: `isZero && !isVirtual` 조건으로 빨강(`#B91C1C`) 강조가 적용됩니다.
- VIRTUAL 창고는 모든 수량 열을 `—`로 처리하고 회색으로 표시합니다. 정책적으로 올바릅니다.
- 업무 용어 라벨 ("가용재고" / "예약재고" / "실재고") 적절합니다.

### 2. 409 UX

- `insufficientLines` 파싱 로직은 존재하나 현 BE 계약과 불일치(P1-1 참고).
- `message` fallback 경로는 정상 작동합니다.
- `whiteSpace: pre-line`이 모달 에러 배너에 적용되어 다중 줄 메시지가 렌더됩니다.
- `data-testid="partner-order-convert-modal-error"` 유지됩니다.
- UUID 비공개: 에러 메시지에 UUID 없음 확인. mock 메시지 `"재고 부족: 실외기(AJ040RXH4BC1) 요청 2, 가용 0"` — productCode/productName 위주, UUID 미포함.

### 3. design-system 우선

- `DataGrid`, `Badge`, `Button`은 `@samhan/design-system`에서 import합니다.
- `DataGridColumn<StockBalanceListRow>` 타입도 design-system에서 정상 export됩니다.
- 창고 필터에 native `<select>` 사용 — P2-1 참고.
- 자체 신규 컴포넌트 작성 없음. 확인.

### 4. mock.ts no-fake-data

- `getMockResponse` 전체가 `isMockMode()`(`VITE_MOCK_MODE=1`)로 gate됩니다(`client.ts:46`).
- `/inventory/balances` mock 블록과 `mockConvertInventory409` 분기 모두 `getMockResponse` 함수 내부에 있으므로 프로덕션 빌드에서 실행되지 않습니다.
- Playwright spec 주석에 "QA 증빙 스크린샷은 실서버 Docker 환경에서 PM이 별도 수행. mock 캡처 금지."가 명시되어 있습니다.
- `no-fake-data-ever` 원칙 준수 확인.

### 5. 권한/라우트

- `RoleGuard allow={['WAREHOUSE', 'MANAGER', 'MASTER']}` 적용됩니다. 라우트 가드 자체는 정상입니다.
- 사이드바 `show` 조건이 `inventory.stock-balance` 전용 PageCode를 사용하지 않는 점은 P1-2 참고.
- 기존 inventory 라우트(`/inventory/warehouse`, `/transfers`)가 `PermissionGuard`를 사용하는 반면 신규 `/inventory/stock-balance`는 `RoleGuard`만 사용합니다. `PermissionGuard`로 전환하려면 `inventory.stock-balance` PageCode를 RBAC 매트릭스에 먼저 등록해야 하므로 단계적 접근(현재는 `RoleGuard`, 이후 `PermissionGuard` 전환)으로 이해합니다. 의도가 맞다면 코드 주석에 명시하는 것이 좋습니다.

### 6. typecheck/lint 무결성, ApiResponse wrapper

- `listStockBalances`: `apiClient.get<ApiEnvelope<PageResponse<StockBalanceListRow>>>` — wrapper 사용 정상.
- `res.data.data` unwrap 패턴 — 기존 `listWarehouses`(`res.data.data.map(...)`)와 일관합니다.
- `InventoryStockBalancePage.tsx`에 `any` 사용 없음. 인라인 타입(`InsufficientLine`)은 `as`를 사용하나 `type InsufficientLine` 정의 후 cast하는 방식입니다.
- `rowKey={(row) => \`${row.productId}-${row.warehouseCode}\`}` — `productId`(UUID)는 rowKey에만 사용되며 화면 렌더 없음. UUID 비공개 규칙 준수.

---

## Playwright 시나리오 점검

| 시나리오 | 검증 항목 | 판정 |
|---|---|---|
| 1 | 409 에러 배너에 `재고 부족`/`요청 2`/`가용 0` 포함 | OK |
| 2 | 에러 후 모달 미닫힘 + 토스트 미노출 | OK |
| 3 | 에러 후 취소 → 모달 닫힘 + 에러 클리어 | OK |
| 4 | 정상 전환 성공 → slipNo 토스트 | OK |
| 5 | 성공 토스트 UUID 미포함 | OK |
| 6 | DataGrid에 3구분 컬럼 헤더 표시 | OK |
| 7 | 재고 현황 화면 UUID 비공개 | OK |
| 8 | 가용재고 0 하단 요약 경고 | OK |

시나리오 3: 취소 버튼 `getByRole('button', { name: '취소' })`는 모달 내 취소 버튼을 특정합니다. 모달이 열린 상태에서만 해당 버튼이 존재하므로 ambiguity 없음. 다만 버튼 텍스트가 다른 언어 환경에서 "닫기"로 변경될 경우 테스트가 깨집니다. `data-testid="partner-order-convert-modal-cancel"` 추가를 권장하나 P2 수준입니다.

---

## 파일 경로 요약

리뷰 대상:
- `clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx` (신규 434L)
- `clients/desktop/src/renderer/api/inventory.ts` (추가 65L)
- `clients/desktop/src/renderer/api/mock.ts` (수정 + 추가)
- `clients/desktop/src/renderer/components/AppLayout.tsx` (사이드바 9L 추가)
- `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx` (409 UX 46L 수정)
- `clients/desktop/src/renderer/routes/index.tsx` (라우트 10L 추가)
- `clients/desktop/playwright/phase-2-6c-inventory-deduction/phase-2-6c-inventory-deduction.spec.ts` (신규 339L)
