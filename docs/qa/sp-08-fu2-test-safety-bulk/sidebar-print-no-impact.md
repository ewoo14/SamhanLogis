# SP-08-FU2 사이드바 / 인쇄 영향 없음 확인

슬라이스: SP-08-FU2 (Test Safety Bulk — 4건 통합)
작성일: 2026-05-19
작성자: QA agent

---

## 1. 사이드바 영향 없음

### 근거

| 항목 | 내용 |
|---|---|
| P2-2 | slip-service 내부 컬럼 추가 + DTO 필드 추가. 사이드바 메뉴 구성 무관. |
| P2-3 | partner-service 신규 internal endpoint + accounting-service client 구현. 사이드바 라우트 변경 없음. |
| P2-4 | accounting-service LedgerService 조회 로직 변경 (LEFT JOIN 추가). 사이드바 메뉴 미변경. |
| P2-5 | TaxInvoiceListPage 의 navigate 경로 검증. 기존 경로(`/accounting/hometax-export`) 재사용 — 신규 라우트 추가 없음. |

FE 변경은 `clients/desktop` 라우터 경로 검증 (P2-5) 에 한정.
`index.tsx` 에 신규 `path` 추가 없음 — 기존 `/accounting/hometax-export` 경로 재활용.
사이드바 항목 추가/삭제/재정렬 없음.

---

## 2. 인쇄 양식 영향 없음

### 근거

| 항목 | 인쇄 경로 영향 |
|---|---|
| P2-2 | `destinationWarehouseName` 은 `SlipDetailResponse` 에 추가되지만, 기존 인쇄 양식 (`SlipPrintView`, `TaxInvoiceView`) 은 해당 필드를 사용하지 않음. 인쇄 렌더링 로직 변경 없음. |
| P2-3 | accounting-service 원장/에이징 보고서의 내부 데이터 조회 개선. 세금계산서 / 거래명세서 인쇄 양식 렌더링 경로(`/print/tax-invoice`, `/print/statement-batch`) 와 무관. |
| P2-4 | `LedgerResponse` / `LedgerImageResponse` 에 `accountName` 필드 추가. 현재 원장 인쇄 미지원 (인쇄 전용 컴포넌트 없음). 추후 인쇄 기능 추가 시 `accountName` 자동 표시 가능 (회귀 없음). |
| P2-5 | FE path 정합 검증만. 인쇄 관련 컴포넌트 (`TaxInvoiceView.tsx`, `StatementBatchView.tsx`) 변경 없음. |

### 인쇄 회귀 방어 체크리스트

- [ ] `clients/desktop/src/renderer/print/TaxInvoiceView.tsx` — 변경 없음 확인
- [ ] `clients/desktop/src/renderer/routes/accounting/TaxInvoiceBatchPage.tsx` — 변경 없음 확인
- [ ] 기존 인쇄 경로 (`/print/tax-invoice/:id`, `/print/statement-batch`) 라우터 등록 유지 확인

---

## 3. 결론

SP-08-FU2 4건(P2-2 ~ P2-5)은 모두 BE 내부 데이터 조회 개선 / FE path 정합 검증에 해당.
사이드바 메뉴 변경 없음, 인쇄 양식 렌더링 변경 없음.
인쇄 양식 regression iteration (memory feedback_print_design_iteration.md) 불필요.
