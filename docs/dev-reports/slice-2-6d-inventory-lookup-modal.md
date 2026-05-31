# 슬라이스 2.6d — 품목 재고조회 모달

> 2026-05-31. spec `docs/superpowers/specs/2026-05-31-inventory-lookup-modal-design.md` / plan `docs/superpowers/plans/2026-05-31-inventory-lookup-modal.md` / 결정 DECISIONS D-IL-01~06.
> 읽기전용·FE 중심(BE 1필드). Codex 6/1 복구 전 → 구현+리뷰 Claude 에이전트.

## 1. 목적
주문/출고전표(판매)/입고전표(구매) 상세에서 품목 라인을 다중 선택 → 창고별 **가용/실/예약 매트릭스** 모달로 즉시 재고 확인. 기본 실재고 0 창고 숨김 + "0수량 창고도 표시" 토글(전 창고).

## 2. 아키텍처 (읽기전용)
```
[상세 라인 다중선택] → InventoryLookupModal(lines: {productId, modelName, productName}[])
   → fetchProductBalancesMatrix(lines)
        ① POST /inventory/balances/batch {productIds}  (가용/실/예약+warehouseType, 전 role)
        ② GET /inventory/warehouses (전 창고, VIRTUAL 제외)
        ③ lines 기준 순회 + 전 창고 0/0/0 초기화 후 batch 덮어쓰기
        → { warehouses, rows: [{productId, modelName, productName, cells: code→{available,reserved,total}}] }
   → 매트릭스(행=품목, 열=창고, 셀 3줄 가용/실/예약) + 0토글(클라이언트 컬럼 필터)
```
- 백엔드 신규 엔드포인트/Flyway 없음. partner-order LineResponse 에 productId 1필드만 추가(재고 batch 키).

## 3. 함수 단위 문서 (3-layer)
### partner-order-service
- `PartnerOrderDetailResponse.LineResponse` — `productId`(String) 추가 + `from` 매핑. 재고 batch 조회 키, 화면 미노출.

### desktop FE
- `inventory.ts fetchProductBalancesMatrix(lines)` — batch(가용/실/예약 보존) + listWarehouses 머지. **lines 기준 순회**(잔량 없던 품목도 0/0/0 행). VIRTUAL 제외. 반환 `BalanceMatrix{warehouses, rows}`.
- `InventoryLookupModal` — 매트릭스 모달. 0토글(기본 OFF=실재고>0 창고만, ON=전 창고). 셀 3줄 `가용/실/예약`(가용=0 `--state-danger`, 예약>0 `--state-warning`, 0셀 `--ink-tertiary`). sticky 고정 품목 컬럼, th scope/caption/aria-label. 로딩/에러(재시도)/빈 상태. 모달 재오픈 시 0토글 OFF 복원.
- `sales.ts PartnerOrderLine.productId` — 재고조회 키(화면 미노출).
- 트리거: `SlipDetailPage`(기존 단일 alert 재고조회 → 다중선택+모달, 출고·입고 공용) + `SalesPartnerOrderDetailPage`(다중선택+버튼+모달). 전표/주문 이동 시 체크 리셋.

## 4. 테스트 / QA
- partner-order `PartnerOrderDetailIT` 7 PASS(skipped=0, productId 단언 포함).
- desktop Playwright 13(skipped=0): 주문·출고·입고 다중선택→모달 / 셀 실값(가용/실/예약) / 0토글 OFF=total>0만(CS-001 숨김)·ON=전 창고(BK-001 0/0/0) / VIRTUAL(VR-001) 제외 / 출고·입고 UUID 가드 / batch 500 에러 배너 / 회귀(SlipFormPage StockBalanceModal 무변경).
- **5-team 사이클 N=2 전원 APPROVE**(BE/DevOps cycle1, FE/Designer/QA cycle2). 사이클1: QA B-2(품목 행 누락 실버그)·Designer 토큰화·FE 상태리셋·Playwright 강화 → fix → cycle2 수렴.
- **Docker 실 QA**: PR 단계 — 실 inventory_db 잔량 매트릭스 + 0토글 on/off 실 화면 캡처([[no-fake-data-ever]]).

## 5. 배포
partner-order(LineResponse productId) → desktop FE. Flyway/게이트웨이 변경 없음. 기존 단일주문/전환/SlipFormPage 모달 회귀 0.

## 6. 후속 (비차단)
- SlipFormPage 기존 StockBalanceModal 을 본 공유 모달로 통합.
- 시리얼 인스턴스(Phase A) 시 셀 시리얼 카운트 확장.
- D2-6d Playwright CI(frontend-desktop 잡) 자동실행 게이트(기존 known gap).
- BK-001 셀 가용/실/예약 개별 단언 강화(QA nit).
