## QA 범위

- local Docker Desktop backend + desktop renderer(`http://127.0.0.1:5173`) 실사용자 QA
- 마스터 계정 `dev_master` 로그인
- 메인/인사/AdminLayout 메뉴 84개 전체 캡처
- 운영 전표 매출/매입 생성 → 상세 → 수정 → 삭제 플로우 검증
- 회계 전표 날짜 변경 화면 검증

## 결과 요약

- 운영 매출/매입 전표 생성·수정·삭제: PASS
- 회계 매출/매입 전표 날짜 변경 후 저장: FAIL (원천 전표 배분 라인 로드 실패)
- 상세 리포트: [docs/qa/full-menu-real-qa-2026-06-01/REPORT.md](docs/qa/full-menu-real-qa-2026-06-01/REPORT.md)

## 대표 스크린샷

![대시보드](docs/qa/full-menu-real-qa-2026-06-01/screenshots/01-dashboard-after-login.png)
![매출 전표 생성](docs/qa/full-menu-real-qa-2026-06-01/screenshots/flow-sales-02-created-list.png)
![매입 전표 삭제](docs/qa/full-menu-real-qa-2026-06-01/screenshots/flow-purchases-07-after-delete.png)
![회계 전표 날짜 변경 실패](docs/qa/full-menu-real-qa-2026-06-01/screenshots/flow-sales-accounting-02-date-changed.png)

<details>
<summary>전체 메뉴 스크린샷 목록</summary>

- 1. 대시보드 `#/`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-001-main.png)
- 2. 알림 내역 `#/notifications`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-002-main-----notifications.png)
- 3. 창고관리 `#/warehouses`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-003-main-----warehouses.png)
- 4. 판매관리 `#/sales`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-004-main-----sales.png)
- 5. 구매관리 `#/purchases`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-005-main-----purchases.png)
- 6. 영수증 OCR `#/purchases/receipt-ocr`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-006-main--OCR---purchases-receipt-ocr.png)
- 7. 재고이동 관리 `#/transfers`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-007-main-----transfers.png)
- 8. 링크발송 `#/sales/link-dispatch`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-008-main-----sales-link-dispatch.png)
- 9. 배차 메뉴 `#/dispatch-board`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-009-main-----dispatch-board.png)
- 10. 견적서 관리 `#/sales/estimates`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-010-main-----sales-estimates.png)
- 11. 주문서 관리 `#/sales/partner-orders`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-011-main-----sales-partner-orders.png)
- 12. 주문서 승인 `#/sales/order-approvals`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-012-main-----sales-order-approvals.png)
- 13. 거래처 DC 설정 `#/sales/partner-dc-config`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-013-main--DC----sales-partner-dc-config.png)
- 14. 거래처 관리 `#/admin/partners`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-014-main-----admin-partners.png)
- 15. 전표 정리 `#/sales/slip-cleanup`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-015-main-----sales-slip-cleanup.png)
- 16. 매출 마감 `#/sales/closing`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-016-main-----sales-closing.png)
- 17. 내일자 전표 이미지 `#/sales/next-day-slip`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-017-main-----sales-next-day-slip.png)
- 18. vendor 발주 OCR `#/sales/vendor-order-upload`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-018-main-vendor-OCR---sales-vendor-order-upload.png)
- 19. 발송금지 거래처 `#/admin/blocked-partners`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-019-main-----admin-blocked-partners.png)
- 20. 매출전표 `#/accounting/sales-slips`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-020-main-----accounting-sales-slips.png)
- 21. 매입전표 `#/accounting/purchase-slips`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-021-main-----accounting-purchase-slips.png)
- 22. 계정과목 `#/accounting/accounts`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-022-main-----accounting-accounts.png)
- 23. 분개장 `#/accounting/journals`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-023-main-----accounting-journals.png)
- 24. 세금계산서 `#/accounting/tax-invoices`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-024-main-----accounting-tax-invoices.png)
- 25. 세금계산서 발행 묶음 `#/accounting/tax-invoices/batch`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-025-main-----accounting-tax-invoices-batch.png)
- 26. 수신 세금계산서 `#/accounting/tax-invoices/inbound`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-026-main-----accounting-tax-invoices-inbound.png)
- 27. 시산표 `#/accounting/balances`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-027-main-----accounting-balances.png)
- 28. 재무 보고서 `#/accounting/reports`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-028-main-----accounting-reports.png)
- 29. 손익계산서 `#/accounting/reports/income-statement`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-029-main-----accounting-reports-income-statement.png)
- 30. 재무상태표 `#/accounting/reports/balance-sheet`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-030-main-----accounting-reports-balance-sheet.png)
- 31. 부가세 신고서 `#/accounting/reports/vat`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-031-main-----accounting-reports-vat.png)
- 32. 법인세 신고서 `#/accounting/reports/corporate-tax`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-032-main-----accounting-reports-corporate-tax.png)
- 33. 미수금 (거래처별) `#/accounting/reports/partner-aging?type=RECEIVABLE`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-033-main-----accounting-reports-partner-aging-type-RECEIVABLE.png)
- 34. 미지급금 (거래처별) `#/accounting/reports/partner-aging?type=PAYABLE`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-034-main-----accounting-reports-partner-aging-type-PAYABLE.png)
- 35. 현금흐름표 `#/accounting/reports/cash-flow`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-035-main-----accounting-reports-cash-flow.png)
- 36. 자본변동표 `#/accounting/reports/equity-changes`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-036-main-----accounting-reports-equity-changes.png)
- 37. 일계표 `#/accounting/reports/daily-summary`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-037-main-----accounting-reports-daily-summary.png)
- 38. 월계표 `#/accounting/reports/monthly-summary`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-038-main-----accounting-reports-monthly-summary.png)
- 39. 월말 마감 `#/accounting/period-close`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-039-main-----accounting-period-close.png)
- 40. 거래명세서 일괄 `#/accounting/statement-batch`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-040-main-----accounting-statement-batch.png)
- 41. 거래처 원장 `#/accounting/partner-ledger`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-041-main-----accounting-partner-ledger.png)
- 42. 홈택스 일괄 양식 `#/accounting/hometax-export`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-042-main-----accounting-hometax-export.png)
- 43. 사업자 양식 `#/accounting/supplier-profiles`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-043-main-----accounting-supplier-profiles.png)
- 44. 입금 매칭 `#/accounting/deposit-match`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-044-main-----accounting-deposit-match.png)
- 45. 일마감 `#/accounting/daily-closing`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-045-main-----accounting-daily-closing.png)
- 46. 원장 `#/accounting/ledgers`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-046-main-----accounting-ledgers.png)
- 47. 지출 트랜잭션 `#/accounting/admin/cash-disbursements`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-047-main-----accounting-admin-cash-disbursements.png)
- 48. 입금 트랜잭션 `#/accounting/admin/cash-receipts`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-048-main-----accounting-admin-cash-receipts.png)
- 49. 주문서 관리 `#/accounting/admin/orders`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-049-main-----accounting-admin-orders.png)
- 50. 잔액 스냅샷 `#/accounting/admin/aging-snapshot`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-050-main-----accounting-admin-aging-snapshot.png)
- 51. 매출 원장 대조 `#/accounting/admin/ledger/sales`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-051-main-----accounting-admin-ledger-sales.png)
- 52. 매입 원장 대조 `#/accounting/admin/ledger/purchase`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-052-main-----accounting-admin-ledger-purchase.png)
- 53. 운영 대시보드 `#/accounting/admin/migration-ops`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-053-main-----accounting-admin-migration-ops.png)
- 54. 회계 수정 요청 `#/admin/accounting-edit-requests`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-054-main-----admin-accounting-edit-requests.png)
- 55. 수동 배차 `#/arologis/manual`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-055-main-----arologis-manual.png)
- 56. 가배차 분류 `#/arologis/pre-classify`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-056-main-----arologis-pre-classify.png)
- 57. 미배차 리스트 `#/arologis/unassigned`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-057-main-----arologis-unassigned.png)
- 58. 배차안내 SMS `#/arologis/dispatch-sms`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-058-main--SMS---arologis-dispatch-sms.png)
- 59. SMS 발송 이력 `#/arologis/dispatch-sms/send-audit`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-059-main-SMS----arologis-dispatch-sms-send-audit.png)
- 60. 실배차 비교 `#/arologis/dispatch-reconcile`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-060-main-----arologis-dispatch-reconcile.png)
- 61. 배차지역 관리 `#/admin/regions`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-061-main-----admin-regions.png)
- 62. 자동 매칭 `#/arologis/admin/auto-dispatch`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-062-main-----arologis-admin-auto-dispatch.png)
- 63. 배차 관리 `#/arologis/admin/manual-dispatch`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-063-main-----arologis-admin-manual-dispatch.png)
- 64. 기사 배정 `#/arologis/admin/driver-assignment`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-064-main-----arologis-admin-driver-assignment.png)
- 65. 입고 검수 `#/warehouse/inbound-inspections`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-065-main-----warehouse-inbound-inspections.png)
- 66. 재고 실사 `#/warehouse/audit`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-066-main-----warehouse-audit.png)
- 67. DPS 입고 비교 `#/warehouse/dps-compare`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-067-main-DPS----warehouse-dps-compare.png)
- 68. 품목별 DPS 분석 `#/warehouse/dps-compare/by-product`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-068-main--DPS----warehouse-dps-compare-by-product.png)
- 69. 전표 수정 요청 `#/admin/slip-edit-requests`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-069-main-----admin-slip-edit-requests.png)
- 70. 사진 감사 `#/admin/photo-audit`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-070-main-----admin-photo-audit.png)
- 71. 재고 현황 `#/inventory/stock-balance`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-071-main-----inventory-stock-balance.png)
- 72. 안전재고 알림 `#/inventory/safety-stock-alerts`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-072-main-----inventory-safety-stock-alerts.png)
- 73. 알리고 주소록 `#/admin/aligo-address-book`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-073-main-----admin-aligo-address-book.png)
- 74. 시트 동기화 `#/admin/sheet-sync`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-074-main-----admin-sheet-sync.png)
- 75. 인사 관리 `#/admin/users`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-075-main-----admin-users.png)
- 76. 권한 매트릭스 `#/admin/permission-matrix`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-076-main-----admin-permission-matrix.png)
- 77. 권한 일괄 적용 `#/admin/permission-matrix/bulk`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-077-main-----admin-permission-matrix-bulk.png)
- 78. 인사/신규 인사 `#/admin/users/new`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-078-admin-------admin-users-new.png)
- 79. 인사/권한 조정 `#/admin/roles`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-079-admin-------admin-roles.png)
- 80. 인사/부서 `#/admin/departments`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-080-admin-------admin-departments.png)
- 81. 인사/단톡방 매핑 `#/admin/chat-rooms`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-081-admin-------admin-chat-rooms.png)
- 82. 인사/거래처 DC 설정 `#/sales/partner-dc-config`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-082-admin----DC----sales-partner-dc-config.png)
- 83. 인사/거래처 관리 `#/admin/partners`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-083-admin-------admin-partners.png)
- 84. 인사/창고관리 `#/admin/warehouses`  
  ![](docs/qa/full-menu-real-qa-2026-06-01/screenshots/menu-084-admin-------admin-warehouses.png)

</details>

연관 Issue: 없음 (QA 산출물 PR)
