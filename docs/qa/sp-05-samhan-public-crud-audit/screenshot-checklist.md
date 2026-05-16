# SP-05 QA 캡처 체크리스트

> 목적: PR 본문에 잘 보이는 상세 캡처를 여러 장 첨부하여 판매/구매/거래처 CRUD 표면 재점검 결과를 한눈에 확인한다.
> 생성 스크립트: `node scripts/generate-sp-05-crud-audit-screenshots.mjs`

| # | 파일 | 확인 내용 |
| --- | --- | --- |
| 1 | `screenshots/01-sales-management-detail-action.png` | 판매관리 목록의 신규 출고전표, Excel, 인쇄, 상세 버튼 |
| 2 | `screenshots/02-sales-detail-navigation-contract.png` | 판매번호 기반 test id와 `/sales/:id` 상세 진입 계약 |
| 3 | `screenshots/03-purchase-management-detail-and-inspection.png` | 구매관리 목록의 상세 버튼과 검수 CTA 공존 |
| 4 | `screenshots/04-purchase-detail-navigation-contract.png` | 구매번호 기반 test id와 `/purchases/:id` 상세 진입 계약 |
| 5 | `screenshots/05-partner-management-current-state.png` | `/admin/partners`, `/admin/partners/new` 기본 거래처 UI 운영 가능 |
| 6 | `screenshots/06-inventory-doc-catalog-correction.png` | inventory/catalog의 SP-05 현재 상태 정정 |
| 7 | `screenshots/07-crud-surface-role-matrix.png` | SALES/MANAGER/MASTER/WAREHOUSE 역할별 CRUD/검수/export 표면 |
| 8 | `screenshots/08-verification-matrix.png` | RED/GREEN, typecheck, lint, build, Playwright 검증 매트릭스 |

## 실제 Vite mock UI 캡처

`clients/desktop` Vite mock server(`http://127.0.0.1:5173/#/...`)에서 sales/purchase query 스펙을 skip 없이 실행해 아래 캡처도 생성했다.

- `docs/qa/sales-purchase-query-redesign/TC-S2-sales-query-18-columns.png`
- `docs/qa/sales-purchase-query-redesign/TC-P1-purchase-query-12-columns.png`
- `docs/qa/sales-purchase-query-redesign/TC-S5-sales-query-search-modal.png`
- `docs/qa/sales-purchase-query-redesign/TC-P3-purchase-query-search-biz-no.png`

## UUID 비공개 확인

- 캡처 텍스트에는 `YYYY/MM/DD-{순번}`, 거래처명, 사업자번호, 역할명만 사용한다.
- 내부 UUID, 원본 저장키, raw URL은 표시하지 않는다.
