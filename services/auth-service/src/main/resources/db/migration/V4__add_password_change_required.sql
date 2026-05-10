-- V4__add_password_change_required.sql
-- Phase 10 P0-5 — 신규 직원 임시 비밀번호 첫 로그인 변경 의무 플래그.
--
-- password_change_required = TRUE : 다음 로그인 후 비밀번호 변경 강제 (관리자 신규 등록 경우).
-- 비밀번호 변경 성공 시 FALSE 로 갱신 (Account.changePassword() 호출 시점).
--
-- nullable 대신 NOT NULL DEFAULT FALSE — 기존 row 는 변경 불필요 (이미 비밀번호 설정 완료).

ALTER TABLE accounts
    ADD COLUMN password_change_required BOOLEAN NOT NULL DEFAULT FALSE;
