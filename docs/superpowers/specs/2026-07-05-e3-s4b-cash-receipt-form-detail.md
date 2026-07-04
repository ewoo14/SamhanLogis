# E3 S4b — 입금보고서 수기 작성폼 + 상세/편집 (feat/e3-s4b-cash-receipt-form)

> E3 회계 입금보고서 에픽. S4a(#727)=목록 완료. **S4b=수기 입금(MANUAL_RECEIPT) 작성폼 + 상세/편집 페이지 + mutation API/mock**. BE 완비(갭 0). 벌크생성=S4c·coedit=S4d 별도(S4a 확정 슬라이싱 준수).

## 배경
- S3(#718)=BankTransaction→BANK_LINKED 입금보고서 **BE 생성/확정**(FE 표면 없음). S4a(#727)=`CashReceiptListPage`(목록·kind 라벨 SSOT·전표번호 plain text). 
- S4a가 남긴 TODO(`CashReceiptListPage.tsx:157` "상세 페이지(S4b) 도입 시 배선")=본 슬라이스 타깃.
- BE 완비: `CashReceiptController` = POST(수기 create)·POST /from-bank-transactions(S3)·GET 목록·GET /{id}·PATCH(BANK_LINKED 409 선차단)·confirm·cancel·DELETE(DRAFT soft-delete).

## 결정
- **D1 슬라이스 경계**: S4b = 수기 작성폼(create) + DRAFT 편집 + 상세페이지(confirm/cancel/delete). **벌크생성(from-bank-transactions)=S4c**(BankTransactionPage DataTable selection 인프라 신규 필요·현재 미지원), **coedit=S4d**(realtime/collab 3파일·영속 DRAFT 전제라 create 폼과 무관). S4a 스펙 확정 슬라이싱 준수.
- **D2 기본 계정 프리필 = 차변 102(보통예금)/대변 110(외상매출금)** — SSOT=`CashReceipt.java:32/35`(에픽 설계문서 "103"은 오기). override 가능(AccountCodeSelect). `transactionDate`=**오늘 프리필**.
- **D3 편집 가부 (D-E3-04 정합·초안 정정)**: BANK_LINKED·CANCELLED만 편집 비활성(BANK_LINKED=BE 409 대칭). **DRAFT+CONFIRMED 편집 가능** — CONFIRMED 편집 시 "역분개+재게시" 경고배너([[project_accounting_ledger_edit_policy]] "입금보고서=편집대상"·D-E3-04 "CONFIRMED 수정=역분개+재게시", dev-report `2026-07-03-e3-s2-cash-receipt-journal-posting.md`). ⚠️초안의 "확정 편집 비활성"은 D-E3-04 미교차검증 기획 오류 — 라운드2 Design 리뷰 적발 후 정정.
- **D4 상세페이지 = S4a 전표번호 링크 타깃**. 전표번호 plain text → 상세 링크 승격. coedit 패널 마운트 지점만 남겨 S4d 저비용화(S4b엔 미배선).

## 요구 (구현 목록)
1. **`api/accounting.ts` mutation 클라이언트 6종**: `createCashReceipt`(POST /accounting/cash-receipts)·`getCashReceipt`(GET /{id})·`updateCashReceipt`(PATCH /{id})·`confirmCashReceipt`(POST /{id}/confirm)·`cancelCashReceipt`(POST /{id}/cancel)·`deleteCashReceipt`(DELETE /{id}). 타입=BE DTO(`CashReceiptRequest`/응답) **정확 일치**. slipNo/id는 UUID 비노출.
2. **`CashReceiptFormPage.tsx`**(new+edit 겸용·`JournalFormPage` 패턴) + `.model.ts`(폼 상태/검증) + `.test.tsx`: 거래처(PartnerAutocomplete)·금액(>0 필수)·거래일(오늘 프리필·필수)·적요(≤494)·차/대 계정(102/110 프리필·override). 저장→DRAFT create/PATCH.
3. **`CashReceiptDetailPage.tsx`** + `.test.tsx`: 필드 표시·kind badge·confirm/cancel/delete 액션(권한·상태별 활성)·BANK_LINKED 편집 비활성·목록 복귀.
4. **`routes/index.tsx`**: `/accounting/admin/cash-receipts/new`·`/:id`·`/:id/edit`(PermissionGuard — create/view page-code=BE @RequirePermission 일치).
5. **`CashReceiptListPage.tsx`**: 전표번호 → 상세 링크 + "신규 작성" 버튼(create 권한).
6. **`mock.ts`**: POST·GET /{id}·PATCH·confirm·cancel·DELETE 핸들러(응답 shape=BE DTO 일치·BANK_LINKED PATCH 409). ※ page.route 우회 회귀 방지=풀 스위트 검증([[feedback_inprocess_mock_principles]]).
7. **playwright spec**: 작성(프리필·검증)·상세·편집·BANK_LINKED 비활성·확정/취소.

## 함정
- **kind 라벨 SSOT 소비**(S4a): DEPOSIT_REPORT=입금보고서·MANUAL_RECEIPT=수기 입금·BANK_LINKED=통장연계. 신규 리터럴 금지.
- **FE 옵션 타입=BE DTO 정확 일치**([[feedback_fe_option_type_matches_be_dto]]) — 계정코드/kind/금액 타입.
- **FE canAccess page-code=BE @RequirePermission 일치**([[feedback_fe_canaccess_pagecode_be_match]]).
- **design-system 우선**: PartnerAutocomplete·AccountCodeSelect·DataTable·Modal 재사용(자체 신규 금지).
- **mock POST/PATCH shape=BE DTO**·null 금지(envelope)·BANK_LINKED PATCH 409([[feedback_inprocess_mock_principles]]).
- **전표번호/id UUID 비공개**([[feedback_uuid_no_user_visibility]]).
- 무관 백로그(S4b 제외): `CashReceiptService.resolvePartnerFilterIds` partnerName 필터 limit=100 silent truncation(S1 pre-existing).

## 검증
- FE: `npm run typecheck`·vitest(model/폼)·**풀 Playwright mock 스위트**(page.route 우회 회귀 방지).
- 라이브 QA(Docker :8080·dev_master·mock OFF): 수기 작성→DRAFT→확정→상세, BANK_LINKED 편집 비활성 실화면(사용자 인라인+SHA-pinned).
