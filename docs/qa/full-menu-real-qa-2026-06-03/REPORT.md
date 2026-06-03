# 전체 메뉴 실사용자 QA 리포트 (2026-06-03)

- 브랜치: `codex/pr-339-full-menu-reqa`
- 대상: `http://127.0.0.1:5179` + local Docker Desktop backend
- 산출 경로: `docs/qa/full-menu-real-qa-2026-06-03`
- 계정: `dev_master` / 비밀번호는 리포트와 스크립트에 저장하지 않음
- 메뉴 캡처: 85개
- 스크린샷: 107장
- 전표 플로우: PASS 6 / FAIL 2
- 중요 브라우저/HTTP 이벤트: 207건
- 반복 폰트 경고(별도 분류): 1242건

## 결론

매출/매입 운영 전표는 실제 UI에서 생성, 상세 조회, 수정, 삭제가 완료되었습니다. 단, 회계 매출/매입 전표 작성 화면은 날짜 변경 후 원천 전표 배분 라인을 불러오지 못해 날짜 변경에 따른 전표번호 변경 저장 검증이 막혔습니다.

## 전표 플로우

| Flow | 결과 | HTTP | 전표번호 | Screenshot | Error |
|---|---:|---:|---|---|---|
| sales:create | PASS | 201 | 2026/06/03-1 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/flow-sales-02-created-list.png |  |
| sales:edit | PASS | 200 | 2026/06/03-1 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/flow-sales-05-after-edit.png |  |
| sales:delete | PASS | 200 | 2026/06/03-1 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/flow-sales-07-after-delete.png |  |
| purchases:create | PASS | 201 | 2026/06/03-1 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/flow-purchases-02-created-list.png |  |
| purchases:edit | PASS | 200 | 2026/06/03-1 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/flow-purchases-05-after-edit.png |  |
| purchases:delete | PASS | 200 | 2026/06/03-1 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/flow-purchases-07-after-delete.png |  |
| sales-accounting:date-change | FAIL |  |  | docs/qa/full-menu-real-qa-2026-06-03/screenshots/flow-sales-accounting-01-date-default.png<br>docs/qa/full-menu-real-qa-2026-06-03/screenshots/flow-sales-accounting-02-date-changed.png |  |
| purchase-accounting:date-change | FAIL |  |  | docs/qa/full-menu-real-qa-2026-06-03/screenshots/flow-purchase-accounting-01-date-default.png<br>docs/qa/full-menu-real-qa-2026-06-03/screenshots/flow-purchase-accounting-02-date-changed.png |  |

## 발견 이슈

| # | 심각도 | 영역 | 메뉴 | 경로 | 내용 | Screenshot |
|---:|---|---|---|---|---|---|
| 1 | warning | menu | 알림 내역 | #/notifications | 404, 500 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-002-main-----notifications.png |
| 2 | error | menu | 배차 메뉴 | #/dispatch-board |  | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-009-main-----dispatch-board.png |
| 3 | warning | menu | 주문서 승인 | #/sales/order-approvals | 오류 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-012-main-----sales-order-approvals.png |
| 4 | warning | menu | 거래처 DC 설정 | #/sales/partner-dc-config | 404, 500 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-013-main--DC----sales-partner-dc-config.png |
| 5 | error | menu | 매출전표 | #/accounting/sales-slips | 불러오지 못했습니다 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-020-main-----accounting-sales-slips.png |
| 6 | error | menu | 매입전표 | #/accounting/purchase-slips | 불러오지 못했습니다 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-021-main-----accounting-purchase-slips.png |
| 7 | warning | menu | 계정과목 | #/accounting/accounts | 404, 500 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-022-main-----accounting-accounts.png |
| 8 | warning | menu | 분개장 | #/accounting/journals | 500 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-023-main-----accounting-journals.png |
| 9 | warning | menu | 세금계산서 | #/accounting/tax-invoices | 500 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-024-main-----accounting-tax-invoices.png |
| 10 | error | menu | 세금계산서 발행 묶음 | #/accounting/tax-invoices/batch |  | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-025-main-----accounting-tax-invoices-batch.png |
| 11 | error | menu | 수신 세금계산서 | #/accounting/tax-invoices/inbound |  | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-026-main-----accounting-tax-invoices-inbound.png |
| 12 | warning | menu | 부가세 신고서 | #/accounting/reports/vat | 500 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-031-main-----accounting-reports-vat.png |
| 13 | warning | menu | 미수금 (거래처별) | #/accounting/reports/partner-aging?type=RECEIVABLE | 404, 500 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-033-main-----accounting-reports-partner-aging-type-RECEIVABLE.png |
| 14 | warning | menu | 미지급금 (거래처별) | #/accounting/reports/partner-aging?type=PAYABLE | 404, 500 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-034-main-----accounting-reports-partner-aging-type-PAYABLE.png |
| 15 | warning | menu | 현금흐름표 | #/accounting/reports/cash-flow | 500 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-035-main-----accounting-reports-cash-flow.png |
| 16 | error | menu | 일계표 | #/accounting/reports/daily-summary | Error | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-037-main-----accounting-reports-daily-summary.png |
| 17 | error | menu | 거래명세서 일괄 | #/accounting/statement-batch | 500 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-040-main-----accounting-statement-batch.png |
| 18 | error | menu | 잔액 스냅샷 | #/accounting/admin/aging-snapshot | 500 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-050-main-----accounting-admin-aging-snapshot.png |
| 19 | error | menu | 가배차 분류 | #/arologis/pre-classify |  | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-056-main-----arologis-pre-classify.png |
| 20 | error | menu | 미배차 리스트 | #/arologis/unassigned | 불러오지 못했습니다 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-057-main-----arologis-unassigned.png |
| 21 | error | menu | 배차안내 SMS | #/arologis/dispatch-sms |  | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-058-main--SMS---arologis-dispatch-sms.png |
| 22 | error | menu | 배차지역 관리 | #/admin/regions |  | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-061-main-----admin-regions.png |
| 23 | error | menu | 자동 매칭 | #/arologis/admin/auto-dispatch |  | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-062-main-----arologis-admin-auto-dispatch.png |
| 24 | error | menu | 배차 관리 | #/arologis/admin/manual-dispatch | 불러오지 못했습니다 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-063-main-----arologis-admin-manual-dispatch.png |
| 25 | error | menu | 기사 배정 | #/arologis/admin/driver-assignment |  | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-064-main-----arologis-admin-driver-assignment.png |
| 26 | error | menu | DPS 입고 비교 | #/warehouse/dps-compare |  | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-067-main-DPS----warehouse-dps-compare.png |
| 27 | error | menu | 품목별 DPS 분석 | #/warehouse/dps-compare/by-product |  | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-068-main--DPS----warehouse-dps-compare-by-product.png |
| 28 | error | menu | 전표 수정 요청 | #/admin/slip-edit-requests | 불러오지 못했습니다 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-069-main-----admin-slip-edit-requests.png |
| 29 | error | menu | 사진 감사 | #/admin/photo-audit |  | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-070-main-----admin-photo-audit.png |
| 30 | error | menu | 인사/권한 조정 | #/admin/roles |  | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-080-admin-------admin-roles.png |
| 31 | warning | menu | 인사/단톡방 매핑 | #/admin/chat-rooms | 404, 500 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-082-admin-------admin-chat-rooms.png |
| 32 | warning | menu | 인사/거래처 DC 설정 | #/sales/partner-dc-config | 404, 500 | docs/qa/full-menu-real-qa-2026-06-03/screenshots/menu-083-admin----DC----sales-partner-dc-config.png |
| 33 | error | sales-accounting-date-change |  |  | 날짜 변경 후 배분 가능한 전표 라인이 로드되지 않아 DRAFT 저장 및 전표번호 변경 검증을 완료할 수 없습니다. | docs/qa/full-menu-real-qa-2026-06-03/screenshots/flow-sales-accounting-01-date-default.png<br>docs/qa/full-menu-real-qa-2026-06-03/screenshots/flow-sales-accounting-02-date-changed.png |
| 34 | error | purchase-accounting-date-change |  |  | 날짜 변경 후 배분 가능한 전표 라인이 로드되지 않아 DRAFT 저장 및 전표번호 변경 검증을 완료할 수 없습니다. | docs/qa/full-menu-real-qa-2026-06-03/screenshots/flow-purchase-accounting-01-date-default.png<br>docs/qa/full-menu-real-qa-2026-06-03/screenshots/flow-purchase-accounting-02-date-changed.png |

## 전체 메뉴 스크린샷

| # | Source | Menu | Href | Screenshot |
|---:|---|---|---|---|
| 1 | main | 대시보드 | `#/` | ![](screenshots/menu-001-main.png) |
| 2 | main | 알림 내역 | `#/notifications` | ![](screenshots/menu-002-main-----notifications.png) |
| 3 | main | 창고관리 | `#/warehouses` | ![](screenshots/menu-003-main-----warehouses.png) |
| 4 | main | 판매관리 | `#/sales` | ![](screenshots/menu-004-main-----sales.png) |
| 5 | main | 구매관리 | `#/purchases` | ![](screenshots/menu-005-main-----purchases.png) |
| 6 | main | 영수증 OCR | `#/purchases/receipt-ocr` | ![](screenshots/menu-006-main--OCR---purchases-receipt-ocr.png) |
| 7 | main | 재고이동 관리 | `#/transfers` | ![](screenshots/menu-007-main-----transfers.png) |
| 8 | main | 링크발송 | `#/sales/link-dispatch` | ![](screenshots/menu-008-main-----sales-link-dispatch.png) |
| 9 | main | 배차 메뉴 | `#/dispatch-board` | ![](screenshots/menu-009-main-----dispatch-board.png) |
| 10 | main | 견적서 관리 | `#/sales/estimates` | ![](screenshots/menu-010-main-----sales-estimates.png) |
| 11 | main | 주문서 관리 | `#/sales/partner-orders` | ![](screenshots/menu-011-main-----sales-partner-orders.png) |
| 12 | main | 주문서 승인 | `#/sales/order-approvals` | ![](screenshots/menu-012-main-----sales-order-approvals.png) |
| 13 | main | 거래처 DC 설정 | `#/sales/partner-dc-config` | ![](screenshots/menu-013-main--DC----sales-partner-dc-config.png) |
| 14 | main | 거래처 관리 | `#/admin/partners` | ![](screenshots/menu-014-main-----admin-partners.png) |
| 15 | main | 전표 정리 | `#/sales/slip-cleanup` | ![](screenshots/menu-015-main-----sales-slip-cleanup.png) |
| 16 | main | 매출 마감 | `#/sales/closing` | ![](screenshots/menu-016-main-----sales-closing.png) |
| 17 | main | 내일자 전표 이미지 | `#/sales/next-day-slip` | ![](screenshots/menu-017-main-----sales-next-day-slip.png) |
| 18 | main | vendor 발주 OCR | `#/sales/vendor-order-upload` | ![](screenshots/menu-018-main-vendor-OCR---sales-vendor-order-upload.png) |
| 19 | main | 발송금지 거래처 | `#/admin/blocked-partners` | ![](screenshots/menu-019-main-----admin-blocked-partners.png) |
| 20 | main | 매출전표 | `#/accounting/sales-slips` | ![](screenshots/menu-020-main-----accounting-sales-slips.png) |
| 21 | main | 매입전표 | `#/accounting/purchase-slips` | ![](screenshots/menu-021-main-----accounting-purchase-slips.png) |
| 22 | main | 계정과목 | `#/accounting/accounts` | ![](screenshots/menu-022-main-----accounting-accounts.png) |
| 23 | main | 분개장 | `#/accounting/journals` | ![](screenshots/menu-023-main-----accounting-journals.png) |
| 24 | main | 세금계산서 | `#/accounting/tax-invoices` | ![](screenshots/menu-024-main-----accounting-tax-invoices.png) |
| 25 | main | 세금계산서 발행 묶음 | `#/accounting/tax-invoices/batch` | ![](screenshots/menu-025-main-----accounting-tax-invoices-batch.png) |
| 26 | main | 수신 세금계산서 | `#/accounting/tax-invoices/inbound` | ![](screenshots/menu-026-main-----accounting-tax-invoices-inbound.png) |
| 27 | main | 시산표 | `#/accounting/balances` | ![](screenshots/menu-027-main-----accounting-balances.png) |
| 28 | main | 재무 보고서 | `#/accounting/reports` | ![](screenshots/menu-028-main-----accounting-reports.png) |
| 29 | main | 손익계산서 | `#/accounting/reports/income-statement` | ![](screenshots/menu-029-main-----accounting-reports-income-statement.png) |
| 30 | main | 재무상태표 | `#/accounting/reports/balance-sheet` | ![](screenshots/menu-030-main-----accounting-reports-balance-sheet.png) |
| 31 | main | 부가세 신고서 | `#/accounting/reports/vat` | ![](screenshots/menu-031-main-----accounting-reports-vat.png) |
| 32 | main | 법인세 신고서 | `#/accounting/reports/corporate-tax` | ![](screenshots/menu-032-main-----accounting-reports-corporate-tax.png) |
| 33 | main | 미수금 (거래처별) | `#/accounting/reports/partner-aging?type=RECEIVABLE` | ![](screenshots/menu-033-main-----accounting-reports-partner-aging-type-RECEIVABLE.png) |
| 34 | main | 미지급금 (거래처별) | `#/accounting/reports/partner-aging?type=PAYABLE` | ![](screenshots/menu-034-main-----accounting-reports-partner-aging-type-PAYABLE.png) |
| 35 | main | 현금흐름표 | `#/accounting/reports/cash-flow` | ![](screenshots/menu-035-main-----accounting-reports-cash-flow.png) |
| 36 | main | 자본변동표 | `#/accounting/reports/equity-changes` | ![](screenshots/menu-036-main-----accounting-reports-equity-changes.png) |
| 37 | main | 일계표 | `#/accounting/reports/daily-summary` | ![](screenshots/menu-037-main-----accounting-reports-daily-summary.png) |
| 38 | main | 월계표 | `#/accounting/reports/monthly-summary` | ![](screenshots/menu-038-main-----accounting-reports-monthly-summary.png) |
| 39 | main | 월말 마감 | `#/accounting/period-close` | ![](screenshots/menu-039-main-----accounting-period-close.png) |
| 40 | main | 거래명세서 일괄 | `#/accounting/statement-batch` | ![](screenshots/menu-040-main-----accounting-statement-batch.png) |
| 41 | main | 거래처 원장 | `#/accounting/partner-ledger` | ![](screenshots/menu-041-main-----accounting-partner-ledger.png) |
| 42 | main | 홈택스 일괄 양식 | `#/accounting/hometax-export` | ![](screenshots/menu-042-main-----accounting-hometax-export.png) |
| 43 | main | 사업자 양식 | `#/accounting/supplier-profiles` | ![](screenshots/menu-043-main-----accounting-supplier-profiles.png) |
| 44 | main | 입금 매칭 | `#/accounting/deposit-match` | ![](screenshots/menu-044-main-----accounting-deposit-match.png) |
| 45 | main | 일마감 | `#/accounting/daily-closing` | ![](screenshots/menu-045-main-----accounting-daily-closing.png) |
| 46 | main | 원장 | `#/accounting/ledgers` | ![](screenshots/menu-046-main-----accounting-ledgers.png) |
| 47 | main | 지출 트랜잭션 | `#/accounting/admin/cash-disbursements` | ![](screenshots/menu-047-main-----accounting-admin-cash-disbursements.png) |
| 48 | main | 입금 트랜잭션 | `#/accounting/admin/cash-receipts` | ![](screenshots/menu-048-main-----accounting-admin-cash-receipts.png) |
| 49 | main | 주문서 관리 | `#/accounting/admin/orders` | ![](screenshots/menu-049-main-----accounting-admin-orders.png) |
| 50 | main | 잔액 스냅샷 | `#/accounting/admin/aging-snapshot` | ![](screenshots/menu-050-main-----accounting-admin-aging-snapshot.png) |
| 51 | main | 매출 원장 대조 | `#/accounting/admin/ledger/sales` | ![](screenshots/menu-051-main-----accounting-admin-ledger-sales.png) |
| 52 | main | 매입 원장 대조 | `#/accounting/admin/ledger/purchase` | ![](screenshots/menu-052-main-----accounting-admin-ledger-purchase.png) |
| 53 | main | 운영 대시보드 | `#/accounting/admin/migration-ops` | ![](screenshots/menu-053-main-----accounting-admin-migration-ops.png) |
| 54 | main | 회계 수정 요청 | `#/admin/accounting-edit-requests` | ![](screenshots/menu-054-main-----admin-accounting-edit-requests.png) |
| 55 | main | 수동 배차 | `#/arologis/manual` | ![](screenshots/menu-055-main-----arologis-manual.png) |
| 56 | main | 가배차 분류 | `#/arologis/pre-classify` | ![](screenshots/menu-056-main-----arologis-pre-classify.png) |
| 57 | main | 미배차 리스트 | `#/arologis/unassigned` | ![](screenshots/menu-057-main-----arologis-unassigned.png) |
| 58 | main | 배차안내 SMS | `#/arologis/dispatch-sms` | ![](screenshots/menu-058-main--SMS---arologis-dispatch-sms.png) |
| 59 | main | SMS 발송 이력 | `#/arologis/dispatch-sms/send-audit` | ![](screenshots/menu-059-main-SMS----arologis-dispatch-sms-send-audit.png) |
| 60 | main | 실배차 비교 | `#/arologis/dispatch-reconcile` | ![](screenshots/menu-060-main-----arologis-dispatch-reconcile.png) |
| 61 | main | 배차지역 관리 | `#/admin/regions` | ![](screenshots/menu-061-main-----admin-regions.png) |
| 62 | main | 자동 매칭 | `#/arologis/admin/auto-dispatch` | ![](screenshots/menu-062-main-----arologis-admin-auto-dispatch.png) |
| 63 | main | 배차 관리 | `#/arologis/admin/manual-dispatch` | ![](screenshots/menu-063-main-----arologis-admin-manual-dispatch.png) |
| 64 | main | 기사 배정 | `#/arologis/admin/driver-assignment` | ![](screenshots/menu-064-main-----arologis-admin-driver-assignment.png) |
| 65 | main | 입고 검수 | `#/warehouse/inbound-inspections` | ![](screenshots/menu-065-main-----warehouse-inbound-inspections.png) |
| 66 | main | 재고 실사 | `#/warehouse/audit` | ![](screenshots/menu-066-main-----warehouse-audit.png) |
| 67 | main | DPS 입고 비교 | `#/warehouse/dps-compare` | ![](screenshots/menu-067-main-DPS----warehouse-dps-compare.png) |
| 68 | main | 품목별 DPS 분석 | `#/warehouse/dps-compare/by-product` | ![](screenshots/menu-068-main--DPS----warehouse-dps-compare-by-product.png) |
| 69 | main | 전표 수정 요청 | `#/admin/slip-edit-requests` | ![](screenshots/menu-069-main-----admin-slip-edit-requests.png) |
| 70 | main | 사진 감사 | `#/admin/photo-audit` | ![](screenshots/menu-070-main-----admin-photo-audit.png) |
| 71 | main | 재고 현황 | `#/inventory/stock-balance` | ![](screenshots/menu-071-main-----inventory-stock-balance.png) |
| 72 | main | 안전재고 알림 | `#/inventory/safety-stock-alerts` | ![](screenshots/menu-072-main-----inventory-safety-stock-alerts.png) |
| 73 | main | 보상 실패 복구 | `#/inventory/compensation-failures` | ![](screenshots/menu-073-main-----inventory-compensation-failures.png) |
| 74 | main | 알리고 주소록 | `#/admin/aligo-address-book` | ![](screenshots/menu-074-main-----admin-aligo-address-book.png) |
| 75 | main | 시트 동기화 | `#/admin/sheet-sync` | ![](screenshots/menu-075-main-----admin-sheet-sync.png) |
| 76 | main | 인사 관리 | `#/admin/users` | ![](screenshots/menu-076-main-----admin-users.png) |
| 77 | main | 권한 매트릭스 | `#/admin/permission-matrix` | ![](screenshots/menu-077-main-----admin-permission-matrix.png) |
| 78 | main | 권한 일괄 적용 | `#/admin/permission-matrix/bulk` | ![](screenshots/menu-078-main-----admin-permission-matrix-bulk.png) |
| 79 | admin | 인사/신규 인사 | `#/admin/users/new` | ![](screenshots/menu-079-admin-------admin-users-new.png) |
| 80 | admin | 인사/권한 조정 | `#/admin/roles` | ![](screenshots/menu-080-admin-------admin-roles.png) |
| 81 | admin | 인사/부서 | `#/admin/departments` | ![](screenshots/menu-081-admin-------admin-departments.png) |
| 82 | admin | 인사/단톡방 매핑 | `#/admin/chat-rooms` | ![](screenshots/menu-082-admin-------admin-chat-rooms.png) |
| 83 | admin | 인사/거래처 DC 설정 | `#/sales/partner-dc-config` | ![](screenshots/menu-083-admin----DC----sales-partner-dc-config.png) |
| 84 | admin | 인사/거래처 관리 | `#/admin/partners` | ![](screenshots/menu-084-admin-------admin-partners.png) |
| 85 | admin | 인사/창고관리 | `#/admin/warehouses` | ![](screenshots/menu-085-admin-------admin-warehouses.png) |

## 중요 이벤트

| # | Scope | Type | Status | Method | URL/Text |
|---:|---|---|---:|---|---|
| 1 | menu:009:배차 메뉴 | http | 404 | POST | http://localhost:8080/admin/dispatch-tasks |
| 2 | menu:009:배차 메뉴 | console:error |  |  | Failed to load resource: the server responded with a status of 404 (Not Found) |
| 3 | menu:009:배차 메뉴 | http | 404 | POST | http://localhost:8080/admin/dispatch-tasks |
| 4 | menu:009:배차 메뉴 | console:error |  |  | Failed to load resource: the server responded with a status of 404 (Not Found) |
| 5 | menu:009:배차 메뉴 | http | 404 | GET | http://localhost:8080/admin/dispatch-board/undispatched-slips?from=2026-06-02&to=2026-06-04&statuses=UNDISPATCHED&page=0&size=50 |
| 6 | menu:009:배차 메뉴 | console:error |  |  | Failed to load resource: the server responded with a status of 404 (Not Found) |
| 7 | menu:020:매출전표 | http | 404 | GET | http://localhost:8080/admin/sales-slips?from=2026-06-01&to=2026-06-03 |
| 8 | menu:020:매출전표 | console:error |  |  | Failed to load resource: the server responded with a status of 404 (Not Found) |
| 9 | menu:020:매출전표 | http | 404 | GET | http://localhost:8080/admin/sales-slips?from=2026-06-01&to=2026-06-03 |
| 10 | menu:020:매출전표 | console:error |  |  | Failed to load resource: the server responded with a status of 404 (Not Found) |
| 11 | menu:021:매입전표 | http | 404 | GET | http://localhost:8080/admin/purchase-slips?from=2026-06-01&to=2026-06-03 |
| 12 | menu:021:매입전표 | console:error |  |  | Failed to load resource: the server responded with a status of 404 (Not Found) |
| 13 | menu:021:매입전표 | http | 404 | GET | http://localhost:8080/admin/purchase-slips?from=2026-06-01&to=2026-06-03 |
| 14 | menu:021:매입전표 | console:error |  |  | Failed to load resource: the server responded with a status of 404 (Not Found) |
| 15 | menu:025:세금계산서 발행 묶음 | http | 404 | GET | http://localhost:8080/admin/tax-invoices/batch-from-sales-slips/candidates?from=2026-06-01&to=2026-06-03 |
| 16 | menu:025:세금계산서 발행 묶음 | console:error |  |  | Failed to load resource: the server responded with a status of 404 (Not Found) |
| 17 | menu:025:세금계산서 발행 묶음 | http | 404 | GET | http://localhost:8080/admin/tax-invoices/batch-from-sales-slips/candidates?from=2026-06-01&to=2026-06-03 |
| 18 | menu:025:세금계산서 발행 묶음 | console:error |  |  | Failed to load resource: the server responded with a status of 404 (Not Found) |
| 19 | menu:026:수신 세금계산서 | http | 404 | GET | http://localhost:8080/admin/tax-invoices/inbound?from=2026-06-01&to=2026-06-03 |
| 20 | menu:026:수신 세금계산서 | console:error |  |  | Failed to load resource: the server responded with a status of 404 (Not Found) |
| 21 | menu:026:수신 세금계산서 | http | 404 | GET | http://localhost:8080/admin/purchase-slips?from=2026-06-01&to=2026-06-03&status=POSTED |
| 22 | menu:026:수신 세금계산서 | console:error |  |  | Failed to load resource: the server responded with a status of 404 (Not Found) |
| 23 | menu:026:수신 세금계산서 | http | 404 | GET | http://localhost:8080/admin/purchase-slips?from=2026-06-01&to=2026-06-03&status=POSTED |
| 24 | menu:026:수신 세금계산서 | console:error |  |  | Failed to load resource: the server responded with a status of 404 (Not Found) |
| 25 | menu:026:수신 세금계산서 | http | 404 | GET | http://localhost:8080/admin/tax-invoices/inbound?from=2026-06-01&to=2026-06-03 |
| 26 | menu:026:수신 세금계산서 | console:error |  |  | Failed to load resource: the server responded with a status of 404 (Not Found) |
| 27 | menu:037:일계표 | pageerror |  |  | items is not iterable |
| 28 | menu:037:일계표 | console:error |  |  | Error handled by React Router default ErrorBoundary: TypeError: items is not iterable
    at sortedAccounts (http://127.0.0.1:5179/routes/DailySummaryPage.tsx:20:14)
    at DailySummaryPage (http://127.0.0.1:5179/routes/DailySummaryPage.tsx |
| 29 | menu:037:일계표 | console:error |  |  | Error handled by React Router default ErrorBoundary: TypeError: items is not iterable
    at sortedAccounts (http://127.0.0.1:5179/routes/DailySummaryPage.tsx:20:14)
    at DailySummaryPage (http://127.0.0.1:5179/routes/DailySummaryPage.tsx |
| 30 | menu:037:일계표 | pageerror |  |  | items is not iterable |
| 31 | menu:037:일계표 | console:error |  |  | Error handled by React Router default ErrorBoundary: TypeError: items is not iterable
    at sortedAccounts (http://127.0.0.1:5179/routes/DailySummaryPage.tsx:20:14)
    at DailySummaryPage (http://127.0.0.1:5179/routes/DailySummaryPage.tsx |
| 32 | menu:037:일계표 | console:error |  |  | Error handled by React Router default ErrorBoundary: TypeError: items is not iterable
    at sortedAccounts (http://127.0.0.1:5179/routes/DailySummaryPage.tsx:20:14)
    at DailySummaryPage (http://127.0.0.1:5179/routes/DailySummaryPage.tsx |
| 33 | menu:037:일계표 | console:error |  |  | The above error occurred in the <DailySummaryPage> component:

    at DailySummaryPage (http://127.0.0.1:5179/routes/DailySummaryPage.tsx:94:27)
    at PermissionGuard (http://127.0.0.1:5179/components/PermissionGuard.tsx:6:3)
    at RoleGu |
| 34 | menu:037:일계표 | console:error |  |  | React Router caught the following error during render TypeError: items is not iterable
    at sortedAccounts (http://127.0.0.1:5179/routes/DailySummaryPage.tsx:20:14)
    at DailySummaryPage (http://127.0.0.1:5179/routes/DailySummaryPage.ts |
| 35 | menu:040:거래명세서 일괄 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 36 | menu:040:거래명세서 일괄 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 37 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 38 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 39 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 40 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 41 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 42 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 43 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 44 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 45 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 46 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 47 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 48 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 49 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 50 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 51 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 52 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 53 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 54 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 55 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 56 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 57 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 58 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 59 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 60 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 61 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 62 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 63 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 64 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 65 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 66 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 67 | menu:050:잔액 스냅샷 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
| 68 | menu:056:가배차 분류 | console:error |  |  | Access to XMLHttpRequest at 'http://localhost:8080/admin/arologis/dispatches/pre-classify?from=2026-06-03&to=2026-06-03' from origin 'http://127.0.0.1:5179' has been blocked by CORS policy: The 'Access-Control-Allow-Origin' header contains  |
| 69 | menu:056:가배차 분류 | console:error |  |  | Failed to load resource: net::ERR_FAILED |
| 70 | menu:056:가배차 분류 | console:error |  |  | Access to XMLHttpRequest at 'http://localhost:8080/admin/arologis/dispatches/pre-classify?from=2026-06-03&to=2026-06-03' from origin 'http://127.0.0.1:5179' has been blocked by CORS policy: The 'Access-Control-Allow-Origin' header contains  |
| 71 | menu:056:가배차 분류 | console:error |  |  | Failed to load resource: net::ERR_FAILED |
| 72 | menu:057:미배차 리스트 | console:error |  |  | Access to XMLHttpRequest at 'http://localhost:8080/admin/arologis/dispatches/unassigned?date=2026-06-03' from origin 'http://127.0.0.1:5179' has been blocked by CORS policy: The 'Access-Control-Allow-Origin' header contains multiple values  |
| 73 | menu:057:미배차 리스트 | console:error |  |  | Failed to load resource: net::ERR_FAILED |
| 74 | menu:057:미배차 리스트 | console:error |  |  | Access to XMLHttpRequest at 'http://localhost:8080/admin/arologis/dispatches/unassigned?date=2026-06-03' from origin 'http://127.0.0.1:5179' has been blocked by CORS policy: The 'Access-Control-Allow-Origin' header contains multiple values  |
| 75 | menu:057:미배차 리스트 | console:error |  |  | Failed to load resource: net::ERR_FAILED |
| 76 | menu:058:배차안내 SMS | http | 404 | GET | http://localhost:8080/admin/notifications/dispatch-sms/history/latest?programType=DISPATCH_SMS |
| 77 | menu:058:배차안내 SMS | console:error |  |  | Failed to load resource: the server responded with a status of 404 (Not Found) |
| 78 | menu:058:배차안내 SMS | http | 404 | GET | http://localhost:8080/admin/notifications/dispatch-sms/history/latest?programType=DISPATCH_SMS |
| 79 | menu:058:배차안내 SMS | console:error |  |  | Failed to load resource: the server responded with a status of 404 (Not Found) |
| 80 | menu:061:배차지역 관리 | console:error |  |  | Access to XMLHttpRequest at 'http://localhost:8080/admin/arologis/regions' from origin 'http://127.0.0.1:5179' has been blocked by CORS policy: The 'Access-Control-Allow-Origin' header contains multiple values 'http://127.0.0.1:5179, http:/ |
| 81 | menu:061:배차지역 관리 | console:error |  |  | Failed to load resource: net::ERR_FAILED |
| 82 | menu:061:배차지역 관리 | console:error |  |  | Access to XMLHttpRequest at 'http://localhost:8080/admin/arologis/regions' from origin 'http://127.0.0.1:5179' has been blocked by CORS policy: The 'Access-Control-Allow-Origin' header contains multiple values 'http://127.0.0.1:5179, http:/ |
| 83 | menu:061:배차지역 관리 | console:error |  |  | Failed to load resource: net::ERR_FAILED |
| 84 | menu:062:자동 매칭 | console:error |  |  | Access to XMLHttpRequest at 'http://localhost:8080/api/v1/arologis/admin/dispatches?fromDate=2026-06-03&toDate=2026-06-03&page=0&size=50' from origin 'http://127.0.0.1:5179' has been blocked by CORS policy: The 'Access-Control-Allow-Origin' |
| 85 | menu:062:자동 매칭 | console:error |  |  | Failed to load resource: net::ERR_FAILED |
| 86 | menu:062:자동 매칭 | console:error |  |  | Access to XMLHttpRequest at 'http://localhost:8080/admin/arologis/dispatches/unassigned?date=2026-06-03' from origin 'http://127.0.0.1:5179' has been blocked by CORS policy: The 'Access-Control-Allow-Origin' header contains multiple values  |
| 87 | menu:062:자동 매칭 | console:error |  |  | Failed to load resource: net::ERR_FAILED |
| 88 | menu:062:자동 매칭 | console:error |  |  | Access to XMLHttpRequest at 'http://localhost:8080/api/v1/arologis/admin/dispatches?fromDate=2026-06-03&toDate=2026-06-03&page=0&size=50' from origin 'http://127.0.0.1:5179' has been blocked by CORS policy: The 'Access-Control-Allow-Origin' |
| 89 | menu:062:자동 매칭 | console:error |  |  | Failed to load resource: net::ERR_FAILED |
| 90 | menu:062:자동 매칭 | console:error |  |  | Access to XMLHttpRequest at 'http://localhost:8080/admin/arologis/dispatches/unassigned?date=2026-06-03' from origin 'http://127.0.0.1:5179' has been blocked by CORS policy: The 'Access-Control-Allow-Origin' header contains multiple values  |
| 91 | menu:062:자동 매칭 | console:error |  |  | Failed to load resource: net::ERR_FAILED |
| 92 | menu:063:배차 관리 | console:error |  |  | Access to XMLHttpRequest at 'http://localhost:8080/api/v1/arologis/admin/dispatches?fromDate=2026-06-03&toDate=2026-06-03&page=0&size=50' from origin 'http://127.0.0.1:5179' has been blocked by CORS policy: The 'Access-Control-Allow-Origin' |
| 93 | menu:063:배차 관리 | console:error |  |  | Failed to load resource: net::ERR_FAILED |
| 94 | menu:063:배차 관리 | console:error |  |  | Access to XMLHttpRequest at 'http://localhost:8080/api/v1/arologis/admin/dispatches?fromDate=2026-06-03&toDate=2026-06-03&page=0&size=50' from origin 'http://127.0.0.1:5179' has been blocked by CORS policy: The 'Access-Control-Allow-Origin' |
| 95 | menu:063:배차 관리 | console:error |  |  | Failed to load resource: net::ERR_FAILED |
| 96 | menu:064:기사 배정 | console:error |  |  | Access to XMLHttpRequest at 'http://localhost:8080/api/v1/arologis/admin/dispatches?fromDate=2026-06-03&toDate=2026-06-03&page=0&size=50' from origin 'http://127.0.0.1:5179' has been blocked by CORS policy: The 'Access-Control-Allow-Origin' |
| 97 | menu:064:기사 배정 | console:error |  |  | Failed to load resource: net::ERR_FAILED |
| 98 | menu:064:기사 배정 | console:error |  |  | Access to XMLHttpRequest at 'http://localhost:8080/api/v1/arologis/admin/drivers/available?date=2026-06-03' from origin 'http://127.0.0.1:5179' has been blocked by CORS policy: The 'Access-Control-Allow-Origin' header contains multiple valu |
| 99 | menu:064:기사 배정 | console:error |  |  | Failed to load resource: net::ERR_FAILED |
| 100 | menu:064:기사 배정 | console:error |  |  | Access to XMLHttpRequest at 'http://localhost:8080/api/v1/arologis/admin/dispatches?fromDate=2026-06-03&toDate=2026-06-03&page=0&size=50' from origin 'http://127.0.0.1:5179' has been blocked by CORS policy: The 'Access-Control-Allow-Origin' |
| 101 | menu:064:기사 배정 | console:error |  |  | Failed to load resource: net::ERR_FAILED |
| 102 | menu:064:기사 배정 | console:error |  |  | Access to XMLHttpRequest at 'http://localhost:8080/api/v1/arologis/admin/drivers/available?date=2026-06-03' from origin 'http://127.0.0.1:5179' has been blocked by CORS policy: The 'Access-Control-Allow-Origin' header contains multiple valu |
| 103 | menu:064:기사 배정 | console:error |  |  | Failed to load resource: net::ERR_FAILED |
| 104 | menu:067:DPS 입고 비교 | http | 404 | GET | http://localhost:8080/warehouse/audit/dps-history/latest?programType=DPS_COMPARE |
| 105 | menu:067:DPS 입고 비교 | console:error |  |  | Failed to load resource: the server responded with a status of 404 (Not Found) |
| 106 | menu:067:DPS 입고 비교 | http | 404 | GET | http://localhost:8080/warehouse/audit/dps-history/latest?programType=DPS_COMPARE |
| 107 | menu:067:DPS 입고 비교 | console:error |  |  | Failed to load resource: the server responded with a status of 404 (Not Found) |
| 108 | menu:068:품목별 DPS 분석 | http | 404 | GET | http://localhost:8080/warehouse/audit/dps-history/latest?programType=DPS_BY_PRODUCT |
| 109 | menu:068:품목별 DPS 분석 | console:error |  |  | Failed to load resource: the server responded with a status of 404 (Not Found) |
| 110 | menu:068:품목별 DPS 분석 | http | 404 | GET | http://localhost:8080/warehouse/audit/dps-history/latest?programType=DPS_BY_PRODUCT |
| 111 | menu:068:품목별 DPS 분석 | console:error |  |  | Failed to load resource: the server responded with a status of 404 (Not Found) |
| 112 | menu:069:전표 수정 요청 | http | 400 | GET | http://localhost:8080/api/v1/slips/edit-requests?status=PENDING |
| 113 | menu:069:전표 수정 요청 | console:error |  |  | Failed to load resource: the server responded with a status of 400 (Bad Request) |
| 114 | menu:069:전표 수정 요청 | http | 400 | GET | http://localhost:8080/api/v1/slips/edit-requests?status=PENDING |
| 115 | menu:069:전표 수정 요청 | console:error |  |  | Failed to load resource: the server responded with a status of 400 (Bad Request) |
| 116 | menu:070:사진 감사 | http | 500 | GET | http://localhost:8080/api/v1/slips/admin/photo-audit?page=0&size=50 |
| 117 | menu:070:사진 감사 | console:error |  |  | Failed to load resource: the server responded with a status of 500 (Internal Server Error) |
| 118 | menu:070:사진 감사 | http | 500 | GET | http://localhost:8080/api/v1/slips/admin/photo-audit?page=0&size=50 |
| 119 | menu:070:사진 감사 | console:error |  |  | Failed to load resource: the server responded with a status of 500 (Internal Server Error) |
| 120 | menu:080:인사/권한 조정 | console:error |  |  | Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and |
