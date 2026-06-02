# dev-report — item 3-D SlipFormPage 재고모달 일원화 + 목록 배지 갱신 E2E

- **일자**: 2026-06-02
- **PR**: #343
- **유형**: FE 정리 (BE 무변경, Flyway 없음, FE only 배포)
- **spec/plan**: `docs/superpowers/specs/2026-06-02-slipform-stock-modal-unify-design.md` / `docs/superpowers/plans/2026-06-02-slipform-stock-modal-unify.md`

## 1. 배경 — 재고 모달 분기
2.6d(#335)에서 신 공용 `InventoryLookupModal`(가용/실/예약 매트릭스)을 만들어 상세 페이지(`SlipDetailPage`, `SalesPartnerOrderDetailPage`)에 배선했으나, 그 이전 sales-form-polish 슬라이스의 구 `StockBalanceModal`(디자인시스템, 창고별 총량 1줄 + 합계)이 작성 페이지(`SlipFormPage`)에 남아 **재고 모달이 두 개로 분기**되어 있었다. 작성 페이지가 상세 페이지보다 빈약한 정보(총량만)를 노출하는 비일관.

병행: 전환/병합 후 주문 목록 상태 배지 갱신용 `invalidateQueries(['partner-orders'])` 로직은 존재(`SalesPartnerOrderListPage`)했으나 회귀 검증 E2E 부재.

## 2. 변경 요약
- **모달 일원화**: `SlipFormPage` 구 `StockBalanceModal` → 신 `InventoryLookupModal`. 자체 페치(`useQuery`)라 폼의 `stockRows`/`stockError` state + `stockMutation` + `warehouseColumns` memo 제거. 스냅샷(`stockSelectedSnapshot`) 유지로 모달 열린 채 라인 편집 시 표 흔들림 방지. 재고조회 버튼 `data-testid="slip-form-inventory-lookup-btn"` 추가.
- **데드코드 제거**: 디자인시스템 `StockBalanceModal` 컴포넌트(4파일) + 배럴 export + `inventory.ts` `fetchStockBalanceBatch`/`StockBalanceBatchRow`/`StockBalanceBatchResponse`. `ProductBalanceResponse`·`/inventory/balances/batch` mock route 는 신 모달이 사용하므로 유지. 순감 **–818 / +57**.
- **합계 컬럼 생략 확정**(D-3D-03): 상세 모달과 100% 동일 UX. 전환은 특정 창고 기준이며 합계는 각 창고 셀로 파악.
- **목록 배지 갱신 E2E**: `mock.ts` 상태보존(`mockConvertedOrderNos` Set)으로 병합 후 status CONVERTED 모사 → 신규 Playwright 스펙이 새로고침 없이 DRAFT 목록에서 변환 행 제거 + 전체 필터 전환 시 `전환완료` 배지 노출 단언.

## 3. 파일별 변경
| 파일 | 변경 |
|---|---|
| `clients/desktop/src/renderer/routes/SlipFormPage.tsx` | 모달 교체 + 데드 state/mutation/memo/import 제거 + 버튼 testid |
| `clients/desktop/src/renderer/api/inventory.ts` | `fetchStockBalanceBatch`+전용 타입 제거(ProductBalanceResponse 유지) |
| `clients/desktop/src/renderer/api/mock.ts` | `mockConvertedOrderNos` 상태보존 + 목록 CONVERTED 반영 + 죽은 함수 주석 정리 |
| `clients/web/design-system/src/components/StockBalanceModal/` | 디렉토리 전체 삭제(4파일) |
| `clients/web/design-system/src/index.ts` | StockBalanceModal 배럴 export 제거 |
| `clients/web/design-system/src/tokens/tokens.css`, `.../CsvUploadDialog/CsvUploadDialog.module.css` | 죽은 컴포넌트명 주석 정리 |
| `clients/desktop/playwright/d2-6d-inventory-lookup/inventory-lookup.spec.ts` | 시나리오 12 → 신 모달 일원화 회귀로 교체 |
| `clients/desktop/playwright/partner-order-list-badge-refresh/...` | **신규** 배지 갱신 invalidate 회귀 스펙 |

## 4. 테스트
- `clients/web/design-system` + `clients/desktop` `tsc --noEmit` 오류 0.
- CI 전 잡 green(백엔드/빌드/Playwright(qa)/가드).
- Playwright(VITE_MOCK_MODE): `d2-6d-inventory-lookup`(시나리오 12) + 신규 `partner-order-list-badge-refresh`(2 시나리오).
- ⚠️ **신규 desktop Playwright 스펙은 CI 에서 자동 실행되지 않음** — `clients/desktop/playwright/**` 는 CI `qa/playwright` 잡 범위 밖(기존 부채, 80+ 스펙 동일). CI 자동실행 게이트화는 **item 3-A2**(별도 큐). 따라서 본 스펙은 로컬 수동 실행 + Docker 실 QA 로 회귀 실증.

## 5. dual 5-agent 리뷰 (사이클 수렴)
- Claude 5-agent(FE/API/QA/UX/DevOps): **P0/P1 코드 결함 0**. QA P2 2건 + UX P2 2건 + DevOps P1(CI 미실행).
- Codex 5-section cross-check: 추가 P0/P1 0(동의). QA P2 2건 fix 적용(변환 전 같은 거래처 2건 명시 단언 + mock index 매핑 의도 주석).
- 사이클 fix 가 production 로직 무변경(테스트 단언 + 주석)이라 추가 fleet 재실행 비례성 낮음 — 양 reviewer 0 P0/P1 수렴으로 종결.

## 6. QA (머지 전 의무)
- [ ] Docker 실서버(게이트웨이+실 inventory_db) `SlipFormPage` 재고조회 → 가용/실/예약 매트릭스 실 렌더 + psql 대조 실 캡처.
- [ ] ⚠️ 선결: 로컬 구-시드 드리프트 → 3-DB TRUNCATE CASCADE + 전체 reseed([[project_seed_product_uuid_catalog]]).
- 실 캡처를 `docs/qa/slice-3-d-slipform-stock-modal-unify/` 저장 + PR 인라인 첨부.

## 7. 후속(비차단)
- **item 3-A2**: desktop Playwright CI 자동실행 hard gate(신규 스펙 false-green 해소).
- UX P2: 0수량 토글 헤더 밖 분리(다이얼로그 접근명 정리), 선택품목 리스트 표시(현 카운트 축약).
