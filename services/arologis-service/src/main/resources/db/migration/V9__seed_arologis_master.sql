-- V9__seed_arologis_master.sql
-- 2026-05-14 — 아로로지스 독립 분리 (자체 user 도메인) — dev seed.
--
-- 초기 MASTER 계정 — QA_AROLOGIS_ADMIN_PASSWORD의 BCrypt strength 10 해시.
-- 본 seed 는 dev 환경 전용. prod 환경에서는 V9 적용 후 password reset 의무 (후속 migration
-- 으로 password_hash 갱신 또는 초기 로그인 시 강제 password change 화면).
--
-- 해시 검증 = BcryptHashGenTest.v9_seed_hash_matches_arologis_seed_password (test 회귀 가드).
INSERT INTO auth_admin_user (
    id, login_id, password_hash, name, role,
    created_at, created_by, is_deleted
)
VALUES (
    gen_random_uuid(),
    'admin',
    '$2a$10$EtZy/ChJX19rLJJ0pomWhuaWs/ii5yP9/RX1XU.vkegdiR4Rrg9gi',  -- QA_AROLOGIS_ADMIN_PASSWORD (BCrypt 10)
    '아로로지스 관리자',
    'AROLOGIS_MASTER',
    now(),
    'system',
    FALSE
)
ON CONFLICT DO NOTHING;
