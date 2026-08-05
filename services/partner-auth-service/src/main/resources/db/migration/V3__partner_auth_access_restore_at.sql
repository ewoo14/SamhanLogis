-- 관리자 장기미발주 복구를 일반 로그인 시각과 분리한다.
ALTER TABLE partner_auth ADD COLUMN access_restored_at TIMESTAMP;
