# E3 입금보고서 S1 — CashReceipt 도메인 기반 (수기 CRUD + 상태 + born-live)

> 구현=Codex(PM 직접구현 금지). 조기 OPEN PR→Codex 개발→Opus 5-agent+fix+게시↔Codex 5-agent+fix+게시 0수렴→PM종합→CI green→머지. 설계=`2026-07-03-e3-deposit-report-epic-design-exploration.md`(개발책임자 결정 확정).

**Goal:** 입금보고서(CashReceipt)를 **MIG 배치 적재 전용 → 라이브 수기 CRUD** 로. 상태 라이프사이클 + 편집 대상화. **S1=BE 도메인 기반**(분개 생성=S2·통장연계=S3·FE=S4).

## 개발책임자 확정 결정 반영
- **상태**: `DRAFT → CONFIRMED → CANCELLED`. CONFIRMED 시 POSTED 분개 생성(=S2 배선), coedit 편집=DRAFT 한정, CANCELLED=역분개(S2).
- **③ 계정과목**: 기본 **차 보통예금(103)/대 외상매출금(110)** + **사용자 변경 가능** → CashReceipt 에 debit/credit 계정 필드(기본값+편집).

## Tasks (Codex 구현 — accounting-service + auth-service)
1. **`CashReceiptStatus` enum**(신규): `DRAFT/CONFIRMED/CANCELLED`.
2. **`CashReceipt` 엔티티 확장**: `status`(기본 DRAFT)·`debitAccountCode`(기본 '103')·`creditAccountCode`(기본 '110') 필드 추가. 도메인 메서드: `createManual(...)` 팩토리(kind=MANUAL_RECEIPT·status=DRAFT), `updateDraft(amount/transactionDate/memo/partnerId/debitAccountCode/creditAccountCode)`(DRAFT only·아니면 예외), `confirm(actor)`(DRAFT→CONFIRMED), `cancel(actor)`(→CANCELLED), soft delete(DRAFT only). 기존 `fromMig7Staging`·`linkJournal` 유지. 직접 set 금지(도메인 메서드 chain).
3. **`CashReceiptNumberService`**(신규 채번): `slip_no` 생성(UNIQUE). `JournalNumberService`(yyyy/MM/dd-N 일자별 락 시퀀스) 패턴 재사용. `external_ref` 수기 규칙(예 `MANUAL:{uuid}` 또는 slipNo 기반).
4. **`CashReceiptService`**(신규): `createManual`·`list`(partnerId/기간/status/kind 필터, Specification)·`getOne`·`updateDraft`·`confirm`·`cancel`. **분개 생성/역분개는 S2**(본 슬라이스는 상태전이만·journalId=null 유지).
5. **`CashReceiptController`**(신규): `/accounting/cash-receipts` POST(create)·GET(list)·GET/{id}·PATCH/{id}(updateDraft)·POST/{id}/confirm·POST/{id}/cancel. `@RequirePermission(page="accounting.cash-receipts", action=...)`. ApiResponse wrapper·id path-param(UUID 비노출).
6. **`CashReceiptRepository`**: 커스텀 list/search 쿼리(JpaSpecificationExecutor 활용).
7. **PageCode `accounting.cash-receipts`**(auth-service 신규): `PageCode` enum + 시드 마이그(auth V80) — MASTER/MANAGER/ACCOUNTANT VIEW+EDIT(회계 권한자). [[feedback_fe_canaccess_pagecode_be_match]]·[[feedback_enum_expansion_check_constraint]].
8. **V80 마이그(accounting)**: `cash_receipts` 에 `status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED'`(기존 MIG 적재분=CONFIRMED 소급)·`debit_account_code`/`credit_account_code VARCHAR` 컬럼 추가. **적용 마이그 불변**(V80 신규만). status/account CHECK 제약.
9. **born-live**: CashReceipt 를 accounting realtime/collab 인프라 4번째 엔티티로 온보딩(`AccountingRealtimeController` SSE + `AccountingLockPolicies`(CashReceipt=DRAFT free·CONFIRMED 승인·CANCELLED 종결) + collab config). 기존 3엔티티(TaxInvoice/Journal/AccountingPeriod) 패턴 복제.
10. **IT**(실 Testcontainers): CashReceipt CRUD(create/list/get/updateDraft/confirm/cancel)·상태전이 가드(CONFIRMED updateDraft 거부)·채번 UNIQUE·V80 마이그 fresh probe·auth V80 PageCode 시드. ci.yml allowlist 확인([[feedback_ci_test_filter_false_green]]).

## 리스크
- **stacked/2서비스**(accounting+auth) — auth V80(PageCode)·accounting V80(컬럼) 넘버링 독립(서비스별 db). [[feedback_stacked_pr_ci_false_green]] 주의(BE 트리거).
- 무결성: S1은 상태/CRUD만(분개=S2). 원장 미접촉. 기존 MIG 적재분 status 소급(DEFAULT CONFIRMED)로 무결성 보존.
- 회계 표시 규약(음수 빨강·0 '—')=FE(S4).

## Self-Review
- 커버리지: enum·엔티티·채번·서비스·컨트롤러·repo·PageCode·마이그(2)·born-live·IT. ✅
- 주의: ①분개=S2 미포함(journalId null) ②status 소급 기본값 ③채번 UNIQUE 동시성 락 ④PageCode FE↔BE(FE=S4) ⑤도메인 메서드 chain·BaseEntity 7 audit·soft delete.
- 라이브 QA: mock OFF·:8080·dev_master — 입금보고서 수기 생성/목록/확정 API 실동작(FE 없으니 real-qa 는 S4·S1은 IT+API 라이브). GUI=S4.
