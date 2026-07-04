# 2026-07-04 — E3 입금보고서 S3: 통장연계 (BankTransaction N건 → BANK_LINKED 입금보고서) (PR #718)

> E3 에픽 S3 슬라이스. 통장거래(CSV/CODEF) N건을 선택해 입금보고서 1건으로 합산 생성·확정하고 거래를 REFLECTED 로 원자 승격 — `markReflected` dead code 의 라이브 승격. 집PC 야간~아침 자율 세션에서 캐논 완주.

## 📌 개발책임자 결정 (전건 PR/이슈 기록)

| # | 결정 | 출처 |
|---|---|---|
| Q1 | N건 식별 = **자연키 4-키 튜플 배열**(UUID 비노출 유지) | #717(4877750879) |
| Q2 | 링크 = **명시 FK `bank_transactions.cash_receipt_id`**(N→1, V53) | #717 |
| Q3 | 집계 일자 = **사용자 지정(기본=최신 거래일) + 마감월 409** | #717 |
| Q4 | kind = **BANK_LINKED 신설**(cash_receipts_kind_ck ALTER) | 잠정→**확정**(#718 4879957000) |
| Q5 | 기본 차변 = **102 보통예금 유지**(생성 시 변경 가능) | 잠정→**확정**(#718 4879957000) |
| 권한 | from-bank-transactions = **UPDATE**(확정+원장 게시 — confirm 경계 대칭) | 리뷰 HIGH-2 교정→**승인**(#718 4879892250) |
| 라이프사이클 | 취소 시 링크 원복(UNREFLECTED·재사용 가능)·CONFIRMED PATCH 409 | PM 기본값(spec·게시 기록) |

## 구현

- **V53**: `bank_transaction.cash_receipt_id` UUID+FK(ON DELETE SET NULL)+partial index · `cash_receipts_kind_ck` DROP+ADD 로 BANK_LINKED 추가(enum 확장 규칙)
- **BankDepositReceiptService**: 자연키 dedup→검증(동일 거래처·전량 UNREFLECTED·DEPOSIT·CODEF_LOAN 제외·양수)→합산 CashReceipt 생성→**confirm 재사용**(마감 409·aging afterCommit 상속)→journalId 확보 후 **조건부 UPDATE 원자 승격** — WHERE = `match_status='UNREFLECTED' AND matched_partner_id=:partnerId AND is_deleted=FALSE`(0행=CONFLICT 전체 롤백·orphan 0)
- **레이스 방어 2단**: ①관리 엔티티 in-memory mutate 제거(더티체킹 STALE 전컬럼 재기록 → 동시 세션 커밋 lost-update 차단) ②WHERE 에 매칭 불변식 원자 재확인(로드~승격 사이 매칭 해제 커밋 시 409 롤백)
- 취소 원복 훅(BANK_LINKED → 연결 거래 UNREFLECTED·링크 클리어·matched_partner_id 보존) · BANK_LINKED PATCH 409 · `POST /accounting/cash-receipts/from-bank-transactions`(UPDATE·id 비노출) · `BankTransactionResponse.cashReceiptSlipNo`(batch projection — N+1 회피) · 원소 null/@Valid 캐스케이드 400 · FE kind 라벨 3값(#716 교훈 선반영)
- ci.yml: BankDepositReceiptIT allowlist+skipped=0 hard-gate

## 라운드 체인 (실행=게시 1:1)

①Codex 개발(RED 선확인 IT 9) ②#719 선머지 rebase(충돌 0) ③Opus full: **BE HIGH2**(lost-update 레이스·권한 CREATE 우회) Design MED5 QA 0(**E2E 라이브**: CSV import→매칭→201→REFLECTED→409→취소 원복·캡처 6장) ④Opus fix(mutate 제거+**차등 검증 IT**[fix 원복 시 FAIL 실증]+UPDATE 상향) ⑤Codex full(MED2: 원소 null·권한 회귀 무고정) ⑥Codex fix ⑦Opus 재검2(blocking 0·null 400 HTTP 라이브 실증) ⑧📌 Q4/Q5·UPDATE 확정 ⑨Opus 정리 fix(@Valid IT·spec 확정 반영·#723 분리) ⑩**Codex 재검3: HIGH1 재적발**(WHERE 매칭 불변식 누락 — 같은 지점 2단 심화) ⑪Codex fix2(WHERE 원자 재확인·IT 의미 정정 RED→GREEN) ⑫Opus 재검3(코드 0·문서 MED2→본 커밋 처리) → 0수렴

## 검증

- 모듈 전체 테스트 5회(각 push 전) 0 fail · BankDepositReceiptIT **12** + ServiceTest 5 + 권한 매트릭스(UPDATE deny/grant) + CashReceiptControllerIT 24
- 결정적 인터리빙 IT 2종(#712 패턴): 이중 승격 레이스 롤백 · 매칭 해제 레이스 409 롤백(앞선 반영 포함 전체 원복 실증)
- 라이브: E2E 왕복(생성 201 journalNo 2026/07/04-9·override 103/110 → 취소 역분개 2026/07/04-10·3건 원복) GUI 캡처 6장(`docs/qa/e3-s3-bank-linked-718/`, 커밋 60ba1c3e9) + fix 후 null 400 HTTP 원문 실증 + 복식부기 invariant 전수 SQL

## 파생/백로그

- **#723** S1 유입 부채 — cash-receipts 잔여 6 endpoint 권한 매트릭스 미등재(다음 accounting PR 일괄)
- linkCashReceipt Javadoc 교차참조 1줄(정보성 — #723 버킷 동봉) · S4 인지 3건(kind 라벨 소비·BANK_LINKED PATCH 버튼 비활성·transactionDate 프리필=FE 책임) · 통장 목록 UTC 날짜 함정(KST 표준화 기추적)

## 교훈

- **리뷰 체인의 2단 심화 적발**: Opus 가 lost-update(더티체킹 STALE 재기록)를 잡고, 그 fix 가 노출한 다음 층(WHERE 불변식 재확인 누락)을 Codex 가 재적발 — 순차 듀얼이 같은 지점을 서로 다른 각도로 파고든 실효 사례. 원자 UPDATE 가드는 "상태 컬럼"만이 아니라 **검증했던 불변식 전체**를 WHERE 로 재확인해야 한다(변경 불가 컬럼은 제외 근거 기록).
- 권한 액션은 endpoint 의 **실효 효과** 기준(생성이어도 원장 게시까지 하면 UPDATE) — AOP 는 어노테이션 지점만 가로채므로 서비스 직접 호출 경로의 권한 등가성을 리뷰에서 봐야 한다.
