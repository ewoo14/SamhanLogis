# 2026-07-05 — E3 S4c 입출금내역 다중선택 → 벌크 입금보고서 생성 (PR #731)

> E3 회계 입금보고서 에픽. S4a(목록)·S4b(#730 작성폼/상세) → **S4c=BankTransactionPage 다중선택 → POST /from-bank-transactions 벌크 BANK_LINKED 생성**. FE 전용(BE 완비·S3 #718·갭 0). coedit=S4d 별도.

## 구현 (전부 FE)
- **api/accounting.ts**: `createBankDepositReceipt`+`BankDepositReceiptRequest`/`BankTransactionNaturalKey` 타입(BE DTO 정합)·`extractApiErrorResponseMessage`·`BankTransactionRow.cashReceiptSlipNo`.
- **BankTransactionPage**: `Set<rowKey>` 다중선택·선행 체크박스 **render-column**(DataTable 무개조·활성 규칙 UNREFLECTED&&DEPOSIT&&not CODEF_LOAN&&매칭거래처)·액션바(건수·합산·거래처·생성·전체선택)·**cash-receipts UPDATE 게이팅**(교차 페이지코드)·성공 invalidate/toast·409 표면화+선택 pruning.
- **BankDepositReceiptModal**(+model+test): 요약·집계일자(기본 최신 거래일)·차/대 계정 102/110·적요·**동일거래처 강제 경고**·즉시확정 안내·제출 중 닫힘 가드(취소/ESC/배경/X 전부).
- **mock**(+test): /from-bank-transactions+**REFLECTED 미러**(실 BE 필드 sourceType·false-green 아님).

## 핵심 결정
- **D1 DataTable render-column**(개조 불요·StatementBatchPage 선례)·범용 selection 승격=별도 백로그.
- **D2 교차 페이지코드 게이팅**: 생성=`accounting.cash-receipts` UPDATE(BankTransactionPage의 bank-matching 아님·미준수 403).
- **D4 선택 제약**: BE 검증(UNREFLECTED/DEPOSIT/not LOAN/금액>0/매칭/동일거래처) 프리플라이트 미러·100건 상한(@Size(max=100) 대칭).

## 리뷰 체인 (실행=게시 1:1·5-agent 실적발)
Opus 5-agent R1(BLOCKING0·MED5·LOW7·라이브 스샷 9장) → fix1(onError invalidate·모달가드·formatKrw·danger·select-cell·100건·중복제거) → **Codex(P1 상태전이)**: 409 후 invalidate가 데이터만 갱신·선택 미해제 → **fix2(선택-데이터 재조정·이중 방어)** → Codex0 → **Opus 5-agent R2**(DevOps=`.danger-banner` 공용 클래스 AA미달 교차회귀·QA=Modal X버튼 가드·Design=체크박스 accent) → **fix3**(.danger-banner AAA 복원·X가드·accent·tableLayout·tabular-nums) → Codex0.

## 검증
- typecheck 0·eslint 0·**vitest 600**(P1 회귀·선택 pruning 테스트)·**풀 Playwright 562 passed**(3실패 PR무관: coedit-live untracked·flake)·CI 30/30 green.
- **라이브 QA**(Docker :8080·mock OFF·dev_master·실 DB): 다중선택→합산→모달(102/110)→생성→**REFLECTED 전이+전표번호**→취소 원복→**레이스 409(선택 자동해제 실증)**→전체선택→모달 닫힘 가드. 스샷 13장(`docs/qa/731-e3-s4c-bulk-receipt/`·SHA-pinned PR 인라인).
- `.danger-banner` 공용 복원 회귀검증: slip soft-delete/list spec 15 passed.

## 교훈/후속
- **공용 CSS 클래스 토큰 변경 = 교차 화면 회귀**(DevOps R2가 `.danger-banner` AA미달 적발) — 범위 밖 화면 대비 확인.
- **mock-only 필드 = false-green**(fix2 회귀·journal.sourceType 실 BE 필드로 정정)·**mock.ts 변경=풀 스위트 검증**([[feedback_inprocess_mock_principles]]).
- **QA 스샷=SendUserFile+PR SHA-pinned 인라인 둘 다**([[feedback_pr_screenshot_sha_pinned_urls]] 강화).
- 후속: journal→cashReceipt BE cashReceiptId·S4d coedit·transactions 탭간 선택 유지(엣지·저위험).
