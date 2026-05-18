-- V11__add_kftc_deposit_source_type_comment.sql
-- SP-09-4: KFTC 오픈뱅킹 입금 자동 매칭 shell.
--
-- journals.source_type 컬럼은 VARCHAR(20) — DB 타입 변경 없이 신규 값 'KFTC_DEPOSIT' 사용 가능.
-- JournalSourceType Java enum 에 KFTC_DEPOSIT 추가 (Phase 11 이전 DRY_RUN 기본).
--
-- 본 파일: journals.source_type 컬럼에 comment 추가 (변경 최소화 — legacy 호환).
-- 실제 KFTC_DEPOSIT 분개 row 는 DepositMatchService.createJournalDraft() 에서 런타임 INSERT.

COMMENT ON COLUMN journals.source_type IS
    'JournalSourceType enum: SLIP / MANUAL / CLOSING / KFTC_DEPOSIT (SP-09-4 신규)';
