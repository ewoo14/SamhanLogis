# 3-D 설계 — SlipFormPage 재고모달 일원화 + 목록 배지 갱신 E2E

- **작성일**: 2026-06-02
- **슬라이스**: item 3-D (CURRENT-WORK.md 후속 큐)
- **상태**: 설계 승인 (개발책임자, 2026-06-02) → spec 박제
- **유형**: FE 정리 (BE 무변경, Flyway 없음)
- **관련 메모리**: [[project_inventory_lookup_modal_2_6d]], [[project_local_stack_qa_gotchas]], [[project_seed_product_uuid_catalog]], [[feedback_no_fake_data_ever]], [[feedback_uuid_no_user_visibility]]

---

## 1. 배경 — 재고 모달 분기

2.6d(#335)에서 신규 공용 `InventoryLookupModal`(가용/실/예약 매트릭스)을 만들어 상세 페이지에 배선했으나, 그 이전 sales-form-polish 슬라이스에서 만든 구 `StockBalanceModal`(총량만)이 작성 페이지에 그대로 남아 **재고 모달이 두 개로 갈라진 상태**다.

| 구분 | 구 `StockBalanceModal` (디자인시스템) | 신 `InventoryLookupModal` (데스크톱 공용, 2.6d) |
|---|---|---|
| 사용처 | `SlipFormPage` (전표 작성/편집) | `SlipDetailPage`, `SalesPartnerOrderDetailPage` (상세) |
| 표시 | 창고별 **총량 1줄 + 합계 컬럼** | 창고별 **가용/실/예약 3줄** (합계 없음) |
| 데이터 | `fetchStockBalanceBatch` (총량만 pivot) | `fetchProductBalancesMatrix` (listWarehouses 머지, 가용/실/예약) |
| 페치 | 호출자 `useMutation` 스냅샷 | 자체 `useQuery` (staleTime 30s) |
| 가상창고 | `-`(null)로 표시 | 아예 제외 |
| 0수량 토글 | 없음 (항상 0 표시) | 0수량 창고 토글 (기본 OFF) |

두 모달 모두 같은 endpoint(`POST /inventory/balances/batch`)를 호출한다. 결과적으로 **작성 페이지가 상세 페이지보다 빈약한 정보(총량만)를 보여주는 비일관**이 핵심 문제다.

병행 문제: 전환/병합 성공 시 주문 목록 상태 배지 갱신용 `invalidateQueries(['partner-orders'])` 로직은 존재(`SalesPartnerOrderListPage` 라인 164~167)하나, **목록 배지가 수동 새로고침 없이 갱신됨을 검증하는 E2E 회귀 테스트가 없다**. [[project_local_stack_qa_gotchas]]의 "react-query invalidate 누락 stale" 함정과 직결.

---

## 2. 목표 & 범위

### 목표
1. 작성 페이지(`SlipFormPage`)의 재고모달을 상세 페이지와 동일한 **가용/실/예약 모달로 일원화**한다.
2. 분기된 구 컴포넌트/함수/타입을 **데드코드로 제거**한다.
3. 전환·병합 후 **주문 목록 상태 배지가 수동 새로고침 없이 갱신**됨을 보장하는 **E2E 회귀 테스트**를 추가한다.

### 범위 밖 (비대상)
- 합계(실재고 총합) 컬럼 신설 — **생략 확정** (상세 모달과 100% 동일 UX).
- 신 모달의 디자인시스템 승격 — 데스크톱 공용 위치 유지(현행 재사용으로 충분).
- 회계 전표 작성 페이지(`PurchaseAccountingSlipFormPage`, `SalesAccountingSlipFormPage`) — 재고모달 미사용(확인 완료).
- BE 변경 / Flyway / 시리얼 카운트 확장 — 본 슬라이스 외.

### 확정된 결정
- **D-3D-01**: SlipFormPage를 신 `InventoryLookupModal`로 일원화, 구 `StockBalanceModal`은 제거(일원화 방향).
- **D-3D-02**: 범위 = ① 모달 일원화 + ② 목록 배지 갱신 E2E (둘 다 포함).
- **D-3D-03**: 합계 컬럼 생략 — 어차피 전환은 특정 창고 기준이며, 합계는 각 창고 셀로 파악.

---

## 3. 변경 설계

### 3.1 모달 일원화 (`SlipFormPage`)
- import 교체: `StockBalanceModal`(@samhan/design-system) → `InventoryLookupModal`(`./components/InventoryLookupModal`).
- 모달이 **자체 페치**(`useQuery` + `fetchProductBalancesMatrix`)하므로 폼에서 다음 제거:
  - state: `stockRows`, `stockError` (페치 결과 보관 불필요).
  - mutation: `stockMutation`(`fetchStockBalanceBatch` 호출) 제거.
- 모달엔 `open` / `onClose` / `lines` prop만 전달.
- **스냅샷 동작 보존**: 모달 열 때 선택 라인을 `stockSelectedSnapshot`(기존 state 재사용)으로 고정하여 `lines`로 전달 → 모달 열린 채 폼 라인 편집해도 표가 흔들리지 않음. `InventoryLookupModal`은 `open && lines.length > 0`일 때만 `enabled`이라 자연스럽게 맞물린다.
- 버튼 라벨(`선택 항목 재고조회 (N건)`)·열기 트리거(`openStockModal`)·닫기(`closeStockModal`)는 그대로 유지.
- UUID 비공개 가드 유지([[feedback_uuid_no_user_visibility]]): `lines`는 `{productId, modelName, productName}`만 — productId는 내부 key 전용, 화면 미노출.

### 3.2 데드코드 제거 (정확 목록)
- `clients/web/design-system/src/components/StockBalanceModal/` 디렉토리 전체
  - `StockBalanceModal.tsx`, `StockBalanceModal.module.css`, `StockBalanceModal.stories.tsx`, `index.ts`
- `clients/web/design-system/src/index.ts` — `StockBalanceModal` 및 관련 타입(`StockBalanceRow`, `WarehouseColumn`, `StockBalanceModalProps`) export 제거
- `clients/desktop/src/renderer/api/inventory.ts`
  - 제거: `fetchStockBalanceBatch`, `StockBalanceBatchRow`, `StockBalanceBatchResponse`
  - **유지**: `ProductBalanceResponse` interface (신 모달의 `fetchProductBalancesMatrix`가 사용), `StockBalanceLookupLine`(공용), `fetchProductBalancesMatrix`, `BalanceMatrix` 계열
- `clients/desktop/src/renderer/api/mock.ts`
  - `StockBalanceModal`/`fetchStockBalanceBatch` 전용 mock 정리
  - **유지**: `POST /inventory/balances/batch` mock route (신 모달도 동일 endpoint 사용)
- `clients/web/design-system/src/tokens/tokens.css`
  - 라인 192의 `StockBalanceModal` 언급은 토큰이 아닌 **주석 설명** — 토큰 삭제 불필요, 문구만 정리

### 3.3 목록 배지 갱신 E2E
- 대상: `SalesPartnerOrderListPage` 상태 배지(`STATUS_CLASS` 기반 — DRAFT/ON_HOLD/CONFIRMING/CONFIRMED/CANCELED/CONVERTED).
- 시나리오: 병합/전환 성공 → `invalidateQueries(['partner-orders'])` 발동 → **수동 새로고침 없이** 해당 주문 행의 배지가 갱신됨(예: DRAFT → CONVERTED)을 검증.
- 위치: `clients/desktop/playwright/` 하위 신규 스펙(예: `partner-order-list-badge-refresh/`).
- data-testid: `partner-order-list-status-filter` 등 기존 testid + 행 상태 배지 testid 활용(없으면 최소 추가).
- **성격 구분 (중요)**: 본 E2E는 프론트 invalidate 동작의 회귀 가드이며 Playwright route mock로 검증한다(FE 단위 한정). [[feedback_no_fake_data_ever]]에 따라 **실 QA로 포장 금지** — 머지 전 Docker 실서버 실 캡처는 §4에서 별도 의무.

---

## 4. QA & 검증

### 4.1 Docker 실서버 실 QA (머지 전 의무, [[feedback_qa_docker_real_test]])
- 게이트웨이(:8080) + 실 JWT + 실 inventory_db 연동.
- `SlipFormPage`에서 품목 선택 → [선택 항목 재고조회] → **가용/실/예약 매트릭스 실 렌더** + psql 대조 실 캡처.
- 0수량 토글 OFF/ON, VIRTUAL 제외, 로딩/에러/빈 상태 실 확인.
- 실 캡처만([[feedback_no_fake_data_ever]]) — PIL 합성/mock 화면 금지. 실연동 불가 시 "캡처 불가 + 사유" 정직 보고.

### 4.2 선결 조건 — 로컬 구-시드 드리프트
[[project_seed_product_uuid_catalog]]: 로컬 product_db의 products가 구 랜덤 UUID(#327 결정적 UUID 이전)라 cross-DB join 실증 QA 전 **3-DB(product/inventory/partner_order) TRUNCATE CASCADE + 전체 reseed** 선결 필요. 코드(결정적 파생)는 정상.

### 4.3 회귀
- 타입체크/빌드: 데드코드 제거 후 디자인시스템 + 데스크톱 빌드 그린.
- 상세 페이지 모달(`SlipDetailPage`, `SalesPartnerOrderDetailPage`) 무회귀 확인(공용 컴포넌트 동작 불변).
- 기존 Playwright `d2-6d-inventory-lookup` 스펙 무회귀.

---

## 5. 리스크 / 영향

| 항목 | 평가 |
|---|---|
| 디자인시스템 공개 컴포넌트 1개 제거 | 외부 사용처 없음(검증 완료) → 안전 |
| 페치 정책 변화(useMutation→useQuery, staleTime 30s) | 상세 페이지와 동일 정책, 무방 |
| 영향 범위 | 데스크톱 1 라우트(SlipFormPage) + 디자인시스템 1 컴포넌트 제거 + api/mock 정리 + Playwright 1 스펙 신규 |
| BE / Flyway | 무변경 / 없음 |
| 배포 | FE only |

---

## 6. 산출물 체크리스트
- [ ] `SlipFormPage` 모달 교체 + state/mutation 정리 + 스냅샷 보존
- [ ] 구 `StockBalanceModal` 디렉토리 + export 제거
- [ ] `inventory.ts` `fetchStockBalanceBatch`/관련 타입 제거 (ProductBalanceResponse 유지)
- [ ] `mock.ts` 전용 mock 정리 (batch route 유지)
- [ ] 목록 배지 갱신 Playwright E2E 신규
- [ ] 디자인시스템 + 데스크톱 빌드/타입체크 그린
- [ ] Docker 실서버 실 QA 실 캡처 (시드 reseed 선결)
- [ ] dev-report `docs/dev-reports/slice-3-d-slipform-stock-modal-unify.md`
- [ ] DECISIONS D-3D-01~03 정식화
- [ ] CURRENT-WORK.md / overview.html 동기화
