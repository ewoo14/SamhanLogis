# 품목 재고조회 모달 (Phase 2.6d) — 설계

> brainstorming 완료(2026-05-31). 메모리 [[project_inventory_lookup_modal_2_6d]] 근거.
> 2.6c(재고 reserve/예약 데이터 확정) 머지 후 착수. **읽기 전용 FE 슬라이스 — 백엔드 무변경.**
> ⚠️ Codex 6/1(월) 12:00 복구 전 → 구현+dual리뷰 모두 Claude 에이전트.

## 1. 업무 규칙 (개발책임자)

- **주문서 / 출고전표(판매) / 입고전표(구매) 상세**에서 품목 라인을 **다중 선택** → "재고조회" → 모달.
- 모달 = **품목 × 창고 매트릭스**. 각 셀에 **가용/실/예약 3구분** 누적 표시.
- 기본값 = **실재고 0 창고 숨김**(재고 있는 창고만). 토글 **"0수량 창고도 표시"** → 전 창고 표시.
- **읽기 전용** 조회 기능. 재고 변경 없음.

## 2. 핵심 설계 결정 (2026-05-31 마우스 선택)

| # | 결정 | 선택 | 근거 |
|---|---|---|---|
| D-IL-01 | "0수량 창고도 표시" 토글 범위 | **전 창고 마스터 머지** | balance row 없는(한 번도 입고 안 된) 창고도 0/0/0으로 표시 → "전체 창고" 문자 충족. FE 가 batch 결과 + listWarehouses 머지 |
| D-IL-02 | 모달 품목 범위 | **다중 품목 매트릭스** | 상세에서 여러 라인 동시 선택 → 품목×창고 매트릭스 |
| D-IL-03 | 셀 레이아웃 | **셀 3줄 누적(가용/실/예약)** | 정보 완전, 한 화면에 3값 동시 비교. 셀당 `가용 N / 실 N / 예약 N` |
| D-IL-04 | API | **`POST /inventory/balances/batch` 재사용** (백엔드 무변경) | 전 인증 role(`inventory.list` VIEW) — 주문/판매 담당자 가능. 응답에 가용/실/예약+warehouseType 이미 포함 |
| D-IL-05 | 컴포넌트 | **신규 공유 `InventoryLookupModal`** | 기존 SlipFormPage `StockBalanceModal`(총량 전용·form 맥락)과 형태 상이 → 별도, 기존 무변경(회귀 0) |

## 3. 현행 (grounding, 2026-05-31)

- **재고 API**:
  - `GET /inventory/balances?productId=` → `Page<StockBalanceResponse>`(가용/실/예약 per 창고). 권한 `inventory.stock-balance` VIEW (창고/재고 role 한정).
  - `POST /inventory/balances/batch` `{productIds:[...]}` → `List<ProductBalanceResponse>`, 각 `balances[]`에 `{warehouseId, warehouseCode, warehouseName, warehouseType, availableQty, reservedQty, totalQty}`. 권한 `inventory.list` VIEW = **전 인증 role**. **잔량 row 있는 창고만 포함**(0 row 도 유지하되, 한 번도 입고 안 된 창고는 row 없음).
  - `GET /inventory/warehouses` → 활성 창고 전체(displayOrder ASC).
- **FE 기존**:
  - `clients/desktop/src/renderer/api/inventory.ts` `fetchStockBalanceBatch(lines)` — batch 호출 후 `perWarehouse: warehouseCode→totalQty`(총량만) + VIRTUAL=null 로 pivot. **가용/실/예약은 현재 버림** → 2.6d 가 3값 보존 변형 추가.
  - SlipFormPage `StockBalanceModal` — 품목×창고 총량 매트릭스(form 라인 입력 맥락). 2.6d 와 별개, 무변경.
- **상세 페이지(트리거 위치)**:
  - `SalesPartnerOrderDetailPage`(주문, `/sales/partner-orders/:id`)
  - `SlipDetailPage`(`mode="OUTBOUND"` 출고 `/sales/:id` + `mode="INBOUND"` 입고 `/purchases/:id`) — **1 컴포넌트가 출고·입고 2 컨텍스트 커버**.
  - 라인 DTO 는 `productId`(UUID, 화면 미노출) + `modelName`/`productName` 보유.

## 4. 설계

### 4.1 API / 데이터 (백엔드 무변경)
- 데이터 소스 = `POST /inventory/balances/batch` (선택 라인의 productId 들 1회 batch). 전 role 허용으로 주문/판매 상세에서도 동작.
- **전 창고 머지(D-IL-01)**: `GET /inventory/warehouses` 결과와 머지 — batch 응답에 없는 창고는 `available=0, reserved=0, total=0` 으로 채운다.
- **VIRTUAL 창고**: 2.6c 관례대로 매트릭스에서 제외(예약 대상 외). (필요 시 회색 표기 — 구현 시 Designer 판단.)
- 신규 엔드포인트/Flyway 없음.

### 4.2 FE — `inventory.ts` 확장
- 신규 `fetchProductBalancesMatrix(lines: {productId, modelName, productName}[])`:
  - batch 호출 → 품목별 `{warehouseCode → {available, reserved, total, warehouseType}}` 보존(기존 `fetchStockBalanceBatch` 의 총량-only pivot 과 별개 함수, 기존 무변경).
  - listWarehouses 와 머지 → 전 창고 집합 확보(0/0/0 채움).
  - 반환: `{ warehouses: WarehouseCol[], rows: {productId, modelName, productName, cells: Record<warehouseCode, {available,reserved,total}>}[] }`.

### 4.3 FE — 신규 공유 `InventoryLookupModal`
- 위치: `clients/desktop/src/renderer/routes/components/InventoryLookupModal.tsx` (design-system Modal 사용).
- props: `{ open, onClose, lines: {productId, modelName, productName}[] }`.
- 동작:
  - 마운트 시 `fetchProductBalancesMatrix(lines)` 조회(react-query).
  - **0토글**(기본 OFF): OFF = 매트릭스 컬럼을 **실재고(total) > 0 인 창고만**. ON = 전 창고(머지된 0 포함).
  - 셀 = 3줄 `가용 N / 실 N / 예약 N`(D-IL-03). 0 셀도 동일 포맷.
  - 창고 컬럼 정렬: 실재고 합 내림차순(또는 displayOrder — 구현 시 확정, 기본 displayOrder).
  - 로딩/에러/빈 상태. UUID 비공개(productId/warehouseId 미노출, modelName/productName/warehouseCode/warehouseName 만).
- design-system 컴포넌트 우선 재사용(Modal/Button/체크박스 등), 토큰 사용.

### 4.4 FE — 트리거 (2 페이지)
- `SalesPartnerOrderDetailPage` + `SlipDetailPage`(출고·입고 공용) 라인 표에:
  - **라인 체크박스 다중선택** + "선택 품목 재고조회" 버튼(선택 0건 시 비활성).
  - 클릭 → 선택 라인의 `{productId, modelName, productName}` 배열로 `InventoryLookupModal` open.
  - 기존 라인 표/기능 무변경(회귀 0).

### 4.5 권한 / UUID
- batch endpoint `inventory.list` VIEW = 전 인증 role → 추가 권한/시드 불필요.
- UUID 화면 노출 금지 ([[feedback_uuid_no_user_visibility]]).

## 5. 테스트 + QA
- **컴포넌트/단위**: 0토글 OFF→실재고>0 창고만 / ON→전 창고(머지 0 포함) / 가용·실·예약 셀 값 / VIRTUAL 제외 / batch+warehouses 머지 로직 / 빈·에러 상태.
- **Playwright**: 주문 상세 + 출고 상세 + 입고 상세 각각 다중선택 → 모달 → 토글 → 매트릭스 표시. 기존 SlipFormPage StockBalanceModal 회귀 0.
- **Docker 실 QA([[no-fake-data-ever]])**: 실 inventory_db 잔량으로 실 gateway+JWT+렌더러 실 화면 매트릭스 + 0토글 on/off 캡처. 합성/mock 금지.

## 6. 사이클 / 배포
- Claude 5-team 사이클 N=2 → CI green(skipped=0) → Docker 실 QA → 머지.
- **FE 전용**(백엔드 무변경) → 배포 desktop 단독, Flyway 없음.
- 문서 동기화: DECISIONS D-IL-01~05 / dev-report / 핸드오프 ([[feedback_continuous_docs_sync]]).

## 7. 범위 밖 / 후속
- SlipFormPage 기존 `StockBalanceModal`을 본 공유 모달로 통합(후속 리팩터, 본 슬라이스 무변경).
- 시리얼 인스턴스(Phase A) 재고 시 셀에 시리얼 카운트 확장(후속).
- 재고 이동/조정 등 mutation 은 본 읽기전용 슬라이스 범위 밖.
