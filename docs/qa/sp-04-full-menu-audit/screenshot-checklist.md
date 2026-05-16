# SP-04 QA 캡처 체크리스트

> 생성일: 2026-05-16
> 생성 스크립트: `scripts/generate-sp-04-full-menu-audit-screenshots.ps1`

| # | 파일 | 검증 관점 |
|---|---|---|
| 1 | `01-master-full-sidebar.png` | MASTER 전메뉴 사이드바 라벨/권한/업무번호 요약 |
| 2 | `02-manager-operational-menu.png` | MANAGER 운영 메뉴 직접 접근과 AdminLayout dead-end 제거 |
| 3 | `03-sales-management-crud-and-export-roles.png` | SALES 판매관리/거래처 생성 가능, export/edit 제한 |
| 4 | `04-purchase-management-inspection.png` | 구매관리 검수 CTA와 상태/권한 조건 |
| 5 | `05-warehouse-transfer-number-contract.png` | 재고이동 번호 `YYYY/MM/DD-N`, `T-`/`TR-` 금지 |
| 6 | `06-arologis-dispatch-menu.png` | Samhan Public 배차/아로로지스 실배차 메뉴 연결 |
| 7 | `07-admin-origin-route-guards.png` | 시트/발송금지/단톡방/지역/알리고 운영 route guard |
| 8 | `08-region-readonly-vs-manager.png` | DISPATCH 지역 조회 전용, MANAGER/MASTER 관리 가능 |
| 9 | `09-dispatch-role-user-admin.png` | `DISPATCH` role 사용자 관리/공통 enum 반영 |
| 10 | `10-route-contract-matrix.png` | 라우터 level guard와 메뉴 노출 계약 |
| 11 | `11-legacy-gas-notion-data-migration.png` | legacy GAS PR 대조 + Notion CSV row count + Google Sheet 원본 대조 |
| 12 | `12-verification-matrix.png` | SP-04 테스트/캡처/문서/Google Sheets 검증 matrix |

모든 캡처는 PR 본문에 raw URL 형태로 인라인 첨부한다.
