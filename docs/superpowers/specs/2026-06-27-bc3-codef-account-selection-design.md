# BC3 — CODEF 계좌/카드/대출 선택·계정별 저장 + 전체/다중 가져오기 (설계)

> 2026-06-27 개발책임자 요구(메시지 4건 종합): ① CODEF 자격(connectedId)에 연결된 **계좌/카드/대출 전체 목록 열거** ② 가져오기 범위 = 기본 **전체** / 계좌 전체·카드 전체·대출 전체 / **특정 항목 다중 선택** ③ 선택을 **user 계정별 영속 저장**(다음엔 재선택 불요). **infra-now**: DRY_RUN stub로 ~85% 선구축, **실 계좌목록·실 조회는 실 CODEF 연결(Phase 11) 게이트**.

## 0. 컨텍스트 (recon)
- BC1(거래내역 조회)·BC2(FE import/목록/매칭) 완료. 현재 `CodefImportService`는 accountRef/cardRef/loanRef **단일 값**만 받아 1건씩 조회.
- `CodefClient`(fetchBank/Card/LoanTransactions 단일 ref)·DRY_RUN 결정적 mock·CODEF 모드 Phase11 placeholder.
- user-scoped 설정 영속 테이블 부재(EstimateConfig=싱글톤 전역). 신규 필요.
- page-code `accounting.bank-matching`(입출금 내역) 재사용. ErrorCode/BaseEntity 7/Soft Delete 공용.

## 1. 슬라이스
### 슬1 — CodefClient 목록 열거 메서드 + DRY_RUN stub
- `CodefClient`: `listBankAccounts(connectedId, submitMethod)`·`listCards(...)`·`listLoans(...)` 신규. 반환 `AccountInfo{ref,name,...}` 최소정보.
- `CodefClientImpl`: DRY_RUN = 결정적 mock(계좌 3~5·카드 2~3·대출 1~2). CODEF 모드 = Phase11 placeholder(실 API GET account/list 등, 게이트).
- 단위/IT(DRY_RUN 목록 결정성).

### 슬2 — user_codef_import_scope 엔티티 + 저장
- Flyway V## `user_codef_import_scope`: `user_id UUID`·`connected_id`·`account_ref_selections`/`card_ref_selections`/`loan_ref_selections`(JSON/TEXT 배열)·`default_import_type`(BANK/CARD/LOAN/ALL CHECK)·BaseEntity 7 + soft delete. UNIQUE(user_id, connected_id) active.
- 엔티티/Repository/Service(upsert·조회, self-scoped user-context). Testcontainers IT(저장/조회/멱등).

### 슬3 — CodefImportScopedService (다중 ref + 전체/범위)
- 신규 `importTransactionsWithScope(from,to,type,accountRefs[],cardRefs[],loanRefs[],submitMethod,userId)` — **기존 `importTransactions` 유지(BC2 호환)**.
- 로직: type=ALL+빈배열 → **저장된 선택 로드**; type=ALL+null → **서버 목록 전체**; type=BANK+[ref1,ref2] → 지정 2개만. 각 ref 루프 조회(기존 fetch* 재사용)+멱등 적재.
- IT(다중 ref·전체·저장선택 로드·BC2 무회귀).

### 슬4 — Controller 엔드포인트
- `GET /accounting/codef/bank-accounts`(+cards/loans, READ): 목록 조회. `POST /accounting/codef/import-scoped`(CREATE): 다중/범위 가져오기. `PUT/GET /accounting/codef/scopes`(UPDATE/READ, self-scoped user): 선택 저장/조회. @RequirePermission accounting.bank-matching. 게이트웨이 라우트.
- RestClient 계약·IT.

### 슬5 — FE 다중선택 폼 + 저장
- `api/codef.ts`: `listCodefBankAccounts/Cards/Loans`·`saveCodefImportScope`·`loadCodefImportScope`.
- `BankTransactionPage` '거래내역 가져오기' 폼 개편: **범위 셀렉터**(전체 기본 / 계좌·카드·대출 전체 / 특정 다중 선택[design-system 체크박스 리스트 or TagChip 칩, [[feedback_chip_ui_multi_input]]]) + **저장**(부팅 시 저장된 선택 로드→재선택 불요, 변경 가능). mock(3원칙)+Playwright+real-qa.

## 2. 외부 게이트 (정직)
- 실 계좌 목록·실 거래 조회 = **실 CODEF connectedId 등록(법인 자격)+실 API 스펙**(Phase 11 계약). 현재 DRY_RUN stub로 전 흐름(목록→선택→저장→가져오기) 동작·검증.

## 3. QA
- 슬1~4: Testcontainers IT(목록 결정성·저장 멱등·다중 import·BC2 무회귀·계약). 슬4 실서버 라이브(실 로그인→목록/저장/import-scoped 실 HTTP, dev_master).
- 슬5: 단위·build·Playwright mock·**real-qa 실 캡처**(범위 선택·저장·가져오기).

## 4. 워크플로우
canonical 슬라이스별: spec→조기PR→Codex 구현(danger-full-access)→④Opus(BE/FE/QA)+fix↔⑤Codex 0수렴→실서버/CI→PM 머지. fix 재수렴. 슬1→5 순(의존).
