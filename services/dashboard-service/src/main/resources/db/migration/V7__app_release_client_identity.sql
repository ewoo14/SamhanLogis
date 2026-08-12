-- V7__app_release_client_identity.sql
-- 앱별 버전 정책 오폭 방지: 신규 앱 식별자를 추가하고 구버전 식별자는 BE 선배포 호환용으로 유지한다.

ALTER TABLE app_release
    ALTER COLUMN client_type TYPE VARCHAR(40);

ALTER TABLE app_release
    DROP CONSTRAINT ck_app_release_client_type;

ALTER TABLE app_release
    ADD CONSTRAINT ck_app_release_client_type
        CHECK (client_type IN (
            'DESKTOP',
            'SAMHAN_MOBILE',
            'SAMHAN_MOBILE_STAFF',
            'AROLOGIS_MOBILE',
            'SAMHAN_ORDER_WEB',
            'SAMHAN_ESTIMATE_WEB',
            'SAMHAN_MOBILE_PUBLIC_WEB',
            'AROLOGIS_DESKTOP',
            'INTERNAL_CHAT_DESKTOP',
            'WEB',
            'MOBILE'
        ));
