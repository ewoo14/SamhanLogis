# E3 S4c — 입출금내역 다중선택 → 벌크 입금보고서 생성 (feat/e3-s4c-bank-bulk-receipt)

> E3 회계 입금보고서 에픽. S4a(목록)·S4b(#730 수기 작성폼/상세) 완료 → **S4c=BankTransactionPage 다중선택 → POST /from-bank-transactions 벌크 BANK_LINKED 입금보고서 생성**. FE 전용(BE 완비·S3 #718·갭 0). coedit=S4d 별도(BANK_LINKED=즉시 CONFIRMED라 coedit 무관).

## 배경
- S3(#718)=BankTransaction N건(자연키 튜플)→BANK_LINKED 입금보고서 합산·확정·통장거래 REFLECTED 원자 승격 **BE 완비**. FE 표면 없음.
- 현 BankTransactionPage=DataTable+행단위 거래처 매칭(matchBankTransactionPartner)만·**다중선택 미지원**.
- BE 계약: `POST /accounting/cash-receipts/from-bank-transactions`(201·@RequirePermission **accounting.cash-receipts UPDATE**)·요청 `BankDepositReceiptRequest{transactions[1~100]:{bankAccountLabel,transactedAt,amount,externalRef}, transactionDate(필수), memo?, debit/creditAccountCode?}`·응답 `CashReceiptResponse`(id=null·kind=BANK_LINKED·status=CONFIRMED·slipNo·journalNo·합산 amount).

## 결정 (기존 결정 교차검증 — S3 dev-report·S4b spec)
- **D1 DataTable selection = render-column(개조 불요)**: design-system `DataTable`은 selection 미지원+헤더 string 타입(체크박스 헤더 불가). **선행 체크박스는 셀 render-column**으로 삽입·**"전체 선택"은 액션 바**(테이블 밖)에 배치. Set<rowKey> 페이지 상태. 선례 `StatementBatchPage`(수제 다중선택). **범용 DataTable selection 승격은 S4c 범위 밖**(별도 백로그·회귀 표면 확대 회피).
- **D2 권한 게이팅 = `canAccess('accounting.cash-receipts','update')`** (⚠️교차 페이지코드 함정): BankTransactionPage는 `accounting.bank-matching`만 검사하나 벌크생성 엔드포인트는 `accounting.cash-receipts` UPDATE 요구(원장 게시=확정, S3 결정 4879892250) → 생성 버튼/액션은 **cash-receipts update로 게이팅**(bank-matching 아님).
- **D3 생성 모달 UX**(전용 목업 부재→BE DTO+StatementBatchPage 패턴 도출): 선택 N건 요약(건수·합산액·거래처명)+입력 3종 — `transactionDate`(집계일자·기본=선택행 최신 거래일 날짜부), 차/대 계정(**102/110 기본**·AccountCodeSelect 재사용·override), `memo`(옵션). **거래처·금액은 입력 안 받음**(거래처=선택행 파생·서버 동일성 강제, 금액=합산 표시만). "생성 시 즉시 확정·수정 불가(취소 후 재생성)" 안내. `CashReceiptFormPage` 재사용 안 함(페이로드·의미 상이)·원자 부품만 재사용(AccountCodeSelect·기본계정·formatKrw·Modal).
- **D4 선택 제약 UI**(BE 검증 프리플라이트): 체크박스 활성 = `matchStatus==='UNREFLECTED' && txnType==='DEPOSIT' && source!=='CODEF_LOAN' && matchedPartnerName` 행만. **선택 집합 거래처 혼재 시 생성 버튼 비활성+경고**(BE 동일거래처 강제 대칭). REFLECTED 행=비활성(이미 연결·cashReceiptSlipNo 표시).
- **D5 mock 핸들러 = REFLECTED 미러**(false-green 방지·[[feedback_inprocess_mock_principles]]): `/from-bank-transactions` 핸들러가 선택행 합산→BANK_LINKED/CONFIRMED/id=null/journalNo 채번 반환 + **mock bank-transactions 데이터의 해당 행을 REFLECTED+cashReceiptSlipNo로 전이**(라이브 승격 미러). 미러 없으면 재선택 방지·목록 반영 검증 불가.

## 요구 (구현·전부 FE)
1. **`api/accounting.ts`**: `createBankDepositReceipt(req)` + `BankDepositReceiptRequest`/`BankTransactionNaturalKey` 타입(BE DTO 정확 일치)·오류메시지 `extractApiErrorResponseMessage` 래핑. `BankTransactionRow`에 `cashReceiptSlipNo` 추가(BE projection 존재·현 FE 타입 누락).
2. **`BankTransactionPage.tsx`**: `Set<rowKey>` 선택 상태·선행 체크박스 render-column(비활성 규칙 D4)·액션 바(선택 건수·합산·거래처·"입금보고서 생성" 버튼·전체선택)·생성 모달 마운트·cash-receipts update 게이팅. 생성 성공→토스트(slipNo)+`['accounting','bank-transactions']` invalidate·409 메시지 표면화.
3. **`BankDepositReceiptModal.model.ts`(+test)**: 순수함수 — 선택행→payload 변환(자연키·amount 문자열→숫자)·동일거래처 검증·합산·기본 transactionDate(최신 거래일)·선택가능 행 판별.
4. **`BankDepositReceiptModal.tsx`**(모달 분리): 요약+입력 3종+안내+생성.
5. **`mock.ts`(+`mock.test.ts`)**: D5 핸들러+REFLECTED 미러.
6. **playwright spec**: 다중선택·거래처혼재 경고·생성→REFLECTED 전이·권한 게이팅.

## 함정
- **교차 페이지코드**(D2): 생성 액션 = cash-receipts update(bank-matching 아님) — 미준수 시 403.
- **동일 거래처 강제**(D4)·REFLECTED/출금/LOAN 제외·금액>0.
- **자연키 튜플 정확 매칭**: {bankAccountLabel,transactedAt,amount,externalRef} — FE Row→BE DTO 변환 정확.
- **mock REFLECTED 미러**(D5) — mock-only 필드로 UI 활성화 금지(false-green).
- **design-system DataTable 무변경**(D1) — render-column만.
- 레이스: BE가 409 전체 롤백(WHERE 원자 재확인)·FE는 409 표면화+invalidate.
- FE 옵션 타입=BE DTO([[feedback_fe_option_type_matches_be_dto]])·UUID 비노출.

## 검증
- FE: typecheck·vitest(model·selection)·**풀 Playwright mock 스위트**(page.route 우회 회귀 방지·mock 신규 핸들러).
- 라이브 QA(Docker :8080·mock OFF·dev_master): 통장거래 N건 선택(동일거래처)→생성 모달(집계일자·계정)→BANK_LINKED 확정 생성→선택행 REFLECTED 전이·전표번호 표시·거래처 혼재 경고 실화면(사용자 인라인+SHA-pinned).
