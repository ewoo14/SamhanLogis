-- V6__app_notice_constraints_and_filename.sql
-- DEV-2 팝업공지 보강(Codex 라운드): display_order 비음수 CHECK + 이미지 원본 파일명 컬럼.
-- ⚠️ 적용된 V5 불변 원칙(feedback_applied_migration_immutable) 준수 — 이미 V5 를 적용한 환경의
--    Flyway checksum 충돌을 막기 위해 V5 를 직접 수정하지 않고 신규 V6 으로 추가한다.

-- 공지 표시 순서 비음수 보장
ALTER TABLE app_notice
    ADD CONSTRAINT ck_app_notice_display_order_non_negative CHECK (display_order >= 0);

-- 이미지 원본 파일명: 기존 행은 빈 문자열로 백필 후 DEFAULT 제거 → 신규 INSERT 는 엔티티가 항상 제공.
ALTER TABLE app_notice_image
    ADD COLUMN original_file_name VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE app_notice_image
    ALTER COLUMN original_file_name DROP DEFAULT;

-- 이미지 표시 순서 비음수 보장
ALTER TABLE app_notice_image
    ADD CONSTRAINT ck_app_notice_image_display_order_non_negative CHECK (display_order >= 0);
