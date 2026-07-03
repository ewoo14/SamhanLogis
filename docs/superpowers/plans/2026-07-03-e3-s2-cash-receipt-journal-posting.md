# E3 입금보고서 S2 — 라이브 POSTED 분개 + 역분개 (confirm 배선·수정 재게시·aging refresh)

> S1(#709)이 마련한 배선점(`confirm()`/`cancel()`/`linkJournal`)에 원장 게시를 연결하는 BE 슬라이스. 통장연계=S3·FE=S4.

## 개발책임자 확정 결정 (2026-07-03 — 무결성 preconfirm 완료)
- 계정: 기본 차 **보통예금**/대 **외상매출금(110)** + **사용자 변경 가능**(CashReceipt debit/credit 컬럼=S1 기구현) → POSTED 분개는 선택 계정 사용.
- 🔴 **구현 중 발견·정정(개발책임자 확인 요청)**: 결정문의 "보통예금(103)" 번호는 DepositMatchService 의 잘못된 주석에서 온 오기 — **실 계정과목표(V1 시드)는 102=보통예금, 103=당좌예금**. 의미(보통예금) 기준 **기본 차변=102 로 교정**(S1 기본값 103=당좌예금 잠재결함 동반 수정, V51 데이터 정정 — S1~S2 사이 분개 게시 0건이라 원장 무영향). 당좌예금(103) 의도였다면 정정 지시 요청.
- 게시=상태전이 종속: **CONFIRMED→자동 POSTED 분개**, **수정→autoReverse 후 재게시**, **CANCELLED→역분개**.
- coedit 편집=DRAFT 한정 유지(`applyOverlayPatchBatch`/`parseChangeSet` 무변).
- 계정 해석 단일화: Mig9(명칭 lookup)·DepositMatch(자체 103/110 상수) → CashReceipt DEFAULT 상수 단일원.

## 정찰 고정점 (2026-07-03)
- `JournalService.postAutoJournal(journalDate, description, sourceType, sourceRefId, actor, lineSpecs)` — leaf 검증 내장·POSTED 즉시 저장. `source_ref_id`(UUID)=V1 비유니크 인덱스 → **재게시 유니크 충돌 없음**(V29 UNIQUE 는 MIG `source_ref` VARCHAR 전용·라이브 경로 무관).
- `JournalService.autoReverse(journalId, actor)` — 차/대 swap + 원분개 REVERSED 마킹 + linkReversal. **TaxInvoiceService(issue/cancelWithReason)=라이브 배선 레퍼런스**(linkJournal/linkReverseJournal 패턴).
- `Mig9CashJournalService.processReceipt` — 차 보통예금/대 외상매출금·JR-채번(배치 전용 유지·journal_id NOT NULL 자동 skip 멱등).
- `Mig9AgingSnapshotRefreshService.refresh()` = `REFRESH MATERIALIZED VIEW CONCURRENTLY partner_aging_snapshot` → **트랜잭션 안 호출 금지 → afterCommit 필수**.
- 낙관락 `@Version`(S1 V49) + 상태가드 = 중복 confirm 방지(전이 409 IT 기존).

## Tasks
1. **confirm 분개 게시**: `confirm(id, actor)` — 상태전이 + `postAutoJournal`(일자=transactionDate, 적요="입금보고서 확정 {slipNo} ({거래처명})", sourceType=CASH_RECEIPT, sourceRefId=receipt.id, 라인=차 debitAccountCode / 대 creditAccountCode 각 amount·partnerId·memo) + `linkJournal`. 방어: journalId 잔존 시 409.
2. **cancel 역분개**: `cancel(id, actor)` — 상태전이 + journalId 있으면 `autoReverse` + `linkReverseJournal`(엔티티 신규 메서드). journalId=null(MIG 미게시)=상태전이만.
3. **CONFIRMED 수정=역분개+재게시**: PATCH 상태분기 — DRAFT=기존 updateDraft / CONFIRMED=`updateConfirmed`(엔티티 신규·필드 갱신) + 기존 분개 autoReverse + 새 값 postAutoJournal + linkJournal(신규 id 교체) / CANCELLED=409. coedit overlay=DRAFT 한정 불변.
4. **V50/V51/V52 마이그**: V50 `cash_receipts.reverse_journal_id UUID`(취소 역분개 추적·TaxInvoice 패턴 parity) + COMMENT. V51 기본 차변 `103→102` 정정(분개 연결 103 행 preflight abort, 미게시 행만 보정). V52 `partner_aging_snapshot` POSTED+REVERSED 재정의 + unique index 재생성. 적용 마이그 불변(V48/V49 무변).
5. **DTO/컨트롤러**: confirm/cancel/PATCH `X-User-Id` actor 전파(callerOrSystem), Response `reverseJournalNo` resolve 추가, @Operation "S2 범위다" 문구를 실동작 기술로 갱신.
6. **aging refresh**: confirm/cancel/CONFIRMED-수정 성공 커밋 후 afterCommit 로 `Mig9AgingSnapshotRefreshService.refresh()`(try/catch warn 비차단).
7. **계정 단일화**: DepositMatchService 103/110 상수→CashReceipt DEFAULT 상수 참조. Mig9 receipt 경로 계정해석=동일 상수 코드 기반(명칭 lookup 제거·disbursement 경로 무변).
8. **테스트**: CashReceiptControllerIT 확장 — 확정→POSTED 분개+라인 차대·override 계정 반영·journalNo 노출 / 취소→역분개 swap+원분개 REVERSED+reverseJournalNo / CONFIRMED PATCH→역분개+재게시+새 journalNo / MIG journalId=null cancel·수정 경로 / CANCELLED PATCH 409. Mig9/DepositMatch 단일화 회귀 + aging refresh 훅 검증. **신규 테스트 클래스 생성 시 ci.yml allowlist 등재 필수**.
9. **Opus 재검 반영(2026-07-03)**: 시산표/합계잔액시산표 당기 집계도 `aggregatePostedByAccount` 로 통일(POSTED+REVERSED), 리포트 IT에 원분개 REVERSED+역분개 POSTED 상쇄 회귀 추가, REST reverse 는 CASH_RECEIPT 원장 직접 역분개 409 + FE 버튼 차단/캡션으로 이중 가드.
10. **마감·무변경·감사 체인 가드**: CONFIRMED PATCH 무변경은 역분개/재게시 생략, 마감 기간은 confirm/PATCH 재검증, 역분개 적요는 `[역분개] {원분개번호} {원적요}` 로 원분개 번호를 각인하고 500자 한도에서 클램프한다.
11. **MIG-9 보상/레이스 가드**: 배치 link SQL 은 `journal_id IS NULL` + `version = version + 1` 로 live flush 역방향 덮어쓰기를 낙관락 실패로 전환한다. 같은 REQUIRES_NEW tx 안의 미커밋 orphan 만 보상삭제하며 WARN 로그와 DELETE 순서 테스트로 관측성을 고정한다.

## 리스크/가드
- **원장 불변 준수**: 수정=역분개+신규 게시(원분개 UPDATE 절대 금지) — [[project_accounting_ledger_edit_policy]].
- 차/대 균형: 단일 금액 2라인=항상 균형(amount>0 도메인 검증 기존).
- CONCURRENTLY refresh 트랜잭션 내 호출 금지(afterCommit) — 실패=경고 로그·기능 비차단.
- MIG(kind=DEPOSIT_REPORT) 행 라이브 수정/취소 허용(입금보고서=편집대상) — Mig9 배치는 journal_id NOT NULL 로 자동 skip(멱등 무손상). journalId=null CONFIRMED 수정 시 새 분개 게시(이후 배치 skip 일관).
- report 계층은 POSTED-only 회귀가 false-green 이 되지 않도록 REVERSED seed 포함 IT를 유지한다(시산표 잔액, 합계잔액시산표 당기/기말, 거래처원장 최종 잔액).
- CashReceipt cancel baseline IT는 confirm 직후 net 증가와 cancel 후 baseline 복귀를 모두 단언해 afterCommit refresh 무동작과 상쇄 쿼리 회귀를 구분한다.

## QA (라이브)
- Docker 실서버: 생성→확정→**회계전표(원장) 화면에서 신규 POSTED 분개 실 GUI 캡처**→CONFIRMED 수정→역분개+재게시 확인→취소→역분개 확인. (S2=BE 슬라이스지만 결과가 기존 회계전표 GUI 에 노출 → 실 GUI 스샷 가능.)
- fresh PG V50/V51/V52 probe: reverse_journal_id 컬럼, debit default=102, V52 POSTED+REVERSED MV net 상쇄(confirm→cancel baseline, confirm→PATCH final delta). ⚠️로컬 auth_db V79 checksum mismatch → flyway repair 선행([[feedback_applied_migration_immutable]]).
