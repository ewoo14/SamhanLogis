# 협업 full-form — 회계전표(Journal) 슬1 BE: DRAFT 수정(PUT) 엔드포인트

## 목적
5문서 full-form coedit 롤아웃(slip·주문·견적·결재 완료) 잔여 중 회계. 회계는 유일하게 **PUT 저장 경로가 애초 부재**해 슬1(BE)에서 신설한다. `PUT /accounting/journals/{id}` — DRAFT 상태 한정 헤더(journalDate/description) + 라인 전체 교체(replaceLines). 설계: `docs/superpowers/specs/2026-07-01-accounting-fullform-coedit-design.md`(D-ACC-01~05).

## 구현
- **FEAT(26e9a4787)**: `Journal.updateDraftHeader/replaceLines/clearLinesForReplacement`(requireDraft 가드, POSTED/REVERSED 409) · `JournalService.update`(expectedVersion 낙관락 + JPA OptimisticLock 이중방어 + clear→flush→re-add) · 차/대변 균형은 게시 시점만 강제(D-ACC-02, 저장은 미강제) · `JournalLine.partnerName` 스냅샷(V48) · `UpdateJournalRequest` DTO + `JournalUpdateControllerIT`.

## 라운드1 — Opus 5-agent blocking 6건 fix (dfb421459)
1. 낙관락 무력화(라인 편집이 응답 version 불일치) → `journals.lines_revision` 동기 dirty 카운터
2. **hard delete → soft delete**: `orphanRemoval=false` + `markDeleted()`(slip 패턴) + **V49** `journal_lines(journal_id, line_no)` UNIQUE 를 활성(`is_deleted=false`) 라인만 대상으로 하는 partial index 로 전환
3. 마감 가드(`AccountingPeriodGuard` PUT prefix)
4. partnerId GET↔PUT 보존
5. `memo` `@JsonAlias("note")`
6. `accountCode @Size(max=6)` DB 정합

## 라운드1 — Codex 잔여 blocking 2건 fix (33d6e757f)
1. 404 메시지 UUID 노출 제거
2. FE partnerId 왕복 보존 + `updateJournal` PUT helper

## 라운드2 — Opus BE blocking 1건 fix (본 라운드)
**결함**: V49 가 `journal_lines` 의 plain UNIQUE index(V23 `ux_journal_lines_journal_line`)를 partial(`ux_journal_lines_journal_line_active ... WHERE is_deleted=false`)로 전환하면서, **MIG-3 이카운트 일반전표 importer**(`EcountGeneralVoucherImporter.replaceLine`, PUT 슬1과 무관한 기존 코드)의 `ON CONFLICT (journal_id, line_no) DO UPDATE SET ...` 가 arbiter 를 잃어 **PostgreSQL 42P10**("there is no unique or exclusion constraint matching the ON CONFLICT specification")으로 **신규 INSERT 조차 planning 단계에서 100% 실패** — `POST /admin/accounting/general-vouchers/imports/ecount` 전면 불능. V49 자체(마이그레이션)는 정상이며, **관계없어 보이는 기존 SQL 이 인덱스 성격 변경의 collateral damage** 를 입은 사례([[feedback_defect_family_sweep_fix]]).

**fix**: `EcountGeneralVoucherImporter.java:219` 를 바로 위 169행(`journal_no` partial index, V1부터 기존 패턴)과 동일 스타일로 `ON CONFLICT (journal_id, line_no) WHERE is_deleted = FALSE DO UPDATE SET ...` 정정. 전수 grep 결과 `journal_id, line_no` 조합의 `ON CONFLICT` 는 전 레포에 이 1곳뿐(`order_id/tax_invoice_id/slip_id, line_no` 는 별개 테이블 — 영향 없음).

**false-green 근본원인**: 기존 3테스트(`EcountGeneralVoucherImporterTest` Mockito `@Mock NamedParameterJdbcTemplate`, `EcountVoucherImportControllerIT` `@MockBean EcountGeneralVoucherImporter`, `EcountReimportServiceTest` `@Mock` 전 importer)가 실 SQL을 전혀 실행하지 않아 결함을 못 잡음. round1 의 "fresh PG probe V1~V49" 도 마이그레이션 DDL 성공만 검증했고 이 downstream SQL 은 검증범위 밖이었음.

**신규 IT**: `EcountGeneralVoucherImporterRealSqlIT`(Testcontainers 실 Postgres, importer real bean autowire) — ① 신규 전표 1건 import 가 42P10 없이 `journal_lines` 에 실제 insert ② 동일 전표번호 재import 가 upsert(행 갱신, 신규행 아님)로 동작. **fix 되돌려 재실행 → 2건 모두 `BadSqlGrammarException`(cause `PSQLException: there is no unique or exclusion constraint matching the ON CONFLICT specification`)으로 실패 확인 후 fix 복원 → PASS 확인**(회귀 가드 실효성 자체검증).

## 검증 (실측)
- fresh Postgres probe(`v49probe`, V1~V49 전체 적용) — 수정 전 SQL 재현(42P10) → 수정 후 SQL 신규insert 성공 + 재실행 시 upsert(같은 행 갱신, 1행 유지) 확인.
- `gradlew :services:accounting-service:test --rerun-tasks`(신선 실행, Testcontainers): `EcountGeneralVoucherImporterTest` 9 tests 1 skipped(raw fixture 회사/집PC 전용 cross-check, 정상 skip) 0 failed · `EcountVoucherImportControllerIT` 8/8 · `EcountReimportServiceTest` 3/3 · `JournalUpdateControllerIT` 12/12 · `JournalLineSoftDeleteIT` 3/3 · **`EcountGeneralVoucherImporterRealSqlIT`(신규) 2/2**. 6 클래스 합계 37 tests, 1 skipped, **0 failures/errors**.
- `compileJava` + `compileTestJava` BUILD SUCCESSFUL.

## 후속
- 슬2(FE full-form coedit 배선 — `createDocCoeditProvider` + 가변 라인 add/remove) — 슬1 PUT 소비.
- 회계 슬라이스 0수렴 후 배차 → 5문서 롤아웃 완결.
