-- 회계전표 full-form coedit: DRAFT PUT 라인 입력의 거래처명 스냅샷 보존.
-- 기존 partner_id 는 내부 UUID 참조이며, 수기 편집 화면은 partnerName 자유 입력 계약을 사용한다.

ALTER TABLE journal_lines
    ADD COLUMN IF NOT EXISTS partner_name VARCHAR(200);
