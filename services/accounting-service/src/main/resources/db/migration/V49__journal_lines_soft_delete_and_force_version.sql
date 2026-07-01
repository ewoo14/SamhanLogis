-- 회계전표 DRAFT PUT(full-form coedit 슬1/BE) 리뷰 결함 수정:
--   1) journals.lines_revision 추가 — Hibernate 의 mappedBy(라인) 컬렉션 변경이 부모(Journal)
--      의 @Version 을 증가시키지 않는 사각지대를 막기 위한 강제 dirty 카운터. 헤더가 그대로여도
--      라인만 바뀌면 매 저장마다 이 값을 +1 해 Journal 을 강제로 dirty 상태로 만든다.
--   2) journal_lines line_no UNIQUE 제약을 활성(is_deleted=false) 라인만 대상으로 하는
--      partial index 로 전환 — 라인 교체 시 기존 라인을 물리 삭제 대신 markDeleted() 로
--      비활성화하는 정책(slip-service Slip.replaceLines 이식)으로 바뀌면서, 기존 non-partial
--      unique index 는 재사용되는 line_no 와 충돌하기 때문이다.
--
-- 적용 원칙: 기존 V1~V48 은 절대 수정하지 않는다(적용된 마이그레이션 불변).
-- 신규 컬럼은 NOT NULL + DEFAULT 로 legacy 호환.

----------------------------------------------------------------------
-- 1) journals.lines_revision — 라인 교체 강제 dirty 카운터
----------------------------------------------------------------------
ALTER TABLE journals
    ADD COLUMN IF NOT EXISTS lines_revision INTEGER NOT NULL DEFAULT 0;

----------------------------------------------------------------------
-- 2) journal_lines line_no UNIQUE → partial (활성 라인만)
----------------------------------------------------------------------
DROP INDEX IF EXISTS ux_journal_lines_journal_line;

CREATE UNIQUE INDEX IF NOT EXISTS ux_journal_lines_journal_line_active
    ON journal_lines (journal_id, line_no)
    WHERE is_deleted = FALSE;
