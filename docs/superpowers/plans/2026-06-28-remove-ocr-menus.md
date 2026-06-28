# OCR 메뉴 전수 삭제 — 구현 계획 (Opus 기획)

> 개발책임자 2026-06-28 지시([[project_ocr_removal_gas_direct]]): OCR 관련 메뉴 모두 삭제. 추후 GAS 직접 주문서 전송 레거시 패턴으로 대체 계획.
> 표준 워크플로우: Opus 기획(본) → Codex 개발(삭제) → 순차 듀얼리뷰(Opus fix↔Codex fix) 0수렴 → 머지.

## 범위 — 2개 OCR 기능 end-to-end 삭제
1. **영수증 OCR** (`purchases.receipt-ocr`, "영수증 OCR") — slip-service CLOVA OCR.
2. **발주서 업로드 OCR** (`sales.vendor-order`) — partner-order-service Tesseract. (GAS-direct 대체 1차 대상.)

## 삭제 대상

### FE (clients/desktop)
- `components/AppLayout.tsx`: 영수증 OCR 사이드바(showReceiptOcr·/purchases/receipt-ocr·testid) + 발주서 업로드 OCR 메뉴.
- `routes/index.tsx`: `/purchases/receipt-ocr` 라우트 + 발주서 OCR 라우트.
- `routes/SalesVendorOrderUploadPage.tsx`(+.module.css) 페이지 컴포넌트 + 영수증 OCR 페이지 컴포넌트.
- `api/receiptOcrApi.ts`·`api/vendorOrderApi.ts` 삭제.
- `api/permissionsApi.ts`: `purchases.receipt-ocr`·`sales.vendor-order` page-code 타입 제거.
- `api/mock.ts`: 영수증 OCR 업로드 mock(POST /slips/receipt-ocr) + 발주서 OCR mock + page-code 시드 참조 제거.
- playwright: menu-relocate·menu-5category-real-qa·sp-d3-slip-dispatch-permission-migration·sp-d1-dynamic-rbac·full-qa(capture-all.mjs·pagecodes.json) — OCR 단언/엔트리 제거.

### BE
- **slip-service**: `web/ReceiptOcrController`·`service/ReceiptOcrParseService`·`client/ReceiptOcrClientImpl`(+interface)·`web/dto/ReceiptParseRequest`·`ReceiptOcrResult`·`it/ReceiptOcrShellIT`·`vendor/Phase9OcrPlaceholderGuardConsistencyTest`. `application.yml` CLOVA(li-api-key/secret/invoke-url) 제거.
- **partner-order-service**: 발주서 업로드 OCR 컨트롤러/서비스/Tesseract 클라이언트(`samhan.partner-order.ocr.enabled`) + 관련 테스트.
- **auth**: `PageCode.java` `PURCHASES_RECEIPT_OCR`·`SALES_VENDOR_ORDER`(OCR 한정 시) enum 제거.

### 마이그레이션 (신규 — 적용된 V7/V9 불변)
- auth 신규 V: `DELETE FROM role_page_permissions WHERE page_code IN ('purchases.receipt-ocr', 'sales.vendor-order')` + `account_page_permissions`/`group_page_permissions` 동일(존재 시). 멱등.

## 주의 (메모리 가드)
- **적용된 마이그 불변**([[feedback_applied_migration_immutable]]) — V7/V9 수정 금지, 신규 V 로 DELETE.
- **page-code enum 제거 = 시드/매트릭스/mock/playwright 전수 동반**([[feedback_enum_expansion_check_constraint]] 역) — getMyPermissions(MASTER=PageCode.values()) 정합, dangling 0.
- FE 가드 제거 시 mock suite 깨짐([[feedback_fe_guard_removal_contract_tests]]) — 전체 mock/playwright 갱신.
- `sales.vendor-order` 가 OCR 외 용도 겸하면 메뉴만 제거하고 page-code 보존 — 정찰 확정 후.
- 검증: BE compile(slip·partner-order·auth) + 영향 IT + 마이그 fresh PG + desktop typecheck + playwright + 실서버 QA(메뉴 부재 캡처).

## 다음
Codex 개발(전수 삭제 + 신규 마이그 + dangling 0) → Opus 5-agent(dangling/build/마이그/실QA)+fix ↔ Codex 5-agent+fix → 0수렴 → 머지 → 큐 ③ A2-G2.
