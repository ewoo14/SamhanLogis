-- V4__app_release_published.sql
-- DEV-1 버전 정책 발행 상태.
-- 기존 릴리스는 사용자 노출 호환을 위해 published=true 로 유지한다.

ALTER TABLE app_release
    ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT TRUE;
