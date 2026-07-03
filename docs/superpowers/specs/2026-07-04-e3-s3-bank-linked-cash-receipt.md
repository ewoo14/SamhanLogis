# E3 S3 — 통장연계 입금보고서 (BankTransaction N건 → CashReceipt 1건) spec

> 2026-07-04 집PC 정찰 기반. 상태: **결정 반영·구현 착수**(이슈 #717 결정 기록 4877750879) — Q1~Q3 개발책임자 확정, Q4(BANK_LINKED)/Q5(102 유지)는 권장안 잠정 적용(응답 전 이석 — PR 리뷰에서 정정 가능).
> 정찰 근거: main `c704e7f3e`. 설계문서(2026-07-03-e3-deposit-report-epic-design-exploration.md)의 stale 2건 정정 포함(실제 head V52·계정 102·`cash_receipts_kind_ck` 는 V48에 이미 존재 — 신규 kind 는 ALTER 마이그 필수).

## 스코프 (핸드오프 확정)

- `markReflected` 라이브 승격(현 dead code — 유일 호출이 단위테스트뿐)
- 통장거래 N건 선택 → 입금보고서 1건 생성(금액 합산): **생성 전 거래처 매칭 강제**(N건 전부 동일 partner 매칭 완료 전제), **journalId 확보 후(=confirm 게시 후) reflected 처리** — 단일 트랜잭션
- 1:1(N=1)도 동일 경로 허용
- FE(목록 다중선택·작성폼)는 S4 — 단 BE 계약은 S4 를 견디게 설계
- **(결정 반영) BANK_LINKED 입금보고서 라이프사이클 정책(PM 기본값 — PR 게시로 기록)**: ①**취소 시 링크 원복** — 역분개 게시 후 연결 통장거래를 UNREFLECTED 로 되돌리고 matched_journal_id/cash_receipt_id 클리어(거래 재사용 가능) ②**CONFIRMED PATCH(수정 재게시) 금지(409)** — 합산 금액/거래처가 통장거래와 정합 깨짐 방지, 정정은 취소 후 재생성 유도

## 결정 확정 (이슈 #717 — 2026-07-04)

| # | 결정 | 상태 |
|---|---|---|
| Q1 | N건 식별 = **자연키 4-키 튜플 배열**(UUID 비노출 유지) | ✅ 확정 |
| Q2 | 링크 = **명시 FK `bank_transactions.cash_receipt_id`**(N→1, V53) | ✅ 확정 |
| Q3 | 집계 일자 = **작성 시 사용자 지정(기본=최신 거래일) + 마감월 409** | ✅ 확정 |
| Q4 | kind = **BANK_LINKED 신설**(+`cash_receipts_kind_ck` ALTER, V53) | ⚠️ 권장안 잠정 |
| Q5 | 기본 차변 = **102 유지** | ⚠️ 권장안 잠정(현상 유지) |

## 현황 지도 (정찰 요약)

- **BankTransaction**: matchStatus(UNREFLECTED/REFLECTED/FORCED)·matchedPartnerId·matchedJournalId·markReflected(멱등, REFLECTED 재호출 허용) 완비. REST 는 자연키(4-키: bankAccountLabel+transactedAt+amount+externalRef) 기반·UUID 비노출·page-code `accounting.bank-matching`. **@Version 없음**(V43 — 낙관락 무방비).
- **CashReceipt(S1/S2)**: createManual(DRAFT)→confirm(postAutoJournal CASH_RECEIPT·마감가드·aging afterCommit)→cancel(autoReverse). kind=DEPOSIT_REPORT(Mig7 이관)/MANUAL_RECEIPT 2값. @Version(V49). UUID path-var·id 노출(통장과 정반대 정책). bank 참조 필드 없음.
- **DepositMatch(KFTC)**: BankTransaction 무관(외부 DTO 기반)·KFTC_DEPOSIT DRAFT 분개 직접 생성 — S3 와 직접 재사용 관계 아님(거래처 resolve 헬퍼만 재사용 후보).
- **FE**: BankTransactionPage 존재(다중선택 없음·자연키 rowKey), cash-receipts FE/클라이언트/mock 전무(S4).

## 구현 표면 (결정 확정 후)

- BE 신설: `BankDepositReceiptService`(N건 로드→검증[동일 partner·전량 UNREFLECTED·DEPOSIT·비대출]→합산 CashReceipt 생성→confirm 재사용→markReflected N건, 단일 @Transactional) + 신규 endpoint(`POST /accounting/cash-receipts/from-bank-transactions` 제안) + 요청 DTO + V53 마이그(링크/kind 결정에 따름)
- BE 수정: BankTransactionRepository 배치 로더·조건부 UPDATE 가드(version 부재 대체 — `WHERE match_status='UNREFLECTED'` 원자 갱신)·BankTransactionResponse 에 연결 정보 노출(선택)
- IT: 정상 N건 합산·거래처 불일치 409·이중 승격 레이스(조건부 UPDATE 0행)·마감월 409·금액 합산 정합·soft-delete 제외 — ci.yml allowlist+hard-gate 등재

## 🔴 설계 결정 질의 5건 (이슈 #717 — 개발책임자)

| # | 질문 | 권장안(PM) | 근거 |
|---|---|---|---|
| Q1 | N건 선택 식별 방식 | **A: 자연키 4-키 튜플 배열 유지** (B: BankTransaction UUID 노출 전환) | UUID 비노출 원칙 보존. FE 목록 행이 4-키 전부 보유 — 배열 전송 실용 문제 없음 |
| Q2 | 통장↔입금보고서 링크 | **B: 명시 FK `bank_transactions.cash_receipt_id`(N→1, V53)** (A: 암묵 — matchedJournalId 공유) | S2 의 "수정 재게시"가 receipt.journalId 를 **새 분개로 교체** — 암묵 링크는 재게시 시 끊김. 감사 역추적은 receipt 기준이 안정 |
| Q3 | 집계 입금보고서의 transactionDate | **작성 시 사용자 지정(기본=선택 거래 중 최신 거래일), 마감월이면 409 그대로** | 마감가드가 이 일자로 걸림 — 규칙이 곧 회계 정책 |
| Q4 | kind 신설 | **신규 `BANK_LINKED` + V53 에서 `cash_receipts_kind_ck` ALTER** (대안: DEPOSIT_REPORT 재사용) | Mig7 이관분(DEPOSIT_REPORT)·수기(MANUAL_RECEIPT)와 출처 구분 — 리포트/필터 가치 |
| Q5 | 기본 차변 계정 102(보통예금) 재확인 | **현행 102 유지** | S2 dev-report 미결 승계 — 103(당좌예금) 의도였는지 재확인만 |

## 함정 목록 (구현 시 전수 반영)

1. bank_transactions **낙관락 부재** → 조건부 UPDATE(UNREFLECTED WHERE)로 이중 승격 원자 차단 + 0행 시 전체 롤백(#712 TOCTOU 교훈 — 결정적 인터리빙 IT 재사용)
2. 신규 kind 시 `cash_receipts_kind_ck` **ALTER 필수**(V48 이 CHECK 기생성 — 설계문서 stale 정정)
3. 마감가드: confirm 재사용으로 자동 상속 — Q3 일자 규칙과 직결
4. 금액 정합: Σ(거래 amount, 전부 양수·scale 2) == receipt.amount == 분개 차/대 금액
5. 거래처 단일성: N건 전부 matchedPartnerId 동일+비null — 매칭은 UNREFLECTED 에서만 가능하므로 순서 = 매칭 완료→생성→승격
6. sourceType 은 **CASH_RECEIPT**(KFTC_DEPOSIT 와 구분 — DepositMatch 의 DRAFT 분개와 혼동 금지)
7. aging refresh 는 confirm 재사용으로 afterCommit 자동 상속(자체 경로 신설 금지 — CONCURRENTLY 트랜잭션 내 호출 불가)
8. markReflected 멱등이 **덮어쓰기 허용** — UNREFLECTED 선별만 승격(재사용 방지 가드)
9. soft-delete: 대상 조회 자동 제외 — 생성 후 통장거래 삭제 시 dangling 은 Q2 명시 FK 로 완화
10. page-code 경계: 생성 endpoint 는 두 도메인에 걸치며 확정+원장 게시(confirm) 경계까지 포함하므로 `accounting.cash-receipts` UPDATE 로 통일한다(통장 조회는 자체 VIEW 로 이미 보호).

S4 메모: 통장연계 입금보고서 생성 버튼 노출 조건은 `canAccess('accounting.cash-receipts', 'update')` 이다.

## 이후

결정 확정 → 브랜치+조기 OPEN PR → Codex 개발 → 순차 듀얼(라운드 1:1 게시·매 라운드 라이브QA) → 0수렴 → PM종합 → CI → 머지 → S4(FE).
