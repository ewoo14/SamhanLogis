-- E2 partner list strikethrough restore.
--
-- deleted_by(BaseEntity audit)는 actor id/Principal 용도로 보존하고, 화면 표시명은 UUID 비공개
-- 정제 후 deleted_by_name 에 별도 저장한다. 기존 삭제행에는 null 로 남겨 "삭제됨" 배지만 표시한다.

ALTER TABLE partners
    ADD COLUMN IF NOT EXISTS deleted_by_name VARCHAR(100);
