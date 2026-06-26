# CODEF FE (BC2) — DepositMatch CODEF 계좌·카드·대출 탭 설계 (spec)

> 2026-06-27. CODEF BC1 백엔드(#628 머지) 후속. desktop 회계 화면에 CODEF 거래내역 조회/매칭 UI.

## 0. 컨텍스트
- BC1: `POST /accounting/codef/import`(type BANK/CARD/LOAN/ALL, DRY_RUN) → `bank_transaction`(source CODEF_BANK/CODEF_CARD/CODEF_LOAN, card_name/approval_id/loan_name).
- 기존 FE: `routes/DepositMatchPage.tsx`(KFTC 입금매칭), `routes/BankTransactionPage.tsx`(거래내역 목록/매칭), `api/depositMatchApi.ts`·`api/accounting.ts`·`api/mock.ts`.

## 1. 목표 (BC2)
desktop 회계 화면에 **CODEF 거래내역 조회(import)+목록(계좌/카드/대출)+거래처 매칭** UI 추가. 기존 BankTransaction 목록/매칭 컴포넌트·AsyncAutocomplete 재사용. **UUID 비노출**(슬립번호/거래처명/카드명/대출명만).

## 2. 범위
- **Import 트리거**: 기간 + type(계좌/카드/대출/전체) 선택 → `POST /accounting/codef/import` 호출 → 결과(fetched/imported/duplicateSkipped/matched) 토스트/요약.
- **목록**: source 탭/필터(CODEF_BANK/CODEF_CARD/CODEF_LOAN) + 공통 컬럼(거래일시·금액·적요·거래처) + 카드(card_name)·대출(loan_name) 부가 컬럼. 기존 BankTransaction 목록 재사용/확장.
- **거래처 매칭**: 기존 매칭 UI(AsyncAutocomplete) 재사용 — 대출(CODEF_LOAN)은 매칭 비대상 안내(은행 채권자=거래처 master 부재, BC1 백엔드 정책 정합).
- **mock**(VITE_MOCK_MODE): import/목록 핸들러 + CODEF 시드. **Playwright 스펙**(CI 수집).
- 메뉴: 회계 메뉴에 'CODEF 거래내역'(또는 기존 입금매칭 화면 확장) `usePermissions().canAccess('accounting.bank-matching')` 가드.

## 3. 비범위
- 실 CODEF API(BC1 DRY_RUN) · 적요 퍼지매칭 고도화 · 모바일.

## 4. QA
- mock 단위(Playwright, in-process mock 3원칙·page.route no-op).
- **실서버 라이브 QA**: Docker 스택 + 데스크톱 실 로그인(dev_master) → CODEF import 실행 → 목록/탭/매칭 실 캡처([[feedback_real_server_check_screenshot]]·[[feedback_qa_docker_real_test]]).

## 5. 워크플로우
canonical: spec→조기PR→Codex 구현(danger-full-access)→④Opus(FE/Design/QA)+fix↔⑤Codex 0수렴→⑥PM→실서버 라이브 QA→CI green→PM 머지. design-system 컴포넌트 우선(자체 신규 금지).
