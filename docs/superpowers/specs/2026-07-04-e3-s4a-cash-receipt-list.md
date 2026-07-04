# E3 입금보고서 S4a — 목록 페이지 (CashReceiptListPage) spec

> E3 에픽 S4(입금보고서 FE)의 첫 서브슬라이스. BE(S1 CRUD·S2 분개·S3 통장연계) 완비, FE 미존재. 목업 `docs/design/mig-14-admin-ui/02_cash_receipt_list_mock.md` 기준 **읽기 목록 페이지**부터. 작성폼(S4b)·BankTransactionPage 다중선택 생성(S4c)·coedit(S4d)는 후속.

## 📌 결정 (목업·에픽 확정분)

| # | 결정 | 출처 |
|---|---|---|
| D1 | 라우트 = `/accounting/admin/cash-receipts`, page-code `accounting.cash-receipts`(V80 시드·FE 배관 기존재) | 목업·S1 |
| D2 | kind 라벨 3값: DEPOSIT_REPORT=입금보고서·MANUAL_RECEIPT=수기 입금·BANK_LINKED=통장연계 (S4 인지1) | 목업·#716 교훈 |
| D3 | UUID 비노출 — 목록/링크는 slipNo·거래처명만(id 는 mutation path 전용) | UUID 규약·CashReceiptResponse |
| D4 | 현금지출 화면과 동일 패턴(필터/표 위치 고정) — 단 지출 FE 미존재라 accounting 리스트 관례 준수 | 목업 |

## 요구 분해

1. **CashReceiptListPage 신설** — `/accounting/admin/cash-receipts`. GET `/accounting/cash-receipts` 소비(Page<CashReceiptResponse>).
2. **필터**: 거래처명(`partnerName` 부분)·전표번호(`slipNo`)·구분(`kind` 전체/입금보고서/수기입금/통장연계)·기간(`from`/`to` transactionDate). 적용 필터 chip + 초기화.
3. **컬럼**(목업 §3): 전표번호(slipNo·링크·UUID 금지)·거래처(partnerName·18자 말줄임)·구분(kind badge)·거래일(transactionDate YYYY-MM-DD)·금액(amount 우정렬 천단위)·연결 분개번호(journalNo·없으면 '-').
4. **페이지네이션**: page/size(기본 20 — 목업 50건 표기는 옵션), 총 건수·페이지 이동.
5. **상태**(목업 §4): 빈 결과·오류·권한 없음·로딩 skeleton. 검색 조건 chip 유지.
6. **메뉴/라우트/권한**: 사이드바 '입금보고서'(회계 그룹) SidebarLink(accounting.cash-receipts view)+index.tsx PermissionGuard+AppLayout ROUTE_PAGE_CODES.
7. **mock parity**: mock.ts GET /cash-receipts 목록(필터·페이지) — 실 API shape 정합.

## API 계약 (BE 기구현)

- `GET /accounting/cash-receipts?partnerName=&slipNo=&kind=&from=&to=&status=&page=&size=` → `ApiResponse<Page<CashReceiptResponse>>`
- `CashReceiptResponse`: id(UUID·비노출)·slipNo·partnerCode·bizNo·partnerName·amount·transactionDate·kind(CashReceiptKind)·status(CashReceiptStatus)·memo·journalNo·reverseJournalNo·externalRef·debitAccountCode…
- 권한 VIEW = accounting.cash-receipts

## 함정

1. **UUID 비노출** — CashReceiptResponse.id 를 화면/링크에 렌더 금지. rowKey 는 slipNo(또는 id 내부 사용·표시 금지).
2. **kind 라벨 SSOT** — DEPOSIT_REPORT/MANUAL_RECEIPT/BANK_LINKED 3값. 신규 kind 추가 시 fallback(원값) — enum 확장 대비.
3. **금액/날짜 표시 규약** — 금액 우정렬·천단위·0/음수 규약([[feedback_accounting_report_display_conventions]]) 정합. 날짜 KST(UTC 함정 — 통장 목록 KST 기추적).
4. **필터 kind=전체** = 파라미터 미전송. status 는 목업 필터에 없음(전 상태 노출) — 확인.
5. **페이지네이션 계약** — Page 응답(totalElements/totalPages/number). page 0-base.
6. **디자인시스템 DataTable 재사용**(자체 테이블 신규 금지)·모바일 카드화(mobilePriority).

## 검증 계획

- vitest: 목록 렌더·필터 파라미터 전송·kind 라벨·UUID 비노출·빈/오류 상태. mock.ts parity.
- 라이브 QA: 실 스택 :8080(S1~S3 시드 데이터)·dev_master → 목록 노출·필터(거래처/구분/기간)·kind badge·전표번호 링크·페이지 이동 GUI 캡처.

## 이후 (S4 후속)

S4b 작성폼(POST/PATCH·account 102·transactionDate 프리필·BANK_LINKED PATCH 비활성=인지2/3) → S4c BankTransactionPage 다중선택→`/from-bank-transactions` 생성 → S4d coedit. 브랜치 feat/e3-s4a-cash-receipt-list → 조기 OPEN PR → Codex 개발 → 순차 듀얼 캐논.
