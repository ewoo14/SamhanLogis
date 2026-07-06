-- E2 판매전표 목록 취소선 삭제자 표시명.
-- deleted_by 는 감사 userId 이므로 UI 배지에는 노출하지 않고, 이름만 별도 저장한다.

ALTER TABLE slips
    ADD COLUMN IF NOT EXISTS deleted_by_name VARCHAR(100);
